#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${SOURCE_ROOT}}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
SECURE_ROOT="${SECURE_ROOT:-}"
OPS_ROOT="${OPS_ROOT:-}"
RUNNER_MODE="${RUNTIME_IDENTITY_MODE:-dry_run}"
CONFIRMED="${CONFIRM_RUNTIME_IDENTITY:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
CONTRACT_FILE="${CONTRACT_FILE_OVERRIDE:-${SOURCE_ROOT}/docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runner.mjs"
ACCESS_SQL="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runtime-access.sql"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

stat_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

stat_uid() {
  stat -f '%u' "$1" 2>/dev/null || stat -c '%u' "$1"
}

stat_gid() {
  stat -f '%g' "$1" 2>/dev/null || stat -c '%g' "$1"
}

assert_private_file() {
  local file="$1"
  local mode
  mode="$(stat_mode "${file}")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "${file}")"
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

privileged_file_mode() {
  sudo -n stat -c '%a' "$1" 2>/dev/null || sudo -n stat -f '%Lp' "$1"
}

privileged_file_uid() {
  sudo -n stat -c '%u' "$1" 2>/dev/null || sudo -n stat -f '%u' "$1"
}

echo "package=WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web"

if [[ "${RUNNER_MODE}" != "production_identity" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: production roles, permissions, environment and services were not changed."
  echo "DRY-RUN: current Dormant production PASS and an exact external time-bounded approval are required."
  exit 0
fi

for command_name in git jq sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done
[[ -n "${SECURE_ROOT}" && -d "${SECURE_ROOT}" ]] || fail secure_root_missing
[[ -n "${OPS_ROOT}" ]] || fail ops_root_missing
case "${OPS_ROOT}/" in
  /var/lib/market-radar-ops/wp-g0-2-runtime-identity-*/) ;;
  /tmp/wp_g0_2_rehearsal_runtime_identity_runner_*/) ;;
  *) fail ops_root_invalid ;;
esac
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"

REQUEST_FILE="${SECURE_ROOT}/request.json"
CREDENTIAL_FILE="${SECURE_ROOT}/credentials.json"
ADMIN_URL_FILE="${SECURE_ROOT}/role-admin.url"
DORMANT_EVIDENCE_FILE="${SECURE_ROOT}/dormant-deploy-result.json"
for file in "${REQUEST_FILE}" "${CREDENTIAL_FILE}" "${ADMIN_URL_FILE}" "${DORMANT_EVIDENCE_FILE}"; do
  [[ -f "${file}" ]] || fail "secure_file_missing:$(basename "${file}")"
  assert_private_file "${file}"
done
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" && -f "${ROOT_DIR}/docker-compose.yml" ]] \
  || fail production_runtime_file_missing

node "${RUNNER_MODULE}" request --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
node "${RUNNER_MODULE}" credentials --credentials "${CREDENTIAL_FILE}" >/dev/null
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env --env-file "${BASE_ENV_FILE}" >/dev/null
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env --env-file "${ENV_FILE}" >/dev/null

APPROVED_RUNNER_SOURCE_COMMIT="$(jq -r '.approvedRunnerSourceCommit' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_COMMIT="$(jq -r '.approvedProductionCommit' "${REQUEST_FILE}")"
APPROVED_BASE_ENV_SHA256="$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ENV_SHA256="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
APPROVED_COMPOSE_SHA256="$(jq -r '.composeSha256' "${REQUEST_FILE}")"
APPROVED_DORMANT_EVIDENCE_SHA256="$(jq -r '.dormantDeployEvidenceSha256' "${REQUEST_FILE}")"
APPROVED_IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
APPROVED_IDENTITY_WRAPPER_SHA256="$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")"
APPROVED_IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
APPROVED_IDENTITY_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")"
ACCESS_SHA="$(jq -r '.runtimeAccessSha256' "${REQUEST_FILE}")"

node - "${REQUEST_FILE}" "${DORMANT_EVIDENCE_FILE}" "${CONTRACT_FILE}" <<'NODE'
const fs = require("node:fs");
const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const dormant = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const contract = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
if (dormant.status !== contract.dormantEvidence.finalStatus) throw new Error("dormant_deploy_not_pass");
if (dormant.targetCommit !== request.approvedProductionCommit
  || dormant.targetCommit !== contract.productionTarget.commit) throw new Error("dormant_commit_mismatch");
