import { expect, test } from "@playwright/test";

const token = process.env.THEME_ADMIN_TOKEN || "";

async function login(page, value) {
  await page.goto("/theme-admin/");
  await expect(page.getByTestId("login-token")).toBeVisible();
  await page.getByTestId("login-token").fill(value);
  await page.getByTestId("login-submit").click();
}

test("wrong token stays on login with an error", async ({ page }) => {
  await login(page, "definitely-not-the-admin-token");
  await expect(page.getByTestId("login-error")).toContainText("口令");
  await expect(page.getByTestId("login-submit")).toBeVisible();
});

test.describe("authenticated console", () => {
  test.skip(!token, "THEME_ADMIN_TOKEN is required");

  test("login, covers paint, search and detail work", async ({ page }) => {
    await login(page, token);
    await expect(page.getByTestId("console")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("shelf-count")).toContainText("/");
    await expect(page.getByTestId("pack-list").locator("[data-testid^=pack-]").first()).toBeVisible();

    await page.getByTestId("search").fill("小丸子");
    const maruko = page.getByTestId("pack-chibi_maruko");
    await expect(maruko).toBeVisible();
    const cover = maruko.getByTestId("cover");
    await expect(cover).toBeVisible();
    await expect.poll(async () => cover.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

    await maruko.click();
    await expect(page.getByTestId("editor-title")).toContainText("小丸子");
    const hero = page.locator(".cover.hero");
    await expect(hero).toBeVisible();
    await expect.poll(async () => hero.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "下载" })).toHaveAttribute("href", /luckyaitool\.com\/assets\/packs\/chibi_maruko/);
  });

  test("logout returns to the login screen", async ({ page }) => {
    await login(page, token);
    await expect(page.getByTestId("console")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("logout").click();
    await expect(page.getByTestId("login-token")).toBeVisible();
  });
});
