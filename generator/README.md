# herdsman-gen

Translates the definitions of
[zigbee-herdsman-converters](https://github.com/Koenkk/zigbee-herdsman-converters)
(zhc, MIT) into zdef definitions in canonical YAML (hub spec
`docs/device-support.md`, sections 6, 17; decisions D12, D13, D18, D22), with a
coverage record per definition.

```sh
npm ci
npm run generate          # -> definitions/generated/, coverage/COVERAGE.md, coverage/coverage.json (~10 s)
npm test                  # golden tests (generator/test/golden/)
npm run golden:update     # after a deliberate change; review the diff
```

The zhc version is pinned exactly in `package.json` (`zigbee-herdsman-converters`).
To move to a new release: change the version, `npm install`, `npm run generate`,
`npm test`, review the diff of `definitions/generated/` and `coverage/`, commit.
CI fails if the committed output does not match the pinned version.

## Where it lives, and why

In this repository, not in the hub: the generator's input (a pinned zhc
release), its output (the definitions) and the CI that publishes the catalog
change together, and the definitions repository must build a catalog without
checking out the hub. This is also where spec 17.2 places it. The hub keeps
the measuring tools (`tools/herdsman-coverage/`) that produced the spec's
numbers.

## How it works

1. **Instrumented load** (`src/zhc.ts`). Before zhc's device files load, every
   exported function of its libraries (`modernExtend`, `tuya`, `philips`,
   `lumi`, ...) is wrapped. The wrapper records which call built a returned
   object (extend, converter, Tuya value converter) with its arguments and a
   lazily formatted stack. Exported converters are indexed by identity.
   Source locations come from zhc's `.js.map` files (call sites from stacks,
   inline functions through the inspector's `[[FunctionLocation]]`).
2. **Translation** (`src/translate.ts`), per definition:
   - identity: `zigbeeModel` / `fingerprint` → `match` (fingerprints grouped by
     model; endpoints, versions, power source, manufacturer code kept);
     `whiteLabel` → `white_label`, selected like zhc by its fingerprints'
     manufacturer names, model IDs and software build IDs (names missing from
     `match` are added under the definition's models, spec 8.4);
   - extends: the outermost recorded call with a translator wins; an inner
     call is used only if the outer wrapper added nothing of its own;
   - named fz/tz converters: generic-tier semantics (`src/named.ts`), data
     (Tuya/Philips attributes), or a vendor template feature;
   - `configure` functions are replayed against a recording mock device; binds
     and reporting the generic tier does anyway are dropped, the rest becomes
     `configure:` ops; Tuya magic packet and dataQuery become `tuya:` flags;
   - `meta`: battery curves, `tuyaSendCommand`, `coverInverted`, ...;
   - Tuya DP tables (`src/tuya.ts`): value converters by name, by their
     recorded factory call (`valueConverterBasic.lookup(...)`, `divideBy(n)`,
     ...), or by probing a named lookup with the expose's labels; DP types as
     zhc's `tz.datapoints` picks them (from what `to()` returns).
   - **exposes are the accounting unit**: every zhc expose must be claimed by a
     translated item (an entity, a generic-tier converter of its cluster, or a
     template). Unclaimed exposes and untranslated items make the definition
     partial: it is emitted without them and with `x-partial: true` (spec 17.2),
     served on demand only and never banked (D12).
3. **Canonical YAML** (`src/yaml.ts`, D22): fixed key orders, hex IDs, one flow
   vs. block rule, quoting that reads the same in YAML 1.1 and 1.2. The
   revision of a definition increases only when its content changes (the
   previous file is the state); `source:` carries no zhc version or line, so a
   zhc bump does not churn unchanged definitions.

Tiers in the coverage report are what the generator *achieved*: A fully
translated with generic semantics, B fully translated with Tuya, C fully
translated but needing a vendor template in the hub, P partial.

## Vendor templates (C tier, D13)

| Template | Covers | Parameters |
|---|---|---|
| `hue_light` | `philips.m.light`: Hue effects (0xFC03), Hue power-on behaviour, gradient, Philips2 native control | `color` modes, `color_temp` range, `gradient`, `gradient_effects`, `hue_effects` |
| `lumi` | the zhc Lumi helpers a definition uses (`lumi.modernExtend.*`, `lumi.fromZigbee.*`, `lumi.toZigbee.*`): manufacturer cluster 0xFCC0, `lumi_specific`/`lumi_basic` struct decoding, Lumi actions, OTA, power-outage helpers | `features`: helper name (snake case) → its literal zhc arguments; `keys`: the entity keys the template provides |
| `tuya` | the Tuya specifics zhc implements in named code: `tuya.fz.*`/`tuya.tz.*`, `tuya.modernExtend.*` beyond the declarative ones, legacy `tuya_*`/`moes_*` converters, named value converters without a data translation (`tuya.vc.<name>` with `{dp, key}`) | `features`, `keys` as for `lumi` |
| `tuya_metering_zero_debounce` | `tuya.fz.TS011F_electrical_measurement`: zero readings delayed 2 × min interval + 1 s, power 0 while off | — |

Lumi and Tuya are *families*: one template per family with the zhc helpers as
features, so the hub can port zhc's `lumi.ts`/`tuya.ts` helpers one by one and
the coverage report ranks them. Helpers with code arguments stay untranslated.
Ledvance and IKEA (next by the ranking) are not templated yet.

## Contract with the hub (what the generated definitions assume)

These are interpretations of the spec that the generated catalog relies on;
they should become explicit in the hub spec / `zdef-core`.

1. **Generic tier** (spec 5) implements the semantics of the zhc converters
   listed as `generic` in `src/named.ts` and of the generic `m.*` extends,
   including standard Identify effects on lights and client-cluster events.
   Definitions only patch it (`generic.patch`: `report`, `div`/`mul`,
   `enabled`, `precision`, `invert` for covers, `parts.color_temp.{min,max}` for
   lights) or exclude entities.
2. **IAS Zone**: zhc decides zone semantics, not the device's ZoneType, so
   alarm entities are explicit `zcl: {cluster: 0x0500, attr: 0x0002, type:
   map16}` bindings with `from: "bit(x, n)"`. The hub must feed the ZoneStatus
   of a Zone Status Change Notification (command 0x00) into such bindings like
   an attribute report.
3. **Tuya DP types**: a binding's type is the type zhc *sends*. For decoding,
   the numeric types (`value`, `enum`, `bitmap`, `bool`) should match each
   other leniently, because zhc's converters do not distinguish them (e.g.
   a `lookup` with plain numbers is written as `value`, but the device may
   report `enum`).
