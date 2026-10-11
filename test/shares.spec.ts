import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createShare, listShares, revokeShare, renderShare, SHARE_MAX_BYTES } from "../src/shares";

const snapshot = { version: 1, title: "中文分享", messages: [{ id: "local-only-message", role: "assistant" as const, createdAt: 1, markdown: "# 你好\n\n```kt\nval x = 1\n```\n\n| A | B |\n|---|---|\n|1|2|" }] };
async function owner() {
 const id = crypto.randomUUID();
 await env.DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)')
  .bind(id, "Tester", `${id}@example.com`, Date.now(), Date.now()).run();
 return id;
}
const request = (requestId: string, value: unknown = snapshot) => new Request("https://example.com/api/shares", {
 method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, snapshot: value }),
});
describe("conversation share snapshots", () => {
 it("accepts an authenticated guest bearer session for the complete HTTP flow", async () => {
  const user = await owner(), token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO "session" (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)')
   .bind(crypto.randomUUID(), Date.now() + 3600000, token, Date.now(), Date.now(), user).run();
  await env.DB.prepare("INSERT INTO user_profiles(user_id,is_guest,status) VALUES (?,1,'active')").bind(user).run();
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const created = await SELF.fetch("https://example.com/api/shares", { method: "POST", headers, body: JSON.stringify({ requestId: crypto.randomUUID(), snapshot }) });
  expect(created.status).toBe(201);
  const share = await created.json<{ id: string; url: string }>();
  expect((await SELF.fetch("https://example.com/api/shares", { headers })).status).toBe(200);
  expect((await SELF.fetch(share.url)).status).toBe(200);
  expect((await SELF.fetch(`https://example.com/api/shares/${share.id}`, { method: "DELETE", headers })).status).toBe(200);
  expect((await SELF.fetch(share.url)).status).toBe(404);
 });
 it("requires authentication on create, list and revoke", async () => {
  for (const [path, method] of [["/api/shares", "POST"], ["/api/shares", "GET"], ["/api/shares/unknown", "DELETE"]]) {
   expect((await SELF.fetch(`https://example.com${path}`, { method })).status).toBe(401);
  }
 });
 it("creates local-only snapshots, retries idempotently and publicly renders without login", async () => {
  const user = await owner(), key = crypto.randomUUID();
  const first = await createShare(request(key), env, user);
  expect(first.status).toBe(201);
  const share = await first.json<{ id: string; url: string }>();
  expect(share.url.split("/").pop()).toMatch(/^[a-f0-9]{48}$/);
  expect(await (await createShare(request(key), env, user)).json()).toMatchObject(share);
  expect((await createShare(request(key, { ...snapshot, title: "Changed" }), env, user)).status).toBe(409);
  const page = await SELF.fetch(share.url);
  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toContain("no-store");
  expect(page.headers.get("x-robots-tag")).toContain("noindex");
  const html = await page.text();
  expect(html).toContain("你好"); expect(html).toContain("<table>"); expect(html).toContain("<code class=\"language-kt\">");
  const listing = await (await listShares(new Request("https://example.com/api/shares"), env, user)).json<{ items: unknown[] }>();
  expect(listing.items).toHaveLength(1);
  expect((await revokeShare(env, await owner(), share.id)).status).toBe(404);
  expect((await revokeShare(env, user, share.id)).status).toBe(200);
  expect((await SELF.fetch(share.url)).status).toBe(404);
  expect((await createShare(request(key), env, user)).status).toBe(409);
 });
 it("rejects oversized streamed bodies and system/internal payloads", async () => {
  const user = await owner();
  expect((await createShare(request(crypto.randomUUID(), { ...snapshot, messages: [{ ...snapshot.messages[0], role: "system" }] }), env, user)).status).toBe(400);
  expect((await createShare(request(crypto.randomUUID(), { ...snapshot, messages: [{ ...snapshot.messages[0], markdown: "中".repeat(SHARE_MAX_BYTES) }] }), env, user)).status).toBe(413);
 });
 it("escapes raw HTML, drops images and prevents executable links", () => {
  const html = renderShare({ ...snapshot, title: "<script>alert(1)</script>", messages: [{ ...snapshot.messages[0], markdown: '<script>alert(1)</script>\n![secret](https://tracking.example/pixel)\n[x](javascript:alert(1))\n[local](file:///data/private)' }] });
  expect(html).not.toContain("<script>"); expect(html).not.toContain("<img");
  expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('href="file:');
 });
});
