# Catalog formats

What `tools/catalog/build.py` and `tools/catalog/sign.py` produce, and what a
hub must implement to read it. The design is section 9 of the hub's
`docs/device-support.md` (faronov/zigbee-rs-hub); this document fixes the
details the spec leaves open. Where it differs from or extends the spec, the
item is marked **(provisional)**: it should move into the hub's `schema/` and
spec once `zdef-core` implements it.

All multi-byte integers in binary headers are little-endian (ESP32 native).

## 1. Index keys and their hash

Each match clause of a definition (spec 6.2) yields index keys:

| Clause | Index key bytes |
|---|---|
| exact manufacturer name(s) and exact model(s) | `0x01` + manufacturer + `0x00` + model, one key per (manufacturer, model) pair |
| model only, or model with a manufacturer `prefix` | `0x02` + model |
| endpoint structure only (no model) | `0x03` + first 16 bytes of SHA-256 of the canonical CBOR of the `endpoints` map |

Names are UTF-8 with trailing spaces and NULs removed (the spec's comparison
rule). GP clauses are not in this index. A key whose clause has more
constraints than (manufacturer, model) is flagged "recheck" (flag bit 0); the
hub re-checks every clause after the lookup anyway. Flag bit 1 marks a
fingerprint key.

Key hash: **SipHash-2-4** with the fixed public key `"zdef-catalog-v1\0"`
(16 ASCII bytes), 64-bit result **(provisional key)**.

A hub looks a device up by computing, in this order, the hashes of
`0x01 mfr 0x00 model`, `0x02 model` and (if it has one) the fingerprint key.

## 2. Shards (on-demand fetch, spec 9.3)

`shard-hh.cbor`, `hh` = the top byte of the key hash in lower-case hex (256
shards). Content: a CBOR array, one entry per definition that has at least one
index key in the shard:

```
[ key-hash or [key-hash, ...],   ; u64; an array when several keys of one definition fall into the shard (provisional)
  requires,                      ; array of feature IDs (section 5)
  standalone-definition ]        ; byte string: the definition's standalone CBOR (content hash = SHA-256 of it)
```

Shards contain every definition, partial ones included (they are only ever
served on demand, D12). Entries are sorted by definition id.

## 3. Banks (spec 9.1)

`bank-4m.zdb` (at most 256 KiB) and `bank-8m.zdb` (at most 576 KiB). Banks hold
fully translated definitions only, ordered by popularity (D12, D18), and only
those whose vendor templates the released hub implements (`catalog.yaml`
`templates_available`).

```
offset  size  field
0       4     magic "ZDB1"
4       2     format = 1
6       2     flags: bit 0 = catalog form v1 (shared strings, section 3.1)
8       4     bank generation (YYYYMMDD * 100 + serial)
12      4     catalog date as integer YYYYMMDD
16      2     catalog serial (the ".n" of the release tag)
18      2     number of definitions
20      2     number of index entries
22      2     number of blocks
24      2     number of shared strings
26      2     reserved, 0
28      4     length of the string table (bytes)
32      32    SHA-256 of the body (everything after the signature)
64      2     signature length S (0 = unsigned)
66      S     signature: COSE_Sign1, detached payload = header bytes 0..63 (section 4)
66+S    ...   body:
              string table   raw deflate of a CBOR array of text strings
              index          n x 12 B: u64 key hash, u16 block, u8 slot, u8 flags; sorted by hash
              block table    u32 offset of each block, relative to the first block
              blocks         raw deflate; uncompressed <= 4096 B; a sequence of
                             (u16 length, definition in catalog form)
```

The signature is outside the hashed body and the 64-byte header holds no
signature field, so signing never changes offsets or hashes **(provisional:
the spec lists the signature after the header without a length field)**.

### 3.1 Catalog form

Derived mechanically from the standalone form: `description` (key 5) is
removed, and every text string that occurs in at least two definitions of the
bank (map keys excluded) is replaced by a reference to the bank's string table:
simple value *n* for *n* < 16, tag 6 with *n* − 16 otherwise (spec 8.4). The
table is ordered by frequency, then by string. The catalog form is never
hashed; `tools/catalog/test_catalog.py` checks that resolving the references
gives back the standalone form.

Definitions larger than 4096 B of standalone CBOR do not fit a block; they are
served from the shards only (the report lists them).

## 4. Manifest and signatures (spec 9.3, 9.4)

`manifest.cbor` is the payload, a CBOR map:

| Key | Value |
|---:|---|
| 0 | format = 1 |
| 1 | catalog version, the release tag: `catalog-YYYY.MM.DD[.n]` |
| 2 | date as integer YYYYMMDD |
| 3 | serial *n* (0 for the first release of a day) |
| 4 | array of 256 byte strings: SHA-256 of `shard-00.cbor` ... `shard-ff.cbor` |
| 5 | map `"4m"`/`"8m"` → {0: SHA-256 of the bank file as published (signed), 1: size, 2: definitions, 3: generation} |
| 6 | minimum hub feature set (feature IDs every hub must have to use the catalog at all) |
| 7 | source: {"zhc": version, "commit": git commit of this repository} |

`manifest.cose` is `COSE_Sign1` (RFC 9052, tag 18) with protected header
`{1: -8}` (EdDSA), unprotected header `{4: kid}`, the manifest as embedded
payload and an Ed25519 signature over `["Signature1", protected, h'', payload]`.
`kid` = first 8 bytes of SHA-256 of the raw 32-byte public key. Bank headers
are signed the same way with a detached payload. The hub's anti-rollback
compares (date, serial).

Signing runs only in the release workflow and only with the repository secret
`ZDEF_SIGNING_KEY` (README, "Signing key"). Without it the release is published
as a **pre-release** with `manifest.cbor` but no `manifest.cose`, so
`releases/latest/download/...` never points at an unsigned catalog.

## 5. Feature IDs (`requires`, spec 8.5)

Computed by the compiler from what a definition uses; the table is
`tools/zdefc_py/features.py` **(provisional, append-only)**:

| ID | Feature | ID | Feature |
|---:|---|---:|---|
| 1 | expr-v1 | 12–19 | `fp.<field>` in expressions (`fp.manufacturer` = 12) |
| 2 | tuya | 20 | template.hue_light |
| 3 | gp | 21 | template.lumi |
| 4 | struct.zcl_tagged | 22 | template.tuya |
| 5 | codec.tuya_schedule_day | 23 | template.tuya_metering_zero_debounce |
| 6 | codec.tuya_schedule_week | 60 | wasm (reserved) |
| 7–11 | codec.utf16be_hex, ascii, bcd_time, hhmm, bitmap_flags | | |

## 6. Release assets

One GitHub Release per catalog, tag `catalog-YYYY.MM.DD[.n]`: `manifest.cose`
(only when signed), `manifest.cbor`, 256 shards, 2 banks and `REPORT.md`: at
most 261 assets, far below GitHub's limit of 1 000; the builder fails if a
catalog would exceed it.
