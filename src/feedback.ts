import { createAuth } from "./auth";
import type { Env } from "./types";

export const FEEDBACK_CATALOG_KEY = "feedback/catalog.json";
export const FEEDBACK_PROTOCOL = "1";
export const FEEDBACK_MAX_ATTACHMENTS = 3;
export const FEEDBACK_MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const FEEDBACK_RATE_LIMIT = 20;
export const FEEDBACK_RATE_WINDOW_MS = 10 * 60 * 1000;

const PUBLIC_JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=60, stale-while-revalidate=86400",
};

const ORIGIN_JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"cache-control": "no-store",
};

const LOCALES = ["zh-CN", "zh-TW", "en-US", "en-GB", "ja", "ko", "de", "es", "fr"] as const;
const ALLOWED_KINDS = new Set(["up", "down", "general"]);
const ALLOWED_STATUS = new Set(["new", "triaged", "resolved", "spam"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

const rateBuckets = new Map<string, number[]>();

export type FeedbackReasonKind = "preset" | "other";

export type FeedbackReason = {
	id: string;
	kind: FeedbackReasonKind;
	sort: number;
	enabled: boolean;
	labels: Record<string, string>;
};

export type FeedbackCatalog = {
	schemaVersion: number;
	etag?: string;
	updatedAt: string;
	fallbackLocale: string;
	locales: string[];
	reasons: FeedbackReason[];
	copy: Record<string, Record<string, string>>;
};

export type FeedbackReportRow = {
	id: string;
	kind: string;
	status: string;
	reason_ids: string;
	other_text: string | null;
	comment: string | null;
	contact: string | null;
	user_id: string | null;
	guest_id: string | null;
	context_json: string | null;
	catalog_etag: string | null;
	app_locale: string | null;
	created_at: number;
};

function i18n(map: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const locale of LOCALES) {
		const lang = locale.split("-")[0];
		out[locale] = map[locale] || map[lang] || map["en-US"] || map["zh-CN"] || "";
	}
	return out;
}

function reason(
	id: string,
	kind: FeedbackReasonKind,
	sort: number,
	labels: Record<string, string>,
): FeedbackReason {
	return { id, kind, sort, enabled: true, labels: i18n(labels) };
}

export function seedFeedbackCatalog(now = new Date()): FeedbackCatalog {
	return {
		schemaVersion: 1,
		updatedAt: now.toISOString(),
		fallbackLocale: "en-US",
		locales: [...LOCALES],
		reasons: [
			reason("ignored_instruction", "preset", 10, {
				"zh-CN": "没按我的要求做",
				"zh-TW": "沒照我的要求做",
				"en-US": "Didn't follow my instructions",
				ja: "指示どおりに動かない",
				ko: "내 지시대로 하지 않음",
				de: "Hat meine Anweisung nicht befolgt",
				es: "No siguió mis instrucciones",
				fr: "N’a pas suivi mes consignes",
			}),
			reason("off_topic", "preset", 20, {
				"zh-CN": "答非所问",
				"zh-TW": "答非所問",
				"en-US": "Missed the point",
				ja: "的外れ",
				ko: "동문서답",
				de: "Am Thema vorbei",
				es: "No dio en el punto",
				fr: "À côté de la question",
			}),
			reason("incomplete", "preset", 30, {
				"zh-CN": "任务没做完",
				"zh-TW": "任務沒做完",
				"en-US": "Stopped before finishing",
				ja: "途中で止まった",
				ko: "작업을 끝내지 않음",
				de: "Nicht zu Ende gebracht",
				es: "No terminó la tarea",
				fr: "Tâche inachevée",
			}),
			reason("hallucination", "preset", 40, {
				"zh-CN": "不准确或胡编",
				"zh-TW": "不正確或胡謅",
				"en-US": "Inaccurate or made-up",
				ja: "不正確／捏造",
				ko: "부정확하거나 지어냄",
				de: "Ungenau oder erfunden",
				es: "Inexacto o inventado",
				fr: "Inexact ou inventé",
			}),
			reason("bad_code", "preset", 50, {
				"zh-CN": "代码错误或跑不通",
				"zh-TW": "程式錯誤或跑不通",
				"en-US": "Code is wrong or won't run",
				ja: "コードが動かない",
				ko: "코드가 잘못되었거나 실행 안 됨",
				de: "Code fehlerhaft oder läuft nicht",
				es: "El código falla o no corre",
				fr: "Code incorrect ou inutilisable",
			}),
			reason("wrong_edit", "preset", 60, {
				"zh-CN": "改错文件或改太多",
				"zh-TW": "改錯檔案或改太多",
				"en-US": "Wrong files or too many edits",
				ja: "間違ったファイル／直しすぎ",
				ko: "잘못된 파일을 고치거나 너무 많이 수정",
				de: "Falsche Dateien oder zu viele Änderungen",
				es: "Archivos equivocados o demasiados cambios",
				fr: "Mauvais fichiers ou trop de changements",
			}),
			reason("tool_failed", "preset", 70, {
				"zh-CN": "工具或终端失败",
				"zh-TW": "工具或終端失敗",
				"en-US": "Tool or terminal failed",
				ja: "ツール／ターミナル失敗",
				ko: "도구 또는 터미널 실패",
				de: "Werkzeug oder Terminal fehlgeschlagen",
				es: "Falló la herramienta o la terminal",
				fr: "Outil ou terminal en échec",
			}),
			reason("too_slow", "preset", 80, {
				"zh-CN": "太慢或卡住",
				"zh-TW": "太慢或卡住",
				"en-US": "Too slow or stuck",
				ja: "遅い／固まる",
				ko: "너무 느리거나 멈춤",
				de: "Zu langsam oder hängt",
				es: "Lento o bloqueado",
				fr: "Trop lent ou bloqué",
			}),
			reason("unsafe", "preset", 90, {
				"zh-CN": "不安全或不当",
				"zh-TW": "不安全或不當",
				"en-US": "Unsafe or inappropriate",
				ja: "不適切／危険",
				ko: "위험하거나 부적절",
				de: "Unsicher oder unangemessen",
				es: "Inseguro o inapropiado",
				fr: "Dangereux ou inapproprié",
			}),
			reason("other", "other", 999, {
				"zh-CN": "其他",
				"zh-TW": "其他",
				"en-US": "Other",
				ja: "その他",
				ko: "기타",
				de: "Sonstiges",
				es: "Otro",
				fr: "Autre",
			}),
		],
		copy: {
			sheetTitle: i18n({
				"zh-CN": "哪里不满意？",
				"zh-TW": "哪裡不滿意？",
				"en-US": "What went wrong?",
				ja: "何が問題でしたか？",
				ko: "무엇이 문제였나요?",
				de: "Was ist schiefgelaufen?",
				es: "¿Qué salió mal?",
				fr: "Qu’est-ce qui n’a pas fonctionné ?",
			}),
			generalTitle: i18n({
				"zh-CN": "想告诉我们什么？",
				"zh-TW": "想告訴我們什麼？",
				"en-US": "What would you like to tell us?",
				ja: "ご意見をお聞かせください",
				ko: "무엇을 알려주시겠어요?",
				de: "Was möchten Sie uns mitteilen?",
				es: "¿Qué te gustaría contarnos?",
				fr: "Que souhaitez-vous nous dire ?",
			}),
			otherPlaceholder: i18n({
				"zh-CN": "请具体说明，便于我们改进",
				"zh-TW": "請具體說明，方便我們改進",
				"en-US": "Please describe so we can improve",
				ja: "改善できるよう具体的に書いてください",
				ko: "개선할 수 있도록 구체적으로 적어 주세요",
				de: "Bitte genauer beschreiben, damit wir verbessern können",
				es: "Descríbelo para que podamos mejorar",
				fr: "Précisez pour que nous puissions nous améliorer",
			}),
			commentPlaceholder: i18n({
				"zh-CN": "补充说明（可选）",
				"zh-TW": "補充說明（可選）",
				"en-US": "More detail (optional)",
				ja: "補足（任意）",
				ko: "추가 설명 (선택)",
				de: "Mehr Details (optional)",
				es: "Más detalles (opcional)",
				fr: "Plus de détails (facultatif)",
			}),
			contactPlaceholder: i18n({
				"zh-CN": "联系方式（可选）",
				"zh-TW": "聯絡方式（可選）",
				"en-US": "Contact (optional)",
				ja: "連絡先（任意）",
				ko: "연락처 (선택)",
				de: "Kontakt (optional)",
				es: "Contacto (opcional)",
				fr: "Contact (facultatif)",
			}),
		},
	};
}

export function feedbackCatalogEtag(catalog: Omit<FeedbackCatalog, "etag"> | FeedbackCatalog): string {
	const { etag: _ignored, ...rest } = catalog as FeedbackCatalog;
	const token = JSON.stringify(rest);
	let hash = 0;
	for (let i = 0; i < token.length; i += 1) {
		hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
	}
	return `w/${rest.reasons?.length || 0}-${hash.toString(16)}`;
}

export function withCatalogEtag(catalog: FeedbackCatalog): FeedbackCatalog {
	const next = { ...catalog, schemaVersion: 1 };
	next.etag = feedbackCatalogEtag(next);
	return next;
}

export function normalizeFeedbackCatalog(input: unknown): { ok: true; catalog: FeedbackCatalog } | { ok: false; error: string } {
	const raw = (input || {}) as FeedbackCatalog;
	const reasons = Array.isArray(raw.reasons) ? raw.reasons : [];
	if (!reasons.length) return { ok: false, error: "empty_reasons" };
	const ids = new Set<string>();
	let otherCount = 0;
	const normalized: FeedbackReason[] = [];
	for (const item of reasons) {
		const id = String(item?.id || "").trim();
		if (!/^[a-z][a-z0-9_]{1,63}$/.test(id)) return { ok: false, error: "bad_reason_id" };
		if (ids.has(id)) return { ok: false, error: "duplicate_reason" };
		ids.add(id);
		const kind = item.kind === "other" ? "other" : "preset";
		if (kind === "other") otherCount += 1;
		const labels = item.labels && typeof item.labels === "object" ? item.labels : {};
		if (!Object.keys(labels).length) return { ok: false, error: "missing_labels" };
		normalized.push({
			id,
			kind,
			sort: Number(item.sort) || 0,
			enabled: item.enabled !== false,
			labels,
		});
	}
	if (otherCount !== 1) return { ok: false, error: "other_required" };
	normalized.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
	const copy = raw.copy && typeof raw.copy === "object" ? raw.copy : {};
	const catalog: FeedbackCatalog = {
		schemaVersion: 1,
		updatedAt: raw.updatedAt || new Date().toISOString(),
		fallbackLocale: raw.fallbackLocale || "en-US",
		locales: Array.isArray(raw.locales) && raw.locales.length ? raw.locales.map(String) : [...LOCALES],
		reasons: normalized,
		copy,
	};
	return { ok: true, catalog: withCatalogEtag(catalog) };
}

export function validateFeedbackSubmit(
	body: Record<string, unknown>,
	catalog: FeedbackCatalog,
): { ok: true; kind: string; reasonIds: string[]; otherText: string; comment: string; contact: string } | { ok: false; error: string } {
	const kind = String(body.kind || "");
	if (!ALLOWED_KINDS.has(kind)) return { ok: false, error: "bad_kind" };
	const reasonIds = Array.isArray(body.reasonIds) ? body.reasonIds.map((id) => String(id)) : [];
	const otherText = String(body.otherText || "").trim();
	const comment = String(body.comment || "").trim();
	const contact = String(body.contact || "").trim();
	if (kind === "up") {
		return { ok: true, kind, reasonIds: [], otherText: "", comment, contact };
	}
	const enabled = new Map(catalog.reasons.filter((item) => item.enabled).map((item) => [item.id, item]));
	if (!reasonIds.length) return { ok: false, error: "reason_required" };
	for (const id of reasonIds) {
		if (!enabled.has(id)) return { ok: false, error: "unknown_reason" };
	}
	const other = catalog.reasons.find((item) => item.kind === "other");
	if (other && reasonIds.includes(other.id) && !otherText) return { ok: false, error: "other_required" };
	return { ok: true, kind, reasonIds, otherText, comment, contact };
}

function jsonResponse(data: unknown, status = 200, extra: Record<string, string> = {}, origin = false) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...(origin ? ORIGIN_JSON_HEADERS : PUBLIC_JSON_HEADERS), ...extra },
	});
}

