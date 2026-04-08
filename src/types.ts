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
	 * D1 database (users, refresh_tokens).
	 */
	DB: D1Database;

	/**
	 * Secret for signing JWTs. Set via `wrangler secret put JWT_SECRET`.
	 */
	JWT_SECRET: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
