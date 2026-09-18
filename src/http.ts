/**
 * HTTP 辅助：CORS 与 JSON 响应
 */
export const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...CORS_HEADERS,
		},
	});
}

export function preflightResponse(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function legacyThemeAdminLocation(url: URL): string | null {
	if (url.pathname !== "/theme-admin" && !url.pathname.startsWith("/theme-admin/")) {
		return null;
	}
	const rest = url.pathname === "/theme-admin" ? "/" : url.pathname.slice("/theme-admin".length);
	const suffix = rest.startsWith("/") ? rest : `/${rest}`;
	return `/ops${suffix}${url.search}`;
}

export function shouldServeOpsSpa(pathname: string): boolean {
	if (pathname !== "/ops" && !pathname.startsWith("/ops/")) return false;
	const leaf = pathname.split("/").pop() || "";
	return !leaf.includes(".");
}
