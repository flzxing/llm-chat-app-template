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

/** Curated IP slugs. Prefix order is significant (`hsr_` before `honkai_`). */
export const THEME_IP_PREFIXES: Array<[string, string]> = [
	["honor_", "honor_of_kings"],
	["lol_", "league_of_legends"],
	["genshin_", "genshin"],
	["hsr_", "honkai_star_rail"],
	["honkai_", "honkai_impact"],
	["azur_", "azur_lane"],
	["blue_", "blue_archive"],
	["nikke_", "nikke"],
	["arknights_", "arknights"],
	["gfl_", "girls_frontline"],
	["love_", "love_live"],
	["fgo_", "fate_grand_order"],
	["wuwa_", "wuthering_waves"],
];

export function inferThemeIpTags(id: string): string[] {
	const raw = (id || "").toLowerCase();
	if (!raw) return [];
	for (const [prefix, slug] of THEME_IP_PREFIXES) {
		if (raw === slug || raw.startsWith(prefix) || raw.startsWith(`${slug}_`)) return [slug];
	}
	return [];
}

export function mergeThemeIpTags(id: string, tags?: string[]): string[] {
	const merged = new Set((tags || []).map((tag) => tag.trim()).filter(Boolean));
	for (const slug of inferThemeIpTags(id)) merged.add(slug);
	return [...merged];
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
			.map((pack) =>
				[
					pack.id,
					pack.version ?? 1,
					pack.status || "published",
					pack.audience || "standard",
					pack.displayName || "",
					pack.sort ?? 0,
					pack.featured ? "1" : "0",
					pack.packUrl || "",
					pack.preview || "",
					pack.packBytes ?? "",
					pack.sha256 || "",
					(pack.tags || []).slice().sort().join(","),
				].join(":"),
			)
			.sort()
			.join("|") + salt;
	let hash = 0;
	for (let i = 0; i < token.length; i += 1) {
		hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
	}
	return `w/${(packs || []).length}-${hash.toString(16)}`;
}

/** Keep version stable on first zip / identical sha; bump when the object bytes change. */
export function nextPackVersion(current: ThemePackRecord | undefined, sha256: string) {
	const version = current?.version ?? 1;
	if (current?.sha256 && current.sha256 !== sha256) return version + 1;
	return version;
}

