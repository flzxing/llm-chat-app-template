/**
 * /api/chat：鉴权后按 models 定价扣积分并写 credit_ledger，再经 Cloudflare **OpenAI 兼容**
 * `.../ai/v1/chat/completions` 调用模型；成功时将上游 SSE 原样返回（见 openai-sse.ts）。
 */
import { fetchWorkersAiChatCompletions } from "./cloudflare-ai-openai";
import { DEFAULT_CHAT_MODEL_ID, SYSTEM_PROMPT } from "./constants";
import { CORS_HEADERS, jsonResponse } from "./http";
import { openAiChatCompletionStreamResponse } from "./openai-sse";
import { resolveToolsForQuery } from "./tool-router";
import type { ChatMessage, Env } from "./types";
import { DEFAULT_LLM_TOOLS } from "./tools";

function supportsThinkingToggle(providerModelId: string): boolean {
	return providerModelId.startsWith("@cf/qwen/");
}

function coerceThinking(value: unknown, defaultEnabled: boolean): boolean {
	if (value === undefined || value === null) return defaultEnabled;
	if (typeof value === "boolean") return value;
	if (value === "false" || value === "0") return false;
	if (value === "true" || value === "1") return true;
	return defaultEnabled;
}

type ModelRow = {
	id: string;
	provider_model_id: string;
	cost_per_msg: number;
	requires_pro: number;
};

type UserRow = {
	credits: number;
	status: string;
	pro_expires_at: number;
};

export async function handleChatRequest(
	request: Request,
	env: Env,
	userId: string,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			messages?: ChatMessage[];
			model_id?: string;
			thinking?: boolean;
			tools?: unknown[];
		};
		const messages = body.messages ?? [];
		const modelId = body.model_id ?? DEFAULT_CHAT_MODEL_ID;
		const thinkingEnabled = coerceThinking(body.thinking, true);

		if (
			!env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
			!env.CLOUDFLARE_API_KEY?.trim()
		) {
			return jsonResponse(
				{ error: "Server misconfiguration: Cloudflare AI credentials missing" },
				500,
			);
		}
		let tools: unknown[] =
			Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : [];

		const model = await env.DB.prepare(
			"SELECT id, provider_model_id, cost_per_msg, requires_pro FROM models WHERE id = ? AND is_active = 1",
		)
			.bind(modelId)
			.first<ModelRow>();

		if (!model) {
			return jsonResponse({ error: "Unknown or inactive model" }, 400);
		}

		const user = await env.DB.prepare(
			"SELECT credits, status, pro_expires_at FROM user_profiles WHERE user_id = ?",
		)
			.bind(userId)
			.first<UserRow>();

		if (!user) {
			return jsonResponse({ error: "User not found" }, 401);
		}

		if (user.status !== "active") {
			return jsonResponse({ error: "Account disabled" }, 403);
		}

		const now = Math.floor(Date.now() / 1000);
		const proActive = user.pro_expires_at > now;
		if (model.requires_pro === 1 && !proActive) {
			return jsonResponse(
				{ error: "This model requires an active Pro subscription" },
				403,
			);
		}

		const cost = model.cost_per_msg;
		const referenceId = crypto.randomUUID();
		let balanceAfter = user.credits;

		if (cost > 0) {
			if (user.credits < cost) {
				return jsonResponse({ error: "Insufficient credits" }, 402);
			}

			balanceAfter = user.credits - cost;
			const ledgerId = crypto.randomUUID();
			const ts = Math.floor(Date.now() / 1000);

			const batchResults = await env.DB.batch([
				env.DB.prepare(
					"UPDATE user_profiles SET credits = credits - ?, updated_at = ? WHERE user_id = ? AND credits >= ?",
				).bind(cost, ts, userId, cost),
				env.DB.prepare(
					`INSERT INTO credit_ledger (id, user_id, amount, balance_after, action, reference_id, description, created_at)
           VALUES (?, ?, ?, ?, 'chat_consume', ?, ?, ?)`,
				).bind(
					ledgerId,
					userId,
					-cost,
					balanceAfter,
					referenceId,
					`Chat request (${model.id})`,
					ts,
				),
			]);

			const changes = batchResults[0]?.meta?.changes ?? 0;
			if (changes < 1) {
				return jsonResponse({ error: "Insufficient credits" }, 402);
			}
		}

		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const retrievalStart = Date.now();
		let toolRoutingDebug:
			| {
					usedFallback: boolean;
					retrievedToolNames: string[];
					topScore: number | null;
					embeddingMs: number;
					queryMs: number;
					selectedCount: number;
			  }
			| undefined;
		if (tools.length === 0) {
			try {
				const resolved = await resolveToolsForQuery(env, messages);
				tools = resolved.tools;
				toolRoutingDebug = resolved.debug;
			} catch (error) {
				console.error("tool-router.resolve.failed", {
					error: error instanceof Error ? error.message : String(error),
				});
				tools = DEFAULT_LLM_TOOLS.slice(0, 2);
			}
		}

		console.log("chat.request", {
			userId,
			modelId,
			toolSelectionSource:
				Array.isArray(body.tools) && body.tools.length > 0 ? "client" : "router",
			toolCount: tools.length,
			toolNames: (tools as Array<{ function?: { name?: string } }>)
				.map((tool) => tool.function?.name ?? "unknown")
				.slice(0, 20),
			retrievalMs: Date.now() - retrievalStart,
			toolRoutingDebug,
		});

		const completionBody: Record<string, unknown> = {
			model: model.provider_model_id,
			messages,
			max_tokens: 1024,
			stream: true,
			tools,
		};
		if (supportsThinkingToggle(model.provider_model_id)) {
			completionBody.chat_template_kwargs = {
				enable_thinking: thinkingEnabled,
			};
		}

		const upstream = await fetchWorkersAiChatCompletions(env, completionBody);
		if (!upstream.ok) {
			const detail = await upstream.text();
			console.error(
				"Workers AI OpenAI chat/completions error:",
				upstream.status,
				detail.slice(0, 500),
			);
			return jsonResponse(
				{
					error: "Model upstream error",
					status: upstream.status,
					detail: detail.slice(0, 2000),
				},
				502,
			);
		}

		const stream = upstream.body;
		if (!stream) {
			return jsonResponse({ error: "Empty upstream response body" }, 502);
		}

		return openAiChatCompletionStreamResponse(stream, {
			creditsRemaining: balanceAfter,
			referenceId,
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(JSON.stringify({ error: "Failed to process request" }), {
			status: 500,
			headers: {
				"content-type": "application/json",
				...CORS_HEADERS,
			},
		});
	}
}
