import { betterAuth } from "better-auth";
import { bearer, captcha, emailOTP, username } from "better-auth/plugins";
import type { Env } from "./types";

function appOrigin(env: Env): string {
	try {
		return new URL(env.BETTER_AUTH_URL).origin;
	} catch {
		return "http://127.0.0.1:8787";
	}
}

function maskEmail(email: string): string {
	const [localPart, domain = ""] = email.split("@");
	if (!localPart) return email;
	if (localPart.length <= 2) return `${localPart[0] ?? "*"}*@${domain}`;
	return `${localPart.slice(0, 2)}***@${domain}`;
}

function otpSubject(type: string): string {
	if (type === "sign-in") return "Your sign-in verification code";
	if (type === "email-verification") return "Verify your email address";
	return "Your password reset verification code";
}

function otpTitle(type: string): string {
	if (type === "sign-in") return "Sign in verification code";
	if (type === "email-verification") return "Verify your email";
	return "Password reset verification code";
}

function otpHint(type: string): string {
	if (type === "sign-in") return "Use this one-time code to sign in securely.";
	if (type === "email-verification") {
		return "Use this one-time code to verify your email address.";
	}
	return "Use this one-time code to continue resetting your password.";
}

function isTruthyEnv(value: string | undefined): boolean {
	if (!value) return false;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function buildOtpMailHtml(params: {
	otp: string;
	type: string;
	email: string;
	expiresInSec: number;
}): string {
	const { otp, type, email, expiresInSec } = params;
	const expiresInMin = Math.max(1, Math.floor(expiresInSec / 60));
	const title = otpTitle(type);
	const hint = otpHint(type);
	const safeEmail = maskEmail(email);

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f2f5fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#102a43;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:separate;overflow:hidden;border-radius:18px;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,0.12);">
            <tr>
              <td style="padding:26px 28px;background:linear-gradient(135deg,#4f46e5,#7c3aed);">
                <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#dbeafe;font-weight:700;">LLM Chat App</div>
                <h1 style="margin:10px 0 0;font-size:25px;line-height:1.3;color:#ffffff;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334e68;">${hint}</p>
                <p style="margin:0 0 18px;font-size:14px;color:#486581;">Request email: <strong style="color:#102a43;">${safeEmail}</strong></p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <tr>
                    <td align="center" style="padding:20px;">
                      <div style="font-size:12px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">One-time code</div>
                      <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:0.42em;color:#0f172a;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;padding-left:0.45em;">
                        ${otp}
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#64748b;">This code expires in <strong>${expiresInMin} minutes</strong>. For your security, do not share it with anyone.</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">If you did not request this code, you can ignore this email safely.</p>
              </td>
            </tr>
          </table>
          <p style="max-width:620px;margin:14px auto 0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
            This is an automated message from LLM Chat App.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildOtpMailText(params: {
	otp: string;
	type: string;
	expiresInSec: number;
}): string {
	const { otp, type, expiresInSec } = params;
	const expiresInMin = Math.max(1, Math.floor(expiresInSec / 60));
	return [
		otpTitle(type),
		"",
		otpHint(type),
		`Verification code: ${otp}`,
		`Expires in: ${expiresInMin} minutes`,
		"",
		"If you did not request this email, you can ignore it.",
	].join("\n");
}

async function sendOtpWithResend(params: {
	env: Env;
	email: string;
	otp: string;
	type: string;
	expiresInSec: number;
}): Promise<boolean> {
	const { env, email, otp, type, expiresInSec } = params;
	const apiKey = env.RESEND_API_KEY || "";
	const fromEmail = env.RESEND_FROM_EMAIL || "no-reply@example.com";
	const maskedEmail = maskEmail(email);
	const traceId = crypto.randomUUID();
	console.log("otp.mail.send.start", {
		traceId,
		type,
		email: maskedEmail,
		hasApiKey: Boolean(apiKey),
		hasFromEmail: Boolean(env.RESEND_FROM_EMAIL),
		expiresInSec,
	});
	if (!apiKey || !env.RESEND_FROM_EMAIL) {
		console.error("otp.mail.config.missing", {
			traceId,
			type,
			email: maskedEmail,
			hasApiKey: Boolean(apiKey),
			hasFromEmail: Boolean(env.RESEND_FROM_EMAIL),
			fallbackFromEmail: fromEmail,
		});
	}
	const from = env.RESEND_FROM_NAME
		? `${env.RESEND_FROM_NAME} <${fromEmail}>`
		: fromEmail;
	const payload = {
		from,
		to: [email],
		subject: otpSubject(type),
		html: buildOtpMailHtml({ otp, type, email, expiresInSec }),
		text: buildOtpMailText({ otp, type, expiresInSec }),
	};
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		const body = await res.text();
		if (!res.ok) {
			console.error("otp.mail.send.failed", {
				traceId,
				type,
				email: maskedEmail,
				status: res.status,
				body: body.slice(0, 400),
			});
			return false;
		}
		console.log("otp.mail.send.ok", {
			traceId,
			type,
			email: maskedEmail,
			status: res.status,
			body: body.slice(0, 400),
		});
		return true;
	} catch (error) {
		console.error("otp.mail.send.exception", {
			traceId,
			type,
			email: maskedEmail,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

export function createAuth(env: Env) {
	const otpExpiresInSeconds = 300;
	return betterAuth({
		database: env.DB,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: [appOrigin(env)],
		emailAndPassword: {
			enabled: true,
			autoSignIn: true,
		},
		plugins: [
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: env.TURNSTILE_SECRET_KEY,
				endpoints: [
					"/sign-up/email",
					"/sign-in/email",
					"/sign-in/email-otp",
					"/sign-in/username",
					"/request-password-reset",
					"/email-otp/send-verification-otp",
					"/email-otp/check-verification-otp",
				],
			}),
			emailOTP({
				expiresIn: otpExpiresInSeconds,
				otpLength: 6,
				allowedAttempts: 5,
				resendStrategy: "reuse",
				sendVerificationOTP: async ({ email, otp, type }) => {
					const strictMode = isTruthyEnv(env.OTP_MAIL_STRICT_MODE);
					console.log("otp.mail.enqueue", {
						type,
						email: maskEmail(email),
						otpLength: otp.length,
						strictMode,
					});
					if (strictMode) {
						const ok = await sendOtpWithResend({
							env,
							email,
							otp,
							type,
							expiresInSec: otpExpiresInSeconds,
						});
						if (!ok) {
							throw new Error(
								"OTP_EMAIL_DELIVERY_FAILED: resend send failed in strict mode",
							);
						}
						return;
					}
					// Non-strict mode: keep anti-timing behavior with fire-and-forget.
					void sendOtpWithResend({
						env,
						email,
						otp,
						type,
						expiresInSec: otpExpiresInSeconds,
					});
				},
			}),
			bearer(),
			username(),
		],
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						const now = Math.floor(Date.now() / 1000);
						await env.DB.prepare(
							`INSERT INTO user_profiles (user_id, credits, tier, pro_expires_at, status, is_guest, device_id, created_at, updated_at)
               VALUES (?, 1000, 'free', 0, 'active', 0, NULL, ?, ?)`,
						)
							.bind(user.id, now, now)
							.run();
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						const row = await env.DB.prepare(
							"SELECT status FROM user_profiles WHERE user_id = ?",
						)
							.bind(session.userId)
							.first<{ status: string }>();
						if (row?.status === "banned") return false;
					},
				},
			},
		},
	});
}
