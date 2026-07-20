#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/postgres16-test-harness.sh" \
  .tmp/market-tests/v2/modules/market-fact/store/partitioned-fact-postgres.integration.test.js
