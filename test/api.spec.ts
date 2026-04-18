import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_DUMMY_RESPONSE } from "../src/constants";

function mockAiStream(): ReadableStream<Uint8Array> {
	const chunk = {
		id: "chatcmpl-test",
		object: "chat.completion.chunk",
		created: 0,
		model: "@cf/test/model",
		choices: [
			{
				index: 0,
				delta: { content: "ok" },
				finish_reason: null,
			},
		],
	};
	return new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			controller.enqueue(
				enc.encode(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`),
			);
			controller.close();
		},
	});
}

function uniqueName(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function syntheticEmail(username: string): string {
	return `${username}@example.com`;
}

function jsonHeadersCaptcha(): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"x-captcha-response": TURNSTILE_DUMMY_RESPONSE,
	};
}

function authTokenFromResponse(res: Response, bodyText: string): string {
	const h =
		res.headers.get("set-auth-token") ?? res.headers.get("Set-Auth-Token");
	if (h) return h;
	const j = JSON.parse(bodyText) as { token?: string };
	if (!j.token) throw new Error("missing bearer token in auth response");
	return j.token;
}

async function signUpUsername(
	username: string,
	password: string,
): Promise<{ accessToken: string; userId: string }> {
	const res = await SELF.fetch("https://example.com/api/auth/sign-up/email", {
		method: "POST",
		headers: jsonHeadersCaptcha(),
		body: JSON.stringify({
			name: username,
			email: syntheticEmail(username),
			password,
			username,
		}),
	});
	const text = await res.text();
	expect(res.status).toBe(200);
	const data = JSON.parse(text) as { user: { id: string } };
	const accessToken = authTokenFromResponse(res, text);
	return { accessToken, userId: data.user.id };
}

async function signInUsername(
	username: string,
	password: string,
): Promise<{ accessToken: string }> {
	const res = await SELF.fetch("https://example.com/api/auth/sign-in/username", {
		method: "POST",
		headers: jsonHeadersCaptcha(),
		body: JSON.stringify({ username, password }),
	});
	const text = await res.text();
	expect(res.status).toBe(200);
	const accessToken = authTokenFromResponse(res, text);
	return { accessToken };
}

describe("API integration (SELF + D1)", () => {
	beforeEach(() => {
		vi.spyOn(env.AI, "run").mockImplementation(() =>
			Promise.resolve(mockAiStream() as never),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("OPTIONS /api/chat returns 204 with CORS", async () => {
		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "OPTIONS",
		});
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("OPTIONS preflight allows x-captcha-response header", async () => {
		const res = await SELF.fetch(
			"https://example.com/api/auth/sign-in/username",
			{
				method: "OPTIONS",
				headers: {
					Origin: "https://example.com",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers":
						"content-type,x-captcha-response",
				},
			},
		);
		expect(res.status).toBe(204);
		const allow = res.headers.get("Access-Control-Allow-Headers") ?? "";
		expect(allow.toLowerCase()).toContain("x-captcha-response");
	});

	it("sign-up without Turnstile header returns 400 MISSING_RESPONSE", async () => {
		const res = await SELF.fetch("https://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "x",
				email: syntheticEmail("x"),
				password: "password12",
				username: uniqueName("nocap"),
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("MISSING_RESPONSE");
	});

	it("POST /api/guest/session without turnstile_token returns 400", async () => {
		const res = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: `d_${crypto.randomUUID().replace(/-/g, "")}`,
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toContain("turnstile_token");
	});

	it("POST /api/guest/session with Turnstile sitekey as token returns 400", async () => {
		const res = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: `d_${crypto.randomUUID().replace(/-/g, "")}`,
				turnstile_token: "1x00000000000000000000AA",
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toMatch(/Site Key|cf-turnstile-response|widget/i);
	});

	it("POST /api/chat without Authorization returns 401", async () => {
		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: "hi" }],
			}),
		});
		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Unauthorized");
	});

	it("GET /api/chat returns 405", async () => {
		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "GET",
		});
		expect(res.status).toBe(405);
	});

	it("POST /api/unknown returns 404 JSON", async () => {
		const res = await SELF.fetch("https://example.com/api/nope", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(404);
	});

	it("POST /api/auth/sign-up/email validates password length", async () => {
		const res = await SELF.fetch("https://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: jsonHeadersCaptcha(),
			body: JSON.stringify({
				name: "a",
				email: syntheticEmail("a"),
				username: "shortname",
				password: "short",
			}),
		});
		await res.text();
		expect(res.status).toBe(400);
	});

	it("sign-up duplicate email returns 422", async () => {
		const user = uniqueName("user");
		const password = "password12";
		const first = await SELF.fetch("https://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: jsonHeadersCaptcha(),
			body: JSON.stringify({
				name: user,
				email: syntheticEmail(user),
				password,
				username: user,
			}),
		});
		await first.text();
		expect(first.status).toBe(200);

		const dup = await SELF.fetch("https://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: jsonHeadersCaptcha(),
			body: JSON.stringify({
				name: user,
				email: syntheticEmail(user),
				password: "otherpass12",
				username: `${user}_other`,
			}),
		});
		await dup.text();
		expect(dup.status).toBe(422);
	});

	it("sign-up → sign-in → chat with credit deduction", async () => {
		const user = uniqueName("user");
		const password = "secret1234";

		const reg = await signUpUsername(user, password);
		expect(reg.accessToken).toBeTruthy();

		const login = await signInUsername(user, password);
		expect(login.accessToken).toBeTruthy();

		const badLogin = await SELF.fetch(
			"https://example.com/api/auth/sign-in/username",
			{
				method: "POST",
				headers: jsonHeadersCaptcha(),
				body: JSON.stringify({ username: user, password: "wrongpass12" }),
			},
		);
		await badLogin.text();
		expect(badLogin.status).toBe(401);

		const chatRes = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${login.accessToken}`,
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "ping" }],
			}),
		});
		expect(chatRes.status).toBe(200);
		expect(chatRes.headers.get("content-type")).toContain("text/event-stream");
		expect(chatRes.headers.get("X-Credits-Remaining")).toBe("990");
		const chatBody = await chatRes.text();
		expect(chatBody).toContain("chat.completion.chunk");
		expect(chatBody).toContain("[DONE]");

		const row = await env.DB.prepare(
			"SELECT credits FROM user_profiles WHERE user_id = ?",
		)
			.bind(reg.userId)
			.first<{ credits: number }>();
		expect(row?.credits).toBe(990);

		const ledger = await env.DB.prepare(
			"SELECT COUNT(*) as c FROM credit_ledger WHERE user_id = ? AND action = 'chat_consume'",
		)
			.bind(reg.userId)
			.first<{ c: number }>();
		expect(ledger?.c).toBe(1);
	});

	it("chat with invalid model_id returns 400", async () => {
		const user = uniqueName("m");
		const { accessToken } = await signUpUsername(user, "password12");

		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				model_id: "does-not-exist",
				messages: [{ role: "user", content: "x" }],
			}),
		});
		expect(res.status).toBe(400);
	});

	it("chat when insufficient credits returns 402", async () => {
		const user = uniqueName("poor");
		const { accessToken, userId } = await signUpUsername(user, "password12");

		await env.DB.prepare("UPDATE user_profiles SET credits = 5 WHERE user_id = ?")
			.bind(userId)
			.run();

		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "x" }],
			}),
		});
		expect(res.status).toBe(402);
	});

	it("chat when account banned returns 403", async () => {
		const user = uniqueName("ban");
		const { accessToken, userId } = await signUpUsername(user, "password12");

		await env.DB.prepare("UPDATE user_profiles SET status = 'banned' WHERE user_id = ?")
			.bind(userId)
			.run();

		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "x" }],
			}),
		});
		expect(res.status).toBe(403);
	});

	it("requires_pro model returns 403 without active pro", async () => {
		await env.DB.prepare(
			`INSERT INTO models (id, display_name, provider_model_id, cost_per_msg, requires_pro, is_active, sort_order)
       VALUES ('pro-only', 'Pro', '@cf/meta/llama-3.1-8b-instruct-fp8', 0, 1, 1, 99)`,
		).run();

		const user = uniqueName("free");
		const { accessToken } = await signUpUsername(user, "password12");

		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				model_id: "pro-only",
				messages: [{ role: "user", content: "x" }],
			}),
		});
		expect(res.status).toBe(403);
	});

	it("sign-in rejected when account not active", async () => {
		const user = uniqueName("inactive");
		const { userId } = await signUpUsername(user, "password12");

		await env.DB.prepare("UPDATE user_profiles SET status = 'banned' WHERE user_id = ?")
			.bind(userId)
			.run();

		const res = await SELF.fetch(
			"https://example.com/api/auth/sign-in/username",
			{
				method: "POST",
				headers: jsonHeadersCaptcha(),
				body: JSON.stringify({ username: user, password: "password12" }),
			},
		);
		const resText = await res.text();
		// session.create.before 拦截封号用户时，Better Auth 返回 FAILED_TO_CREATE_SESSION（500）
		expect(res.status).toBe(500);
		const body = JSON.parse(resText) as { code?: string };
		expect(body.code).toBe("FAILED_TO_CREATE_SESSION");
	});

	it("chat with invalid Bearer token returns 401", async () => {
		const res = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: "Bearer not-a-valid-session-token",
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "x" }],
			}),
		});
		expect(res.status).toBe(401);
	});

	it("POST /api/guest/session creates guest with 100 credits and is idempotent", async () => {
		const deviceId = `d_${crypto.randomUUID().replace(/-/g, "")}`;

		const first = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: deviceId,
				turnstile_token: TURNSTILE_DUMMY_RESPONSE,
			}),
		});
		expect(first.status).toBe(200);
		const j1 = (await first.json()) as {
			userId: string;
			isGuest: boolean;
			credits: number;
			accessToken: string;
		};
		expect(j1.isGuest).toBe(true);
		expect(j1.credits).toBe(100);
		expect(j1.accessToken).toBeTruthy();

		const second = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				device_id: deviceId,
				turnstile_token: TURNSTILE_DUMMY_RESPONSE,
			}),
		});
		expect(second.status).toBe(200);
		const j2 = (await second.json()) as { userId: string };
		expect(j2.userId).toBe(j1.userId);

		const row = await env.DB.prepare(
			"SELECT is_guest, credits FROM user_profiles WHERE user_id = ?",
		)
			.bind(j1.userId)
			.first<{ is_guest: number; credits: number }>();
		expect(row?.is_guest).toBe(1);
		expect(row?.credits).toBe(100);
	});
});
