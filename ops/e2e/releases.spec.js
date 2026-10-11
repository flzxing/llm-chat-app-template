import { expect, test } from "@playwright/test";
const content = { titles: { "zh-CN": "让每一次探索，更进一步", "en-US": "A little further. A lot better." }, summaries: { "zh-CN": "更顺畅的创作，更可靠的后台任务，以及恰到好处的细节。", "en-US": "A smoother way to create and explore." }, highlights: { "zh-CN": ["更流畅的对话与创作", "更可靠的后台任务", "精心打磨的细节体验"], "en-US": ["Smoother conversations", "Reliable background work", "Thoughtful details"] }, notes: { "zh-CN": "优化了后台任务恢复。\n修复了长对话中的细节问题。", "en-US": "Improved task recovery.\nPolished conversation details." } };
const report = { packageName: "com.flzxing.lucky", versionCode: 12, versionName: "1.2.0", minSdk: 26, abis: ["arm64-v8a"], certificateSha256: "a".repeat(64), sha256: "b".repeat(64), bytes: 136314880 };
async function mock(page, { status = "draft" } = {}) {
 const writes = [];
 await page.route("**/v1/admin/**", async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (request.headers().authorization !== "Bearer editor-test") { await route.fulfill({ status: 401, json: { error: "unauthorized" } }); return; }
  if (path === "/v1/admin/packs") { await route.fulfill({ json: { packs: [] } }); return; }
  if (path.endsWith("/releases") && request.method() === "GET") { await route.fulfill({ json: { releases: [{ id: "release-12", artifact_id: "artifact-12", artifactId: "artifact-12", version_code: 12, versionName: "1.2.0", status, revision: 1, rollout: 5, min_version_code: 0, bytes: report.bytes, content, report }], artifacts: [{ id: "artifact-12", file_name: "luckytool.apk", size: report.bytes, status: "verified", report }] } }); return; }
  if (path.endsWith("/stats")) { await route.fulfill({ json: { events: [{ release_id: "release-12", kind: "offered", devices: 100 }, { release_id: "release-12", kind: "download_started", devices: 80 }], failures: [{ detail: "storage_insufficient", count: 2 }] } }); return; }
  if (path.endsWith("/audit")) { await route.fulfill({ json: { entries: [{ id: "audit-1", actor: "release-editor", action: "draft_created", reason: "准备更新", created_at: Date.now(), before_json: "null", after_json: JSON.stringify({ revision: 1 }) }] } }); return; }
  writes.push({ path, data: request.postDataJSON(), credential: request.headers()["x-release-credential"] });
  if (path.endsWith("/publish") && request.headers()["x-release-credential"] !== "publish-test") { await route.fulfill({ status: 403, json: { error: "publish_credential_required" } }); return; }
  await route.fulfill({ json: { ok: true, revision: 2 } });
 });
 await page.goto("/ops/releases"); await page.getByTestId("login-token").fill("editor-test"); await page.getByTestId("login-submit").click();
 await expect(page.getByTestId("release-console")).toBeVisible();
 return writes;
}
test("release studio, light/dark phone preview and credential-gated publication", async ({ page }) => {
 const writes = await mock(page);
 await page.screenshot({ path: "test-results/release-center-desktop.png", fullPage: true });
 await page.getByRole("button", { name: /v1.2.0/ }).click();
 await expect(page.getByRole("dialog", { name: "版本工作室 · v1.2.0" })).toBeVisible();
 await expect(page.getByTestId("release-phone")).toContainText("让每一次探索，更进一步");
 const bounds = await page.getByRole("dialog").boundingBox();
 expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
 await page.screenshot({ path: "test-results/release-studio-dark.png", fullPage: false });
 await page.getByLabel("预览主题").selectOption("light"); await page.getByLabel("预览阶段").selectOption("install");
 await expect(page.getByTestId("release-phone")).toContainText("安装更新");
 await page.screenshot({ path: "test-results/release-studio-light.png", fullPage: false });
 await page.getByRole("button", { name: "发布复核 →" }).click();
 await expect(page.getByRole("dialog", { name: "发布复核", exact: true })).toBeVisible();
 await expect(page.getByRole("button", { name: "确认发布修订" })).toBeDisabled();
 await page.getByLabel("操作原因").fill("首轮 5% 灰度发布"); await page.getByLabel("独立发布凭证").fill("publish-test");
 await page.getByRole("button", { name: "确认发布修订" }).click();
 await expect(page.getByRole("status")).toContainText("版本操作已完成");
 expect(writes[0].credential).toBe("publish-test"); expect(writes[0].data.rollout).toBe(5);
 expect(await page.evaluate(() => Object.values({ ...sessionStorage, ...localStorage }).some(v => String(v).includes("publish-test")))).toBe(false);
});
test("forced policy requires a separate acknowledgement and keeps secret out of storage", async ({ page }) => {
 const writes = await mock(page); await page.getByRole("button", { name: /v1.2.0/ }).click();
 await page.getByLabel("最低可用 versionCode").fill("10");
 await page.getByRole("button", { name: "发布复核 →" }).click();
 await page.getByLabel("操作原因").fill("最低版本安全维护"); await page.getByLabel("独立发布凭证").fill("publish-test");
 await expect(page.getByRole("button", { name: "确认发布修订" })).toBeDisabled();
 await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "确认发布修订" }).click();
 await expect(page.getByRole("status")).toBeVisible(); expect(writes[0].data.minVersionCode).toBe(10);
});
test("mobile layout, keyboard dismissal and honest upgrade funnel", async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 }); await mock(page);
 await page.screenshot({ path: "test-results/release-center-mobile.png", fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByRole("button", { name: /v1.2.0/ }).click();
 await page.screenshot({ path: "test-results/release-studio-mobile.png", fullPage: false });
 await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
 await page.getByRole("button", { name: "升级表现", exact: true }).click();
 await expect(page.getByText("80% / 前一阶段 100")).toBeVisible();
 await expect(page.getByText("storage_insufficient")).toBeVisible();
});
test("publication errors preserve the editor and clear the one-use credential", async ({ page }) => {
 await mock(page); await page.getByRole("button", { name: /v1.2.0/ }).click(); await page.getByRole("button", { name: "发布复核 →" }).click();
 await page.getByLabel("操作原因").fill("灰度"); await page.getByLabel("独立发布凭证").fill("wrong"); await page.getByRole("button", { name: "确认发布修订" }).click();
 await expect(page.getByRole("dialog", { name: "发布复核", exact: true }).getByRole("alert")).toContainText("发布凭证无效");
 await expect(page.getByLabel("独立发布凭证")).toHaveValue("");
 await expect(page.getByRole("dialog", { name: "版本工作室 · v1.2.0" })).toBeVisible();
});
