import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	catalogEtag,
	filterCatalogPacks,
	isPublished,
	normalizePack,
	publicCatalog,
	rewriteThemeAssetUrl,
} from "../src/themes";

const sample = [
	{ id: "doraemon", version: 1, audience: "standard", displayName: "Doraemon" },
	{ id: "ultraman_tiga", version: 2, status: "published", audience: "standard", displayName: "Tiga", sort: 10 },
	{ id: "chibi_maruko", version: 1, status: "hidden", audience: "standard", displayName: "Maruko" },
	{ id: "atelier_go_alice", version: 1, status: "published", audience: "mature", displayName: "Alice", sort: 2 },
	{ id: "retired_pack", version: 1, status: "retired", audience: "standard" },
];

describe("theme catalog", () => {
	it("treats legacy packs without status as published", () => {
		expect(isPublished({ id: "x" })).toBe(true);
		expect(normalizePack({ id: "doraemon" }).bundled).toBe(true);
	});

	it("hides hidden and retired from the public shelf", () => {
		expect(filterCatalogPacks(sample, "all").map((p) => p.id)).toEqual([
			"doraemon",
			"atelier_go_alice",
			"ultraman_tiga",
		]);
	});

	it("filters by audience", () => {
		expect(filterCatalogPacks(sample, "standard").map((p) => p.id)).toEqual(["doraemon", "ultraman_tiga"]);
		expect(filterCatalogPacks(sample, "mature").map((p) => p.id)).toEqual(["atelier_go_alice"]);
	});

	it("changes etag when status changes", () => {
		const a = catalogEtag(sample);
		const b = catalogEtag(sample.map((p) => (p.id === "ultraman_tiga" ? { ...p, status: "hidden" } : p)));
		expect(a).not.toBe(b);
	});

	it("changes etag when public host changes", () => {
		expect(catalogEtag(sample, "https://luckyaitool.com")).not.toBe(
			catalogEtag(sample, "https://lucky-themes.zhouxing87808911.workers.dev"),
		);
	});

	it("emits protocol v2", () => {
		const payload = publicCatalog({ packs: sample }, "all");
		expect(payload.schemaVersion).toBe(2);
		expect(payload.fetchedHintSec).toBe(1800);
		expect(payload.etag.startsWith("w/")).toBe(true);
		expect(payload.packs.every((p) => p.status === "published")).toBe(true);
	});

	it("rewrites stored workers.dev pack urls onto the request origin", () => {
		const stored = "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/azur_lane_atago/pack.zip";
		expect(rewriteThemeAssetUrl(stored, "https://luckyaitool.com", "fallback")).toBe(
			"https://luckyaitool.com/assets/packs/azur_lane_atago/pack.zip",
		);
	});
});

describe("theme routes", () => {
	it("serves an empty catalog from R2", async () => {
		await env.THEMES.put("catalog.json", JSON.stringify({ schemaVersion: 2, packs: [] }));
		const response = await SELF.fetch("https://example.com/v1/catalog");
		expect(response.status).toBe(200);
		expect(response.headers.get("x-lucky-theme-protocol")).toBe("2");
		const body = await response.json<{ schemaVersion: number; packs: unknown[] }>();
		expect(body.schemaVersion).toBe(2);
		expect(body.packs).toEqual([]);
	});

	it("rejects admin without token", async () => {
		const response = await SELF.fetch("https://example.com/v1/admin/packs");
		expect(response.status).toBe(401);
	});

	it("lists admin packs with bearer token", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [{ id: "pack_x", displayName: "Probe", status: "published" }],
			}),
		);
		const response = await SELF.fetch("https://example.com/v1/admin/packs", {
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		expect(response.status).toBe(200);
		const body = await response.json<{ packs: Array<{ id: string }> }>();
		expect(body.packs.map((p) => p.id)).toEqual(["pack_x"]);
	});
});
