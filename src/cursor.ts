type CursorShape = {
	t: number;
	id: string;
};

function toBase64Url(input: string): string {
	return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	return atob(padded);
}

export function encodeCursor(createdAt: number, id: string): string {
	return toBase64Url(JSON.stringify({ t: createdAt, id }));
}

export function decodeCursor(cursor: string | null): CursorShape | null {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(fromBase64Url(cursor)) as CursorShape;
		if (
			typeof parsed?.t !== "number" ||
			!Number.isFinite(parsed.t) ||
			typeof parsed?.id !== "string" ||
			parsed.id.length < 1
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function clampLimit(raw: string | null, defaultLimit = 20, max = 100): number {
	if (!raw) return defaultLimit;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value < 1) return defaultLimit;
	return Math.min(value, max);
}
