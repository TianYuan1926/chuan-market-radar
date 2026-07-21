#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_DIR="$ROOT_DIR/scripts/v2/rehearsal"
OUTPUT_ROOT="${V2_M1_CAPACITY_CALIBRATION_ROOT:-$HOME/.cache/market-radar-v2/p0r/capacity-calibration}"
CYCLES="${V2_M1_CAPACITY_CALIBRATION_CYCLES:-8}"
SOURCE_STATE="CLEAN_COMMIT"

if [[ "${1:-}" == "--allow-dirty-diagnostic" ]]; then
  SOURCE_STATE="DIRTY_DIAGNOSTIC"
  shift
fi
if [[ "$#" -ne 0 ]]; then
  printf '%s\n' 'usage: m1-partitioned-fact-capacity-postgres16.sh [--allow-dirty-diagnostic]' >&2
  exit 64
fi
if [[ "$SOURCE_STATE" == "CLEAN_COMMIT" ]] && [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  printf '%s\n' 'capacity calibration requires a clean commit; use --allow-dirty-diagnostic only for development' >&2
  exit 65
fi
if [[ ! "$CYCLES" =~ ^[1-9][0-9]*$ ]] || (( CYCLES < 4 || CYCLES > 31 )); then
  printf '%s\n' 'V2_M1_CAPACITY_CALIBRATION_CYCLES must be between 4 and 31' >&2
  exit 64
fi

umask 077
mkdir -p "$OUTPUT_ROOT"
chmod 700 "$OUTPUT_ROOT"
RUN_ID="$(date -u '+%Y%m%dT%H%M%SZ')-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)-${CYCLES}c"
OUTPUT_PATH="$OUTPUT_ROOT/$RUN_ID.json"

V2_M1_CAPACITY_CALIBRATION_CYCLES="$CYCLES" \
V2_M1_CAPACITY_CALIBRATION_OUTPUT="$OUTPUT_PATH" \
V2_M1_CAPACITY_CALIBRATION_SOURCE_STATE="$SOURCE_STATE" \
  "$SCRIPT_DIR/postgres16-test-harness.sh" \
  .tmp/market-tests/v2/modules/market-fact/store/partitioned-fact-capacity-calibration.integration.test.js

OUTPUT_SHA256="$(shasum -a 256 "$OUTPUT_PATH" | awk '{print $1}')"
printf '{"status":"%s","cycles":%s,"output":"%s","sha256":"%s","productionConnected":false,"productionChanged":false}\n' \
  "$SOURCE_STATE" \
  "$CYCLES" \
  "$OUTPUT_PATH" \
  "$OUTPUT_SHA256"
