import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { contentComplete, fieldsForContent, formatBytes, funnelFor, makeContent, releaseApi, releaseError, STATUS_LABELS, UPLOAD_KEY, uploadApk } from "./releaseOps.js";
import cover from "./assets/cover-releases.webp";
import crystal from "./assets/update-crystal.webp";
import "./releases.css";

const STAGES = ["上传 APK", "云端校验", "更新内容", "发布策略", "客户端预览", "发布复核"];
const VERIFICATION_STAGES = ["hash", "signature", "manifest", "archive", "complete"];
const VERIFICATION_LABELS = ["SHA-256", "真实签名", "清单身份", "ABI 结构", "发布证书"];
const FUNNEL_LABELS = ["看到更新", "开始下载", "下载完成", "发起安装", "实际升级"];
function Pill({ status }) { return <span className={`release-pill ${status}`}>{STATUS_LABELS[status] || status}</span>; }
function Dialog({ title, children, onClose, wide = false }) {
 const ref = useRef(null);
 useEffect(() => { const dialog = ref.current, previous = document.activeElement; dialog?.showModal(); return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); }; }, []);
 return <dialog ref={ref} className={`release-dialog ${wide ? "wide" : ""}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
  <header><h2>{title}</h2><button className="release-icon" aria-label="关闭" type="button" onClick={onClose}>×</button></header>{children}
 </dialog>;
}
function PhonePreview({ content, report, mode, theme, phase, language }) {
 const lang = language, mandatory = mode === "mandatory";
 return <div className={`release-phone ${theme}`} data-testid="release-phone"><div className="release-phone-camera" />
  <div className="release-phone-screen"><div className="release-demo-caption">客户端预览 · 不会下载或安装</div>
   <div className="release-update-card"><img src={content.heroUrl || crystal} onError={event => { event.currentTarget.src = crystal; }} alt="" />
    <div className="release-update-body"><span className="release-preview-badge">{mandatory ? "需要更新" : "全新版本"} · {report?.versionName || "—"}</span>
     <h3>{content.titles[lang] || "下一次进步，即将发生"}</h3><p>{content.summaries[lang] || "写下这次更新带给用户的改变。"}</p>
     <ul>{(content.highlights[lang] || []).map((text, i) => <li key={i}><span>✦</span>{text}</li>)}</ul>
     <small>{report ? `${report.versionName} · ${formatBytes(report.bytes)}` : "版本身份由云端校验后生成"}</small>
     {phase === "download" ? <div className="release-preview-progress"><span /><p>52% · 2.4 MB/s · 约 28 秒</p></div> : null}
     <button type="button" tabIndex={-1}>{phase === "install" ? "安装更新" : phase === "download" ? "后台下载中" : "立即更新"}</button>
     {!mandatory && phase !== "install" ? <p className="release-preview-later">{phase === "download" ? "收起，继续使用" : "稍后提醒　 ·　 忽略此版本"}</p> : null}
     {mandatory ? <p className="release-preview-later">更新后继续使用 · 可重试或退出</p> : null}
     <details><summary>完整更新日志</summary><p>{content.notes[lang] || "完整日志将在这里展示。"}</p></details>
    </div>
   </div>
  </div>
 </div>;
}

export function ReleaseConsole({ token, onUnauthorized }) {
 const reduced = useReducedMotion();
 const [data, setData] = useState({ releases: [], artifacts: [] }), [events, setEvents] = useState([]), [failures, setFailures] = useState([]), [audit, setAudit] = useState([]);
 const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
 const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [tab, setTab] = useState("releases");
 const [upload, setUpload] = useState(() => { try { return JSON.parse(localStorage.getItem(UPLOAD_KEY)); } catch { return null; } });
 const [transfer, setTransfer] = useState(null), [dragging, setDragging] = useState(false);
 const abortRef = useRef(null), fileRef = useRef(null), uploadIdRef = useRef(upload?.id), loadedRef = useRef(false);
 const [editing, setEditing] = useState(null), [fields, setFields] = useState(fieldsForContent()), [language, setLanguage] = useState("zh-CN"), [heroUrl, setHeroUrl] = useState("");
 const [rollout, setRollout] = useState(1), [minimum, setMinimum] = useState(0), [schedule, setSchedule] = useState("");
 const [dirty, setDirty] = useState(false), [previewMode, setPreviewMode] = useState("optional"), [previewTheme, setPreviewTheme] = useState("dark"), [previewPhase, setPreviewPhase] = useState("offer");
 const [review, setReview] = useState(null), [reason, setReason] = useState(""), [credential, setCredential] = useState(""), [forceConfirmed, setForceConfirmed] = useState(false);
 const report = editing?.report;
 const content = { ...makeContent(fields), ...(heroUrl ? { heroUrl } : {}) };
 const failure = useCallback(cause => { if (cause.status === 401) onUnauthorized(); else setError(cause.code === "file_mismatch" ? "重选文件与已上传分片不一致。请使用原 APK，或取消后新建上传。" : cause.code === "invalid_apk" ? "请选择不超过 1 GB 的 APK 文件。" : releaseError(cause)); }, [onUnauthorized]);
 const refresh = useCallback(async (quiet = false) => {
  if (!quiet) setLoading(true);
  const results = await Promise.allSettled([releaseApi(token), releaseApi(token, "/stats"), releaseApi(token, "/audit")]);
  if (results[0].status === "fulfilled") { setData(results[0].value); loadedRef.current = true; }
  for (const result of results) if (result.status === "rejected") failure(result.reason);
  if (results[1].status === "fulfilled") { setEvents(results[1].value.events || []); setFailures(results[1].value.failures || []); }
  if (results[2].status === "fulfilled") setAudit(results[2].value.entries || []);
  setLoading(false);
 }, [token, failure]);
 useEffect(() => { refresh(); const timer = setInterval(() => refresh(true), 12_000); return () => { clearInterval(timer); abortRef.current?.abort(); }; }, [token]);
 useEffect(() => {
  function guard(event) { if (!dirty) return; event.preventDefault(); event.returnValue = ""; }
  function navigateGuard(event) { if (dirty && !window.confirm("更新内容尚未保存，确定离开？")) event.preventDefault(); }
  window.addEventListener("beforeunload", guard); window.addEventListener("ops-before-navigate", navigateGuard);
  return () => { window.removeEventListener("beforeunload", guard); window.removeEventListener("ops-before-navigate", navigateGuard); };
 }, [dirty]);
 function retainUpload(next) { setUpload(next); uploadIdRef.current = next?.id; if (next) localStorage.setItem(UPLOAD_KEY, JSON.stringify(next)); else localStorage.removeItem(UPLOAD_KEY); }
 async function startUpload(file) {
  if (!file || abortRef.current) return;
  setError(""); setNotice(""); const controller = new AbortController(); abortRef.current = controller;
  const resumable = upload?.id;
  setTransfer({ bytes: 0, total: file.size, speed: 0, stage: resumable ? "正在校验恢复文件" : "正在创建上传" });
  try {
   const result = await uploadApk({ token, file, resumeId: resumable, signal: controller.signal,
    onSession: id => retainUpload({ id, name: file.name, bytes: file.size }), onProgress: setTransfer });
   retainUpload(null); setNotice(result.status === "verified" ? "云端校验已通过，可以创建版本草稿。" : "APK 已提交云端校验。通过后即可编辑并预览。" ); await refresh(true);
  } catch (cause) { if (!controller.signal.aborted) failure(cause); }
  finally { if (abortRef.current === controller) abortRef.current = null; setTransfer(null); if (fileRef.current) fileRef.current.value = ""; }
 }
 async function cancelUpload() {
  abortRef.current?.abort(); abortRef.current = null;
  const id = uploadIdRef.current; if (!id) { setTransfer(null); return; }
  setBusy("cancel-upload");
  try { await releaseApi(token, `/uploads/${id}`, { method: "DELETE" }); retainUpload(null); setTransfer(null); setNotice("上传已取消，云端分片已清理。" ); }
  catch (cause) { failure(cause); } finally { setBusy(""); }
 }
 function openEditor(item, artifact = false) {
  if (dirty && !window.confirm("更新内容尚未保存，确定切换？")) return;
  setEditing(artifact ? { artifactId: item.id, report: item.report, status: "draft", revision: 0 } : item);
  setFields(fieldsForContent(artifact ? undefined : item.content)); setHeroUrl(artifact ? "" : item.content?.heroUrl || "");
  setRollout(item.rollout || 1); setMinimum(item.min_version_code || 0);
  setSchedule(item.scheduled_at ? new Date(item.scheduled_at - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
  setDirty(false); setError(""); setPreviewMode("optional");
 }
 const policyData = () => ({ content, rollout: Number(rollout), minVersionCode: Number(minimum), scheduledAt: schedule ? new Date(schedule).getTime() : null });
 async function saveDraft() {
  if (!contentComplete(content)) { setError("简体中文、英文标题、摘要和日志必填，亮点最多三条。" ); return; }
  if (editing.id && editing.status !== "draft") { openReview("edit"); return; }
  setBusy("save"); setError("");
  try {
   if (editing.id) {
    const result = await releaseApi(token, `/releases/${editing.id}`, { method: "PUT", data: { ...policyData(), revision: editing.revision } });
    setEditing({ ...editing, content, revision: result.revision, rollout, min_version_code: Number(minimum) });
   } else {
    const result = await releaseApi(token, "/releases", { method: "POST", data: { artifactId: editing.artifactId, content } });
    setEditing({ ...editing, id: result.id, revision: 1, content });
    const saved = await releaseApi(token, `/releases/${result.id}`, { method: "PUT", data: { ...policyData(), revision: 1 } });
    setEditing({ ...editing, id: result.id, revision: saved.revision, content, rollout, min_version_code: Number(minimum) });
   }
   setDirty(false); setNotice("草稿已保存。请预览客户端展示，再进行发布复核。" ); await refresh(true);
  } catch (cause) { failure(cause); } finally { setBusy(""); }
 }
 function openReview(action) { if (!editing?.id) return; setReview(action); setReason(""); setCredential(""); setForceConfirmed(false); setError(""); }
 async function submitReview(event) {
  event.preventDefault(); if (Number(minimum) > 0 && !forceConfirmed) return;
  setBusy("publish"); setError("");
  const secret = credential; setCredential("");
  try {
   const suffix = review === "edit" ? "" : `/${review}`;
   const result = await releaseApi(token, `/releases/${editing.id}${suffix}`, { method: review === "edit" ? "PUT" : "POST", credential: secret,
    data: { ...policyData(), revision: editing.revision, reason } });
   setEditing(null); setReview(null); setDirty(false); setNotice(`版本操作已完成 · 修订 ${result.revision}`); await refresh(true);
  } catch (cause) { failure(cause); } finally { setBusy(""); }
 }
 async function uploadHero(file) {
  if (!file) return; setBusy("hero");
  try {
   if (file.type !== "image/webp" || file.size > 400 * 1024) throw new Error("image_invalid");
   const response = await fetch("/v1/admin/app-updates/art", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "image/webp" }, body: file });
   if (!response.ok) throw new Error("image_failed"); const result = await response.json(); setHeroUrl(result.url); setDirty(true);
  } catch { setError("主视觉上传失败。请使用不超过 400 KB 的 WebP 图片。" ); } finally { setBusy(""); }
 }
 const shown = data.releases.filter(row => (filter === "all" || row.status === filter) && `${row.versionName} ${row.version_code} ${row.content?.titles?.["zh-CN"] || ""}`.toLowerCase().includes(search.toLowerCase()));
 return <div className="releases" data-testid="release-console">
  <motion.header className="release-hero" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4 }}>
   <img src={cover} alt="" /><div><p className="eyebrow">RELEASE CONTROL</p><h1>每一次进步，<br />稳妥送达。</h1><p>从完整性校验到真实升级确认，<br />让每个版本都有清晰的发布轨迹。</p></div>
   <a href="/download/luckytool.apk" className="release-stable">官方稳定包 ↗</a>
  </motion.header>
  <nav className="release-tabs" aria-label="版本中心"><button className={tab === "releases" ? "active" : ""} onClick={() => setTab("releases")}>版本与制品</button><button className={tab === "analytics" ? "active" : ""} onClick={() => setTab("analytics")}>升级表现</button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>操作轨迹</button><button className="release-refresh" onClick={() => refresh()} disabled={loading}>↻ 刷新</button></nav>
  {error ? <div className="release-alert error" role="alert">{error}<button aria-label="关闭错误" onClick={() => setError("")}>×</button></div> : null}
  {notice ? <div className="release-alert" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}>×</button></div> : null}
  {loading && !loadedRef.current ? <div className="release-empty" role="status">正在读取版本中心…</div> : null}
  {tab === "releases" ? <>
   <section className="release-panel"><div className="release-section-head"><div><p className="eyebrow">01 / ARTIFACT</p><h2>从一个可信的 APK 开始</h2></div><span>完整包 · 最大 1 GB</span></div>
    <input ref={fileRef} id="release-apk-file" className="release-file-input" type="file" accept=".apk,application/vnd.android.package-archive" aria-label={upload ? "重选原 APK 恢复上传" : "选择 APK"} disabled={!!transfer} onChange={event => startUpload(event.target.files?.[0])} />
    <div className={`release-drop ${dragging ? "dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); startUpload(event.dataTransfer.files[0]); }}>
     <div className="release-upload-glyph" aria-hidden="true">↑</div><div><h3>{upload ? `继续上传 ${upload.name}` : "拖入 APK，或选择文件"}</h3><p>{upload ? "重选原文件后会核对已上传分片，不会盲目续传。" : "16 MB 分片 · 三路并发 · 失败自动重试"}</p></div><label className="release-button primary" htmlFor="release-apk-file">{upload ? "重选原文件" : "选择 APK"}</label>
    </div>
    {transfer ? <div className="release-transfer" aria-live="polite"><div><strong>{transfer.stage}</strong><span>{formatBytes(transfer.bytes)} / {formatBytes(transfer.total)} · {formatBytes(transfer.speed)}/s</span></div><progress max={transfer.total} value={transfer.bytes} aria-label="APK 上传进度" /><button className="ghost" onClick={cancelUpload}>取消并清理</button></div> : upload ? <div className="release-resume"><span>上传会话保留 24 小时，可刷新后恢复。</span><button className="ghost" onClick={cancelUpload} disabled={busy === "cancel-upload"}>取消这个上传</button></div> : null}
    <div className="release-artifacts">{data.artifacts.map(artifact => <div className="release-artifact" key={artifact.id}><div><strong>{artifact.report ? `v${artifact.report.versionName} · ${artifact.report.versionCode}` : artifact.file_name}</strong><small>{formatBytes(artifact.size)} · {artifact.report?.packageName || "等待云端解析身份"}</small></div><Pill status={artifact.status} /><div className="release-artifact-action">{artifact.status === "verified" ? <button onClick={() => openEditor(artifact, true)} disabled={data.releases.some(r => r.artifact_id === artifact.id)}>创建草稿 →</button> : artifact.status === "rejected" ? <span className="error">{artifact.error || "APK 校验失败"}</span> : <span className="release-validation-steps" aria-live="polite">{VERIFICATION_LABELS.map((label, index) => <small key={label} data-complete={VERIFICATION_STAGES.indexOf(artifact.verification_stage) >= index}>{VERIFICATION_STAGES.indexOf(artifact.verification_stage) >= index ? "✓ " : "○ "}{label}</small>)}</span>}</div></div>)}</div>
   </section>
   <section className="release-panel"><div className="release-section-head"><div><p className="eyebrow">02 / RELEASES</p><h2>版本发布台账</h2></div><div className="release-filters"><input aria-label="搜索版本" placeholder="搜索版本或标题" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="筛选发布状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option>{["draft", "scheduled", "published", "paused", "revoked"].map(v => <option key={v} value={v}>{STATUS_LABELS[v]}</option>)}</select></div></div>
    {shown.length ? <div className="release-list">{shown.map(row => <button className="release-row" key={row.id} onClick={() => openEditor(row)}><div className="release-version-icon">↗</div><div className="release-row-title"><strong>v{row.versionName}<small>#{row.version_code}</small></strong><span>{row.content?.titles?.["zh-CN"] || "未命名更新"}</span></div><Pill status={row.status} /><div className="release-row-meta"><strong>{row.rollout}% 灰度</strong><small>{formatBytes(row.bytes)} · 修订 {row.revision}</small><small title={funnelFor(events, row.id).map((point, i) => `${FUNNEL_LABELS[i]} ${point.count}`).join(" → ")}>曝光 {funnelFor(events, row.id)[0].count} · 实际升级 {funnelFor(events, row.id)[4].count}</small></div><span aria-hidden="true">↗</span></button>)}</div> : <div className="release-empty"><span>✧</span><h3>{search || filter !== "all" ? "没有匹配的版本" : "下一次更新，从这里出发"}</h3><p>上传并通过校验后，创建第一个版本草稿。</p></div>}
   </section>
  </> : null}
  {tab === "analytics" ? <section className="release-panel"><div className="release-section-head"><div><p className="eyebrow">DELIVERY INSIGHTS</p><h2>真正送达，才算完成</h2></div><span>最近 30 天 · 匿名设备去重</span></div><p className="release-explanation">曝光是看到升级提醒；后续转化率以前一阶段设备数为分母。实际升级由新版本启动确认，安装器打开不计为成功。阶段可跨日上报，转化率可能暂时超过 100%。</p>{data.releases.map(row => <div className="release-funnel" key={row.id}><h3>v{row.versionName}<Pill status={row.status} /></h3><div>{funnelFor(events, row.id).map((point, i) => <section key={point.kind}><small>{FUNNEL_LABELS[i]}</small><strong>{point.count}</strong><span>{point.rate === null ? i ? "暂无分母" : "曝光设备数" : `${point.rate}% / 前一阶段 ${point.denominator}`}</span></section>)}</div></div>)}{!data.releases.length ? <div className="release-empty">发布后，真实升级数据会在这里汇集。</div> : null}<h3>失败分类</h3><div className="release-failure-list">{failures.length ? failures.map((f, i) => <span key={i}>{f.detail || "未分类"}<strong>{f.count}</strong></span>) : <p className="muted">暂未收到失败事件。</p>}</div></section> : null}
  {tab === "audit" ? <section className="release-panel"><div className="release-section-head"><div><p className="eyebrow">CHANGE HISTORY</p><h2>每个决定，都有来处</h2></div><span>最近 200 条操作</span></div><div className="release-audit">{audit.map(entry => <details key={entry.id}><summary><time>{new Date(entry.created_at).toLocaleString()}</time><strong>{entry.actor}</strong><span>{entry.action}</span><em>{entry.reason}</em></summary><pre>{JSON.stringify({ before: parseAudit(entry.before_json), after: parseAudit(entry.after_json) }, null, 2)}</pre></details>)}{!audit.length ? <div className="release-empty">暂无操作记录。</div> : null}</div></section> : null}
  {editing ? <Dialog title={`版本工作室 · v${report?.versionName || "—"}`} wide onClose={() => { if (busy) return; if (dirty && !window.confirm("更新内容尚未保存，确定关闭？")) return; setEditing(null); setDirty(false); }}>
   <div className="release-workflow">{STAGES.map((label, i) => <span key={label} className={i < 2 ? "done" : ""}><small>{i < 2 ? "✓" : `0${i + 1}`}</small>{label}</span>)}</div>
   {error ? <p className="release-alert error" role="alert">{error}</p> : null}
   <div className="release-studio"><div className="release-editor"><div className="release-identity"><Pill status={editing.status} /><h3>{report?.packageName}</h3><p>versionCode {report?.versionCode} · API {report?.minSdk}+ · {report?.abis?.join(", ")} · {formatBytes(report?.bytes || 0)}</p><details><summary>查看可信包身份</summary><dl><dt>签名证书 SHA-256</dt><dd>{report?.certificateSha256}</dd><dt>APK SHA-256</dt><dd>{report?.sha256}</dd></dl></details></div>
    <div className="release-language" role="group" aria-label="编辑语言">{["zh-CN", "en-US"].map(lang => <button className={language === lang ? "active" : ""} key={lang} onClick={() => setLanguage(lang)}>{lang === "zh-CN" ? "简体中文" : "English"}<small>必填</small></button>)}</div>
    {[['titles', '更新标题', 120], ['summaries', '一句话摘要', 500], ['highlights', '核心亮点（每行一条，最多三条）', 902], ['notes', '完整更新日志', 8000]].map(([key, label, max]) => <label key={key}>{label}{key === "titles" ? <input value={fields[language][key]} maxLength={max} disabled={editing.status === "revoked"} onChange={e => { setFields({ ...fields, [language]: { ...fields[language], [key]: e.target.value } }); setDirty(true); }} /> : <textarea rows={key === "notes" ? 6 : 3} value={fields[language][key]} maxLength={max} disabled={editing.status === "revoked"} onChange={e => { setFields({ ...fields, [language]: { ...fields[language], [key]: e.target.value } }); setDirty(true); }} />}</label>)}
    <div className="release-hero-upload"><label>可选主视觉<input type="file" accept="image/webp" disabled={!!busy || editing.status === "revoked"} onChange={e => uploadHero(e.target.files[0])} /></label><small>WebP · 不超过 400 KB · 无图片也可完整使用</small>{heroUrl ? <button onClick={() => { setHeroUrl(""); setDirty(true); }}>使用默认极光晶体</button> : null}</div>
    <div className="release-policy"><h3>发布策略</h3><div><label>灰度比例<select value={rollout} disabled={editing.status === "revoked"} onChange={e => { setRollout(Number(e.target.value)); setDirty(true); }}>{[1, 5, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n}%</option>)}</select></label><label>最低可用 versionCode<input type="number" min="0" max={report?.versionCode} value={minimum} disabled={editing.status === "revoked"} onChange={e => { setMinimum(e.target.value); setDirty(true); }} /></label></div><p>0 表示关闭强制升级。低于最低版本的设备会跳过普通灰度限制。</p><label>定时发布（留空立即发布）<input type="datetime-local" value={schedule} disabled={editing.status === "revoked"} onChange={e => { setSchedule(e.target.value); setDirty(true); }} /></label></div>
   </div><aside className="release-preview"><div className="release-preview-controls"><select aria-label="预览主题" value={previewTheme} onChange={e => setPreviewTheme(e.target.value)}><option value="dark">深色</option><option value="light">浅色</option></select><select aria-label="预览策略" value={previewMode} onChange={e => setPreviewMode(e.target.value)}><option value="optional">普通更新</option><option value="mandatory">强制更新</option></select><select aria-label="预览阶段" value={previewPhase} onChange={e => setPreviewPhase(e.target.value)}><option value="offer">更新提醒</option><option value="download">下载中</option><option value="install">待安装</option></select></div><PhonePreview content={content} report={report} mode={previewMode} theme={previewTheme} phase={previewPhase} language={language} /><p>预览使用隔离数据。真实客户端会根据系统字体、语言和设备尺寸适配。</p></aside></div>
   <footer className="release-studio-footer"><span>{dirty ? "● 有未保存的更改" : `修订 ${editing.revision || "未保存"} · 包身份只读`}</span><div>{editing.status !== "revoked" ? <><button className="ghost" onClick={saveDraft} disabled={!!busy}>{busy === "save" ? "保存中…" : editing.status === "draft" ? "保存草稿" : "复核并保存修订"}</button>{editing.id ? <><button className="ghost release-danger" onClick={() => openReview("revoke")} disabled={!!busy}>撤回</button>{["published", "scheduled"].includes(editing.status) ? <button className="ghost" onClick={() => openReview("pause")} disabled={!!busy}>暂停曝光</button> : null}<button className="primary" onClick={() => openReview("publish")} disabled={!!busy || !contentComplete(content)}>{editing.status === "paused" ? "复核并恢复" : "发布复核 →"}</button></> : null}</> : <span>已撤回 · 请使用更高版本修复包</span>}</div></footer>
  </Dialog> : null}
  {review ? <Dialog title={review === "revoke" ? "撤回这个版本" : review === "pause" ? "暂停新增曝光" : "发布复核"} onClose={() => { if (!busy) { setReview(null); setCredential(""); } }}><form onSubmit={submitReview} className="release-review"><p className="release-explanation">核对身份、目标人群与时间后，使用独立发布凭证完成本次操作。</p><dl><dt>版本</dt><dd>{report.versionName} · #{report.versionCode}</dd><dt>目标</dt><dd>官方渠道 · Android {report.minSdk}+ · {report.abis.join(", ")}</dd><dt>普通灰度</dt><dd>{rollout}% · 稳定匿名分桶</dd><dt>最低可用版本</dt><dd>{Number(minimum) || "关闭强制升级"}</dd><dt>发布时间</dt><dd>{schedule ? new Date(schedule).toLocaleString() : "立即"}</dd></dl>{review === "revoke" ? <p className="release-alert error">撤回后停止曝光、下载和安装授权。已交给系统安装器的请求无法追回。此操作不能恢复，修复包必须提高 versionCode。</p> : null}{Number(minimum) > 0 ? <label className="release-force-confirm"><input type="checkbox" checked={forceConfirmed} onChange={e => setForceConfirmed(e.target.checked)} required />我已核对受影响设备：低于 {minimum} 的版本必须更新，强制人群不受普通灰度比例限制。</label> : null}<label>操作原因<textarea required rows="3" maxLength="1000" value={reason} onChange={e => setReason(e.target.value)} /></label><label>独立发布凭证<input type="password" autoComplete="off" required value={credential} onChange={e => setCredential(e.target.value)} /></label><p className="muted">凭证仅用于本次请求，不写入浏览器存储。</p>{error ? <p className="error" role="alert">{error}</p> : null}<button className={review === "revoke" ? "release-danger primary" : "primary"} type="submit" disabled={!!busy || !reason.trim() || !credential || (Number(minimum) > 0 && !forceConfirmed)}>{busy === "publish" ? "正在提交…" : review === "revoke" ? "确认撤回" : review === "pause" ? "确认暂停" : "确认发布修订"}</button></form></Dialog> : null}
 </div>;
}
function parseAudit(value) { try { return JSON.parse(value); } catch { return value; } }
