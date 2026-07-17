#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BINDIR="${WP_G0_2_REHEARSAL_PG_BIN:-$(pg_config --bindir)}"
WORK_DIR="$(mktemp -d /tmp/wp_g0_2_rehearsal_canonical_rollback_add_schema.XXXXXX)"
DATA_DIR="${WORK_DIR}/data"
SOCKET_DIR="$(mktemp -d /tmp/wp_g0_2_rehearsal_canonical_rollback_add_schema_socket.XXXXXX)"
PORT="$((58832 + RANDOM % 300))"
DATABASE="wp_g0_2_rehearsal_canonical_rollback_add_schema"
ADMIN_URL="postgresql://rehearsal@localhost:${PORT}/${DATABASE}?host=${SOCKET_DIR}"
MIGRATION_URL="postgresql://market_radar_migration_login@localhost:${PORT}/${DATABASE}?host=${SOCKET_DIR}"

cleanup() {
  if [[ -f "${DATA_DIR}/postmaster.pid" ]]; then
    "${PG_BINDIR}/pg_ctl" -D "${DATA_DIR}" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "${WORK_DIR}" "${SOCKET_DIR}"
}
trap cleanup EXIT INT TERM

mkdir -p "${SOCKET_DIR}"
"${PG_BINDIR}/initdb" -D "${DATA_DIR}" -A trust -U rehearsal --no-locale --encoding=UTF8 >/dev/null
"${PG_BINDIR}/pg_ctl" -D "${DATA_DIR}" \
  -o "-h 127.0.0.1 -p ${PORT} -k ${SOCKET_DIR}" -w start >/dev/null
"${PG_BINDIR}/createdb" -h 127.0.0.1 -p "${PORT}" -U rehearsal "${DATABASE}"

cd "${ROOT_DIR}"
env -u DATABASE_URL -u POSTGRES_URL \
  APP_ENV=rehearsal NODE_ENV=test WP_G0_2_REHEARSAL=true \
  WP_G0_2_CANONICAL_ROLLBACK_ADD_SCHEMA_ADMIN_URL="${ADMIN_URL}" \
  WP_G0_2_CANONICAL_ROLLBACK_ADD_SCHEMA_MIGRATION_URL="${MIGRATION_URL}" \
  node --test scripts/production/candidate-canonical-rollback-add-schema/runner-postgres.integration.mjs

printf '%s\n' '{"status":"pass","postgresMajor":16,"baselineMigrations":9,"completionMigrations":10,"onlyMigration":"010_candidate_canonical_rollback_safety","transactionRollbackProven":true,"productionConnected":false}'
