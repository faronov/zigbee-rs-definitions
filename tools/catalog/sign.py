#!/usr/bin/env python3
"""Sign the catalog: manifest.cbor -> manifest.cose, and the bank headers.

usage: sign.py <out dir>
The Ed25519 key is read from the environment variable ZDEF_SIGNING_KEY (PEM,
PKCS#8). Without it the script prints a notice and exits 0 without signing, so
forks and pull requests build unsigned catalogs (exit code 3 with --require).
"""
import hashlib
import os
import struct
import sys

import cbor2

sys.path.insert(0, os.path.dirname(__file__))
import cose  # noqa: E402

HEADER_LEN = 64


def sign_bank(key, path):
    data = open(path, 'rb').read()
    header = data[:HEADER_LEN]
    (old,) = struct.unpack_from('<H', data, HEADER_LEN)
    body = data[HEADER_LEN + 2 + old:]
    sig = cose.sign1(key, header, detached=True)
    with open(path, 'wb') as f:
        f.write(header + struct.pack('<H', len(sig)) + sig + body)
    return len(sig)


def main(argv):
    out = argv[0]
    key = cose.key_from_env()
    if key is None:
        msg = ('ZDEF_SIGNING_KEY is not set: the catalog is NOT signed. Hubs reject unsigned catalogs; '
               'see README.md "Signing key" to create the key and the secret.')
        print(f'::warning::{msg}' if os.environ.get('GITHUB_ACTIONS') else msg)
        return 3 if '--require' in argv else 0
    # banks first: the manifest carries the SHA-256 of the banks as published (signed)
    manifest = cbor2.loads(open(os.path.join(out, 'manifest.cbor'), 'rb').read())
    for name in sorted(os.listdir(out)):
        if name.startswith('bank-') and name.endswith('.zdb'):
            path = os.path.join(out, name)
            sign_bank(key, path)
            manifest[5][name[5:-4]][0] = hashlib.sha256(open(path, 'rb').read()).digest()
            manifest[5][name[5:-4]][1] = os.path.getsize(path)
    payload = cbor2.dumps(manifest, canonical=True)
    with open(os.path.join(out, 'manifest.cbor'), 'wb') as f:
        f.write(payload)
    with open(os.path.join(out, 'manifest.cose'), 'wb') as f:
        f.write(cose.sign1(key, payload))
    pub = key.public_key()
    with open(os.path.join(out, 'signing-key.pub'), 'w') as f:
        f.write(f'kid {cose.kid_of(pub).hex()}\ned25519 {cose.raw_public(pub).hex()}\n')
    print(f'signed manifest and banks with kid {cose.kid_of(pub).hex()}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
