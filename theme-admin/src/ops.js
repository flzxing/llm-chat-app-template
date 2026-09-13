export function authHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
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
  const response = await fetchImpl("/v1/admin/packs", { headers: authHeaders(token) });
  return parseAdminResponse(response);
}

export async function upsertPack(token, id, body, fetchImpl = fetch) {
  const response = await fetchImpl(`/v1/admin/packs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders(token, { "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return parseAdminResponse(response);
}

export async function hidePack(token, id, fetchImpl = fetch) {
  const response = await fetchImpl(`/v1/admin/packs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseAdminResponse(response);
}

export async function hardDeletePack(token, id, confirmed, fetchImpl = fetch) {
  if (!shouldSendHardDelete(confirmed)) return { cancelled: true };
  const response = await fetchImpl(`/v1/admin/packs/${encodeURIComponent(id)}?hard=1`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseAdminResponse(response);
}

export async function uploadZip(token, id, file, fetchImpl = fetch) {
  const response = await fetchImpl(`/v1/admin/packs/${encodeURIComponent(id)}/zip`, {
    method: "PUT",
    headers: authHeaders(token, { "content-type": file.type || "application/zip" }),
    body: file,
  });
  return parseAdminResponse(response);
}

export async function uploadAsset(token, id, name, file, fetchImpl = fetch) {
  const response = await fetchImpl(`/v1/admin/packs/${encodeURIComponent(id)}/assets/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: authHeaders(token, { "content-type": file.type || "application/octet-stream" }),
    body: file,
  });
  return parseAdminResponse(response);
}

export async function rebuildCatalog(token, fetchImpl = fetch) {
  const response = await fetchImpl("/v1/admin/catalog/rebuild", {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseAdminResponse(response);
}