function adminOk(request: Request, env: Env) {
	const token = env.THEME_ADMIN_TOKEN || env.ADMIN_TOKEN;
	if (!token) return false;
	return request.headers.get("authorization") === `Bearer ${token}`;
}

function clientKey(request: Request) {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		"unknown"
	);
}

export function takeRateSlot(key: string, now = Date.now(), limit = FEEDBACK_RATE_LIMIT, windowMs = FEEDBACK_RATE_WINDOW_MS) {
	const recent = (rateBuckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
	if (recent.length >= limit) {
		rateBuckets.set(key, recent);
		return false;
	}
	recent.push(now);
	rateBuckets.set(key, recent);
	return true;
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

export async function loadFeedbackCatalog(bucket: R2Bucket): Promise<FeedbackCatalog> {
	const stored = await readJson<FeedbackCatalog>(bucket, FEEDBACK_CATALOG_KEY);
	if (stored?.reasons?.length) {
		const normalized = normalizeFeedbackCatalog(stored);
		if (normalized.ok) return normalized.catalog;
	}
	const seeded = withCatalogEtag(seedFeedbackCatalog());
	await writeJson(bucket, FEEDBACK_CATALOG_KEY, seeded);
	return seeded;
}

async function optionalUserId(request: Request, env: Env): Promise<string | null> {
	try {
		const session = await createAuth(env).api.getSession({ headers: request.headers });
		return session?.user?.id ?? null;
	} catch {
		return null;
	}
}

function dayKey(ms: number) {
	return new Date(ms).toISOString().slice(0, 10);
}

async function bumpStats(db: D1Database, kind: string, reasonIds: string[], createdAt: number) {
	const day = dayKey(createdAt);
	const ids = kind === "up" ? ["-"] : reasonIds.length ? reasonIds : ["-"];
	for (const reasonId of ids) {
		await db
			.prepare(
				`INSERT INTO feedback_daily_stats (day, kind, reason_id, count)
				 VALUES (?, ?, ?, 1)
				 ON CONFLICT(day, kind, reason_id) DO UPDATE SET count = count + 1`,
			)
			.bind(day, kind, reasonId)
			.run();
	}
}

function isFeedbackPath(path: string) {
	return path === "/v1/feedback/catalog" || path.startsWith("/v1/feedback/") || path.startsWith("/v1/admin/feedback");
}

function corsPreflight() {
	return new Response(null, {
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "authorization, content-type, if-none-match",
			"access-control-allow-methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS",
		},
	});
}

async function handlePublicCatalog(request: Request, env: Env) {
	const catalog = await loadFeedbackCatalog(env.THEMES);
	const etag = catalog.etag || feedbackCatalogEtag(catalog);
	if (request.headers.get("if-none-match") === etag) {
		return new Response(null, {
			status: 304,
			headers: { ...PUBLIC_JSON_HEADERS, etag, "x-lucky-feedback-protocol": FEEDBACK_PROTOCOL },
		});
	}
	return jsonResponse(catalog, 200, { etag, "x-lucky-feedback-protocol": FEEDBACK_PROTOCOL });
}

async function handleSubmit(request: Request, env: Env) {
	if (!takeRateSlot(clientKey(request))) return jsonResponse({ error: "rate_limited" }, 429);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return jsonResponse({ error: "bad_json" }, 400);
	const catalog = await loadFeedbackCatalog(env.THEMES);
	const parsed = validateFeedbackSubmit(body, catalog);
	if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);
	const attachmentKeys = Array.isArray(body.attachmentKeys) ? body.attachmentKeys.map((key) => String(key)) : [];
	if (attachmentKeys.length > FEEDBACK_MAX_ATTACHMENTS) return jsonResponse({ error: "too_many_attachments" }, 400);
	for (const key of attachmentKeys) {
		if (!key.startsWith("feedback/tmp/") || key.includes("..")) return jsonResponse({ error: "bad_attachment" }, 400);
	}
	const id = crypto.randomUUID();
	const createdAt = Date.now();
	const context = body.context && typeof body.context === "object" ? body.context : {};
	const userId = await optionalUserId(request, env);
	const guestId = userId ? null : String((context as { guestId?: string }).guestId || clientKey(request)).slice(0, 80);
	await env.DB.prepare(
		`INSERT INTO feedback_reports (
			id, kind, status, reason_ids, other_text, comment, contact, user_id, guest_id,
			context_json, catalog_etag, app_locale, created_at
		) VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			parsed.kind,
			JSON.stringify(parsed.reasonIds),
			parsed.otherText || null,
			parsed.comment || null,
			parsed.contact || null,
			userId,
			guestId,
			JSON.stringify(context),
			String(body.catalogEtag || catalog.etag || ""),
			String((context as { locale?: string }).locale || ""),
			createdAt,
		)
		.run();
	const moved: Array<{ id: string; key: string; contentType: string; bytes: number }> = [];
	for (const key of attachmentKeys) {
		const object = await env.THEMES.get(key);
		if (!object) continue;
		const dest = `feedback/inbox/${id}/${key.slice("feedback/tmp/".length)}`;
		const payload = await object.arrayBuffer();
		await env.THEMES.put(dest, payload, { httpMetadata: object.httpMetadata });
		await env.THEMES.delete(key);
		const attachmentId = crypto.randomUUID();
		const contentType = object.httpMetadata?.contentType || "application/octet-stream";
		const size = payload.byteLength;
		await env.DB.prepare(
			`INSERT INTO feedback_attachments (id, report_id, r2_key, content_type, bytes) VALUES (?, ?, ?, ?, ?)`,
		)
			.bind(attachmentId, id, dest, contentType, size)
			.run();
		moved.push({ id: attachmentId, key: dest, contentType, bytes: size });
	}
	await bumpStats(env.DB, parsed.kind, parsed.reasonIds, createdAt);
	return jsonResponse({ ok: true, id, attachments: moved.length }, 200, {}, true);
}

async function handleUpload(request: Request, env: Env) {
	if (!takeRateSlot(`att:${clientKey(request)}`)) return jsonResponse({ error: "rate_limited" }, 429);
	const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
	if (!IMAGE_TYPES.has(contentType)) return jsonResponse({ error: "bad_type" }, 400);
	const bytes = await request.arrayBuffer();
	if (bytes.byteLength <= 0 || bytes.byteLength > FEEDBACK_MAX_ATTACHMENT_BYTES) {
		return jsonResponse({ error: "bad_size" }, 400);
	}
	const name = `${crypto.randomUUID()}${extensionFor(contentType)}`;
	const key = `feedback/tmp/${name}`;
	await env.THEMES.put(key, bytes, { httpMetadata: { contentType } });
	return jsonResponse({ ok: true, key, bytes: bytes.byteLength, contentType }, 200, {}, true);
}

function extensionFor(contentType: string) {
	if (contentType === "image/png") return ".png";
	if (contentType === "image/webp") return ".webp";
	if (contentType === "image/gif") return ".gif";
	if (contentType === "image/heic" || contentType === "image/heif") return ".heic";
	return ".jpg";
}

async function handleAdmin(request: Request, env: Env, url: URL) {
	if (!adminOk(request, env)) return jsonResponse({ error: "unauthorized" }, 401, {}, true);
	const path = url.pathname;

	if (path === "/v1/admin/feedback/catalog" && request.method === "GET") {
		const catalog = await loadFeedbackCatalog(env.THEMES);
		return jsonResponse(catalog, 200, { etag: catalog.etag || "" }, true);
	}

	if (path === "/v1/admin/feedback/catalog" && request.method === "PUT") {
		const body = await request.json().catch(() => null);
		const normalized = normalizeFeedbackCatalog(body);
		if (!normalized.ok) return jsonResponse({ error: normalized.error }, 400, {}, true);
		const catalog = withCatalogEtag({ ...normalized.catalog, updatedAt: new Date().toISOString() });
		await writeJson(env.THEMES, FEEDBACK_CATALOG_KEY, catalog);
		return jsonResponse({ ok: true, catalog }, 200, { etag: catalog.etag || "" }, true);
	}

	if (path === "/v1/admin/feedback/stats" && request.method === "GET") {
		return jsonResponse(await loadStats(env.DB, url.searchParams.get("days")), 200, {}, true);
	}

	if (path === "/v1/admin/feedback/reports" && request.method === "GET") {
		return jsonResponse(await listReports(env.DB, url.searchParams), 200, {}, true);
	}

	const reportMatch = path.match(/^\/v1\/admin\/feedback\/reports\/([^/]+)$/);
	if (reportMatch && request.method === "GET") {
		const report = await loadReport(env.DB, decodeURIComponent(reportMatch[1]));
		if (!report) return jsonResponse({ error: "not_found" }, 404, {}, true);
		return jsonResponse(report, 200, {}, true);
	}
	if (reportMatch && request.method === "PATCH") {
		const body = (await request.json().catch(() => null)) as { status?: string } | null;
		const status = String(body?.status || "");
		if (!ALLOWED_STATUS.has(status)) return jsonResponse({ error: "bad_status" }, 400, {}, true);
		const id = decodeURIComponent(reportMatch[1]);
		const result = await env.DB.prepare(`UPDATE feedback_reports SET status = ? WHERE id = ?`).bind(status, id).run();
		if (!result.meta.changes) return jsonResponse({ error: "not_found" }, 404, {}, true);
		return jsonResponse({ ok: true, id, status }, 200, {}, true);
	}

	const attachmentMatch = path.match(/^\/v1\/admin\/feedback\/attachments\/([^/]+)$/);
	if (attachmentMatch && request.method === "GET") {
		const id = decodeURIComponent(attachmentMatch[1]);
		const row = await env.DB.prepare(`SELECT r2_key, content_type FROM feedback_attachments WHERE id = ?`)
			.bind(id)
			.first<{ r2_key: string; content_type: string | null }>();
		if (!row?.r2_key || !row.r2_key.startsWith("feedback/inbox/")) {
			return jsonResponse({ error: "not_found" }, 404, {}, true);
		}
		const object = await env.THEMES.get(row.r2_key);
		if (!object) return jsonResponse({ error: "not_found" }, 404, {}, true);
		const bytes = await object.arrayBuffer();
		return new Response(bytes, {
			headers: {
				"content-type": row.content_type || object.httpMetadata?.contentType || "application/octet-stream",
				"cache-control": "private, max-age=60",
				"access-control-allow-origin": "*",
			},
		});
	}

	return jsonResponse({ error: "not_found" }, 404, {}, true);
}

async function loadStats(db: D1Database, daysRaw: string | null) {
	const days = Math.min(90, Math.max(1, Number(daysRaw) || 30));
	const since = dayKey(Date.now() - (days - 1) * 86400000);
	const since7 = dayKey(Date.now() - 6 * 86400000);
	const totals = await db
		.prepare(`SELECT kind, SUM(count) AS count FROM feedback_daily_stats WHERE day >= ? GROUP BY kind`)
		.bind(since)
		.all<{ kind: string; count: number }>();
	const totals7 = await db
		.prepare(`SELECT kind, SUM(count) AS count FROM feedback_daily_stats WHERE day >= ? GROUP BY kind`)
		.bind(since7)
		.all<{ kind: string; count: number }>();
	const reasons = await db
		.prepare(
			`SELECT reason_id, SUM(count) AS count FROM feedback_daily_stats
			 WHERE day >= ? AND kind != 'up' AND reason_id != '-'
			 GROUP BY reason_id ORDER BY count DESC LIMIT 8`,
		)
		.bind(since)
		.all<{ reason_id: string; count: number }>();
	const open = await db.prepare(`SELECT COUNT(*) AS count FROM feedback_reports WHERE status = 'new'`).first<{ count: number }>();
	const byKind = Object.fromEntries((totals.results || []).map((row) => [row.kind, Number(row.count) || 0]));
	const byKind7 = Object.fromEntries((totals7.results || []).map((row) => [row.kind, Number(row.count) || 0]));
	return {
		days,
		open: Number(open?.count) || 0,
		totals: byKind,
		totals7: byKind7,
		csat: csat(byKind),
		csat7: csat(byKind7),
		topReasons: reasons.results || [],
	};
}

function csat(totals: Record<string, number>) {
	const up = totals.up || 0;
	const down = totals.down || 0;
	const n = up + down;
	return n ? Math.round((up / n) * 1000) / 10 : null;
}

async function listReports(db: D1Database, params: URLSearchParams) {
	const kind = params.get("kind") || "";
	const status = params.get("status") || "";
	const reason = params.get("reason") || "";
	const q = String(params.get("q") || "").trim();
	const limit = Math.min(100, Math.max(1, Number(params.get("limit") || 40)));
	const offset = Math.max(0, Number(params.get("offset") || 0));
	const clauses = ["1 = 1"];
	const binds: Array<string | number> = [];
	if (kind && ALLOWED_KINDS.has(kind)) {
		clauses.push("kind = ?");
		binds.push(kind);
	}
	if (status && ALLOWED_STATUS.has(status)) {
		clauses.push("status = ?");
		binds.push(status);
	}
	if (reason) {
		clauses.push("instr(reason_ids, ?) > 0");
		binds.push(reason);
	}
	if (q) {
		clauses.push("(ifnull(comment,'') || ifnull(other_text,'') || ifnull(contact,'') || ifnull(context_json,'')) LIKE ?");
		binds.push(`%${q}%`);
	}
	const where = clauses.join(" AND ");
	const rows = await db
		.prepare(
			`SELECT * FROM feedback_reports WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		)
		.bind(...binds, limit, offset)
		.all<FeedbackReportRow>();
	const count = await db
		.prepare(`SELECT COUNT(*) AS count FROM feedback_reports WHERE ${where}`)
		.bind(...binds)
		.first<{ count: number }>();
	return { reports: (rows.results || []).map(shapeReport), total: Number(count?.count) || 0, limit, offset };
}

