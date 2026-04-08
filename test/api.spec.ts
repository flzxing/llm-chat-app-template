import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockAiStream(): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(
				new TextEncoder().encode('data: {"p":"ok"}\n\n'),
			);
			controller.close();
		},
	});
}

function uniqueName(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function register(
	username: string,
	password: string,
	deviceInfo?: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
	const res = await SELF.fetch("https://example.com/api/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			username,
			password,
			...(deviceInfo != null ? { device_info: deviceInfo } : {}),
		}),
	});
	const data = (await res.json()) as Record<string, unknown>;
	expect(res.status).toBe(200);
	return {
		accessToken: data.accessToken as string,
		refreshToken: data.refreshToken as string,
		userId: data.userId as string,
	};
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

	it("POST /api/register validates input", async () => {
		const res = await SELF.fetch("https://example.com/api/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "a", password: "short" }),
		});
		expect(res.status).toBe(400);
	});

	it("register → login → refresh → chat with credit deduction", async () => {
		const user = uniqueName("user");
		const password = "secret12";

		const reg = await register(user, password, "vitest-device");
		expect(reg.accessToken).toBeTruthy();
		expect(reg.refreshToken).toBeTruthy();

		const dup = await SELF.fetch("https://example.com/api/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: user, password: "otherpass12" }),
		});
		expect(dup.status).toBe(409);

		const loginRes = await SELF.fetch("https://example.com/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: user, password }),
		});
		expect(loginRes.status).toBe(200);
		const loginJson = (await loginRes.json()) as {
			accessToken: string;
			refreshToken: string;
		};
		expect(loginJson.accessToken).toBeTruthy();

		const badLogin = await SELF.fetch("https://example.com/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: user, password: "wrongpass" }),
		});
		expect(badLogin.status).toBe(401);

		const refreshRes = await SELF.fetch("https://example.com/api/refresh", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refreshToken: loginJson.refreshToken }),
		});
		expect(refreshRes.status).toBe(200);
		const refreshJson = (await refreshRes.json()) as {
			accessToken: string;
			refreshToken: string;
		};
		expect(refreshJson.accessToken).toBeTruthy();

		const chatRes = await SELF.fetch("https://example.com/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${refreshJson.accessToken}`,
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "ping" }],
			}),
		});
		expect(chatRes.status).toBe(200);
		expect(chatRes.headers.get("content-type")).toContain("text/event-stream");
		expect(chatRes.headers.get("X-Credits-Remaining")).toBe("990");

		const row = await env.DB.prepare(
			"SELECT credits FROM users WHERE id = ?",
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
		const { accessToken } = await register(user, "password12");

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
		const { accessToken, userId } = await register(user, "password12");

		await env.DB.prepare("UPDATE users SET credits = 5 WHERE id = ?")
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
		const { accessToken, userId } = await register(user, "password12");

		await env.DB.prepare("UPDATE users SET status = 'banned' WHERE id = ?")
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
		const { accessToken } = await register(user, "password12");

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

	it("login rejected when account not active", async () => {
		const user = uniqueName("inactive");
		const { userId } = await register(user, "password12");

		await env.DB.prepare("UPDATE users SET status = 'banned' WHERE id = ?")
			.bind(userId)
			.run();

		const res = await SELF.fetch("https://example.com/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: user, password: "password12" }),
		});
		expect(res.status).toBe(403);
	});

	it("refresh with unknown token returns 403 (session expired)", async () => {
		const res = await SELF.fetch("https://example.com/api/refresh", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refreshToken: "not-a-valid-uuid-session" }),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Session expired");
	});

	it("POST /api/guest/session creates guest with 100 credits and is idempotent", async () => {
		const deviceId = `d_${crypto.randomUUID().replace(/-/g, "")}`;

		const first = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ device_id: deviceId }),
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
			body: JSON.stringify({ device_id: deviceId }),
		});
		expect(second.status).toBe(200);
		const j2 = (await second.json()) as { userId: string };
		expect(j2.userId).toBe(j1.userId);

		const row = await env.DB.prepare(
			"SELECT is_guest, credits FROM users WHERE id = ?",
		)
			.bind(j1.userId)
			.first<{ is_guest: number; credits: number }>();
		expect(row?.is_guest).toBe(1);
		expect(row?.credits).toBe(100);
	});

	it("guest register with Bearer upgrades in place and preserves credits", async () => {
		const deviceId = `d_${crypto.randomUUID().replace(/-/g, "")}`;
		const gs = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ device_id: deviceId }),
		});
		const { userId, accessToken } = (await gs.json()) as {
			userId: string;
			accessToken: string;
		};

		await env.DB.prepare("UPDATE users SET credits = 77 WHERE id = ?")
			.bind(userId)
			.run();

		const user = uniqueName("upg");
		const up = await SELF.fetch("https://example.com/api/register", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ username: user, password: "secret12" }),
		});
		expect(up.status).toBe(200);
		const upJson = (await up.json()) as {
			upgraded: boolean;
			userId: string;
			username: string;
		};
		expect(upJson.upgraded).toBe(true);
		expect(upJson.userId).toBe(userId);
		expect(upJson.username).toBe(user);

		const row = await env.DB.prepare(
			"SELECT is_guest, credits FROM users WHERE id = ?",
		)
			.bind(userId)
			.first<{ is_guest: number; credits: number }>();
		expect(row?.is_guest).toBe(0);
		expect(row?.credits).toBe(77);

		const again = await SELF.fetch("https://example.com/api/guest/session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ device_id: deviceId }),
		});
		expect(again.status).toBe(403);
	});

	it("register with Bearer for non-guest returns 400", async () => {
		const user = uniqueName("reg");
		const { accessToken } = await register(user, "password12");

		const res = await SELF.fetch("https://example.com/api/register", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ username: "other_name", password: "secret12" }),
		});
		expect(res.status).toBe(400);
	});
});
