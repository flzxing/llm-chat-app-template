import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStatus,
  draftToBody,
  filterAndSortPacks,
  formatBytes,
  hardDeletePack,
  hidePack,
  isDraftDirty,
  mapAdminError,
  packToDraft,
  publicPreview,
  removePack,
  resolvePackPreview,
  shelfStats,
  shouldSendHardDelete,
  upsertPack,
  validatePackId,
} from "./themeOps.js";

const shelf = [
  { id: "ultraman_tiga", status: "published", audience: "standard", displayName: "Tiga", sort: 10 },
  { id: "chibi_maruko", status: "published", audience: "standard", displayName: "樱桃小丸子", sort: 2, featured: true },
  { id: "atelier_go_alice", status: "hidden", audience: "mature", displayName: "Alice", sort: 1 },
];

test("public preview hides hidden packs", () => {
  const hidden = applyStatus(shelf, "ultraman_tiga", "hidden");
  assert.deepEqual(publicPreview(hidden).map((p) => p.id), ["chibi_maruko"]);
});

test("publish returns pack to public preview", () => {
  const hidden = applyStatus(shelf, "ultraman_tiga", "hidden");
  const published = applyStatus(hidden, "ultraman_tiga", "published");
  assert.ok(publicPreview(published).some((p) => p.id === "ultraman_tiga"));
});

test("cancel confirm does not send hard delete", () => {
  assert.equal(shouldSendHardDelete(false), false);
  assert.equal(shouldSendHardDelete(true), true);
});

test("hard delete removes row only after confirm", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const cancelled = await hardDeletePack("token", "chibi_maruko", false, fetchImpl);
  assert.deepEqual(cancelled, { cancelled: true });
  assert.equal(calls.length, 0);
  await hardDeletePack("token", "chibi_maruko", true, fetchImpl);
  assert.equal(calls[0].url, "/v1/admin/packs/chibi_maruko?hard=1");
  assert.deepEqual(removePack(shelf, "chibi_maruko").map((p) => p.id), ["ultraman_tiga", "atelier_go_alice"]);
});

test("write without token surfaces 401", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) });
  await assert.rejects(() => hidePack("", "ultraman_tiga", fetchImpl), /unauthorized/);
  await assert.rejects(() => upsertPack("", "ops_new", { status: "published" }, fetchImpl), /unauthorized/);
});

test("rewrites retired theme worker preview onto current origin", () => {
  const url = resolvePackPreview(
    {
      id: "chibi_maruko",
      version: 2,
      preview: "https://lucky-themes.zhouxing87808911.workers.dev/assets/packs/chibi_maruko/preview.webp",
    },
    "https://luckyaitool.com",
  );
  assert.equal(url, "https://luckyaitool.com/assets/packs/chibi_maruko/preview.webp?v=2");
});

test("replaces stale asset query when pack version advances", () => {
  const url = resolvePackPreview(
    {
      id: "lol_ahri",
      version: 3,
      preview: "https://luckyaitool.com/assets/packs/lol_ahri/preview.webp?v=2",
    },
    "https://luckyaitool.com",
  );
  assert.equal(url, "https://luckyaitool.com/assets/packs/lol_ahri/preview.webp?v=3");
});

test("filter search status audience and featured-first sort", () => {
  const found = filterAndSortPacks(shelf, { query: "小丸子", status: "published", audience: "standard" });
  assert.deepEqual(found.map((p) => p.id), ["chibi_maruko"]);
  const sorted = filterAndSortPacks(shelf, { sort: "sort" });
  assert.equal(sorted[0].id, "chibi_maruko");
  const hidden = filterAndSortPacks(shelf, { status: "hidden", audience: "mature" });
  assert.deepEqual(hidden.map((p) => p.id), ["atelier_go_alice"]);
});

test("shelf stats and helpers", () => {
  assert.deepEqual(shelfStats(shelf), { total: 3, published: 2, hidden: 1, mature: 1, featured: 1 });
  assert.equal(formatBytes(618128), "603.6 KB");
  assert.equal(validatePackId("chibi_maruko"), true);
  assert.equal(validatePackId("Bad ID"), false);
  assert.equal(mapAdminError(new Error("unauthorized")), "口令无效或已过期，请重新登录。");
  assert.equal(mapAdminError(new Error("timeout")), "网络超时，请重试。");
  const draft = packToDraft(shelf[1]);
  assert.equal(isDraftDirty(draft, shelf[1]), false);
  assert.equal(isDraftDirty({ ...draft, displayName: "改名" }, shelf[1]), true);
  assert.deepEqual(draftToBody({ ...draft, tags: "a, b" }).tags, ["a", "b"]);
});
