import { clampLimit, decodeCursor, encodeCursor } from "../cursor";
import { jsonResponse } from "../http";
import type { Env, MessageItem } from "../types";

export async function handleListMessages(
	request: Request,
	env: Env,
	userId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("session_id");
	if (!sessionId) {
		return jsonResponse({ error: "session_id is required" }, 400);
	}
	if (url.searchParams.has("offset")) {
		return jsonResponse({ error: "offset pagination is not supported" }, 400);
	}
	const owner = await env.DB.prepare(
		"SELECT id FROM sessions WHERE id = ? AND user_id = ?",
	)
		.bind(sessionId, userId)
		.first<{ id: string }>();
	if (!owner) {
		return jsonResponse({ error: "Session not found" }, 404);
	}

	const cursor = decodeCursor(url.searchParams.get("cursor"));
	const limit = clampLimit(url.searchParams.get("limit"), 30, 100);
	const whereClause = cursor
		? "WHERE session_id = ? AND user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))"
		: "WHERE session_id = ? AND user_id = ?";
	const statement = env.DB.prepare(
		`SELECT id, session_id, role, type_id, payload_json, seq, created_at
     FROM messages
     ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
	);
	const rows = cursor
		? await statement
				.bind(sessionId, userId, cursor.t, cursor.t, cursor.id, limit + 1)
				.all<MessageItem>()
		: await statement.bind(sessionId, userId, limit + 1).all<MessageItem>();
	const list = rows.results ?? [];
	const hasMore = list.length > limit;
	const items = hasMore ? list.slice(0, limit) : list;
	const last = items[items.length - 1];
	const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
	return jsonResponse({
		items,
		next_cursor: nextCursor,
		has_more: hasMore,
	});
}

export async function handleDeleteMessage(
	env: Env,
	userId: string,
	messageId: string,
): Promise<Response> {
	const row = await env.DB.prepare(
		"SELECT id, session_id FROM messages WHERE id = ? AND user_id = ?",
	)
		.bind(messageId, userId)
		.first<{ id: string; session_id: string }>();
	if (!row) {
		return jsonResponse({ error: "Message not found" }, 404);
	}
	await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(messageId).run();
	const ts = Math.floor(Date.now() / 1000);
	await env.DB.prepare(
		"UPDATE sessions SET updated_at = ? WHERE id = ? AND user_id = ?",
	)
		.bind(ts, row.session_id, userId)
		.run();
	return jsonResponse({ ok: true });
}
