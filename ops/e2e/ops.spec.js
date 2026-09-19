import { expect, test } from "@playwright/test";

const TOKEN = "ops-test-token";
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const packs = [
  {
    id: "chibi_maruko",
    displayName: "樱桃小丸子",
    status: "published",
    audience: "standard",
    featured: true,
    version: 2,
    preview: PIXEL,
    packUrl: "https://luckyaitool.com/assets/packs/chibi_maruko/pack.zip",
    packBytes: 120000,
  },
];

async function mockAdmin(page, writes, extras = {}) {
  const catalog = extras.catalog || {
    schemaVersion: 1,
    fallbackLocale: "en-US",
    reasons: [
      { id: "off_topic", kind: "preset", enabled: true, sort: 10, labels: { "zh-CN": "答非所问", "en-US": "Off topic" } },
      { id: "other", kind: "other", enabled: true, sort: 999, labels: { "zh-CN": "其他", "en-US": "Other" } },
    ],
    copy: {},
  };
  const stats = extras.stats || { open: 2, csat: 80, csat7: 90, totals: { up: 8, down: 2, general: 1 }, topReasons: [{ reason_id: "off_topic", count: 2 }] };
  const reports = extras.reports || [
    { id: "rep_1", kind: "down", status: "new", reasonIds: ["off_topic"], otherText: "跑题了", createdAt: Date.now() },
  ];
  await page.route("**/v1/admin/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const auth = request.headers().authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) });
      return;
    }
    if (new URL(url).pathname === "/v1/admin/packs" && method === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ schemaVersion: 2, packs }) });
      return;
    }
    const path = new URL(url).pathname;
    if (path === "/v1/admin/feedback/catalog" && method === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(catalog) });
      return;
    }
    if (path === "/v1/admin/feedback/stats" && method === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(stats) });
      return;
    }
    if (path === "/v1/admin/feedback/reports" && method === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ reports, total: reports.length }) });
      return;
    }
    if (path === "/v1/admin/feedback/reports/rep_1" && method === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...reports[0], attachments: [] }) });
      return;
    }
    writes.push({ url, method, path });
    if (path === "/v1/admin/feedback/catalog" && method === "PUT") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, catalog }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, count: packs.length, pack: packs[0] }),
    });
  });
}

async function login(page, value = TOKEN) {
  await page.goto("/ops/");
  await expect(page.getByTestId("login-token")).toBeVisible();
  await page.getByTestId("login-token").fill(value);
  await page.getByTestId("login-submit").click();
}

test("wrong token stays on login with an error", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page, "definitely-not-the-admin-token");
  await expect(page.getByTestId("login-error")).toContainText("口令");
  await expect(page.getByTestId("login-submit")).toBeVisible();
});

test("login lands on the home deck, not the theme console", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page);
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("module-themes")).toBeVisible();
  await expect(page.getByTestId("module-feedback")).toBeVisible();
  await expect(page.getByTestId("console")).toHaveCount(0);
});

test("locked modules open coming soon and never write", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page);
  writes.length = 0;
  await page.getByTestId("module-prompts").click();
  await expect(page.getByTestId("coming-prompts")).toBeVisible();
  expect(writes.filter((item) => item.method !== "GET")).toEqual([]);
});

test("theme module can search, open a pack, hide it, and log out", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page);
  await page.getByTestId("module-themes").click();
  await expect(page.getByTestId("console")).toBeVisible();
  await expect(page.getByTestId("shelf-count")).toContainText("/");
  await page.getByTestId("search").fill("小丸子");
  const maruko = page.getByTestId("pack-chibi_maruko");
  await expect(maruko).toBeVisible();
  const cover = maruko.getByTestId("cover");
  await expect.poll(async () => cover.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await maruko.click();
  await expect(page.getByTestId("editor-title")).toContainText("小丸子");
  await expect(page.getByRole("link", { name: "下载" })).toHaveAttribute("href", /\/assets\/packs\/chibi_maruko\/pack\.zip/);
  await page.getByRole("button", { name: "取消置顶" }).click();
  await page.getByRole("button", { name: "下架" }).click();
  expect(writes.some((item) => item.method === "DELETE" || item.method === "PUT")).toBeTruthy();
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login-token")).toBeVisible();
});

test("unsaved editor asks before leaving a pack", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page);
  await page.getByTestId("module-themes").click();
  await page.getByTestId("pack-chibi_maruko").click();
  await page.getByPlaceholder("樱桃小丸子").fill("改名");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "新建主题" }).click();
  await expect(page.getByTestId("editor-title")).toContainText("小丸子");
});

test("feedback module can publish reasons and filter inbox", async ({ page }) => {
  const writes = [];
  await mockAdmin(page, writes);
  await login(page);
  await page.getByTestId("module-feedback").click();
  await expect(page.getByTestId("feedback-console")).toBeVisible();
  await page.getByTestId("feedback-tab-reasons").click();
  await expect(page.getByTestId("reason-row-off_topic")).toBeVisible();
  await page.getByTestId("reason-save").click();
  expect(writes.some((item) => item.method === "PUT" && String(item.path).includes("/v1/admin/feedback/catalog"))).toBeTruthy();
  await page.getByTestId("feedback-tab-inbox").click();
  await expect(page.getByTestId("inbox-row-rep_1")).toBeVisible();
  await page.getByTestId("inbox-search").fill("跑题");
  await expect(page.getByTestId("inbox-row-rep_1")).toBeVisible();
});
