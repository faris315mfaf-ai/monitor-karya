#!/usr/bin/env python3
"""Offline source/patch/package verification. Requires Python 3.12+, patch, npm 11.19.1."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess
import tarfile
import tempfile

root = Path(__file__).resolve().parent
provenance = json.loads((root / 'provenance.json').read_text())
archive = root / 'upstream/braces-3.0.3.tgz'
assert 'sha512-' + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode() == provenance['npmIntegrity']
for name, digest in provenance['testSha256'].items():
    assert hashlib.sha256((root / 'test/upstream' / name).read_bytes()).hexdigest() == digest, name
with tempfile.TemporaryDirectory(prefix='mk-braces-reproduce-') as directory:
    temp = Path(directory)
    with tarfile.open(archive) as source:
        source.extractall(temp, filter='data')
    package = temp / 'package'
    subprocess.run(['patch', '-p1', '-i', str(root / 'depth-guard.patch')], cwd=package, check=True, capture_output=True)
    expected = {str(f.relative_to(root / 'package')): f.read_bytes() for f in (root / 'package').rglob('*') if f.is_file()}
    actual = {str(f.relative_to(package)): f.read_bytes() for f in package.rglob('*') if f.is_file()}
    assert actual == expected, 'Vendored source differs from pristine npm tarball + patch'
    result = subprocess.run(['npm', 'pack', str(package), '--ignore-scripts', '--pack-destination', str(temp), '--json'], check=True, capture_output=True, text=True)
    packed = json.loads(result.stdout)[0]
    assert (temp / packed['filename']).read_bytes() == (root / packed['filename']).read_bytes(), 'Tarball is not reproducible'
    print('PASS pristine integrity, all upstream test hashes, source patch, byte-for-byte npm tarball:', packed['integrity'])
