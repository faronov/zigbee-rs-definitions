#!/bin/sh
# Fetch the authoritative zdef JSON Schema from faronov/zigbee-rs-hub (ref
# HUB_SCHEMA_REF, default main) into schema/hub/. tools/validate.py uses it when
# present and falls back to the provisional schema/zdef-v1.schema.json.
ref="${HUB_SCHEMA_REF:-main}"
mkdir -p schema/hub
for name in zdef-v1.schema.json zdef.schema.json; do
  if curl -fsSL "https://raw.githubusercontent.com/faronov/zigbee-rs-hub/${ref}/schema/${name}" -o schema/hub/zdef-v1.schema.json; then
    echo "using the hub schema schema/${name} at ${ref}"
    exit 0
  fi
done
rm -f schema/hub/zdef-v1.schema.json
echo "the hub has no schema/ at ${ref} yet; validating with the provisional schema/zdef-v1.schema.json"
