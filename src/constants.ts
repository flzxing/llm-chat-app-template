/**
 * 鉴权与聊天相关常量（与 schema 中 models 默认行 id 对齐）
 */
export const AUTH_CONFIG = {
	ACCESS_TOKEN_EXP: "15m",
	REFRESH_TOKEN_EXP_DAYS: 7,
	GRACE_PERIOD_SEC: 30,
	JWT_ALG: "HS256" as const,
	ISSUER: "kmp-ai-auth",
	AUDIENCE: "kmp-client",
} as const;

/** 游客首次创建时的积分（正式注册默认仍为 1000，见 handleRegister） */
export const GUEST_INITIAL_CREDITS = 100;

/** 客户端匿名 device_id 长度（建议存 UUID，无连字符也可） */
export const DEVICE_ID_MIN_LEN = 8;
export const DEVICE_ID_MAX_LEN = 128;

/** models 表中的逻辑 id，请求体可传 model_id 覆盖 */
export const DEFAULT_CHAT_MODEL_ID = "llama-3.1-8b";

export const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";
