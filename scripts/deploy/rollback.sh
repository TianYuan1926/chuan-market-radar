#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
ROLLBACK_TO="${ROLLBACK_TO:-${1:-}}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
ROLLBACK_MODE="${ROLLBACK_MODE:-dry_run}"
CONFIRM_ROLLBACK="${CONFIRM_ROLLBACK:-false}"

cd "${ROOT_DIR}"

echo "rollback_mode=${ROLLBACK_MODE}"
echo "confirm_rollback=${CONFIRM_ROLLBACK}"

if [[ "${ROLLBACK_MODE}" != "production_rollback" || "${CONFIRM_ROLLBACK}" != "true" ]]; then
  echo "DRY-RUN: no production rollback will be executed."
  echo "DRY-RUN: set ROLLBACK_MODE=production_rollback CONFIRM_ROLLBACK=true only after explicit user approval."
  echo "current=$(git rev-parse HEAD 2>/dev/null || true)"
  echo "target=${ROLLBACK_TO:-unset}"
  git status --short || true
  exit 0
fi

if [[ -z "${ROLLBACK_TO}" && -f "${ROOT_DIR}/.deploy-state/previous-head" ]]; then
  ROLLBACK_TO="$(cat "${ROOT_DIR}/.deploy-state/previous-head")"
fi

if [[ -z "${ROLLBACK_TO}" ]]; then
  echo "ERROR: ROLLBACK_TO is required and .deploy-state/previous-head is missing." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: missing env file: ${ENV_FILE}" >&2
  exit 1
fi

VERIFY_SCRIPT="$(mktemp)"
cp "${ROOT_DIR}/scripts/verify/production-check.sh" "${VERIFY_SCRIPT}"
chmod +x "${VERIFY_SCRIPT}"
cleanup() {
  rm -f "${VERIFY_SCRIPT}"
}
trap cleanup EXIT

if docker ps >/dev/null 2>&1; then
  COMPOSE=(docker compose --env-file "${ENV_FILE}")
elif sudo -n docker ps >/dev/null 2>&1; then
  COMPOSE=(sudo docker compose --env-file "${ENV_FILE}")
else
  echo "ERROR: cannot access Docker daemon." >&2
  exit 1
fi

echo "== Rollback target: ${ROLLBACK_TO} =="
echo "current=$(git rev-parse HEAD)"
git fetch --all --tags
git checkout --detach "${ROLLBACK_TO}"
echo "after-checkout=$(git rev-parse HEAD)"

"${COMPOSE[@]}" config >/tmp/chuan-rollback-compose-config.txt
"${COMPOSE[@]}" up -d --build --remove-orphans
"${COMPOSE[@]}" ps

STRICT_SCAN_FRESHNESS="${STRICT_SCAN_FRESHNESS:-false}" BASE_URL="${BASE_URL}" ENV_FILE="${ENV_FILE}" \
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" bash "${VERIFY_SCRIPT}"

echo "rollback ok: $(git rev-parse HEAD)"
