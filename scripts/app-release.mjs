#!/usr/bin/env node
/** Release-time tooling only. No daemon, Docker, browser-held key, or npm dependencies. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, mkdtempSync, rmSync, createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const root = dirname(fileURLToPath(import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i+1]?.startsWith('--') || !a[i+1] ? true : a[i+1]] : []).filter(v => v.length));
const defaultDirectory = join(homedir(), '.config/luckytool-release');
export function envelope(payload, privateKey, keyId) {
 const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
 return { keyId, payload: encoded, signature: sign('sha256', Buffer.from(encoded), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
}
export function validateIdentity(report, config) {
 if (report.packageName !== config.packageName || report.certificateSha256 !== config.certificateSha256 || report.debuggable || !report.abis.includes('arm64-v8a')) throw new Error('APK identity rejected: expected official package, registered certificate, arm64 and non-debuggable build');
}
function protectedJson(path) {
 if (statSync(path).mode & 0o077) throw new Error(`Credentials must have mode 600: ${path}`);
 return JSON.parse(readFileSync(path, 'utf8'));
}
async function run() {
 if (options.help || (!options.init && !options.upload && !options.verify)) {
  console.log('Usage:\n node scripts/app-release.mjs --init [--directory DIR] [--secrets FILE]\n node scripts/app-release.mjs --upload --apk FILE [--config FILE]\n node scripts/app-release.mjs --verify --artifact ID [--config FILE]\nOptional --evidence FILE saves a public result (no credentials). --build-tools DIR selects Android SDK build-tools (default 36.0.0).'); return;
 }
 const directory = resolve(String(options.directory || defaultDirectory));
 if (options.init) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const configFile = join(directory, 'release-config.json'), privateFile = join(directory, 'attestation-private.pem');
  if (existsSync(configFile) || existsSync(privateFile)) throw new Error('Release identity already exists; refusing to overwrite. Back up and rotate deliberately.');
  const secrets = protectedJson(String(options.secrets || join(directory, 'worker-production-secrets.json')));
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyId = 'release-mac-v1';
  writeFileSync(privateFile, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  writeFileSync(join(directory, 'attestation-worker-secrets.json'), JSON.stringify({ UPDATE_ATTESTATION_PUBLIC_KEYS_JSON: JSON.stringify({ [keyId]: publicKey }) }, null, 2), { mode: 0o600 });
  writeFileSync(configFile, JSON.stringify({ origin: 'https://luckyaitool.com', packageName: 'com.flzxing.lucky', certificateSha256: secrets.UPDATE_RELEASE_CERT_SHA256, editorToken: Object.values(JSON.parse(secrets.UPDATE_EDITORS_JSON))[0], keyId, privateKeyFile: privateFile }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(`Created ${configFile}\nBack up the private key securely. Deploy attestation-worker-secrets.json with wrangler secret bulk before verification.`); return;
 }
 const configFile = resolve(String(options.config || join(directory, 'release-config.json')));
 const config = protectedJson(configFile);
 const origin = new URL(config.origin);
 if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Use an HTTPS origin without path or credentials');
 if (statSync(config.privateKeyFile).mode & 0o077) throw new Error('Attestation private key must have mode 600');
 const privateKey = readFileSync(config.privateKeyFile, 'utf8');
 const headers = { authorization: `Bearer ${config.editorToken}` };
 async function request(path, method = 'GET', data) {
  const response = await fetch(origin.origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(300000), headers: { ...headers, ...(data === undefined ? {} : { 'content-type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${result.error || 'request failed'}`);
  return result;
 }
 const tools = String(options['build-tools'] || process.env.ANDROID_BUILD_TOOLS || join(process.env.ANDROID_HOME || join(homedir(), 'Library/Android/sdk'), 'build-tools/36.0.0'));
 function inspect(path) {
  const parsed = spawnSync('python3', [join(root, 'apk_inspect.py'), path], { env: { ...process.env, ANDROID_BUILD_TOOLS: tools }, encoding: 'utf8', timeout: 360000, maxBuffer: 1024 * 1024 });
  if (parsed.status !== 0) throw new Error(`Android SDK verification failed: ${(parsed.stderr || parsed.error?.message || 'tool unavailable').slice(-600)}`);
  const report = JSON.parse(parsed.stdout); validateIdentity(report, config); return report;
 }
 let artifactId = String(options.artifact || '');
 let localReport;
 if (options.upload) {
  if (!options.apk) throw new Error('--apk required');
  const apk = resolve(String(options.apk));
  console.log('Inspecting local APK with Android SDK…'); localReport = inspect(apk);
  const created = await request('/v1/admin/app-updates/uploads', 'POST', { fileName: apk.split('/').pop(), bytes: localReport.bytes });
  artifactId = created.id; console.log(`Artifact: ${artifactId} (keep this ID for --verify retry)`);
  const { open } = await import('node:fs/promises');
  const source = await open(apk, 'r');
  try {
   for (let offset = 0, part = 1; offset < localReport.bytes; offset += created.partBytes, part++) {
    const bytes = Buffer.alloc(Math.min(created.partBytes, localReport.bytes - offset));
    const { bytesRead } = await source.read(bytes, 0, bytes.length, offset);
    if (bytesRead !== bytes.length) throw new Error('Local APK changed during upload');
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
     const response = await fetch(`${origin.origin}/v1/admin/app-updates/uploads/${artifactId}/parts/${part}`, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(300000), headers: { ...headers, 'x-part-sha256': createHash('sha256').update(bytes).digest('hex') }, body: bytes });
     if (response.ok) done = true;
     else if (attempt === 2 || [401,409].includes(response.status)) throw new Error(`Part ${part}: HTTP ${response.status}`);
    }
    console.log(`Uploaded ${Math.min(offset + bytes.length, localReport.bytes)} / ${localReport.bytes} bytes`);
   }
  } finally { await source.close(); }
  await request(`/v1/admin/app-updates/uploads/${artifactId}/complete`, 'POST', {});
 }
 if (!/^[a-zA-Z0-9_-]{8,100}$/.test(artifactId)) throw new Error('Valid --artifact ID required');
 const artifact = await request(`/v1/admin/app-updates/uploads/${artifactId}`);
 if (artifact.status === 'verified') { console.log('Already verified; no duplicate report submitted.'); return; }
 if (artifact.status !== 'verifying') throw new Error(`Artifact status ${artifact.status}; complete upload before verification`);
 const temp = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'lucky-apk-inspect-'));
 let report, error;
 try {
  console.log('Reading back the actual cloud object and verifying…');
  const response = await fetch(`${origin.origin}/v1/admin/app-updates/uploads/${artifactId}/source`, { headers, redirect: 'error', signal: AbortSignal.timeout(600000) });
  if (!response.ok || response.headers.get('x-artifact-version') !== artifact.object_version || Number(response.headers.get('content-length')) !== artifact.size) throw new Error('Cloud object identity mismatch');
  const apk = join(temp, 'artifact.apk');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(apk, { mode: 0o600 }));
  if (statSync(apk).size !== artifact.size) throw new Error('Cloud download truncated');
  try { report = inspect(apk); if (localReport && report.sha256 !== localReport.sha256) throw new Error('Read-back SHA-256 differs from uploaded source'); }
  catch (cause) { error = cause.message.slice(0, 500); report = undefined; }
 } finally { rmSync(temp, { recursive: true, force: true }); }
 const payload = { artifactId, origin: origin.origin, issuedAt: Date.now(), nonce: artifact.verification_nonce, objectVersion: artifact.object_version, ...(report ? { report } : { error }) };
 const result = await request('/v1/internal/app-updates/verification', 'POST', envelope(payload, privateKey, config.keyId));
 const evidence = { checkedAt: new Date().toISOString(), origin: origin.origin, artifactId, objectVersion: artifact.object_version, accepted: result.accepted, report: report || null, error: error || null };
 if (options.evidence) writeFileSync(String(options.evidence), JSON.stringify(evidence, null, 2) + '\n');
 if (!result.accepted) throw new Error(error || 'Server rejected APK identity');
 console.log(`Verified ${report.packageName} ${report.versionName} (#${report.versionCode})\nSHA-256 ${report.sha256}\nOpen ${origin.origin}/ops/releases to create and publish a draft.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(error => { console.error(error.message); process.exitCode = 1; });
