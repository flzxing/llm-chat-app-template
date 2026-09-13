import type { Env } from "./types";

const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=60",
};

const ASSET_HEADERS = {
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=31536000, immutable",
};

export const THEME_FETCH_HINT_SEC = 1800;

const BUNDLED_IDS = new Set([
	"default",
	"naruto_sasuke",
	"doraemon",
	"sanrio",
	"chiikawa",
	"detective_conan",
	"hatsune_miku",
	"world_of_warcraft",
	"line_puppy",
	"wotlk_lich_king",
	"super_mario",
	"cyberpunk_2077",
	"crayon_shinchan",
	"maplestory",
]);

export type ThemePackRecord = {
	id: string;
	version?: number;
	status?: string;
	audience?: string;
	displayName?: string;
	displayNameI18n?: Record<string, string>;
	author?: string;
	summary?: string;
	tags?: string[];
	sort?: number;
	featured?: boolean;
	preview?: string | null;
	previewDark?: string | null;
	sceneThumbs?: unknown[];
	packUrl?: string | null;
	packBytes?: number | null;
	sha256?: string | null;
	bundled?: boolean;
	price?: string | null;
	iap?: string | null;
};

export type ThemeCatalogRecord = {
	schemaVersion?: number;
	packs?: ThemePackRecord[];
};

export function jsonThemeResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...JSON_HEADERS, ...extraHeaders },
	});
}

export function normalizePack(pack: ThemePackRecord = { id: "" }): ThemePackRecord {
	const status = pack.status || "published";
	return {
		id: pack.id,
		version: pack.version ?? 1,
		status,
		audience: pack.audience || "standard",
		displayName: pack.displayName || pack.id,
		displayNameI18n: pack.displayNameI18n || {},
		author: pack.author || "Lucky Theme Studio",
		summary: pack.summary || "",
		tags: pack.tags || [],
		sort: pack.sort ?? 0,
		featured: Boolean(pack.featured),
		preview: pack.preview || null,
		previewDark: pack.previewDark || null,
		sceneThumbs: pack.sceneThumbs || [],
		packUrl: pack.packUrl || null,
		packBytes: pack.packBytes ?? null,
		sha256: pack.sha256 || null,
		bundled: Boolean(pack.bundled) || BUNDLED_IDS.has(pack.id),
		price: pack.price ?? null,
		iap: pack.iap ?? null,
	};
}

export function isPublished(pack: ThemePackRecord) {
	const status = pack.status || "published";
	return status === "published";
}

export function filterCatalogPacks(packs: ThemePackRecord[] | undefined, audience: string | null) {
	return (packs || [])
		.map(normalizePack)
		.filter(isPublished)
		.filter((pack) => {
			if (audience === "mature") return pack.audience === "mature";
			if (audience === "standard") return pack.audience !== "mature";
			return true;
		})
		.sort((a, b) => (a.sort! - b.sort!) || a.id.localeCompare(b.id));
}

export function catalogEtag(packs: ThemePackRecord[] | undefined, salt = "") {
	const token =
		(packs || [])
			.map((pack) => `${pack.id}:${pack.version}:${pack.status || "published"}:${pack.packUrl || ""}:${pack.preview || ""}`)
			.sort()
			.join("|") + salt;
	let hash = 0;
	for (let i = 0; i < token.length; i += 1) {
		hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
	}
	return `w/${(packs || []).length}-${hash.toString(16)}`;
}

export function publicCatalog(catalog: ThemeCatalogRecord | null | undefined, audience: string | null) {
	const packs = filterCatalogPacks(catalog?.packs, audience);
	const etag = catalogEtag(catalog?.packs || packs);
	return {
		schemaVersion: 2,
		etag,
		fetchedHintSec: THEME_FETCH_HINT_SEC,
		packs,
	};
}

export function rewriteThemeAssetUrl(stored: string | null | undefined, origin: string, fallback: string) {
	if (!stored) return fallback;
	try {
		const url = new URL(stored, origin);
		if (url.pathname.startsWith("/assets/packs/")) {
			return `${origin}${url.pathname}${url.search}`;
		}
	} catch {
		return fallback;
	}
	return stored;
}

function adminOk(request: Request, env: Env) {
	const token = env.THEME_ADMIN_TOKEN || env.ADMIN_TOKEN;
	if (!token) return false;
	return request.headers.get("authorization") === `Bearer ${token}`;
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
	const object = await bucket.get(key);
	if (!object) return null;
	return JSON.parse(await object.text()) as T;
}

async function writeJson(bucket: R2Bucket, key: string, data: unknown) {
	await bucket.put(key, JSON.stringify(data, null, 2), {
		httpMetadata: { contentType: "application/json" },
	});
}

