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

async function mockAdmin(page, writes) {
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
    writes.push({ url, method });
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
