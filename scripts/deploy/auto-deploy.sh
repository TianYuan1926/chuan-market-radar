#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"
STRICT_SCAN_FRESHNESS="${STRICT_SCAN_FRESHNESS:-true}"
RUN_PRODUCTION_FACTS="${RUN_PRODUCTION_FACTS:-true}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-${ROOT_DIR}/reports/deploy}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-${ROOT_DIR}/.deploy-state}"

cd "${ROOT_DIR}"
mkdir -p "${DEPLOY_LOG_DIR}" "${DEPLOY_STATE_DIR}"
LOG_FILE="${DEPLOY_LOG_DIR}/auto-deploy-${STAMP}.log"
exec > >(tee -a "${LOG_FILE}") 2>&1

rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then
    return
  fi
  echo "ERROR: auto deploy failed with exit code ${exit_code}."
  if [[ "${AUTO_ROLLBACK}" == "true" && -f "${DEPLOY_STATE_DIR}/previous-head" ]]; then
    echo "== Auto rollback =="
    ROLLBACK_TO="$(cat "${DEPLOY_STATE_DIR}/previous-head")" \
      ENV_FILE="${ENV_FILE}" \
      BASE_URL="${BASE_URL}" \
      STRICT_SCAN_FRESHNESS="false" \
      bash "${ROOT_DIR}/scripts/deploy/rollback.sh" || true
  fi
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if docker ps >/dev/null 2>&1; then
  COMPOSE=(docker compose --env-file "${ENV_FILE}")
elif sudo -n docker ps >/dev/null 2>&1; then
  COMPOSE=(sudo docker compose --env-file "${ENV_FILE}")
else
  echo "ERROR: cannot access Docker daemon." >&2
  exit 1
fi

previous_head="$(git rev-parse HEAD)"
echo "${previous_head}" > "${DEPLOY_STATE_DIR}/previous-head"
echo "previous_head=${previous_head}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: production repository has tracked local modifications. Refusing to deploy." >&2
  git status --short
  exit 1
fi

echo "== Git sync =="
git fetch "${REMOTE_NAME}" "${REMOTE_BRANCH}"
git checkout "${REMOTE_BRANCH}"
git pull --ff-only "${REMOTE_NAME}" "${REMOTE_BRANCH}"
new_head="$(git rev-parse HEAD)"
echo "new_head=${new_head}"

echo "== Compose config =="
"${COMPOSE[@]}" config >/tmp/chuan-auto-deploy-compose-config.txt
echo "compose config ok"

echo "== Build and restart =="
"${COMPOSE[@]}" up -d --build --remove-orphans
"${COMPOSE[@]}" ps

echo "== Production verification =="
BASE_URL="${BASE_URL}" ENV_FILE="${ENV_FILE}" STRICT_SCAN_FRESHNESS="${STRICT_SCAN_FRESHNESS}" \
  bash "${ROOT_DIR}/scripts/verify/production-check.sh"

if [[ "${RUN_PRODUCTION_FACTS}" == "true" ]]; then
  echo "== Production facts =="
  BASE_URL="${BASE_URL}" ENV_FILE="${ENV_FILE}" bash "${ROOT_DIR}/scripts/audit/collect-production-facts.sh"
fi

echo "${new_head}" > "${DEPLOY_STATE_DIR}/last-successful-head"
echo "auto deploy ok: ${new_head}"
trap - EXIT
