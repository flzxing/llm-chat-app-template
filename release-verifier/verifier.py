"""Stream APKs to temporary disk and inspect them with Android's official tools.
Never load APK code, extract arbitrary ZIP paths, or receive signing private keys.
"""
import hashlib
import json
import os
import re
import subprocess
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer

TOOLS = os.environ.get('ANDROID_BUILD_TOOLS', '/opt/android/build-tools/36.0.0')
MAX_BYTES = 1024 ** 3


def inspect_apk(path, size, digest, progress=lambda stage: None):
    signed = subprocess.run([f'{TOOLS}/apksigner', 'verify', '--verbose', '--print-certs', path], capture_output=True, text=True, timeout=240)
    if signed.returncode != 0:
        raise ValueError('invalid_apk_signature')
    progress('signature')
    certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)', signed.stdout)
    if len(certs) != 1:
        raise ValueError('single_signer_required')
    badging = subprocess.run([f'{TOOLS}/aapt2', 'dump', 'badging', path], capture_output=True, text=True, timeout=60)
    if badging.returncode != 0:
        raise ValueError('invalid_android_manifest')
    progress('manifest')
    result = parse_badging(badging.stdout, certs[0], size, digest, path)
    progress('archive')
    return result


def parse_badging(text, certificate, size, digest, path=None):
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", text)
    sdk = re.search(r"(?:minSdkVersion|sdkVersion):'(\d+)'", text)
    target = re.search(r"targetSdkVersion:'(\d+)'", text)
    if not package or not sdk or not target:
        raise ValueError('missing_manifest_identity')
    native = re.search(r"native-code: (.+)", text)
    abis = re.findall(r"'([^']+)'", native[1]) if native else []
    if path:
        with zipfile.ZipFile(path) as archive:
            # Bound pathological archives and ensure APK native libraries agree with badging.
            if len(archive.infolist()) > 100000:
                raise ValueError('too_many_zip_entries')
            embedded = sorted({name.split('/')[1] for name in archive.namelist() if name.startswith('lib/') and name.endswith('.so') and len(name.split('/')) == 3})
            if embedded != sorted(abis):
                raise ValueError('abi_manifest_mismatch')
    return dict(packageName=package[1], versionCode=int(package[2]), versionName=package[3], minSdk=int(sdk[1]), targetSdk=int(target[1]), abis=abis, certificateSha256=certificate.lower(), sha256=digest, bytes=size, debuggable='application-debuggable' in text)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/verify':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('content-length', '0'))
            if not 0 < length <= MAX_BYTES:
                raise ValueError('invalid_apk_size')
            with tempfile.TemporaryDirectory(prefix='lucky-verify-') as directory:
                path = os.path.join(directory, 'artifact.apk')
                remaining, digest = length, hashlib.sha256()
                self.connection.settimeout(120)
                with open(path, 'wb') as output:
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError('truncated_apk')
                        output.write(chunk)
                        digest.update(chunk)
                        remaining -= len(chunk)
                self.send_response(200)
                self.send_header('content-type', 'application/x-ndjson')
                self.send_header('connection', 'close')
                self.end_headers()
                self.stream_started = True
                self.emit({'stage': 'hash'})
                result = {'report': inspect_apk(path, length, digest.hexdigest(), lambda stage: self.emit({'stage': stage}))}
        except (ValueError, subprocess.TimeoutExpired, zipfile.BadZipFile) as error:
            result = {'error': str(error)[:200]}
        except Exception:
            self.send_error(503, 'verification_service_failed')
            return
        if getattr(self, 'stream_started', False):
            self.emit(result)
            return
        payload = json.dumps(result).encode()
        self.send_response(200)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def emit(self, value):
        self.wfile.write((json.dumps(value) + '\n').encode())
        self.wfile.flush()

    def log_message(self, format, *args):
        pass  # Never log signed artifact URLs or credentials.


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
