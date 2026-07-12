#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${SOURCE_ROOT}}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
SECURE_ROOT="${SECURE_ROOT:-}"
OPS_ROOT="${OPS_ROOT:-}"
RUNNER_MODE="${CANDIDATE_ACTIVATION_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_ACTIVATION:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
CONTRACT_FILE="${SOURCE_ROOT}/docs/governance/wp-g0-2-activation-observation-runner-preparation.v1.json"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-activation/runner.mjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
stat_mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }
stat_uid() { stat -f '%u' "$1" 2>/dev/null || stat -c '%u' "$1"; }
stat_gid() { stat -f '%g' "$1" 2>/dev/null || stat -c '%g' "$1"; }
assert_private_file() {
  local mode
  mode="$(stat_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "$1")"
}
match_file_ownership_and_mode() {
  local reference="$1"
  local target="$2"
  chmod "$(stat_mode "${reference}")" "${target}"
  local owner
  owner="$(stat_uid "${reference}"):$(stat_gid "${reference}")"
  if [[ "$(stat_uid "${target}"):$(stat_gid "${target}")" != "${owner}" ]]; then
    chown "${owner}" "${target}"
  fi
}

echo "package=WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web,candidate-shadow-worker"
echo "compose_profile=candidate-shadow-runtime"

if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: production code, control lifecycle, environment and services were not changed."
  echo "DRY-RUN: Dormant and Runtime Identity final PASS plus a future activation-authorized release are required."
  exit 0
fi

[[ "${RUNNER_MODE}" == "production_activate" || "${RUNNER_MODE}" == "automatic_rollback" ]] \
  || fail runner_mode_invalid
[[ -n "${SECURE_ROOT}" && -d "${SECURE_ROOT}" ]] || fail secure_root_missing
[[ -n "${OPS_ROOT}" ]] || fail ops_root_missing
case "${OPS_ROOT}/" in
  /var/lib/market-radar-ops/wp-g0-2-candidate-activation-*/) ;;
  /tmp/wp_g0_2_rehearsal_candidate_activation_*/) ;;
  *) fail ops_root_invalid ;;
esac
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence" "${OPS_ROOT}/state"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence" "${OPS_ROOT}/state"

REQUEST_FILE="${SECURE_ROOT}/request.json"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
DORMANT_EVIDENCE_FILE="${SECURE_ROOT}/dormant-deploy-result.json"
IDENTITY_EVIDENCE_FILE="${SECURE_ROOT}/runtime-identity-result.json"
for file in "${REQUEST_FILE}" "${ADMIN_URL_FILE}" "${DORMANT_EVIDENCE_FILE}" "${IDENTITY_EVIDENCE_FILE}"; do
  [[ -f "${file}" ]] || fail "secure_file_missing:$(basename "${file}")"
  assert_private_file "${file}"
done
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]] || fail production_env_missing

if [[ "${RUNNER_MODE}" == "automatic_rollback" ]]; then
  node "${RUNNER_MODULE}" rollback-request --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
else
  node "${RUNNER_MODULE}" request --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
  node "${RUNNER_MODULE}" release --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" --root "${SOURCE_ROOT}" >/dev/null
fi

read -r APPROVED_COMMIT ROLLBACK_COMMIT RELEASE_ID < <(node - "${REQUEST_FILE}" <<'NODE'
const request = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
console.log(`${request.approvedCommit} ${request.rollbackCommit} ${request.releaseId}`);
NODE
)

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  fail docker_unavailable
fi
COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
PROFILE_COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
cd "${ROOT_DIR}"

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
STATE_FILE="${OPS_ROOT}/state/activation-state.json"

database_runner() {
  local command="$1"
  local image="$2"
  local network="$3"
  "${DOCKER[@]}" run --rm --network "${network}" \
    --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
    --entrypoint node "${image}" \
    /src/scripts/production/candidate-activation/runner.mjs "${command}" \
    --contract /src/docs/governance/wp-g0-2-activation-observation-runner-preparation.v1.json \
    --request /secure/request.json --admin-url-file /secure/migration-admin.url
}

