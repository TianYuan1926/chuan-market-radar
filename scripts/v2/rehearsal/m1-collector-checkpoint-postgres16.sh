#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

exec bash "$ROOT_DIR/scripts/v2/rehearsal/postgres16-test-harness.sh" \
  .tmp/market-tests/v2/modules/market-fact/collector/collector-checkpoint-postgres.integration.test.js
