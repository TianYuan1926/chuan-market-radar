#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BINDIR="${WP_G0_2_REHEARSAL_PG_BIN:-$(pg_config --bindir)}"
WORK_DIR="$(mktemp -d /tmp/market-radar-candidate-legacy-pending-drain-production-pg16.XXXXXX)"
DATA_DIR="${WORK_DIR}/data"
SOCKET_DIR="$(mktemp -d /tmp/wp_g0_2_rehearsal_candidate_pending_drain_failure_refreeze_socket.XXXXXX)"
PORT="$((58532 + RANDOM % 300))"
DATABASE="wp_g0_2_rehearsal_candidate_pending_drain_failure_refreeze"
DATABASE_URL="postgresql://rehearsal@localhost:${PORT}/${DATABASE}?host=${SOCKET_DIR}"

cleanup() {
  if [[ -f "${DATA_DIR}/postmaster.pid" ]]; then
    "${PG_BINDIR}/pg_ctl" -D "${DATA_DIR}" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "${WORK_DIR}" "${SOCKET_DIR}"
}
trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"
bash scripts/rehearsal/candidate-legacy-pending-drain-postgres16.sh

mkdir -p "${SOCKET_DIR}"
"${PG_BINDIR}/initdb" -D "${DATA_DIR}" -A trust -U rehearsal --no-locale --encoding=UTF8 >/dev/null
"${PG_BINDIR}/pg_ctl" -D "${DATA_DIR}" -o "-h 127.0.0.1 -p ${PORT} -k ${SOCKET_DIR}" -w start >/dev/null
"${PG_BINDIR}/createdb" -h 127.0.0.1 -p "${PORT}" -U rehearsal "${DATABASE}"

npm run build:market-cli
env -u DATABASE_URL -u POSTGRES_URL \
  APP_ENV=rehearsal NODE_ENV=test WP_G0_2_REHEARSAL=true \
  WP_G0_2_REHEARSAL_DATABASE_URL="${DATABASE_URL}" \
  node .tmp/market-tests/scripts/candidate-episode/migrate-rehearsal.js --environment rehearsal
env -u DATABASE_URL -u POSTGRES_URL \
  WP_G0_2_LEGACY_PENDING_DRAIN_PRODUCTION_REHEARSAL_DATABASE_URL="${DATABASE_URL}" \
  node --test scripts/production/candidate-legacy-pending-drain-production/db-runner-postgres.integration.mjs

printf '%s\n' '{"status":"pass","postgresMajor":16,"successDrainRehearsed":true,"failureRefreezeRehearsed":true,"sourceWritesAdded":0,"productionConnected":false}'
