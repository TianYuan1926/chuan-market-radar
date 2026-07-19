#!/usr/bin/env bash
set -euo pipefail
umask 077

STAGING_DIRECTORY="${1:-}"
OBSERVATION_FINAL="${2:-}"
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
[[ -n "${STAGING_DIRECTORY}" && -n "${OBSERVATION_FINAL}" ]] \
  || fail usage_staging_and_observation_final_required
ACTUAL_STAGING="$(realpath "${STAGING_DIRECTORY}")"
[[ "${ACTUAL_STAGING}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-* \
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

ACTUAL_FINAL="$(realpath "${OBSERVATION_FINAL}")"
OBSERVATION_DIRECTORY="$(dirname "${ACTUAL_FINAL}")"
SAMPLES="${OBSERVATION_DIRECTORY}/cycle-observation-samples.jsonl"
CLOSEOUT="${OBSERVATION_DIRECTORY}/cycle-observation-closeout.json"
[[ "${ACTUAL_FINAL}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-*/observation/cycle-observation-final.json ]] \
  || fail observation_path_invalid
for file in "${ACTUAL_FINAL}" "${SAMPLES}" "${CLOSEOUT}" "${BUILD_RECORD}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "evidence_file_invalid:$(basename "${file}")"
  mode="$(file_mode "${file}")"
  (( (8#${mode} & 8#077) == 0 )) || fail "evidence_file_permissions_too_open:$(basename "${file}")"
done
jq -e '
  .schemaVersion == "candidate-validation-cycle-observation.v2"
  and .status == "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
  and .commit == "47741f3222247562843932b01607a1ec3abb534e"
  and .migrationId == "candidate-episode-v1-cycle-7"
  and .releaseId == "candidate-shadow-cycle-7-47741f3"
  and (.authorityEpoch >= 1 and (.authorityEpoch % 2) == 1)
  and .samples >= 289 and .activationSamples >= 289
  and .elapsedSeconds >= 86400 and .activationCoverageSeconds >= 86400
  and .completedWrites >= 10000 and .completionAdvances >= 2
  and .accumulationReady == true and .freshActivationReady == true
  and .unresolvedOutbox == 0 and .thresholdsChanged == false
  and .productionReconciliationExecuted == false and .shadowVerifyStarted == false
  and .canonicalAuthorityChanged == false and .g0Completed == false' \
  "${ACTUAL_FINAL}" >/dev/null || fail observation_final_not_pass
jq -e '.schemaVersion == "candidate-cycle-observation-closeout.v1"
  and .outcome == "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
  and .secretsPrinted == false' "${CLOSEOUT}" >/dev/null || fail observation_closeout_not_pass

CYCLE_OBSERVER_UNIT="market-radar-cycle-observer-47741f3-1959d0a2.service"
CYCLE_OBSERVER_STATE="$(sudo -n systemctl show "${CYCLE_OBSERVER_UNIT}" \
  --property=ActiveState --value 2>/dev/null || true)"
[[ "${CYCLE_OBSERVER_STATE}" != "active" && "${CYCLE_OBSERVER_STATE}" != "activating"
  && "${CYCLE_OBSERVER_STATE}" != "reloading" ]] || fail current_cycle_observer_still_active
ACTIVE_HANDOFF_UNITS="$(sudo -n systemctl list-units --type=service \
  --state=active,activating,reloading --no-legend --plain \
  'market-radar-current-cycle-readonly-superwindow-*' \
  'market-radar-shadow-verify-handoff-*' \
  'market-radar-shadow-verify-phase-*' \
  'market-radar-shadow-verify-observer-*' 2>/dev/null || true)"
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
[[ "${PRODUCTION_COMMIT}" == "$(jq -r '.commit' "${ACTUAL_FINAL}")" ]] \
  || fail observation_production_commit_mismatch

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WORKER_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]{12,64}$ \
  && "${WORKER_CONTAINER}" =~ ^[0-9a-f]{12,64}$ ]] || fail runtime_container_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
WORKER_IMAGE="$(${DOCKER[@]} inspect "${WORKER_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ \
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
  and .webImageId == $web and .secretsPrinted == false' "${BUILD_RECORD}" >/dev/null \
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

PHASE_ARCHIVE="${ACTUAL_STAGING}/$(jq -r '.children.shadowVerifyPhase.archivePath' "${MANIFEST}")"
PHASE_SHA="$(jq -r '.children.shadowVerifyPhase.sha256' "${MANIFEST}")"
[[ -f "${PHASE_ARCHIVE}" && ! -L "${PHASE_ARCHIVE}"
  && "$(sha_file "${PHASE_ARCHIVE}")" == "${PHASE_SHA}" ]] || fail phase_archive_invalid
while IFS= read -r entry; do
  [[ -n "${entry}" && "${entry}" != /* && "${entry}" != *".."* && "${entry}" != *\\* ]] \
    || fail phase_archive_path_invalid
done < <(tar -tzf "${PHASE_ARCHIVE}")
mkdir "${WORK}/phase"
tar -xzf "${PHASE_ARCHIVE}" --no-same-owner -C "${WORK}/phase"
printf '{"releaseId":"%s"}\n' "$(jq -r '.releaseId' "${ACTUAL_FINAL}")" \
  > "${WORK}/render-request.json"
chmod 600 "${WORK}/render-request.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${WORK},dst=/work" \
  --mount "type=bind,src=${PRODUCTION_ROOT}/.env.production,dst=/runtime/env.production,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /work/phase/scripts/production/candidate-shadow-verify-phase/runner.mjs render-env \
    --request /work/render-request.json --source /runtime/env.production \
    --output /work/target.env.production
TARGET_ENV_SHA="$(sha_file "${WORK}/target.env.production")"

jq -n \
  --argjson currentCycleFinal "$(cat "${ACTUAL_FINAL}")" \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg productionTree "${PRODUCTION_TREE}" \
  --arg currentWebContainerId "${WEB_CONTAINER}" --arg currentWebImageId "${WEB_IMAGE}" \
  --arg buildRecordPath "${BUILD_RECORD}" --arg buildRecordSha256 "$(sha_file "${BUILD_RECORD}")" \
  --arg composeSha256 "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" \
  --arg productionEnvSha256 "$(sha_file "${PRODUCTION_ROOT}/.env.production")" \
  --arg postgresAdminEnvPath "${POSTGRES_ADMIN_ENV}" \
  --arg finalPath "${ACTUAL_FINAL}" --arg finalSha256 "$(sha_file "${ACTUAL_FINAL}")" \
  --arg samplesPath "${SAMPLES}" --arg samplesSha256 "$(sha_file "${SAMPLES}")" \
  --arg closeoutPath "${CLOSEOUT}" --arg closeoutSha256 "$(sha_file "${CLOSEOUT}")" \
  --arg candidateWorkerContainerId "${WORKER_CONTAINER}" \
  --arg candidateWorkerImageId "${WORKER_IMAGE}" \
  --arg baseEnvPath "${PRODUCTION_ROOT}/.env" \
  --arg baseEnvSha256 "$(sha_file "${PRODUCTION_ROOT}/.env")" \
  --arg productionEnvPath "${PRODUCTION_ROOT}/.env.production" \
  --arg targetProductionEnvSha256 "${TARGET_ENV_SHA}" \
  --arg identityWrapperPath "${IDENTITY_WRAPPER}" \
  --arg identityWrapperSha256 "$(sha_file "${IDENTITY_WRAPPER}")" \
  --arg identityOverridePath "${IDENTITY_OVERRIDE}" \
  --arg identityOverrideSha256 "$(sha_file "${IDENTITY_OVERRIDE}")" '
  {currentCycleFinal:$currentCycleFinal,productionCommit:$productionCommit,productionTree:$productionTree,
   currentWebContainerId:$currentWebContainerId,currentWebImageId:$currentWebImageId,
   buildRecordPath:$buildRecordPath,buildRecordSha256:$buildRecordSha256,
   buildRecordWebImageId:$currentWebImageId,composeSha256:$composeSha256,
   productionEnvSha256:$productionEnvSha256,postgresAdminEnvPath:$postgresAdminEnvPath,
   healthLevel:"ready",scanFreshness:"fresh",
   captureSpecification:{schemaVersion:"candidate-lineage-capture-specification.v3",
    packageId:"WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
    productionMutationAllowed:false,outputSchemaVersion:"candidate-multi-cycle-lineage-evidence.v3",
    unified:{authorityEpoch:$currentCycleFinal.authorityEpoch,closeoutPath:$closeoutPath,
     closeoutSha256:$closeoutSha256,commit:$currentCycleFinal.commit,finalPath:$finalPath,
     finalSha256:$finalSha256,migrationId:$currentCycleFinal.migrationId,releaseId:$currentCycleFinal.releaseId,
     samplesPath:$samplesPath,samplesSha256:$samplesSha256}},
   phase:{candidateWorkerContainerId:$candidateWorkerContainerId,
    candidateWorkerImageId:$candidateWorkerImageId,baseEnvPath:$baseEnvPath,
    baseEnvSha256:$baseEnvSha256,productionEnvPath:$productionEnvPath,
    targetProductionEnvSha256:$targetProductionEnvSha256,
    identityWrapperPath:$identityWrapperPath,identityWrapperSha256:$identityWrapperSha256,
    identityOverridePath:$identityOverridePath,identityOverrideSha256:$identityOverrideSha256}}' \
  > "${WORK}/runtime.json"
chmod 600 "${WORK}/runtime.json"

${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_STAGING},dst=/packet,readonly" \
  --mount "type=bind,src=${WORK},dst=/request" \
  --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
  --mount "type=bind,src=$(dirname "${BUILD_RECORD}"),dst=$(dirname "${BUILD_RECORD}"),readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-shadow-verify-handoff/bundle.mjs request \
    --root /packet --manifest /packet/transport-manifest.json \
    --runtime /request/runtime.json --bundle "${BUNDLE_SHA256}" \
    --staging "${ACTUAL_STAGING}" --output /request/approval-request.json >/dev/null
install -m 0600 "${WORK}/approval-request.json" "${REQUEST}"
trap - EXIT
rm -rf -- "${WORK}"
bash "${ACTUAL_STAGING}/scripts/production/candidate-shadow-verify-handoff/production-entrypoint.sh"
