/**
 * /api/register、/api/login、/api/refresh
 * 注册：无 Authorization 时新建正式用户；Bearer 游客 access 时原地升级为正式用户（保留 userId / 积分 / device_id）。
 */
import { AUTH_CONFIG } from "../constants";
import { generateTokenPair, verifyAccessToken } from "../auth";
import { hashPassword, hashToken } from "../crypto";
import { jsonResponse } from "../http";
import type { Env } from "../types";

export async function handleRegister(
	request: Request,
	env: Env,
	secret: Uint8Array,
): Promise<Response> {
	try {
		const authHeader = request.headers.get("Authorization");
		let upgradeUserId: string | null = null;

		if (authHeader?.startsWith("Bearer ") && authHeader.length > "Bearer ".length) {
			const auth = await verifyAccessToken(request, secret);
			if (!auth.ok) {
				return jsonResponse({ error: auth.error }, auth.status);
			}
			const row = await env.DB.prepare(
				"SELECT is_guest FROM users WHERE id = ?",
			)
				.bind(auth.userId)
				.first<{ is_guest: number }>();
			if (!row) {
				return jsonResponse({ error: "Invalid token" }, 401);
			}
			if (row.is_guest !== 1) {
				return jsonResponse({ error: "Already registered" }, 400);
			}
			upgradeUserId = auth.userId;
		}

		const body = (await request.json()) as {
			username?: string;
			password?: string;
			device_info?: string;
		};
		const { username, password, device_info } = body;
		if (!username || !password || password.length < 6) {
			return jsonResponse(
				{ error: "Username and password (min 6 chars) are required" },
				400,
			);
		}

		const nameTaken = await env.DB.prepare(
			"SELECT id FROM users WHERE username = ?",
		)
			.bind(username)
			.first<{ id: string }>();
		if (nameTaken && nameTaken.id !== upgradeUserId) {
			return jsonResponse({ error: "Username already exists" }, 409);
		}

		const passwordHash = await hashPassword(password);
		const now = Math.floor(Date.now() / 1000);

		if (upgradeUserId) {
			const upd = await env.DB.prepare(
				`UPDATE users SET username = ?, password_hash = ?, is_guest = 0, updated_at = ?
         WHERE id = ? AND is_guest = 1`,
			)
				.bind(username, passwordHash, now, upgradeUserId)
				.run();
			if (!upd.success || (upd.meta?.changes ?? 0) < 1) {
				return jsonResponse({ error: "Upgrade failed" }, 409);
			}

			const tokens = await generateTokenPair(upgradeUserId, secret, env, {
				deviceInfo: device_info ?? null,
			});
			return jsonResponse({
				...tokens,
				userId: upgradeUserId,
				username,
				upgraded: true,
			});
		}

		const userId = "u_" + crypto.randomUUID().replace(/-/g, "");
		await env.DB.prepare(
			`INSERT INTO users (id, username, password_hash, is_guest, credits, tier, pro_expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, 0, 1000, 'free', 0, 'active', ?, ?)`,
		)
			.bind(userId, username, passwordHash, now, now)
			.run();

		const tokens = await generateTokenPair(userId, secret, env, {
			deviceInfo: device_info ?? null,
		});
		return jsonResponse({ ...tokens, userId, username, upgraded: false });
	} catch (error) {
		console.error("Register failed", {
			error,
			path: "/api/register",
			method: request.method,
		});
		return jsonResponse({ error: "Registration failed" }, 500);
	}
}

export async function handleLogin(
	request: Request,
	env: Env,
	secret: Uint8Array,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			username?: string;
			password?: string;
			device_info?: string;
		};
		const { username, password, device_info } = body;
		if (!username || !password) {
			return jsonResponse({ error: "Missing credentials" }, 400);
		}

		const user = await env.DB.prepare(
			"SELECT id, password_hash, status FROM users WHERE username = ? AND password_hash IS NOT NULL",
		)
			.bind(username)
			.first<{
				id: string;
				password_hash: string;
				status: string;
			}>();

		if (!user) {
			return jsonResponse({ error: "Invalid username or password" }, 401);
		}

		if (user.status !== "active") {
			return jsonResponse({ error: "Account disabled" }, 403);
		}

		const storedHashString = user.password_hash;
		const salt = storedHashString.split(":")[0];
		const attemptHashString = await hashPassword(password, salt);

		if (attemptHashString !== storedHashString) {
			return jsonResponse({ error: "Invalid username or password" }, 401);
		}

		const tokens = await generateTokenPair(user.id, secret, env, {
			deviceInfo: device_info ?? null,
		});
		return jsonResponse({ ...tokens, userId: user.id });
	} catch (error) {
		console.error("Login failed", {
			error,
			path: "/api/login",
			method: request.method,
		});
		return jsonResponse({ error: "Login failed" }, 500);
	}
}

export async function handleRefresh(
	request: Request,
	env: Env,
	secret: Uint8Array,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			refreshToken?: string;
			device_info?: string;
		};
		const { refreshToken, device_info } = body;
		if (!refreshToken) throw new Error("missing refresh");

		const hashedToken = await hashToken(refreshToken);
		const now = Math.floor(Date.now() / 1000);

		const stored = await env.DB.prepare(
			`SELECT user_id, revoked_at FROM refresh_tokens
       WHERE token_hash = ? AND expires_at > ? AND (revoked_at = 0 OR revoked_at > ?)`,
		)
			.bind(hashedToken, now, now - AUTH_CONFIG.GRACE_PERIOD_SEC)
			.first<{ user_id: string; revoked_at: number }>();

		if (!stored) {
			return jsonResponse({ error: "Session expired" }, 403);
		}

		if (stored.revoked_at === 0) {
			await env.DB.prepare(
				"UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?",
			)
				.bind(now, hashedToken)
				.run();
		}

		const tokens = await generateTokenPair(stored.user_id, secret, env, {
			deviceInfo: device_info ?? null,
		});
		return jsonResponse(tokens);
	} catch (error) {
		console.error("Refresh failed", {
			error,
			path: "/api/refresh",
			method: request.method,
		});
		return jsonResponse({ error: "Invalid refresh request" }, 401);
	}
}
