import { betterAuth } from "better-auth";
import { bearer, captcha, username } from "better-auth/plugins";
import type { Env } from "./types";

function appOrigin(env: Env): string {
	try {
		return new URL(env.BETTER_AUTH_URL).origin;
	} catch {
		return "http://127.0.0.1:8787";
	}
}

export function createAuth(env: Env) {
	return betterAuth({
		database: env.DB,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: [appOrigin(env)],
		emailAndPassword: {
			enabled: true,
			autoSignIn: true,
		},
		plugins: [
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: env.TURNSTILE_SECRET_KEY,
				endpoints: [
					"/sign-up/email",
					"/sign-in/email",
					"/sign-in/username",
					"/request-password-reset",
				],
			}),
			bearer(),
			username(),
		],
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						const now = Math.floor(Date.now() / 1000);
						await env.DB.prepare(
							`INSERT INTO user_profiles (user_id, credits, tier, pro_expires_at, status, is_guest, device_id, created_at, updated_at)
               VALUES (?, 1000, 'free', 0, 'active', 0, NULL, ?, ?)`,
						)
							.bind(user.id, now, now)
							.run();
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						const row = await env.DB.prepare(
							"SELECT status FROM user_profiles WHERE user_id = ?",
						)
							.bind(session.userId)
							.first<{ status: string }>();
						if (row?.status === "banned") return false;
					},
				},
			},
		},
	});
}
