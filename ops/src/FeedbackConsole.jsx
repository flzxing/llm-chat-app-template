import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  catalogToDraft,
  feedbackAdminError,
  fetchFeedbackCatalog,
  fetchFeedbackReport,
  fetchFeedbackReports,
  fetchFeedbackStats,
  formatCsat,
  missingReasonLocales,
  moveReason,
  patchFeedbackReport,
  reasonLabel,
  saveFeedbackCatalog,
  validateReasonDraft,
} from "./feedbackOps.js";

const TABS = [
  { id: "board", label: "看板" },
  { id: "reasons", label: "原因配置" },
  { id: "inbox", label: "收件箱" },
];

function KindBadge({ kind }) {
  const label = { up: "赞", down: "踩", general: "反馈" }[kind] || kind;
  return <span className={`badge kind-${kind}`}>{label}</span>;
}

function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{status}</span>;
}

export function FeedbackConsole({ token, onUnauthorized }) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState("board");
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState(catalogToDraft(null));
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [reasonId, setReasonId] = useState("");
  const [filters, setFilters] = useState({ kind: "all", status: "all", reason: "all", query: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedReason = draft.reasons.find((item) => item.id === reasonId) || draft.reasons[0] || null;

  async function guarded(label, work) {
    setBusy(label);
    setError("");
    try {
      return await work();
    } catch (cause) {
      const mapped = feedbackAdminError(cause);
      setError(mapped);
      if (String(cause?.message || cause) === "unauthorized") onUnauthorized(mapped);
      throw cause;
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    await guarded("load", async () => {
      const [nextCatalog, nextStats, inbox] = await Promise.all([
        fetchFeedbackCatalog(token),
        fetchFeedbackStats(token, 30),
        fetchFeedbackReports(token, filters),
      ]);
      setCatalog(nextCatalog);
      setDraft(catalogToDraft(nextCatalog));
      setStats(nextStats);
      setReports(inbox.reports || []);
      if (!reasonId && nextCatalog.reasons?.[0]) setReasonId(nextCatalog.reasons[0].id);
    });
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    guarded("inbox", async () => {
      const inbox = await fetchFeedbackReports(token, filters);
      setReports(inbox.reports || []);
    }).catch(() => {});
  }, [filters.kind, filters.status, filters.reason, filters.query, token]);

  async function openReport(id) {
    setSelectedId(id);
    await guarded("detail", async () => {
      setDetail(await fetchFeedbackReport(token, id));
    });
  }

  async function saveReasons() {
    const invalid = validateReasonDraft(draft.reasons);
    if (invalid) {
      setError(invalid);
      return;
    }
    await guarded("save", async () => {
      const saved = await saveFeedbackCatalog(token, {
        schemaVersion: 1,
        fallbackLocale: draft.fallbackLocale,
        locales: draft.locales,
        copy: draft.copy,
        reasons: draft.reasons,
      });
      setCatalog(saved.catalog);
      setDraft(catalogToDraft(saved.catalog));
      setNotice("已发布到客户端目录");
    });
  }

  async function setStatus(status) {
    if (!detail?.id) return;
    await guarded("status", async () => {
      await patchFeedbackReport(token, detail.id, status);
      setDetail({ ...detail, status });
      setReports((rows) => rows.map((row) => (row.id === detail.id ? { ...row, status } : row)));
    });
  }

  function patchReason(patch) {
    if (!selectedReason) return;
    setDraft((current) => ({
      ...current,
      reasons: current.reasons.map((item) => (item.id === selectedReason.id ? { ...item, ...patch } : item)),
    }));
  }

  const topMax = Math.max(1, ...(stats?.topReasons || []).map((row) => Number(row.count) || 0));

  return (
    <div className="console feedback-console" data-testid="feedback-console">
      <header className="topbar">
        <div>
          <p className="eyebrow">Voice of customer</p>
          <h1>用户反馈</h1>
        </div>
        <dl className="stats">
          <div>
            <dt>7 日 CSAT</dt>
            <dd>{formatCsat(stats?.csat7)}</dd>
          </div>
          <div>
            <dt>30 日 CSAT</dt>
            <dd>{formatCsat(stats?.csat)}</dd>
          </div>
          <div>
            <dt>未处理</dt>
            <dd>{stats?.open ?? "—"}</dd>
          </div>
          <div>
            <dt>30 日工单</dt>
            <dd>{(stats?.totals?.down || 0) + (stats?.totals?.general || 0)}</dd>
          </div>
        </dl>
        <div className="top-actions">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "primary" : "ghost"}
              data-testid={`feedback-tab-${item.id}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="banner err">{error}</p> : null}
      {notice ? (
        <p className="banner ok">
          {notice}
          <button type="button" className="ghost" onClick={() => setNotice("")}>
            关闭
          </button>
        </p>
      ) : null}

      {tab === "board" ? (
        <section className="feedback-board">
          <div className="metric-grid">
            {[
              ["赞", stats?.totals?.up || 0],
              ["踩", stats?.totals?.down || 0],
              ["设置反馈", stats?.totals?.general || 0],
              ["7 日赞", stats?.totals7?.up || 0],
            ].map(([label, value]) => (
              <motion.article
                key={label}
                className="metric-card"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <small>{label}</small>
                <strong>{value}</strong>
              </motion.article>
            ))}
          </div>
          <div className="reason-bars">
            <h2>Top 原因</h2>
            {(stats?.topReasons || []).length === 0 ? <p className="muted">还没有可聚合的踩/反馈。</p> : null}
            {(stats?.topReasons || []).map((row) => (
              <div key={row.reason_id} className="reason-bar">
                <span>{reasonLabel(catalog, row.reason_id)}</span>
                <i style={{ width: `${(Number(row.count) / topMax) * 100}%` }} />
                <em>{row.count}</em>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "reasons" ? (
        <section className="workspace">
          <aside className="shelf">
            <div className="toolbar">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const id = `reason_${Date.now().toString(36)}`;
                  const next = { id, kind: "preset", sort: (draft.reasons.length + 1) * 10, enabled: true, labels: emptyLabels() };
                  setDraft((current) => ({ ...current, reasons: [...current.reasons, next] }));
                  setReasonId(id);
                }}
              >
                新增原因
              </button>
            </div>
            <ul className="pack-list">
              {draft.reasons.map((reason) => (
                <li key={reason.id}>
                  <button
                    type="button"
                    className={`pack-row ${selectedReason?.id === reason.id ? "active" : ""}`}
                    data-testid={`reason-row-${reason.id}`}
                    onClick={() => setReasonId(reason.id)}
                  >
                    <div className="meta">
                      <strong>{reason.labels["zh-CN"] || reason.labels["en-US"] || reason.id}</strong>
                      <small>{reason.id}</small>
                      <div className="badges">
                        {reason.kind === "other" ? <span className="badge on">其他</span> : null}
                        {reason.enabled ? <span className="badge on">启用</span> : <span className="badge off">停用</span>}
                        {missingReasonLocales(reason, draft.fallbackLocale).length ? (
                          <span className="badge off">缺译</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="editor">
            {!selectedReason ? (
              <div className="blank">选择一条原因，编辑多语言标签。保存即发布到客户端 CDN 目录。</div>
            ) : (
              <>
                <div className="editor-head">
                  <h2 data-testid="reason-editor-title">{selectedReason.id}</h2>
                  <div className="top-actions">
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, reasons: moveReason(current.reasons, selectedReason.id, -1) }))}>
                      上移
                    </button>
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, reasons: moveReason(current.reasons, selectedReason.id, 1) }))}>
                      下移
                    </button>
                  </div>
                </div>
                <div className="fields">
                  <label>
                    ID
                    <input
                      value={selectedReason.id}
                      disabled={selectedReason.kind === "other"}
                      onChange={(event) => patchReason({ id: event.target.value.trim() })}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selectedReason.enabled}
                      onChange={(event) => patchReason({ enabled: event.target.checked })}
                    />
                    对客户端展示
                  </label>
                </div>
                <div className="locale-grid">
                  {Object.entries(selectedReason.labels).map(([locale, value]) => (
                    <label key={locale}>
                      {locale}
                      {missingReasonLocales(selectedReason, draft.fallbackLocale).includes(locale) ? (
                        <small className="warn"> 缺译，将回退 {draft.fallbackLocale}</small>
                      ) : null}
                      <input
                        value={value}
                        onChange={(event) =>
                          patchReason({ labels: { ...selectedReason.labels, [locale]: event.target.value } })
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="editor-foot">
                  <p className="muted">运营台走源站 PUT，不会去读公开 CDN。保存后客户端最多 60 秒内通过 etag 看到新目录。</p>
                  <button type="button" className="primary" data-testid="reason-save" disabled={Boolean(busy)} onClick={() => saveReasons()}>
                    {busy === "save" ? "发布中…" : "保存并发布"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {tab === "inbox" ? (
        <section className="workspace">
          <aside className="shelf">
            <div className="toolbar">
              <input
                className="search"
                data-testid="inbox-search"
                placeholder="搜索评论 / 联系方式"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              />
              <select value={filters.kind} onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value }))}>
                <option value="all">全部类型</option>
                <option value="down">踩</option>
                <option value="up">赞</option>
                <option value="general">设置反馈</option>
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="all">全部状态</option>
                <option value="new">new</option>
                <option value="triaged">triaged</option>
                <option value="resolved">resolved</option>
                <option value="spam">spam</option>
              </select>
              <select value={filters.reason} onChange={(event) => setFilters((current) => ({ ...current, reason: event.target.value }))}>
                <option value="all">全部原因</option>
                {(catalog?.reasons || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.labels?.["zh-CN"] || item.id}
                  </option>
                ))}
              </select>
            </div>
            <ul className="pack-list">
              {reports.length === 0 ? <li className="empty">没有匹配的工单。</li> : null}
              {reports.map((report) => (
                <li key={report.id}>
                  <button
                    type="button"
                    className={`pack-row ${selectedId === report.id ? "active" : ""}`}
                    data-testid={`inbox-row-${report.id}`}
                    onClick={() => openReport(report.id)}
                  >
                    <div className="meta">
                      <strong>
                        <KindBadge kind={report.kind} /> {report.otherText || report.comment || report.id.slice(0, 8)}
                      </strong>
                      <small>
                        <StatusBadge status={report.status} /> {new Date(report.createdAt).toLocaleString()}
                      </small>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="editor">
            {!detail ? (
              <div className="blank">从左侧打开一条工单。截图只走鉴权接口，不会出现在主题 CDN 前缀。</div>
            ) : (
              <>
                <div className="editor-head">
                  <h2>{detail.id.slice(0, 8)}</h2>
                  <div className="top-actions">
                    {["new", "triaged", "resolved", "spam"].map((status) => (
                      <button key={status} type="button" className={detail.status === status ? "primary" : "ghost"} onClick={() => setStatus(status)}>
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <dl className="facts">
                  <div>
                    <dt>类型</dt>
                    <dd>{detail.kind}</dd>
                  </div>
                  <div>
                    <dt>原因</dt>
                    <dd>{(detail.reasonIds || []).map((id) => reasonLabel(catalog, id)).join("、") || "—"}</dd>
                  </div>
                  <div>
                    <dt>说明</dt>
                    <dd>{detail.otherText || detail.comment || "—"}</dd>
                  </div>
                  <div>
                    <dt>联系方式</dt>
                    <dd>{detail.contact || "—"}</dd>
                  </div>
                  <div>
                    <dt>用户</dt>
                    <dd>{detail.userId || detail.guestId || "游客"}</dd>
                  </div>
                  <div>
                    <dt>上下文</dt>
                    <dd>
                      {detail.context?.sessionId || "—"} / {detail.context?.messageId || "—"}
                    </dd>
                  </div>
                </dl>
                {(detail.attachments || []).length ? (
                  <div className="attachment-row">
                    {detail.attachments.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={async () => {
                          const response = await fetch(`/v1/admin/feedback/attachments/${item.id}`, {
                            headers: { authorization: `Bearer ${token}` },
                          });
                          if (!response.ok) return;
                          const blob = await response.blob();
                          window.open(URL.createObjectURL(blob), "_blank", "noopener");
                        }}
                      >
                        附件 {item.id.slice(0, 6)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function emptyLabels() {
  return {
    "zh-CN": "",
    "zh-TW": "",
    "en-US": "",
    "en-GB": "",
    ja: "",
    ko: "",
    de: "",
    es: "",
    fr: "",
  };
}
