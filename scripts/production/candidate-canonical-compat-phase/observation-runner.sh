#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
OBSERVATION_CONTEXT="${OBSERVATION_CONTEXT:-}"
MODE="${CANONICAL_COMPAT_OBSERVATION_MODE:-full}"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(jq -r '.productionRoot' "${REQUEST_FILE}")}"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/runner.mjs"
PRODUCTION_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/production-runner.sh"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
MANIFEST_PATH="/run/market-radar/candidate-read-authority.json"
FULL_SNAPSHOT_PATH="/run/market-radar/candidate-read-full-snapshot.cjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }

[[ "${MODE}" == "sample" || "${MODE}" == "full" ]] || fail observation_mode_invalid
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" \
  && -f "${OBSERVATION_CONTEXT}" && ! -L "${OBSERVATION_CONTEXT}" ]] \
  || fail observation_inputs_missing
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
BASE_ENV="$(jq -r '.baseEnvPath' "${REQUEST_FILE}")"
ENV_FILE="$(jq -r '.productionEnvPath' "${REQUEST_FILE}")"
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
WEB_IMAGE="$(jq -r '.webImageId' "${REQUEST_FILE}")"
WEB_CONTAINER="$(jq -r '.webContainerId' "${OBSERVATION_CONTEXT}")"
WORKER_CONTAINER="$(jq -r '.candidateWorkerContainerId' "${REQUEST_FILE}")"
WORKER_IMAGE="$(jq -r '.candidateWorkerImageId' "${REQUEST_FILE}")"
PRODUCTION_COMMIT="$(jq -r '.productionCommit' "${REQUEST_FILE}")"
MIGRATION_ID="$(jq -r '.migrationId' "${REQUEST_FILE}")"
RELEASE_ID="$(jq -r '.releaseId' "${REQUEST_FILE}")"
TARGET_EPOCH="$(jq -r '.targetAuthorityEpoch' "${REQUEST_FILE}")"
MANIFEST_SHA="$(jq -r '.manifestApprovalDigest' "${REQUEST_FILE}" | sed 's/^sha256://')"
TARGET_ENV_SHA="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
NON_TARGET_IDENTITY="${OPS_ROOT}/state/non-target-identity.txt"

REHEARSAL=false
case "${OPS_ROOT}/" in
  /home/ubuntu/.cache/market-radar-ops/canonical-compat-phase-ops/*/) ;;
  /tmp/wp_g0_2_rehearsal_canonical_compat_phase_*/ops/) REHEARSAL=true ;;
  *) fail observation_ops_root_invalid ;;
esac
mkdir -p "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi
if [[ "${REHEARSAL}" == "true" ]]; then
  COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV}" --env-file "${ENV_FILE}")
else
  COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV}" --env-file "${ENV_FILE}")
fi

run_node() {
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  if [[ "${REHEARSAL}" != "true" ]]; then
    mounts+=(--mount "type=bind,src=${TRUST_ROOT},dst=${TRUST_ROOT}")
  fi
  "${DOCKER[@]}" run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}

LEASE_EXECUTION="${EVIDENCE_DIRECTORY}/lease-execution.json"
LEASE_EVENTS="${EVIDENCE_DIRECTORY}/lease-events.jsonl"
lease_event() {
  local action="$1"; shift
  [[ "${REHEARSAL}" == "true" ]] && return 0
  run_node "${LEASE_CLI}" "${action}" --trust-root "${TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION}" "$@" \
    | tee -a "${LEASE_EVENTS}" >/dev/null
}

