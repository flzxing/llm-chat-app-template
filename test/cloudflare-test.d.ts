import type { D1Migration } from "cloudflare:test";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		TEST_MIGRATIONS: D1Migration[];
		BETTER_AUTH_SECRET: string;
		BETTER_AUTH_URL: string;
	}
}
