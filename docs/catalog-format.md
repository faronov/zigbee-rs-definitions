# Catalog formats

The catalog's binary formats are defined by the hub, not by this repository:
section 9 of [`docs/device-support.md`](https://github.com/faronov/zigbee-rs-hub/blob/main/docs/device-support.md)
in faronov/zigbee-rs-hub and its reference implementation, the `zdef` crate
([`bank.rs`](https://github.com/faronov/zigbee-rs-hub/blob/main/crates/zdef/src/bank.rs),
[`sign.rs`](https://github.com/faronov/zigbee-rs-hub/blob/main/crates/zdef/src/sign.rs),
[`matching.rs`](https://github.com/faronov/zigbee-rs-hub/blob/main/crates/zdef/src/matching.rs)).
The hub firmware reads catalogs with that crate, and `zdefc catalog build`
writes them with it, so there is a single source of truth. This page
summarises the formats for readers of this repository; where it and the hub
disagree, the hub is right. The version used here is the hub commit in the
repository variable `ZDEFC_GIT_REF`.

## Who does what

| Step | Tool |
|---|---|
| sources after overrides and hand-written replacements, bank eligibility (fully translated, templates in `catalog.yaml` `templates_available`), popularity order | `tools/catalog/build.py` → `out/plan.json` |
| compile (YAML → standalone CBOR), banks, shards, `manifest.cbor`, `catalog.json` | `zdefc catalog build --plan out/plan.json -o out` |
| sign bank headers and the manifest (`manifest.cose`) | `zdefc catalog sign out` (release only, `ZDEF_SIGNING_KEY`) |
| verify everything a hub checks, plus every shard definition | `zdefc catalog verify out --pubkey keys/zdef-catalog-ed25519.pub.pem` |

## Summary of the formats (zdef v1)

**Index keys.** Each match clause yields keys, each the canonical CBOR array
`[0, manufacturer, model]`, `[1, model]` (model only or manufacturer prefix),
`[2, mfr_code|null, profile, device_id]` (endpoint fingerprint only),
`[3, gp_manufacturer_id, gp_model_id]`, `[4, gp_device_id]`,
`[5, gp_manufacturer_id]` or `[6, manufacturer]` (manufacturer only). Names
are trimmed of trailing spaces and NULs. The key hash is SipHash-2-4 with the
key `"zdef-index-v1\0\0\0"`. Flags: 1 recheck, 2 fingerprint, 4 white label.

**Banks** (`bank-4m.zdb` ≤ 256 KiB, `bank-8m.zdb` ≤ 576 KiB; fully translated
definitions only, largest popularity prefix that fits): a 64-byte
little-endian header (`ZDB1`, format 2, signature length, generation, catalog
date and serial, block/definition/string/key counts, string section length,
SHA-256 of the body), a detached COSE_Sign1 of the header (EdDSA), then the
body: the shared-string table (format 2: u32 count, count + 1 u32 offsets
into the text area, the UTF-8 text, read in place by hubs without PSRAM;
format 1, until catalog-2026.11.20: u32 inflated length + raw deflate of a
CBOR array of text strings), index (12 B per key: u64 hash, u16 block,
u8 slot, u8 flags; sorted), block offset table and raw-deflate blocks of at
most 4 KiB of `(u16 length, catalog-form definition)`. The catalog form drops
`description` and replaces strings shared by two or more definitions with
references (simple value *n* < 16, tag 6 otherwise). Definitions whose
catalog form exceeds a block are shard-only. `zdefc` builds banks unsigned and
`catalog sign` inserts the signature; the body and its hash do not change.

**Shards** (`shard-00.cbor` … `shard-ff.cbor`, by the top byte of the key
hash; every definition, partial ones included): a CBOR array of
`[key hash or ascending array of key hashes, requires, standalone definition]`,
one record per definition and shard, ordered by definition ID. The standalone
definition's SHA-256 is its content hash.

**Manifest** (`manifest.cbor`, signed as `manifest.cose`, COSE_Sign1 with
protected header `{1: -8}`, unprotected `{4: kid}`): a CBOR map
`0` format 1, `1` date YYYYMMDD, `2` serial, `3` minimum hub features,
`4` banks `[{0: name, 1: SHA-256 of the published file, 2: size, 3: definitions, 4: generation}]`,
`5` 256 shard hashes (null for an empty shard), `6` content digest (SHA-256
of the ascending content hashes of all definitions), `7` source
(`{"zhc": …, "commit": …}`). The hub's anti-rollback compares (date, serial).

**Keys.** `kid` = first 8 bytes of the SHA-256 of the raw 32-byte Ed25519
public key. The secret is a PKCS#8 PEM; `zdefc bank pubkey` prints the raw
public key (hex) and the kid as the firmware embeds them.

**Feature IDs** (`requires`, spec 8.5; table in `zdef::enums::Feature`):
1 expr-v1 (including `fp.*`), 2 tuya, 3 gp, 4 struct.zcl_tagged,
5 codec.tuya_schedule_day, 6 codec.tuya_schedule_week, 7 codec.bcd_time,
8 codec.hhmm, 9 codec.ascii, 10 codec.utf16be_hex, 11 codec.bitmap_flags,
20 template.hue_light, 21 template.lumi, 22 template.tuya,
23 template.tuya_metering_zero_debounce, 60 wasm (reserved).

## Release assets

One GitHub Release per catalog, tag `catalog-YYYY.MM.DD[.n]`: `manifest.cose`
(only when signed), `manifest.cbor`, the non-empty shards, 2 banks,
`REPORT.md` and `catalog.json` (bank membership; the release workflow
compares it and the content digest with the previous release): at most 262
assets, far below GitHub's limit of 1 000.
