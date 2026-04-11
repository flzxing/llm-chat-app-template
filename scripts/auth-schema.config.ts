/**
 * 仅用于 `npx auth@latest generate --config` 生成 SQL；运行时 Worker 使用 `src/auth.ts` 的 createAuth(env)。
 */
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { username } from "better-auth/plugins";

const db = new Database(":memory:");

export const auth = betterAuth({
	database: db,
	secret:
		"cli-only-secret-must-be-at-least-32-chars-long-for-better-auth",
	baseURL: "http://localhost:8787",
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
	},
	plugins: [bearer(), username()],
});
