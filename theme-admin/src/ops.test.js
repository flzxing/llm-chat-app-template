import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStatus,
  hardDeletePack,
  hidePack,
  publicPreview,
  removePack,
  shouldSendHardDelete,
  upsertPack,
} from "./ops.js";

const shelf = [
  { id: "ultraman_tiga", status: "published", audience: "standard", displayName: "Tiga" },
  { id: "chibi_maruko", status: "published", audience: "standard", displayName: "Maruko" },
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
  assert.deepEqual(removePack(shelf, "chibi_maruko").map((p) => p.id), ["ultraman_tiga"]);
});

test("write without token surfaces 401", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) });
  await assert.rejects(() => hidePack("", "ultraman_tiga", fetchImpl), /unauthorized/);
  await assert.rejects(() => upsertPack("", "ops_new", { status: "published" }, fetchImpl), /unauthorized/);
});
