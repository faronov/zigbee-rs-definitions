"""COSE_Sign1 (RFC 9052) with EdDSA / Ed25519 (alg -8) for the catalog.

The private key comes from the environment variable ZDEF_SIGNING_KEY (the
GitHub Actions secret of the same name): a PEM "PRIVATE KEY" (PKCS#8), as
written by `openssl genpkey -algorithm ed25519`. It is never written to disk.
"""
import hashlib
import os

import cbor2
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ALG_EDDSA = -8
COSE_SIGN1_TAG = 18
PROTECTED = cbor2.dumps({1: ALG_EDDSA}, canonical=True)


def load_private_key(pem: str) -> Ed25519PrivateKey:
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError('ZDEF_SIGNING_KEY is not an Ed25519 private key')
    return key


def key_from_env():
    pem = os.environ.get('ZDEF_SIGNING_KEY', '').strip()
    return load_private_key(pem) if pem else None


def raw_public(pub: Ed25519PublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def kid_of(pub: Ed25519PublicKey) -> bytes:
    """Key ID: first 8 bytes of SHA-256 of the raw 32-byte public key."""
    return hashlib.sha256(raw_public(pub)).digest()[:8]


def _to_be_signed(payload: bytes) -> bytes:
    return cbor2.dumps(['Signature1', PROTECTED, b'', payload], canonical=True)


def sign1(key: Ed25519PrivateKey, payload: bytes, detached: bool = False) -> bytes:
    sig = key.sign(_to_be_signed(payload))
    msg = [PROTECTED, {4: kid_of(key.public_key())}, None if detached else payload, sig]
    return cbor2.dumps(cbor2.CBORTag(COSE_SIGN1_TAG, msg), canonical=True)


def verify1(pub: Ed25519PublicKey, cose: bytes, detached_payload: bytes = None) -> bytes:
    """Verify a COSE_Sign1; returns the payload. Raises on a bad signature."""
    obj = cbor2.loads(cose)
    if not isinstance(obj, cbor2.CBORTag) or obj.tag != COSE_SIGN1_TAG:
        raise ValueError('not a COSE_Sign1')
    protected, _unprotected, payload, sig = obj.value
    if cbor2.loads(protected) != {1: ALG_EDDSA}:
        raise ValueError('unexpected protected header')
    payload = detached_payload if payload is None else payload
    pub.verify(sig, cbor2.dumps(['Signature1', protected, b'', payload], canonical=True))
    return payload
