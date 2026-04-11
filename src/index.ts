/**
 * LLM Chat Application Template
 *
 * Workers AI 流式聊天 + Better Auth（Bearer）+ D1。
 *
 * @license MIT
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createAuth } from "./auth";
import { handleChatRequest } from "./chat";
import { handleGuestSession } from "./routes/guest";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		exposeHeaders: ["Content-Length", "set-auth-token", "Set-Auth-Token"],
	}),
);
app.use("*", secureHeaders());

app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.post("/api/guest/session", (c) => handleGuestSession(c.req.raw, c.env));

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

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
