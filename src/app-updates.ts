import type { Env } from './types';
import { createHash } from 'node:crypto';

export const UPDATE_PART_BYTES = 16 * 1024 * 1024;
export const UPDATE_MAX_BYTES = 1024 * 1024 * 1024;
const DAY = 86_400_000;
const PACKAGE = 'com.flzxing.lucky';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
type Artifact = { id: string; object_key: string; file_name: string; size: number; upload_id: string | null; status: string; report_json: string | null; error: string | null; created_at: number };
export type VerificationReport = { packageName: string; versionCode: number; versionName: string; minSdk: number; targetSdk: number; abis: string[]; certificateSha256: string; sha256: string; bytes: number; debuggable: boolean };
export type ReleaseContent = { titles: Record<string, string>; summaries: Record<string, string>; highlights: Record<string, string[]>; notes: Record<string, string>; heroUrl?: string };
type Release = { id: string; artifact_id: string; version_code: number; channel: string; status: string; revision: number; rollout: number; min_version_code: number; scheduled_at: number | null; content_json: string; report_json: string; created_at: number; updated_at: number };
type CheckInput = { protocolVersion: number; packageName: string; versionCode: number; abi: string; sdkInt: number; channel: string; installId: string; locale?: string; artifactId?: string };
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
function unbase64(text: string) { return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
function safeId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value); }
async function boundedBytes(request: Request, limit: number) {
 if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('body_too_large');
 const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
 const chunks: Uint8Array[] = []; let length = 0;
 try { while (true) {
  const chunk = await reader.read(); if (chunk.done) break;
  length += chunk.value.byteLength;
  if (length > limit) { await reader.cancel(); throw new Error('body_too_large'); }
  chunks.push(chunk.value);
 } } finally { reader.releaseLock(); }
 const bytes = new Uint8Array(length); let offset = 0;
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 return bytes;
}
async function body<T>(request: Request): Promise<T> {
 return JSON.parse(new TextDecoder().decode(await boundedBytes(request, 65536))) as T;
}
async function constantEqual(a: string, b: string) {
 const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
 const [x, y] = await Promise.all([digest(a), digest(b)]); let diff = 0;
 for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]; return diff === 0;
}
async function editor(request: Request, env: Env): Promise<string | null> {
 const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
 // Named editor credentials provide attributable auditing; legacy operators retain editing only.
 const keys: Record<string, string> = env.UPDATE_EDITORS_JSON ? JSON.parse(env.UPDATE_EDITORS_JSON) : {};
 for (const [name, value] of Object.entries(keys)) if (token && await constantEqual(token, value)) return name;
 const legacy = env.THEME_ADMIN_TOKEN || env.ADMIN_TOKEN;
 return legacy && token && await constantEqual(token, legacy) ? 'legacy-operator' : null;
}
async function publisher(request: Request, env: Env): Promise<string | null> {
 const token = request.headers.get('x-release-credential') || '';
 const keys: Record<string, string> = env.UPDATE_PUBLISHERS_JSON ? JSON.parse(env.UPDATE_PUBLISHERS_JSON) : {};
 for (const [name, value] of Object.entries(keys)) if (token && await constantEqual(token, value)) return name;
 return null;
}
async function audit(env: Env, actor: string, action: string, id: string | null, reason: string, before: unknown, after: unknown) {
 return env.DB.prepare('INSERT INTO update_audit VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor, action, id, reason.slice(0, 1000), JSON.stringify(before), JSON.stringify(after), Date.now()).run();
}
async function rate(env: Env, key: string, limit: number) {
 const now = Date.now(), window = Math.floor(now / 600000);
 const row = await env.DB.prepare('INSERT INTO update_rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(`${key}:${window}`, now + 1200000).first<{ count: number }>();
 return (row?.count || 0) <= limit;
}
export async function rolloutBucket(installId: string, releaseId: string) {
 const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${installId}:${releaseId}`)));
 return new DataView(hash.buffer).getUint32(0, false) % 100;
}
export function validateContent(value: unknown, origin = 'https://luckyaitool.com'): value is ReleaseContent {
 if (!value || typeof value !== 'object') return false;
 const c = value as ReleaseContent;
 for (const [map, limit] of [[c.titles, 200], [c.summaries, 2000], [c.notes, 20000]] as const) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
  if (Object.entries(map).some(([locale, text]) => !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) || typeof text !== 'string' || !text.trim() || text.length > limit)) return false;
  if (!map['zh-CN'] || !map['en-US']) return false;
 }
 if (!c.highlights || typeof c.highlights !== 'object' || Array.isArray(c.highlights)) return false;
 if (Object.entries(c.highlights).some(([locale, items]) => !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) || !Array.isArray(items) || items.length > 3 || items.some(s => typeof s !== 'string' || !s.trim() || s.length > 300))) return false;
 if (!Array.isArray(c.highlights['zh-CN']) || !Array.isArray(c.highlights['en-US']) || JSON.stringify(value).length > 32000) return false;
 if (!c.heroUrl) return true;
 if (typeof c.heroUrl !== 'string') return false;
 try { const url = new URL(c.heroUrl); return url.origin === origin && !url.username && !url.password && !url.search && !url.hash && /^\/assets\/app-update-art\/[a-zA-Z0-9_-]+\.webp$/.test(url.pathname); } catch { return false; }
}
export function validateReport(report: VerificationReport, artifact: Pick<Artifact, 'size'>, certificate: string, packageName = PACKAGE) {
 return report.packageName === packageName && integer(report.versionCode, 1, 2100000000) && typeof report.versionName === 'string' && report.versionName.length <= 100 && integer(report.minSdk, 1, 1000) && integer(report.targetSdk, report.minSdk, 1000) && report.bytes === artifact.size && report.debuggable === false && report.abis?.includes('arm64-v8a') && /^[a-f0-9]{64}$/.test(report.sha256) && !!certificate && report.certificateSha256 === certificate.toLowerCase().replace(/:/g, '');
}
function releaseView(row: Release, origin: string) {
 const report = JSON.parse(row.report_json) as VerificationReport;
 return { id: row.id, artifactId: row.artifact_id, artifactType: 'full_apk', baseVersionCode: null, versionCode: report.versionCode, versionName: report.versionName, packageName: report.packageName, bytes: report.bytes, sha256: report.sha256, certificateSha256: report.certificateSha256, minSdk: report.minSdk, abis: report.abis, downloadUrl: `${origin}/assets/app-releases/${row.artifact_id}.apk`, content: JSON.parse(row.content_json), revision: row.revision };
}
const JOIN = 'SELECT r.*, a.report_json FROM update_releases r JOIN update_artifacts a ON a.id=r.artifact_id';
async function signPolicy(env: Env, payload: unknown) {
 if (!env.UPDATE_POLICY_PRIVATE_KEY || !env.UPDATE_POLICY_KEY_ID) throw new Error('policy_signing_not_configured');
 const raw = env.UPDATE_POLICY_PRIVATE_KEY.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
 const key = await crypto.subtle.importKey('pkcs8', unbase64(raw), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
 const encoded = base64url(new TextEncoder().encode(JSON.stringify(payload)));
 const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(encoded));
 return { payload: encoded, signature: base64url(new Uint8Array(signature)), keyId: env.UPDATE_POLICY_KEY_ID };
}
async function check(request: Request, env: Env, url: URL) {
 const input = await body<CheckInput>(request);
 if (input.protocolVersion !== 1 || input.packageName !== (env.UPDATE_PACKAGE_NAME || PACKAGE) || !integer(input.versionCode) || !integer(input.sdkInt, 26, 1000) || input.abi !== 'arm64-v8a' || input.channel !== 'official' || !safeId(input.installId)) return json({ error: 'invalid_client' }, 400);
 if (!await rate(env, `check:${input.installId}`, 30)) return json({ error: 'rate_limited' }, 429);
 await activateScheduled(env);
 const rows = (await env.DB.prepare(`${JOIN} WHERE r.channel=? AND r.status IN ('published','paused') AND a.status='verified' ORDER BY r.version_code DESC`).bind(input.channel).all<Release>()).results;
 const compatible = rows.filter(r => { const a = JSON.parse(r.report_json) as VerificationReport; return a.minSdk <= input.sdkInt && a.abis.includes(input.abi); });
 const minVersion = Math.max(0, ...compatible.filter(r => r.status === 'published').map(r => r.min_version_code));
 let selected: Release | undefined;
 if (input.artifactId) selected = compatible.find(r => r.artifact_id === input.artifactId && r.version_code > input.versionCode && r.version_code >= minVersion);
 else for (const r of compatible) {
  if (r.status !== 'published' || r.version_code <= input.versionCode) continue;
  if (input.versionCode < minVersion || await rolloutBucket(input.installId, r.id) < r.rollout) { selected = r; break; }
 }
 const now = Date.now();
 const payload = { protocolVersion: 1, issuedAt: now, expiresAt: now + DAY, installId: input.installId, packageName: env.UPDATE_PACKAGE_NAME || PACKAGE, currentVersionCode: input.versionCode, policyRevision: Math.max(0, ...rows.map(r => r.updated_at)), status: input.artifactId && !selected ? 'revoked' : selected ? 'available' : 'up_to_date', minVersionCode: minVersion, mandatory: !!selected && input.versionCode < minVersion, release: selected ? releaseView(selected, url.origin) : null };
 try { return json(await signPolicy(env, payload)); } catch { return json({ error: 'update_service_not_ready' }, 503); }
}
async function events(request: Request, env: Env) {
 const input = await body<{ installId: string; events: Array<{ id: string; releaseId?: string; kind: string; versionCode: number; detail?: string }> }>(request);
 const kinds = new Set(['checked','offered','deferred','ignored','download_started','download_cancelled','download_complete','install_started','installed','failed']);
 if (!safeId(input.installId) || !Array.isArray(input.events) || input.events.length > 20 || input.events.some(e => !safeId(e.id) || !kinds.has(e.kind) || !integer(e.versionCode) || (e.detail?.length || 0) > 100)) return json({ error: 'invalid_events' }, 400);
 if (!await rate(env, `events:${input.installId}`, 60)) return json({ error: 'rate_limited' }, 429);
 if (input.events.length) await env.DB.batch(input.events.map(e => env.DB.prepare('INSERT OR IGNORE INTO update_events VALUES (?,?,?,?,?,?,?)').bind(e.id, input.installId, e.releaseId || null, e.kind, e.versionCode, e.detail || null, Date.now())));
 return json({ ok: true });
}
async function download(request: Request, env: Env, id: string) {
 const row = await env.DB.prepare("SELECT a.* FROM update_artifacts a WHERE a.id=? AND a.status='verified' AND EXISTS(SELECT 1 FROM update_releases r WHERE r.artifact_id=a.id AND r.status IN ('published','paused'))").bind(id).first<Artifact>();
 if (!row) return json({ error: 'release_unavailable' }, 410);
 const headers = new Headers({ 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="LuckyTool.apk"', 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
 const meta = await env.APP_RELEASES.head(row.object_key); if (!meta) return json({ error: 'artifact_missing' }, 404);
 headers.set('etag', meta.httpEtag);
 let offset = 0, length = meta.size;
 const range = request.headers.get('range');
 if (range && (!request.headers.get('if-range') || request.headers.get('if-range') === meta.httpEtag)) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${meta.size}` } });
  offset = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), meta.size - 1) : meta.size - 1;
  if (!Number.isSafeInteger(offset) || offset >= meta.size || end < offset) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${meta.size}` } });
  length = end - offset + 1; headers.set('content-range', `bytes ${offset}-${end}/${meta.size}`);
 }
 headers.set('content-length', String(length));
 if (request.method === 'HEAD') return new Response(null, { status: headers.has('content-range') ? 206 : 200, headers });
 const object = await env.APP_RELEASES.get(row.object_key, { range: { offset, length } });
 return new Response(object?.body || null, { status: headers.has('content-range') ? 206 : 200, headers });
}
async function verification(request: Request, env: Env) {
 const raw = new TextDecoder().decode(await boundedBytes(request, 16000));
 const timestamp = request.headers.get('x-verification-time') || '';
 if (!env.UPDATE_VERIFICATION_SECRET || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000) return json({ error: 'unauthorized' }, 401);
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.UPDATE_VERIFICATION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`)));
 if (!await constantEqual(expected, request.headers.get('x-verification-signature') || '')) return json({ error: 'unauthorized' }, 401);
 const input = JSON.parse(raw) as { artifactId: string; stage?: string; report?: VerificationReport; error?: string };
 const artifact = await env.DB.prepare('SELECT * FROM update_artifacts WHERE id=?').bind(input.artifactId).first<Artifact>();
 if (!artifact) return json({ error: 'not_found' }, 404);
 if (artifact.status !== 'verifying') return json({ ok: true, duplicate: true });
 if (input.stage) {
  const stages = ['hash', 'signature', 'manifest', 'archive'];
  if (!stages.includes(input.stage) || input.report || input.error) return json({ error: 'invalid_verification_stage' }, 400);
  // Duplicate or reordered progress cannot move the display backwards.
  await env.DB.prepare("UPDATE update_artifacts SET verification_stage=?,updated_at=? WHERE id=? AND status='verifying' AND COALESCE(verification_stage,'') IN (" + ['', ...stages.slice(0, stages.indexOf(input.stage) + 1)].map(() => '?').join(',') + ')')
   .bind(input.stage, Date.now(), artifact.id, '', ...stages.slice(0, stages.indexOf(input.stage) + 1)).run();
  return json({ ok: true });
 }
 const accepted = !!input.report && validateReport(input.report, artifact, env.UPDATE_RELEASE_CERT_SHA256 || '', env.UPDATE_PACKAGE_NAME || PACKAGE);
 await env.DB.batch([
  env.DB.prepare("UPDATE update_artifacts SET status=?, report_json=?, error=?, verification_stage=?, updated_at=? WHERE id=? AND status='verifying'").bind(accepted ? 'verified' : 'rejected', accepted ? JSON.stringify(input.report) : null, accepted ? null : (input.error || 'apk_identity_rejected').slice(0, 500), accepted ? 'complete' : 'rejected', Date.now(), artifact.id),
  env.DB.prepare('UPDATE update_verification_jobs SET completed_at=? WHERE artifact_id=?').bind(Date.now(), artifact.id),
 ]);
 await audit(env, 'apk-verifier', accepted ? 'verified' : 'rejected', null, artifact.id, null, accepted ? input.report : input.error);
 return json({ ok: true, accepted });
}
async function uploads(request: Request, env: Env, path: string, actor: string) {
 if (path === '/v1/admin/app-updates/uploads' && request.method === 'POST') {
  const input = await body<{ fileName: string; bytes: number }>(request);
  if (!integer(input.bytes, 1, UPDATE_MAX_BYTES) || typeof input.fileName !== 'string' || !input.fileName.toLowerCase().endsWith('.apk') || input.fileName.length > 200) return json({ error: 'invalid_apk' }, 400);
  const id = crypto.randomUUID(), key = `quarantine/${id}.apk`, now = Date.now();
  const upload = await env.APP_RELEASES.createMultipartUpload(key, { httpMetadata: { contentType: 'application/vnd.android.package-archive' } });
  try { await env.DB.prepare('INSERT INTO update_artifacts(id,object_key,file_name,size,upload_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, key, input.fileName, input.bytes, upload.uploadId, 'uploading', now, now).run(); } catch (error) { await upload.abort(); throw error; }
  await audit(env, actor, 'upload_created', null, id, null, { bytes: input.bytes });
  return json({ id, partBytes: UPDATE_PART_BYTES, maxConcurrency: 3 });
 }
 const m = /^\/v1\/admin\/app-updates\/uploads\/([a-zA-Z0-9_-]+)(?:\/(parts)(?:\/(\d+))?|\/(complete|retry))?$/.exec(path);
 if (!m) return null;
 const artifact = await env.DB.prepare('SELECT * FROM update_artifacts WHERE id=?').bind(m[1]).first<Artifact>();
 if (!artifact) return json({ error: 'not_found' }, 404);
 if (request.method === 'GET') {
  const parts = (await env.DB.prepare('SELECT part_number,sha256,size FROM update_upload_parts WHERE artifact_id=? ORDER BY part_number').bind(artifact.id).all()).results;
  return json({ ...artifact, upload_id: undefined, object_key: undefined, report: artifact.report_json ? JSON.parse(artifact.report_json) : null, parts, partBytes: UPDATE_PART_BYTES });
 }
 if (m[4] === 'retry' && request.method === 'POST' && artifact.status === 'verifying') {
  await env.UPDATE_VERIFY_QUEUE.send({ artifactId: artifact.id, objectKey: artifact.object_key, bytes: artifact.size }); return json({ ok: true });
 }
 if (m[4] === 'complete' && request.method === 'POST' && ['verifying','verified','rejected'].includes(artifact.status)) return json({ ok: true, status: artifact.status });
 if (artifact.status !== 'uploading' || !artifact.upload_id) return json({ error: 'upload_closed' }, 409);
 const upload = env.APP_RELEASES.resumeMultipartUpload(artifact.object_key, artifact.upload_id);
 if (request.method === 'DELETE') {
  await upload.abort(); await env.DB.prepare("UPDATE update_artifacts SET status='cancelled',updated_at=? WHERE id=? AND status='uploading'").bind(Date.now(), artifact.id).run();
  await audit(env, actor, 'upload_cancelled', null, artifact.id, null, null); return json({ ok: true });
 }
 if (m[3] && request.method === 'PUT') {
  const number = Number(m[3]), count = Math.ceil(artifact.size / UPDATE_PART_BYTES), expectedSize = Math.min(UPDATE_PART_BYTES, artifact.size - (number - 1) * UPDATE_PART_BYTES);
  const size = Number(request.headers.get('content-length')), digest = request.headers.get('x-part-sha256') || '';
  if (!integer(number, 1, count) || size !== expectedSize || !/^[a-f0-9]{64}$/.test(digest) || !request.body) return json({ error: 'invalid_part' }, 400);
  const hasher = createHash('sha256');
  let received = 0;
  const stream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
   received += chunk.byteLength;
   if (received > expectedSize) throw new Error('part_too_large');
   hasher.update(chunk); controller.enqueue(chunk);
  } }));
  // R2 requires a known stream length; retain streaming hash verification without buffering.
  const fixed = new FixedLengthStream(expectedSize);
  const [part] = await Promise.all([upload.uploadPart(number, fixed.readable), stream.pipeTo(fixed.writable)]);
  if (received !== expectedSize || hasher.digest('hex') !== digest) {
   await env.DB.prepare('DELETE FROM update_upload_parts WHERE artifact_id=? AND part_number=?').bind(artifact.id, number).run();
   return json({ error: 'part_hash_mismatch' }, 400);
  }
  await env.DB.prepare('INSERT INTO update_upload_parts VALUES (?,?,?,?,?) ON CONFLICT(artifact_id,part_number) DO UPDATE SET etag=excluded.etag,sha256=excluded.sha256,size=excluded.size').bind(artifact.id, number, part.etag, digest, size).run();
  return json({ number, etag: part.etag });
 }
 if (m[4] === 'complete' && request.method === 'POST') {
  const parts = (await env.DB.prepare('SELECT part_number,etag,size FROM update_upload_parts WHERE artifact_id=? ORDER BY part_number').bind(artifact.id).all<{ part_number: number; etag: string; size: number }>()).results;
  if (parts.length !== Math.ceil(artifact.size / UPDATE_PART_BYTES) || parts.reduce((sum, p) => sum + p.size, 0) !== artifact.size) return json({ error: 'missing_parts' }, 409);
  let object = await env.APP_RELEASES.head(artifact.object_key);
  if (!object) {
   try { object = await upload.complete(parts.map(p => ({ partNumber: p.part_number, etag: p.etag }))); }
   catch (error) { object = await env.APP_RELEASES.head(artifact.object_key); if (!object) throw error; }
  }
  if (object.size !== artifact.size) return json({ error: 'size_mismatch' }, 409);
  await env.DB.batch([
   env.DB.prepare("UPDATE update_artifacts SET status='verifying',upload_id=NULL,updated_at=? WHERE id=? AND status='uploading'").bind(Date.now(), artifact.id),
   env.DB.prepare('INSERT OR IGNORE INTO update_verification_jobs(artifact_id) VALUES (?)').bind(artifact.id),
  ]);
  await dispatchVerification(env, artifact.id, artifact.object_key, artifact.size);
  return json({ ok: true, status: 'verifying' });
 }
 return json({ error: 'method_not_allowed' }, 405);
}
async function dispatchVerification(env: Env, id: string, key: string, bytes: number) {
 await env.UPDATE_VERIFY_QUEUE.send({ artifactId: id, objectKey: key, bytes });
 await env.DB.prepare('UPDATE update_verification_jobs SET dispatched_at=?,attempts=attempts+1 WHERE artifact_id=?').bind(Date.now(), id).run();
}
async function releases(request: Request, env: Env, path: string, actor: string, origin: string) {
 if (path === '/v1/admin/app-updates/releases' && request.method === 'GET') {
  const rows = (await env.DB.prepare(`${JOIN} ORDER BY r.created_at DESC LIMIT 200`).all<Release>()).results;
  const artifacts = (await env.DB.prepare("SELECT id,file_name,size,status,error,report_json,verification_stage,artifact_type FROM update_artifacts WHERE status IN ('verified','verifying','rejected') ORDER BY created_at DESC LIMIT 100").all()).results;
  return json({ releases: rows.map(r => ({ ...r, report: JSON.parse(r.report_json), ...releaseView(r, origin) })), artifacts: artifacts.map(a => ({ ...a, report: a.report_json ? JSON.parse(String(a.report_json)) : null })) });
 }
 if (path === '/v1/admin/app-updates/releases' && request.method === 'POST') {
  const input = await body<{ artifactId: string; content: ReleaseContent }>(request);
  if (!validateContent(input.content, origin)) return json({ error: 'zh_en_content_required' }, 400);
  const artifact = await env.DB.prepare("SELECT * FROM update_artifacts WHERE id=? AND status='verified'").bind(input.artifactId).first<Artifact>();
  if (!artifact?.report_json) return json({ error: 'artifact_not_verified' }, 409);
  const report = JSON.parse(artifact.report_json) as VerificationReport;
  const id = crypto.randomUUID(), now = Date.now();
  try { await env.DB.prepare('INSERT INTO update_releases(id,artifact_id,version_code,content_json,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, artifact.id, report.versionCode, JSON.stringify(input.content), now, now).run(); } catch { return json({ error: 'version_already_exists' }, 409); }
  await audit(env, actor, 'draft_created', id, 'Create release draft', null, input);
  return json({ id });
 }
 const match = /^\/v1\/admin\/app-updates\/releases\/([a-zA-Z0-9_-]+)(?:\/(publish|pause|revoke|preview))?$/.exec(path);
 if (!match) return null;
 const current = await env.DB.prepare(`${JOIN} WHERE r.id=?`).bind(match[1]).first<Release>();
 if (!current) return json({ error: 'not_found' }, 404);
 if (match[2] === 'preview' && request.method === 'GET') return json(releaseView(current, origin));
 if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
 const input = await body<{ revision: number; content?: ReleaseContent; rollout?: number; minVersionCode?: number; scheduledAt?: number | null; reason?: string }>(request);
 if (input.revision !== current.revision) return json({ error: 'revision_conflict' }, 409);
 const action = match[2] || 'edit';
 if (current.status === 'revoked') return json({ error: 'release_revoked' }, 409);
 const privileged = action !== 'edit' || current.status !== 'draft';
 const publishingActor = privileged ? await publisher(request, env) : actor;
 if (!publishingActor) return json({ error: 'publish_credential_required' }, 403);
 const reason = input.reason?.trim() || '';
 if (privileged && !reason) return json({ error: 'reason_required' }, 400);
 const content = input.content || JSON.parse(current.content_json) as ReleaseContent;
 if (!validateContent(content, origin)) return json({ error: 'zh_en_content_required' }, 400);
 const rollout = input.rollout ?? current.rollout, min = input.minVersionCode ?? current.min_version_code;
 if (![1,5,10,25,50,100].includes(rollout) || !integer(min, 0, current.version_code)) return json({ error: 'invalid_policy' }, 400);
 const report = JSON.parse(current.report_json) as VerificationReport;
 // v1 supports API26+ arm64. A compulsory target must serve every supported client.
 if (min > 0 && report.minSdk > 26) return json({ error: 'mandatory_target_incompatible' }, 409);
 if (action === 'publish') {
  if (!env.UPDATE_POLICY_PRIVATE_KEY || !env.UPDATE_RELEASE_CERT_SHA256) return json({ error: 'release_keys_not_configured' }, 503);
  const max = await env.DB.prepare("SELECT MAX(version_code) AS version FROM update_releases WHERE status IN ('published','paused','revoked') AND id<>?").bind(current.id).first<{ version: number | null }>();
  if ((max?.version || 0) >= current.version_code && current.status !== 'paused' && current.status !== 'published') return json({ error: 'version_must_increase' }, 409);
 }
 const scheduledAt = Object.prototype.hasOwnProperty.call(input, 'scheduledAt') ? input.scheduledAt : current.scheduled_at;
 if (scheduledAt != null && !integer(scheduledAt)) return json({ error: 'invalid_schedule' }, 400);
 const status = action === 'publish' ? scheduledAt && scheduledAt > Date.now() ? 'scheduled' : 'published' : action === 'pause' ? 'paused' : action === 'revoke' ? 'revoked' : current.status;
 if (action === 'pause' && !['published','scheduled'].includes(current.status)) return json({ error: 'invalid_transition' }, 409);
 const operation = crypto.randomUUID(), now = Date.now();
 const guardedPublication = action === 'publish' ? " AND NOT EXISTS(SELECT 1 FROM update_releases newer WHERE newer.channel=update_releases.channel AND newer.version_code>update_releases.version_code AND newer.status IN ('published','paused','revoked'))" : '';
 const [updated] = await env.DB.batch([
  env.DB.prepare('UPDATE update_releases SET status=?,revision=revision+1,rollout=?,min_version_code=?,scheduled_at=?,content_json=?,updated_at=?,operation_id=? WHERE id=? AND revision=?' + guardedPublication)
   .bind(status, rollout, min, scheduledAt ?? null, JSON.stringify(content), now, operation, current.id, current.revision),
  env.DB.prepare('INSERT INTO update_audit SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM update_releases WHERE id=? AND operation_id=?)')
   .bind(crypto.randomUUID(), publishingActor, action, current.id, reason || 'Edit draft', JSON.stringify(current), JSON.stringify({ status, rollout, minVersionCode: min, content }), now, current.id, operation),
 ]);
 if (!updated.meta.changes) return json({ error: action === 'publish' ? 'version_or_revision_conflict' : 'revision_conflict' }, 409);
 return json({ ok: true, revision: current.revision + 1 });
}
async function activateScheduled(env: Env) {
 const due = (await env.DB.prepare("SELECT id,revision,channel,version_code FROM update_releases WHERE status='scheduled' AND scheduled_at<=? ORDER BY version_code DESC").bind(Date.now()).all<{ id: string; revision: number; channel: string; version_code: number }>()).results;
 for (const row of due) {
  const now = Date.now(), operation = crypto.randomUUID();
  // Superseded scheduled releases are paused, never made newly visible as a downgrade.
  await env.DB.batch([
   env.DB.prepare("UPDATE update_releases SET status=CASE WHEN EXISTS(SELECT 1 FROM update_releases newer WHERE newer.channel=? AND newer.version_code>? AND newer.status IN ('published','paused','revoked')) THEN 'paused' ELSE 'published' END,revision=revision+1,updated_at=?,operation_id=? WHERE id=? AND status='scheduled' AND revision=?")
    .bind(row.channel, row.version_code, now, operation, row.id, row.revision),
   env.DB.prepare("INSERT INTO update_audit SELECT ?, 'scheduler',status, id, 'Scheduled release evaluated',NULL,?,? FROM update_releases WHERE id=? AND operation_id=?")
    .bind(crypto.randomUUID(), JSON.stringify({ scheduled: true }), now, row.id, operation),
  ]);
 }
}
export async function maintainAppUpdates(env: Env) {
 if (!env.APP_RELEASES || !env.UPDATE_VERIFY_QUEUE) return;
 await activateScheduled(env);
 const expired = (await env.DB.prepare("SELECT * FROM update_artifacts WHERE status='uploading' AND created_at<? LIMIT 50").bind(Date.now() - DAY).all<Artifact>()).results;
 for (const a of expired) {
  if (a.upload_id) { try { await env.APP_RELEASES.resumeMultipartUpload(a.object_key, a.upload_id).abort(); } catch { /* lifecycle may already have removed it */ } }
  await env.APP_RELEASES.delete(a.object_key);
  await env.DB.prepare("UPDATE update_artifacts SET status='expired' WHERE id=? AND status='uploading'").bind(a.id).run();
 }
 const pending = (await env.DB.prepare("SELECT a.* FROM update_artifacts a JOIN update_verification_jobs j ON j.artifact_id=a.id WHERE a.status='verifying' AND j.completed_at IS NULL AND (j.dispatched_at IS NULL OR j.dispatched_at<?) AND j.attempts<4 LIMIT 20").bind(Date.now() - 15 * 60000).all<Artifact>()).results;
 for (const a of pending) await dispatchVerification(env, a.id, a.object_key, a.size);
 await env.DB.batch([
  env.DB.prepare('DELETE FROM update_rate_limits WHERE expires_at<?').bind(Date.now()),
  env.DB.prepare('DELETE FROM update_events WHERE created_at<?').bind(Date.now() - 30 * DAY),
  env.DB.prepare("UPDATE update_artifacts SET status='rejected',error='verification_timeout' WHERE status='verifying' AND id IN(SELECT artifact_id FROM update_verification_jobs WHERE attempts>=4 AND dispatched_at<?)").bind(Date.now() - 15 * 60000),
 ]);
}
export async function handleAppUpdateRequest(request: Request, env: Env): Promise<Response | null> {
 const url = new URL(request.url), path = url.pathname;
 if (!(path.startsWith('/v1/app-updates/') || path.startsWith('/v1/admin/app-updates/') || path === '/v1/internal/app-updates/verification' || path.startsWith('/assets/app-releases/') || path.startsWith('/assets/app-update-art/') || path === '/download/luckytool.apk')) return null;
 if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
 try {
  const art = /^\/assets\/app-update-art\/([a-zA-Z0-9_-]+)\.webp$/.exec(path);
  if (art && ['GET','HEAD'].includes(request.method)) {
   const object = await env.APP_RELEASES.get(`release-art/${art[1]}.webp`);
   return object ? new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'content-type': 'image/webp', 'content-length': String(object.size), 'cache-control': 'public,max-age=31536000,immutable', 'x-content-type-options': 'nosniff' } }) : json({ error: 'not_found' }, 404);
  }
  if (path === '/v1/internal/app-updates/verification' && request.method === 'POST') return await verification(request, env);
  if (path === '/v1/app-updates/check' && request.method === 'POST') return await check(request, env, url);
  if (path === '/v1/app-updates/events' && request.method === 'POST') return await events(request, env);
  const dl = /^\/assets\/app-releases\/([a-zA-Z0-9_-]+)\.apk$/.exec(path);
  if (dl && ['GET','HEAD'].includes(request.method)) return await download(request, env, dl[1]);
  if (path === '/download/luckytool.apk' && ['GET','HEAD'].includes(request.method)) {
   await activateScheduled(env);
   const latest = await env.DB.prepare("SELECT r.artifact_id FROM update_releases r JOIN update_artifacts a ON a.id=r.artifact_id WHERE r.status='published' AND r.rollout=100 AND a.status='verified' ORDER BY r.version_code DESC LIMIT 1").first<{ artifact_id: string }>();
   return latest ? new Response(null, { status: 302, headers: { location: `/assets/app-releases/${latest.artifact_id}.apk`, 'cache-control': 'no-store' } }) : json({ error: 'no_official_release' }, 404);
  }
  if (path.startsWith('/v1/admin/app-updates/')) {
   const actor = await editor(request, env); if (!actor) return json({ error: 'unauthorized' }, 401);
   if (path === '/v1/admin/app-updates/art' && request.method === 'POST') {
    const bytes = await boundedBytes(request, 400 * 1024);
    if (bytes.length < 30 || new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP') return json({ error: 'invalid_webp' }, 400);
    const id = crypto.randomUUID();
    await env.APP_RELEASES.put(`release-art/${id}.webp`, bytes, { httpMetadata: { contentType: 'image/webp' } });
    await audit(env, actor, 'art_uploaded', null, id, null, { bytes: bytes.length });
    return json({ url: `${url.origin}/assets/app-update-art/${id}.webp` });
   }
   if (path === '/v1/admin/app-updates/session') return json({ actor, canEdit: true, publishingRequiresCredential: true });
   if (path === '/v1/admin/app-updates/stats' && request.method === 'GET') {
    const [events, failures] = await Promise.all([env.DB.prepare('SELECT release_id,kind,COUNT(*) AS count,COUNT(DISTINCT install_id) AS devices FROM update_events GROUP BY release_id,kind').all(), env.DB.prepare("SELECT release_id,detail,COUNT(*) AS count FROM update_events WHERE kind='failed' GROUP BY release_id,detail").all()]);
    return json({ events: events.results, failures: failures.results });
   }
   if (path === '/v1/admin/app-updates/audit' && request.method === 'GET') return json({ entries: (await env.DB.prepare('SELECT * FROM update_audit ORDER BY created_at DESC LIMIT 200').all()).results });
   return await uploads(request, env, path, actor) || await releases(request, env, path, actor, url.origin) || json({ error: 'not_found' }, 404);
  }
  return json({ error: 'method_not_allowed' }, 405);
 } catch (error) {
  const message = error instanceof Error ? error.message : 'update_request_failed';
  console.error('LuckyUpdate/Api request_failed', { path, message });
  return json({ error: /JSON|body_too_large/.test(message) ? 'invalid_request' : 'update_request_failed' }, /JSON|body_too_large/.test(message) ? 400 : 500);
 }
}
