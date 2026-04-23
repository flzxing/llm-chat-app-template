/**
 * /api/chat：鉴权后按 models 定价扣积分并写 credit_ledger，再经 Cloudflare **OpenAI 兼容**
 * `.../ai/v1/chat/completions` 调用模型；成功时将上游 SSE 原样返回（见 openai-sse.ts）。
 */
import { fetchWorkersAiChatCompletions } from "./cloudflare-ai-openai";
import { DEFAULT_CHAT_MODEL_ID, SYSTEM_PROMPT } from "./constants";
import { CORS_HEADERS, jsonResponse } from "./http";
import { openAiChatCompletionStreamResponse } from "./openai-sse";
import { resolveToolsForQuery } from "./tool-router";
import { DEFAULT_LLM_TOOLS } from "./tools";
import type { ChatMessage, ChatRequestBody, Env } from "./types";

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

type SessionRow = {
	id: string;
	user_id: string;
};

const HISTORY_LIMIT = 20;

function parseMessageContent(payloadJson: string): string {
	try {
		const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
		const candidate = parsed.text ?? parsed.query ?? parsed.content;
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	} catch {
		// payload_json is a black box for persistence; here we only do best-effort context extraction.
	}
	return payloadJson.slice(0, 2000);
}

function deriveSessionTitle(query: string): string {
	const title = query.trim().replace(/\s+/g, " ");
	if (title.length === 0) return "新对话";
	return title.slice(0, 60);
}

async function ensureSession(
	env: Env,
	userId: string,
	sessionId: string | null | undefined,
	query: string,
): Promise<{ sessionId: string; created: boolean }> {
	if (!sessionId) {
		const id = crypto.randomUUID();
		const ts = Math.floor(Date.now() / 1000);
		await env.DB.prepare(
			`INSERT INTO sessions (id, user_id, title, status, created_at, updated_at, last_message_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`,
		)
			.bind(id, userId, deriveSessionTitle(query), ts, ts, ts)
			.run();
		return { sessionId: id, created: true };
	}

	const row = await env.DB.prepare("SELECT id, user_id FROM sessions WHERE id = ?")
		.bind(sessionId)
		.first<SessionRow>();
	if (!row) {
		throw new Error("SESSION_NOT_FOUND");
	}
	if (row.user_id !== userId) {
		throw new Error("SESSION_FORBIDDEN");
	}
	return { sessionId, created: false };
}

async function insertMessageWithSeq(
	env: Env,
	args: {
		sessionId: string;
		userId: string;
		role: "user" | "assistant" | "system";
		typeId: string;
		payloadJson: string;
		idempotencyKey?: string;
	},
): Promise<{ id: string; seq: number; existed: boolean }> {
	const createdAt = Math.floor(Date.now() / 1000);
	const maxRetry = 5;
	let attempt = 0;

	while (attempt < maxRetry) {
		attempt += 1;
		const id = crypto.randomUUID();
		try {
			await env.DB.prepare(
				`INSERT INTO messages (
          id, session_id, user_id, role, type_id, payload_json, idempotency_key, seq, created_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE session_id = ?), ?
        )`,
			)
				.bind(
					id,
					args.sessionId,
					args.userId,
					args.role,
					args.typeId,
					args.payloadJson,
					args.idempotencyKey ?? null,
					args.sessionId,
					createdAt,
				)
				.run();
			const row = await env.DB.prepare("SELECT seq FROM messages WHERE id = ?")
				.bind(id)
				.first<{ seq: number }>();
			return { id, seq: row?.seq ?? 0, existed: false };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				args.idempotencyKey &&
				(message.includes("idx_messages_session_idempotency") ||
					message.includes("messages.session_id, messages.idempotency_key"))
			) {
				const existing = await env.DB.prepare(
					"SELECT id, seq FROM messages WHERE session_id = ? AND idempotency_key = ?",
				)
					.bind(args.sessionId, args.idempotencyKey)
					.first<{ id: string; seq: number }>();
				if (existing) {
					return { id: existing.id, seq: existing.seq, existed: true };
				}
			}
			if (!message.includes("UNIQUE constraint failed: messages.session_id, messages.seq")) {
				throw error;
			}
		}
	}
	throw new Error("MESSAGE_SEQ_CONFLICT");
}

