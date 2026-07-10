#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROD_HOST="${PROD_HOST:-43.161.202.227}"
PROD_USER="${PROD_USER:-ubuntu}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-/home/ubuntu/apps/chuan-market-radar}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.production}"
BASE_URL="${BASE_URL:-http://${PROD_HOST}}"
SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-8}"
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_SOCKS_PROXY="${SSH_SOCKS_PROXY:-}"
DEFAULT_SSH_IDENTITY_FILE="${HOME}/.ssh/chuan_radar_tencent_ed25519"
RUN_REMOTE_FULL_VERIFY="${RUN_REMOTE_FULL_VERIFY:-false}"
RUN_LOCAL_SMOKE="${RUN_LOCAL_SMOKE:-true}"

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

echo "== Local git state =="
git rev-parse --short HEAD
git status --short

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: local working tree is not clean. Commit and push before production deploy." >&2
  exit 1
fi

echo "== Local/GitHub sync =="
bash "${ROOT_DIR}/deploy/scripts/verify-git-sync.sh"

echo "== SSH preflight =="
bash "${ROOT_DIR}/deploy/scripts/check-prod-ssh.sh"

echo "== Remote deploy ${PROD_USER}@${PROD_HOST}:${APP_DIR} ${REMOTE_BRANCH} =="
ssh "${SSH_OPTS[@]}" "${PROD_USER}@${PROD_HOST}" \
  "APP_DIR='${APP_DIR}' REMOTE_BRANCH='${REMOTE_BRANCH}' ENV_FILE='${ENV_FILE}' RUN_REMOTE_FULL_VERIFY='${RUN_REMOTE_FULL_VERIFY}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"

echo "remote-before=$(git rev-parse --short HEAD)"
git fetch origin "${REMOTE_BRANCH}"
git checkout "${REMOTE_BRANCH}"
git pull --ff-only origin "${REMOTE_BRANCH}"
echo "remote-after=$(git rev-parse --short HEAD)"
git status --short

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing ${APP_DIR}/${ENV_FILE}" >&2
  exit 1
fi

echo "== Compose config =="
sudo docker compose --env-file "${ENV_FILE}" config >/tmp/chuan-compose-config.txt
echo "compose config ok"

echo "== Build and restart =="
sudo docker compose --env-file "${ENV_FILE}" up -d --build --remove-orphans

echo "== Services =="
sudo docker compose --env-file "${ENV_FILE}" ps

echo "== Database migration status =="
echo "Migrations require a separately approved runbook."

echo "== Internal health =="
sudo docker compose --env-file "${ENV_FILE}" exec -T web node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'cache-control':'no-store'}}).then(async r=>{const b=await r.json(); const h=b.health||{}; console.log(JSON.stringify({status:r.status,ok:b.ok,level:h.level,source:h.dataSource&&h.dataSource.activeSource,database:h.persistence&&h.persistence.databaseStatus,scan:h.scan},null,2)); process.exit(r.ok&&b.ok?0:1);}).catch(e=>{console.error(e);process.exit(1);})"

if [[ "${RUN_REMOTE_FULL_VERIFY}" == "true" ]]; then
  echo "== Remote full verification =="
  bash deploy/scripts/production-full-verify.sh
fi
REMOTE

if [[ "${RUN_LOCAL_SMOKE}" == "true" ]]; then
  echo "== Public smoke =="
  BASE_URL="${BASE_URL}" bash "${ROOT_DIR}/deploy/scripts/prod-smoke.sh"
fi

echo "Tencent production deploy completed."
