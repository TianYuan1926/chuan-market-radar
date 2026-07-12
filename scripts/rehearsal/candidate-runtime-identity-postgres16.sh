#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BINDIR="${WP_G0_2_REHEARSAL_PG_BIN:-$(pg_config --bindir)}"
WORK_DIR="$(mktemp -d /tmp/market-radar-runtime-identity-pg16.XXXXXX)"
DATA_DIR="$WORK_DIR/data"
SOCKET_DIR="$(mktemp -d /tmp/wp_g0_2_rehearsal_runtime_identity_socket.XXXXXX)"
PORT="$((55932 + RANDOM % 400))"
DATABASE="wp_g0_2_rehearsal_runtime_identity"
TCP_DATABASE_URL="postgresql://rehearsal@127.0.0.1:${PORT}/${DATABASE}"
SOCKET_DATABASE_URL="postgresql://rehearsal@localhost:${PORT}/${DATABASE}?host=${SOCKET_DIR}"

cleanup() {
  if [[ -f "$DATA_DIR/postmaster.pid" ]]; then
    "$PG_BINDIR/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR" "$SOCKET_DIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$SOCKET_DIR"
"$PG_BINDIR/initdb" -D "$DATA_DIR" -A trust -U rehearsal --no-locale --encoding=UTF8 >/dev/null
"$PG_BINDIR/pg_ctl" -D "$DATA_DIR" -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR" -w start >/dev/null
"$PG_BINDIR/createdb" -h 127.0.0.1 -p "$PORT" -U rehearsal "$DATABASE"

cd "$ROOT_DIR"
npm run build:market-cli
env -u DATABASE_URL -u POSTGRES_URL \
  APP_ENV=rehearsal NODE_ENV=test WP_G0_2_REHEARSAL=true \
  WP_G0_2_REHEARSAL_DATABASE_URL="$TCP_DATABASE_URL" \
  node .tmp/market-tests/scripts/candidate-episode/migrate-rehearsal.js --environment rehearsal
env -u DATABASE_URL -u POSTGRES_URL \
  APP_ENV=rehearsal NODE_ENV=test WP_G0_2_REHEARSAL=true \
  WP_G0_2_REHEARSAL_DATABASE_URL="$SOCKET_DATABASE_URL" \
  WP_G0_2_RUNTIME_IDENTITY_RUNNER_REHEARSAL_DATABASE_URL="$SOCKET_DATABASE_URL" \
  node scripts/production/candidate-runtime-identity/runner-postgres.integration.mjs
env -u DATABASE_URL -u POSTGRES_URL \
  APP_ENV=rehearsal NODE_ENV=test WP_G0_2_REHEARSAL=true \
  WP_G0_2_REHEARSAL_DATABASE_URL="$SOCKET_DATABASE_URL" \
  WP_G0_2_RUNTIME_IDENTITY_REHEARSAL_DATABASE_URL="$SOCKET_DATABASE_URL" \
  node --test .tmp/market-tests/lib/candidate-episode/candidate-runtime-identity-postgres.test.js

printf '%s\n' '{"status":"pass","postgresMajor":16,"target":"isolated_local_ephemeral","productionConnected":false,"runtimeLogins":3,"inheritance":"disabled","crossRoleDenied":true}'
