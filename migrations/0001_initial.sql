-- Better Auth 核心表（由 `npx auth@latest generate --config scripts/auth-schema.config.ts` 生成，勿手改列名）
-- + 业务表 user_profiles / models / 流水与对话

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS credit_ledger;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS models;

CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL,
    "image" TEXT,
    "createdAt" DATE NOT NULL,
    "updatedAt" DATE NOT NULL,
    "username" TEXT UNIQUE,
    "displayUsername" TEXT
);

CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATE NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" DATE NOT NULL,
    "updatedAt" DATE NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATE,
    "refreshTokenExpiresAt" DATE,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATE NOT NULL,
    "updatedAt" DATE NOT NULL
);

CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "createdAt" DATE NOT NULL,
    "updatedAt" DATE NOT NULL
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- 业务资料（与 Better Auth user.id 一一对应）
CREATE TABLE user_profiles (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
    credits INTEGER DEFAULT 1000,
    tier TEXT DEFAULT 'free',
    pro_expires_at INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    is_guest INTEGER DEFAULT 0,
    device_id TEXT UNIQUE,
    created_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
    updated_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
);

CREATE TABLE models (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider_model_id TEXT NOT NULL,
    cost_per_msg INTEGER DEFAULT 10,
    requires_pro INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

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

CREATE TABLE credit_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles (user_id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    action TEXT NOT NULL,
    reference_id TEXT,
    description TEXT,
    created_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger (user_id);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '新对话',
    status TEXT NOT NULL DEFAULT 'active',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
    updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
ON sessions (user_id, updated_at DESC, id DESC);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    type_id TEXT NOT NULL DEFAULT 'text',
    payload_json TEXT NOT NULL,
    idempotency_key TEXT,
    seq INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
    UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
ON messages (session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_session_seq
ON messages (session_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_session
ON messages (user_id, session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_idempotency
ON messages (session_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
