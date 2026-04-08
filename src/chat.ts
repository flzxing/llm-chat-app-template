/**
 * /api/chat：鉴权后按 models 定价扣积分并写 credit_ledger，再调用 Workers AI 流式输出
 */
import { DEFAULT_CHAT_MODEL_ID, SYSTEM_PROMPT } from "./constants";
import { CORS_HEADERS, jsonResponse } from "./http";
import type { ChatMessage, Env } from "./types";

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
		};
		const messages = body.messages ?? [];
		const modelId = body.model_id ?? DEFAULT_CHAT_MODEL_ID;

		const model = await env.DB.prepare(
			"SELECT id, provider_model_id, cost_per_msg, requires_pro FROM models WHERE id = ? AND is_active = 1",
		)
			.bind(modelId)
			.first<ModelRow>();

		if (!model) {
			return jsonResponse({ error: "Unknown or inactive model" }, 400);
		}

		const user = await env.DB.prepare(
			"SELECT credits, status, pro_expires_at FROM users WHERE id = ?",
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
					"UPDATE users SET credits = credits - ?, updated_at = ? WHERE id = ? AND credits >= ?",
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

		// provider_model_id 来自 D1，运行时与 Workers AI 模型列表对齐；类型上需断言为已绑定模型 key
		const stream = await env.AI.run(
			model.provider_model_id as keyof AiModels,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			},
			{},
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
				"X-Credits-Remaining": String(balanceAfter),
				"X-Chat-Reference-Id": referenceId,
				...CORS_HEADERS,
			},
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
