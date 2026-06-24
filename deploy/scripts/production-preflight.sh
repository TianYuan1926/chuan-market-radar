#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

RUN_TYPECHECK="${RUN_TYPECHECK:-true}"
RUN_MARKET_TESTS="${RUN_MARKET_TESTS:-true}"
RUN_LINT="${RUN_LINT:-true}"
RUN_BUILD="${RUN_BUILD:-true}"

cd "${ROOT_DIR}"

echo "== Production preflight =="
echo "head=$(git rev-parse --short HEAD)"
git status --short

if [[ "${RUN_TYPECHECK}" == "true" ]]; then
  echo "== 1. Typecheck =="
  npm run typecheck
else
  echo "== 1. Typecheck skipped by RUN_TYPECHECK=false =="
fi

if [[ "${RUN_MARKET_TESTS}" == "true" ]]; then
  echo "== 2. Market and worker tests =="
  npm run test:market
else
  echo "== 2. Market and worker tests skipped by RUN_MARKET_TESTS=false =="
fi

if [[ "${RUN_LINT}" == "true" ]]; then
  echo "== 3. Lint =="
  npm run lint
else
  echo "== 3. Lint skipped by RUN_LINT=false =="
fi

if [[ "${RUN_BUILD}" == "true" ]]; then
  echo "== 4. Build =="
  NEXT_TELEMETRY_DISABLED=1 npm run build
else
  echo "== 4. Build skipped by RUN_BUILD=false =="
fi

echo "Production preflight completed."
