CREATE TABLE IF NOT EXISTS update_artifacts (
 id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 1073741824), upload_id TEXT,
 status TEXT NOT NULL DEFAULT 'uploading', report_json TEXT, error TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS update_upload_parts (
 artifact_id TEXT NOT NULL REFERENCES update_artifacts(id), part_number INTEGER NOT NULL,
 etag TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
 PRIMARY KEY(artifact_id, part_number)
);
CREATE TABLE IF NOT EXISTS update_releases (
 id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL REFERENCES update_artifacts(id),
 version_code INTEGER NOT NULL, channel TEXT NOT NULL DEFAULT 'official',
 status TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1,
 rollout INTEGER NOT NULL DEFAULT 100 CHECK(rollout BETWEEN 1 AND 100),
 min_version_code INTEGER NOT NULL DEFAULT 0,
 scheduled_at INTEGER, content_json TEXT NOT NULL, operation_id TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(channel, version_code)
);
CREATE INDEX IF NOT EXISTS update_release_selection ON update_releases(channel, status, version_code DESC);
CREATE TABLE IF NOT EXISTS update_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, release_id TEXT,
 reason TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS update_events (
 id TEXT PRIMARY KEY, install_id TEXT NOT NULL, release_id TEXT,
 kind TEXT NOT NULL, version_code INTEGER NOT NULL, detail TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS update_event_stats ON update_events(release_id, kind, created_at);
CREATE TABLE IF NOT EXISTS update_rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS update_verification_jobs (
 artifact_id TEXT PRIMARY KEY REFERENCES update_artifacts(id), dispatched_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0, completed_at INTEGER
);
