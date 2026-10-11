import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
// Exercise the complete HTTP service without unrelated remote AI/Vectorize previews.
export default defineWorkersConfig(async () => ({ test: {
 include: ['test/**/*.spec.ts'], setupFiles: ['./test/apply-migrations.ts', './test/suppress-ba-transaction-rejections.ts'],
 poolOptions: { workers: { wrangler: { configPath: './wrangler.services-test.jsonc' }, miniflare: { bindings: {
  TEST_MIGRATIONS: await readD1Migrations('./migrations'),
  BETTER_AUTH_SECRET: 'test-better-auth-secret-for-vitest-min-32-chars!!', BETTER_AUTH_URL: 'https://example.com',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', CLOUDFLARE_ACCOUNT_ID: 'test_cf_account_id',
  CLOUDFLARE_API_KEY: 'test_cf_api_token', THEME_ADMIN_TOKEN: 'theme-admin-test-token', TOOL_VECTORIZE_AUTO_SYNC: 'false',
 } } } },
} }));
