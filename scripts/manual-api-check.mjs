#!/usr/bin/env node
/**
 * 在 wrangler dev 已启动且本地 D1 已应用 migrations 的前提下，串联验证“本地全链路 API”。
 * 用法: BASE_URL=http://127.0.0.1:8787 node scripts/manual-api-check.mjs
 */
const base =
	process.env.BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";
const origin = new URL(base).origin;

function authTokenFromResponse(res, bodyText) {
	return (
		res.headers.get("set-auth-token") ??
		res.headers.get("Set-Auth-Token") ??
		JSON.parse(bodyText).token
	);
}

/** Cloudflare Turnstile 测试文档 dummy token（须与 dummy secret 配对） */
const TURNSTILE_DUMMY_RESPONSE = "XXXX.DUMMY.TOKEN.XXXX";

async function parseJsonSafe(res) {
	const text = await res.text();
	try {
		return { text, json: JSON.parse(text) };
	} catch {
		return { text, json: null };
	}
}

function assertOk(res, text, hint) {
	if (!res.ok) {
		throw new Error(`${hint}: ${res.status} ${text}`);
	}
}

async function main() {
	const username = `manual_${Date.now()}`;
	const password = "manual-test-12";
	const email = `${username}@example.com`;
	const otpEmail = process.env.MANUAL_OTP_EMAIL || email;
	const otpCode = process.env.MANUAL_OTP_CODE || "";

	console.log("→ 1) 注册: POST /api/auth/sign-up/email");
	const regRes = await fetch(`${base}/api/auth/sign-up/email`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-captcha-response": TURNSTILE_DUMMY_RESPONSE,
			Origin: origin,
		},
		body: JSON.stringify({ name: username, email, password, username }),
	});
	const { text: regText, json: reg } = await parseJsonSafe(regRes);
	assertOk(
		regRes,
		regText,
		"sign-up failed（请确认 .dev.vars 中 BETTER_AUTH_SECRET / BETTER_AUTH_URL）",
	);
	console.log("  userId:", reg.user?.id);
	let accessToken = authTokenFromResponse(regRes, regText);
	if (!accessToken) {
		console.log("→ 2) 登录补 token: POST /api/auth/sign-in/username");
		const loginRes = await fetch(`${base}/api/auth/sign-in/username`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-captcha-response": TURNSTILE_DUMMY_RESPONSE,
				Origin: origin,
			},
			body: JSON.stringify({ username, password }),
		});
		const { text: loginText } = await parseJsonSafe(loginRes);
		assertOk(loginRes, loginText, "sign-in failed");
		accessToken = authTokenFromResponse(loginRes, loginText);
	}
	if (!accessToken) throw new Error("no session token (set-auth-token / JSON token)");

	console.log("→ 3) 首次聊天(隐式建会话): POST /api/chat");
	const chatPayload = JSON.stringify({
		text: "你好，请用一句话打招呼",
		meta: { source: "manual-api-check" },
	});
	const chatRes = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			session_id: null,
			query: "你好，请用一句话打招呼",
			type_id: "text",
			payload_json: chatPayload,
			tools: [
				{
					type: "function",
					function: {
						name: "manual_tool",
						description: "Manual local smoke check tool",
						parameters: {
							type: "object",
							properties: {},
						},
					},
				},
			],
		}),
	});
	const sessionId = chatRes.headers.get("X-Session-Id");
	assertOk(chatRes, await chatRes.text(), "chat failed");
	console.log("  session_id:", sessionId);
	console.log("  content-type:", chatRes.headers.get("content-type"));
	console.log("  X-Credits-Remaining:", chatRes.headers.get("X-Credits-Remaining"));
	if (!sessionId) throw new Error("X-Session-Id is missing");

	console.log("→ 4) 继续聊天(复用会话): POST /api/chat");
	const chat2 = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			session_id: sessionId,
			query: "继续上一句，并补一个emoji",
			type_id: "text",
			payload_json: JSON.stringify({ text: "继续上一句，并补一个emoji" }),
			tools: [
				{
					type: "function",
					function: {
						name: "manual_tool",
						description: "Manual local smoke check tool",
						parameters: { type: "object", properties: {} },
					},
				},
			],
		}),
	});
	assertOk(chat2, await chat2.text(), "second chat failed");

	console.log("→ 5) 会话列表: GET /api/sessions");
	const sessionsRes = await fetch(`${base}/api/sessions?limit=10`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const { text: sessionsText, json: sessionsJson } = await parseJsonSafe(sessionsRes);
	assertOk(sessionsRes, sessionsText, "list sessions failed");
	console.log("  sessions_count:", sessionsJson.items?.length ?? 0);

	console.log("→ 6) 修改会话标题: PUT /api/sessions/:id");
	const renameRes = await fetch(`${base}/api/sessions/${sessionId}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ title: "本地联调会话" }),
	});
	assertOk(renameRes, await renameRes.text(), "rename session failed");

	console.log("→ 7) 消息列表: GET /api/messages");
	const msgsRes = await fetch(
		`${base}/api/messages?session_id=${encodeURIComponent(sessionId)}&limit=20`,
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);
	const { text: msgsText, json: msgsJson } = await parseJsonSafe(msgsRes);
	assertOk(msgsRes, msgsText, "list messages failed");
	const firstMessageId = msgsJson.items?.[0]?.id;
	console.log("  messages_count:", msgsJson.items?.length ?? 0);

	if (firstMessageId) {
		console.log("→ 8) 删除一条消息: DELETE /api/messages/:id");
		const delMsg = await fetch(`${base}/api/messages/${firstMessageId}`, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		assertOk(delMsg, await delMsg.text(), "delete message failed");
	}

	console.log("→ 9) 游客会话: POST /api/guest/session");
	const guest = await fetch(`${base}/api/guest/session`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: origin },
		body: JSON.stringify({
			device_id: `manual_d_${Date.now()}`,
			turnstile_token: TURNSTILE_DUMMY_RESPONSE,
		}),
	});
	assertOk(guest, await guest.text(), "guest session failed");

	console.log("→ 10) 删除会话(级联消息): DELETE /api/sessions/:id");
	const delSession = await fetch(`${base}/api/sessions/${sessionId}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	assertOk(delSession, await delSession.text(), "delete session failed");

	console.log("→ 11) 无鉴权访问 /api/chat（应 401）");
	const noAuth = await fetch(`${base}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			session_id: null,
			query: "x",
			type_id: "text",
			payload_json: JSON.stringify({ text: "x" }),
		}),
	});
	console.log("  status:", noAuth.status, await noAuth.text());
	if (noAuth.status !== 401) {
		throw new Error(`expected 401 without auth, got ${noAuth.status}`);
	}

	console.log("→ 12) 发送登录 OTP: POST /api/auth/email-otp/send-verification-otp");
	const otpSend = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-captcha-response": TURNSTILE_DUMMY_RESPONSE,
			Origin: origin,
		},
		body: JSON.stringify({ email: otpEmail, type: "sign-in" }),
	});
	const { text: otpSendText } = await parseJsonSafe(otpSend);
	assertOk(otpSend, otpSendText, "send OTP failed");
	console.log("  otp_email:", otpEmail);

	if (otpCode) {
		console.log("→ 13) 使用 OTP 登录: POST /api/auth/sign-in/email-otp");
		const otpSignIn = await fetch(`${base}/api/auth/sign-in/email-otp`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-captcha-response": TURNSTILE_DUMMY_RESPONSE,
				Origin: origin,
			},
			body: JSON.stringify({ email: otpEmail, otp: otpCode }),
		});
		const { text: otpSignInText } = await parseJsonSafe(otpSignIn);
		assertOk(otpSignIn, otpSignInText, "OTP sign-in failed");
		const otpToken = authTokenFromResponse(otpSignIn, otpSignInText);
		if (!otpToken) throw new Error("no token after OTP sign-in");
		console.log("  otp_signin_ok: true");
	} else {
		console.log(
			"  skip OTP sign-in (set MANUAL_OTP_CODE=<验证码> to verify /sign-in/email-otp)",
		);
	}

	console.log("\n本地全链路验证完成。");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
