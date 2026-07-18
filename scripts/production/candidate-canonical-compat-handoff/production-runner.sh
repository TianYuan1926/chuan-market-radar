#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
EVIDENCE_ROOT="/home/ubuntu/.cache/market-radar-ops/evidence"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in cp date docker git jq realpath sha256sum sudo tar; do
  command -v "${command_name}" >/dev/null 2>&1 \
    || fail "runner_command_missing:${command_name}"
done
for file in "${REQUEST_FILE}" "${MANIFEST}" "${MARKER}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "staged_file_invalid:$(basename "${file}")"
done
[[ "$(file_mode "${REQUEST_FILE}")" == "600"
  && "$(file_mode "${MANIFEST}")" == "600"
  && "$(file_mode "${MARKER}")" == "600" ]] || fail staged_permissions_invalid

ACTUAL_ROOT="$(realpath "${SOURCE_ROOT}")"
[[ "${ACTUAL_ROOT}" == "$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-handoff-*
  && "${ACTUAL_ROOT}" != "/" && "${ACTUAL_ROOT}" != "${PRODUCTION_ROOT}" ]] \
  || fail staging_boundary_invalid
BUNDLE_SHA256="$(tr -d '\r\n' < "${MARKER}")"
[[ "${BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$
  && "${BUNDLE_SHA256}" == "$(jq -r '.transportBundleSha256' "${REQUEST_FILE}")" ]] \
  || fail bundle_binding_invalid
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
[[ "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-handoff-*
  && "${EVIDENCE_DIRECTORY}" != "${ACTUAL_ROOT}" && ! -e "${EVIDENCE_DIRECTORY}"
  && -d "${EVIDENCE_ROOT}" && ! -L "${EVIDENCE_ROOT}" ]] \
  || fail evidence_directory_invalid

DOCKER=(sudo -n docker)
"${DOCKER[@]}" ps >/dev/null 2>&1 || fail docker_unavailable
WEB_CONTAINER="$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
WORKER_CONTAINER="$("${DOCKER[@]}" ps \
  --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
WORKER_IMAGE="$("${DOCKER[@]}" inspect "${WORKER_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_CONTAINER}" == "$(jq -r '.runtime.currentWebContainerId' "${REQUEST_FILE}")"
  && "${WEB_IMAGE}" == "$(jq -r '.runtime.currentWebImageId' "${REQUEST_FILE}")"
  && "${WORKER_CONTAINER}" == "$(jq -r '.runtime.candidateWorkerContainerId' "${REQUEST_FILE}")"
  && "${WORKER_IMAGE}" == "$(jq -r '.runtime.candidateWorkerImageId' "${REQUEST_FILE}")" ]] \
  || fail runtime_identity_drift

validate_outer_request() {
  "${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${EVIDENCE_ROOT},dst=${EVIDENCE_ROOT},readonly" \
    --entrypoint node "${WEB_IMAGE}" \
    /packet/scripts/production/candidate-canonical-compat-handoff/bundle.mjs validate-request \
      --root /packet --manifest /packet/transport-manifest.json \
      --request /packet/approval-request.json --bundle "${BUNDLE_SHA256}" >/dev/null
}
validate_outer_request

PRODUCTION_COMMIT="$(jq -r '.runtime.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.runtime.productionTree' "${REQUEST_FILE}")"
[[ -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)"
  && -z "$(git -C "${PRODUCTION_ROOT}" branch --show-current)"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}" ]] \
  || fail production_git_identity_drift
for binding in \
  "composeSha256:${PRODUCTION_ROOT}/docker-compose.yml" \
  "baseEnvSha256:${PRODUCTION_ROOT}/.env" \
  "productionEnvSha256:${PRODUCTION_ROOT}/.env.production" \
  "identityWrapperSha256:$(jq -r '.runtime.identityWrapperPath' "${REQUEST_FILE}")" \
  "identityOverrideSha256:$(jq -r '.runtime.identityOverridePath' "${REQUEST_FILE}")" \
  "buildRecordSha256:$(jq -r '.runtime.buildRecordPath' "${REQUEST_FILE}")" \
  "lineageEvidenceSha256:$(jq -r '.runtime.lineageEvidencePath' "${REQUEST_FILE}")" \
  "reconciliationEvidenceSha256:$(jq -r '.runtime.reconciliationEvidencePath' "${REQUEST_FILE}")" \
  "dualReadEvidenceSha256:$(jq -r '.runtime.dualReadEvidencePath' "${REQUEST_FILE}")"; do
  key="${binding%%:*}"
  path="${binding#*:}"
  [[ -f "${path}" && ! -L "${path}"
    && "$(sha_file "${path}")" == "$(jq -r ".runtime.${key}" "${REQUEST_FILE}")" ]] \
    || fail "stable_input_identity_drift:${key}"
