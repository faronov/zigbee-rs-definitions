#!/usr/bin/env python3
"""Popularity of definitions from GitHub issue mentions (spec 17.2, D18).

Same method as zigbee-rs-hub tools/herdsman-coverage/popularity.py, on the
herdsman-gen coverage records instead of measure.cjs's proxy.json:

1. Identifiers per definition: model, zigbeeModel strings, fingerprint model
   IDs and manufacturer names; only those of >= 4 characters with a digit,
   "." or "_", and only those that belong to exactly one definition.
2. Issue and pull request texts (title + first 20 000 characters of the body)
   of Koenkk/zigbee2mqtt, Koenkk/zigbee-herdsman-converters,
   zigpy/zha-device-handlers and zigpy/zha, fetched with `gh api` into a JSONL
   cache and refreshed incrementally.
3. Score = number of distinct issues that mention an identifier as a whole word.
4. Coordinator/adapter definitions (coverage record `coordinator`, the
   ADAPTER_* rules of generator/src/translate.ts) get score 0: Zigbee2MQTT's
   issue template asks for the adapter, so they top the raw counts (SLZB-06M).

usage: popularity.py [--cache DIR] [--offline] [--max-pages N]
output: popularity/popularity.json
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPOS = ['Koenkk/zigbee2mqtt', 'Koenkk/zigbee-herdsman-converters', 'zigpy/zha-device-handlers', 'zigpy/zha']
BODY_LIMIT = 20000
WORD = re.compile(r'[A-Za-z0-9_.+-]+')
JQ = '.[] | {n: .number, u: .updated_at, t: ((.title // "") + "\\n" + ((.body // "")[:%d]))}' % BODY_LIMIT


def gh_lines(path, paginate):
    cmd = ['gh', 'api', path, '--jq', JQ] + (['--paginate'] if paginate else [])
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def fetch(repo, cache, offline, max_pages):
    known, since = {}, None
    if os.path.exists(cache):
        for line in open(cache, encoding='utf-8'):
            it = json.loads(line)
            known[it['n']] = it
            since = max(since or it['u'], it['u'])
    if not offline:
        path = f'repos/{repo}/issues?state=all&per_page=100&sort=updated&direction=asc'
        if since:
            path += f'&since={since}'
        items = gh_lines(path, True) if max_pages is None else [
            it for p in range(1, max_pages + 1) for it in gh_lines(f'{path}&page={p}', False)]
        for it in items:
            known[it['n']] = it
        with open(cache, 'w', encoding='utf-8') as f:
            for it in known.values():
                f.write(json.dumps(it) + '\n')
    print(f'{repo}: {len(known)} issues and pull requests', file=sys.stderr)
    return [it['t'] for it in known.values()]


def unique_identifiers(recs):
    owner = {}
    for r in recs:
        for x in r['identifiers']:
            x = x.strip().lower()
            if len(x) >= 4 and re.search(r'[0-9._]', x):
                owner.setdefault(x, set()).add(r['id'])
    return {x: next(iter(o)) for x, o in owner.items() if len(o) == 1}


def main(argv):
    cache = argv[argv.index('--cache') + 1] if '--cache' in argv else os.path.join(ROOT, '.cache', 'issues')
    offline = '--offline' in argv
    max_pages = int(argv[argv.index('--max-pages') + 1]) if '--max-pages' in argv else None
    os.makedirs(cache, exist_ok=True)
    cov = json.load(open(os.path.join(ROOT, 'coverage', 'coverage.json'), encoding='utf-8'))
    recs = cov['definitions']
    unique = unique_identifiers(recs)
    words = {x: i for x, i in unique.items() if WORD.fullmatch(x)}
    phrases = {}
    for x, i in unique.items():
        if x not in words and WORD.findall(x):
            phrases.setdefault(WORD.findall(x)[0].strip('.-+'), []).append((x, i))
    texts = []
    for repo in REPOS:
        texts += fetch(repo, os.path.join(cache, f"issues-{repo.replace('/', '_')}.jsonl"), offline, max_pages)
    score = {r['id']: 0 for r in recs}
    for text in texts:
        low = text.lower()
        seen = set()
        for w in WORD.findall(low):
            w = w.strip('.-+')
            if w in words:
                seen.add(words[w])
            for phrase, i in phrases.get(w, ()):
                if re.search(r'(?<![a-z0-9_.+-])' + re.escape(phrase) + r'(?![a-z0-9_+-])', low):
                    seen.add(i)
        for i in seen:
            score[i] += 1
    excluded = sorted(r['id'] for r in recs if r.get('coordinator'))
    raw = dict(score)
    for i in excluded:
        score[i] = 0
    out = {'method': 'distinct issue/PR mentions (spec 17.2, D18)', 'generated': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
           'issues': len(texts), 'repositories': REPOS, 'zhc': cov['zhc'],
           'excluded_adapters': {i: raw[i] for i in excluded},
           'scores': {k: v for k, v in sorted(score.items(), key=lambda kv: (-kv[1], kv[0])) if v}}
    with open(os.path.join(ROOT, 'popularity', 'popularity.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=0, ensure_ascii=False)
        f.write('\n')
    top = list(out['scores'].items())[:10]
    print(f'issues {len(texts)}; mentioned {len(out["scores"])} of {len(recs)}; adapters excluded {len(excluded)}; top {top}')


if __name__ == '__main__':
    main(sys.argv[1:])
