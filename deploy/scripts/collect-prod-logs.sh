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
LOG_TAIL="${LOG_TAIL:-300}"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/deploy/diagnostics}"

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

mkdir -p "${OUT_DIR}"
stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
bundle="${OUT_DIR}/prod-logs-${stamp}.txt"

ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "APP_DIR='${APP_DIR}' ENV_FILE='${ENV_FILE}' LOG_TAIL='${LOG_TAIL}' bash -s" >"${bundle}" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"
echo "== generated_at =="
date -u +"%Y-%m-%dT%H:%M:%SZ"
echo
echo "== git =="
git rev-parse --short HEAD
git status --short
echo
echo "== docker compose ps =="
sudo docker compose --env-file "${ENV_FILE}" ps
echo
echo "== api health =="
sudo docker compose --env-file "${ENV_FILE}" exec -T web node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'cache-control':'no-store'}}).then(async r=>{console.log('status',r.status); console.log((await r.text()).slice(0,2500));}).catch(e=>{console.error(e);process.exit(1);})" || true
echo
echo "== recent logs =="
sudo docker compose --env-file "${ENV_FILE}" logs --tail="${LOG_TAIL}" --no-color
REMOTE

echo "Production log bundle written: ${bundle}"
