#!/usr/bin/env node
/**
 * 在 wrangler dev 已启动且本地 D1 已应用 migrations 的前提下，串联验证 API。
 * 用法: BASE_URL=http://127.0.0.1:8787 node scripts/manual-api-check.mjs
 *
 * 需配置 .dev.vars：BETTER_AUTH_SECRET、BETTER_AUTH_URL（与 BASE_URL 同源一致）。
 */
const base =
	process.env.BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";

function authTokenFromResponse(res, bodyText) {
	return (
		res.headers.get("set-auth-token") ??
		res.headers.get("Set-Auth-Token") ??
		JSON.parse(bodyText).token
	);
}

async function main() {
	const username = `manual_${Date.now()}`;
	const password = "manual-test-12";
	const email = `${username}@example.com`;

	console.log("→ POST /api/auth/sign-up/email");
	const regRes = await fetch(`${base}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name: username, email, password, username }),
	});
	const regText = await regRes.text();
	if (!regRes.ok) {
		console.error(regRes.status, regText);
		throw new Error(
			"sign-up failed（请确认 .dev.vars 中 BETTER_AUTH_SECRET / BETTER_AUTH_URL）",
		);
	}
	const reg = JSON.parse(regText);
	console.log("  userId:", reg.user?.id);
	let accessToken = authTokenFromResponse(regRes, regText);
	if (!accessToken) {
		console.log("→ POST /api/auth/sign-in/username（补取 token）");
		const loginRes = await fetch(`${base}/api/auth/sign-in/username`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});
		const loginText = await loginRes.text();
		if (!loginRes.ok) throw new Error(`sign-in failed: ${loginRes.status} ${loginText}`);
		accessToken = authTokenFromResponse(loginRes, loginText);
	}
	if (!accessToken) throw new Error("no session token (set-auth-token / JSON token)");

	console.log("→ POST /api/chat (SSE，仅读取前几字节)");
	const chatRes = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			messages: [{ role: "user", content: "Say hello in one word." }],
		}),
	});
	if (!chatRes.ok) {
		const t = await chatRes.text();
		throw new Error(`chat failed: ${chatRes.status} ${t}`);
	}
	console.log("  content-type:", chatRes.headers.get("content-type"));
	console.log("  X-Credits-Remaining:", chatRes.headers.get("X-Credits-Remaining"));
	const reader = chatRes.body?.getReader();
	if (reader) {
		const { value } = await reader.read();
		console.log(
			"  first chunk (bytes):",
			value ? Math.min(value.length, 200) : 0,
		);
		reader.releaseLock();
	}

	console.log("→ POST /api/chat 无 Authorization（应 401）");
	const noAuth = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
	});
	console.log("  status:", noAuth.status, await noAuth.text());

	console.log("\n全部步骤完成。");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
