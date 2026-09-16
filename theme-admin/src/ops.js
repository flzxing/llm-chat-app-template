export function authHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export function pageOrigin(fallback = "") {
  if (typeof location !== "undefined" && location.origin) return location.origin;
  return fallback;
}

export function resolvePackAssetUrl(stored, origin, packId, fileName, version = 1) {
  const fallback = packId ? `${origin}/assets/packs/${packId}/${fileName}` : "";
  if (!stored) return fallback;
  try {
    const url = new URL(stored, origin);
    if (url.pathname.startsWith("/assets/packs/")) {
      return `${origin}${url.pathname}?v=${version ?? 1}`;
    }
  } catch {
    return fallback || stored;
  }
  return stored;
}

export function resolvePackPreview(pack, origin = pageOrigin()) {
  if (!pack?.id) return "";
  return resolvePackAssetUrl(pack.preview, origin, pack.id, "preview.webp", pack.version);
}

export function resolvePackZip(pack, origin = pageOrigin()) {
  if (!pack?.id) return "";
  return resolvePackAssetUrl(pack.packUrl, origin, pack.id, "pack.zip", pack.version);
}

export function publicPreview(packs) {
  return (packs || []).filter((pack) => (pack.status || "published") === "published");
}

export function applyStatus(packs, id, status) {
  return (packs || []).map((pack) => (pack.id === id ? { ...pack, status } : pack));
}

export function removePack(packs, id) {
  return (packs || []).filter((pack) => pack.id !== id);
}

export function shouldSendHardDelete(confirmed) {
  return confirmed === true;
}

export function shelfStats(packs) {
  const list = packs || [];
  return {
    total: list.length,
    published: list.filter((pack) => (pack.status || "published") === "published").length,
    hidden: list.filter((pack) => pack.status === "hidden").length,
    mature: list.filter((pack) => pack.audience === "mature").length,
    featured: list.filter((pack) => pack.featured).length,
  };
}

export function filterAndSortPacks(packs, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const status = filters.status || "all";
  const audience = filters.audience || "all";
  const sort = filters.sort || "sort";
  const filtered = (packs || []).filter((pack) => {
    const packStatus = pack.status || "published";
    if (status !== "all" && packStatus !== status) return false;
    if (audience !== "all" && (pack.audience || "standard") !== audience) return false;
    if (!query) return true;
    const hay = [pack.id, pack.displayName, pack.author, pack.summary, ...(pack.tags || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
  return filtered.sort((a, b) => {
    if (sort === "name") return String(a.displayName || a.id).localeCompare(String(b.displayName || b.id), "zh");
    if (sort === "id") return a.id.localeCompare(b.id);
    const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featured) return featured;
    return (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id);
  });
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return "—";
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function packToDraft(pack) {
  if (!pack) {
    return {
      id: "",
      displayName: "",
      audience: "standard",
      author: "Lucky Theme Studio",
      summary: "",
      tags: "",
      sort: 0,
      featured: false,
      status: "published",
    };
  }
  return {
    id: pack.id,
    displayName: pack.displayName || "",
    audience: pack.audience || "standard",
    author: pack.author || "",
    summary: pack.summary || "",
    tags: (pack.tags || []).join(", "),
    sort: pack.sort ?? 0,
    featured: Boolean(pack.featured),
    status: pack.status || "published",
  };
}

export function draftToBody(draft) {
  return {
    displayName: String(draft.displayName || "").trim(),
    audience: draft.audience,
    author: String(draft.author || "").trim(),
    summary: String(draft.summary || "").trim(),
    tags: String(draft.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    sort: Number(draft.sort) || 0,
    featured: Boolean(draft.featured),
    status: draft.status,
  };
}

export function isDraftDirty(draft, pack) {
  const baseline = packToDraft(pack);
  return JSON.stringify({ ...draft, id: draft.id }) !== JSON.stringify({ ...baseline, id: draft.id || baseline.id });
}

export function validatePackId(id) {
  return /^[a-z0-9][a-z0-9_]{1,63}$/.test(String(id || ""));
}

export function mapAdminError(error) {
  const text = String(error?.message || error || "");
  if (text === "unauthorized") return "口令无效或已过期，请重新登录。";
  if (text === "not_found") return "主题不存在。";
  if (text === "bad_key") return "资源路径不合法。";
  if (text === "bad_zip") return "主题包不是有效 zip，请重新选择文件。";
  if (text === "timeout" || text.includes("AbortError")) return "网络超时，请重试。";
  return text || "操作失败";
}

export async function adminFetch(url, init = {}, fetchImpl = fetch, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseAdminResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error(data.error || `http ${response.status}`);
  }
  return data;
}

export async function fetchAdminPacks(token, fetchImpl = fetch) {
  const response = await adminFetch("/v1/admin/packs", { headers: authHeaders(token) }, fetchImpl);
  return parseAdminResponse(response);
}

export async function upsertPack(token, id, body, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/packs/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify(body),
    },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function hidePack(token, id, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/packs/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: authHeaders(token) },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function hardDeletePack(token, id, confirmed, fetchImpl = fetch) {
  if (!shouldSendHardDelete(confirmed)) return { cancelled: true };
  const response = await adminFetch(
    `/v1/admin/packs/${encodeURIComponent(id)}?hard=1`,
    { method: "DELETE", headers: authHeaders(token) },
    fetchImpl,
  );
  return parseAdminResponse(response);
}

export async function uploadZip(token, id, file, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/packs/${encodeURIComponent(id)}/zip`,
    {
      method: "PUT",
      headers: authHeaders(token, { "content-type": file.type || "application/zip" }),
      body: file,
    },
    fetchImpl,
    120000,
  );
  return parseAdminResponse(response);
}

export async function uploadAsset(token, id, name, file, fetchImpl = fetch) {
  const response = await adminFetch(
    `/v1/admin/packs/${encodeURIComponent(id)}/assets/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: authHeaders(token, { "content-type": file.type || "application/octet-stream" }),
      body: file,
    },
    fetchImpl,
    60000,
  );
  return parseAdminResponse(response);
}

export async function rebuildCatalog(token, fetchImpl = fetch) {
  const response = await adminFetch(
    "/v1/admin/catalog/rebuild",
    { method: "POST", headers: authHeaders(token) },
    fetchImpl,
  );
  return parseAdminResponse(response);
}
