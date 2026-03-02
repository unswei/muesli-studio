#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PATHS_FILE="$ROOT_DIR/apps/inspector/build/muesli_bt_paths.cmake"
DEST_DIR="$ROOT_DIR/contracts"
DEST_PATH="$DEST_DIR/muesli-studio-integration.md"

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
if [[ -n "${MUESLI_BT_SHARE_DIR}" && -f "${MUESLI_BT_SHARE_DIR}/contracts/muesli-studio-integration.md" ]]; then
  SOURCE_PATH="${MUESLI_BT_SHARE_DIR}/contracts/muesli-studio-integration.md"
elif [[ -n "${MUESLI_BT_SOURCE_DIR}" && -f "${MUESLI_BT_SOURCE_DIR}/docs/contracts/muesli-studio-integration.md" ]]; then
  SOURCE_PATH="${MUESLI_BT_SOURCE_DIR}/docs/contracts/muesli-studio-integration.md"
fi

if [[ -z "$SOURCE_PATH" ]]; then
  echo "unable to resolve muesli-studio-integration.md from MUESLI_BT_SHARE_DIR or MUESLI_BT_SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SOURCE_PATH" "$DEST_PATH"
echo "synced contract: ${SOURCE_PATH} -> ${DEST_PATH}"
