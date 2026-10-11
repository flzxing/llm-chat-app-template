/** Explicit online QA: never publishes a release to the production origin. */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID, createPublicKey, createPrivateKey, verify } from 'node:crypto';
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs,v,i,a)=>v.startsWith('--')?[...pairs,[v.slice(2),a[i+1]]]:pairs,[]));
const config = JSON.parse(readFileSync(options.config,'utf8'));
const secrets = JSON.parse(readFileSync(options.secrets,'utf8'));
const origin = config.origin, headers = {authorization:`Bearer ${config.editorToken}`};
const evidence = {time:new Date().toISOString(),origin,checks:[]};
const check=(name,ok)=>{assert(ok,name);evidence.checks.push({name,passed:true});console.log(name);};
async function call(path,method='GET',data,extra={}) {
 const response = await fetch(origin+path,{method,redirect:'manual',headers:{...headers,...extra,...(data===undefined?{}:{'content-type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
 const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
 return {response,body};
}
const input={protocolVersion:1,packageName:config.packageName,versionCode:1,abi:'arm64-v8a',sdkInt:26,channel:'official',installId:`smoke-${randomUUID()}`};
async function policy(extra={}) {
 const {response,body}=await call('/v1/app-updates/check','POST',{...input,...extra});
 assert.equal(response.status,200);
 const value=secrets.UPDATE_POLICY_PRIVATE_KEY;
 const pub=createPublicKey(createPrivateKey(value.includes('BEGIN') ? value : {key:Buffer.from(value,'base64'),format:'der',type:'pkcs8'}));
 assert(verify('sha256',Buffer.from(body.payload),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(body.signature,'base64url')));
 return JSON.parse(Buffer.from(body.payload,'base64url'));
}
try {
 check('unsigned attestation rejected',(await call('/v1/internal/app-updates/verification','POST',{})).response.status===401);
 check('editor session authenticated',(await call('/v1/admin/app-updates/session')).response.status===200);
 check('ops entry live',(await fetch(origin+'/ops/releases')).status===200);
 check('policy signature and binding',(await policy()).installId===input.installId);
 if (!origin.includes('staging')) {
  assert.equal(origin,'https://luckyaitool.com');
  const {body:upload}=await call('/v1/admin/app-updates/uploads','POST',{fileName:'smoke-invalid.apk',bytes:3});
  evidence.artifactId=upload.id;
  const part=await fetch(origin+`/v1/admin/app-updates/uploads/${upload.id}/parts/1`,{method:'PUT',headers:{...headers,'x-part-sha256':'0'.repeat(64)},body:Buffer.from([1,2,3])});
  check('free Worker streams upload',part.status===200);
  check('multipart completion awaits local proof',(await call(`/v1/admin/app-updates/uploads/${upload.id}/complete`,'POST',{})).body.status==='verifying');
  const source=await call(`/v1/admin/app-updates/uploads/${upload.id}/source`);
  check('read-back object accessible only to editor',source.response.status===200 && !!source.response.headers.get('x-artifact-version'));
  check('unverified object private',(await fetch(origin+`/assets/app-releases/${upload.id}.apk`)).status===410);
  const content={titles:{'zh-CN':'测试','en-US':'Test'},summaries:{'zh-CN':'测试','en-US':'Test'},highlights:{'zh-CN':[],'en-US':[]},notes:{'zh-CN':'测试','en-US':'Test'}};
  check('unverified object cannot create release',(await call('/v1/admin/app-updates/releases','POST',{artifactId:upload.id,content})).response.status===409);
  const rejected = spawnSync(process.execPath, [fileURLToPath(new URL('./app-release.mjs', import.meta.url)), '--verify', '--artifact', upload.id, '--config', options.config], {encoding:'utf8',timeout:360000});
  check('real SDK rejects invalid APK and signed rejection reaches production', rejected.status===1 && (await call(`/v1/admin/app-updates/uploads/${upload.id}`)).body.status==='rejected');
  check('test upload cleaned',(await call(`/v1/admin/app-updates/uploads/${upload.id}`,'DELETE')).response.status===200);
  check('cancelled source no longer accessible',(await call(`/v1/admin/app-updates/uploads/${upload.id}/source`)).response.status===409);
  evidence.note='No production release published; invalid test object deleted.';
 } else {
  assert(options.artifact,'--artifact required for staged publication');
  const artifact=options.artifact;
  const content={titles:{'zh-CN':'免费 Worker 全链路验收','en-US':'Free Worker pipeline QA'},summaries:{'zh-CN':'隔离 QA，不面向正式用户','en-US':'Isolated QA only'},highlights:{'zh-CN':['本地真实签名校验'],'en-US':['Local SDK verification']},notes:{'zh-CN':'测试上传、验签、发布、Range、暂停和撤回。','en-US':'Validate upload, attestation, delivery, pause and withdrawal.'}};
  const created=await call('/v1/admin/app-updates/releases','POST',{artifactId:artifact,content});
  assert.equal(created.response.status,200);const id=created.body.id;evidence.releaseId=id;evidence.artifactId=artifact;
  let revision=1;
  check('editor cannot publish',(await call(`/v1/admin/app-updates/releases/${id}/publish`,'POST',{revision,reason:'QA'})).response.status===403);
  const publisher={'x-release-credential':Object.values(JSON.parse(secrets.UPDATE_PUBLISHERS_JSON))[0]};
  async function action(name,data={}) {
   const result=await call(`/v1/admin/app-updates/releases/${id}/${name}`,'POST',{revision,reason:'Free Worker local-attestation acceptance',...data},publisher);
   assert.equal(result.response.status,200,JSON.stringify(result.body));revision=result.body.revision;
  }
  await action('publish',{scheduledAt:Date.now()+3600000,rollout:100});
  check('scheduled release stays hidden',(await policy()).release?.artifactId!==artifact);
  await action('pause');await action('publish',{scheduledAt:null,rollout:100});
  const selected=await policy();check('published release selected',selected.release?.artifactId===artifact && !selected.mandatory);
  const download=`/assets/app-releases/${artifact}.apk`;
  const range=await fetch(origin+download,{headers:{range:'bytes=0-63'}});
  const rangeBytes=Buffer.from(await range.arrayBuffer());
  check('Range delivery',range.status===206 && rangeBytes.length===64 && range.headers.get('content-range')?.startsWith('bytes 0-63/'));
  if(options.apk) check('Range bytes match actual APK',rangeBytes.equals(readFileSync(options.apk).subarray(0,64)));
  const head=await fetch(origin+download,{method:'HEAD'});check('HEAD length and ETag',head.status===200 && Number(head.headers.get('content-length'))===selected.release.bytes && !!head.headers.get('etag'));
  check('stable download points to 100% verified release',(await fetch(origin+'/download/luckytool.apk',{redirect:'manual'})).headers.get('location')?.includes(artifact));
  await action('publish',{rollout:1,minVersionCode:selected.release.versionCode});
  check('mandatory users bypass gray bucket',(await policy()).mandatory);
  await action('pause');
  check('paused release stops new exposure',(await policy()).release?.artifactId!==artifact);
  check('paused release preserves existing authorization',(await policy({artifactId:artifact})).status==='available');
  await action('revoke');
  check('revocation blocks download',(await fetch(origin+download)).status===410);
  check('revocation blocks installation authorization',(await policy({artifactId:artifact})).status==='revoked');
  const event={installId:input.installId,events:[{id:`smoke-${randomUUID()}`,releaseId:id,kind:'checked',versionCode:1}]};
  await call('/v1/app-updates/events','POST',event);await call('/v1/app-updates/events','POST',event);
  check('events and stats available',(await call('/v1/admin/app-updates/stats')).response.status===200);
  check('audit available',(await call('/v1/admin/app-updates/audit')).body.entries.some(e=>e.release_id===id && e.action==='revoke'));
  evidence.note='Real QA APK verified by local SDK and signed report. QA release revoked after acceptance; no production publication.';
 }
} finally {writeFileSync(options.evidence,JSON.stringify(evidence,null,2)+'\n');}
