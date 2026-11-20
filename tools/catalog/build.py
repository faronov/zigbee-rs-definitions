#!/usr/bin/env python3
"""Catalog builder: definitions -> standalone CBOR -> banks, shards, manifest.

usage: build.py [--out out] [--compiler auto|python|zdefc] [--compare] [--date YYYY.MM.DD] [--serial N]

Inputs (repository root):
  definitions/generated/**/*.yaml   herdsman-gen output
  definitions/handwritten/**/*.yaml hand-written definitions (replace generated ones, see README)
  overrides/**/*.yaml               patches applied to generated definitions
  catalog.yaml                      bank budgets, templates the released hub implements
  coverage/coverage.json            tiers and coordinator flags (herdsman-gen)
  popularity/popularity.json        issue-mention scores (tools/popularity.py)

Outputs in --out: defs/<id>.cbor (standalone), shard-00..ff.cbor, bank-4m.zdb,
bank-8m.zdb, manifest.cbor (payload; signed by sign.py into manifest.cose),
REPORT.md and report.json. Formats: docs/catalog-format.md.
"""
import argparse
import copy
import glob
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import zlib
from collections import Counter

import cbor2
import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'zdefc_py'))
sys.path.insert(0, os.path.dirname(__file__))
import features  # noqa: E402
import zdefc  # noqa: E402
from siphash import index_hash  # noqa: E402

BLOCK_LIMIT = 4096          # uncompressed bytes per bank block (spec 9.1)
DEF_LIMIT = 4096            # a definition larger than one block is served on demand only
SHARDS = 256
ASSET_LIMIT = 1000          # GitHub release asset limit
BANK_FORMAT = 1
HEADER_LEN = 64
TOP_DESCRIPTION = zdefc.TOPK['description']


def load_yaml(path):
    with open(path, encoding='utf-8') as f:
        return yaml.load(f, Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))


def rel(path):
    return os.path.relpath(path, ROOT)


# ---------------------------------------------------------------- sources

def deep_merge(base, patch):
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if k in ('id', 'revision'):
            continue
        if k == 'entities':
            ents = out.get('entities', [])
            for pe in v:
                idx = next((i for i, e in enumerate(ents) if e['key'] == pe['key'] and e.get('ep') == pe.get('ep')), None)
                if pe.get('drop'):
                    if idx is not None:
                        ents.pop(idx)
                elif idx is None:
                    ents.append(pe)
                else:
                    ents[idx] = {**ents[idx], **pe} if not pe.get('replace') else {x: y for x, y in pe.items() if x != 'replace'}
            out['entities'] = ents
        elif isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        elif v is None:
            out.pop(k, None)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_sources():
    gen = {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'definitions', 'generated', '**', '*.yaml'), recursive=True)):
        d = load_yaml(p)
        gen[d['id']] = {'doc': d, 'path': rel(p), 'origin': 'generated'}
    hand = {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'definitions', 'handwritten', '**', '*.yaml'), recursive=True)):
        d = load_yaml(p)
        if d['id'] in hand:
            raise SystemExit(f'{rel(p)}: duplicate id {d["id"]}')
        hand[d['id']] = {'doc': d, 'path': rel(p), 'origin': 'handwritten'}
    overrides = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'overrides', '**', '*.yaml'), recursive=True)):
        o = load_yaml(p)
        if o['id'] not in gen:
            raise SystemExit(f'{rel(p)}: override for unknown generated id {o["id"]}')
        g = gen[o['id']]
        g['doc'] = deep_merge(g['doc'], o)
        # monotonic: generated revision x 1000 + override revision
        g['doc']['revision'] = g['doc']['revision'] * 1000 + int(o.get('revision', 1))
        g['override'] = rel(p)
        overrides.append(rel(p))
    return gen, hand, overrides


# ---------------------------------------------------------------- index keys (6.2)

def trim(s):
    return str(s).rstrip(' \x00')


def names(v):
    if v is None:
        return None
    if isinstance(v, dict):
        if 'any' in v:
            return [trim(x) for x in v['any']]
        return 'prefix'
    return [trim(v)]


