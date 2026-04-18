import type { Env } from "./types";

function bytesToHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function guestEmailForDevice(deviceId: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`device:${deviceId}`),
	);
	return `guest.${bytesToHex(digest)}@example.com`;
}

/** 与设备绑定的确定性密码（仅服务端知晓 secret） */
export async function guestPassword(
	secret: string,
	deviceId: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`guest-pw:${deviceId}`),
	);
	const raw = bytesToHex(sig);
	return `${raw}Aa1!`;
}

export async function guestUsernameForDevice(deviceId: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`user:${deviceId}`),
	);
	return `g_${bytesToHex(digest).slice(0, 28)}`;
}

export function authRequest(
	env: Env,
	pathname: string,
	body: unknown,
	opts?: { captchaResponse?: string },
): Request {
	const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
	const url = `${base}/api/auth${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (opts?.captchaResponse) {
		headers["x-captcha-response"] = opts.captchaResponse;
	}
	return new Request(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}
