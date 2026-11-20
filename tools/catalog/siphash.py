"""SipHash-2-4 (Aumasson, Bernstein), 64-bit output, pure Python.

Index keys of the catalog are hashed with a fixed, public key (spec 9.1); the
hash only spreads keys, it is not a security boundary.
"""
import struct

MASK = 0xFFFFFFFFFFFFFFFF
# Fixed public key of the zdef catalog index: ASCII "zdef-catalog-v1" + NUL.
INDEX_KEY = b'zdef-catalog-v1\x00'


def _rotl(x, b):
    return ((x << b) | (x >> (64 - b))) & MASK


def siphash24(key: bytes, msg: bytes) -> int:
    assert len(key) == 16
    k0, k1 = struct.unpack('<QQ', key)
    v0 = k0 ^ 0x736F6D6570736575
    v1 = k1 ^ 0x646F72616E646F6D
    v2 = k0 ^ 0x6C7967656E657261
    v3 = k1 ^ 0x7465646279746573

    def rnd():
        nonlocal v0, v1, v2, v3
        v0 = (v0 + v1) & MASK; v1 = _rotl(v1, 13); v1 ^= v0; v0 = _rotl(v0, 32)
        v2 = (v2 + v3) & MASK; v3 = _rotl(v3, 16); v3 ^= v2
        v0 = (v0 + v3) & MASK; v3 = _rotl(v3, 21); v3 ^= v0
        v2 = (v2 + v1) & MASK; v1 = _rotl(v1, 17); v1 ^= v2; v2 = _rotl(v2, 32)

    n = len(msg)
    end = n - (n % 8)
    for i in range(0, end, 8):
        m = struct.unpack_from('<Q', msg, i)[0]
        v3 ^= m
        rnd(); rnd()
        v0 ^= m
    last = (n & 0xFF) << 56
    for i, b in enumerate(msg[end:]):
        last |= b << (8 * i)
    v3 ^= last
    rnd(); rnd()
    v0 ^= last
    v2 ^= 0xFF
    rnd(); rnd(); rnd(); rnd()
    return (v0 ^ v1 ^ v2 ^ v3) & MASK


def index_hash(index_key: bytes) -> int:
    return siphash24(INDEX_KEY, index_key)
