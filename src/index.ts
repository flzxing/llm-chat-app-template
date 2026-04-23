/**
 * LLM Chat Application Template
 *
 * Workers AI（OpenAI 兼容 chat/completions）流式聊天 + Better Auth（Bearer）+ D1。
 *
 * @license MIT
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { handleChatRequest } from "./chat";
import { handleDeleteMessage, handleListMessages } from "./routes/messages";
import { handleGuestSession } from "./routes/guest";
import {
	handleDeleteSession,
	handleListSessions,
	handleUpdateSessionTitle,
} from "./routes/sessions";
import { getToolIndexStatus, initializeToolIndex } from "./tool-router";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-captcha-response",
			"x-admin-init-key",
		],
		exposeHeaders: [
			"Content-Length",
			"set-auth-token",
			"Set-Auth-Token",
			"X-Credits-Remaining",
			"X-Chat-Reference-Id",
			"X-Session-Id",
			"X-User-Message-Id",
		],
	}),
);
app.use("*", secureHeaders());

app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.post("/api/guest/session", (c) => handleGuestSession(c.req.raw, c.env));

app.post("/api/admin/tool-index/init", async (c) => {
	const key = c.req.header("x-admin-init-key");
	if (!c.env.TOOL_INDEX_INIT_KEY || key !== c.env.TOOL_INDEX_INIT_KEY) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	try {
		const result = await initializeToolIndex(c.env);
		return c.json({ ok: true, ...result });
	} catch (error) {
		console.error("tool-index.init.failed", error);
		return c.json({ error: "Failed to initialize tool index" }, 500);
	}
});

app.get("/api/admin/tool-index/status", async (c) => {
	const key = c.req.header("x-admin-init-key");
	if (!c.env.TOOL_INDEX_INIT_KEY || key !== c.env.TOOL_INDEX_INIT_KEY) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	try {
		const status = await getToolIndexStatus(c.env);
		return c.json({ ok: true, ...status });
	} catch (error) {
		console.error("tool-index.status.failed", error);
		return c.json({ error: "Failed to read tool index status" }, 500);
	}
});

app.all("/api/chat", async (c) => {
	if (c.req.method === "OPTIONS") {
		return c.body(null, 204);
	}
	if (c.req.method !== "POST") {
		return c.json({ error: "Method not allowed" }, 405);
	}
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	return handleChatRequest(c.req.raw.clone(), c.env, session.user.id);
});

app.all("/api/sessions", async (c) => {
	if (c.req.method === "OPTIONS") return c.body(null, 204);
	if (c.req.method !== "GET") return c.json({ error: "Method not allowed" }, 405);
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	return handleListSessions(c.req.raw, c.env, session.user.id);
});

app.all("/api/sessions/:id", async (c) => {
	if (c.req.method === "OPTIONS") return c.body(null, 204);
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	const sessionId = c.req.param("id");
	if (c.req.method === "PUT") {
		return handleUpdateSessionTitle(c.req.raw, c.env, session.user.id, sessionId);
	}
	if (c.req.method === "DELETE") {
		return handleDeleteSession(c.env, session.user.id, sessionId);
	}
	return c.json({ error: "Method not allowed" }, 405);
});

app.all("/api/messages", async (c) => {
	if (c.req.method === "OPTIONS") return c.body(null, 204);
	if (c.req.method !== "GET") return c.json({ error: "Method not allowed" }, 405);
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	return handleListMessages(c.req.raw, c.env, session.user.id);
});

app.all("/api/messages/:id", async (c) => {
	if (c.req.method === "OPTIONS") return c.body(null, 204);
	if (c.req.method !== "DELETE") return c.json({ error: "Method not allowed" }, 405);
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	return handleDeleteMessage(c.env, session.user.id, c.req.param("id"));
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
