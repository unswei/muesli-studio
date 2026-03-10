#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PATHS_FILE="$ROOT_DIR/apps/inspector/build/muesli_bt_paths.cmake"
DEST_PATH="$ROOT_DIR/schema/mbt.evt.v1.schema.json"

if [[ ! -f "$PATHS_FILE" ]]; then
  echo "missing $PATHS_FILE (run: cmake --preset default -S apps/inspector)" >&2
  exit 1
fi

extract_var() {
  local name="$1"
  sed -nE "s/^set\\(${name} \"(.*)\"\\)$/\\1/p" "$PATHS_FILE" | head -n 1
}

MUESLI_BT_SHARE_DIR=$(extract_var "MUESLI_BT_SHARE_DIR" || true)
MUESLI_BT_SOURCE_DIR=$(extract_var "MUESLI_BT_SOURCE_DIR" || true)

SOURCE_PATH=""
if [[ -n "${MUESLI_BT_SHARE_DIR}" && -f "${MUESLI_BT_SHARE_DIR}/schemas/event_log/v1/mbt.evt.v1.schema.json" ]]; then
  SOURCE_PATH="${MUESLI_BT_SHARE_DIR}/schemas/event_log/v1/mbt.evt.v1.schema.json"
elif [[ -n "${MUESLI_BT_SHARE_DIR}" && -f "${MUESLI_BT_SHARE_DIR}/schema/mbt.evt.v1.schema.json" ]]; then
  SOURCE_PATH="${MUESLI_BT_SHARE_DIR}/schema/mbt.evt.v1.schema.json"
elif [[ -n "${MUESLI_BT_SOURCE_DIR}" && -f "${MUESLI_BT_SOURCE_DIR}/schemas/event_log/v1/mbt.evt.v1.schema.json" ]]; then
  SOURCE_PATH="${MUESLI_BT_SOURCE_DIR}/schemas/event_log/v1/mbt.evt.v1.schema.json"
elif [[ -n "${MUESLI_BT_SOURCE_DIR}" && -f "${MUESLI_BT_SOURCE_DIR}/schema/mbt.evt.v1.schema.json" ]]; then
  SOURCE_PATH="${MUESLI_BT_SOURCE_DIR}/schema/mbt.evt.v1.schema.json"
fi

if [[ -z "$SOURCE_PATH" ]]; then
  echo "unable to resolve mbt.evt.v1.schema.json from current or legacy muesli-bt schema locations" >&2
  exit 1
fi

cp "$SOURCE_PATH" "$DEST_PATH"
echo "synced schema: ${SOURCE_PATH} -> ${DEST_PATH}"