export function isZipArchive(bytes: ArrayBuffer) {
	if (bytes.byteLength < 22) return false;
	const header = new Uint8Array(bytes, 0, 2);
	return header[0] === 0x50 && header[1] === 0x4b;
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

export function withAssetCacheBust(url: string, version: number | undefined) {
	if (!url) return url;
	try {
		const parsed = new URL(url);
		parsed.searchParams.set("v", String(version ?? 1));
		return parsed.toString();
	} catch {
		return `${url.split("?")[0]}?v=${version ?? 1}`;
	}
}

/** Rewrite stored workers.dev / relative pack assets onto the request origin. */
export function rewritePackAssets(pack: ThemePackRecord, origin: string): ThemePackRecord {
	const n = normalizePack(pack);
	const zip = rewriteThemeAssetUrl(n.packUrl, origin, `${origin}/assets/packs/${n.id}/pack.zip`);
	const preview = rewriteThemeAssetUrl(n.preview, origin, `${origin}/assets/packs/${n.id}/preview.webp`);
	const previewDark = n.previewDark
		? rewriteThemeAssetUrl(n.previewDark, origin, `${origin}/assets/packs/${n.id}/preview-dark.webp`)
		: null;
	return {
		...n,
		preview: withAssetCacheBust(preview, n.version),
		previewDark: previewDark ? withAssetCacheBust(previewDark, n.version) : null,
		packUrl: withAssetCacheBust(zip, n.version),
	};
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
			packs: (catalog.packs || []).map((pack) => rewritePackAssets(pack, url.origin)),
		});
	}

	if (path === "/v1/admin/catalog/backfill-ip-tags" && request.method === "POST") {
		const catalog = await loadCatalog(bucket);
		let changed = 0;
		const packs = (catalog.packs || []).map((pack) => {
			const tags = mergeThemeIpTags(pack.id, pack.tags);
			const before = (pack.tags || []).slice().sort().join("\0");
			const after = tags.slice().sort().join("\0");
			if (before !== after) changed += 1;
			return { ...pack, tags };
		});
		await writeJson(bucket, "catalog.json", { schemaVersion: 2, packs });
		logAdmin("backfill_ip_tags", "*", `${changed}/${packs.length}`);
		return jsonThemeResponse({
			ok: true,
			changed,
			count: packs.length,
			etag: catalogEtag(packs),
		});
	}

	if (path === "/v1/admin/catalog/rebuild" && request.method === "POST") {
		const catalog = await loadCatalog(bucket);
		const rebuilt = {
			schemaVersion: 2,
			packs: (catalog.packs || []).map((pack) => rewritePackAssets(pack, url.origin)),
		};
		await writeJson(bucket, "catalog.json", rebuilt);
		logAdmin("rebuild", "*", rebuilt.packs.length);
		return jsonThemeResponse({ ok: true, etag: catalogEtag(rebuilt.packs), count: rebuilt.packs.length });
	}

	const zipMatch = path.match(/^\/v1\/admin\/packs\/([^/]+)\/zip$/);
	if (zipMatch && request.method === "PUT") {
		const id = decodeURIComponent(zipMatch[1]);
		const bytes = await request.arrayBuffer();
		if (!isZipArchive(bytes)) return jsonThemeResponse({ error: "bad_zip" }, 400);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
		await bucket.put(`packs/${id}/pack.zip`, bytes, {
			httpMetadata: { contentType: "application/zip" },
		});
		const catalog = await loadCatalog(bucket);
		const current = (catalog.packs || []).find((pack) => pack.id === id) || { id };
		const next = rewritePackAssets({
			...current,
			id,
			version: nextPackVersion(current, sha256),
			packUrl: `${url.origin}/assets/packs/${id}/pack.zip`,
			packBytes: bytes.byteLength,
			sha256,
			preview: current.preview || `${url.origin}/assets/packs/${id}/preview.webp`,
			status: current.status || "published",
		}, url.origin);
		const packJson = (await readJson<ThemePackRecord>(bucket, `packs/${id}/pack.json`)) || { id };
		await writeJson(bucket, `packs/${id}/pack.json`, { ...packJson, ...next });
		await writeJson(bucket, "catalog.json", upsertCatalog(catalog, next));
		logAdmin("zip", id, next.version);
		return jsonThemeResponse({
			ok: true,
			id,
			sha256,
			packBytes: next.packBytes,
			packUrl: next.packUrl,
			version: next.version,
		});
	}

	const assetMatch = path.match(/^\/v1\/admin\/packs\/([^/]+)\/assets\/(.+)$/);
	if (assetMatch && request.method === "PUT") {
		const id = decodeURIComponent(assetMatch[1]);
		const name = decodeURIComponent(assetMatch[2]);
		if (name.includes("..")) return jsonThemeResponse({ error: "bad_key" }, 400);
		const contentType = request.headers.get("content-type") || "application/octet-stream";
		const key = `packs/${id}/${name}`;
		await bucket.put(key, request.body, { httpMetadata: { contentType } });
		const isPreview = name === "preview.webp" || name === "preview-dark.webp";
		if (isPreview) {
			const catalog = await loadCatalog(bucket);
			const current = (catalog.packs || []).find((pack) => pack.id === id) || { id };
			const next = rewritePackAssets({
				...current,
				id,
				version: (current.version ?? 1) + 1,
				preview:
					name === "preview.webp"
						? `${url.origin}/assets/packs/${id}/preview.webp`
						: current.preview,
				previewDark:
					name === "preview-dark.webp"
						? `${url.origin}/assets/packs/${id}/preview-dark.webp`
						: current.previewDark,
			}, url.origin);
			const packJson = (await readJson<ThemePackRecord>(bucket, `packs/${id}/pack.json`)) || { id };
			await writeJson(bucket, `packs/${id}/pack.json`, { ...packJson, ...next });
			await writeJson(bucket, "catalog.json", upsertCatalog(catalog, next));
			logAdmin("asset", id, next.version);
			return jsonThemeResponse({ ok: true, key, url: `/assets/${key}`, version: next.version });
		}
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
			const next = rewritePackAssets({ ...current, ...body, id }, url.origin);
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
			const next = rewritePackAssets({ ...current, status: "hidden" }, url.origin);
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
		payload.packs = payload.packs.map((pack) => rewritePackAssets(pack, url.origin));
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
