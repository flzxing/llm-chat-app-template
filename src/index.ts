/**
 * LLM Chat Application Template
 *
 * Workers AI 流式聊天 + JWT 鉴权 + D1 商业数据模型（渐进实现）。
 *
 * @license MIT
 */
import { verifyAccessToken } from "./auth";
import { handleChatRequest } from "./chat";
import { CORS_HEADERS, jsonResponse, preflightResponse } from "./http";
import {
	handleLogin,
	handleRefresh,
	handleRegister,
} from "./routes/auth";
import { handleGuestSession } from "./routes/guest";
import type { Env } from "./types";

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
			return preflightResponse();
		}

		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		const secret = new TextEncoder().encode(env.JWT_SECRET);

		if (url.pathname === "/api/guest/session" && request.method === "POST") {
			return handleGuestSession(request, env, secret);
		}

		if (url.pathname === "/api/register" && request.method === "POST") {
			return handleRegister(request, env, secret);
		}

		if (url.pathname === "/api/login" && request.method === "POST") {
			return handleLogin(request, env, secret);
		}

		if (url.pathname === "/api/refresh" && request.method === "POST") {
			return handleRefresh(request, env, secret);
		}

		if (url.pathname === "/api/chat") {
			if (request.method !== "POST") {
				return new Response("Method not allowed", {
					status: 405,
					headers: CORS_HEADERS,
				});
			}

			const auth = await verifyAccessToken(request, secret);
			if (!auth.ok) {
				return jsonResponse({ error: auth.error }, auth.status);
			}

			return handleChatRequest(request, env, auth.userId);
		}

		return jsonResponse({ error: "Not Found" }, 404);
	},
} satisfies ExportedHandler<Env>;
