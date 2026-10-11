#!/usr/bin/env python3
"""Exercise isolated staging with a real QA APK. Never accepts official packages.
--local-container consumes a verification job using the same image locally when
Cloudflare Containers is unavailable. The resulting evidence explicitly records
that queue delivery and cloud container execution were not tested.
Credentials must be read from a protected file outside the repository.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import json
from pathlib import Path
import time
from urllib.parse import urlparse
import requests

parser = argparse.ArgumentParser()
parser.add_argument('--apk', required=True, type=Path)
parser.add_argument('--secrets', required=True, type=Path)
parser.add_argument('--origin', required=True)
parser.add_argument('--evidence', required=True, type=Path)
parser.add_argument('--local-container', help='Loopback HTTP container URL; never used by production')
args = parser.parse_args()
assert urlparse(args.origin).scheme == 'https' and 'staging' in urlparse(args.origin).hostname
secrets = json.loads(args.secrets.read_text())
editor = next(iter(json.loads(secrets['UPDATE_EDITORS_JSON']).values()))
publisher = next(iter(json.loads(secrets['UPDATE_PUBLISHERS_JSON']).values()))
headers = {'authorization': 'Bearer ' + editor}
def call(path, method='GET', data=None, extra=None):
    r = requests.request(method, args.origin + path, headers={**headers, **(extra or {})}, json=data, timeout=120)
    if not r.ok:
        raise RuntimeError(f'{path}: HTTP {r.status_code} {r.text[:300]}')
    return r.json()
size = args.apk.stat().st_size
with args.apk.open('rb') as f:
    digest = hashlib.sha256()
    for chunk in iter(lambda: f.read(1024 * 1024), b''): digest.update(chunk)
sha256 = digest.hexdigest()
upload = call('/v1/admin/app-updates/uploads', 'POST', {'fileName': args.apk.name, 'bytes': size})
artifact = upload['id']
part_size = 16 * 1024 * 1024

def part(number):
    with args.apk.open('rb') as f:
        f.seek((number - 1) * part_size)
        data = f.read(part_size)
    for attempt in range(3):
        r = requests.put(args.origin + f'/v1/admin/app-updates/uploads/{artifact}/parts/{number}', headers={**headers, 'x-part-sha256': hashlib.sha256(data).hexdigest()}, data=data, timeout=180)
        if r.ok: return number
        if attempt == 2: raise RuntimeError(f'part {number}: {r.status_code} {r.text[:200]}')
        time.sleep(attempt + 1)
with ThreadPoolExecutor(max_workers=3) as pool:
    for number in pool.map(part, range(1, (size + part_size - 1) // part_size + 1)):
        print(f'Uploaded part {number}', flush=True)
call(f'/v1/admin/app-updates/uploads/{artifact}/complete', 'POST', {})
execution = 'cloud_queue_container'
if args.local_container:
    assert urlparse(args.local_container).hostname in ['localhost', '127.0.0.1']
    execution = 'local_container_authenticated_callback_cloud_queue_NOT_VERIFIED'
    with args.apk.open('rb') as f:
        r = requests.post(args.local_container + '/verify', data=f, timeout=600)
    r.raise_for_status()
    for line in r.text.splitlines():
        result = json.loads(line)
        if result.get('report'):
            report = result['report']
            assert report['packageName'] == 'com.flzxing.lucky.updateqa'
            assert report['sha256'] == sha256 and report['bytes'] == size and not report['debuggable']
        raw = json.dumps({'artifactId': artifact, **result}, separators=(',', ':'))
        timestamp = str(int(time.time() * 1000))
        signature = hmac.new(secrets['UPDATE_VERIFICATION_SECRET'].encode(), (timestamp + '.' + raw).encode(), hashlib.sha256).hexdigest()
        r = requests.post(args.origin + '/v1/internal/app-updates/verification', data=raw, headers={'content-type': 'application/json', 'x-verification-time': timestamp, 'x-verification-signature': signature}, timeout=60)
        if not r.ok: raise RuntimeError(f'verification: HTTP {r.status_code} {r.text[:300]}')
for _ in range(120):
    verified = call(f'/v1/admin/app-updates/uploads/{artifact}')
    if verified['status'] in ['verified', 'rejected']: break
    time.sleep(5)
assert verified['status'] == 'verified', verified.get('error') or verified['status']
report = verified['report']
assert report['packageName'] == 'com.flzxing.lucky.updateqa' and report['sha256'] == sha256
content = {
 'titles': {'zh-CN': '更进一步，灵感如新', 'en-US': 'A brighter next chapter'},
 'summaries': {'zh-CN': '这次更新，让每一次灵感都更从容落地。', 'en-US': 'A smoother, more dependable space for your next idea.'},
 'highlights': {'zh-CN': ['更流畅的对话与创作体验', '可靠的后台下载与安全校验', '精心打磨的细节与交互'], 'en-US': ['Smoother conversations and creation', 'Dependable downloads with verified identity', 'Thoughtful details throughout']},
 'notes': {'zh-CN': '隔离测试版本：验证真实全量包下载、签名校验、系统安装与升级后数据保留。', 'en-US': 'Isolated QA build: validates full APK download, identity checks, system installation and retained app data.'}
}
release = call('/v1/admin/app-updates/releases', 'POST', {'artifactId': artifact, 'content': content})
call('/v1/admin/app-updates/releases/' + release['id'] + '/publish', 'POST', {'revision': 1, 'rollout': 100, 'minVersionCode': 0, 'reason': 'Isolated QA real APK update validation'}, {'x-release-credential': publisher})
args.evidence.parent.mkdir(parents=True, exist_ok=True)
args.evidence.write_text(json.dumps({'artifactId': artifact, 'releaseId': release['id'], 'report': report, 'verificationExecution': execution, 'origin': args.origin}, indent=2))
print('QA release published; verification mode: ' + execution)