async function loadContextMessages(
	env: Env,
	sessionId: string,
): Promise<ChatMessage[]> {
	const rows = await env.DB.prepare(
		`SELECT role, payload_json
     FROM messages
     WHERE session_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
	)
		.bind(sessionId, HISTORY_LIMIT)
		.all<{ role: ChatMessage["role"]; payload_json: string }>();
	const list = (rows.results ?? [])
		.reverse()
		.map((row) => ({ role: row.role, content: parseMessageContent(row.payload_json) }));
	if (!list.some((msg) => msg.role === "system")) {
		list.unshift({ role: "system", content: SYSTEM_PROMPT });
	}
	return list;
}

export async function handleChatRequest(
	request: Request,
	env: Env,
	userId: string,
): Promise<Response> {
	try {
		const body = (await request.json()) as ChatRequestBody & {
			thinking?: boolean;
			tools?: unknown[];
		};
		const query = typeof body.query === "string" ? body.query.trim() : "";
		const typeId =
			typeof body.type_id === "string" && body.type_id.trim().length > 0
				? body.type_id.trim()
				: "text";
		const payloadJson = body.payload_json;
		const idempotencyKey = request.headers.get("x-idempotency-key");
		if (!query) {
			return jsonResponse({ error: "query is required" }, 400);
		}
		if (typeof payloadJson !== "string") {
			return jsonResponse({ error: "payload_json must be string" }, 400);
		}
		try {
			JSON.parse(payloadJson);
		} catch {
			return jsonResponse({ error: "payload_json must be valid JSON string" }, 400);
		}
		const modelId = body.model_id ?? DEFAULT_CHAT_MODEL_ID;
		const thinkingEnabled = coerceThinking(body.thinking, true);
		const { sessionId } = await ensureSession(env, userId, body.session_id, query);

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

		if (!idempotencyKey) {
			console.warn("chat.idempotency_key.missing", { userId, sessionId });
		}
		const userMessage = await insertMessageWithSeq(env, {
			sessionId,
			userId,
			role: "user",
			typeId,
			payloadJson,
			idempotencyKey: idempotencyKey ?? undefined,
		});
		const sessionTouchTs = Math.floor(Date.now() / 1000);
		await env.DB.prepare(
			"UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE id = ?",
		)
			.bind(sessionTouchTs, sessionTouchTs, sessionId)
			.run();

		const messages = await loadContextMessages(env, sessionId);

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
			sessionId,
			modelId,
			userMessageId: userMessage.id,
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

		const reader = stream.getReader();
		const passthrough = new TransformStream<Uint8Array, Uint8Array>();
		const writer = passthrough.writable.getWriter();
		const decoder = new TextDecoder();
		let sseCarry = "";
		let assistantText = "";
		let sawDoneEvent = false;
		let streamCompleted = false;

		const pumpPromise = (async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						streamCompleted = true;
						break;
					}
					if (!value) continue;
					await writer.write(value);
					sseCarry += decoder.decode(value, { stream: true });
					const lines = sseCarry.split("\n");
					sseCarry = lines.pop() ?? "";
					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed.startsWith("data:")) continue;
						const data = trimmed.slice(5).trim();
						if (data === "[DONE]") {
							sawDoneEvent = true;
							continue;
						}
						try {
							const json = JSON.parse(data) as {
								choices?: Array<{ delta?: { content?: string } }>;
							};
							const delta = json.choices?.[0]?.delta?.content;
							if (typeof delta === "string") {
								assistantText += delta;
							}
						} catch {
							// Non-JSON event line; ignore.
						}
					}
				}
			} catch (error) {
				console.error("chat.stream.interrupted", {
					error: error instanceof Error ? error.message : String(error),
					userId,
					sessionId,
				});
			} finally {
				try {
					await writer.close();
				} catch {
					// writer may already be closed due to downstream abort.
				}
				if (streamCompleted && sawDoneEvent && assistantText.trim().length > 0) {
					try {
						const assistantPayload = JSON.stringify({ text: assistantText });
						await insertMessageWithSeq(env, {
							sessionId,
							userId,
							role: "assistant",
							typeId: "text",
							payloadJson: assistantPayload,
						});
						const ts = Math.floor(Date.now() / 1000);
						await env.DB.prepare(
							"UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE id = ?",
						)
							.bind(ts, ts, sessionId)
							.run();
					} catch (error) {
						console.error("chat.assistant.persist.failed", {
							error: error instanceof Error ? error.message : String(error),
							userId,
							sessionId,
						});
					}
				} else {
					console.warn("chat.assistant.persist.skipped", {
						userId,
						sessionId,
						streamCompleted,
						sawDoneEvent,
						hasAssistantContent: assistantText.trim().length > 0,
					});
				}
			}
		})();
		void pumpPromise;

		return openAiChatCompletionStreamResponse(passthrough.readable, {
			creditsRemaining: balanceAfter,
			referenceId,
			sessionId,
			userMessageId: userMessage.id,
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
