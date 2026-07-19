#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  printf '%s\n' 'at least one compiled PostgreSQL rehearsal test is required' >&2
  exit 64
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PG_BINDIR="${V2_M1_REHEARSAL_PG_BIN:-$(pg_config --bindir)}"
WORK_DIR="$(mktemp -d /tmp/market-radar-v2-m1-pg16.XXXXXX)"
DATA_DIR="$WORK_DIR/data"
SOCKET_DIR="$(mktemp -d /tmp/market-radar-v2-m1-socket.XXXXXX)"
PORT="$((56320 + RANDOM % 500))"
DATABASE="market_radar_v2_m1_rehearsal"
DATABASE_URL="postgresql://v2_m1_admin@127.0.0.1:${PORT}/${DATABASE}"

cleanup() {
  if [[ -f "$DATA_DIR/postmaster.pid" ]]; then
    "$PG_BINDIR/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR" "$SOCKET_DIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$SOCKET_DIR"
"$PG_BINDIR/initdb" \
  -D "$DATA_DIR" \
  -A trust \
  -U v2_m1_admin \
  --no-locale \
  --encoding=UTF8 >/dev/null
"$PG_BINDIR/pg_ctl" \
  -D "$DATA_DIR" \
  -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR" \
  -w start >/dev/null
"$PG_BINDIR/createdb" \
  -h 127.0.0.1 \
  -p "$PORT" \
  -U v2_m1_admin \
  "$DATABASE"

cd "$ROOT_DIR"
npm run build:market-cli
SOURCE_COMMIT="$(git rev-parse HEAD)"
SOURCE_TREE="$(git rev-parse HEAD^{tree})"
env \
  -u DATABASE_URL \
  -u POSTGRES_URL \
  -u POSTGRES_PRISMA_URL \
  -u POSTGRES_URL_NON_POOLING \
  APP_ENV=rehearsal \
  NODE_ENV=test \
  V2_M1_REHEARSAL_DATABASE_URL="$DATABASE_URL" \
  V2_M1_REHEARSAL_SOURCE_COMMIT="$SOURCE_COMMIT" \
  V2_M1_REHEARSAL_SOURCE_TREE="$SOURCE_TREE" \
  node --test "$@"

printf '%s\n' '{"status":"PASS","target":"isolated_local_ephemeral_postgresql_16","productionConnected":false,"productionChanged":false}'
