#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in cp docker git jq realpath sha256sum sudo tar; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "runner_command_missing:${command_name}"
done
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" \
  && "$(file_mode "${REQUEST_FILE}")" == "600" ]] || fail request_invalid
ACTUAL_ROOT="$(realpath "${SOURCE_ROOT}")"
[[ "${ACTUAL_ROOT}" == "$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-* ]] \
  || fail staging_boundary_invalid
BUNDLE_SHA256="$(tr -d '\r\n' < "${MARKER}")"
[[ "${BUNDLE_SHA256}" == "$(jq -r '.transportBundleSha256' "${REQUEST_FILE}")" ]] \
  || fail bundle_binding_invalid
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
[[ "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-handoff-* \
  && "${EVIDENCE_DIRECTORY}" != "${ACTUAL_ROOT}" && ! -e "${EVIDENCE_DIRECTORY}" ]] \
  || fail evidence_directory_invalid

DOCKER=(sudo -n docker)
${DOCKER[@]} ps >/dev/null 2>&1 || fail docker_unavailable
WEB_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
WORKER_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
WORKER_IMAGE="$(${DOCKER[@]} inspect "${WORKER_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_CONTAINER}" == "$(jq -r '.runtime.currentWebContainerId' "${REQUEST_FILE}")"
  && "${WEB_IMAGE}" == "$(jq -r '.runtime.currentWebImageId' "${REQUEST_FILE}")"
  && "${WORKER_CONTAINER}" == "$(jq -r '.runtime.phase.candidateWorkerContainerId' "${REQUEST_FILE}")"
  && "${WORKER_IMAGE}" == "$(jq -r '.runtime.phase.candidateWorkerImageId' "${REQUEST_FILE}")" ]] \
  || fail runtime_identity_drift
OBSERVATION_DIRECTORY="$(dirname "$(jq -r '.runtime.captureSpecification.unified.finalPath' "${REQUEST_FILE}")")"
BUILD_RECORD_DIRECTORY="$(dirname "$(jq -r '.runtime.buildRecordPath' "${REQUEST_FILE}")")"

validate_outer_request() {
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
    --mount "type=bind,src=${BUILD_RECORD_DIRECTORY},dst=${BUILD_RECORD_DIRECTORY},readonly" \
    --entrypoint node "${WEB_IMAGE}" \
    /packet/scripts/production/candidate-shadow-verify-handoff/bundle.mjs validate-request \
      --root /packet --manifest /packet/transport-manifest.json \
      --request /packet/approval-request.json --bundle "${BUNDLE_SHA256}" >/dev/null
}
validate_outer_request

PRODUCTION_COMMIT="$(jq -r '.runtime.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.runtime.productionTree' "${REQUEST_FILE}")"
[[ -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)"
  && -z "$(git -C "${PRODUCTION_ROOT}" branch --show-current)"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}"
  && "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" == "$(jq -r '.runtime.composeSha256' "${REQUEST_FILE}")"
  && "$(sha_file "${PRODUCTION_ROOT}/.env.production")" == "$(jq -r '.runtime.productionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail production_identity_or_stable_input_drift

mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
WORK_ROOT="${ACTUAL_ROOT}/.handoff-work"
[[ ! -e "${WORK_ROOT}" && ! -L "${WORK_ROOT}" ]] || fail work_root_already_exists
mkdir "${WORK_ROOT}"
chmod 700 "${WORK_ROOT}"
jq '.runtime' "${REQUEST_FILE}" > "${WORK_ROOT}/runtime.json"
chmod 600 "${WORK_ROOT}/runtime.json"

READONLY_STAGE=""
PHASE_STAGE=""
COMPLETED=false
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ -n "${READONLY_STAGE}" \
    && "${READONLY_STAGE}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-* \
    && "${READONLY_STAGE}" != "${ACTUAL_ROOT}" ]]; then
    rm -rf -- "${READONLY_STAGE}"
  fi
  if [[ "${COMPLETED}" == "true" ]]; then
    [[ "${WORK_ROOT}" == "${ACTUAL_ROOT}/.handoff-work"
      && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-* ]] \
      || exit 98
    rm -rf -- "${WORK_ROOT}" "${ACTUAL_ROOT}"
  fi
  exit "${exit_code}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

safe_extract() {
  local archive="$1"
  local expected_sha="$2"
  local destination="$3"
  [[ -f "${archive}" && ! -L "${archive}" && "$(sha_file "${archive}")" == "${expected_sha}"
    && "${destination}" == "${WORK_ROOT}"/extract-* && ! -e "${destination}" ]] \
    || fail child_archive_boundary_invalid
  while IFS= read -r entry; do
    [[ -n "${entry}" && "${entry}" != /* && "${entry}" != *".."* && "${entry}" != *\\* ]] \
      || fail child_archive_path_invalid
  done < <(tar -tzf "${archive}")
  mkdir "${destination}"
  chmod 700 "${destination}"
  tar -xzf "${archive}" --no-same-owner -C "${destination}"
  [[ -f "${destination}/transport-manifest.json" && ! -L "${destination}/transport-manifest.json" ]] \
    || fail child_manifest_missing
}

stage_child() {
  local extracted="$1"
  local request_path="$2"
  local stage="$3"
  local bundle_sha="$4"
  [[ "${stage}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-* \
    && ! -e "${stage}" && "${stage}" != "${ACTUAL_ROOT}" ]] || fail child_stage_invalid
  mkdir "${stage}"
  chmod 700 "${stage}"
  cp -a "${extracted}/." "${stage}/"
  install -m 0600 "${request_path}" "${stage}/approval-request.json"
  printf '%s\n' "${bundle_sha}" > "${stage}/.transport-bundle.sha256"
  chmod 600 "${stage}/.transport-bundle.sha256"
}

# R0 child: exact current-cycle code-presence, lineage, and reconciliation.
READONLY_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.readOnlySuperwindow.archivePath' "${REQUEST_FILE}")"
READONLY_SHA="$(jq -r '.childPackets.readOnlySuperwindow.sha256' "${REQUEST_FILE}")"
READONLY_EXTRACT="${WORK_ROOT}/extract-readonly"
safe_extract "${READONLY_ARCHIVE}" "${READONLY_SHA}" "${READONLY_EXTRACT}"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${READONLY_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
  --mount "type=bind,src=${BUILD_RECORD_DIRECTORY},dst=${BUILD_RECORD_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-shadow-verify-handoff/request-generator.mjs readonly \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/runtime.json --bundle "${READONLY_SHA}" \
    --output /work/readonly-request.json >/dev/null
READONLY_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/readonly-request.json")"
READONLY_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/readonly-request.json")"
READONLY_SUMMARY="${READONLY_EVIDENCE_DIRECTORY}/superwindow-final.json"
stage_child "${READONLY_EXTRACT}" "${WORK_ROOT}/readonly-request.json" \
  "${READONLY_STAGE}" "${READONLY_SHA}"
REQUEST_FILE="${READONLY_STAGE}/approval-request.json" \
CANDIDATE_READONLY_SUPERWINDOW_ENTRYPOINT_MODE=detached_worker \
bash "${READONLY_STAGE}/scripts/production/candidate-readonly-superwindow/production-entrypoint.sh"
READONLY_STAGE=""
[[ -f "${READONLY_SUMMARY}" && ! -L "${READONLY_SUMMARY}" \
  && "$(file_mode "${READONLY_SUMMARY}")" == "600" ]] || fail readonly_summary_missing
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${READONLY_EVIDENCE_DIRECTORY},dst=${READONLY_EVIDENCE_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-shadow-verify-handoff/request-generator.mjs \
    validate-readonly --summary "${READONLY_SUMMARY}" --commit "${PRODUCTION_COMMIT}" >/dev/null

# R2 child request is generated only after the exact R0 summary passes.
[[ "$(date -u +%s)" -lt "$(date -u -d "$(jq -r '.expiresAt' "${SOURCE_ROOT}/approval-request.json")" +%s)" ]] \
  || fail outer_authorization_expired_before_phase
PHASE_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.shadowVerifyPhase.archivePath' "${SOURCE_ROOT}/approval-request.json")"
PHASE_SHA="$(jq -r '.childPackets.shadowVerifyPhase.sha256' "${SOURCE_ROOT}/approval-request.json")"
PHASE_EXTRACT="${WORK_ROOT}/extract-phase"
safe_extract "${PHASE_ARCHIVE}" "${PHASE_SHA}" "${PHASE_EXTRACT}"
CODE_EVIDENCE="${READONLY_EVIDENCE_DIRECTORY}/$(jq -r '.childEvidence[0].evidenceFile' "${READONLY_SUMMARY}")"
LINEAGE_EVIDENCE="${READONLY_EVIDENCE_DIRECTORY}/$(jq -r '.childEvidence[1].evidenceFile' "${READONLY_SUMMARY}")"
RECONCILIATION_EVIDENCE="${READONLY_EVIDENCE_DIRECTORY}/$(jq -r '.childEvidence[2].evidenceFile' "${READONLY_SUMMARY}")"
for evidence in "${CODE_EVIDENCE}" "${LINEAGE_EVIDENCE}" "${RECONCILIATION_EVIDENCE}"; do
  [[ "${evidence}" == /home/ubuntu/.cache/market-radar-ops/evidence/*.json \
    && -f "${evidence}" && ! -L "${evidence}" && "$(file_mode "${evidence}")" == "600" ]] \
    || fail prerequisite_evidence_invalid
done
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${PHASE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --mount "type=bind,src=${READONLY_EVIDENCE_DIRECTORY},dst=${READONLY_EVIDENCE_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-shadow-verify-handoff/request-generator.mjs phase \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/runtime.json --summary "${READONLY_SUMMARY}" \
    --bundle "${PHASE_SHA}" --output /work/phase-request.json >/dev/null
PHASE_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/phase-request.json")"
PHASE_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/phase-request.json")"
PHASE_OBSERVER_UNIT="$(jq -r '.observerUnitName' "${WORK_ROOT}/phase-request.json")"
stage_child "${PHASE_EXTRACT}" "${WORK_ROOT}/phase-request.json" "${PHASE_STAGE}" "${PHASE_SHA}"
REQUEST_FILE="${PHASE_STAGE}/approval-request.json" \
SHADOW_VERIFY_PHASE_ENTRYPOINT_MODE=detached_worker \
bash "${PHASE_STAGE}/scripts/production/candidate-shadow-verify-phase/production-entrypoint.sh"
[[ "$(sudo -n systemctl show "${PHASE_OBSERVER_UNIT}.service" --property=ActiveState --value 2>/dev/null || true)" \
  == "active" && -f "${PHASE_EVIDENCE_DIRECTORY}/immediate-summary.json" ]] \
  || fail phase_observer_not_active
jq -e --arg commit "${PRODUCTION_COMMIT}" --arg tree "${PRODUCTION_TREE}" \
  --arg web "${WEB_IMAGE}" --arg migration "$(jq -r '.runtime.currentCycleFinal.migrationId' "${SOURCE_ROOT}/approval-request.json")" \
  --arg release "$(jq -r '.runtime.currentCycleFinal.releaseId' "${SOURCE_ROOT}/approval-request.json")" '
  .schemaVersion == "candidate-shadow-verify-phase-immediate.v2"
  and .status == "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE"
  and .productionCommit == $commit and .productionTree == $tree and .webImageId == $web
  and .migrationId == $migration and .releaseId == $release
  and .candidateResponseAuthority == "legacy" and .automaticPhaseAdvance == false' \
  "${PHASE_EVIDENCE_DIRECTORY}/immediate-summary.json" >/dev/null \
  || fail phase_immediate_summary_invalid

FINAL="${EVIDENCE_DIRECTORY}/handoff-final.json"
jq -n \
  --arg schemaVersion "wp-g0.2-current-cycle-to-shadow-verify-handoff-evidence.v2" \
  --arg status "PASS_SHADOW_VERIFY_HANDOFF_OBSERVER_ACTIVE" \
  --arg packageId "WP-G0.2-CURRENT-CYCLE-TO-SHADOW-VERIFY-AUTOMATIC-HANDOFF-SUPERWINDOW" \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg productionTree "${PRODUCTION_TREE}" \
  --arg migrationId "$(jq -r '.runtime.currentCycleFinal.migrationId' "${SOURCE_ROOT}/approval-request.json")" \
  --arg releaseId "$(jq -r '.runtime.currentCycleFinal.releaseId' "${SOURCE_ROOT}/approval-request.json")" \
  --arg webImageId "${WEB_IMAGE}" \
  --arg readOnlyEvidencePath "${READONLY_SUMMARY}" --arg readOnlyEvidenceSha256 "$(sha_file "${READONLY_SUMMARY}")" \
  --arg phaseEvidencePath "${PHASE_EVIDENCE_DIRECTORY}/immediate-summary.json" \
  --arg phaseEvidenceSha256 "$(sha_file "${PHASE_EVIDENCE_DIRECTORY}/immediate-summary.json")" \
  --arg phaseObserverUnit "${PHASE_OBSERVER_UNIT}.service" --arg phaseStagingDirectory "${PHASE_STAGE}" '
  {schemaVersion:$schemaVersion,status:$status,packageId:$packageId,
   sequence:["current_cycle_readonly_superwindow","shadow_verify_phase"],
   productionCommit:$productionCommit,productionTree:$productionTree,
   migrationId:$migrationId,releaseId:$releaseId,webImageId:$webImageId,
   readOnlyStatus:"PASS_CURRENT_CYCLE_READ_ONLY_VERIFICATION_SUPERWINDOW",
   phaseImmediateStatus:"PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE",
   observerActive:true,dualReadObservationCompleted:false,canonicalCompatStarted:false,
   canonicalCutoverExecuted:false,g0Completed:false,servicesMutated:["web"],
   databasePhaseTransition:"shadow_capture_to_shadow_verify",secretsPrinted:false,
   readOnlyEvidence:{path:$readOnlyEvidencePath,sha256:$readOnlyEvidenceSha256},
   phaseEvidence:{path:$phaseEvidencePath,sha256:$phaseEvidenceSha256},
   phaseObserverUnit:$phaseObserverUnit,phaseStagingDirectory:$phaseStagingDirectory}' > "${FINAL}"
chmod 600 "${FINAL}"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=/evidence,readonly" \
  --entrypoint node "${WEB_IMAGE}" -e '
    import("/orchestrator/scripts/production/candidate-shadow-verify-handoff/runner.mjs")
      .then(async (m) => m.validatePipelineFinal(JSON.parse(await (await import("node:fs/promises")).readFile("/evidence/handoff-final.json", "utf8"))))
      .catch((error) => { console.error(error.message); process.exit(1); });' >/dev/null
COMPLETED=true
printf '%s\n' 'PASS_SHADOW_VERIFY_HANDOFF_OBSERVER_ACTIVE'
