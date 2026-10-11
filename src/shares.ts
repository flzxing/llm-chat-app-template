import MarkdownIt from "markdown-it";
import { jsonResponse } from "./http";
import type { Env } from "./types";
import { decodeCursor, encodeCursor } from "./cursor";

export const SHARE_MAX_BYTES = 1024 * 1024;
export interface ShareSnapshot {
 version: number;
 title: string;
 messages: { id: string; role: "user" | "assistant"; createdAt: number; markdown: string }[];
}
interface ShareRow {
 id: string; user_id: string; token: string; title: string; snapshot_json: string;
 created_at: number; revoked_at: number | null;
}
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
// Attachments are deliberately not fetched by a public snapshot reader.
markdown.renderer.rules.image = (tokens, index) => `<span class="attachment">[${escapeHtml(tokens[index].content || "Image")}]</span>`;
const originalLinkOpen = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
 const token = tokens[index];
 const href = token.attrGet("href") || "";
 if (!/^https?:\/\//i.test(href)) token.attrSet("href", "#");
 token.attrSet("rel", "noreferrer noopener");
 return originalLinkOpen ? originalLinkOpen(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
};
function escapeHtml(value: string): string {
 return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function validateShareSnapshot(value: unknown): value is ShareSnapshot {
 if (!value || typeof value !== "object") return false;
 const snapshot = value as ShareSnapshot;
 return snapshot.version === 1 && typeof snapshot.title === "string" && snapshot.title.length <= 500 &&
  Array.isArray(snapshot.messages) && snapshot.messages.length > 0 && snapshot.messages.length <= 1000 &&
  new Set(snapshot.messages.map(m => m?.id)).size === snapshot.messages.length &&
  snapshot.messages.every(m => m && typeof m.id === "string" && m.id.length > 0 && m.id.length <= 200 &&
   (m.role === "user" || m.role === "assistant") && Number.isSafeInteger(m.createdAt) && m.createdAt >= 0 &&
   typeof m.markdown === "string" && m.markdown.trim().length > 0);
}
function summary(row: ShareRow, origin: string) {
 return { id: row.id, title: row.title, url: `${origin}/s/${row.token}`, createdAt: row.created_at, revoked: row.revoked_at !== null };
}
async function readBoundedBody(request: Request): Promise<string | null> {
 if (Number(request.headers.get("content-length")) > SHARE_MAX_BYTES) return null;
 const reader = request.body?.getReader();
 if (!reader) return "";
 const decoder = new TextDecoder();
 let size = 0, text = "";
 try {
  while (true) {
   const { done, value } = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > SHARE_MAX_BYTES) { await reader.cancel(); return null; }
   text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
 } finally { reader.releaseLock(); }
}
export async function createShare(request: Request, env: Env, userId: string): Promise<Response> {
 const text = await readBoundedBody(request);
 if (text === null) return jsonResponse({ error: "share_too_large" }, 413);
 let body: { requestId?: unknown; snapshot?: unknown };
 try { body = JSON.parse(text); } catch { return jsonResponse({ error: "invalid_snapshot" }, 400); }
 if (!body || typeof body.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestId) || !validateShareSnapshot(body.snapshot)) {
  return jsonResponse({ error: "invalid_snapshot" }, 400);
 }
 // Store only the documented public fields, never an arbitrary client payload.
 const snapshot: ShareSnapshot = { version: 1, title: body.snapshot.title, messages: body.snapshot.messages.map(m =>
  ({ id: m.id, role: m.role, createdAt: m.createdAt, markdown: m.markdown })) };
 const encoded = JSON.stringify(snapshot);
 const existing = await env.DB.prepare("SELECT * FROM conversation_shares WHERE user_id = ? AND request_id = ?")
  .bind(userId, body.requestId).first<ShareRow>();
 if (existing) {
  if (existing.revoked_at !== null) return jsonResponse({ error: "share_revoked" }, 409);
  if (existing.snapshot_json !== encoded) return jsonResponse({ error: "request_id_conflict" }, 409);
  return jsonResponse(summary(existing, new URL(request.url).origin));
 }
 const bytes = crypto.getRandomValues(new Uint8Array(24));
 const token = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
 const id = crypto.randomUUID(), createdAt = Date.now();
 await env.DB.prepare("INSERT OR IGNORE INTO conversation_shares (id,user_id,request_id,token,title,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?)")
  .bind(id, userId, body.requestId, token, snapshot.title, encoded, createdAt).run();
 const row = await env.DB.prepare("SELECT * FROM conversation_shares WHERE user_id = ? AND request_id = ?")
  .bind(userId, body.requestId).first<ShareRow>();
 if (!row) return jsonResponse({ error: "share_creation_failed" }, 500);
 if (row.snapshot_json !== encoded || row.revoked_at !== null) return jsonResponse({ error: "request_id_conflict" }, 409);
 return jsonResponse(summary(row, new URL(request.url).origin), row.id === id ? 201 : 200);
}
export async function listShares(request: Request, env: Env, userId: string): Promise<Response> {
 const url = new URL(request.url);
 const cursor = decodeCursor(url.searchParams.get("cursor"));
 const rows = await env.DB.prepare("SELECT id,token,title,created_at,revoked_at FROM conversation_shares WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC,id DESC LIMIT 51")
  .bind(userId, cursor?.t ?? null, cursor?.t ?? null, cursor?.t ?? null, cursor?.id ?? null).all<ShareRow>();
 const items = (rows.results || []).slice(0, 50);
 const last = items[items.length - 1];
 return jsonResponse({ items: items.map(row => summary(row, url.origin)), nextCursor: (rows.results?.length || 0) > 50 ? encodeCursor(last.created_at, last.id) : null });
}
export async function revokeShare(env: Env, userId: string, id: string): Promise<Response> {
 const row = await env.DB.prepare("SELECT id FROM conversation_shares WHERE id = ? AND user_id = ?").bind(id, userId).first();
 if (!row) return jsonResponse({ error: "share_not_found" }, 404);
 await env.DB.prepare("UPDATE conversation_shares SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?").bind(Date.now(), id, userId).run();
 return jsonResponse({ ok: true });
}
const publicHeaders = {
 "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0",
 "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer",
 "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
const shareStyle = `
:root{color-scheme:light dark;--bg:#f8f9fc;--surface:#fff;--subtle:#f2f3f8;--text:#24252d;--muted:#626574;--line:#e3e5ed;--accent:#65539b;--tint:#eee9f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
*{box-sizing:border-box}body{margin:0;-webkit-font-smoothing:antialiased}main{width:min(100%,800px);margin:auto;padding:0 28px 44px}.brand{display:flex;align-items:center;gap:10px;padding:26px 0;border-bottom:1px solid var(--line);font-weight:650;letter-spacing:-.02em}.mark{width:30px;height:30px;border-radius:10px;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:20px}.brand-note{margin-left:auto;font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0}header{padding:36px 0 30px}.eyebrow{color:var(--accent);font-size:12px;font-weight:650;letter-spacing:.1em}h1{font-size:clamp(26px,4vw,36px);line-height:1.3;letter-spacing:-.035em;margin:12px 0 16px;overflow-wrap:anywhere}.intro{font-size:14px;line-height:1.7;color:var(--muted);margin:0}.meta{display:flex;align-items:center;gap:10px;margin-top:18px;font-size:12px;color:var(--muted)}.pill{padding:5px 10px;background:var(--tint);color:var(--accent);border-radius:8px}.thread{display:grid;gap:24px}.message-head{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;margin-bottom:10px}.avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--tint);color:var(--accent);font-size:13px}.user .avatar{background:var(--subtle);color:var(--muted)}time{font-size:11px;color:var(--muted);font-weight:400;margin-left:auto}.content{padding:22px 24px;background:var(--surface);border:1px solid var(--line);border-radius:18px;font-size:15px;line-height:1.8;overflow-wrap:anywhere;min-width:0}.user .content{background:var(--subtle);border-color:transparent}.content>:first-child{margin-top:0}.content>:last-child{margin-bottom:0}.content h1{font-size:24px;letter-spacing:-.025em}.content h2{font-size:21px;line-height:1.4}.content h3{font-size:18px;line-height:1.5}.content h4,.content h5,.content h6{font-size:16px;line-height:1.5}.content p{margin:12px 0}.content ul,.content ol{padding-left:24px}.content li+li{margin-top:5px}.content a{color:var(--accent);text-underline-offset:3px}.content pre{background:var(--subtle);padding:16px;border:1px solid var(--line);border-radius:12px;overflow:auto;white-space:pre-wrap;tab-size:4;font-size:13px;line-height:1.65}.content code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.content :not(pre)>code{background:var(--subtle);padding:2px 5px;border-radius:5px;font-size:.9em}.content table{border-collapse:collapse;display:block;overflow-x:auto;font-size:13px;max-width:100%;margin:16px 0}.content th{background:var(--subtle);font-weight:600}.content th,.content td{border:1px solid var(--line);padding:10px 13px;text-align:left}.content blockquote{border-left:3px solid var(--accent);padding:4px 0 4px 16px;margin:16px 0;color:var(--muted)}.content hr{border:0;border-top:1px solid var(--line);margin:24px 0}.attachment{display:inline-block;background:var(--subtle);color:var(--muted);font-size:13px;padding:5px 9px;border-radius:7px}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:20px;display:flex;justify-content:space-between;gap:16px;font-size:12px;line-height:1.7;color:var(--muted)}.empty{min-height:55vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;max-width:460px;margin:auto}.empty .empty-mark{width:64px;height:64px;background:var(--tint);color:var(--accent);border-radius:20px;display:grid;place-items:center;font-size:28px}.empty h1{font-size:24px;margin:24px 0 10px}.empty p{color:var(--muted);font-size:14px;line-height:1.8;margin:0}
@media(max-width:480px){main{padding:0 18px 28px}.brand{padding:20px 0}header{padding:28px 0 24px}.content{padding:18px 16px;font-size:15px}.thread{gap:20px}footer{display:block}footer span{display:block;margin-top:6px}time{font-size:10px}}
@media(prefers-color-scheme:dark){:root{--bg:#14151b;--surface:#1d1e26;--subtle:#23242e;--text:#e8e8f0;--muted:#aaaaba;--line:#343541;--accent:#c6b5f1;--tint:#302940}.mark{background:#7c65b6}}
`;
function sharePage(title: string, content: string): string {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} · Lucky</title><style>${shareStyle}</style></head><body><main><div class="brand"><span class="mark" aria-hidden="true">✦</span><span>Lucky</span><span class="brand-note">对话分享</span></div>${content}<footer><strong>Shared with Lucky</strong><span>内容由分享者提供。AI 生成内容可能存在错误。</span></footer></main></body></html>`;
}
function shareMessageDate(value: number): string {
 // Epochs outside Date's representable range may exist in an old snapshot; don't break the page.
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16).replace("T", " · ") + " UTC";
}
export function renderShare(snapshot: ShareSnapshot): string {
 return sharePage(snapshot.title, `<header><div class="eyebrow">CONVERSATION</div><h1>${escapeHtml(snapshot.title)}</h1><p class="intro">这是分享时保存的对话片段，后续消息不会包含在内。</p><div class="meta"><span class="pill">只读快照</span><span>${snapshot.messages.length} 条消息</span></div></header><section class="thread" aria-label="分享的消息">${snapshot.messages.map(m => `<article class="${m.role}"><div class="message-head"><span class="avatar" aria-hidden="true">${m.role === "user" ? "你" : "✦"}</span><span>${m.role === "user" ? "用户" : "Lucky"}</span><time>${shareMessageDate(m.createdAt)}</time></div><div class="content">${markdown.render(m.markdown)}</div></article>`).join("")}</section>`);
}

export async function publicShare(env: Env, token: string): Promise<Response> {
 const row = /^[a-f0-9]{48}$/.test(token) ? await env.DB.prepare("SELECT * FROM conversation_shares WHERE token = ? AND revoked_at IS NULL").bind(token).first<ShareRow>() : null;
 if (!row) return new Response(sharePage("链接失效", '<section class="empty"><div class="empty-mark" aria-hidden="true">↗</div><h1>此分享链接已失效</h1><p>链接可能已被撤销，或地址不完整。<br>请联系分享者获取新的链接。</p></section>'), { status: 404, headers: publicHeaders });
 return new Response(renderShare(JSON.parse(row.snapshot_json)), { headers: publicHeaders });
}
