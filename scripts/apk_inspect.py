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


if __name__ == '__main__':
    import sys
    path = sys.argv[1]
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    print(json.dumps(inspect_apk(path, os.path.getsize(path), digest.hexdigest())))
