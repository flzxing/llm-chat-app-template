import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_DUMMY_RESPONSE } from "../src/constants";

function mockAiStream(done = true): ReadableStream<Uint8Array> {
	const chunk = {
		id: "chatcmpl-test",
		object: "chat.completion.chunk",
		created: 0,
		model: "@cf/test/model",
		choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }],
	};
	return new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			controller.enqueue(
				enc.encode(
					done
						? `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`
						: `data: ${JSON.stringify(chunk)}\n\n`,
				),
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

async function sendSignInOtp(email: string): Promise<Response> {
	return SELF.fetch("https://example.com/api/auth/email-otp/send-verification-otp", {
		method: "POST",
		headers: jsonHeadersCaptcha(),
		body: JSON.stringify({ email, type: "sign-in" }),
	});
}

async function signInEmailOtp(email: string, otp: string): Promise<Response> {
	return SELF.fetch("https://example.com/api/auth/sign-in/email-otp", {
		method: "POST",
		headers: jsonHeadersCaptcha(),
		body: JSON.stringify({ email, otp }),
	});
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
	return { accessToken: authTokenFromResponse(res, text), userId: data.user.id };
}

async function postChat(
	accessToken: string,
	body: {
		session_id?: string | null;
		query: string;
		type_id?: string;
		payload_json: string;
		tools?: unknown[];
	},
	headers?: Record<string, string>,
): Promise<Response> {
	return SELF.fetch("https://example.com/api/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
			...headers,
		},
		body: JSON.stringify({
			...body,
			tools:
				body.tools ??
				[
					{
						type: "function",
						function: { name: "client_tool", description: "test only", parameters: { type: "object", properties: {} } },
					},
				],
		}),
	});
}