def index_keys(doc):
    """[(index key bytes, flags)] of a definition. Flags: 1 recheck, 2 fingerprint key."""
    keys = []
    for c in doc.get('match', []):
        if 'gp' in c:
            continue        # GP definitions are matched by GP identity, not in this index
        models = names(c.get('model'))
        mfrs = names(c.get('manufacturer'))
        extra = any(k not in ('model', 'manufacturer') for k in c)
        flags = 1 if extra else 0
        if isinstance(models, list):
            for mo in models:
                if isinstance(mfrs, list):
                    keys += [(b'\x01' + mf.encode() + b'\x00' + mo.encode(), flags) for mf in mfrs]
                else:
                    keys.append((b'\x02' + mo.encode(), flags | (1 if mfrs == 'prefix' else 0)))
        elif 'endpoints' in c:
            fp = cbor2.dumps(zdefc.normalize(c['endpoints']), canonical=True)
            keys.append((b'\x03' + hashlib.sha256(fp).digest()[:16], 2 | flags))
    seen, out = set(), []
    for k, f in keys:
        if k not in seen:
            seen.add(k)
            out.append((k, f))
    return out


# ---------------------------------------------------------------- compile

def compile_python(doc):
    return zdefc.compile_doc(doc, features.TABLE)[0]


def compile_zdefc(path, doc):
    cmd = os.environ.get('ZDEFC_CMD', 'zdefc compile {file}')
    tmp = None
    if path is None or doc is not None:
        tmp = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'zdefc-input.yaml')
        with open(tmp, 'w', encoding='utf-8') as f:
            yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False)
        path = tmp
    res = subprocess.run(cmd.format(file=path).split(), capture_output=True, check=True)
    return res.stdout


def have_zdefc():
    return shutil.which(os.environ.get('ZDEFC_CMD', 'zdefc compile {file}').split()[0]) is not None


# ---------------------------------------------------------------- catalog form (8.4)

def strings_of(obj, acc):
    if isinstance(obj, str):
        acc.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            strings_of(x, acc)
    elif isinstance(obj, dict):
        for x in obj.values():          # map keys stay inline
            strings_of(x, acc)
    elif isinstance(obj, cbor2.CBORTag):
        strings_of(obj.value, acc)


def share(obj, table):
    if isinstance(obj, str) and obj in table:
        n = table[obj]
        return cbor2.CBORSimpleValue(n) if n < 16 else cbor2.CBORTag(6, n - 16)
    if isinstance(obj, list):
        return [share(x, table) for x in obj]
    if isinstance(obj, dict):
        return {k: share(v, table) for k, v in obj.items()}
    if isinstance(obj, cbor2.CBORTag):
        return cbor2.CBORTag(obj.tag, share(obj.value, table))
    return obj


def catalog_form(defs):
    """defs: [(id, standalone cbor)] -> (string list, [catalog-form cbor])."""
    decoded = []
    count = Counter()
    for _, b in defs:
        d = cbor2.loads(b)
        d.pop(TOP_DESCRIPTION, None)
        decoded.append(d)
        acc = set()
        strings_of(d, acc)
        count.update(acc)
    shared = sorted((s for s, n in count.items() if n >= 2), key=lambda s: (-count[s], s))
    table = {s: i for i, s in enumerate(shared)}
    return shared, [cbor2.dumps(share(d, table), canonical=True) for d in decoded]


def deflate(b):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(b) + c.flush()


# ---------------------------------------------------------------- bank (9.1, docs/catalog-format.md)

