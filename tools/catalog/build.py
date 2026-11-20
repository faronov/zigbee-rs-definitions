#!/usr/bin/env python3
"""Catalog builder: definition sources -> plan -> `zdefc catalog build`.

usage: build.py [--out out] [--date YYYY.MM.DD] [--serial N] [--generation N] [--assume-templates]

Inputs (repository root):
  definitions/generated/**/*.yaml   herdsman-gen output
  definitions/handwritten/**/*.yaml hand-written definitions (replace generated ones, see README)
  overrides/**/*.yaml               patches applied to generated definitions
  catalog.yaml                      bank budgets, templates the released hub implements
  coverage/coverage.json            tiers and coordinator flags (herdsman-gen)
  popularity/popularity.json        issue-mention scores (tools/popularity.py)

This script decides *what* goes where: which definitions exist after
overrides and hand-written replacements, which are bank-eligible (fully
translated, templates the hub implements) and in which order (popularity).
The binary catalog (banks, 256 shards, manifest.cbor, catalog.json) is
written by the Rust `zdefc` of faronov/zigbee-rs-hub (`ZDEFC`, default
`zdefc` on PATH), whose `zdef` crate is the format's single source of truth
(docs/catalog-format.md). The output is unsigned; the release workflow signs
it with `zdefc catalog sign`.

Outputs in --out: plan.json, src/ (merged sources), shard-00..ff.cbor,
bank-4m.zdb, bank-8m.zdb, manifest.cbor, catalog.json, REPORT.md, report.json.
"""
import argparse
import copy
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
from collections import Counter

import cbor2
import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSET_LIMIT = 1000          # GitHub release asset limit
SHARDS = 256


def load_yaml(path):
    with open(path, encoding='utf-8') as f:
        return yaml.load(f, Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader))


def rel(path):
    return os.path.relpath(path, ROOT)


def zdefc_cmd():
    return os.environ.get('ZDEFC', 'zdefc').split()


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
        gen[d['id']] = {'doc': d, 'path': p, 'origin': 'generated'}
    hand = {}
    for p in sorted(glob.glob(os.path.join(ROOT, 'definitions', 'handwritten', '**', '*.yaml'), recursive=True)):
        d = load_yaml(p)
        if d['id'] in hand:
            raise SystemExit(f'{rel(p)}: duplicate id {d["id"]}')
        hand[d['id']] = {'doc': d, 'path': p, 'origin': 'handwritten'}
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


# ---------------------------------------------------------------- replacement keys

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


def identity_keys(doc):
    """Identities a hand-written definition takes over from generated ones:
    (manufacturer, model) pairs, model-only names and endpoint structures."""
    keys = set()
    for c in doc.get('match', []):
        if 'gp' in c:
            keys.add(('gp', json.dumps(c['gp'], sort_keys=True)))
            continue
        models, mfrs = names(c.get('model')), names(c.get('manufacturer'))
        if isinstance(models, list):
            for mo in models:
                if isinstance(mfrs, list):
                    keys.update(('names', mf, mo) for mf in mfrs)
                else:
                    keys.add(('model', mo))
        elif 'endpoints' in c:
            keys.add(('endpoints', json.dumps(c['endpoints'], sort_keys=True, default=str)))
    return keys


# ---------------------------------------------------------------- main