const completedAt = Date.parse(dormant.completedAt);
if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60_000
  || Date.now() - completedAt > contract.dormantEvidence.maximumEvidenceAgeHours * 60 * 60_000) {
  throw new Error("dormant_evidence_not_fresh");
}
if (dormant.observationSeconds < contract.dormantEvidence.minimumObservationSeconds
  || dormant.sampleCount < contract.dormantEvidence.minimumSampleCount
  || dormant.continuousReadyFresh !== true
  || dormant.candidateRuntimeDormant !== true || dormant.candidateWorkerAbsent !== true
  || dormant.redactedEvidenceArchiveSha256 !== contract.dormantEvidence.redactedEvidenceArchiveSha256
  || dormant.candidateDatabaseUrlsConfigured !== 0 || dormant.candidateFeatureFlagsEnabled !== 0) {
  throw new Error("dormant_boundary_mismatch");
}
NODE

[[ "$(sha256sum "${BASE_ENV_FILE}" | awk '{print $1}')" == "${APPROVED_BASE_ENV_SHA256}" \
  && "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${APPROVED_PRODUCTION_ENV_SHA256}" \
  && "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" == "${APPROVED_COMPOSE_SHA256}" \
  && "$(sha256sum "${DORMANT_EVIDENCE_FILE}" | awk '{print $1}')" == "${APPROVED_DORMANT_EVIDENCE_SHA256}" ]] \
  || fail production_input_checksum_mismatch
if ! sudo -n test -f "${APPROVED_IDENTITY_WRAPPER}" \
  || sudo -n test -L "${APPROVED_IDENTITY_WRAPPER}"; then
  fail identity_wrapper_not_regular
fi
if ! sudo -n test -f "${APPROVED_IDENTITY_OVERRIDE}" \
  || sudo -n test -L "${APPROVED_IDENTITY_OVERRIDE}"; then
  fail identity_override_not_regular
fi
[[ "$(privileged_file_mode "${APPROVED_IDENTITY_WRAPPER}")" == "700" \
  && "$(privileged_file_uid "${APPROVED_IDENTITY_WRAPPER}")" == "0" ]] \
  || fail identity_wrapper_not_root_owned_0700
[[ "$(privileged_file_mode "${APPROVED_IDENTITY_OVERRIDE}")" == "600" \
  && "$(privileged_file_uid "${APPROVED_IDENTITY_OVERRIDE}")" == "0" ]] \
  || fail identity_override_not_root_owned_0600
[[ "$(sudo -n sha256sum "${APPROVED_IDENTITY_WRAPPER}" | awk '{print $1}')" == "${APPROVED_IDENTITY_WRAPPER_SHA256}" ]] \
  || fail identity_wrapper_checksum_mismatch
[[ "$(sudo -n sha256sum "${APPROVED_IDENTITY_OVERRIDE}" | awk '{print $1}')" == "${APPROVED_IDENTITY_OVERRIDE_SHA256}" ]] \
  || fail identity_override_checksum_mismatch

