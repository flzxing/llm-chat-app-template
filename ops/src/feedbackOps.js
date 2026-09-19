import { authHeaders, adminFetch, parseAdminResponse, mapAdminError } from "./themeOps.js";

export const FEEDBACK_LOCALES = ["zh-CN", "zh-TW", "en-US", "en-GB", "ja", "ko", "de", "es", "fr"];

export function emptyReason(id = "") {
  return {
    id,
    kind: "preset",
    sort: 0,
    enabled: true,
    labels: Object.fromEntries(FEEDBACK_LOCALES.map((locale) => [locale, ""])),
  };
}

export function catalogToDraft(catalog) {
  const reasons = (catalog?.reasons || []).map((item, index) => ({
    id: item.id,
    kind: item.kind === "other" ? "other" : "preset",
    sort: item.sort ?? index * 10,
    enabled: item.enabled !== false,
    labels: { ...emptyReason().labels, ...(item.labels || {}) },
  }));
  return {
    fallbackLocale: catalog?.fallbackLocale || "en-US",
    locales: catalog?.locales?.length ? catalog.locales : [...FEEDBACK_LOCALES],
    copy: catalog?.copy || {},
    reasons,
  };
}

export function missingReasonLocales(reason, fallback = "en-US") {
  return FEEDBACK_LOCALES.filter((locale) => !String(reason?.labels?.[locale] || "").trim()).filter(
    (locale) => locale !== fallback,
  );
}

export function validateReasonDraft(reasons) {
  const ids = new Set();
  let other = 0;
  for (const reason of reasons || []) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(String(reason.id || ""))) return "原因 ID 需为小写字母开头的 snake_case。";
    if (ids.has(reason.id)) return `原因 ID 重复：${reason.id}`;
    ids.add(reason.id);
    if (reason.kind === "other") other += 1;
    const hasLabel = Object.values(reason.labels || {}).some((value) => String(value).trim());
    if (!hasLabel) return `${reason.id} 至少需要一种语言标签。`;
  }
  if (other !== 1) return "必须且仅能有一条「其他」原因。";
  return "";
}

export function moveReason(reasons, id, delta) {
  const list = [...(reasons || [])];
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return list;
  const next = index + delta;
  if (next < 0 || next >= list.length) return list;
  const [item] = list.splice(index, 1);
  list.splice(next, 0, item);
  return list.map((reason, sortIndex) => ({ ...reason, sort: (sortIndex + 1) * 10 }));
}

export function formatCsat(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

export function filterReports(reports, filters = {}) {
  const kind = filters.kind || "all";
  const status = filters.status || "all";
  const reason = filters.reason || "all";
  const query = String(filters.query || "").trim().toLowerCase();
  return (reports || []).filter((report) => {
    if (kind !== "all" && report.kind !== kind) return false;
    if (status !== "all" && report.status !== status) return false;
    if (reason !== "all" && !(report.reasonIds || []).includes(reason)) return false;
    if (!query) return true;
    const hay = [report.id, report.comment, report.otherText, report.contact, JSON.stringify(report.context || {})]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

export function reasonLabel(catalog, id, locale = "zh-CN") {
  const reason = (catalog?.reasons || []).find((item) => item.id === id);
  if (!reason) return id;
  const fallback = catalog?.fallbackLocale || "en-US";
  return reason.labels?.[locale] || reason.labels?.[fallback] || reason.labels?.["en-US"] || id;
}

export async function fetchFeedbackCatalog(token, fetchImpl = fetch) {
  const response = await adminFetch("/v1/admin/feedback/catalog", { headers: authHeaders(token) }, fetchImpl);
  return parseAdminResponse(response);
}

export async function saveFeedbackCatalog(token, catalog, fetchImpl = fetch) {
  const response = await adminFetch(
    "/v1/admin/feedback/catalog",
    {
      method: "PUT",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify(catalog),
    },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function fetchFeedbackStats(token, days = 30, fetchImpl = fetch) {
  const response = await adminFetch(`/v1/admin/feedback/stats?days=${days}`, { headers: authHeaders(token) }, fetchImpl);
  return parseAdminResponse(response);
}

export async function fetchFeedbackReports(token, query = {}, fetchImpl = fetch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && value !== "all") params.set(key, value);
  }
  const response = await adminFetch(
    `/v1/admin/feedback/reports?${params.toString()}`,
    { headers: authHeaders(token) },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function fetchFeedbackReport(token, id, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/feedback/reports/${encodeURIComponent(id)}`,
    { headers: authHeaders(token) },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function patchFeedbackReport(token, id, status, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/feedback/reports/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({ status }),
    },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export function feedbackAdminError(error) {
  const text = String(error?.message || error || "");
  if (text === "other_required") return "必须且仅能保留一条「其他」原因。";
  if (text === "empty_reasons") return "原因列表不能为空。";
  if (text === "bad_reason_id") return "原因 ID 不合法。";
  if (text === "bad_status") return "工单状态不合法。";
  return mapAdminError(error);
}

export { mapAdminError };
