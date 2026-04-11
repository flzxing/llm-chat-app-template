/**
 * 鉴权与聊天相关常量（与 schema 中 models 默认行 id 对齐）
 */

/** 游客首次创建时的积分 */
export const GUEST_INITIAL_CREDITS = 100;

/** 正式注册用户默认积分（与 user_profiles 默认值一致，文档用） */
export const REGISTER_DEFAULT_CREDITS = 1000;

/** 客户端匿名 device_id 长度（建议存 UUID，无连字符也可） */
export const DEVICE_ID_MIN_LEN = 8;
export const DEVICE_ID_MAX_LEN = 128;

/** models 表中的逻辑 id，请求体可传 model_id 覆盖 */
export const DEFAULT_CHAT_MODEL_ID = "llama-3.1-8b";

export const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";