bounded_rollback() {
  local image="$1"
  local network="$2"
  local rollback_tag="$3"
  echo "candidate activation rollback: stopping worker and restoring dormant authority" >&2
  "${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
  "${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
  if [[ -f "${ENV_BACKUP}" ]]; then cp -p "${ENV_BACKUP}" "${ENV_FILE}" || true; fi
  "${DOCKER[@]}" tag "${rollback_tag}" chuan-market-radar-web:latest || true
  "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || true
  database_runner control-rollback "${image}" "${network}" \
    > "${OPS_ROOT}/evidence/control-rollback-redacted.json" || true
  git checkout --detach "${ROLLBACK_COMMIT}" >/dev/null 2>&1 || true
  git branch -f main "${ROLLBACK_COMMIT}" >/dev/null 2>&1 || true
  git checkout main >/dev/null 2>&1 || true
  BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" BASE_URL="${BASE_URL}" \
    STRICT_SCAN_FRESHNESS=false bash "${ROOT_DIR}/scripts/verify/production-check.sh" || true
}

if [[ "${RUNNER_MODE}" == "automatic_rollback" ]]; then
  [[ -f "${STATE_FILE}" && -f "${ENV_BACKUP}" ]] || fail rollback_state_missing
  read -r STATE_IMAGE STATE_NETWORK STATE_TAG < <(node - "${STATE_FILE}" "${APPROVED_COMMIT}" <<'NODE'
const state = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
if (state.schemaVersion !== "candidate-activation-state.v1" || state.approvedCommit !== process.argv[3]) {
  throw new Error("rollback_state_mismatch");
}
console.log(`${state.databaseRunnerImage} ${state.network} ${state.rollbackImageTag}`);
NODE
  )
  bounded_rollback "${STATE_IMAGE}" "${STATE_NETWORK}" "${STATE_TAG}"
  echo "PASS_AUTOMATIC_ROLLBACK_TO_DORMANT"
  exit 0
fi

node - "${DORMANT_EVIDENCE_FILE}" "${IDENTITY_EVIDENCE_FILE}" "${ROLLBACK_COMMIT}" <<'NODE'
const fs = require("node:fs");
const dormant = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const identity = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const rollbackCommit = process.argv[4];
if (dormant.status !== "PASS_DORMANT_RUNTIME_DEPLOY") throw new Error("dormant_deploy_not_pass");
if (identity.status !== "PASS_RUNTIME_IDENTITY_AND_PERMISSION") throw new Error("runtime_identity_not_pass");
if (identity.productionCommit !== rollbackCommit) throw new Error("identity_commit_mismatch");
if (identity.dormantDeployCommit !== dormant.productionCommit) throw new Error("identity_dormant_lineage_mismatch");
if (identity.runtimeLogins !== 3 || identity.candidateDatabaseUrlsConfigured !== 3
    || identity.candidateFeatureFlagsEnabled !== 0) throw new Error("runtime_identity_boundary_mismatch");
const completedAt = Date.parse(identity.completedAt);
if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60_000
    || Date.now() - completedAt > 24 * 60 * 60_000) throw new Error("runtime_identity_evidence_not_fresh");
NODE

