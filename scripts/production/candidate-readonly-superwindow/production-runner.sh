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
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-* ]] \
  || fail staging_boundary_invalid
BUNDLE_SHA256="$(tr -d '\r\n' < "${MARKER}")"
[[ "${BUNDLE_SHA256}" == "$(jq -r '.transportBundleSha256' "${REQUEST_FILE}")" ]] \
  || fail bundle_binding_invalid
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
[[ "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-current-cycle-read-only-superwindow-* \
  && "${EVIDENCE_DIRECTORY}" != "${ACTUAL_ROOT}" && ! -e "${EVIDENCE_DIRECTORY}" ]] \
  || fail evidence_directory_invalid

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_CONTAINER}" == "$(jq -r '.runtime.currentWebContainerId' "${REQUEST_FILE}")"
  && "${WEB_IMAGE}" == "$(jq -r '.runtime.currentWebImageId' "${REQUEST_FILE}")" ]] \
  || fail web_identity_drift
OBSERVATION_DIRECTORY="$(dirname "$(jq -r '.runtime.captureSpecification.unified.finalPath' "${REQUEST_FILE}")")"
BUILD_RECORD_DIRECTORY="$(dirname "$(jq -r '.runtime.buildRecordPath' "${REQUEST_FILE}")")"
[[ "${OBSERVATION_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-*/observation
  && "${BUILD_RECORD_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-* ]] \
  || fail source_evidence_boundary_invalid

run_orchestrator_validator() {
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
    --mount "type=bind,src=${BUILD_RECORD_DIRECTORY},dst=${BUILD_RECORD_DIRECTORY},readonly" \
    --entrypoint node "${WEB_IMAGE}" \
    /packet/scripts/production/candidate-readonly-superwindow/bundle.mjs validate-request \
      --root /packet --manifest /packet/transport-manifest.json \
      --request /packet/approval-request.json --bundle "${BUNDLE_SHA256}" >/dev/null
}
run_orchestrator_validator

PRODUCTION_COMMIT="$(jq -r '.runtime.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.runtime.productionTree' "${REQUEST_FILE}")"
[[ -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)"
  && -z "$(git -C "${PRODUCTION_ROOT}" branch --show-current)"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}" ]] \
  || fail production_git_identity_drift
[[ "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" == "$(jq -r '.runtime.composeSha256' "${REQUEST_FILE}")"
  && "$(sha_file "${PRODUCTION_ROOT}/.env.production")" == "$(jq -r '.runtime.productionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail production_stable_input_drift

container_snapshot() {
  ${DOCKER[@]} ps --format '{{.Names}}={{.Image}}={{.ID}}' | LC_ALL=C sort
}
CONTAINERS_BEFORE="$(container_snapshot)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
WORK_ROOT="${ACTUAL_ROOT}/.superwindow-work"
[[ ! -e "${WORK_ROOT}" && ! -L "${WORK_ROOT}" ]] || fail work_root_already_exists
mkdir "${WORK_ROOT}"
chmod 700 "${WORK_ROOT}"

CODE_STAGE=""
LINEAGE_STAGE=""
RECONCILIATION_STAGE=""
safe_remove_stage() {
  local stage="$1"
  [[ -z "${stage}" ]] && return 0
  [[ "${stage}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-code-presence-* \
    || "${stage}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-lineage-capture-* \
    || "${stage}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-reconciliation-* ]] \
    || return 98
  [[ "${stage}" != "/" && "${stage}" != "${PRODUCTION_ROOT}" \
    && "${stage}" != "${EVIDENCE_DIRECTORY}" ]] || return 98
  rm -rf -- "${stage}"
}
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  safe_remove_stage "${CODE_STAGE}" || exit 98
  safe_remove_stage "${LINEAGE_STAGE}" || exit 98
  safe_remove_stage "${RECONCILIATION_STAGE}" || exit 98
  [[ "${WORK_ROOT}" == "${ACTUAL_ROOT}/.superwindow-work"
    && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-* ]] \
    || exit 98
  rm -rf -- "${WORK_ROOT}" "${ACTUAL_ROOT}"
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

stage_child_packet() {
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

snapshot_audit_file() {
  local source="$1"
  local name="$2"
  local target="${EVIDENCE_DIRECTORY}/${name}"
  [[ -f "${source}" && ! -L "${source}" && ! -e "${target}"
    && "${name}" =~ ^[a-z0-9][a-z0-9-]{7,80}\.(json|jsonl)$ ]] \
    || fail "audit_snapshot_boundary_invalid:${name}"
  install -m 0600 "${source}" "${target}"
}

# Step 1: code-presence. Its independent request and evidence remain intact.
CODE_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.codePresence.archivePath' "${REQUEST_FILE}")"
CODE_SHA="$(jq -r '.childPackets.codePresence.sha256' "${REQUEST_FILE}")"
CODE_EXTRACT="${WORK_ROOT}/extract-code-presence"
safe_extract "${CODE_ARCHIVE}" "${CODE_SHA}" "${CODE_EXTRACT}"
jq '.runtime | {
  buildRecordSha256:.buildRecordSha256,buildRecordWebImageId:.buildRecordWebImageId,
  currentWebContainerId:.currentWebContainerId,currentWebImageId:.currentWebImageId,
  healthLevel:.healthLevel,scanFreshness:.scanFreshness}' \
  "${REQUEST_FILE}" > "${WORK_ROOT}/code-runtime.json"
chmod 600 "${WORK_ROOT}/code-runtime.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${CODE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-readonly-superwindow/request-generator.mjs code-presence \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/code-runtime.json --bundle "${CODE_SHA}" \
    --output /work/code-request.json >/dev/null
CODE_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/code-request.json")"
stage_child_packet "${CODE_EXTRACT}" "${WORK_ROOT}/code-request.json" "${CODE_STAGE}" "${CODE_SHA}"
REQUEST_FILE="${CODE_STAGE}/approval-request.json" \
TRANSPORT_MANIFEST_OVERRIDE="${CODE_STAGE}/transport-manifest.json" \
bash "${CODE_STAGE}/scripts/production/candidate-shadow-verify-code-presence/production-runner.sh"
CODE_EVIDENCE="$(jq -r '.evidenceDirectory' "${CODE_STAGE}/approval-request.json")/code-presence-evidence.json"
[[ -f "${CODE_EVIDENCE}" && ! -L "${CODE_EVIDENCE}" ]] || fail code_presence_evidence_missing
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${CODE_STAGE},dst=/packet,readonly" \
  --mount "type=bind,src=$(dirname "${CODE_EVIDENCE}"),dst=/evidence,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-shadow-verify-code-presence/runner.mjs \
    validate /evidence/code-presence-evidence.json >/dev/null
snapshot_audit_file "${CODE_EXTRACT}/transport-manifest.json" \
  code-presence-transport-manifest.json
snapshot_audit_file "${WORK_ROOT}/code-request.json" code-presence-request.json
snapshot_audit_file "${CODE_EVIDENCE}" code-presence-evidence.json
safe_remove_stage "${CODE_STAGE}"
CODE_STAGE=""

# Step 2: Lineage. The child entrypoint owns its private DB credential and lease lifecycle.
LINEAGE_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.lineage.archivePath' "${REQUEST_FILE}")"
LINEAGE_SHA="$(jq -r '.childPackets.lineage.sha256' "${REQUEST_FILE}")"
LINEAGE_EXTRACT="${WORK_ROOT}/extract-lineage"
safe_extract "${LINEAGE_ARCHIVE}" "${LINEAGE_SHA}" "${LINEAGE_EXTRACT}"
jq '.runtime | {
  approvedProductionCommit:.productionCommit,webImageId:.currentWebImageId,
  composeSha256:.composeSha256,productionEnvSha256:.productionEnvSha256,
  postgresAdminEnvPath:.postgresAdminEnvPath,captureSpecification:.captureSpecification}' \
  "${REQUEST_FILE}" > "${WORK_ROOT}/lineage-runtime.json"
chmod 600 "${WORK_ROOT}/lineage-runtime.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${LINEAGE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-readonly-superwindow/request-generator.mjs lineage \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/lineage-runtime.json --bundle "${LINEAGE_SHA}" \
    --output /work/lineage-request.json >/dev/null
LINEAGE_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/lineage-request.json")"
LINEAGE_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/lineage-request.json")"
LINEAGE_EVIDENCE="${LINEAGE_EVIDENCE_DIRECTORY}/lineage-final.json"
stage_child_packet "${LINEAGE_EXTRACT}" "${WORK_ROOT}/lineage-request.json" "${LINEAGE_STAGE}" "${LINEAGE_SHA}"
REQUEST_FILE="${LINEAGE_STAGE}/approval-request.json" \
CANDIDATE_LINEAGE_CAPTURE_ENTRYPOINT_MODE=detached_worker \
bash "${LINEAGE_STAGE}/scripts/production/candidate-lineage/production-entrypoint.sh"
LINEAGE_STAGE=""
[[ -f "${LINEAGE_EVIDENCE}" && ! -L "${LINEAGE_EVIDENCE}"
  && "$(jq -r '.status' "${LINEAGE_EVIDENCE}")" == "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH" ]] \
  || fail lineage_evidence_not_pass
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${LINEAGE_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${LINEAGE_EVIDENCE_DIRECTORY},dst=${LINEAGE_EVIDENCE_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-readonly-superwindow/request-generator.mjs validate-lineage \
    --packet-root /child-packet --evidence "${LINEAGE_EVIDENCE}" >/dev/null
snapshot_audit_file "${LINEAGE_EXTRACT}/transport-manifest.json" lineage-transport-manifest.json
snapshot_audit_file "${WORK_ROOT}/lineage-request.json" lineage-request.json
snapshot_audit_file "${LINEAGE_EVIDENCE}" lineage-evidence.json
snapshot_audit_file "${LINEAGE_EVIDENCE_DIRECTORY}/production-lease-execution.json" \
  lineage-lease-execution.json
snapshot_audit_file "${LINEAGE_EVIDENCE_DIRECTORY}/production-lease-events.jsonl" \
  lineage-lease-events.jsonl

# Step 3: Reconciliation request is generated only from the exact passing Lineage bytes.
RECON_ARCHIVE="${ACTUAL_ROOT}/$(jq -r '.childPackets.reconciliation.archivePath' "${REQUEST_FILE}")"
RECON_SHA="$(jq -r '.childPackets.reconciliation.sha256' "${REQUEST_FILE}")"
RECON_EXTRACT="${WORK_ROOT}/extract-reconciliation"
safe_extract "${RECON_ARCHIVE}" "${RECON_SHA}" "${RECON_EXTRACT}"
jq --arg lineagePath "${LINEAGE_EVIDENCE}" --arg lineageSha256 "$(sha_file "${LINEAGE_EVIDENCE}")" \
  --slurpfile lineage "${LINEAGE_EVIDENCE}" '
  .runtime as $runtime | $lineage[0] as $lineage | {
    approvedProductionCommit:$runtime.productionCommit,
    authorityEpoch:$lineage.currentAuthorityEpoch,
    composeSha256:$runtime.composeSha256,
    lineageEvidencePath:$lineagePath,lineageEvidenceSha256:$lineageSha256,
    postgresAdminEnvPath:$runtime.postgresAdminEnvPath,
    productionEnvSha256:$runtime.productionEnvSha256,
    releaseId:$lineage.currentReleaseId,sourceReleaseWindows:$lineage.sourceReleaseWindows,
    webImageId:$runtime.currentWebImageId}' \
  "${REQUEST_FILE}" > "${WORK_ROOT}/reconciliation-runtime.json"
chmod 600 "${WORK_ROOT}/reconciliation-runtime.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/orchestrator,readonly" \
  --mount "type=bind,src=${RECON_EXTRACT},dst=/child-packet,readonly" \
  --mount "type=bind,src=${WORK_ROOT},dst=/work" \
  --mount "type=bind,src=${LINEAGE_EVIDENCE_DIRECTORY},dst=${LINEAGE_EVIDENCE_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /orchestrator/scripts/production/candidate-readonly-superwindow/request-generator.mjs reconciliation \
    --packet-root /child-packet --manifest /child-packet/transport-manifest.json \
    --runtime /work/reconciliation-runtime.json --bundle "${RECON_SHA}" \
    --output /work/reconciliation-request.json >/dev/null
RECONCILIATION_STAGE="$(jq -r '.stagingDirectory' "${WORK_ROOT}/reconciliation-request.json")"
RECONCILIATION_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${WORK_ROOT}/reconciliation-request.json")"
RECONCILIATION_EVIDENCE="${RECONCILIATION_EVIDENCE_DIRECTORY}/reconciliation-result.json"
stage_child_packet "${RECON_EXTRACT}" "${WORK_ROOT}/reconciliation-request.json" "${RECONCILIATION_STAGE}" "${RECON_SHA}"
REQUEST_FILE="${RECONCILIATION_STAGE}/approval-request.json" \
CANDIDATE_RECONCILIATION_ENTRYPOINT_MODE=detached_worker \
bash "${RECONCILIATION_STAGE}/scripts/production/candidate-reconciliation/production-entrypoint.sh"
RECONCILIATION_STAGE=""
[[ -f "${RECONCILIATION_EVIDENCE}" && ! -L "${RECONCILIATION_EVIDENCE}" ]] \
  || fail reconciliation_evidence_missing
jq -e '
  .schemaVersion == "candidate-multi-cycle-reconciliation-evidence.v3"
  and .status == "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
  and .sourceReleaseCount == 7 and .verificationMigrationId == "candidate-episode-v1-cycle-7"
  and .comparedWrites >= 10000 and .comparisonDifferences == 0
  and .automaticPhaseAdvance == false and .phaseTransitionExecuted == false
  and .shadowVerifyTransitionExecuted == false and .canonicalReadEnabled == false
  and .canonicalWriteEnabled == false and .reviewReadEnabled == false and .g0Completed == false
  and .productionRankingInputsUsed == false and .futureOutcomeInputsUsed == false
  and .databaseIdentity.currentRole == "candidate_audit_role"
  and .databaseIdentity.transactionReadOnly == true
  and .databaseIdentity.transactionIsolation == "repeatable read"' \
  "${RECONCILIATION_EVIDENCE}" >/dev/null || fail reconciliation_evidence_not_pass
snapshot_audit_file "${RECON_EXTRACT}/transport-manifest.json" \
  reconciliation-transport-manifest.json
snapshot_audit_file "${WORK_ROOT}/reconciliation-request.json" reconciliation-request.json
snapshot_audit_file "${RECONCILIATION_EVIDENCE}" reconciliation-evidence.json
snapshot_audit_file "${RECONCILIATION_EVIDENCE_DIRECTORY}/production-lease-execution.json" \
  reconciliation-lease-execution.json
snapshot_audit_file "${RECONCILIATION_EVIDENCE_DIRECTORY}/production-lease-events.jsonl" \
  reconciliation-lease-events.jsonl

[[ "$(container_snapshot)" == "${CONTAINERS_BEFORE}"
  && -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}"
  && "$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}"
  && "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" == "$(jq -r '.runtime.composeSha256' "${REQUEST_FILE}")"
  && "$(sha_file "${PRODUCTION_ROOT}/.env.production")" == "$(jq -r '.runtime.productionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail post_execution_read_only_boundary_drift
HEALTH="$(${DOCKER[@]} exec -i "${WEB_CONTAINER}" node - <<'NODE'
const response = await fetch("http://127.0.0.1:3000/api/health", { headers: { "cache-control": "no-store" } });
const body = await response.json();
process.stdout.write(JSON.stringify({ status: response.status, body }));
NODE
)"
jq -e '.status == 200 and .body.ok == true and .body.health.level == "ready"
  and .body.health.scan.freshness == "fresh"' <<<"${HEALTH}" >/dev/null \
  || fail post_execution_health_not_ready_fresh

SUMMARY="${EVIDENCE_DIRECTORY}/superwindow-final.json"
jq -n \
  --arg schemaVersion "wp-g0.2-current-cycle-read-only-verification-superwindow-evidence.v2" \
  --arg status "PASS_CURRENT_CYCLE_READ_ONLY_VERIFICATION_SUPERWINDOW" \
  --arg packageId "WP-G0.2-CURRENT-CYCLE-READ-ONLY-VERIFICATION-SUPERWINDOW" \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg transportBundleSha256 "${BUNDLE_SHA256}" \
  --arg productionTree "${PRODUCTION_TREE}" --arg productionWebImageId "${WEB_IMAGE}" \
  --arg migrationId "$(jq -r '.runtime.captureSpecification.unified.migrationId' "${REQUEST_FILE}")" \
  --arg releaseId "$(jq -r '.runtime.captureSpecification.unified.releaseId' "${REQUEST_FILE}")" \
  --arg buildRecordSha256 "$(jq -r '.runtime.buildRecordSha256' "${REQUEST_FILE}")" \
  --arg packetCommit "$(jq -r '.approvedPacketCommit' "${REQUEST_FILE}")" \
  --arg packetTree "$(jq -r '.approvedPacketTree' "${REQUEST_FILE}")" \
  --arg startedAt "${STARTED_AT}" --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg codeSourcePath "${CODE_EVIDENCE}" --arg codeBundleSha "${CODE_SHA}" \
  --arg codeManifestSha "$(sha_file "${EVIDENCE_DIRECTORY}/code-presence-transport-manifest.json")" \
  --arg codeRequestSha "$(sha_file "${EVIDENCE_DIRECTORY}/code-presence-request.json")" \
  --arg codeEvidenceSha "$(sha_file "${EVIDENCE_DIRECTORY}/code-presence-evidence.json")" \
  --arg lineageSourcePath "${LINEAGE_EVIDENCE}" --arg lineageBundleSha "${LINEAGE_SHA}" \
  --arg lineageManifestSha "$(sha_file "${EVIDENCE_DIRECTORY}/lineage-transport-manifest.json")" \
  --arg lineageRequestSha "$(sha_file "${EVIDENCE_DIRECTORY}/lineage-request.json")" \
  --arg lineageEvidenceSha "$(sha_file "${EVIDENCE_DIRECTORY}/lineage-evidence.json")" \
  --arg lineageLeaseExecutionSha "$(sha_file "${EVIDENCE_DIRECTORY}/lineage-lease-execution.json")" \
  --arg lineageLeaseEventsSha "$(sha_file "${EVIDENCE_DIRECTORY}/lineage-lease-events.jsonl")" \
  --arg reconciliationSourcePath "${RECONCILIATION_EVIDENCE}" --arg reconciliationBundleSha "${RECON_SHA}" \
  --arg reconciliationManifestSha "$(sha_file "${EVIDENCE_DIRECTORY}/reconciliation-transport-manifest.json")" \
  --arg reconciliationRequestSha "$(sha_file "${EVIDENCE_DIRECTORY}/reconciliation-request.json")" \
  --arg reconciliationEvidenceSha "$(sha_file "${EVIDENCE_DIRECTORY}/reconciliation-evidence.json")" \
  --arg reconciliationLeaseExecutionSha "$(sha_file "${EVIDENCE_DIRECTORY}/reconciliation-lease-execution.json")" \
  --arg reconciliationLeaseEventsSha "$(sha_file "${EVIDENCE_DIRECTORY}/reconciliation-lease-events.jsonl")" \
  --slurpfile codeRequest "${EVIDENCE_DIRECTORY}/code-presence-request.json" \
  --slurpfile lineageRequest "${EVIDENCE_DIRECTORY}/lineage-request.json" \
  --slurpfile reconciliationRequest "${EVIDENCE_DIRECTORY}/reconciliation-request.json" \
  '{schemaVersion:$schemaVersion,status:$status,packageId:$packageId,
    packetCommit:$packetCommit,packetTree:$packetTree,productionCommit:$productionCommit,
    productionTree:$productionTree,productionWebImageId:$productionWebImageId,
    migrationId:$migrationId,releaseId:$releaseId,buildRecordSha256:$buildRecordSha256,
    transportBundleSha256:$transportBundleSha256,
    sequence:["shadow_verify_code_presence","current_cycle_lineage","current_cycle_reconciliation"],
    childEvidence:[
      {step:"shadow_verify_code_presence",status:"PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED",
       packageId:"WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION",
       sourceEvidencePath:$codeSourcePath,transportBundleSha256:$codeBundleSha,
       manifestFile:"code-presence-transport-manifest.json",manifestSha256:$codeManifestSha,
       requestFile:"code-presence-request.json",requestSha256:$codeRequestSha,
       evidenceFile:"code-presence-evidence.json",evidenceSha256:$codeEvidenceSha,
       authorizationMode:$codeRequest[0].authorization.mode,
       authorizationSchemaVersion:$codeRequest[0].authorization.schemaVersion,
       authorizationGrantId:$codeRequest[0].authorization.grantId,
       authorizationApprovalId:$codeRequest[0].authorization.approvalId,
       leaseRequired:false,leaseExecutionFile:null,leaseExecutionSha256:null,
       leaseEventsFile:null,leaseEventsSha256:null,lineageEvidenceSha256:null},
      {step:"current_cycle_lineage",status:"PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH",
       packageId:"WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
       sourceEvidencePath:$lineageSourcePath,transportBundleSha256:$lineageBundleSha,
       manifestFile:"lineage-transport-manifest.json",manifestSha256:$lineageManifestSha,
       requestFile:"lineage-request.json",requestSha256:$lineageRequestSha,
       evidenceFile:"lineage-evidence.json",evidenceSha256:$lineageEvidenceSha,
       authorizationMode:$lineageRequest[0].autonomyAuthorization.mode,
       authorizationSchemaVersion:$lineageRequest[0].autonomyAuthorization.schemaVersion,
       authorizationGrantId:$lineageRequest[0].autonomyAuthorization.grantId,
       authorizationApprovalId:$lineageRequest[0].autonomyAuthorization.approvalId,
       leaseRequired:true,leaseExecutionFile:"lineage-lease-execution.json",
       leaseExecutionSha256:$lineageLeaseExecutionSha,leaseEventsFile:"lineage-lease-events.jsonl",
       leaseEventsSha256:$lineageLeaseEventsSha,lineageEvidenceSha256:null},
      {step:"current_cycle_reconciliation",status:"PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
       packageId:"WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET",
       sourceEvidencePath:$reconciliationSourcePath,transportBundleSha256:$reconciliationBundleSha,
       manifestFile:"reconciliation-transport-manifest.json",manifestSha256:$reconciliationManifestSha,
       requestFile:"reconciliation-request.json",requestSha256:$reconciliationRequestSha,
       evidenceFile:"reconciliation-evidence.json",evidenceSha256:$reconciliationEvidenceSha,
       authorizationMode:$reconciliationRequest[0].autonomyAuthorization.mode,
       authorizationSchemaVersion:$reconciliationRequest[0].autonomyAuthorization.schemaVersion,
       authorizationGrantId:$reconciliationRequest[0].autonomyAuthorization.grantId,
       authorizationApprovalId:$reconciliationRequest[0].autonomyAuthorization.approvalId,
       leaseRequired:true,leaseExecutionFile:"reconciliation-lease-execution.json",
       leaseExecutionSha256:$reconciliationLeaseExecutionSha,
       leaseEventsFile:"reconciliation-lease-events.jsonl",leaseEventsSha256:$reconciliationLeaseEventsSha,
       lineageEvidenceSha256:$lineageEvidenceSha}],
    startedAt:$startedAt,completedAt:$completedAt,productionMutationAllowed:false,
    servicesMutated:[],databaseMutation:false,redisMutation:false,workerMutation:false,
    gitMutation:false,environmentMutation:false,composeMutation:false,phaseTransition:false,
    manifestMutation:false,featureFlagMutation:false,migrationMutation:false,
    canonicalAuthorityChanged:false,g0Completed:false}' > "${SUMMARY}"
chmod 600 "${SUMMARY}"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
  --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=/evidence,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-readonly-superwindow/runner.mjs \
    validate-summary /evidence/superwindow-final.json >/dev/null
printf 'PASS_CURRENT_CYCLE_READ_ONLY_VERIFICATION_SUPERWINDOW\n'
