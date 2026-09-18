import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { legacyThemeAdminLocation, shouldServeOpsSpa } from "../src/http";
import {
	catalogEtag,
	inferThemeIpTags,
	mergeThemeIpTags,
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

	it("changes etag when tags change", () => {
		const a = catalogEtag([{ id: "genshin_eula", tags: [] }]);
		const b = catalogEtag([{ id: "genshin_eula", tags: ["genshin"] }]);
		expect(a).not.toBe(b);
	});

	it("infers curated IP tags from pack ids and merges without dropping extras", () => {
		expect(inferThemeIpTags("honor_daji")).toEqual(["honor_of_kings"]);
		expect(inferThemeIpTags("hsr_firefly")).toEqual(["honkai_star_rail"]);
		expect(inferThemeIpTags("honkai_seele")).toEqual(["honkai_impact"]);
		expect(inferThemeIpTags("atelier_go_liyue")).toEqual([]);
		expect(mergeThemeIpTags("genshin_eula", ["liyue", "eula"])).toEqual(["liyue", "eula", "genshin"]);
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

	it("upserts metadata, hides from the public catalog, then restores it", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [{ id: "probe", displayName: "Probe", status: "published", audience: "standard" }],
			}),
		);
		const hidden = await SELF.fetch("https://example.com/v1/admin/packs/probe", {
			method: "PUT",
			headers: {
				authorization: "Bearer theme-admin-test-token",
				"content-type": "application/json",
			},
			body: JSON.stringify({ displayName: "Renamed", status: "hidden", featured: true }),
		});
		expect(hidden.status).toBe(200);
		const catalog = await SELF.fetch("https://example.com/v1/catalog?audience=standard");
		const publicBody = await catalog.json<{ packs: Array<{ id: string }> }>();
		expect(publicBody.packs.find((pack) => pack.id === "probe")).toBeUndefined();

		const listed = await SELF.fetch("https://example.com/v1/admin/packs", {
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		const adminBody = await listed.json<{ packs: Array<{ displayName?: string; featured?: boolean; status?: string }> }>();
		expect(adminBody.packs[0].displayName).toBe("Renamed");
		expect(adminBody.packs[0].featured).toBe(true);
		expect(adminBody.packs[0].status).toBe("hidden");

		const shown = await SELF.fetch("https://example.com/v1/admin/packs/probe", {
			method: "PUT",
			headers: {
				authorization: "Bearer theme-admin-test-token",
				"content-type": "application/json",
			},
			body: JSON.stringify({ status: "published" }),
		});
		expect(shown.status).toBe(200);
		const again = await SELF.fetch("https://example.com/v1/catalog?audience=standard");
		const restored = await again.json<{ packs: Array<{ id: string }> }>();
		expect(restored.packs.some((pack) => pack.id === "probe")).toBe(true);
	});

	it("soft-hides with DELETE so the public catalog drops the pack", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [{ id: "gone", displayName: "Gone", status: "published", audience: "standard" }],
			}),
		);
		const hide = await SELF.fetch("https://example.com/v1/admin/packs/gone", {
			method: "DELETE",
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		expect(hide.status).toBe(200);
		const hiddenCatalog = await SELF.fetch("https://example.com/v1/catalog");
		const hiddenBody = await hiddenCatalog.json<{ packs: Array<{ id: string }> }>();
		expect(hiddenBody.packs.find((pack) => pack.id === "gone")).toBeUndefined();
		const listed = await SELF.fetch("https://example.com/v1/admin/packs", {
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		const adminBody = await listed.json<{ packs: Array<{ id: string; status?: string }> }>();
		expect(adminBody.packs.find((pack) => pack.id === "gone")?.status).toBe("hidden");
	});

	it("hard delete removes the pack from catalog.json", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [{ id: "gone", displayName: "Gone", status: "hidden", audience: "standard" }],
			}),
		);
		const hard = await SELF.fetch("https://example.com/v1/admin/packs/gone?hard=1", {
			method: "DELETE",
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		expect(hard.status).toBe(200);
		const body = await hard.json<{ ok?: boolean; id?: string }>();
		expect(body.ok).toBe(true);
		expect(body.id).toBe("gone");
		const catalogObject = await env.THEMES.get("catalog.json");
		const catalog = JSON.parse((await catalogObject!.text()) as string) as { packs: Array<{ id: string }> };
		expect(catalog.packs.find((pack) => pack.id === "gone")).toBeUndefined();
	});

	it("rebuilds catalog origins and rejects traversal plus anonymous writes", async () => {
		await env.THEMES.put(
			"catalog.json",
			JSON.stringify({
				schemaVersion: 2,
				packs: [
					{
						id: "lol_ahri",
						version: 2,
						status: "published",
						preview: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/lol_ahri/preview.webp",
						packUrl: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/lol_ahri/pack.zip",
					},
				],
			}),
		);
		const rebuild = await SELF.fetch("https://example.com/v1/admin/catalog/rebuild", {
			method: "POST",
			headers: { authorization: "Bearer theme-admin-test-token" },
		});
		expect(rebuild.status).toBe(200);
		const rebuilt = JSON.parse(await (await env.THEMES.get("catalog.json"))!.text()) as {
			packs: Array<{ preview?: string; packUrl?: string }>;
		};
		expect(rebuilt.packs[0].preview).toContain("https://example.com/assets/packs/lol_ahri/preview.webp");
		expect(rebuilt.packs[0].packUrl).toContain("https://example.com/assets/packs/lol_ahri/pack.zip");

		const escape = await SELF.fetch("https://example.com/v1/admin/packs/lol_ahri/assets/bad..key.webp", {
			method: "PUT",
			headers: { authorization: "Bearer theme-admin-test-token", "content-type": "text/plain" },
			body: "nope",
		});
		expect(escape.status).toBe(400);

		for (const init of [
			{ path: "/v1/admin/packs/x", method: "PUT" },
			{ path: "/v1/admin/packs/x", method: "DELETE" },
			{ path: "/v1/admin/catalog/rebuild", method: "POST" },
		]) {
			const response = await SELF.fetch(`https://example.com${init.path}`, { method: init.method });
			expect(response.status).toBe(401);
		}
	});

	it("redirects the retired theme-admin path onto /ops/", async () => {
		const response = await SELF.fetch("https://example.com/theme-admin/", { redirect: "manual" });
		expect(response.status).toBe(301);
		expect(new URL(response.headers.get("location") || "", "https://example.com").pathname).toBe("/ops/");
	});
});

describe("ops console routing", () => {
	it("rewrites legacy theme-admin URLs and only SPA-falls-back extensionless /ops paths", () => {
		expect(legacyThemeAdminLocation(new URL("https://luckyaitool.com/theme-admin"))).toBe("/ops/");
		expect(legacyThemeAdminLocation(new URL("https://luckyaitool.com/theme-admin/themes"))).toBe("/ops/themes");
		expect(legacyThemeAdminLocation(new URL("https://luckyaitool.com/ops/"))).toBeNull();
		expect(shouldServeOpsSpa("/ops")).toBe(true);
		expect(shouldServeOpsSpa("/ops/themes")).toBe(true);
		expect(shouldServeOpsSpa("/ops/assets/index.js")).toBe(false);
		expect(shouldServeOpsSpa("/chat.js")).toBe(false);
	});
});
