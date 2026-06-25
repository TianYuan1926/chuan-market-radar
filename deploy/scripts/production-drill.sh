#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
ENV_FILE="${ENV_FILE:-.env.production}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_SOCKS_PROXY="${SSH_SOCKS_PROXY:-}"
DEFAULT_SSH_IDENTITY_FILE="${HOME}/.ssh/chuan_radar_tencent_ed25519"

detect_macos_socks_proxy() {
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v scutil >/dev/null 2>&1; then
    return
  fi

  local proxy_output proxy_host proxy_port socks_enabled
  proxy_output="$(scutil --proxy 2>/dev/null || true)"
  socks_enabled="$(awk '/SOCKSEnable/ {print $3; exit}' <<< "${proxy_output}")"
  proxy_host="$(awk '/SOCKSProxy/ {print $3; exit}' <<< "${proxy_output}")"
  proxy_port="$(awk '/SOCKSPort/ {print $3; exit}' <<< "${proxy_output}")"

  if [[ "${socks_enabled}" == "1" && -n "${proxy_host}" && -n "${proxy_port}" ]]; then
    printf '%s:%s' "${proxy_host}" "${proxy_port}"
  fi
}

if [[ -z "${SSH_SOCKS_PROXY}" ]]; then
  SSH_SOCKS_PROXY="$(detect_macos_socks_proxy)"
fi

if [[ -z "${SSH_IDENTITY_FILE}" && -f "${DEFAULT_SSH_IDENTITY_FILE}" ]]; then
  SSH_IDENTITY_FILE="${DEFAULT_SSH_IDENTITY_FILE}"
fi

SSH_OPTS=(
  -p "${SSH_PORT}"
  -o "BatchMode=yes"
  -o "ConnectTimeout=${SSH_CONNECT_TIMEOUT}"
  -o "ServerAliveInterval=15"
  -o "ServerAliveCountMax=2"
  -o "StrictHostKeyChecking=accept-new"
)

if [[ -n "${SSH_IDENTITY_FILE}" ]]; then
  SSH_OPTS+=(-i "${SSH_IDENTITY_FILE}")
fi

if [[ -n "${SSH_SOCKS_PROXY}" ]]; then
  SSH_OPTS+=(-o "ProxyCommand=nc -x ${SSH_SOCKS_PROXY} -X 5 %h %p")
fi

cd "${ROOT_DIR}"

echo "== Production drill =="
echo "target=${PROD_USER}@${PROD_HOST}:${APP_DIR}"
bash "${ROOT_DIR}/deploy/scripts/check-prod-ssh.sh"

ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "APP_DIR='${APP_DIR}' ENV_FILE='${ENV_FILE}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing ${APP_DIR}/${ENV_FILE}" >&2
  exit 1
fi

echo "== Compose service state =="
sudo docker compose --env-file "${ENV_FILE}" ps

echo "== Backup dry run =="
BACKUP_FILE="$(bash deploy/scripts/backup-postgres.sh)"
if [[ ! -s "${BACKUP_FILE}" ]]; then
  echo "ERROR: backup file is missing or empty: ${BACKUP_FILE}" >&2
  exit 1
fi
echo "backup=${BACKUP_FILE}"

echo "== Restore safety guard =="
set +e
CONFIRM_RESTORE=no bash deploy/scripts/restore-postgres.sh "${BACKUP_FILE}" >/tmp/chuan-restore-guard.log 2>&1
RESTORE_CODE=$?
set -e
cat /tmp/chuan-restore-guard.log
if [[ "${RESTORE_CODE}" -ne 3 ]]; then
  echo "ERROR: restore guard did not abort safely. code=${RESTORE_CODE}" >&2
  exit 1
fi

echo "== Backup readability =="
sudo docker compose --env-file "${ENV_FILE}" exec -T postgres pg_restore --list < "${BACKUP_FILE}" | head -n 20

echo "Production drill completed without mutating production data."
REMOTE

