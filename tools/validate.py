#!/usr/bin/env python3
"""Validate every definition source against the zdef JSON Schema.

usage: validate.py [--schema PATH]
Default schema: schema/hub/zdef-v1.schema.json if CI fetched the hub's
authoritative schema, else the provisional schema/zdef-v1.schema.json.
"""
import glob
import json
import os
import sys
from collections import Counter

import yaml
from jsonschema import Draft202012Validator

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def jsonish(v):
    """The JSON data model of a YAML document (D22): map keys are strings."""
    if isinstance(v, dict):
        return {str(k).lower() if isinstance(k, bool) else str(k): jsonish(x) for k, x in v.items()}
    if isinstance(v, list):
        return [jsonish(x) for x in v]
    return v


def main(argv):
    schema_path = argv[argv.index('--schema') + 1] if '--schema' in argv else None
    if not schema_path:
        hub = os.path.join(ROOT, 'schema', 'hub', 'zdef-v1.schema.json')
        schema_path = hub if os.path.exists(hub) else os.path.join(ROOT, 'schema', 'zdef-v1.schema.json')
    schema = json.load(open(schema_path, encoding='utf-8'))
    v = Draft202012Validator(schema)
    files = sorted(glob.glob(os.path.join(ROOT, 'definitions', '**', '*.yaml'), recursive=True))
    bad, reasons = 0, Counter()
    for f in files:
        doc = jsonish(yaml.load(open(f, encoding='utf-8'), Loader=getattr(yaml, 'CSafeLoader', yaml.SafeLoader)))
        errs = sorted(v.iter_errors(doc), key=lambda e: list(e.path))
        if errs:
            bad += 1
            for e in errs[:3]:
                reasons[f'{"/".join(map(str, e.path))}: {e.message[:120]}'] += 1
                if bad <= 20:
                    print(f'{os.path.relpath(f, ROOT)}: {"/".join(map(str, e.path))}: {e.message[:160]}')
    print(f'schema {os.path.relpath(schema_path, ROOT)}: {len(files) - bad} of {len(files)} definitions valid')
    if bad:
        for r, n in reasons.most_common(10):
            print(f'  {n} x {r}')
        sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1:])
