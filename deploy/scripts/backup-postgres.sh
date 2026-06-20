#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.production"
BACKUP_DIR="${ROOT_DIR}/backups/postgres"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it from .env.example before running backups." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/chuan-market-radar-${STAMP}.dump"

docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --no-owner --no-acl > "${TARGET}"

find "${BACKUP_DIR}" -type f -name 'chuan-market-radar-*.dump' -mtime +14 -delete

echo "${TARGET}"