def build_bank(entries, generation, date, serial):
    """entries: [(id, standalone cbor, [(key, flags)])] in bank order -> bank bytes (unsigned)."""
    strings, forms = catalog_form([(i, b) for i, b, _ in entries])
    blocks, cur, slots = [], bytearray(), []
    where = []                                    # per definition: (block, slot)
    for f in forms:
        rec = struct.pack('<H', len(f)) + f
        if cur and len(cur) + len(rec) > BLOCK_LIMIT:
            blocks.append(bytes(cur))
            cur, slots = bytearray(), []
        if len(rec) > BLOCK_LIMIT:
            raise ValueError('definition larger than a block')
        where.append((len(blocks), len(slots)))
        slots.append(len(cur))
        cur += rec
    if cur:
        blocks.append(bytes(cur))
    index = []
    for (bi, slot), (_, _, keys) in zip(where, entries):
        for k, fl in keys:
            index.append((index_hash(k), bi, slot, fl))
    index.sort()
    string_table = deflate(cbor2.dumps(strings, canonical=True))
    comp = [deflate(b) for b in blocks]
    offs, o = [], 0
    for c in comp:
        offs.append(o)
        o += len(c)
    body = (string_table
            + b''.join(struct.pack('<QHBB', h, bi, slot, fl) for h, bi, slot, fl in index)
            + b''.join(struct.pack('<I', x) for x in offs)
            + b''.join(comp))
    header = struct.pack('<4sHHIIHHHHHHI', b'ZDB1', BANK_FORMAT, 1, generation, date, serial, len(entries), len(index),
                         len(blocks), len(strings), 0, len(string_table))
    header += hashlib.sha256(body).digest()
    assert len(header) == HEADER_LEN
    stats = {'definitions': len(entries), 'index_keys': len(index), 'blocks': len(blocks), 'strings': len(strings),
             'string_table': len(string_table), 'index': 12 * len(index), 'block_table': 4 * len(blocks),
             'blocks_deflated': sum(len(c) for c in comp), 'blocks_raw': sum(len(b) for b in blocks)}
    return header + struct.pack('<H', 0) + body, stats


def fill_bank(cands, limit, generation, date, serial):
    """Largest popularity prefix of cands whose bank fits in limit bytes (binary search)."""
    bank, st = build_bank(cands, generation, date, serial)
    if len(bank) + 128 <= limit:
        return len(cands), bank, st             # everything fits
    lo, hi, best = 0, len(cands) - 1, None
    while lo <= hi:
        mid = (lo + hi) // 2
        bank, st = build_bank(cands[:mid], generation, date, serial)
        if len(bank) + 128 <= limit:        # 128 B reserve for the signature (COSE_Sign1 Ed25519 ~ 90 B)
            best = (mid, bank, st)
            lo = mid + 1
        else:
            hi = mid - 1
    return best


# ---------------------------------------------------------------- main

