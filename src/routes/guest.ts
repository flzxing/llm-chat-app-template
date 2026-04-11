/**
 * POST /api/guest/session — 合成账号 + 确定性密码，按 device_id 幂等
 */
import { GUEST_INITIAL_CREDITS, DEVICE_ID_MAX_LEN, DEVICE_ID_MIN_LEN } from "../constants";
import { createAuth } from "../auth";
import {
	authRequest,
	guestEmailForDevice,
	guestPassword,
	guestUsernameForDevice,
} from "../guest-utils";
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

function tokenFromAuthResponse(
	res: Response,
	bodyText: string,
): string | null {
	const header =
		res.headers.get("set-auth-token") ?? res.headers.get("Set-Auth-Token");
	if (header) return header;
	try {
		const j = JSON.parse(bodyText) as { token?: string | null };
		if (j.token && typeof j.token === "string") return j.token;
	} catch {
		/* ignore */
	}
	return null;
}

export async function handleGuestSession(
	request: Request,
	env: Env,
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
			"SELECT user_id, credits, status, is_guest FROM user_profiles WHERE device_id = ?",
		)
			.bind(deviceId)
			.first<{
				user_id: string;
				credits: number;
				status: string;
				is_guest: number;
			}>();

		if (existing) {
			if (existing.is_guest !== 1) {
				return jsonResponse(
					{
						error:
							"This device is linked to a registered account; please log in",
					},
					403,
				);
			}
			if (existing.status !== "active") {
				return jsonResponse({ error: "Account disabled" }, 403);
			}
			const email = await guestEmailForDevice(deviceId);
			const password = await guestPassword(env.BETTER_AUTH_SECRET, deviceId);
			const auth = createAuth(env);
			const res = await auth.handler(
				authRequest(env, "/sign-in/email", { email, password }),
			);
			const text = await res.text();
			const token = tokenFromAuthResponse(res, text);
			if (!res.ok || !token) {
				return jsonResponse({ error: "Guest session failed" }, 500);
			}
			return jsonResponse({
				accessToken: token,
				userId: existing.user_id,
				isGuest: true,
				credits: existing.credits,
			});
		}

		const email = await guestEmailForDevice(deviceId);
		const password = await guestPassword(env.BETTER_AUTH_SECRET, deviceId);
		const username = await guestUsernameForDevice(deviceId);
		const auth = createAuth(env);

		const signUpRes = await auth.handler(
			authRequest(env, "/sign-up/email", {
				email,
				password,
				name: "Guest",
				username,
			}),
		);

		const signUpText = await signUpRes.text();
		if (!signUpRes.ok) {
			console.error("Guest sign-up failed", signUpRes.status, signUpText);
			return jsonResponse({ error: "Guest session failed" }, 500);
		}

		let signUpJson: { token?: string | null; user?: { id: string } };
		try {
			signUpJson = JSON.parse(signUpText) as {
				token?: string | null;
				user?: { id: string };
			};
		} catch {
			return jsonResponse({ error: "Guest session failed" }, 500);
		}

		const userId = signUpJson.user?.id;
		if (!userId) {
			return jsonResponse({ error: "Guest session failed" }, 500);
		}

		await env.DB.prepare(
			`UPDATE user_profiles SET is_guest = 1, device_id = ?, credits = ?, updated_at = ?
       WHERE user_id = ?`,
		)
			.bind(
				deviceId,
				GUEST_INITIAL_CREDITS,
				Math.floor(Date.now() / 1000),
				userId,
			)
			.run();

		const token = tokenFromAuthResponse(signUpRes, signUpText);
		if (!token) {
			return jsonResponse({ error: "Guest session failed" }, 500);
		}

		return jsonResponse({
			accessToken: token,
			userId,
			isGuest: true,
			credits: GUEST_INITIAL_CREDITS,
		});
	} catch (e) {
		console.error("Guest session error", e);
		return jsonResponse({ error: "Guest session failed" }, 500);
	}
}
