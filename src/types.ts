/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for Workers AI runtime.
	 */
	AI: Ai;

	/**
	 * Vectorize 工具索引绑定（用于工具语义召回）。
	 */
	TOOL_INDEX: Vectorize;

	/**
	 * Cloudflare 账号 ID（Dashboard URL 或 Workers 子域名对应账户；可写入 vars）。
	 */
	CLOUDFLARE_ACCOUNT_ID: string;

	/**
	 * 具备 Workers AI / Account 调用权限的 API Token（生产用 `wrangler secret put CLOUDFLARE_API_KEY`）。
	 */
	CLOUDFLARE_API_KEY: string;

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

	/**
	 * 可选：工具 embedding 模型 ID（默认 @cf/baai/bge-base-en-v1.5）。
	 */
	TOOL_EMBED_MODEL?: string;

	/**
	 * 可选：每次召回的工具数量（默认 2）。
	 */
	TOOL_RETRIEVAL_TOP_N?: string;

	/**
	 * 可选：粗召回 topK（默认 20）。
	 */
	TOOL_RETRIEVAL_TOP_K?: string;

	/**
	 * 可选：语义阈值（默认 0.45）。
	 */
	TOOL_RETRIEVAL_SCORE_THRESHOLD?: string;

	/**
	 * 可选：是否自动同步 DEFAULT_LLM_TOOLS 到 Vectorize（默认 true）。
	 */
	TOOL_VECTORIZE_AUTO_SYNC?: string;

	/**
	 * 手动初始化工具索引接口密钥。
	 */
	TOOL_INDEX_INIT_KEY?: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
