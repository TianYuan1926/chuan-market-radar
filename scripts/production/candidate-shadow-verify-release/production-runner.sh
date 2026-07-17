#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST_OVERRIDE:-${SOURCE_ROOT}/transport-manifest.json}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-release/bundle.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${PRODUCTION_ROOT}}"
REHEARSAL="${SHADOW_VERIFY_RELEASE_REHEARSAL:-false}"
OBSERVATION_DURATION_SECONDS="${OBSERVATION_DURATION_SECONDS:-1800}"
OBSERVATION_POLL_SECONDS="${OBSERVATION_POLL_SECONDS:-30}"
WEB_READY_TIMEOUT_SECONDS="${WEB_READY_TIMEOUT_SECONDS:-240}"
WEB_READY_POLL_SECONDS=3

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
hash_file() { sha256sum "$1" | awk '{print $1}'; }

[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" \
  && -f "${TRANSPORT_MANIFEST}" && ! -L "${TRANSPORT_MANIFEST}" ]] \
  || fail request_or_manifest_missing
if [[ "${REHEARSAL}" != "true" ]]; then
  [[ "${ROOT_DIR}" == "${PRODUCTION_ROOT}" \
    && "${OBSERVATION_DURATION_SECONDS}" == "1800" \
    && "${OBSERVATION_POLL_SECONDS}" == "30" \
    && "${WEB_READY_TIMEOUT_SECONDS}" == "240" ]] \
    || fail production_runtime_override_forbidden
fi

PACKAGE_ID="$(jq -r '.packageId' "${REQUEST_FILE}")"
BASELINE_COMMIT="$(jq -r '.releaseBaselineCommit' "${REQUEST_FILE}")"
TARGET_COMMIT="$(jq -r '.releaseTargetCommit' "${REQUEST_FILE}")"
TARGET_TREE="$(jq -r '.releaseTargetTree' "${REQUEST_FILE}")"
TARGET_BRANCH="$(jq -r '.releaseTargetBranch' "${REQUEST_FILE}")"
RELEASE_DIFF_SHA256="$(jq -r '.releaseDiffSha256' "${REQUEST_FILE}")"
RELEASE_PATH_SET_SHA256="$(jq -r '.releasePathSetSha256' "${REQUEST_FILE}")"
BASE_ENV="$(jq -r '.baseEnvPath' "${REQUEST_FILE}")"
PRODUCTION_ENV="$(jq -r '.productionEnvPath' "${REQUEST_FILE}")"
IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
CURRENT_WEB_IMAGE="$(jq -r '.currentWebImageId' "${REQUEST_FILE}")"
CURRENT_WORKER_CONTAINER="$(jq -r '.candidateWorkerContainerId' "${REQUEST_FILE}")"
CURRENT_WORKER_IMAGE="$(jq -r '.candidateWorkerImageId' "${REQUEST_FILE}")"
ROLLBACK_WEB_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
APPROVED_TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
TRUST_ROOT="${TRUST_ROOT_OVERRIDE:-${APPROVED_TRUST_ROOT}}"
LINEAGE_EVIDENCE="$(jq -r '.lineageEvidencePath' "${REQUEST_FILE}")"
RECONCILIATION_EVIDENCE="$(jq -r '.reconciliationEvidencePath' "${REQUEST_FILE}")"

[[ "${PACKAGE_ID}" == "WP-G0.2-SHADOW-VERIFY-CODE-AUTHORIZATION-PRODUCTION-RELEASE" \
  && "${BASELINE_COMMIT}" == "54837d03d0fb91b33cf9919bd25ab7aaad60dd7e" \
  && "${TARGET_COMMIT}" == "eb48827b8b403452328b65dc4b415c3fc0ecf765" \
  && "${TARGET_TREE}" == "a02f989b1be653d4524d1b6dd73995dabeb73f3d" ]] \
  || fail release_identity_invalid
if [[ "${REHEARSAL}" != "true" ]]; then
  [[ "${TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" \
    && "${APPROVED_TRUST_ROOT}" == "${TRUST_ROOT}" && ! -L "${TRUST_ROOT}" ]] \
    || fail autonomy_trust_root_invalid
  mkdir -p "${TRUST_ROOT}"
  chmod 700 "${TRUST_ROOT}"
  [[ "$(realpath "${TRUST_ROOT}")" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
    || fail autonomy_trust_root_escape
fi

if [[ "${REHEARSAL}" == "true" ]]; then
  DOCKER=(docker)
  COMPOSE=("${IDENTITY_WRAPPER}" --env-file "${BASE_ENV}" --env-file "${PRODUCTION_ENV}")
else
  DOCKER=(sudo -n docker)
  COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV}" --env-file "${PRODUCTION_ENV}")
fi

for path in "${BASE_ENV}" "${PRODUCTION_ENV}" "${IDENTITY_OVERRIDE}" "${IDENTITY_WRAPPER}"; do
  [[ -f "${path}" && ! -L "${path}" ]] || fail runtime_identity_file_invalid
done
[[ "$(hash_file "${BASE_ENV}")" == "$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${PRODUCTION_ENV}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${IDENTITY_OVERRIDE}")" == "$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${IDENTITY_WRAPPER}")" == "$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${ROOT_DIR}/docker-compose.yml")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
  || fail runtime_identity_checksum_mismatch

run_validator() {
  if command -v node >/dev/null 2>&1; then
    node "${VALIDATOR}" validate-request --manifest "${TRANSPORT_MANIFEST}" \
      --request "${REQUEST_FILE}" >/dev/null
    return
  fi
  "${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${LINEAGE_EVIDENCE},dst=${LINEAGE_EVIDENCE},readonly" \
    --mount "type=bind,src=${RECONCILIATION_EVIDENCE},dst=${RECONCILIATION_EVIDENCE},readonly" \
    --entrypoint node "${CURRENT_WEB_IMAGE}" \
    /packet/scripts/production/candidate-shadow-verify-release/bundle.mjs validate-request \
    --manifest /packet/transport-manifest.json --request /packet/approval-request.json >/dev/null
}
run_validator

[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${BASELINE_COMMIT}" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] \
  || fail production_git_baseline_invalid
git -C "${ROOT_DIR}" fetch --no-tags origin "${TARGET_BRANCH}"
[[ "$(git -C "${ROOT_DIR}" cat-file -t "${TARGET_COMMIT}")" == "commit" \
  && "$(git -C "${ROOT_DIR}" rev-list --parents -n 1 "${TARGET_COMMIT}")" \
    == "${TARGET_COMMIT} ${BASELINE_COMMIT}" \
  && "$(git -C "${ROOT_DIR}" rev-parse "${TARGET_COMMIT}^{tree}")" == "${TARGET_TREE}" \
  && "$(git -C "${ROOT_DIR}" diff-tree --no-commit-id --name-status -r "${TARGET_COMMIT}" \
      | sha256sum | awk '{print $1}')" == "${RELEASE_DIFF_SHA256}" \
  && "$(git -C "${ROOT_DIR}" diff-tree --no-commit-id --name-only -r "${TARGET_COMMIT}" \
      | LC_ALL=C sort | sha256sum | awk '{print $1}')" == "${RELEASE_PATH_SET_SHA256}" ]] \
  || fail fetched_release_target_invalid

WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
WORKER_CONTAINER="$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
WORKER_IMAGE="$("${DOCKER[@]}" inspect "${WORKER_CONTAINER}" --format '{{.Image}}')"
PREVIOUS_WEB_REF="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Config.Image}}')"
[[ -n "${WEB_CONTAINER}" && "${WEB_IMAGE}" == "${CURRENT_WEB_IMAGE}" \
  && "${WORKER_CONTAINER}" == "${CURRENT_WORKER_CONTAINER}" \
  && "${WORKER_IMAGE}" == "${CURRENT_WORKER_IMAGE}" && -n "${PREVIOUS_WEB_REF}" ]] \
  || fail current_container_identity_invalid

non_web_containers() {
  "${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v '^chuan-market-radar-web-1=' | LC_ALL=C sort
}
NON_WEB_BEFORE="$(non_web_containers)"

verify_worker_identity() {
  local container image
  container="$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
  image="$("${DOCKER[@]}" inspect "${container}" --format '{{.Image}}' 2>/dev/null || true)"
  [[ "${container}" == "${CURRENT_WORKER_CONTAINER}" && "${image}" == "${CURRENT_WORKER_IMAGE}" ]]
}
verify_non_web() { [[ "$(non_web_containers)" == "${NON_WEB_BEFORE}" ]]; }
verify_evidence() {
  [[ "$(hash_file "${LINEAGE_EVIDENCE}")" == "$(jq -r '.lineageEvidenceSha256' "${REQUEST_FILE}")" \
    && "$(hash_file "${RECONCILIATION_EVIDENCE}")" \
      == "$(jq -r '.reconciliationEvidenceSha256' "${REQUEST_FILE}")" ]]
}
verify_rollback_image() {
  [[ "$("${DOCKER[@]}" image inspect "${ROLLBACK_WEB_REF}" --format '{{.Id}}' 2>/dev/null || true)" \
    == "${CURRENT_WEB_IMAGE}" ]]
}
verify_manifest_absent() {
  local container
  container="$("${COMPOSE[@]}" ps -q web)"
  "${DOCKER[@]}" exec "${container}" test ! -e /run/market-radar/candidate-read-authority.json
}
control_snapshot() {
  local container
  container="$("${COMPOSE[@]}" ps -q web)"
  "${DOCKER[@]}" exec -i "${container}" node - <<'NODE'
const pg = require("pg");
const client = new pg.Client({
  application_name: "market-radar-shadow-verify-release-preflight",
  connectionString: process.env.CANDIDATE_MONITOR_DATABASE_URL,
});
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE");
  await client.query("SET LOCAL ROLE candidate_audit_role");
  const result = await client.query(`SELECT migration_id, phase, epoch::int,
    write_frozen, approved_release_id FROM candidate_authority.candidate_migration_control
    WHERE phase='shadow_capture' AND write_frozen=false ORDER BY started_at DESC LIMIT 2`);
  const role = await client.query("SELECT current_user, current_setting('transaction_read_only') AS read_only");
  await client.query("ROLLBACK");
  if (result.rows.length !== 1 || role.rows[0]?.current_user !== "candidate_audit_role"
      || role.rows[0]?.read_only !== "on") throw new Error("control_snapshot_invalid");
  process.stdout.write(JSON.stringify(result.rows[0]));
} finally { await client.end(); }
NODE
}
CONTROL_BEFORE="$(control_snapshot)"
[[ "$(jq -r '.migration_id' <<<"${CONTROL_BEFORE}")" == "$(jq -r '.candidateMigrationId' "${REQUEST_FILE}")" \
  && "$(jq -r '.phase' <<<"${CONTROL_BEFORE}")" == "shadow_capture" \
  && "$(jq -r '.epoch' <<<"${CONTROL_BEFORE}")" == "$(jq -r '.candidateAuthorityEpoch' "${REQUEST_FILE}")" \
  && "$(jq -r '.write_frozen' <<<"${CONTROL_BEFORE}")" == "false" \
  && "$(jq -r '.approved_release_id' <<<"${CONTROL_BEFORE}")" == "$(jq -r '.candidateReleaseId' "${REQUEST_FILE}")" ]] \
  || fail candidate_control_preflight_invalid

verify_health() {
  curl -fsS http://127.0.0.1/api/health | jq -e '
    .ok == true and .health.level == "ready"
    and .health.persistence.databaseStatus == "ready"
    and .health.scan.freshness == "fresh"
    and ([.health.runtimeProbes.workers[]?
      | select(.name == "candidate-shadow-worker" and .status == "healthy")] | length == 1)
    and ([.health.runtimeProbes.workers[]?
      | select(.name == "scanner-worker" and .status == "healthy")] | length == 1)
  ' >/dev/null
}
wait_health() {
  local deadline=$((SECONDS + WEB_READY_TIMEOUT_SECONDS))
  while ! verify_health; do
    (( SECONDS < deadline )) || return 1
    sleep "${WEB_READY_POLL_SECONDS}"
  done
}
verify_endpoint_fail_closed() {
  local container
  container="$("${COMPOSE[@]}" ps -q web)"
  "${DOCKER[@]}" exec -i "${container}" node - <<'NODE'
const response = await fetch("http://127.0.0.1:3000/api/frontend/candidate-lifecycle");
const body = await response.json();
if (response.status !== 503 || body.ok !== false
    || body.error !== "candidate_read_control_unavailable"
    || !body.blockers?.includes("candidate_read_trusted_context_invalid")) process.exit(1);
NODE
}

verify_worker_identity && verify_non_web && verify_evidence && verify_manifest_absent \
  && verify_health || fail production_preflight_invalid

mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
LEASE_EXECUTION="${EVIDENCE_DIRECTORY}/lease-execution.json"
LEASE_EVENTS="${EVIDENCE_DIRECTORY}/lease-events.jsonl"
OBSERVATIONS="${EVIDENCE_DIRECTORY}/observations.jsonl"
SUMMARY="${EVIDENCE_DIRECTORY}/summary.json"
ROLLBACK_RESULT="${EVIDENCE_DIRECTORY}/rollback.json"

lease_event() {
  local command="$1"
  shift
  if command -v node >/dev/null 2>&1; then
    node "${LEASE_CLI}" "${command}" --trust-root "${TRUST_ROOT}" \
      --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION}" "$@" \
      | tee -a "${LEASE_EVENTS}" >/dev/null
    return
  fi
  "${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT}/scripts/governance,dst=/runner,readonly" \
    --mount "type=bind,src=${REQUEST_FILE},dst=/request/approval-request.json,readonly" \
    --mount "type=bind,src=${TRUST_ROOT},dst=${TRUST_ROOT}" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --entrypoint node "${CURRENT_WEB_IMAGE}" \
    /runner/autonomy-production-lease-cli.mjs "${command}" \
    --trust-root "${TRUST_ROOT}" --request /request/approval-request.json \
    --execution "${LEASE_EXECUTION}" "$@" | tee -a "${LEASE_EVENTS}" >/dev/null
}

LEASE_ACQUIRED=false
LEASE_RELEASED=false
MUTATED=false
SUCCEEDED=false
FAILURE_PHASE=pre-mutation
rollback() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "${exit_code}" -eq 0 || "${SUCCEEDED}" == "true" ]]; then exit "${exit_code}"; fi
  if [[ "${MUTATED}" != "true" ]]; then
    if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
      lease_event safety-checkpoint --checkpoint pre-mutation-stop || true
      lease_event release --outcome SAFE_STOP_PRE_MUTATION || true
    fi
    exit "${exit_code}"
  fi
  local rollback_ok=true restored_container restored_image
  lease_event safety-checkpoint --checkpoint rollback || rollback_ok=false
  verify_rollback_image || rollback_ok=false
  "${DOCKER[@]}" tag "${ROLLBACK_WEB_REF}" "${PREVIOUS_WEB_REF}" || rollback_ok=false
  git -C "${ROOT_DIR}" checkout --detach "${BASELINE_COMMIT}" || rollback_ok=false
  "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_ok=false
  wait_health || rollback_ok=false
  restored_container="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
  restored_image="$("${DOCKER[@]}" inspect "${restored_container}" --format '{{.Image}}' 2>/dev/null || true)"
  [[ "${restored_image}" == "${CURRENT_WEB_IMAGE}" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)" == "${BASELINE_COMMIT}" \
    && -z "$(git -C "${ROOT_DIR}" status --porcelain 2>/dev/null || true)" ]] || rollback_ok=false
  verify_worker_identity && verify_non_web && verify_evidence \
    && [[ "$(control_snapshot)" == "${CONTROL_BEFORE}" ]] || rollback_ok=false
  jq -n --arg status "$([[ "${rollback_ok}" == true ]] && echo ROLLBACK_PASS || echo ROLLBACK_FAIL)" \
    --arg failurePhase "${FAILURE_PHASE}" --arg baselineCommit "${BASELINE_COMMIT}" \
    --arg webImageId "${restored_image}" \
    '{status:$status,failurePhase:$failurePhase,baselineCommit:$baselineCommit,webImageId:$webImageId}' \
    > "${ROLLBACK_RESULT}" || true
  if [[ "${rollback_ok}" == true ]]; then
    lease_event release --outcome ROLLBACK_PASS || true
    printf 'ROLLBACK_SHADOW_VERIFY_CODE_RELEASE_VERIFIED\n' >&2
  else
    printf 'P0_ROLLBACK_SHADOW_VERIFY_CODE_RELEASE_NOT_VERIFIED\n' >&2
  fi
  exit "${exit_code}"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

lease_event acquire --owner-id "${PACKAGE_ID}:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre-mutation
lease_event consume
lease_event checkpoint --checkpoint retain-rollback-image
"${DOCKER[@]}" tag "${CURRENT_WEB_IMAGE}" "${ROLLBACK_WEB_REF}"
verify_rollback_image || fail rollback_image_retention_failed

lease_event checkpoint --checkpoint checkout-target
FAILURE_PHASE=checkout-target
git -C "${ROOT_DIR}" checkout --detach "${TARGET_COMMIT}"
MUTATED=true
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${TARGET_COMMIT}" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] || fail target_checkout_failed

lease_event checkpoint --checkpoint build-web
FAILURE_PHASE=build-web
"${COMPOSE[@]}" build web
verify_rollback_image || fail rollback_image_lost_during_build

lease_event checkpoint --checkpoint recreate-web
FAILURE_PHASE=recreate-web
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
wait_health || fail target_web_not_ready_fresh
TARGET_WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
TARGET_WEB_IMAGE="$("${DOCKER[@]}" inspect "${TARGET_WEB_CONTAINER}" --format '{{.Image}}')"
[[ -n "${TARGET_WEB_CONTAINER}" && "${TARGET_WEB_IMAGE}" != "${CURRENT_WEB_IMAGE}" ]] \
  || fail target_web_image_transition_not_proven

FAILURE_PHASE=immediate-verification
verify_endpoint_fail_closed && verify_manifest_absent && verify_worker_identity \
  && verify_non_web && verify_evidence && verify_rollback_image \
  && [[ "$(control_snapshot)" == "${CONTROL_BEFORE}" ]] \
  || fail immediate_runtime_boundary_failed

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEADLINE=$((SECONDS + OBSERVATION_DURATION_SECONDS))
SAMPLES=0
while true; do
  lease_event checkpoint --checkpoint observation-sample
  FAILURE_PHASE=continuous-observation
  verify_health && verify_endpoint_fail_closed && verify_manifest_absent \
    && verify_worker_identity && verify_non_web && verify_evidence \
    && verify_rollback_image && [[ "$(control_snapshot)" == "${CONTROL_BEFORE}" ]] \
    || fail continuous_runtime_boundary_failed
  SAMPLES=$((SAMPLES + 1))
  jq -n -c --arg sampledAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson sample "${SAMPLES}" --arg webImageId "${TARGET_WEB_IMAGE}" \
    '{sampledAt:$sampledAt,sample:$sample,health:"ready",scanFreshness:"fresh",candidatePhase:"shadow_capture",candidateRead:"fail_closed_503",webImageId:$webImageId}' \
    >> "${OBSERVATIONS}"
  (( SECONDS >= DEADLINE )) && break
  sleep "${OBSERVATION_POLL_SECONDS}"
done
if [[ "${REHEARSAL}" != "true" && "${SAMPLES}" -lt 61 ]]; then
  fail observation_sample_count_insufficient
fi

FAILURE_PHASE=final-closeout
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${TARGET_COMMIT}" \
  && -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] \
  && verify_health && verify_endpoint_fail_closed && verify_manifest_absent \
  && verify_worker_identity && verify_non_web && verify_evidence \
  && verify_rollback_image && [[ "$(control_snapshot)" == "${CONTROL_BEFORE}" ]] \
  || fail final_closeout_failed

COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SUMMARY_TEMP="${SUMMARY}.tmp"
jq -n --arg status "PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY" \
  --arg packageId "${PACKAGE_ID}" --arg baselineCommit "${BASELINE_COMMIT}" \
  --arg targetCommit "${TARGET_COMMIT}" --arg targetWebImageId "${TARGET_WEB_IMAGE}" \
  --arg startedAt "${STARTED_AT}" --arg completedAt "${COMPLETED_AT}" \
  --argjson samples "${SAMPLES}" \
  '{status:$status,packageId:$packageId,baselineCommit:$baselineCommit,targetCommit:$targetCommit,targetWebImageId:$targetWebImageId,startedAt:$startedAt,completedAt:$completedAt,samples:$samples,servicesMutated:["web"],databaseMutation:false,redisMutation:false,workerMutation:false,phaseTransition:false,manifestMutation:false,legacyResponseAuthority:true,rollbackImageRetained:true}' \
  > "${SUMMARY_TEMP}"
lease_event checkpoint --checkpoint success-closeout
lease_event release --outcome PASS
LEASE_RELEASED=true
mv "${SUMMARY_TEMP}" "${SUMMARY}"
SUCCEEDED=true
trap - EXIT INT TERM HUP
printf 'PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY\n'