4. **`present_if` over `fp.manufacturer`** (new fingerprint field): zhc flags
   given as functions of the manufacturer name (`tuyaOnOff({childLock: (m)
   => ...})`) become `present_if: 'lookup(fp.manufacturer, {...}, false)'`
   after probing the function with every manufacturer name zhc knows.
5. **Events from Tuya and vendor commands**: `triggers` with `tuya: [dp,
   type]` (event = expression over `payload`, the DP data bytes) and with
   `cmd` on manufacturer commands (e.g. 0x0006/0xFD `commandTuyaAction`).
6. **Battery**: `device.battery.curve` takes zhc's curve names
   (`3V_2100`, `3V_1500_2800`, `4LR6AA1_5v`, ...).
7. **Light brightness parts** are in the ZCL level range 0–254, as in zhc.
8. **Codecs** named by the generator: `tuya_schedule_day {day, transitions[,
   variant]}`, `tuya_schedule_week {variant: multi_dp|single_dp|trv602z|trv603wz,
   transitions, scale, min, max}`, `utf16be_hex`.

Vocabulary used beyond the spec's examples: climate parts `preset`,
`fan_mode`, `target_temperature_high`; light parts `on_off`, `brightness`,
`color_temp`; cover parts `command` (map raw → `open`/`close`/`stop`),
`position`, `tilt`; fan parts `on_off`, `preset`, `percentage`; match fields
`logical_type`, `x-priority`; `device.battery.curve`; `tuya.query` list items
`{interval_s}`; entity field `invert` (covers).

## Popularity (D18)

`tools/popularity.py` (same method as the hub's
`tools/herdsman-coverage/popularity.py`) counts the GitHub issues of Zigbee2MQTT
and ZHA that mention a definition's identifiers. Adapter/coordinator
definitions (SLZB-06M, Sonoff dongles with router firmware, "Silabs series 2
router", ...: `ADAPTER_*` in `src/translate.ts`) are excluded from the ranking,
because Zigbee2MQTT's issue template asks every reporter for the adapter. The
scores are committed in `popularity/popularity.json`; the release workflow can
refresh them (`refresh_popularity`).
