#!/usr/bin/env node
/**
 * 在 wrangler dev 已启动且本地 D1 已执行 schema 的前提下，串联验证 API。
 * 用法: BASE_URL=http://127.0.0.1:8787 node scripts/manual-api-check.mjs
 */
const base =
	process.env.BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";

async function main() {
	const username = `manual_${Date.now()}`;
	const password = "manual-test-12";

	console.log("→ POST /api/register");
	const regRes = await fetch(`${base}/api/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password, device_info: "manual-script" }),
	});
	const regText = await regRes.text();
	if (!regRes.ok) {
		console.error(regRes.status, regText);
		throw new Error("register failed（请确认 .dev.vars 中 JWT_SECRET 已配置）");
	}
	const reg = JSON.parse(regText);
	console.log("  userId:", reg.userId);

	console.log("→ POST /api/login");
	const loginRes = await fetch(`${base}/api/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password }),
	});
	const login = await loginRes.json();
	if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);

	console.log("→ POST /api/refresh");
	const refRes = await fetch(`${base}/api/refresh`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ refreshToken: login.refreshToken }),
	});
	const ref = await refRes.json();
	if (!refRes.ok) throw new Error(`refresh failed: ${refRes.status}`);

	console.log("→ POST /api/chat (SSE，仅读取前几字节)");
	const chatRes = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${ref.accessToken}`,
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