done

mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
WORK_ROOT="${ACTUAL_ROOT}/.handoff-work"
[[ ! -e "${WORK_ROOT}" && ! -L "${WORK_ROOT}" ]] || fail work_root_already_exists
mkdir "${WORK_ROOT}"
chmod 700 "${WORK_ROOT}"
jq '.runtime' "${REQUEST_FILE}" > "${WORK_ROOT}/runtime.json"
chmod 600 "${WORK_ROOT}/runtime.json"

CODE_STAGE=""
PHASE_STAGE=""
COMPLETED=false
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ -n "${CODE_STAGE}" \
    && "${CODE_STAGE}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-code-presence-* \
    && "${CODE_STAGE}" != "${ACTUAL_ROOT}" ]]; then
    rm -rf -- "${CODE_STAGE}"
  fi
  if [[ "${COMPLETED}" == "true" ]]; then
    [[ "${WORK_ROOT}" == "${ACTUAL_ROOT}/.handoff-work"
      && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-handoff-* ]] \
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
  [[ -f "${destination}/transport-manifest.json" \
    && ! -L "${destination}/transport-manifest.json" ]] || fail child_manifest_missing
}

stage_child() {
  local extracted="$1"
  local request_path="$2"
  local stage="$3"
  local bundle_sha="$4"
  local expected_prefix="$5"
  [[ "${stage}" == /home/ubuntu/.cache/market-radar-ops/"${expected_prefix}"-* \
    && ! -e "${stage}" && "${stage}" != "${ACTUAL_ROOT}" ]] || fail child_stage_invalid
  mkdir "${stage}"
  chmod 700 "${stage}"
  cp -a "${extracted}/." "${stage}/"
  install -m 0600 "${request_path}" "${stage}/approval-request.json"
  printf '%s\n' "${bundle_sha}" > "${stage}/.transport-bundle.sha256"
  chmod 600 "${stage}/.transport-bundle.sha256"
}

# R0: prove the currently running image already contains the exact Canonical read path.
CODE_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.codePresence.archivePath' "${REQUEST_FILE}")"
CODE_SHA="$(jq -r '.childPackets.codePresence.sha256' "${REQUEST_FILE}")"
CODE_EXTRACT="${WORK_ROOT}/extract-code-presence"
safe_extract "${CODE_ARCHIVE}" "${CODE_SHA}" "${CODE_EXTRACT}"
"${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${CODE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-canonical-compat-handoff/request-generator.mjs \
    code-presence --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/runtime.json --bundle "${CODE_SHA}" \
    --output /work/code-presence-request.json >/dev/null
CODE_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/code-presence-request.json")"
CODE_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/code-presence-request.json")"
CODE_SUMMARY="${CODE_EVIDENCE_DIRECTORY}/code-presence-evidence.json"
stage_child "${CODE_EXTRACT}" "${WORK_ROOT}/code-presence-request.json" \
  "${CODE_STAGE}" "${CODE_SHA}" "wp-g0-2-canonical-compat-code-presence"
CANDIDATE_CANONICAL_COMPAT_CODE_PRESENCE_ENTRYPOINT_MODE=detached_worker \
  bash "${CODE_STAGE}/scripts/production/candidate-canonical-compat-code-presence/production-entrypoint.sh" \
    "${CODE_STAGE}"
[[ -f "${CODE_SUMMARY}" && ! -L "${CODE_SUMMARY}" \
  && "$(file_mode "${CODE_SUMMARY}")" == "600" ]] || fail code_presence_summary_missing
"${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${CODE_EVIDENCE_DIRECTORY},dst=${CODE_EVIDENCE_DIRECTORY},readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-canonical-compat-handoff/request-generator.mjs \
    validate-code-presence --summary "${CODE_SUMMARY}" --runtime /work/runtime.json >/dev/null
