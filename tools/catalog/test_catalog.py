#!/usr/bin/env python3
"""End-to-end check of a built catalog with an ephemeral key.

usage: test_catalog.py <out dir of build.py>

Copies the unsigned catalog, signs the copy with a throwaway Ed25519 key
(`zdefc bank keygen --pem`, never stored outside a temporary directory) and
verifies it with `zdefc catalog verify` — manifest signature, bank hashes and
header signatures, every shard hash, every shard definition loading
canonically under its own index keys, the content digest. Then cross-checks
the manifest and shards with an independent CBOR decoder (cbor2).
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

import cbor2

ZDEFC = os.environ.get('ZDEFC', 'zdefc').split()


def zdefc(*args, **kw):
    env = {k: v for k, v in os.environ.items() if k != 'ZDEF_SIGNING_KEY'}
    return subprocess.run(ZDEFC + list(args), check=True, capture_output=True, text=True, env=env, **kw).stdout


def main(out):
    m = cbor2.loads(open(os.path.join(out, 'manifest.cbor'), 'rb').read())
    assert m[0] == 1, 'manifest format'
    assert len(m[5]) == 256, 'manifest shard list'
    shards = sorted(glob.glob(os.path.join(out, 'shard-*.cbor')))
    assert len(shards) == sum(1 for h in m[5] if h is not None)
    for p in shards:
        for rec in cbor2.loads(open(p, 'rb').read()):
            keys = rec[0] if isinstance(rec[0], list) else [rec[0]]
            assert all(k >> 56 == int(os.path.basename(p)[6:8], 16) for k in keys), f'{p}: key outside the shard'
            assert isinstance(rec[2], bytes)
    banks = [b[0] for b in m[4]]
    assert banks, 'no banks'
    assert not os.path.exists(os.path.join(out, 'manifest.cose')), 'build output must be unsigned'

    with tempfile.TemporaryDirectory() as tmp:
        cat = os.path.join(tmp, 'catalog')
        shutil.copytree(out, cat, ignore=shutil.ignore_patterns('src', 'plan.json'))
        key = os.path.join(tmp, 'test-key.pem')
        zdefc('bank', 'keygen', '-o', key, '--pem')
        pub = zdefc('bank', 'pubkey', '--key', key).split()[2]
        print(zdefc('catalog', 'sign', cat, '--key', key).strip())
        print(zdefc('catalog', 'verify', cat, '--pubkey', pub).strip())
        # a wrong key and a tampered shard are rejected
        other = os.path.join(tmp, 'other.pem')
        zdefc('bank', 'keygen', '-o', other, '--pem')
        wrong = zdefc('bank', 'pubkey', '--key', other).split()[2]
        try:
            zdefc('catalog', 'verify', cat, '--pubkey', wrong)
            raise SystemExit('verify accepted a wrong key')
        except subprocess.CalledProcessError:
            pass
        p = sorted(glob.glob(os.path.join(cat, 'shard-*.cbor')))[0]
        b = bytearray(open(p, 'rb').read())
        b[-1] ^= 1
        open(p, 'wb').write(bytes(b))
        try:
            zdefc('catalog', 'verify', cat, '--pubkey', pub)
            raise SystemExit('verify accepted a tampered shard')
        except subprocess.CalledProcessError:
            pass
    print(f'catalog ok: {len(banks)} banks, {len(shards)} shards')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
