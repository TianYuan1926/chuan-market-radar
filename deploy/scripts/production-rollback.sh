#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
ENV_FILE="${ENV_FILE:-.env.production}"
ROLLBACK_TO="${ROLLBACK_TO:-}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_SOCKS_PROXY="${SSH_SOCKS_PROXY:-}"
DEFAULT_SSH_IDENTITY_FILE="${HOME}/.ssh/chuan_radar_tencent_ed25519"
RUN_SMOKE_AFTER_ROLLBACK="${RUN_SMOKE_AFTER_ROLLBACK:-true}"
BASE_URL="${BASE_URL:-http://${PROD_HOST}}"

if [[ -z "${ROLLBACK_TO}" ]]; then
  echo "ERROR: set ROLLBACK_TO to a git commit or tag before running rollback." >&2
  echo "Example: ROLLBACK_TO=9efc0a2 npm run production:rollback" >&2
  exit 1
fi

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

echo "== Pre-rollback local/GitHub sync check =="
bash "${ROOT_DIR}/deploy/scripts/verify-git-sync.sh"

echo "== Remote rollback ${PROD_USER}@${PROD_HOST}:${APP_DIR} -> ${ROLLBACK_TO} =="
ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "APP_DIR='${APP_DIR}' ENV_FILE='${ENV_FILE}' ROLLBACK_TO='${ROLLBACK_TO}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"
echo "remote-before=$(git rev-parse --short HEAD)"
git fetch --all --tags
git checkout --detach "${ROLLBACK_TO}"
echo "remote-after=$(git rev-parse --short HEAD)"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing ${APP_DIR}/${ENV_FILE}" >&2
  exit 1
fi

sudo docker compose --env-file "${ENV_FILE}" config >/tmp/chuan-compose-rollback-config.txt
sudo docker compose --env-file "${ENV_FILE}" up -d --build --remove-orphans
sudo docker compose --env-file "${ENV_FILE}" ps
REMOTE

if [[ "${RUN_SMOKE_AFTER_ROLLBACK}" == "true" ]]; then
  BASE_URL="${BASE_URL}" bash "${ROOT_DIR}/deploy/scripts/prod-smoke.sh"
fi

echo "Production rollback completed. Remote is detached at ${ROLLBACK_TO}; deploy main again to return to normal release flow."
