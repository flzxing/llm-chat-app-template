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

/** Cloudflare Turnstile 文档「Test sitekeys」——仅用于前端 data-sitekey，禁止作为 turnstile_token */
const CF_TURNSTILE_TEST_SITEKEYS = new Set([
	"1x00000000000000000000AA",
	"2x00000000000000000000AB",
	"1x00000000000000000000BB",
	"2x00000000000000000000BB",
	"3x00000000000000000000FF",
]);

/** 文档「Test secret keys」——仅服务端 siteverify，禁止作为 turnstile_token */
const CF_TURNSTILE_TEST_SECRETS = new Set([
	"1x0000000000000000000000000000000AA",
	"2x0000000000000000000000000000000AA",
	"3x0000000000000000000000000000000AA",
]);

function mistakenTurnstileTokenHint(token: string): string | null {
	if (CF_TURNSTILE_TEST_SITEKEYS.has(token)) {
		return (
			"turnstile_token must be cf-turnstile-response from the widget after it runs, not the Site Key " +
				"(the Site Key belongs only in the Turnstile widget). With CF dummy keys, use token XXXX.DUMMY.TOKEN.XXXX."
		);
	}
	if (CF_TURNSTILE_TEST_SECRETS.has(token)) {
		return (
			"turnstile_token must not be your Turnstile Secret (Secret is server-only)."
		);
	}
	return null;
}

function isValidDeviceId(id: string): boolean {
	return (
		id.length >= DEVICE_ID_MIN_LEN &&
		id.length <= DEVICE_ID_MAX_LEN &&
		DEVICE_ID_RE.test(id)
	);
}

/** 将 Better Auth 返回的 JSON 错误（含 403 Captcha、500 UNKNOWN_ERROR）原样转发 */
function forwardAuthJsonIfPossible(
	res: Response,
	bodyText: string,
): Response | null {
	if (res.ok) return null;
	try {
		const j = JSON.parse(bodyText) as Record<string, unknown>;
		return jsonResponse(j, res.status);
	} catch {
		return null;
	}
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
		const body = (await request.json()) as {
			device_id?: string;
			turnstile_token?: string;
		};
		const deviceId = body.device_id?.trim();
		const turnstileToken = body.turnstile_token?.trim();
		if (!turnstileToken) {
			return jsonResponse(
				{
					error:
						"turnstile_token required (cf-turnstile-response / widget token for Cloudflare Turnstile)",
				},
				400,
			);
		}
		const mistaken = mistakenTurnstileTokenHint(turnstileToken);
		if (mistaken) {
			return jsonResponse({ error: mistaken }, 400);
		}
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
				authRequest(env, "/sign-in/email", { email, password }, {
					captchaResponse: turnstileToken,
				}),
			);
			const text = await res.text();
			const fwd = forwardAuthJsonIfPossible(res, text);
			if (fwd) return fwd;
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
			authRequest(
				env,
				"/sign-up/email",
				{
					email,
					password,
					name: "Guest",
					username,
				},
				{ captchaResponse: turnstileToken },
			),
		);

		const signUpText = await signUpRes.text();
		const signUpFwd = forwardAuthJsonIfPossible(signUpRes, signUpText);
		if (signUpFwd) return signUpFwd;
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
