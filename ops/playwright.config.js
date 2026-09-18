import { defineConfig } from "@playwright/test";

const live = Boolean(process.env.OPS_LIVE);

export default defineConfig({
  testDir: "./e2e",
  testIgnore: live ? [] : ["**/live/**"],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: live ? process.env.THEME_ADMIN_BASE || "https://luckyaitool.com" : "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "zh-CN",
  },
  webServer: live
    ? undefined
    : {
        command: "npx vite --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173/ops/",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  reporter: [["list"]],
});
