/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * D1 database (Better Auth + 业务表).
	 */
	DB: D1Database;

	/**
	 * Better Auth 密钥（至少 32 字符）。生产环境用 `wrangler secret put BETTER_AUTH_SECRET`。
	 */
	BETTER_AUTH_SECRET: string;

	/**
	 * 应用对外 URL（须与请求 Host 一致，供 Better Auth 校验）。本地示例：`http://127.0.0.1:8787`
	 */
	BETTER_AUTH_URL: string;

	/**
	 * Cloudflare Turnstile 服务端密钥（Better Auth Captcha 插件校验用）。
	 * 生产环境用 `wrangler secret put TURNSTILE_SECRET_KEY`；本地可用官方测试 key `1x0000000000000000000000000000000AA`。
	 */
	TURNSTILE_SECRET_KEY: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
