# zdefc_py

Python compiler for zdef definitions (YAML -> standalone CBOR), used by the
catalog CI until the Rust `zdefc` of faronov/zigbee-rs-hub is released.

Origin: `tools/zdefc-proto/zdefc.py` of zigbee-rs-hub at commit 30af446 (the
prototype that measured the sizes in the hub's docs/device-support.md,
appendix 20). Changes made here, all additive (append-only tables, so the
hub examples encode as before apart from the new `requires` key):

| Area | Change |
|---|---|
| tables (8.2/8.3) | appended units, device classes, ZCL types, sub-map keys (codec parameters, light/cover/climate part names, configure and device fields), entity key `invert`, top-level extension `x-partial` = 64, sub-map extension `x-priority` = 64 |
| free-form maps | `templates[].params` encode with text keys and literal values |
| `requires` (8.5) | computed from what a definition uses, IDs from `features.py` (provisional, append-only) |
| expressions (7.3) | `fp.<field>` (opcode FP 0x0F, field index from `FP_FIELDS`), including `fp.manufacturer`/`fp.model` used by `present_if`; `true`/`false`/negative numbers in `lookup` map literals |
| errors | unknown keys raise an error naming the context instead of a bare `KeyError` |

## Byte identity with the Rust zdefc

The Rust compiler is specified to use the authoritative key tables of the
hub's `schema/` (CDDL). Until both use the same tables the two compilers do
**not** produce identical CBOR: integer keys, enumeration indices and feature
IDs can differ. The catalog builder therefore uses exactly one compiler per
catalog (`tools/catalog/build.py --compiler auto|python|zdefc`; `auto` picks
`zdefc` when it is on `PATH` or `ZDEFC_CMD` is set) and can compare both
(`--compare`, the number of differing definitions is in the catalog report).
When zdefc lands, CI switches to it and this compiler is either aligned to the
same tables or retired.