def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'out'))
    ap.add_argument('--date', default=None, help='catalog date YYYY.MM.DD (default: today, UTC)')
    ap.add_argument('--serial', type=int, default=0)
    ap.add_argument('--generation', type=int, default=None)
    ap.add_argument('--assume-templates', action='store_true',
                    help='projection: treat every vendor template as implemented (sizes of the A+B+C banks)')
    args = ap.parse_args(argv)

    date_s = args.date or datetime.datetime.now(datetime.timezone.utc).strftime('%Y.%m.%d')
    date = int(date_s.replace('.', ''))
    generation = args.generation if args.generation is not None else date * 100 + args.serial
    cfg = load_yaml(os.path.join(ROOT, 'catalog.yaml'))
    coverage = json.load(open(os.path.join(ROOT, 'coverage', 'coverage.json'), encoding='utf-8'))
    recs = {r['id']: r for r in coverage['definitions']}
    pop_path = os.path.join(ROOT, 'popularity', 'popularity.json')
    pop = json.load(open(pop_path, encoding='utf-8')) if os.path.exists(pop_path) else {'scores': {}}
    scores = pop.get('scores', {})

    gen, hand, overrides = load_sources()

    # hand-written definitions replace generated ones with the same id or a shared identity
    replaced = {}
    hand_keys = {i: identity_keys(h['doc']) for i, h in hand.items()}
    for gid, g in list(gen.items()):
        gk = identity_keys(g['doc'])
        for hid, hk in hand_keys.items():
            if gid == hid or (gk & hk):
                replaced[gid] = hid
                del gen[gid]
                break

    out = args.out
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'src'))
    srcs = {}
    for s in list(gen.values()) + list(hand.values()):
        did = s['doc']['id']
        if s.get('override'):
            # merged document: JSON is a zdefc source format with the same data model (D22)
            p = os.path.join(out, 'src', did.replace('/', '__') + '.json')
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(s['doc'], f, ensure_ascii=False, indent=1, default=str)
        else:
            p = s['path']
        srcs[did] = os.path.abspath(p)

    # popularity of hand-written definitions: that of the definitions they replace
    hscore = Counter()
    for gid, hid in replaced.items():
        hscore[hid] = max(hscore[hid], scores.get(gid, 0))
    origin = {s['doc']['id']: s['origin'] for s in list(gen.values()) + list(hand.values())}
    docs = {s['doc']['id']: s['doc'] for s in list(gen.values()) + list(hand.values())}

    def score(did):
        if (recs.get(did) or {}).get('coordinator'):
            return 0                          # adapters are noise in the issue counts (spec 17.2)
        return hscore[did] if origin[did] == 'handwritten' else scores.get(did, 0)

    def tier(did):
        return 'H' if origin[did] == 'handwritten' else (recs.get(did) or {}).get('tier', '?')

    available = set(cfg.get('templates_available') or [])
    if args.assume_templates:
        available |= {t['name'] for d in docs.values() for t in d.get('templates', [])}
        cfg['templates_available'] = sorted(available) + ['(projection)']
    tier_rank = {'H': 0, 'A': 1, 'B': 2, 'C': 3}
    eligible = [did for did, d in docs.items()
                if not d.get('x-partial') and {t['name'] for t in d.get('templates', [])} <= available]
    eligible.sort(key=lambda did: (-score(did), tier_rank.get(tier(did), 9), did))

    plan = {
        'date': date, 'serial': args.serial, 'generation': generation,
        'requires': ['expr-v1'],
        'source': {'zhc': coverage['zhc'], 'commit': os.environ.get('GITHUB_SHA', 'local')},
        'definitions': [srcs[did] for did in sorted(srcs)],
        'banks': [{'name': f'bank-{name}.zdb', 'max_size': b['size'], 'candidates': [srcs[did] for did in eligible]}
                  for name, b in cfg['banks'].items()],
    }
    plan_path = os.path.join(out, 'plan.json')
    with open(plan_path, 'w', encoding='utf-8') as f:
        json.dump(plan, f, indent=1)
    env = {k: v for k, v in os.environ.items() if k != 'ZDEF_SIGNING_KEY'}     # unsigned build
    res = subprocess.run(zdefc_cmd() + ['catalog', 'build', '--plan', plan_path, '-o', out], env=env, text=True,
                         capture_output=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
        raise SystemExit('zdefc catalog build failed')
    print(res.stdout.strip())
    cat = json.load(open(os.path.join(out, 'catalog.json'), encoding='utf-8'))

    assets = 2 + SHARDS + len(cat['banks']) + 2     # manifest.cbor/.cose, shards, banks, REPORT.md, catalog.json
    if assets > ASSET_LIMIT:
        raise SystemExit(f'{assets} release assets exceed the GitHub limit of {ASSET_LIMIT}')
    version = f'catalog-{date_s}' + (f'.{args.serial}' if args.serial else '')
    report = write_report(out, version, coverage, docs, origin, cat, cfg, replaced, overrides, eligible, score, assets)
    print(report)


def kib(n):
    return f'{n / 1024:.1f} KiB'


def write_report(out, version, coverage, docs, origin, cat, cfg, replaced, overrides, eligible, score, assets):
    n = len(docs)
    partial = sum(1 for d in docs.values() if d.get('x-partial'))
    sizes, shard_sizes = {}, []
    for p in sorted(glob.glob(os.path.join(out, 'shard-*.cbor'))):
        b = open(p, 'rb').read()
        shard_sizes.append(len(b))
        for rec in cbor2.loads(b):
            d = cbor2.loads(rec[2])
            sizes[d.get(1)] = len(rec[2])
    ss = sorted(sizes.values())
    L = [f'# Catalog {version}', '',
         'Built with the Rust `zdefc` (faronov/zigbee-rs-hub); formats: `zdef` (docs/catalog-format.md).', '',
         f'- definitions: {n} ({n - partial} fully translated, {partial} partial), from zhc {coverage["zhc"]}',
         f'- hand-written: {sum(1 for o in origin.values() if o == "handwritten")}, replacing {len(replaced)} generated; overrides: {len(overrides)}',
         f'- standalone CBOR: {kib(sum(ss))} total, median {ss[len(ss) // 2]} B, max {ss[-1]} B',
         f'- templates the released hub implements (bank eligibility): {cfg.get("templates_available") or "none"}; '
         f'bank-eligible: {len(eligible)}', '',
         '| Bank | Definitions | Index keys | Blocks | Strings | Size | Limit | Free | No room | Larger than a block |',
         '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    last = []
    for b in cat['banks']:
        L.append(f'| {b["name"]} | {b["definitions"]} | {b["keys"]} | {b["blocks"]} | {b["strings"]} | {kib(b["size"])} | '
                 f'{kib(b["max_size"])} | {kib(b["max_size"] - b["size"])} | {len(b["no_room"])} | {len(b["too_large"])} |')
        inc = b['included']
        last.append(f'{b["name"]} {score(inc[-1]) if inc else "-"}')
    L += ['', 'Popularity of the last definition in each bank: ' + ', '.join(last), '',
          f'- shards: {len(shard_sizes)}, {kib(sum(shard_sizes))} total, largest {kib(max(shard_sizes))}, '
          f'median {kib(sorted(shard_sizes)[len(shard_sizes) // 2])}; content digest `{cat["content"][:16]}`',
          f'- local definition areas (spec 9.2): 4 MB {kib(cfg["local"]["4m"])}, 8 MB {kib(cfg["local"]["8m"])}; '
          f'largest standalone definition {ss[-1]} B fits {cfg["local"]["4m"] // max(ss[-1], 1)}x',
          f'- release assets: {assets} (limit {ASSET_LIMIT})']
    text = '\n'.join(L) + '\n'
    with open(os.path.join(out, 'REPORT.md'), 'w', encoding='utf-8') as f:
        f.write(text)
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': version, 'catalog': cat, 'shards': shard_sizes, 'definitions': n, 'partial': partial}, f, indent=1)
    return text


if __name__ == '__main__':
    main(sys.argv[1:])
