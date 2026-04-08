/**
 * POST /api/guest/session — 按 device_id 幂等创建或恢复游客会话（JWT + refresh）
 */
import { GUEST_INITIAL_CREDITS, DEVICE_ID_MAX_LEN, DEVICE_ID_MIN_LEN } from "../constants";
import { generateTokenPair } from "../auth";
import { jsonResponse } from "../http";
import type { Env } from "../types";

const DEVICE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isValidDeviceId(id: string): boolean {
	return (
		id.length >= DEVICE_ID_MIN_LEN &&
		id.length <= DEVICE_ID_MAX_LEN &&
		DEVICE_ID_RE.test(id)
	);
}

export async function handleGuestSession(
	request: Request,
	env: Env,
	secret: Uint8Array,
): Promise<Response> {
	try {
		const body = (await request.json()) as { device_id?: string };
		const deviceId = body.device_id?.trim();
		if (!deviceId || !isValidDeviceId(deviceId)) {
			return jsonResponse(
				{
					error: `device_id required: ${DEVICE_ID_MIN_LEN}-${DEVICE_ID_MAX_LEN} chars, [a-zA-Z0-9_-]`,
				},
				400,
			);
		}

		const existing = await env.DB.prepare(
			"SELECT id, is_guest, status, credits FROM users WHERE device_id = ?",
		)
			.bind(deviceId)
			.first<{
				id: string;
				is_guest: number;
				status: string;
				credits: number;
			}>();

		if (existing) {
			if (existing.is_guest !== 1) {
				return jsonResponse(
					{ error: "This device is linked to a registered account; please log in" },
					403,
				);
			}
			if (existing.status !== "active") {
				return jsonResponse({ error: "Account disabled" }, 403);
			}
			const tokens = await generateTokenPair(existing.id, secret, env, {
				deviceInfo: `guest:${deviceId.slice(0, 64)}`,
			});
			return jsonResponse({
				...tokens,
				userId: existing.id,
				isGuest: true,
				credits: existing.credits,
			});
		}

		const userId = "u_" + crypto.randomUUID().replace(/-/g, "");
		const now = Math.floor(Date.now() / 1000);

		await env.DB.prepare(
			`INSERT INTO users (id, device_id, username, password_hash, is_guest, credits, tier, pro_expires_at, status, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 1, ?, 'free', 0, 'active', ?, ?)`,
		)
			.bind(userId, deviceId, GUEST_INITIAL_CREDITS, now, now)
			.run();

		const tokens = await generateTokenPair(userId, secret, env, {
			deviceInfo: `guest:${deviceId.slice(0, 64)}`,
		});
		return jsonResponse({
			...tokens,
			userId,
			isGuest: true,
			credits: GUEST_INITIAL_CREDITS,
		});
	} catch {
		return jsonResponse({ error: "Guest session failed" }, 500);
	}
}
