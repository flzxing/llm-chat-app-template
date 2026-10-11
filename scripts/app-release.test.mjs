import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { envelope, validateIdentity } from './app-release.mjs';
test('Node local signature interoperates with Worker P-256 P1363 and binds exact encoded payload', () => {
 const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
 const proof = envelope({ artifactId: 'artifact-123', nonce: 'nonce', objectVersion: 'version', origin: 'https://luckyaitool.com' }, privateKey, 'mac');
 assert.equal(Buffer.from(proof.signature,'base64url').length,64);
 assert(verify('sha256',Buffer.from(proof.payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(proof.signature,'base64url')));
 assert(!verify('sha256',Buffer.from(proof.payload+'x'),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(proof.signature,'base64url')));
});
test('release machine rejects debug, wrong package, wrong certificate and wrong ABI', () => {
 const config = { packageName: 'com.flzxing.lucky', certificateSha256: 'a'.repeat(64) };
 const report = { ...config, debuggable: false, abis: ['arm64-v8a'] };
 assert.doesNotThrow(()=>validateIdentity(report,config));
 for (const change of [{debuggable:true},{packageName:'attacker'},{certificateSha256:'b'.repeat(64)},{abis:['x86']}]) assert.throws(()=>validateIdentity({...report,...change},config));
});
