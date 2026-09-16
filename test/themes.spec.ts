import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	catalogEtag,
	filterCatalogPacks,
	isPublished,
	isZipArchive,
	nextPackVersion,
	normalizePack,
	publicCatalog,
	rewritePackAssets,
	rewriteThemeAssetUrl,
	withAssetCacheBust,
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

	it("changes etag when zip sha or size changes without a version bump", () => {
		const a = catalogEtag([{ id: "lol_ahri", version: 2, sha256: "aaa", packBytes: 10 }]);
		const b = catalogEtag([{ id: "lol_ahri", version: 2, sha256: "bbb", packBytes: 11 }]);
		expect(a).not.toBe(b);
	});

	it("bumps pack version only when the zip digest changes", () => {
		expect(nextPackVersion({ id: "x" }, "aaa")).toBe(1);
		expect(nextPackVersion({ id: "x", version: 2, sha256: "aaa" }, "aaa")).toBe(2);
		expect(nextPackVersion({ id: "x", version: 2, sha256: "aaa" }, "bbb")).toBe(3);
		expect(isZipArchive(new Uint8Array([0x50, 0x4b, ...new Uint8Array(20)]).buffer)).toBe(true);
		expect(isZipArchive(new Uint8Array([0, 1, 2]).buffer)).toBe(false);
	});

	it("replaces stale cache-bust query when version advances", () => {
		expect(withAssetCacheBust("https://luckyaitool.com/assets/packs/lol_ahri/pack.zip?v=2", 3)).toBe(
			"https://luckyaitool.com/assets/packs/lol_ahri/pack.zip?v=3",
		);
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

	it("rewrites admin pack preview and zip onto the request origin", () => {
		const pack = rewritePackAssets(
			{
				id: "chibi_maruko",
				version: 2,
				preview: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/chibi_maruko/preview.webp",
				packUrl: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/chibi_maruko/pack.zip",
			},
			"https://luckyaitool.com",
		);
		expect(pack.preview).toBe("https://luckyaitool.com/assets/packs/chibi_maruko/preview.webp?v=2");
		expect(pack.packUrl).toBe("https://luckyaitool.com/assets/packs/chibi_maruko/pack.zip?v=2");
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
				packs: [
					{
						id: "pack_x",
						displayName: "Probe",
						status: "published",
						preview: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/pack_x/preview.webp",
					},
				],
			}),
		);
		const response = await SELF.fetch("https://example.com/v1/admin/packs", {
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		expect(response.status).toBe(200);
		const body = await response.json<{ packs: Array<{ id: string; preview?: string }> }>();
		expect(body.packs.map((p) => p.id)).toEqual(["pack_x"]);
		expect(body.packs[0].preview).toBe("https://example.com/assets/packs/pack_x/preview.webp?v=1");
	});

	it("rejects a non-zip admin upload and bumps version when the digest changes", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [{ id: "lol_ahri", version: 2, sha256: "old", status: "published" }],
			}),
		);
		const bad = await SELF.fetch("https://example.com/v1/admin/packs/lol_ahri/zip", {
			method: "PUT",
			headers: { authorization: "Bearer theme-admin-test-token" },
			body: "not-a-zip",
		});
		expect(bad.status).toBe(400);
		const zip = new Uint8Array(32);
		zip[0] = 0x50;
		zip[1] = 0x4b;
		const ok = await SELF.fetch("https://example.com/v1/admin/packs/lol_ahri/zip", {
			method: "PUT",
			headers: { authorization: "Bearer theme-admin-test-token", "content-type": "application/zip" },
			body: zip,
		});
		expect(ok.status).toBe(200);
		const body = await ok.json<{ version: number; packUrl: string }>();
		expect(body.version).toBe(3);
		expect(body.packUrl).toContain("?v=3");
	});
});
