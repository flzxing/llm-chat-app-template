import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	FEEDBACK_CATALOG_KEY,
	feedbackCatalogEtag,
	normalizeFeedbackCatalog,
	seedFeedbackCatalog,
	validateFeedbackSubmit,
	withCatalogEtag,
} from "../src/feedback";

const admin = { authorization: "Bearer theme-admin-test-token" };

function pngBytes() {
	return Uint8Array.from(
		atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
		(ch) => ch.charCodeAt(0),
	);
}

describe("feedback catalog document", () => {
	it("seeds one other reason and a stable etag", () => {
		const seeded = withCatalogEtag(seedFeedbackCatalog(new Date("2026-01-01T00:00:00.000Z")));
		expect(seeded.reasons.filter((item) => item.kind === "other")).toHaveLength(1);
		expect(seeded.etag).toBe(feedbackCatalogEtag(seeded));
		expect(seeded.reasons.map((item) => item.id)).toEqual([
			"ignored_instruction",
			"off_topic",
			"incomplete",
			"hallucination",
			"bad_code",
			"wrong_edit",
			"tool_failed",
			"too_slow",
			"unsafe",
			"other",
		]);
		expect(seeded.copy.sheetTitle?.["zh-CN"]).toBe("哪里不满意？");
		expect(seeded.copy.generalTitle?.["zh-CN"]).toBe("想告诉我们什么？");
	});

	it("rejects catalogs without exactly one other reason", () => {
		const seeded = seedFeedbackCatalog();
		expect(normalizeFeedbackCatalog({ ...seeded, reasons: seeded.reasons.filter((item) => item.kind !== "other") }).ok).toBe(
			false,
		);
	});

	it("requires other text when other is selected", () => {
		const catalog = withCatalogEtag(seedFeedbackCatalog());
		expect(validateFeedbackSubmit({ kind: "down", reasonIds: ["other"] }, catalog)).toEqual({
			ok: false,
			error: "other_required",
		});
		expect(validateFeedbackSubmit({ kind: "up" }, catalog).ok).toBe(true);
		expect(validateFeedbackSubmit({ kind: "down", reasonIds: ["off_topic"] }, catalog).ok).toBe(true);
	});
});

describe("feedback routes", () => {
	it("seeds a public catalog from R2 miss and supports etag 304", async () => {
		await env.THEMES.delete(FEEDBACK_CATALOG_KEY);
		const first = await SELF.fetch("https://example.com/v1/feedback/catalog");
		expect(first.status).toBe(200);
		expect(first.headers.get("x-lucky-feedback-protocol")).toBe("1");
		const body = await first.json<{ reasons: unknown[]; etag: string }>();
		expect(body.reasons.length).toBeGreaterThan(1);
		const etag = first.headers.get("etag") || body.etag;
		const cached = await SELF.fetch("https://example.com/v1/feedback/catalog", {
			headers: { "if-none-match": etag },
		});
		expect(cached.status).toBe(304);
	});

	it("lets guests submit down votes and increments rollup stats", async () => {
		const submitted = await SELF.fetch("https://example.com/v1/feedback/reports", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				kind: "down",
				reasonIds: ["off_topic", "other"],
				otherText: "tool looped",
				context: { sessionId: "s1", messageId: "m1", locale: "zh-CN" },
			}),
		});
		expect(submitted.status).toBe(200);
		const body = await submitted.json<{ ok: boolean; id: string }>();
		expect(body.ok).toBe(true);

		const unauthorized = await SELF.fetch("https://example.com/v1/admin/feedback/stats");
		expect(unauthorized.status).toBe(401);

		const stats = await SELF.fetch("https://example.com/v1/admin/feedback/stats", { headers: admin });
		expect(stats.status).toBe(200);
		const payload = await stats.json<{ totals: Record<string, number>; topReasons: Array<{ reason_id: string }> }>();
		expect(payload.totals.down).toBeGreaterThanOrEqual(1);
		expect(payload.topReasons.some((row) => row.reason_id === "off_topic")).toBe(true);
	});

	it("rejects down without reasons and ignores reasons on up", async () => {
		const missing = await SELF.fetch("https://example.com/v1/feedback/reports", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "down", reasonIds: [] }),
		});
		expect(missing.status).toBe(400);
		const up = await SELF.fetch("https://example.com/v1/feedback/reports", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "up", reasonIds: ["off_topic"] }),
		});
		expect(up.status).toBe(200);
	});

	it("publishes catalog from admin origin PUT without touching theme catalog.json", async () => {
		const beforeTheme = await env.THEMES.get("catalog.json");
		const seed = withCatalogEtag(seedFeedbackCatalog());
		seed.reasons[0].labels["zh-CN"] = "完全跑题";
		const put = await SELF.fetch("https://example.com/v1/admin/feedback/catalog", {
			method: "PUT",
			headers: { ...admin, "content-type": "application/json" },
			body: JSON.stringify(seed),
		});
		expect(put.status).toBe(200);
		const publicCatalog = await SELF.fetch("https://example.com/v1/feedback/catalog");
		const body = await publicCatalog.json<{ reasons: Array<{ id: string; labels: Record<string, string> }> }>();
		expect(body.reasons[0].labels["zh-CN"]).toBe("完全跑题");
		const afterTheme = await env.THEMES.get("catalog.json");
		expect(await afterTheme?.text()).toBe(await beforeTheme?.text());
	});

	it("stores attachments privately and never under /assets/packs", async () => {
		const uploaded = await SELF.fetch("https://example.com/v1/feedback/attachments", {
			method: "POST",
			headers: { "content-type": "image/png" },
			body: pngBytes(),
		});
		expect(uploaded.status).toBe(200);
		const { key } = await uploaded.json<{ key: string }>();
		expect(key.startsWith("feedback/tmp/")).toBe(true);

		const submitted = await SELF.fetch("https://example.com/v1/feedback/reports", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "general", reasonIds: ["tool_failed"], attachmentKeys: [key] }),
		});
		expect(submitted.status).toBe(200);
		const { id } = await submitted.json<{ id: string }>();
		const detail = await SELF.fetch(`https://example.com/v1/admin/feedback/reports/${id}`, { headers: admin });
		const report = await detail.json<{ attachments: Array<{ id: string }> }>();
		expect(report.attachments).toHaveLength(1);

		const publicLeak = await SELF.fetch(`https://example.com/assets/packs/${encodeURIComponent(key)}`);
		expect(publicLeak.status).not.toBe(200);
		await publicLeak.arrayBuffer();

		const stream = await SELF.fetch(
			`https://example.com/v1/admin/feedback/attachments/${report.attachments[0].id}`,
			{ headers: admin },
		);
		expect(stream.status).toBe(200);
		expect(stream.headers.get("content-type")).toContain("image/png");
		expect((await stream.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it("patches inbox status with admin token", async () => {
		const submitted = await SELF.fetch("https://example.com/v1/feedback/reports", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ kind: "general", reasonIds: ["tool_failed"], comment: "chip overflow" }),
		});
		const { id } = await submitted.json<{ id: string }>();
		const patched = await SELF.fetch(`https://example.com/v1/admin/feedback/reports/${id}`, {
			method: "PATCH",
			headers: { ...admin, "content-type": "application/json" },
			body: JSON.stringify({ status: "triaged" }),
		});
		expect(patched.status).toBe(200);
		const listed = await SELF.fetch("https://example.com/v1/admin/feedback/reports?status=triaged&q=overflow", {
			headers: admin,
		});
		const body = await listed.json<{ reports: Array<{ id: string }> }>();
		expect(body.reports.some((row) => row.id === id)).toBe(true);
	});
});
