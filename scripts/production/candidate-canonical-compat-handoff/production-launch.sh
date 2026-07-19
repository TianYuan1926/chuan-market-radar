#!/usr/bin/env bash
set -euo pipefail
umask 077

STAGING_DIRECTORY="${1:-}"
LINEAGE_EVIDENCE="${2:-}"
RECONCILIATION_EVIDENCE="${3:-}"
DUAL_READ_EVIDENCE="${4:-}"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
BUILD_RECORD="/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-47741f322224-1959d0a2/target-images-redacted.json"
POSTGRES_ADMIN_ENV="/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env"
IDENTITY_WRAPPER="/usr/local/sbin/market-radar-compose"
IDENTITY_OVERRIDE="/etc/market-radar/compose-identity.env"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in curl docker git jq realpath sha256sum sudo systemctl tar; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
done
[[ -n "${STAGING_DIRECTORY}" && -n "${LINEAGE_EVIDENCE}"
  && -n "${RECONCILIATION_EVIDENCE}" && -n "${DUAL_READ_EVIDENCE}" ]] \
  || fail usage_staging_lineage_reconciliation_dual_read_required
ACTUAL_STAGING="$(realpath "${STAGING_DIRECTORY}")"
[[ "${ACTUAL_STAGING}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-handoff-* \
  && "${ACTUAL_STAGING}" != "/" && "${ACTUAL_STAGING}" != "${PRODUCTION_ROOT}" \
  && "$(file_mode "${ACTUAL_STAGING}")" == "700" ]] || fail staging_boundary_invalid
MANIFEST="${ACTUAL_STAGING}/transport-manifest.json"
MARKER="${ACTUAL_STAGING}/.transport-bundle.sha256"
REQUEST="${ACTUAL_STAGING}/approval-request.json"
for file in "${MANIFEST}" "${MARKER}"; do
  [[ -f "${file}" && ! -L "${file}" && "$(file_mode "${file}")" == "600" ]] \
    || fail "staged_file_invalid:$(basename "${file}")"
done
[[ ! -e "${REQUEST}" ]] || fail approval_request_already_exists
BUNDLE_SHA256="$(tr -d '\r\n' < "${MARKER}")"
[[ "${BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ ]] || fail bundle_marker_invalid

ACTUAL_LINEAGE="$(realpath "${LINEAGE_EVIDENCE}")"
ACTUAL_RECONCILIATION="$(realpath "${RECONCILIATION_EVIDENCE}")"
ACTUAL_DUAL_READ="$(realpath "${DUAL_READ_EVIDENCE}")"
for file in "${ACTUAL_LINEAGE}" "${ACTUAL_RECONCILIATION}" "${ACTUAL_DUAL_READ}" "${BUILD_RECORD}"; do
  [[ "${file}" == /home/ubuntu/.cache/market-radar-ops/evidence/*
    && -f "${file}" && ! -L "${file}" ]] || fail "evidence_file_invalid:$(basename "${file}")"
  mode="$(file_mode "${file}")"
  (( (8#${mode} & 8#077) == 0 )) || fail "evidence_file_permissions_too_open:$(basename "${file}")"
done
jq -e '.schemaVersion == "candidate-multi-cycle-lineage-evidence.v3"
  and .status == "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH"
  and .currentMigrationId == "candidate-episode-v1-cycle-7"
  and .sourceReleaseCount == 7 and .completedWrites >= 10000 and .unresolvedOutbox == 0' \
  "${ACTUAL_LINEAGE}" >/dev/null || fail lineage_not_pass
jq -e '.schemaVersion == "candidate-multi-cycle-reconciliation-evidence.v3"
  and .status == "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL"
  and .verificationMigrationId == "candidate-episode-v1-cycle-7"
  and .sourceReleaseCount == 7 and .comparedWrites >= 10000
  and .comparisonDifferences == 0 and .duplicateOutboxMappings == 0
  and .duplicateEventMappings == 0 and (.violations | length) == 0' \
  "${ACTUAL_RECONCILIATION}" >/dev/null || fail reconciliation_not_pass
jq -e '.schemaVersion == "candidate-shadow-verify-observation-evidence.v1"
  and .status == "PASS_DUAL_READ_OBSERVATION"
  and .migrationId == "candidate-episode-v1-cycle-7"
  and .sampleCount == 289 and .coverageHours >= 24 and .maximumGapSeconds <= 600
  and .allPagesComparedEverySample == true and .differenceCount == 0
  and .legacyResponseAuthority == true and .canonicalCompatStarted == false
  and .canonicalCutoverExecuted == false and .g0Completed == false
  and (.violations | length) == 0' "${ACTUAL_DUAL_READ}" >/dev/null \
  || fail dual_read_observation_not_pass

SHADOW_OBSERVER_UNITS="$(sudo -n systemctl list-units --type=service \
  --state=active,activating,reloading --no-legend --plain \
  'market-radar-shadow-verify-observer-*' 2>/dev/null || true)"
[[ -z "${SHADOW_OBSERVER_UNITS}" ]] || fail shadow_verify_observer_still_active
ACTIVE_HANDOFF_UNITS="$(sudo -n systemctl list-units --type=service \
  --state=active,activating,reloading --no-legend --plain \
  'market-radar-canonical-compat-code-presence-*' \
  'market-radar-canonical-compat-handoff-*' \
  'market-radar-canonical-compat-phase-*' \
  'market-radar-canonical-compat-observer-*' 2>/dev/null || true)"
[[ -z "${ACTIVE_HANDOFF_UNITS}" ]] || fail production_wip_not_zero_before_handoff

for file in \
  "${PRODUCTION_ROOT}/docker-compose.yml" "${PRODUCTION_ROOT}/.env" \
  "${PRODUCTION_ROOT}/.env.production" "${IDENTITY_WRAPPER}" "${IDENTITY_OVERRIDE}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "production_identity_file_invalid:$(basename "${file}")"
done
[[ -d "${PRODUCTION_ROOT}/.git" && ! -L "${PRODUCTION_ROOT}"
  && -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)"
  && -z "$(git -C "${PRODUCTION_ROOT}" branch --show-current)" ]] \
  || fail production_git_not_clean_detached
PRODUCTION_COMMIT="$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)"
PRODUCTION_TREE="$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})"
[[ "${PRODUCTION_COMMIT}" == "47741f3222247562843932b01607a1ec3abb534e" ]] \
  || fail production_commit_mismatch

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WORKER_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]{12,64}$
  && "${WORKER_CONTAINER}" =~ ^[0-9a-f]{12,64}$ ]] || fail runtime_container_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
WORKER_IMAGE="$(${DOCKER[@]} inspect "${WORKER_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$
  && "${WORKER_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail runtime_image_invalid
HEALTH="$(curl -fsS http://127.0.0.1/api/health)"
jq -e '.ok == true and .health.level == "ready" and .health.scan.freshness == "fresh"
  and .health.persistence.databaseStatus == "ready"
  and ([.health.runtimeProbes.workers[]?
    | select(.name == "candidate-shadow-worker" and .status == "healthy")] | length == 1)
  and ([.health.runtimeProbes.workers[]?
    | select(.name == "scanner-worker" and .status == "healthy")] | length == 1)' \
  <<<"${HEALTH}" >/dev/null || fail production_health_not_ready_fresh
jq -e --arg web "${WEB_IMAGE}" '.schemaVersion == "candidate-cycle-target-images.v1"
  and .webTargetId == $web and .secretsPrinted == false' "${BUILD_RECORD}" >/dev/null \
  || fail build_record_identity_invalid

WORK="${ACTUAL_STAGING}/request-work"
[[ ! -e "${WORK}" && ! -L "${WORK}" ]] || fail request_work_already_exists
mkdir "${WORK}"
chmod 700 "${WORK}"
cleanup_work() {
  local exit_code=$?
  trap - EXIT
  [[ "${WORK}" == "${ACTUAL_STAGING}/request-work" ]] || exit 98
  rm -rf -- "${WORK}"
  exit "${exit_code}"
}
trap cleanup_work EXIT

${DOCKER[@]} exec "${WEB_CONTAINER}" \
  cat /run/market-radar/candidate-read-authority.json > "${WORK}/shadow-manifest.json"
chmod 600 "${WORK}/shadow-manifest.json"
MANIFEST_SHA="$(sha_file "${WORK}/shadow-manifest.json")"
MIGRATION_ID="$(jq -r '.migrationId' "${WORK}/shadow-manifest.json")"
RELEASE_ID="$(jq -r '.releaseId' "${WORK}/shadow-manifest.json")"
AUTHORITY_EPOCH="$(jq -r '.authorityEpoch' "${WORK}/shadow-manifest.json")"
jq -e --arg migration "$(jq -r '.migrationId' "${ACTUAL_DUAL_READ}")" \
  --arg release "$(jq -r '.releaseId' "${ACTUAL_DUAL_READ}")" \
  --argjson epoch "$(jq -r '.authorityEpoch' "${ACTUAL_DUAL_READ}")" \
  '.schemaVersion == "candidate-read-authority-manifest.v1"
    and .phase == "shadow_verify" and .migrationId == $migration and .releaseId == $release
    and .authorityEpoch == $epoch
    and .flags == {dualRead:true,canonicalRead:false,reviewRead:false}' \
  "${WORK}/shadow-manifest.json" >/dev/null || fail shadow_manifest_identity_invalid

PHASE_ARCHIVE="${ACTUAL_STAGING}/$(jq -r '.children.canonicalCompatPhase.archivePath' "${MANIFEST}")"
PHASE_SHA="$(jq -r '.children.canonicalCompatPhase.sha256' "${MANIFEST}")"
[[ -f "${PHASE_ARCHIVE}" && ! -L "${PHASE_ARCHIVE}"
  && "$(sha_file "${PHASE_ARCHIVE}")" == "${PHASE_SHA}" ]] || fail phase_archive_invalid
while IFS= read -r entry; do
  [[ -n "${entry}" && "${entry}" != /* && "${entry}" != *".."* && "${entry}" != *\\* ]] \
    || fail phase_archive_path_invalid
done < <(tar -tzf "${PHASE_ARCHIVE}")
mkdir "${WORK}/phase"
tar -xzf "${PHASE_ARCHIVE}" --no-same-owner -C "${WORK}/phase"
printf '{"releaseId":"%s"}\n' "${RELEASE_ID}" > "${WORK}/render-request.json"
chmod 600 "${WORK}/render-request.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${WORK},dst=/work" \
  --mount "type=bind,src=${PRODUCTION_ROOT}/.env.production,dst=/runtime/env.production,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /work/phase/scripts/production/candidate-canonical-compat-phase/runner.mjs render-env \
    --request /work/render-request.json --source /runtime/env.production \
    --output /work/target.env.production
TARGET_ENV_SHA="$(sha_file "${WORK}/target.env.production")"

jq -n \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg productionTree "${PRODUCTION_TREE}" \
  --arg currentWebContainerId "${WEB_CONTAINER}" --arg currentWebImageId "${WEB_IMAGE}" \
  --arg buildRecordPath "${BUILD_RECORD}" --arg buildRecordSha256 "$(sha_file "${BUILD_RECORD}")" \
  --arg composeSha256 "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" \
  --arg productionEnvSha256 "$(sha_file "${PRODUCTION_ROOT}/.env.production")" \
  --arg postgresAdminEnvPath "${POSTGRES_ADMIN_ENV}" \
  --arg migrationId "${MIGRATION_ID}" --arg releaseId "${RELEASE_ID}" \
  --argjson currentAuthorityEpoch "${AUTHORITY_EPOCH}" \
  --arg currentManifestSha256 "${MANIFEST_SHA}" \
  --arg currentApprovalDigest "sha256:${MANIFEST_SHA}" \
  --arg lineageEvidencePath "${ACTUAL_LINEAGE}" --arg lineageEvidenceSha256 "$(sha_file "${ACTUAL_LINEAGE}")" \
  --arg reconciliationEvidencePath "${ACTUAL_RECONCILIATION}" --arg reconciliationEvidenceSha256 "$(sha_file "${ACTUAL_RECONCILIATION}")" \
  --arg dualReadEvidencePath "${ACTUAL_DUAL_READ}" --arg dualReadEvidenceSha256 "$(sha_file "${ACTUAL_DUAL_READ}")" \
  --arg candidateWorkerContainerId "${WORKER_CONTAINER}" --arg candidateWorkerImageId "${WORKER_IMAGE}" \
  --arg baseEnvPath "${PRODUCTION_ROOT}/.env" --arg baseEnvSha256 "$(sha_file "${PRODUCTION_ROOT}/.env")" \
  --arg productionEnvPath "${PRODUCTION_ROOT}/.env.production" \
  --arg targetProductionEnvSha256 "${TARGET_ENV_SHA}" \
  --arg identityWrapperPath "${IDENTITY_WRAPPER}" --arg identityWrapperSha256 "$(sha_file "${IDENTITY_WRAPPER}")" \
  --arg identityOverridePath "${IDENTITY_OVERRIDE}" --arg identityOverrideSha256 "$(sha_file "${IDENTITY_OVERRIDE}")" '
  {productionCommit:$productionCommit,productionTree:$productionTree,
   currentWebContainerId:$currentWebContainerId,currentWebImageId:$currentWebImageId,
   buildRecordPath:$buildRecordPath,buildRecordSha256:$buildRecordSha256,
   buildRecordWebImageId:$currentWebImageId,composeSha256:$composeSha256,
   productionEnvSha256:$productionEnvSha256,postgresAdminEnvPath:$postgresAdminEnvPath,
   healthLevel:"ready",scanFreshness:"fresh",migrationId:$migrationId,releaseId:$releaseId,
   currentAuthorityEpoch:$currentAuthorityEpoch,currentManifestSha256:$currentManifestSha256,
   currentApprovalDigest:$currentApprovalDigest,
   lineageEvidencePath:$lineageEvidencePath,lineageEvidenceSha256:$lineageEvidenceSha256,
   reconciliationEvidencePath:$reconciliationEvidencePath,reconciliationEvidenceSha256:$reconciliationEvidenceSha256,
   dualReadEvidencePath:$dualReadEvidencePath,dualReadEvidenceSha256:$dualReadEvidenceSha256,
   candidateWorkerContainerId:$candidateWorkerContainerId,candidateWorkerImageId:$candidateWorkerImageId,
   baseEnvPath:$baseEnvPath,baseEnvSha256:$baseEnvSha256,productionEnvPath:$productionEnvPath,
   targetProductionEnvSha256:$targetProductionEnvSha256,
   identityWrapperPath:$identityWrapperPath,identityWrapperSha256:$identityWrapperSha256,
   identityOverridePath:$identityOverridePath,identityOverrideSha256:$identityOverrideSha256}' \
  > "${WORK}/runtime.json"
chmod 600 "${WORK}/runtime.json"

${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_STAGING},dst=/packet,readonly" \
  --mount "type=bind,src=${WORK},dst=/request" \
  --mount "type=bind,src=/home/ubuntu/.cache/market-radar-ops/evidence,dst=/home/ubuntu/.cache/market-radar-ops/evidence,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-canonical-compat-handoff/bundle.mjs request \
    --root /packet --manifest /packet/transport-manifest.json \
    --runtime /request/runtime.json --bundle "${BUNDLE_SHA256}" \
    --staging "${ACTUAL_STAGING}" --output /request/approval-request.json >/dev/null
install -m 0600 "${WORK}/approval-request.json" "${REQUEST}"
trap - EXIT
rm -rf -- "${WORK}"
bash "${ACTUAL_STAGING}/scripts/production/candidate-canonical-compat-handoff/production-entrypoint.sh"
