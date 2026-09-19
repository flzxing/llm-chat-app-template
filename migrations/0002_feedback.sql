-- User feedback reports, attachments, and daily rollup. Catalog JSON lives on R2, not D1.

CREATE TABLE feedback_reports (
    id TEXT NOT NULL PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    reason_ids TEXT NOT NULL DEFAULT '[]',
    other_text TEXT,
    comment TEXT,
    contact TEXT,
    user_id TEXT,
    guest_id TEXT,
    context_json TEXT,
    catalog_etag TEXT,
    app_locale TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX feedback_reports_created_idx ON feedback_reports (created_at DESC);
CREATE INDEX feedback_reports_status_idx ON feedback_reports (status, created_at DESC);
CREATE INDEX feedback_reports_kind_idx ON feedback_reports (kind, created_at DESC);

CREATE TABLE feedback_attachments (
    id TEXT NOT NULL PRIMARY KEY,
    report_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT,
    bytes INTEGER,
    FOREIGN KEY (report_id) REFERENCES feedback_reports (id) ON DELETE CASCADE
);

CREATE INDEX feedback_attachments_report_idx ON feedback_attachments (report_id);

CREATE TABLE feedback_daily_stats (
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    reason_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind, reason_id)
);
