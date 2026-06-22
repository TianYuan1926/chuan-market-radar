#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 /path/to/chuan-market-radar-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 2
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

cd "${ROOT_DIR}"

echo "This will restore PostgreSQL from:"
echo "  ${BACKUP_FILE}"
echo "Target database:"
echo "  ${POSTGRES_DB}"
echo "Set CONFIRM_RESTORE=yes to continue."

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Restore aborted. No changes were made."
  exit 3
fi

docker compose --env-file "${ENV_FILE}" exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner --no-acl < "${BACKUP_FILE}"

echo "Restore completed."
