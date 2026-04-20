import type { Env } from "./types";

const CHAT_COMPLETIONS_PATH = "/ai/v1/chat/completions";

/**
 * 调用 Cloudflare Workers AI 的 OpenAI 兼容 Chat Completions 端点（与 openai-node 的
 * `baseURL = .../accounts/{id}/ai/v1` + `chat.completions.create` 等价）。
 *
 * @see https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 */
export function workersAiOpenAiBaseUrl(accountId: string): string {
	return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
}

export async function fetchWorkersAiChatCompletions(
	env: Pick<Env, "CLOUDFLARE_ACCOUNT_ID" | "CLOUDFLARE_API_KEY">,
	body: Record<string, unknown>,
): Promise<Response> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiKey = env.CLOUDFLARE_API_KEY?.trim();
	if (!accountId || !apiKey) {
		throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_KEY must be set");
	}

	const url = `${workersAiOpenAiBaseUrl(accountId)}${CHAT_COMPLETIONS_PATH}`;
	return fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}
