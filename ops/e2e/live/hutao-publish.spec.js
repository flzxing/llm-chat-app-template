import { expect, test } from "@playwright/test";

const token = process.env.THEME_ADMIN_TOKEN || "";
const zip = "/Users/zhouxing/Developer/Android/data/luckyagent_theme/packs/hutao/pack.zip";
const preview = "/Users/zhouxing/Developer/Android/data/luckyagent_theme/packs/hutao/preview.webp";

test.describe("publish hutao @live", () => {
  test.skip(!process.env.OPS_LIVE || !token, "OPS_LIVE=1 and THEME_ADMIN_TOKEN are required");
  test.setTimeout(180_000);

  test("ops console can create hutao as a standard pack", async ({ page }) => {
    await page.goto("/ops/");
    await page.getByTestId("login-token").fill(token);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("home")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("module-themes").click();
    await expect(page.getByTestId("console")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "新建主题" }).click();
    await page.getByPlaceholder("chibi_maruko").fill("hutao");
    await page.getByPlaceholder("樱桃小丸子").fill("原神 · 胡桃");
    await page.locator(".editor").getByLabel("受众").selectOption("standard");
    await page.getByLabel("主题包 zip").setInputFiles(zip);
    await page.getByLabel("封面 preview.webp").setInputFiles(preview);
    await page.getByRole("button", { name: "保存并发布目录" }).click();

    await expect(page.getByText("已新建并上架目录").or(page.getByText("已保存并刷新货架"))).toBeVisible({
      timeout: 150_000,
    });

    await page.getByTestId("search").fill("胡桃");
    const row = page.getByTestId("pack-hutao");
    await expect(row).toBeVisible();
    await expect(row).toContainText("在架");
    const cover = row.getByTestId("cover");
    await expect.poll(async () => cover.evaluate((img) => img.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);

    const catalog = await page.request.get("https://luckyaitool.com/v1/catalog?audience=standard");
    expect(catalog.ok()).toBeTruthy();
    const body = await catalog.json();
    const pack = (body.packs || []).find((item) => item.id === "hutao");
    expect(pack, "hutao missing from public standard catalog").toBeTruthy();
    expect(pack.audience).toBe("standard");
    expect(pack.packUrl).toMatch(/luckyaitool\.com\/assets\/packs\/hutao\/pack\.zip/);
    const zipHead = await page.request.get(pack.packUrl);
    expect(zipHead.ok()).toBeTruthy();
    expect(Number(zipHead.headers()["content-length"] || 0)).toBeGreaterThan(1_000_000);
  });
});