async function loadReport(db: D1Database, id: string) {
	const row = await db.prepare(`SELECT * FROM feedback_reports WHERE id = ?`).bind(id).first<FeedbackReportRow>();
	if (!row) return null;
	const attachments = await db
		.prepare(`SELECT id, r2_key, content_type, bytes FROM feedback_attachments WHERE report_id = ?`)
		.bind(id)
		.all<{ id: string; r2_key: string; content_type: string | null; bytes: number | null }>();
	return {
		...shapeReport(row),
		attachments: (attachments.results || []).map((item) => ({
			id: item.id,
			contentType: item.content_type,
			bytes: item.bytes,
		})),
	};
}

function shapeReport(row: FeedbackReportRow) {
	let reasonIds: string[] = [];
	let context: unknown = null;
	try {
		reasonIds = JSON.parse(row.reason_ids || "[]");
	} catch {
		reasonIds = [];
	}
	try {
		context = row.context_json ? JSON.parse(row.context_json) : null;
	} catch {
		context = row.context_json;
	}
	return {
		id: row.id,
		kind: row.kind,
		status: row.status,
		reasonIds,
		otherText: row.other_text,
		comment: row.comment,
		contact: row.contact,
		userId: row.user_id,
		guestId: row.guest_id,
		context,
		catalogEtag: row.catalog_etag,
		locale: row.app_locale,
		createdAt: row.created_at,
	};
}

/** Feedback CDN + inbox routes. Returns null when the request is not a feedback path. */
export async function handleFeedbackRequest(request: Request, env: Env): Promise<Response | null> {
	if (!env.THEMES || !env.DB) return null;
	const url = new URL(request.url);
	if (!isFeedbackPath(url.pathname)) return null;
	if (request.method === "OPTIONS") return corsPreflight();

	if (url.pathname === "/v1/feedback/catalog" && request.method === "GET") {
		return handlePublicCatalog(request, env);
	}
	if (url.pathname === "/v1/feedback/reports" && request.method === "POST") {
		return handleSubmit(request, env);
	}
	if (url.pathname === "/v1/feedback/attachments" && request.method === "POST") {
		return handleUpload(request, env);
	}
	if (url.pathname.startsWith("/v1/admin/feedback")) {
		return handleAdmin(request, env, url);
	}
	return jsonResponse({ error: "not_found" }, 404, {}, true);
}