[[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" == "${APPROVED_RUNNER_SOURCE_COMMIT}" ]] \
  || fail runner_source_commit_mismatch
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_worktree_dirty
[[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] || fail production_branch_not_detached
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_PRODUCTION_COMMIT}" ]] \
  || fail production_commit_mismatch

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
COMPOSE=(sudo -n "${APPROVED_IDENTITY_WRAPPER}")
"${COMPOSE[@]}" config --services >/dev/null || fail identity_wrapper_compose_unavailable
cd "${ROOT_DIR}"
if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_already_running
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail web_runtime_identity_missing
ROLLBACK_TAG="chuan-market-radar-web:runtime-identity-rollback-${APPROVED_PRODUCTION_COMMIT:0:12}"
"${DOCKER[@]}" tag "${WEB_IMAGE}" "${ROLLBACK_TAG}"
[[ "$("${DOCKER[@]}" image inspect "${ROLLBACK_TAG}" --format '{{.Id}}')" == "${WEB_IMAGE}" ]] \
  || fail rollback_image_retention_mismatch

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
RENDERED_ENV="${OPS_ROOT}/backups/env.production.rendered"
node "${RUNNER_MODULE}" render-env --credentials "${CREDENTIAL_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}" >/dev/null

PROVISIONED=false
ENV_SWITCHED=false
WEB_RECREATE_ATTEMPTED=false

run_identity_safe_production_check() {
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    BASE_URL="${BASE_URL}" STRICT_SCAN_FRESHNESS=true REQUIRE_IDENTITY_WRAPPER=true \
    IDENTITY_WRAPPER="${APPROVED_IDENTITY_WRAPPER}" \
    IDENTITY_WRAPPER_SHA256="${APPROVED_IDENTITY_WRAPPER_SHA256}" \
    IDENTITY_OVERRIDE_FILE="${APPROVED_IDENTITY_OVERRIDE}" \
    IDENTITY_OVERRIDE_SHA256="${APPROVED_IDENTITY_OVERRIDE_SHA256}" \
    bash "${SOURCE_ROOT}/scripts/verify/production-check.sh"
}

rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then return; fi
  trap - EXIT
  local rollback_failed=false
  echo "ERROR: runtime identity package failed; starting bounded rollback." >&2
  if [[ "${ENV_SWITCHED}" == "true" && -f "${ENV_BACKUP}" ]]; then
    cp -p "${ENV_BACKUP}" "${ENV_FILE}" || rollback_failed=true
  fi
  if [[ "${WEB_RECREATE_ATTEMPTED}" == "true" ]]; then
    "${DOCKER[@]}" tag "${ROLLBACK_TAG}" chuan-market-radar-web:latest || rollback_failed=true
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_failed=true
  fi
  if [[ "${PROVISIONED}" == "true" ]]; then
    "${DOCKER[@]}" run --rm --network "${NETWORK}" \
      --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
      --entrypoint node "${WEB_IMAGE}" \
      /src/scripts/production/candidate-runtime-identity/runner.mjs rollback \
      --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
      --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
      --access-sha256 "${ACCESS_SHA}" >/dev/null || rollback_failed=true
  fi
  [[ "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${APPROVED_PRODUCTION_ENV_SHA256}" ]] \
    || rollback_failed=true
  rollback_web_container="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
  [[ -n "${rollback_web_container}" \
    && "$("${DOCKER[@]}" inspect "${rollback_web_container}" --format '{{.Image}}' 2>/dev/null || true)" == "${WEB_IMAGE}" ]] \
    || rollback_failed=true
  if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
    rollback_failed=true
  fi
  run_identity_safe_production_check >/dev/null 2>&1 || rollback_failed=true
  if [[ "${rollback_failed}" == "true" ]]; then
    echo "ERROR: runtime_identity_rollback_incomplete" >&2
    exit 96
  fi
  echo "ROLLBACK_VERIFIED: env, Web image, Candidate worker absence and production contracts restored." >&2
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

"${DOCKER[@]}" run --rm --network "${NETWORK}" \
  --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
  --entrypoint node "${WEB_IMAGE}" \
  /src/scripts/production/candidate-runtime-identity/runner.mjs provision \
  --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
  --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
  --access-sha256 "${ACCESS_SHA}" > "${OPS_ROOT}/evidence/provision-redacted.json"
PROVISIONED=true

match_file_ownership_and_mode "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
WEB_RECREATE_ATTEMPTED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web

"${COMPOSE[@]}" exec -T web node - <<'NODE'
const pg = require("pg");
const roles = {
  CANDIDATE_SOURCE_DATABASE_URL: "candidate_application_writer_role",
  CANDIDATE_CONSUMER_DATABASE_URL: "candidate_shadow_executor_role",
  CANDIDATE_MONITOR_DATABASE_URL: "candidate_audit_role",
};
const flags = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE", "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ", "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const exactFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!flags.every((key) => exactFalse(process.env[key]))) throw new Error("candidate_feature_flag_not_false");
if (String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase() !== "disabled") throw new Error("candidate_release_not_disabled");
if (!exactFalse(process.env.CANDIDATE_SHADOW_WORKER_EXPECTED)) throw new Error("candidate_worker_expected");
const urls = Object.keys(roles).map((key) => process.env[key]?.trim());
if (urls.some((value) => !value) || new Set(urls).size !== 3) throw new Error("candidate_database_urls_not_unique");
for (const [key, role] of Object.entries(roles)) {
  const client = new pg.Client({ connectionString: process.env[key] });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE "${role}"`);
    const result = await client.query("SELECT current_user, session_user");
    if (result.rows[0]?.current_user !== role || result.rows[0]?.session_user === role) {
      throw new Error(`candidate_identity_mismatch_${key}`);
    }
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
const endpoint = "http://127.0.0.1:3000/api/admin/candidate-shadow/run";
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await response.json();
if (response.status !== 200 || body.ok !== true || body.mode !== "dormant" || body.batch !== null) {
  throw new Error("candidate_identity_dormant_contract_failed");
}
console.log(JSON.stringify({ candidateDatabaseUrlsConfigured: 3, candidateFeatureFlagsEnabled: 0,
  candidateMode: "dormant", candidateBatch: null, runtimeIdentitiesVerified: 3 }));
NODE

if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_started_unexpectedly
fi
run_identity_safe_production_check

echo "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION"
trap - EXIT
