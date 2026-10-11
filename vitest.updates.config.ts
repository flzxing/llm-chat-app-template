import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
// Update tests use only local D1/R2. Chat AI/Vectorize preview bindings are unrelated.
export default defineWorkersConfig(async () => ({
 test: {
  include: ['test/app-updates.spec.ts'], setupFiles: ['./test/apply-migrations.ts'],
  poolOptions: { workers: { wrangler: { configPath: './wrangler.updates-test.jsonc' },
   miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') } },
  } },
 },
}));