def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'out'))
    ap.add_argument('--compiler', default='auto', choices=['auto', 'python', 'zdefc'])
    ap.add_argument('--compare', action='store_true', help='compile with both compilers and report differences')
    ap.add_argument('--date', default=None, help='catalog date YYYY.MM.DD (default: today, UTC)')
    ap.add_argument('--serial', type=int, default=0)
    ap.add_argument('--generation', type=int, default=None)
    ap.add_argument('--assume-templates', action='store_true',
                    help='projection: treat every vendor template as implemented (sizes of the A+B+C banks)')
    args = ap.parse_args(argv)

    import datetime
    date_s = args.date or datetime.datetime.now(datetime.timezone.utc).strftime('%Y.%m.%d')
    date = int(date_s.replace('.', ''))
    generation = args.generation if args.generation is not None else date * 100 + args.serial
    cfg = load_yaml(os.path.join(ROOT, 'catalog.yaml'))
    coverage = json.load(open(os.path.join(ROOT, 'coverage', 'coverage.json'), encoding='utf-8'))
    recs = {r['id']: r for r in coverage['definitions']}
    pop_path = os.path.join(ROOT, 'popularity', 'popularity.json')
    pop = json.load(open(pop_path, encoding='utf-8')) if os.path.exists(pop_path) else {'scores': {}}
    scores = pop.get('scores', {})

    use_zdefc = args.compiler == 'zdefc' or (args.compiler == 'auto' and have_zdefc())
    gen, hand, overrides = load_sources()

    # hand-written definitions replace generated ones with the same id or a shared index key
    replaced = {}
    hand_keys = {i: {k for k, _ in index_keys(h['doc'])} for i, h in hand.items()}
    for gid, g in list(gen.items()):
        gk = {k for k, _ in index_keys(g['doc'])}
        for hid, hk in hand_keys.items():
            if gid == hid or (gk & hk):
                replaced[gid] = hid
                del gen[gid]
                break

    out = args.out
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'defs'))
    allsrc = list(gen.values()) + list(hand.values())
    compiled, diffs, errors = {}, [], []
    for s in allsrc:
        doc, did = s['doc'], s['doc']['id']
        try:
            py = compile_python(doc)
            b = py
            if use_zdefc or args.compare:
                rz = compile_zdefc(None, doc)
                if args.compare and rz != py:
                    diffs.append(did)
                if use_zdefc:
                    b = rz
        except Exception as e:  # noqa: BLE001
            errors.append(f'{s["path"]}: {type(e).__name__}: {e}')
            continue
        keys = index_keys(doc)
        rec = recs.get(did) or {}
        tmpl = [t['name'] for t in doc.get('templates', [])]
        compiled[did] = {
            'cbor': b, 'keys': keys, 'origin': s['origin'], 'partial': bool(doc.get('x-partial')),
            'tier': 'H' if s['origin'] == 'handwritten' else rec.get('tier', '?'), 'templates': tmpl,
            'coordinator': bool(rec.get('coordinator')), 'model': doc.get('model'),
            'requires': cbor2.loads(b).get(zdefc.TOPK['requires'], []),
        }
        with open(os.path.join(out, 'defs', did.replace('/', '__') + '.cbor'), 'wb') as f:
            f.write(b)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        raise SystemExit(f'{len(errors)} definitions failed to compile')

    # popularity of hand-written definitions: that of the definitions they replace
    hscore = Counter()
    for gid, hid in replaced.items():
        hscore[hid] = max(hscore[hid], scores.get(gid, 0))

    def score(did, c):
        if c['coordinator']:
            return 0                          # adapters are noise in the issue counts (spec 17.2)
        return hscore[did] if c['origin'] == 'handwritten' else scores.get(did, 0)

    available = set(cfg.get('templates_available') or [])
    if args.assume_templates:
        available |= {t for c in compiled.values() for t in c['templates']}
        cfg['templates_available'] = sorted(available) + ['(projection)']
    tier_rank = {'H': 0, 'A': 1, 'B': 2, 'C': 3}
    eligible = [(did, c) for did, c in compiled.items()
                if not c['partial'] and len(c['cbor']) <= DEF_LIMIT and set(c['templates']) <= available and c['keys']]
    eligible.sort(key=lambda x: (-score(*x), tier_rank.get(x[1]['tier'], 9), len(x[1]['cbor']), x[0]))
    cands = [(did, c['cbor'], c['keys']) for did, c in eligible]

    banks = {}
    for name, b in cfg['banks'].items():
        best = fill_bank(cands, b['size'], generation, date, args.serial)
        n, bank, st = best
        with open(os.path.join(out, f'bank-{name}.zdb'), 'wb') as f:
            f.write(bank)
        banks[name] = {'size': len(bank), 'limit': b['size'], **st, 'eligible': len(cands),
                       'last_score': score(*eligible[n - 1]) if n else None, 'ids': [x[0] for x in cands[:n]]}

    # shards: every definition, under every index key
    shard_entries = [dict() for _ in range(SHARDS)]
    for did, c in sorted(compiled.items()):
        for k, _ in c['keys']:
            h = index_hash(k)
            slot = shard_entries[h >> 56]
            slot.setdefault(did, []).append(h)
    shard_hashes, shard_sizes = [], []
    for i, ent in enumerate(shard_entries):
        arr = []
        for did in sorted(ent):
            hs = sorted(ent[did])
            arr.append([hs[0] if len(hs) == 1 else hs, compiled[did]['requires'], compiled[did]['cbor']])
        b = cbor2.dumps(arr, canonical=True)
        with open(os.path.join(out, f'shard-{i:02x}.cbor'), 'wb') as f:
            f.write(b)
        shard_hashes.append(hashlib.sha256(b).digest())
        shard_sizes.append(len(b))

    version = f'catalog-{date_s}' + (f'.{args.serial}' if args.serial else '')
    min_features = sorted({f for c in compiled.values() for f in c['requires']} & {features.FEATURES['expr-v1']})
    manifest = {
        0: 1, 1: version, 2: date, 3: args.serial, 4: shard_hashes,
        5: {name: {0: hashlib.sha256(open(os.path.join(out, f'bank-{name}.zdb'), 'rb').read()).digest(), 1: banks[name]['size'],
                   2: banks[name]['definitions'], 3: generation} for name in banks},
        6: min_features,
        7: {'zhc': coverage['zhc'], 'commit': os.environ.get('GITHUB_SHA', 'local')},
        # content digest: shards and bank contents, without dates; equal digest = nothing to release
        8: hashlib.sha256(b''.join(shard_hashes) + json.dumps({k: v['ids'] for k, v in banks.items()}, sort_keys=True).encode()).digest(),
    }
    with open(os.path.join(out, 'manifest.cbor'), 'wb') as f:
        f.write(cbor2.dumps(manifest, canonical=True))

    assets = 2 + SHARDS + len(banks) + 1     # manifest.cbor + manifest.cose, shards, banks, REPORT.md
    if assets > ASSET_LIMIT:
        raise SystemExit(f'{assets} release assets exceed the GitHub limit of {ASSET_LIMIT}')
    report = write_report(out, version, coverage, compiled, banks, shard_sizes, cfg, replaced, overrides, diffs, use_zdefc, args.compare, assets)
    print(report)