verify_static_identity() {
  local current_worker current_non_target
  [[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
    && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" \
    && "$(sha_file "${ENV_FILE}")" == "${TARGET_ENV_SHA}" \
    && "$(sha_file "${ROOT_DIR}/docker-compose.yml")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
    || return 1
  [[ "$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}' 2>/dev/null || true)" \
    == "${WEB_IMAGE}" ]] || return 1
  current_worker="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
  [[ -z "${current_worker}" ]] || return 1
  [[ -f "${NON_TARGET_IDENTITY}" && ! -L "${NON_TARGET_IDENTITY}" ]] || return 1
  current_non_target="$("${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v '^chuan-market-radar-web-1=' \
    | grep -v '^chuan-market-radar-candidate-shadow-worker-1=' | LC_ALL=C sort)"
  [[ "${current_non_target}" == "$(cat "${NON_TARGET_IDENTITY}")" ]] || return 1
  [[ "$(${DOCKER[@]} exec "${WEB_CONTAINER}" stat -c '%u:%g:%a' "${MANIFEST_PATH}")" == "0:0:600" \
    && "$(${DOCKER[@]} exec "${WEB_CONTAINER}" sha256sum "${MANIFEST_PATH}" | awk '{print $1}')" == "${MANIFEST_SHA}" \
    && "$(${DOCKER[@]} exec "${WEB_CONTAINER}" stat -c '%u:%g:%a' "${FULL_SNAPSHOT_PATH}")" == "0:0:500" \
    && "$(${DOCKER[@]} exec "${WEB_CONTAINER}" sha256sum "${FULL_SNAPSHOT_PATH}" | awk '{print $1}')" \
      == "$(sha_file "${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/full-snapshot-observer.cjs")" ]] \
    || return 1
}

collect_sample() {
  local output="$1" api_file full_file
  verify_static_identity || fail observation_static_identity_drift
  api_file="${OPS_ROOT}/state/api-health-sample.json"
  full_file="${OPS_ROOT}/state/full-snapshot-sample.json"
  "${DOCKER[@]}" exec -i "${WEB_CONTAINER}" node - > "${api_file}" <<'NODE'
const healthResponse = await fetch("http://127.0.0.1:3000/api/health", {
  headers: { "cache-control": "no-store" },
});
const healthBody = await healthResponse.json();
const response = await fetch(
  "http://127.0.0.1:3000/api/frontend/candidate-lifecycle?limit=1000",
  { headers: { "cache-control": "no-store" } },
);
const body = await response.json();
const resource = body.resource ?? {};
const workers = healthBody.health?.runtimeProbes?.workers ?? [];
const worker = (name) => workers.find((item) => (item.name ?? item.key) === name)?.status ?? "absent";
process.stdout.write(JSON.stringify({
  sampledAt: new Date().toISOString(),
  healthLevel: healthBody.health?.level,
  scanFreshness: healthBody.health?.scan?.freshness,
  databaseStatus: healthBody.health?.persistence?.databaseStatus,
  redisStatus: healthBody.health?.runtimeProbes?.redis?.status,
  candidateWorkerStatus: worker("candidate-shadow-worker"),
  scannerWorkerStatus: worker("scanner-worker"),
  api: {
    httpStatus: response.status,
    ok: body.ok === true,
    mode: resource.mode,
    readSource: resource.readSource,
    authority: resource.authority,
    status: resource.status,
    allowedUse: resource.allowedUse,
    candidateCanonicalReviewUsable: resource.candidateCanonicalReviewUsable,
    canAuthorizeCutover: resource.canAuthorizeCutover,
    canCreateTradePlan: resource.canCreateTradePlan,
    canMutateLiveRanking: resource.canMutateLiveRanking,
    automaticPhaseAdvance: resource.automaticPhaseAdvance,
    parityStatus: resource.parity?.status,
    differenceCount: resource.parity?.differenceCount,
    differences: resource.parity?.differences?.length,
    comparisonHash: resource.parity?.comparisonHash,
  },
}) + "\n");
NODE
  "${DOCKER[@]}" exec \
    -e EXPECTED_CANDIDATE_MIGRATION_ID="${MIGRATION_ID}" \
    -e EXPECTED_CANDIDATE_RELEASE_ID="${RELEASE_ID}" \
    -e EXPECTED_CANDIDATE_AUTHORITY_EPOCH="${TARGET_EPOCH}" \
    "${WEB_CONTAINER}" node "${FULL_SNAPSHOT_PATH}" > "${full_file}"
  jq -s --arg schemaVersion "candidate-canonical-compat-observation-sample.v1" \
    --arg packageId "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION" \
    --arg productionCommit "${PRODUCTION_COMMIT}" --arg webContainerId "${WEB_CONTAINER}" \
    --arg webImageId "${WEB_IMAGE}" --arg candidateWorkerContainerId "${WORKER_CONTAINER}" \
    --arg candidateWorkerImageId "${WORKER_IMAGE}" --arg migrationId "${MIGRATION_ID}" \
    --arg releaseId "${RELEASE_ID}" --argjson authorityEpoch "${TARGET_EPOCH}" \
    --arg phase canonical_compat --arg approvalDigest "$(jq -r '.manifestApprovalDigest' "${REQUEST_FILE}")" \
    --arg manifestSha256 "${MANIFEST_SHA}" --arg productionEnvSha256 "${TARGET_ENV_SHA}" \
    '.[0] + {
      sampledAt:.[1].databaseNow,
      schemaVersion:$schemaVersion,packageId:$packageId,productionCommit:$productionCommit,
      webContainerId:$webContainerId,webImageId:$webImageId,
      candidateWorkerContainerId:$candidateWorkerContainerId,
      candidateWorkerImageId:$candidateWorkerImageId,migrationId:$migrationId,
      releaseId:$releaseId,authorityEpoch:$authorityEpoch,phase:$phase,
      approvalDigest:$approvalDigest,manifestSha256:$manifestSha256,
      productionEnvSha256:$productionEnvSha256,fullSnapshot:.[1]
    }' "${api_file}" "${full_file}" > "${output}"
  chmod 600 "${output}"
  run_node "${RUNNER}" sample --request "${OBSERVATION_CONTEXT}" --input "${output}" >/dev/null
}

if [[ "${MODE}" == "sample" ]]; then
  OUTPUT_SAMPLE="${OUTPUT_SAMPLE:-${OPS_ROOT}/evidence/immediate-sample.json}"
  collect_sample "${OUTPUT_SAMPLE}"
  printf '%s\n' 'PASS_IMMEDIATE_CANONICAL_COMPAT_SAMPLE'
  exit 0
fi

SAMPLES_FILE="${OPS_ROOT}/evidence/observation-samples.jsonl"
FINAL_FILE="${OPS_ROOT}/evidence/observation-final.json"
LOCK_DIR="${OPS_ROOT}/state/observation.lock"
mkdir "${LOCK_DIR}" 2>/dev/null || fail observation_already_running
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT
: > "${SAMPLES_FILE}"
chmod 600 "${SAMPLES_FILE}"

cleanup_temporary() {
  [[ "${REHEARSAL}" == "true" ]] && return 0
  [[ "${SOURCE_ROOT}" == "$(jq -r '.stagingDirectory' "${REQUEST_FILE}")" \
    && "${SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-phase-* \
    && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/canonical-compat-phase-ops/* \
    && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-canonical-compat-phase/* \
    && "${EVIDENCE_DIRECTORY}" != "${SOURCE_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${OPS_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${SECURE_ROOT}" ]] || fail cleanup_boundary_invalid
  rm -rf -- "${OPS_ROOT}" "${SECURE_ROOT}" "${SOURCE_ROOT}"
}

automatic_rollback() {
  local exit_code=$?
  trap - ERR EXIT INT TERM HUP
  printf '%s\n' 'ERROR: Canonical Compat observation failed; invoking safety rollback.' >&2
  if ! CANONICAL_COMPAT_PHASE_MODE=automatic_rollback CONFIRM_CANONICAL_COMPAT_PHASE=true \
    REQUEST_FILE="${REQUEST_FILE}" ROOT_DIR_OVERRIDE="${ROOT_DIR}" \
    bash "${PRODUCTION_RUNNER}"; then
    printf '%s\n' 'P0_CANONICAL_COMPAT_OBSERVATION_ROLLBACK_FAILED' >&2
    exit 98
  fi
  exit "${exit_code}"
}
trap automatic_rollback ERR

lease_event observation-checkpoint --checkpoint observation_start
START_EPOCH="$(date +%s)"
for (( sample_number=1; sample_number<=289; sample_number++ )); do
  lease_event observation-checkpoint --checkpoint "sample_${sample_number}"
  SAMPLE_FILE="${OPS_ROOT}/state/sample-${sample_number}.json"
  collect_sample "${SAMPLE_FILE}"
  jq -c . "${SAMPLE_FILE}" >> "${SAMPLES_FILE}"
  printf 'canonical_compat_sample=%s/289 status=pass\n' "${sample_number}"
  if (( sample_number < 289 )); then
    TARGET_EPOCH_SECONDS=$((START_EPOCH + sample_number * 300))
    NOW_EPOCH="$(date +%s)"
    SLEEP_SECONDS=$((TARGET_EPOCH_SECONDS - NOW_EPOCH))
    (( SLEEP_SECONDS > 0 )) || fail observation_sampling_schedule_overrun
    sleep "${SLEEP_SECONDS}"
  fi
done

run_node "${RUNNER}" observe --request "${OBSERVATION_CONTEXT}" \
  --input "${SAMPLES_FILE}" > "${FINAL_FILE}"
install -m 0600 "${SAMPLES_FILE}" "${EVIDENCE_DIRECTORY}/observation-samples.jsonl"
install -m 0600 "${FINAL_FILE}" "${EVIDENCE_DIRECTORY}/observation-final.json"
printf '{"schemaVersion":"candidate-canonical-compat-observation-closeout.v1","outcome":"PASS_CANONICAL_COMPAT_OBSERVATION","closedAt":"%s","canonicalCompatStarted":true,"canonicalCutoverExecuted":false,"secretsPrinted":false}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${EVIDENCE_DIRECTORY}/observation-closeout.json"
chmod 600 "${EVIDENCE_DIRECTORY}/observation-closeout.json"
lease_event observation-checkpoint --checkpoint observation_final
lease_event release --outcome PASS_OBSERVATION
trap - ERR
cleanup_temporary
printf '%s\n' 'PASS_CANONICAL_COMPAT_OBSERVATION'
