#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export V2_M1_LIVE_REHEARSAL=1

exec bash "$ROOT_DIR/scripts/v2/rehearsal/postgres16-test-harness.sh" \
  .tmp/market-tests/v2/modules/market-fact/collector/collector-live.integration.test.js
