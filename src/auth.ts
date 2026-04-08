/**
 * 密码哈希、Refresh Token 摘要、JWT 签发与校验
 */
import { SignJWT, jwtVerify } from "jose";
import { AUTH_CONFIG } from "./constants";
import type { Env } from "./types";
import { hashToken } from "./crypto";

export type AccessTokenVerifyResult =
	| { ok: true; userId: string }
	| { ok: false; error: string; status: number };

export async function generateTokenPair(
	userId: string,
	secret: Uint8Array,
	env: Env,
	options?: { deviceInfo?: string | null },
): Promise<{ accessToken: string; refreshToken: string }> {
	const accessToken = await new SignJWT({ userId })
		.setProtectedHeader({ alg: AUTH_CONFIG.JWT_ALG })
		.setIssuedAt()
		.setIssuer(AUTH_CONFIG.ISSUER)
		.setAudience(AUTH_CONFIG.AUDIENCE)
		.setExpirationTime(AUTH_CONFIG.ACCESS_TOKEN_EXP)
		.sign(secret);

	const refreshToken = crypto.randomUUID();
	const hashedToken = await hashToken(refreshToken);
	const expiresAt =
		Math.floor(Date.now() / 1000) + AUTH_CONFIG.REFRESH_TOKEN_EXP_DAYS * 86400;
	const now = Math.floor(Date.now() / 1000);
	const deviceInfo = options?.deviceInfo ?? null;

	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, expires_at) VALUES (?, ?, ?, ?, ?)",
		).bind(crypto.randomUUID(), userId, hashedToken, deviceInfo, expiresAt),
		env.DB.prepare(
			"DELETE FROM refresh_tokens WHERE user_id = ? AND (expires_at < ? OR (revoked_at > 0 AND revoked_at < ?))",
		).bind(userId, now, now - 3600),
	]);

	return { accessToken, refreshToken };
}

export async function verifyAccessToken(
	request: Request,
	secret: Uint8Array,
): Promise<AccessTokenVerifyResult> {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return { ok: false, error: "Unauthorized", status: 401 };
	}
	try {
		const token = authHeader.slice(7);
		const { payload } = await jwtVerify(token, secret, {
			issuer: AUTH_CONFIG.ISSUER,
			audience: AUTH_CONFIG.AUDIENCE,
		});
		const userId = payload.userId;
		if (typeof userId !== "string" || !userId) {
			return { ok: false, error: "Invalid token", status: 401 };
		}
		return { ok: true, userId };
	} catch {
		return { ok: false, error: "Token expired", status: 401 };
	}
}