def kib(n):
    return f'{n / 1024:.1f} KiB'


def write_report(out, version, coverage, compiled, banks, shard_sizes, cfg, replaced, overrides, diffs, used_zdefc, compared, assets):
    n = len(compiled)
    sizes = sorted(len(c['cbor']) for c in compiled.values())
    full = [c for c in compiled.values() if not c['partial']]
    big = [did for did, c in compiled.items() if len(c['cbor']) > DEF_LIMIT]
    L = [f'# Catalog {version}', '',
         f'Compiler: {"zdefc (Rust)" if used_zdefc else "tools/zdefc_py (Python prototype)"}'
         + (f'; Python vs zdefc differences: {len(diffs)}' if compared else ''), '',
         f'- definitions: {n} ({len(full)} fully translated, {n - len(full)} partial), from zhc {coverage["zhc"]}',
         f'- hand-written: {sum(1 for c in compiled.values() if c["origin"] == "handwritten")}, replacing {len(replaced)} generated; overrides: {len(overrides)}',
         f'- standalone CBOR: {kib(sum(sizes))} total, median {sizes[len(sizes) // 2]} B, max {sizes[-1]} B; over {DEF_LIMIT} B (on demand only): {len(big)}',
         f'- templates the released hub implements (bank eligibility): {cfg.get("templates_available") or "none"}', '',
         '| Bank | Definitions | Index keys | Blocks | Strings | String table | Index | Blocks (deflated) | Total | Limit | Free |',
         '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name, b in banks.items():
        L.append(f'| {name} | {b["definitions"]} of {b["eligible"]} | {b["index_keys"]} | {b["blocks"]} | {b["strings"]} | {kib(b["string_table"])} | '
                 f'{kib(b["index"])} | {kib(b["blocks_deflated"])} | {kib(b["size"])} | {kib(b["limit"])} | {kib(b["limit"] - b["size"])} |')
    L += ['', f'Popularity of the last definition in each bank: '
          + ', '.join(f'{k} {v["last_score"]}' for k, v in banks.items()), '',
          f'- shards: {len(shard_sizes)}, {kib(sum(shard_sizes))} total, largest {kib(max(shard_sizes))}, '
          f'median {kib(sorted(shard_sizes)[len(shard_sizes) // 2])}',
          f'- local definition areas (spec 9.2): 4 MB {kib(cfg["local"]["4m"])}, 8 MB {kib(cfg["local"]["8m"])}; '
          f'largest standalone definition {sizes[-1]} B fits {cfg["local"]["4m"] // max(sizes[-1], 1)}x',
          f'- release assets: {assets} (limit {ASSET_LIMIT})']
    text = '\n'.join(L) + '\n'
    with open(os.path.join(out, 'REPORT.md'), 'w', encoding='utf-8') as f:
        f.write(text)
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': version, 'banks': {k: {x: y for x, y in v.items()} for k, v in banks.items()},
                   'shards': shard_sizes, 'definitions': n, 'zdefc_diffs': diffs}, f, indent=1)
    return text


if __name__ == '__main__':
    main(sys.argv[1:])
