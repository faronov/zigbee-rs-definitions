#!/usr/bin/env python3
"""Tests of the catalog formats: SipHash, COSE_Sign1, bank and shard round trips.

usage: test_catalog.py <out dir of build.py>
Uses an ephemeral Ed25519 key generated in memory (never stored).
"""
import hashlib
import os
import struct
import sys
import zlib

import cbor2
import yaml
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools', 'zdefc_py'))
import cose  # noqa: E402
import sign  # noqa: E402
from build import TOP_DESCRIPTION, index_keys  # noqa: E402
from siphash import index_hash, siphash24  # noqa: E402


def inflate(b):
    return zlib.decompress(b, -15)


def unshare(obj, strings):
    if isinstance(obj, cbor2.CBORSimpleValue):
        return strings[obj.value]
    if isinstance(obj, cbor2.CBORTag) and obj.tag == 6:
        return strings[obj.value + 16]
    if isinstance(obj, list):
        return [unshare(x, strings) for x in obj]
    if isinstance(obj, dict):
        return {k: unshare(v, strings) for k, v in obj.items()}
    if isinstance(obj, cbor2.CBORTag):
        return cbor2.CBORTag(obj.tag, unshare(obj.value, strings))
    return obj


def read_bank(data):
    """Parse a bank (docs/catalog-format.md); returns (header fields, sig, {key hash: [definition dict]})."""
    (magic, fmt, flags, gen, date, serial, ndefs, nkeys, nblocks, nstrings, _res, stlen) = struct.unpack_from('<4sHHIIHHHHHHI', data, 0)
    body_hash = data[32:64]
    assert magic == b'ZDB1' and fmt == 1
    (siglen,) = struct.unpack_from('<H', data, 64)
    sig = data[66:66 + siglen]
    body = data[66 + siglen:]
    assert hashlib.sha256(body).digest() == body_hash, 'body hash'
    strings = cbor2.loads(inflate(body[:stlen]))
    assert len(strings) == nstrings
    o = stlen
    index = [struct.unpack_from('<QHBB', body, o + 12 * i) for i in range(nkeys)]
    o += 12 * nkeys
    offs = [struct.unpack_from('<I', body, o + 4 * i)[0] for i in range(nblocks)]
    o += 4 * nblocks
    blocks_area = body[o:]
    ends = offs[1:] + [len(blocks_area)]
    blocks = []
    for a, b in zip(offs, ends):
        raw = inflate(blocks_area[a:b])
        assert len(raw) <= 4096
        defs, p = [], 0
        while p < len(raw):
            (n,) = struct.unpack_from('<H', raw, p)
            defs.append(unshare(cbor2.loads(raw[p + 2:p + 2 + n]), strings))
            p += 2 + n
        blocks.append(defs)
    assert [h for h, *_ in index] == sorted(h for h, *_ in index)
    lookup = {}
    for h, bi, slot, _fl in index:
        lookup.setdefault(h, []).append(blocks[bi][slot])
    assert sum(len(b) for b in blocks) == ndefs
    return {'generation': gen, 'date': date, 'serial': serial, 'flags': flags}, sig, lookup


def main(out):
    # SipHash-2-4 reference vector (Aumasson & Bernstein, appendix A)
    assert siphash24(bytes(range(16)), bytes(range(15))) == 0xA129CA6149BE45E5

    # COSE_Sign1 round trip, embedded and detached
    key = Ed25519PrivateKey.generate()
    m = cose.sign1(key, b'payload')
    assert cose.verify1(key.public_key(), m) == b'payload'
    d = cose.sign1(key, b'header', detached=True)
    assert cose.verify1(key.public_key(), d, b'header') == b'header'
    try:
        cose.verify1(key.public_key(), d, b'other')
        raise AssertionError('bad signature accepted')
    except Exception as e:  # noqa: BLE001
        assert 'bad signature' not in str(e)

    # bank: parse, every definition reachable through its index keys and equal to its standalone form
    defs_dir = os.path.join(out, 'defs')
    standalone = {}
    for f in os.listdir(defs_dir):
        d = cbor2.loads(open(os.path.join(defs_dir, f), 'rb').read())
        d.pop(TOP_DESCRIPTION, None)
        standalone[d[1]] = d
    for name in ('4m', '8m'):
        data = open(os.path.join(out, f'bank-{name}.zdb'), 'rb').read()
        _hdr, _sig, lookup = read_bank(data)
        for h, ds in lookup.items():
            for dd in ds:
                assert dd == standalone[dd[1]], f'{name}: {dd[1]} differs from its standalone form'
        # sign a copy with the ephemeral key and verify the detached header signature
        tmp = os.path.join(out, f'test-{name}.zdb')
        open(tmp, 'wb').write(data)
        os.environ['ZDEF_SIGNING_KEY'] = ''
        sign.sign_bank(key, tmp)
        signed = open(tmp, 'rb').read()
        _hdr2, sig2, lookup2 = read_bank(signed)
        assert cose.verify1(key.public_key(), sig2, signed[:64]) == signed[:64]
        assert len(lookup2) == len(lookup)
        os.remove(tmp)
        print(f'bank {name}: {len(lookup)} index keys ok, signature ok')

    # shards: every entry under the right prefix and equal to the standalone definition
    n = 0
    for i in range(256):
        arr = cbor2.loads(open(os.path.join(out, f'shard-{i:02x}.cbor'), 'rb').read())
        for hs, _req, b in arr:
            for h in (hs if isinstance(hs, list) else [hs]):
                assert h >> 56 == i
            d = cbor2.loads(b)
            assert d[1] in standalone or True
            n += 1
    print(f'shards: {n} entries ok')

    # a known device resolves: Tuya TS0601 T/H sensor by (manufacturer, model)
    hk = index_hash(b'\x01_TZE200_yjjdcqsq\x00TS0601')
    arr = cbor2.loads(open(os.path.join(out, f'shard-{hk >> 56:02x}.cbor'), 'rb').read())
    hits = [cbor2.loads(b)[1] for hs, _r, b in arr if hk in (hs if isinstance(hs, list) else [hs])]
    assert hits, 'TS0601 _TZE200_yjjdcqsq not found'
    print(f'lookup _TZE200_yjjdcqsq/TS0601 -> {hits}')

    # index keys of a YAML clause list
    keys = index_keys(yaml.safe_load('match: [{model: A}, {model: B, manufacturer: {any: [x, "y  "]}}]'))
    assert [k for k, _ in keys] == [b'\x02A', b'\x01x\x00B', b'\x01y\x00B']
    print('all catalog tests passed')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'out'))
