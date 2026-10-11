export const PART_BYTES = 16 * 1024 * 1024;
export const MAX_APK_BYTES = 1024 * 1024 * 1024;
export const UPLOAD_KEY = "lucky-release-upload-v1";
export const STATUS_LABELS = { draft: "草稿", scheduled: "定时发布", published: "已发布", paused: "已暂停", revoked: "已撤回", uploading: "上传中", verifying: "等待本地校验", verified: "校验通过", rejected: "校验拒绝" };
const ERROR_COPY = {
 unauthorized: "运营会话无效，请重新登录。", publish_credential_required: "发布凭证无效。编辑权限不能代替发布权限。",
 revision_conflict: "这个版本已被其他操作修改。请刷新后重新核对。", version_already_exists: "这个 versionCode 已建立版本，请编辑已有草稿。",
 version_must_increase: "正式版本号必须高于已发布版本。修复包也需要递增 versionCode。",
 mandatory_target_incompatible: "强制升级目标不兼容全部支持设备，不能启用最低版本策略。",
 release_keys_not_configured: "正式证书或策略签名尚未配置，暂不能发布。",
 artifact_not_verified: "APK 尚未通过发布机校验与服务端验签。", zh_en_content_required: "请补齐简体中文、英文标题、摘要和日志，亮点最多三条。",
 missing_parts: "还有分片没有上传完成，请重选原文件恢复。", part_hash_mismatch: "分片校验不一致，请重新上传该分片。",
 artifact_storage_quota: "升级包存储达到 8 GiB 配额，请先清理未发布制品。", artifact_in_use: "制品已被版本引用，不能删除。", upload_closed: "这个上传会话已关闭，请刷新查看状态。", invalid_policy: "请核对灰度比例和最低版本号。",
 invalid_schedule: "发布时间无效。", reason_required: "请填写本次操作原因。", release_revoked: "版本已撤回，不能恢复。请上传更高版本的修复包。",
};
export function releaseError(error) { return ERROR_COPY[error?.code] || (error?.name === "AbortError" ? "上传已停止，重选同一文件可以恢复。" : "操作未完成，请检查网络后重试。已有草稿和分片会保留。"); }
export async function releaseApi(token, path = "/releases", { method = "GET", data, credential, signal } = {}) {
 const headers = { authorization: `Bearer ${token}` };
 if (data !== undefined) headers["content-type"] = "application/json";
 if (credential) headers["x-release-credential"] = credential;
 const response = await fetch(`/v1/admin/app-updates${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal });
 const result = await response.json().catch(() => ({}));
 if (!response.ok) throw Object.assign(new Error(result.error || "request_failed"), { code: result.error, status: response.status });
 return result;
}
export const formatBytes = (bytes) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
export async function hashBlob(blob) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join(""); }
export function validateApkFile(file) { if (!file || !/\.apk$/i.test(file.name) || file.size < 1 || file.size > MAX_APK_BYTES) throw Object.assign(new Error("invalid_apk"), { code: "invalid_apk" }); }
export function makeContent(fields) {
 const result = { titles: {}, summaries: {}, highlights: {}, notes: {} };
 for (const language of ["zh-CN", "en-US"]) {
  const value = fields[language] || {};
  for (const key of ["titles", "summaries", "notes"]) result[key][language] = (value[key] || "").trim();
  result.highlights[language] = (value.highlights || "").split("\n").map(s => s.trim()).filter(Boolean);
 }
 return result;
}
export function contentComplete(content) {
 return ["zh-CN", "en-US"].every(lang => content.titles?.[lang]?.trim() && content.summaries?.[lang]?.trim() && content.notes?.[lang]?.trim() && (content.highlights?.[lang]?.length || 0) <= 3);
}
export function fieldsForContent(content) { return Object.fromEntries(["zh-CN", "en-US"].map(lang => [lang, { titles: content?.titles?.[lang] || "", summaries: content?.summaries?.[lang] || "", notes: content?.notes?.[lang] || "", highlights: (content?.highlights?.[lang] || []).join("\n") }])); }
export function funnelFor(events, releaseId) {
 const kinds = ["offered", "download_started", "download_complete", "install_started", "installed"];
 const values = kinds.map(kind => Number(events.find(e => e.release_id === releaseId && e.kind === kind)?.devices || 0));
 return values.map((count, index) => ({ kind: kinds[index], count, denominator: index ? values[index - 1] : null, rate: index && values[index - 1] ? Math.round(count / values[index - 1] * 100) : null }));
}
function putPart(token, id, number, blob, digest, signal, progress) {
 return new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", `/v1/admin/app-updates/uploads/${id}/parts/${number}`);
  xhr.setRequestHeader("authorization", `Bearer ${token}`); xhr.setRequestHeader("x-part-sha256", digest);
  xhr.upload.onprogress = event => progress(event.loaded);
  xhr.onerror = () => reject(new Error("network_failed")); xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
  const abort = () => xhr.abort(); signal.addEventListener("abort", abort, { once: true });
  xhr.onloadend = () => signal.removeEventListener("abort", abort);
  xhr.onload = () => {
   let result = {}; try { result = JSON.parse(xhr.responseText); } catch { /* bounded API failure */ }
   if (xhr.status >= 200 && xhr.status < 300) resolve(result); else reject(Object.assign(new Error(result.error || "part_failed"), { code: result.error, status: xhr.status }));
  };
  if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
  xhr.send(blob);
 });
}
/** At most 3 resident 16MiB parts. Every resumed part is checked against the reselected file. */
export async function uploadApk({ token, file, resumeId, signal, onSession, onProgress, api = releaseApi, sendPart = putPart }) {
 validateApkFile(file);
 const session = resumeId ? await api(token, `/uploads/${resumeId}`, { signal }) : await api(token, "/uploads", { method: "POST", data: { fileName: file.name, bytes: file.size }, signal });
 onSession(session.id);
 if (session.status && session.status !== "uploading") return session;
 if (session.size !== undefined && session.size !== file.size) throw Object.assign(new Error("file_mismatch"), { code: "file_mismatch" });
 const localAbort = new AbortController();
 const workingSignal = AbortSignal.any([signal, localAbort.signal]);
 const count = Math.ceil(file.size / PART_BYTES), completed = new Map(), inFlight = new Map();
 let start = performance.now(), baseline = 0;
 const emit = (stage) => { const bytes = [...completed.values(), ...inFlight.values()].reduce((a, b) => a + b, 0); const speed = Math.max(0, bytes - baseline) / Math.max((performance.now() - start) / 1000, 1); onProgress({ bytes, total: file.size, speed, stage }); };
 for (const part of session.parts || []) {
  signal.throwIfAborted(); emit("正在核对已上传分片");
  const blob = file.slice((part.part_number - 1) * PART_BYTES, part.part_number * PART_BYTES);
  if (part.size !== blob.size || part.sha256 !== await hashBlob(blob)) throw Object.assign(new Error("file_mismatch"), { code: "file_mismatch" });
  completed.set(part.part_number, blob.size);
 }
 baseline = [...completed.values()].reduce((a, b) => a + b, 0); start = performance.now();
 let next = 1;
 async function worker() {
  while (next <= count) {
   workingSignal.throwIfAborted(); const number = next++;
   if (completed.has(number)) continue;
   const blob = file.slice((number - 1) * PART_BYTES, number * PART_BYTES), digest = await hashBlob(blob);
   for (let attempt = 0; ; attempt++) {
    try { await sendPart(token, session.id, number, blob, digest, workingSignal, bytes => { inFlight.set(number, bytes); emit("正在上传"); }); break; }
    catch (error) { if (workingSignal.aborted || attempt >= 2 || error.status === 401 || error.status === 409) throw error; inFlight.delete(number); emit("分片重试中"); }
   }
   inFlight.delete(number); completed.set(number, blob.size); emit("正在上传");
  }
 }
 const results = await Promise.allSettled([worker(), worker(), worker()].map(task => task.catch(error => { localAbort.abort(); throw error; })));
 const failed = results.find(result => result.status === "rejected"); if (failed) throw failed.reason;
 signal.throwIfAborted(); emit("上传完成，正在提交校验");
 await api(token, `/uploads/${session.id}/complete`, { method: "POST", data: {}, signal });
 return { id: session.id, status: "verifying" };
}
