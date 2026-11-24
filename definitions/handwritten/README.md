# Hand-written definitions

Canonical YAML (D22), validated and compiled like the generated ones. A
hand-written definition replaces the generated definition with the same `id`,
the same `model` or a shared match key (tools/catalog/build.py lists the
replacements in the catalog report), so it must keep everything the generated
one has that the hub uses (white labels, Tuya flags); the selection parity
test of faronov/zigbee-rs-hub (`crates/hub-devices/tests/zhc_parity.rs`) shows
what is lost.

The files here are the examples of faronov/zigbee-rs-hub
`docs/device-support.md` (`definitions/examples/`; the self-description
fragment is not a catalog definition and is not included).
`tuya-ts0601-th-sensor.yaml` differs from its spec example: it carries all
seven herdsman white labels and `magic_packet`.