[[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] || fail runner_source_commit_mismatch
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_worktree_dirty
[[ "$(git -C "${ROOT_DIR}" branch --show-current)" == "main" ]] || fail production_branch_not_main
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${ROLLBACK_COMMIT}" ]] || fail production_rollback_commit_mismatch
git -C "${ROOT_DIR}" fetch origin main
[[ "$(git -C "${ROOT_DIR}" rev-parse origin/main)" == "${APPROVED_COMMIT}" ]] || fail origin_main_commit_mismatch

if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_already_running
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail web_runtime_identity_missing
ROLLBACK_TAG="chuan-market-radar-web:candidate-activation-rollback-${ROLLBACK_COMMIT:0:12}"
"${DOCKER[@]}" tag "${WEB_IMAGE}" "${ROLLBACK_TAG}"

cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
RENDERED_ENV="${OPS_ROOT}/backups/env.production.activation"
database_runner control-preflight "${WEB_IMAGE}" "${NETWORK}" > "${OPS_ROOT}/evidence/control-preflight-redacted.json"

CONTROL_STARTED=false
ENV_SWITCHED=false
WEB_RECREATED=false
WORKER_STARTED=false
rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then return; fi
  echo "ERROR: activation failed; executing approved bounded rollback." >&2
  bounded_rollback "${WEB_IMAGE}" "${NETWORK}" "${ROLLBACK_TAG}"
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

git merge --ff-only "${APPROVED_COMMIT}"
"${PROFILE_COMPOSE[@]}" build web candidate-shadow-worker
node "${RUNNER_MODULE}" render-env --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}" >/dev/null

database_runner control-start "${WEB_IMAGE}" "${NETWORK}" > "${OPS_ROOT}/evidence/control-start-redacted.json"
CONTROL_STARTED=true
match_file_ownership_and_mode "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
WEB_RECREATED=true
"${PROFILE_COMPOSE[@]}" up -d --no-deps --no-build candidate-shadow-worker
WORKER_STARTED=true

"${COMPOSE[@]}" exec -T web node - <<'NODE'
const flags = {
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "true",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
};
for (const [key, expected] of Object.entries(flags)) {
  if (String(process.env[key] ?? "false").trim().toLowerCase() !== expected) throw new Error(`activation_env_${key}`);
}
if (!String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "").startsWith("candidate-shadow-")) throw new Error("activation_release_missing");
const response = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
  method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await response.json();
if (response.status !== 200 || body.ok !== true || body.mode !== "active"
    || body.runtime?.enabled !== true || body.runtime?.blockers?.length !== 0
    || body.monitor?.status !== "ready" || body.monitor?.phase !== "shadow_capture") {
  throw new Error("candidate_activation_contract_failed");
}
console.log(JSON.stringify({ candidateMode: body.mode, authorityEpoch: body.runtime.authorityEpoch,
  monitorStatus: body.monitor.status, secretsPrinted: false }));
NODE

BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" BASE_URL="${BASE_URL}" \
  STRICT_SCAN_FRESHNESS=true bash "${ROOT_DIR}/scripts/verify/production-check.sh"

node - "${STATE_FILE}" "${APPROVED_COMMIT}" "${ROLLBACK_COMMIT}" "${WEB_IMAGE}" "${NETWORK}" "${ROLLBACK_TAG}" "${RELEASE_ID}" <<'NODE'
const fs = require("node:fs");
const [path, approvedCommit, rollbackCommit, databaseRunnerImage, network, rollbackImageTag, releaseId] = process.argv.slice(2);
fs.writeFileSync(path, JSON.stringify({ schemaVersion: "candidate-activation-state.v1", approvedCommit,
  rollbackCommit, databaseRunnerImage, network, rollbackImageTag, releaseId, activatedAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
NODE

if [[ "${START_CANDIDATE_OBSERVER:-true}" == "true" ]]; then
  nohup env ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    SECURE_ROOT="${SECURE_ROOT}" OPS_ROOT="${OPS_ROOT}" CONFIRM_CANDIDATE_OBSERVATION=true \
    bash "${ROOT_DIR}/scripts/production/candidate-activation/observation-runner.sh" \
    > "${OPS_ROOT}/evidence/observation-runner.log" 2>&1 &
  echo "$!" > "${OPS_ROOT}/state/observation.pid"
fi

echo "PASS_IMMEDIATE_SHADOW_CAPTURE_AWAITING_OBSERVATION"
trap - EXIT
