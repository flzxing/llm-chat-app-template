import test from "node:test";
import assert from "node:assert/strict";
import {
  OPS_MODULES,
  clearOpsToken,
  isOpenModule,
  moduleByPath,
  opsUrl,
  parseOpsPath,
  persistOpsToken,
  readStoredToken,
} from "./modules.js";

test("only theme management is open", () => {
  assert.deepEqual(
    OPS_MODULES.filter(isOpenModule).map((item) => item.id),
    ["themes"],
  );
  assert.equal(OPS_MODULES.filter((item) => item.status === "soon").length, 3);
});

test("parses ops routes and builds hrefs", () => {
  assert.equal(parseOpsPath("/ops"), "/");
  assert.equal(parseOpsPath("/ops/"), "/");
  assert.equal(parseOpsPath("/ops/themes"), "/themes");
  assert.equal(parseOpsPath("/ops/prompts/"), "/prompts");
  assert.equal(opsUrl("/"), "/ops/");
  assert.equal(opsUrl("/themes"), "/ops/themes");
  assert.equal(moduleByPath("/themes")?.id, "themes");
  assert.equal(moduleByPath("/prompts")?.status, "soon");
});

test("migrates legacy theme-admin token", () => {
  const storage = new Map();
  const api = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  storage.set("lucky-theme-admin-token", "legacy");
  assert.equal(readStoredToken(api), "legacy");
  persistOpsToken("next", api);
  assert.equal(storage.get("lucky-ops-token"), "next");
  assert.equal(storage.has("lucky-theme-admin-token"), false);
  clearOpsToken(api);
  assert.equal(readStoredToken(api), "");
});