[[ "${CODE_STAGE}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-code-presence-* ]] \
  || fail code_presence_cleanup_boundary_invalid
rm -rf -- "${CODE_STAGE}"
CODE_STAGE=""

# R2 is generated only from this invocation's exact R0 evidence and the current upstream evidence.
[[ "$(date -u +%s)" -lt "$(date -u -d "$(jq -r '.expiresAt' "${REQUEST_FILE}")" +%s)" ]] \
  || fail outer_authorization_expired_before_phase
validate_outer_request
PHASE_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.canonicalCompatPhase.archivePath' "${REQUEST_FILE}")"
PHASE_SHA="$(jq -r '.childPackets.canonicalCompatPhase.sha256' "${REQUEST_FILE}")"
PHASE_EXTRACT="${WORK_ROOT}/extract-phase"
safe_extract "${PHASE_ARCHIVE}" "${PHASE_SHA}" "${PHASE_EXTRACT}"
"${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${PHASE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --mount "type=bind,src=${EVIDENCE_ROOT},dst=${EVIDENCE_ROOT},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-canonical-compat-handoff/request-generator.mjs phase \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/runtime.json --summary "${CODE_SUMMARY}" \
    --bundle "${PHASE_SHA}" --output /work/phase-request.json >/dev/null
PHASE_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/phase-request.json")"
PHASE_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/phase-request.json")"
PHASE_OBSERVER_UNIT="$(jq -r '.observerUnitName' "${WORK_ROOT}/phase-request.json")"
stage_child "${PHASE_EXTRACT}" "${WORK_ROOT}/phase-request.json" \
  "${PHASE_STAGE}" "${PHASE_SHA}" "wp-g0-2-canonical-compat-phase"
REQUEST_FILE="${PHASE_STAGE}/approval-request.json" \
CANONICAL_COMPAT_PHASE_ENTRYPOINT_MODE=detached_worker \
  bash "${PHASE_STAGE}/scripts/production/candidate-canonical-compat-phase/production-entrypoint.sh"
PHASE_IMMEDIATE="${PHASE_EVIDENCE_DIRECTORY}/immediate-summary.json"
[[ "$(sudo -n systemctl show "${PHASE_OBSERVER_UNIT}.service" \
    --property=ActiveState --value 2>/dev/null || true)" == "active"
  && -f "${PHASE_IMMEDIATE}" && ! -L "${PHASE_IMMEDIATE}"
  && "$(file_mode "${PHASE_IMMEDIATE}")" == "600" ]] || fail phase_observer_not_active
jq -e '.status == "PASS_IMMEDIATE_CANONICAL_COMPAT_OBSERVATION_ACTIVE"
  and .candidateResponseAuthority == "candidate_parity_gated"
  and .automaticPhaseAdvance == false and .secretsPrinted == false' \
  "${PHASE_IMMEDIATE}" >/dev/null || fail phase_immediate_summary_invalid

FINAL="${EVIDENCE_DIRECTORY}/handoff-final.json"
jq -n \
  --arg schemaVersion "wp-g0.2-current-cycle-canonical-compat-handoff-evidence.v1" \
  --arg status "PASS_CANONICAL_COMPAT_HANDOFF_OBSERVER_ACTIVE" \
  --arg packageId "WP-G0.2-CURRENT-CYCLE-CANONICAL-COMPAT-DEPENDENCY-REFRESH-AND-AUTOMATIC-HANDOFF" \
  --arg codeEvidencePath "${CODE_SUMMARY}" --arg codeEvidenceSha256 "$(sha_file "${CODE_SUMMARY}")" \
  --arg phaseEvidencePath "${PHASE_IMMEDIATE}" --arg phaseEvidenceSha256 "$(sha_file "${PHASE_IMMEDIATE}")" \
  --arg phaseObserverUnit "${PHASE_OBSERVER_UNIT}.service" \
  --arg phaseStagingDirectory "${PHASE_STAGE}" '
  {schemaVersion:$schemaVersion,status:$status,packageId:$packageId,
   sequence:["canonical_code_presence","canonical_compat_phase"],
   codePresenceStatus:"PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED",
   phaseImmediateStatus:"PASS_IMMEDIATE_CANONICAL_COMPAT_OBSERVATION_ACTIVE",
   observerActive:true,canonicalCompatObservationCompleted:false,
   canonicalCutoverExecuted:false,wpG02Completed:false,g0Completed:false,
   servicesMutated:["web"],databasePhaseTransition:"shadow_verify_to_canonical_compat",
   secretsPrinted:false,
   codePresenceEvidence:{path:$codeEvidencePath,sha256:$codeEvidenceSha256},
   phaseEvidence:{path:$phaseEvidencePath,sha256:$phaseEvidenceSha256},
   phaseObserverUnit:$phaseObserverUnit,phaseStagingDirectory:$phaseStagingDirectory}' > "${FINAL}"
chmod 600 "${FINAL}"
"${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=/evidence,readonly" \
  --entrypoint node "${WEB_IMAGE}" -e '
    import("/orchestrator/scripts/production/candidate-canonical-compat-handoff/runner.mjs")
      .then(async (m) => m.validatePipelineFinal(JSON.parse(await (await import("node:fs/promises")).readFile("/evidence/handoff-final.json", "utf8"))))
      .catch((error) => { console.error(error.message); process.exit(1); });' >/dev/null
COMPLETED=true
printf '%s\n' 'PASS_CANONICAL_COMPAT_HANDOFF_OBSERVER_ACTIVE'