async function loadCatalog(bucket: R2Bucket): Promise<ThemeCatalogRecord> {
	return (await readJson<ThemeCatalogRecord>(bucket, "catalog.json")) ?? { schemaVersion: 2, packs: [] };
}

function upsertCatalog(catalog: ThemeCatalogRecord, item: ThemePackRecord): ThemeCatalogRecord {
	const packs = [...(catalog.packs || [])];
	const index = packs.findIndex((pack) => pack.id === item.id);
	if (index >= 0) packs[index] = { ...packs[index], ...item };
	else packs.push(item);
	return { schemaVersion: 2, packs };
}

async function listPrefix(bucket: R2Bucket, prefix: string) {
	const keys: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix, cursor });
		for (const object of page.objects || []) keys.push(object.key);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

function logAdmin(action: string, packId: string, version: string | number | undefined) {
	console.log(`LuckyTheme/Admin admin_write action=${action} packId=${packId} version=${version ?? ""}`);
}

async function handleAdmin(request: Request, env: Env, url: URL) {
	if (!adminOk(request, env)) return jsonThemeResponse({ error: "unauthorized" }, 401);
	const path = url.pathname;
	const bucket = env.THEMES;

	if (path === "/v1/admin/packs" && request.method === "GET") {
		const catalog = await loadCatalog(bucket);
		return jsonThemeResponse({
			schemaVersion: 2,
			packs: (catalog.packs || []).map(normalizePack),
		});
	}

	if (path === "/v1/admin/catalog/rebuild" && request.method === "POST") {
		const catalog = await loadCatalog(bucket);
		const rebuilt = { schemaVersion: 2, packs: (catalog.packs || []).map(normalizePack) };
		await writeJson(bucket, "catalog.json", rebuilt);
		logAdmin("rebuild", "*", rebuilt.packs.length);
		return jsonThemeResponse({ ok: true, etag: catalogEtag(rebuilt.packs), count: rebuilt.packs.length });
	}

	const zipMatch = path.match(/^\/v1\/admin\/packs\/([^/]+)\/zip$/);
	if (zipMatch && request.method === "PUT") {
		const id = decodeURIComponent(zipMatch[1]);
		const bytes = await request.arrayBuffer();
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
		await bucket.put(`packs/${id}/pack.zip`, bytes, {
			httpMetadata: { contentType: "application/zip" },
		});
		const catalog = await loadCatalog(bucket);
		const current = (catalog.packs || []).find((pack) => pack.id === id) || { id };
		const next = normalizePack({
			...current,
			id,
			packUrl: `${url.origin}/assets/packs/${id}/pack.zip`,
			packBytes: bytes.byteLength,
			sha256,
			preview: current.preview || `${url.origin}/assets/packs/${id}/preview.webp`,
			status: current.status || "published",
		});
		const packJson = (await readJson<ThemePackRecord>(bucket, `packs/${id}/pack.json`)) || { id };
		await writeJson(bucket, `packs/${id}/pack.json`, { ...packJson, ...next });
		await writeJson(bucket, "catalog.json", upsertCatalog(catalog, next));
		logAdmin("zip", id, next.version);
		return jsonThemeResponse({ ok: true, id, sha256, packBytes: next.packBytes, packUrl: next.packUrl });
	}

	const assetMatch = path.match(/^\/v1\/admin\/packs\/([^/]+)\/assets\/(.+)$/);
	if (assetMatch && request.method === "PUT") {
		const id = decodeURIComponent(assetMatch[1]);
		const name = decodeURIComponent(assetMatch[2]);
		if (name.includes("..")) return jsonThemeResponse({ error: "bad_key" }, 400);
		const contentType = request.headers.get("content-type") || "application/octet-stream";
		const key = `packs/${id}/${name}`;
		await bucket.put(key, request.body, { httpMetadata: { contentType } });
		logAdmin("asset", id, name);
		return jsonThemeResponse({ ok: true, key, url: `/assets/${key}` });
	}

	const packMatch = path.match(/^\/v1\/admin\/packs\/([^/]+)$/);
	if (packMatch) {
		const id = decodeURIComponent(packMatch[1]);
		if (request.method === "PUT") {
			const body = (await request.json()) as ThemePackRecord;
			const catalog = await loadCatalog(bucket);
			const current = (catalog.packs || []).find((pack) => pack.id === id) || { id };
			const next = normalizePack({ ...current, ...body, id });
			const packJson = (await readJson<ThemePackRecord>(bucket, `packs/${id}/pack.json`)) || { id };
			await writeJson(bucket, `packs/${id}/pack.json`, { ...packJson, ...next });
			await writeJson(bucket, "catalog.json", upsertCatalog(catalog, next));
			logAdmin("upsert", id, next.version);
			return jsonThemeResponse({ ok: true, pack: next });
		}
		if (request.method === "DELETE") {
			const hard = url.searchParams.get("hard") === "1";
			const catalog = await loadCatalog(bucket);
			if (hard) {
				const keys = await listPrefix(bucket, `packs/${id}/`);
				await Promise.all(keys.map((key) => bucket.delete(key)));
				const packs = (catalog.packs || []).filter((pack) => pack.id !== id);
				await writeJson(bucket, "catalog.json", { schemaVersion: 2, packs });
				logAdmin("hard_delete", id, "");
				return jsonThemeResponse({ ok: true, id, deleted: keys.length });
			}
			const current = (catalog.packs || []).find((pack) => pack.id === id);
			if (!current) return jsonThemeResponse({ error: "not_found" }, 404);
			const next = normalizePack({ ...current, status: "hidden" });
			await writeJson(bucket, "catalog.json", upsertCatalog(catalog, next));
			logAdmin("hide", id, next.version);
			return jsonThemeResponse({ ok: true, pack: next });
		}
	}

	return jsonThemeResponse({ error: "not_found" }, 404);
}

