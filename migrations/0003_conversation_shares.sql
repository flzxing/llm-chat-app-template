CREATE TABLE conversation_shares (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 revoked_at INTEGER,
 UNIQUE(user_id, request_id)
);
CREATE INDEX conversation_shares_owner_created ON conversation_shares(user_id, created_at DESC, id DESC);
