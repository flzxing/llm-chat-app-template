-- 商业级 D1 架构（用户与资产 / 计费与产品 / 流水与留存）
-- 注意：删除顺序必须先子表后父表，避免外键约束失败

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS credit_ledger;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS models;

-- ==========================================
-- 模块一：用户与资产 (User & Assets)
-- ==========================================

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    device_id TEXT UNIQUE,
    username TEXT UNIQUE,
    password_hash TEXT,
    is_guest INTEGER DEFAULT 1,

    credits INTEGER DEFAULT 1000,
    tier TEXT DEFAULT 'free',
    pro_expires_at INTEGER DEFAULT 0,

    status TEXT DEFAULT 'active',
    created_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    updated_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER))
);

CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_id ON refresh_tokens(user_id);

-- ==========================================
-- 模块二：计费与产品配置 (Billing & Products)
-- ==========================================

CREATE TABLE models (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider_model_id TEXT NOT NULL,
    cost_per_msg INTEGER DEFAULT 10,
    requires_pro INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

-- 默认上架模型（与 Worker 中默认 chat 模型一致，可按需增删）
INSERT INTO models (id, display_name, provider_model_id, cost_per_msg, requires_pro, is_active, sort_order)
VALUES (
    'llama-3.1-8b',
    'Llama 3.1 极速版',
    '@cf/meta/llama-3.1-8b-instruct-fp8',
    10,
    0,
    1,
    0
);

-- ==========================================
-- 模块三：业务流水与留存 (Ledger & History)
-- ==========================================

CREATE TABLE credit_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    action TEXT NOT NULL,
    reference_id TEXT,
    description TEXT,
    created_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id);

CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT '新对话',
    model_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    updated_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (cast(strftime('%s', 'now') AS INTEGER)),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
