/**
 * Better Auth 在 D1 事务中抛出 APIError 时，部分路径会在响应已提交后仍触发 rejection；
 * 在 Vitest 中表现为 unhandledRejection（不影响 HTTP 状态码）。此处吞掉已映射到 HTTP 错误的已知 code。
 */
const SUPPRESS_CODES = new Set([
	"PASSWORD_TOO_SHORT",
	"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"INVALID_USERNAME_OR_PASSWORD",
	"FAILED_TO_CREATE_SESSION",
]);

process.on("unhandledRejection", (reason) => {
	if (
		reason !== null &&
		typeof reason === "object" &&
		"body" in reason &&
		reason.body &&
		typeof reason.body === "object" &&
		"code" in reason.body &&
		SUPPRESS_CODES.has(String((reason.body as { code: unknown }).code))
	) {
		return;
	}
});