describe("chat/session/message integration", () => {
	const origFetch = globalThis.fetch.bind(globalThis);
	let sseDone = true;
	const sentOtp = new Map<string, string>();

	beforeEach(() => {
		sseDone = true;
		sentOtp.clear();
		vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (url === "https://api.resend.com/emails") {
				const bodyText =
					typeof init?.body === "string"
						? init.body
						: init?.body instanceof URLSearchParams
							? init.body.toString()
							: "";
				const body = bodyText ? (JSON.parse(bodyText) as { to?: string[]; html?: string }) : {};
				const to = body.to?.[0] ?? "";
				const otp = body.html?.match(/>\s*([0-9]{6})\s*</)?.[1] ?? "";
				if (to && otp) sentOtp.set(to, otp);
				return Promise.resolve(
					new Response(JSON.stringify({ id: "re_test_123" }), { status: 200 }),
				);
			}
			if (url.includes("/ai/v1/chat/completions")) {
				return Promise.resolve(
					new Response(mockAiStream(sseDone), {
						status: 200,
						headers: { "content-type": "text/event-stream; charset=utf-8" },
					}),
				);
			}
			return origFetch(input as RequestInfo, init);
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("auto create session and persist chat messages", async () => {
		const user = uniqueName("chat");
		const { accessToken, userId } = await signUpUsername(user, "password12");
		const payload = JSON.stringify({ text: "ping", meta: { nested: [1] } });
		const res = await postChat(accessToken, {
			session_id: null,
			query: "ping",
			type_id: "text",
			payload_json: payload,
		});
		expect(res.status).toBe(200);
		const sessionId = res.headers.get("X-Session-Id");
		const userMessageId = res.headers.get("X-User-Message-Id");
		await res.text();

		const sessionRow = await env.DB.prepare(
			"SELECT user_id FROM sessions WHERE id = ?",
		)
			.bind(sessionId)
			.first<{ user_id: string }>();
		expect(sessionRow?.user_id).toBe(userId);
		const count = await env.DB.prepare(
			"SELECT COUNT(*) AS c FROM messages WHERE session_id = ?",
		)
			.bind(sessionId)
			.first<{ c: number }>();
		expect(count?.c).toBe(2);
		const saved = await env.DB.prepare("SELECT payload_json FROM messages WHERE id = ?")
			.bind(userMessageId)
			.first<{ payload_json: string }>();
		expect(saved?.payload_json).toBe(payload);
	});

	it("skip assistant persistence when stream has no DONE event", async () => {
		sseDone = false;
		const { accessToken } = await signUpUsername(uniqueName("broken"), "password12");
		const res = await postChat(accessToken, {
			session_id: null,
			query: "incomplete",
			payload_json: JSON.stringify({ text: "incomplete" }),
		});
		const sessionId = res.headers.get("X-Session-Id");
		await res.text();
		const rows = await env.DB.prepare(
			"SELECT role FROM messages WHERE session_id = ? ORDER BY seq ASC",
		)
			.bind(sessionId)
			.all<{ role: string }>();
		expect(rows.results?.map((x) => x.role)).toEqual(["user"]);
	});

	it("idempotency key prevents duplicate user insert", async () => {
		const { accessToken } = await signUpUsername(uniqueName("idem"), "password12");
		const key = crypto.randomUUID();
		const first = await postChat(
			accessToken,
			{ session_id: null, query: "same", payload_json: JSON.stringify({ text: "same" }) },
			{ "x-idempotency-key": key },
		);
		const sessionId = first.headers.get("X-Session-Id");
		await first.text();
		const second = await postChat(
			accessToken,
			{
				session_id: sessionId,
				query: "same",
				payload_json: JSON.stringify({ text: "same" }),
			},
			{ "x-idempotency-key": key },
		);
		await second.text();
		const count = await env.DB.prepare(
			"SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND role = 'user'",
		)
			.bind(sessionId)
			.first<{ c: number }>();
		expect(count?.c).toBe(1);
	});

	it("supports session and message APIs", async () => {
		const { accessToken } = await signUpUsername(uniqueName("apis"), "password12");
		const chat = await postChat(accessToken, {
			session_id: null,
			query: "seed",
			payload_json: JSON.stringify({ text: "seed" }),
		});
		const sessionId = chat.headers.get("X-Session-Id");
		await chat.text();
		const sessions = await SELF.fetch("https://example.com/api/sessions?limit=1", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		expect(sessions.status).toBe(200);
		const badOffset = await SELF.fetch(
			`https://example.com/api/messages?session_id=${sessionId}&offset=1`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);
		expect(badOffset.status).toBe(400);
		const update = await SELF.fetch(`https://example.com/api/sessions/${sessionId}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title: "标题已改" }),
		});
		expect(update.status).toBe(200);
	});

	it("concurrent requests keep unique increasing seq", async () => {
		const { accessToken } = await signUpUsername(uniqueName("cc"), "password12");
		const seed = await postChat(accessToken, {
			session_id: null,
			query: "seed",
			payload_json: JSON.stringify({ text: "seed" }),
		});
		const sessionId = seed.headers.get("X-Session-Id");
		await seed.text();
		await Promise.all(
			Array.from({ length: 5 }).map((_, i) =>
				postChat(accessToken, {
					session_id: sessionId,
					query: `c_${i}`,
					payload_json: JSON.stringify({ text: `c_${i}` }),
				}).then((res) => res.text()),
			),
		);
		const rows = await env.DB.prepare(
			"SELECT seq FROM messages WHERE session_id = ? ORDER BY seq ASC",
		)
			.bind(sessionId)
			.all<{ seq: number }>();
		const seqs = (rows.results ?? []).map((x) => x.seq);
		expect(new Set(seqs).size).toBe(seqs.length);
		for (let i = 1; i < seqs.length; i += 1) {
			expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
		}
	});

	it("supports email OTP sign-in and returns session token", async () => {
		const email = `${uniqueName("otp")}@example.com`;
		const sendRes = await sendSignInOtp(email);
		const sendText = await sendRes.text();
		expect(sendRes.status).toBe(200);
		expect(sendText.length).toBeGreaterThan(0);
		const otp = sentOtp.get(email);
		expect(otp).toBeTruthy();

		const signInRes = await signInEmailOtp(email, otp!);
		const signInText = await signInRes.text();
		expect(signInRes.status).toBe(200);
		expect(() => authTokenFromResponse(signInRes, signInText)).not.toThrow();
	});

	it("rejects sending OTP without captcha header", async () => {
		const res = await SELF.fetch(
			"https://example.com/api/auth/email-otp/send-verification-otp",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: `${uniqueName("no_captcha")}@example.com`, type: "sign-in" }),
			},
		);
		expect(res.status).toBe(400);
	});

	it("returns error for wrong OTP and blocks after too many attempts", async () => {
		const email = `${uniqueName("otp_err")}@example.com`;
		const sendRes = await sendSignInOtp(email);
		expect(sendRes.status).toBe(200);
		await sendRes.text();

		let tooManyAttemptsHit = false;
		for (let i = 0; i < 6; i += 1) {
			const res = await signInEmailOtp(email, "000000");
			const text = await res.text();
			if (/TOO_MANY_ATTEMPTS/i.test(text)) {
				tooManyAttemptsHit = true;
				break;
			}
		}
		expect(tooManyAttemptsHit).toBe(true);
	});
});
