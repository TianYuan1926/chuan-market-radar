#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${SOURCE_ROOT}}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
REQUEST_FILE="${REQUEST_FILE:-}"
DORMANT_DEPLOY_MODE="${DORMANT_DEPLOY_MODE:-dry_run}"
CONFIRM_DORMANT_DEPLOY="${CONFIRM_DORMANT_DEPLOY:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"

echo "package=WP-G0.2-SHADOW-CAPTURE-DORMANT-RUNTIME-DEPLOY"
echo "mode=${DORMANT_DEPLOY_MODE}"
echo "service_allowlist=web"
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" validate --root "${SOURCE_ROOT}"

if [[ "${DORMANT_DEPLOY_MODE}" != "production_deploy" || "${CONFIRM_DORMANT_DEPLOY}" != "true" ]]; then
  echo "DRY-RUN: production repository, containers, database and environment were not changed."
  echo "DRY-RUN: an exact approval request is required for production execution."
  exit 0
fi

if [[ -z "${REQUEST_FILE}" || ! -f "${REQUEST_FILE}" ]]; then
  echo "ERROR: REQUEST_FILE must point to the approved request JSON." >&2
  exit 1
fi
if [[ ! -f "${BASE_ENV_FILE}" || ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: production base or override env file is missing." >&2
  exit 1
fi

node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" request \
  --root "${SOURCE_ROOT}" --request "${REQUEST_FILE}" >/dev/null
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env \
  --env-file "${BASE_ENV_FILE}"
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env \
  --env-file "${ENV_FILE}"

read -r APPROVED_COMMIT ROLLBACK_COMMIT EXECUTE_REQUESTED < <(node - "${REQUEST_FILE}" <<'NODE'
const request = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
console.log([
  request.approvedCommit,
  request.rollbackCommit,
  request.execute === true ? "true" : "false",
].join(" "));
NODE
)

if [[ "${EXECUTE_REQUESTED}" != "true" ]]; then
  echo "ERROR: approved request does not authorize execute." >&2
  exit 1
fi
if [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" != "${APPROVED_COMMIT}" ]]; then
  echo "ERROR: staged source HEAD does not match approved commit." >&2
  exit 1
fi
if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: production worktree is not clean." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" branch --show-current)" != "main" ]]; then
  echo "ERROR: production worktree must be on main." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${ROLLBACK_COMMIT}" ]]; then
  echo "ERROR: production HEAD does not match approved rollback commit." >&2
  exit 1
fi

git -C "${ROOT_DIR}" fetch origin main
if [[ "$(git -C "${ROOT_DIR}" rev-parse origin/main)" != "${APPROVED_COMMIT}" ]]; then
  echo "ERROR: origin/main does not match approved commit." >&2
  exit 1
fi

if docker ps >/dev/null 2>&1; then
  COMPOSE=(docker compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  COMPOSE=(sudo docker compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  DOCKER=(sudo docker)
else
  echo "ERROR: Docker daemon is unavailable." >&2
  exit 1
fi

cd "${ROOT_DIR}"
if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  echo "ERROR: candidate shadow worker is already running." >&2
  exit 1
fi

PREVIOUS_WEB_IMAGE="$("${COMPOSE[@]}" images -q web | head -n 1)"
if [[ -z "${PREVIOUS_WEB_IMAGE}" ]]; then
  echo "ERROR: current web rollback image is unavailable." >&2
  exit 1
fi
ROLLBACK_IMAGE_TAG="chuan-market-radar-web:dormant-rollback-${ROLLBACK_COMMIT:0:12}"
"${DOCKER[@]}" tag "${PREVIOUS_WEB_IMAGE}" "${ROLLBACK_IMAGE_TAG}"

DEPLOY_STARTED=false
rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 || "${DEPLOY_STARTED}" != "true" ]]; then
    return
  fi
  echo "ERROR: dormant deploy failed; restoring approved previous web image and git HEAD." >&2
  "${DOCKER[@]}" tag "${ROLLBACK_IMAGE_TAG}" chuan-market-radar-web:latest
  "${COMPOSE[@]}" up -d --no-deps --force-recreate web || true
  git checkout --detach "${ROLLBACK_COMMIT}" || true
  git branch -f main "${ROLLBACK_COMMIT}" || true
  git checkout main || true
  BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    BASE_URL="${BASE_URL}" STRICT_SCAN_FRESHNESS=false \
    bash "${ROOT_DIR}/scripts/verify/production-check.sh" || true
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

git merge --ff-only "${APPROVED_COMMIT}"
DEPLOY_STARTED=true
"${COMPOSE[@]}" build web
"${COMPOSE[@]}" up -d --no-deps web

"${COMPOSE[@]}" exec -T web node - <<'NODE'
const flags = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const urls = ["CANDIDATE_SOURCE_DATABASE_URL", "CANDIDATE_CONSUMER_DATABASE_URL", "CANDIDATE_MONITOR_DATABASE_URL"];
const exactFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!flags.every((key) => exactFalse(process.env[key]))) throw new Error("candidate_feature_flag_not_false");
if (!urls.every((key) => !String(process.env[key] ?? "").trim())) throw new Error("candidate_database_url_configured");
if (String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase() !== "disabled") throw new Error("candidate_release_not_disabled");
if (!exactFalse(process.env.CANDIDATE_SHADOW_WORKER_EXPECTED)) throw new Error("candidate_worker_expected");

const base = "http://127.0.0.1:3000/api/admin/candidate-shadow/run";
const unauthorized = await fetch(base, { method: "POST", headers: { authorization: "Bearer invalid" } });
if (unauthorized.status !== 401) throw new Error(`candidate_unauthorized_status_${unauthorized.status}`);
const authorized = await fetch(base, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await authorized.json();
if (authorized.status !== 200 || body.ok !== true || body.mode !== "dormant" || body.batch !== null) {
  throw new Error("candidate_dormant_contract_failed");
}
if (!body.runtime?.blockers?.includes("release_not_authorized_in_code")) {
  throw new Error("candidate_code_authorization_blocker_missing");
}
console.log(JSON.stringify({
  candidateDatabaseUrlsConfigured: 0,
  candidateFeatureFlagsEnabled: 0,
  candidateWorkerExpected: false,
  candidateAdminUnauthorizedStatus: 401,
  candidateAdminMode: "dormant",
  candidateBatch: null,
}));
NODE

if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  echo "ERROR: candidate shadow worker started unexpectedly." >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "${APPROVED_COMMIT}" ]]; then
  echo "ERROR: production HEAD mismatch after deploy." >&2
  exit 1
fi

BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
  BASE_URL="${BASE_URL}" STRICT_SCAN_FRESHNESS=true \
  bash "${ROOT_DIR}/scripts/verify/production-check.sh"

echo "PASS_IMMEDIATE_DORMANT_WEB_CHECKS_AWAITING_DB_VERIFY_AND_OBSERVATION"
trap - EXIT
