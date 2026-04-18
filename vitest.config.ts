import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		test: {
			include: ["test/**/*.spec.ts"],
			setupFiles: [
				"./test/apply-migrations.ts",
				"./test/suppress-ba-transaction-rejections.ts",
			],
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
					miniflare: {
						bindings: {
							TEST_MIGRATIONS: migrations,
							BETTER_AUTH_SECRET:
								"test-better-auth-secret-for-vitest-min-32-chars!!",
							BETTER_AUTH_URL: "https://example.com",
							TURNSTILE_SECRET_KEY:
								"1x0000000000000000000000000000000AA",
						},
					},
				},
			},
		},
	};
});
