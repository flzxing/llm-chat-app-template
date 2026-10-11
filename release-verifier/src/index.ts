import { Container, getContainer } from '@cloudflare/containers';

export class ApkVerifier extends Container {
 defaultPort = 8080;
 sleepAfter = '2m';
}
interface Env {
 APK_VERIFIER: DurableObjectNamespace<ApkVerifier>;
 APP_RELEASES: R2Bucket;
 RELEASE_API: Fetcher;
 UPDATE_VERIFICATION_SECRET: string;
}
type Job = { artifactId: string; objectKey: string; bytes: number };
async function report(env: Env, input: unknown) {
 const raw = JSON.stringify(input), timestamp = String(Date.now());
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.UPDATE_VERIFICATION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
 const hex = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
 const response = await env.RELEASE_API.fetch('https://luckyaitool.com/v1/internal/app-updates/verification', { method: 'POST', headers: { 'content-type': 'application/json', 'x-verification-time': timestamp, 'x-verification-signature': hex }, body: raw });
 if (!response.ok) throw new Error(`report_rejected_${response.status}`);
}
export default {
 async fetch() { return new Response('Not Found', { status: 404 }); },
 async queue(batch: MessageBatch<Job>, env: Env) {
  for (const message of batch.messages) {
   const job = message.body;
   try {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(job.artifactId) || job.objectKey !== `quarantine/${job.artifactId}.apk`) throw new Error('invalid_job');
    const object = await env.APP_RELEASES.get(job.objectKey);
    if (!object || object.size !== job.bytes) throw new Error('artifact_missing');
    const container = getContainer(env.APK_VERIFIER, job.artifactId);
    const response = await container.fetch('http://container/verify', { method: 'POST', body: object.body, headers: { 'content-length': String(job.bytes), 'content-type': 'application/vnd.android.package-archive' }, signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`container_${response.status}`);
    const reader = response.body!.getReader(), decoder = new TextDecoder();
    let pending = '', total = 0, finalized = false;
    const consume = async (line: string) => {
     if (!line.trim()) return;
     const result = JSON.parse(line) as { stage?: string; report?: unknown; error?: string };
     if (finalized) throw new Error('unexpected_verifier_output');
     if (result.report || result.error) finalized = true;
     else if (!['hash','signature','manifest','archive'].includes(result.stage || '')) throw new Error('invalid_verifier_progress');
     await report(env, { artifactId: job.artifactId, ...result });
    };
    try { while (true) {
     const chunk = await reader.read(); if (chunk.done) break;
     total += chunk.value.byteLength; if (total > 65536) throw new Error('verifier_response_too_large');
     pending += decoder.decode(chunk.value, { stream: true });
     let newline: number;
     while ((newline = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, newline); pending = pending.slice(newline + 1); await consume(line); }
    }
    await consume(pending + decoder.decode());
    if (!finalized) throw new Error('incomplete_verifier_response');
    message.ack();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
   } catch (error) {
    console.error('LuckyUpdate/Verifier failed', { artifactId: job.artifactId, attempt: message.attempts, error: String(error) });
    message.retry({ delaySeconds: 30 * Math.min(message.attempts, 5) });
   }
  }
 },
} satisfies ExportedHandler<Env, Job>;
