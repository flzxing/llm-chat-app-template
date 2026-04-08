/**
 * Web Crypto：Token 摘要与密码 PBKDF2
 */
export async function hashToken(token: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function hashPassword(
	password: string,
	salt?: string,
): Promise<string> {
	const actualSalt = salt || crypto.randomUUID();
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const buffer = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: enc.encode(actualSalt),
			iterations: 10000,
			hash: "SHA-256",
		},
		keyMaterial,
		256,
	);
	const hashHex = Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${actualSalt}:${hashHex}`;
}
