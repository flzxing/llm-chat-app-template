import { decodeCursor, encodeCursor, clampLimit } from "../cursor";
import { jsonResponse } from "../http";
import type { Env, SessionItem } from "../types";

type SessionListRow = SessionItem;

export async function handleListSessions(
	request: Request,
	env: Env,
	userId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const cursor = decodeCursor(url.searchParams.get("cursor"));
	const limit = clampLimit(url.searchParams.get("limit"), 20, 100);

	const whereClause = cursor
		? "WHERE user_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?))"
		: "WHERE user_id = ?";
	const statement = env.DB.prepare(
		`SELECT id, title, status, last_message_at, created_at, updated_at
     FROM sessions
     ${whereClause}
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
	);
	const rows = cursor
		? await statement
				.bind(userId, cursor.t, cursor.t, cursor.id, limit + 1)
				.all<SessionListRow>()
		: await statement.bind(userId, limit + 1).all<SessionListRow>();
	const items = rows.results ?? [];
	const hasMore = items.length > limit;
	const pageItems = hasMore ? items.slice(0, limit) : items;
	const last = pageItems[pageItems.length - 1];
	const nextCursor = hasMore && last ? encodeCursor(last.updated_at, last.id) : null;

	return jsonResponse({
		items: pageItems,
		next_cursor: nextCursor,
		has_more: hasMore,
	});
}

export async function handleUpdateSessionTitle(
	request: Request,
	env: Env,
	userId: string,
	sessionId: string,
): Promise<Response> {
	const body = (await request.json()) as { title?: string };
	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (title.length < 1 || title.length > 120) {
		return jsonResponse({ error: "title length must be 1-120" }, 400);
	}
	const ts = Math.floor(Date.now() / 1000);
	const result = await env.DB.prepare(
		"UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
	)
		.bind(title, ts, sessionId, userId)
		.run();
	if ((result.meta.changes ?? 0) < 1) {
		return jsonResponse({ error: "Session not found" }, 404);
	}
	return jsonResponse({ ok: true });
}

export async function handleDeleteSession(
	env: Env,
	userId: string,
	sessionId: string,
): Promise<Response> {
	const result = await env.DB.prepare(
		"DELETE FROM sessions WHERE id = ? AND user_id = ?",
	)
		.bind(sessionId, userId)
		.run();
	if ((result.meta.changes ?? 0) < 1) {
		return jsonResponse({ error: "Session not found" }, 404);
	}
	return jsonResponse({ ok: true });
}
