/**
 * OpenAI 兼容的聊天补全流（SSE）HTTP 封装。
 *
 * Workers AI 在 stream: true 时返回与 OpenAI Chat Completions 流式 API 相同形态的字节流：
 * 每行 `data: { JSON }`，结束为 `data: [DONE]`。此处不做正文解析或改写，原样透传上游 ReadableStream。
 *
 * @see https://platform.openai.com/docs/api-reference/chat-streaming
 */
import { CORS_HEADERS } from "./http";

const OPENAI_CHAT_STREAM_HEADERS: Record<string, string> = {
	"content-type": "text/event-stream; charset=utf-8",
	"cache-control": "no-cache",
	connection: "keep-alive",
};

export type OpenAiSsePassthroughOptions = {
	creditsRemaining: number | string;
	referenceId: string;
};

/**
 * 将上游 SSE 字节流包装为发给浏览器的 Response（含业务响应头与 CORS）。
 */
export function openAiChatCompletionStreamResponse(
	upstream: ReadableStream,
	options: OpenAiSsePassthroughOptions,
): Response {
	return new Response(upstream, {
		headers: {
			...OPENAI_CHAT_STREAM_HEADERS,
			"X-Credits-Remaining": String(options.creditsRemaining),
			"X-Chat-Reference-Id": options.referenceId,
			...CORS_HEADERS,
		},
	});
}
