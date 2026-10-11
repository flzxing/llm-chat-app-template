import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAppUpdateRequest, rolloutBucket, validateContent, validateReport, maintainAppUpdates, base64url } from '../src/app-updates';
import type { Env } from '../src/types';

const cert = 'a'.repeat(64);
const content = { titles: { 'zh-CN': '新版本', 'en-US': 'A new chapter' }, summaries: { 'zh-CN': '更好的体验', 'en-US': 'A better experience' }, highlights: { 'zh-CN': ['更快'], 'en-US': ['Faster'] }, notes: { 'zh-CN': '修复问题', 'en-US': 'Bug fixes' } };
const report = { packageName: 'com.flzxing.lucky', versionCode: 2, versionName: '1.1', minSdk: 26, targetSdk: 36, abis: ['arm64-v8a'], certificateSha256: cert, sha256: 'b'.repeat(64), bytes: 3, debuggable: false };
const admin = { authorization: 'Bearer editor-secret' };
const publish = { ...admin, 'x-release-credential': 'publisher-secret' };
let configuration: Env;
let publicKey: CryptoKey;
beforeEach(async () => {
 await env.DB.batch(['update_events','update_audit','update_releases','update_upload_parts','update_verification_jobs','update_artifacts','update_rate_limits'].map(t => env.DB.prepare(`DELETE FROM ${t}`)));
 const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
 publicKey = keys.publicKey;
 configuration = { ...env, UPDATE_EDITORS_JSON: JSON.stringify({ editor: 'editor-secret' }), UPDATE_PUBLISHERS_JSON: JSON.stringify({ publisher: 'publisher-secret' }), UPDATE_RELEASE_CERT_SHA256: cert, UPDATE_POLICY_PRIVATE_KEY: base64url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))), UPDATE_POLICY_KEY_ID: 'test-key', UPDATE_VERIFICATION_SECRET: 'test-callback-secret' } as unknown as Env;
 configuration.UPDATE_VERIFY_QUEUE = { send: vi.fn().mockResolvedValue(undefined) } as unknown as Env['UPDATE_VERIFY_QUEUE'];
});
async function call(path: string, method = 'GET', data?: unknown, headers: Record<string,string> = {}) {
 const response = await handleAppUpdateRequest(new Request(`https://luckyaitool.com${path}`, { method, headers: { ...headers, ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }), configuration);
 expect(response).not.toBeNull(); return response!;
}
async function seed(status = 'published', rollout = 100, min = 0, version = 2) {
 const id = crypto.randomUUID(), artifact = crypto.randomUUID(), now = Date.now();
 await configuration.APP_RELEASES.put(`quarantine/${artifact}.apk`, new Uint8Array([1,2,3]));
 await env.DB.prepare('INSERT INTO update_artifacts(id,object_key,file_name,size,status,report_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(artifact, `quarantine/${artifact}.apk`, 'app.apk', 3, 'verified', JSON.stringify({ ...report, versionCode: version }), now, now).run();
 await env.DB.prepare('INSERT INTO update_releases(id,artifact_id,version_code,status,rollout,min_version_code,content_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, artifact, version, status, rollout, min, JSON.stringify(content), now, now).run();
 return { id, artifact };
}
const client = { protocolVersion: 1, packageName: 'com.flzxing.lucky', versionCode: 1, abi: 'arm64-v8a', sdkInt: 26, channel: 'official', installId: 'installation-1234' };
async function policy(input = client) {
 const r = await call('/v1/app-updates/check', 'POST', input); expect(r.status).toBe(200);
 const signed = await r.json<{ payload: string; signature: string; keyId: string }>();
 const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
 expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, bytes(signed.signature), new TextEncoder().encode(signed.payload))).toBe(true);
 return JSON.parse(new TextDecoder().decode(bytes(signed.payload)));
}

describe('official update selection and authorization', () => {
 it('mounts the update router in the main Worker', async () => {
  const response = await SELF.fetch('https://example.com/v1/app-updates/check', { method: 'POST', body: '{}' });
  expect(response.status).toBe(400);
 });
 it('uses numeric versionCode and a verifiable installation-bound policy', async () => {
  await seed(); const p = await policy(); expect(p.release.versionCode).toBe(2); expect(p.installId).toBe(client.installId);
  expect(p.expiresAt - p.issuedAt).toBe(86400000); expect(p.mandatory).toBe(false);
  const same = await policy({ ...client, versionCode: 2 }); expect(same.release).toBeNull();
 });
 it('keeps cohort selection stable and forces minimum-version clients through gray rollout', async () => {
  const r = await seed('published',1,2);
  expect(await rolloutBucket(client.installId,r.id)).toBe(await rolloutBucket(client.installId,r.id));
  const p = await policy(); expect(p.mandatory).toBe(true); expect(p.release.artifactId).toBe(r.artifact);
 });
 it('does not offer paused releases but permits previously selected artifacts', async () => {
  const r = await seed('paused'); expect((await policy()).release).toBeNull();
  const p = await policy({ ...client, artifactId: r.artifact } as typeof client); expect(p.status).toBe('available');
 });
 it('revokes download and installation authorization immediately', async () => {
  const r = await seed('revoked');
  expect((await policy({ ...client, artifactId: r.artifact } as typeof client)).status).toBe('revoked');
  expect((await call(`/assets/app-releases/${r.artifact}.apk`)).status).toBe(410);
 });
 it('serves byte ranges, HEAD and rejects invalid ranges', async () => {
  const r = await seed();
  const partial = await call(`/assets/app-releases/${r.artifact}.apk`, 'GET', undefined, { range: 'bytes=1-2' });
  expect(partial.status).toBe(206); expect(partial.headers.get('content-range')).toBe('bytes 1-2/3'); expect(new Uint8Array(await partial.arrayBuffer())).toEqual(new Uint8Array([2,3]));
  const head = await call(`/assets/app-releases/${r.artifact}.apk`, 'HEAD'); expect(head.headers.get('content-length')).toBe('3'); expect(await head.text()).toBe('');
  expect((await call(`/assets/app-releases/${r.artifact}.apk`, 'GET', undefined, { range: 'bytes=4-' })).status).toBe(416);
 });
 it('official stable link never selects gray or revoked releases', async () => {
  const old = await seed('published',100,0,2); await seed('published',5,0,3);
  const response = await call('/download/luckytool.apk'); expect(response.headers.get('location')).toContain(old.artifact);
 });
});

describe('release control and audit', () => {
 it('separates editing from publication and requires reasons', async () => {
  const r = await seed('draft');
  expect((await call(`/v1/admin/app-updates/releases/${r.id}/publish`, 'POST', { revision:1, reason:'release' }, admin)).status).toBe(403);
  expect((await call(`/v1/admin/app-updates/releases/${r.id}/publish`, 'POST', { revision:1 }, publish)).status).toBe(400);
  expect((await call(`/v1/admin/app-updates/releases/${r.id}/publish`, 'POST', { revision:1, reason:'release' }, publish)).status).toBe(200);
  const audit = await env.DB.prepare('SELECT * FROM update_audit WHERE release_id=?').bind(r.id).first<{actor:string}>(); expect(audit?.actor).toBe('publisher');
  expect((await call(`/v1/admin/app-updates/releases/${r.id}`, 'PUT', { revision:1, content }, publish)).status).toBe(409);
 });
 it('prevents incompatible forced targets and decreasing versions', async () => {
  const r = await seed('draft');
  await env.DB.prepare('UPDATE update_artifacts SET report_json=? WHERE id=?').bind(JSON.stringify({ ...report,minSdk:28 }),r.artifact).run();
  expect((await call(`/v1/admin/app-updates/releases/${r.id}/publish`, 'POST', { revision:1,minVersionCode:2,reason:'security' },publish)).status).toBe(409);
  await seed('published',100,0,3);
  expect((await call(`/v1/admin/app-updates/releases/${r.id}/publish`, 'POST', { revision:1,reason:'publish older' },publish)).status).toBe(409);
 });
 it('activates due scheduled releases idempotently', async () => {
  const r = await seed('scheduled'); await env.DB.prepare('UPDATE update_releases SET scheduled_at=? WHERE id=?').bind(Date.now()-1000,r.id).run();
  await maintainAppUpdates(configuration); await maintainAppUpdates(configuration);
  const row = await env.DB.prepare('SELECT status,revision FROM update_releases WHERE id=?').bind(r.id).first<{status:string;revision:number}>();
  expect(row).toEqual({status:'published',revision:2});
 });
 it('deduplicates telemetry and bounds payloads', async () => {
  const data = {installId:client.installId,events:[{id:'event-12345678',kind:'installed',versionCode:2}]};
  await call('/v1/app-updates/events','POST',data); await call('/v1/app-updates/events','POST',data);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM update_events').first<{count:number}>())?.count).toBe(1);
  expect((await call('/v1/app-updates/events','POST',{...data,events:[{...data.events[0],kind:'invented'}]})).status).toBe(400);
 });
 it('rejects unsigned callbacks and invalid real APK identities', async () => {
  expect((await call('/v1/internal/app-updates/verification','POST',{})).status).toBe(401);
  expect(validateReport(report,{size:3},cert)).toBe(true);
  for (const wrong of [{debuggable:true},{packageName:'attacker.app'},{certificateSha256:'c'.repeat(64)},{sha256:'invalid'},{bytes:4}]) expect(validateReport({...report,...wrong},{size:3},cert)).toBe(false);
  expect(validateContent({...content, titles:{...content.titles, 'fr-FR': 123}})).toBe(false);
  expect(validateContent({...content, highlights:{...content.highlights, 'fr-FR': ['ok', 123]}})).toBe(false);
  expect(validateContent(content)).toBe(true); expect(validateContent({...content,heroUrl:'https://attacker.invalid/a.webp'})).toBe(false);
 });
 it('authenticates verification progress, prevents regression, and finalizes once', async () => {
  const { artifact } = await seed();
  await env.DB.prepare("UPDATE update_artifacts SET status='verifying' WHERE id=?").bind(artifact).run();
  const callback = async (data: unknown, timestamp = String(Date.now())) => {
   const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(configuration.UPDATE_VERIFICATION_SECRET), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
   const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${JSON.stringify(data)}`));
   const signature = Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
   return call('/v1/internal/app-updates/verification','POST',data,{'x-verification-time':timestamp,'x-verification-signature':signature});
  };
  expect((await callback({artifactId:artifact,stage:'manifest'})).status).toBe(200);
  await callback({artifactId:artifact,stage:'hash'});
  expect((await env.DB.prepare('SELECT verification_stage AS stage FROM update_artifacts WHERE id=?').bind(artifact).first<{stage:string}>())?.stage).toBe('manifest');
  expect((await callback({artifactId:artifact,stage:'invented'})).status).toBe(400);
  expect((await callback({artifactId:artifact,report},String(Date.now()-600000))).status).toBe(401);
  expect(await (await callback({artifactId:artifact,report})).json()).toMatchObject({accepted:true});
  expect(await (await callback({artifactId:artifact,report})).json()).toMatchObject({duplicate:true});
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM update_audit WHERE action='verified'").first<{count:number}>())?.count).toBe(1);
 });
 it('restricts update artwork to the serving origin, including isolated staging', () => {
  const origin='https://lucky-updates-staging.example.workers.dev';
  expect(validateContent({...content,heroUrl:origin+'/assets/app-update-art/crystal.webp'},origin)).toBe(true);
  for (const heroUrl of ['https://luckyaitool.com/assets/app-update-art/crystal.webp?redirect=1', 'https://attacker.invalid/assets/app-update-art/crystal.webp','https://name:secret@luckyaitool.com/assets/app-update-art/crystal.webp']) expect(validateContent({...content,heroUrl})).toBe(false);
 });
 it('uploads a small final part and queues verification without buffering a complete APK', async () => {
  const created = await call('/v1/admin/app-updates/uploads','POST',{fileName:'app.apk',bytes:3},admin);
  expect(created.status).toBe(200); const {id} = await created.json<{id:string}>();
  const data = new Uint8Array([1,2,3]); const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
  const uploaded = await handleAppUpdateRequest(new Request(`https://luckyaitool.com/v1/admin/app-updates/uploads/${id}/parts/1`,{method:'PUT',headers:{...admin,'content-length':'3','x-part-sha256':digest},body:data}),configuration);
  expect(uploaded?.status).toBe(200);
  const completed = await call(`/v1/admin/app-updates/uploads/${id}/complete`,'POST',{},admin); expect(completed.status).toBe(200);
  expect(configuration.UPDATE_VERIFY_QUEUE.send).toHaveBeenCalledTimes(1);
  expect((await env.DB.prepare('SELECT status FROM update_artifacts WHERE id=?').bind(id).first<{status:string}>())?.status).toBe('verifying');
  expect((await call(`/assets/app-releases/${id}.apk`)).status).toBe(410);
 });
});