/** Theme CDN routes. Returns null when the request is not a theme path. */
export async function handleThemeRequest(request: Request, env: Env): Promise<Response | null> {
	if (!env.THEMES) return null;
	const url = new URL(request.url);
	const path = url.pathname;

	const isThemePath =
		path === "/v1/catalog" ||
		path.startsWith("/v1/admin/") ||
		path.startsWith("/v1/assets/") ||
		path.startsWith("/v1/packs/") ||
		path.startsWith("/assets/packs/");
	if (!isThemePath) return null;

	if (request.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"access-control-allow-origin": "*",
				"access-control-allow-headers": "authorization, content-type",
				"access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
			},
		});
	}

	if (path === "/v1/catalog") {
		const catalog = await loadCatalog(env.THEMES);
		const payload = publicCatalog(catalog, url.searchParams.get("audience"));
		payload.packs = payload.packs.map((pack) => {
			const fallbackZip = `${url.origin}/assets/packs/${pack.id}/pack.zip`;
			const zip = rewriteThemeAssetUrl(pack.packUrl, url.origin, fallbackZip);
			const packUrl = zip.includes("?") ? zip : `${zip}?v=${pack.version ?? 1}`;
			return {
				...pack,
				preview: rewriteThemeAssetUrl(
					pack.preview,
					url.origin,
					`${url.origin}/assets/packs/${pack.id}/preview.webp`,
				),
				packUrl,
			};
		});
		payload.etag = catalogEtag(payload.packs, url.origin);
		const etag = payload.etag;
		if (request.headers.get("if-none-match") === etag) {
			return new Response(null, { status: 304, headers: { ...JSON_HEADERS, etag } });
		}
		return jsonThemeResponse(payload, 200, { etag, "x-lucky-theme-protocol": "2" });
	}

	if (path.startsWith("/v1/admin/")) {
		return handleAdmin(request, env, url);
	}

	if (path.startsWith("/v1/assets/") && request.method === "PUT") {
		if (!adminOk(request, env)) return jsonThemeResponse({ error: "unauthorized" }, 401);
		const key = decodeURIComponent(path.slice("/v1/assets/".length));
		if (!key || key.includes("..")) return jsonThemeResponse({ error: "bad_key" }, 400);
		const contentType = request.headers.get("content-type") || "application/octet-stream";
		await env.THEMES.put(key, request.body, { httpMetadata: { contentType } });
		return jsonThemeResponse({ ok: true, key, url: `/assets/${key}` });
	}

	if (path.startsWith("/v1/packs/")) {
		const id = decodeURIComponent(path.slice("/v1/packs/".length).replace(/\/$/, ""));
		if (request.method === "PUT") {
			if (!adminOk(request, env)) return jsonThemeResponse({ error: "unauthorized" }, 401);
			const body = await request.json();
			await writeJson(env.THEMES, `packs/${id}/pack.json`, body);
			return jsonThemeResponse({ ok: true, id });
		}
		const pack = await readJson(env.THEMES, `packs/${id}/pack.json`);
		if (!pack) return jsonThemeResponse({ error: "not_found" }, 404);
		return jsonThemeResponse(pack);
	}

	if (path.startsWith("/assets/packs/")) {
		const key = decodeURIComponent(path.slice("/assets/".length));
		const object = await env.THEMES.get(key);
		if (!object) return new Response("not found", { status: 404 });
		const contentType = object.httpMetadata?.contentType || "application/octet-stream";
		const headers: Record<string, string> = {
			...ASSET_HEADERS,
			"content-type": contentType,
			...(key.endsWith("/pack.zip") ? { "cache-control": "public, max-age=60" } : {}),
		};
		if (object.size != null) headers["content-length"] = String(object.size);
		return new Response(object.body, { headers });
	}

	return jsonThemeResponse({ error: "not_found" }, 404);
}
