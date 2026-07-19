#!/usr/bin/env bash
set -euo pipefail
umask 077

STAGING_DIRECTORY="${1:-}"
OBSERVATION_FINAL="${2:-}"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
EXPECTED_PRODUCTION_COMMIT="47741f3222247562843932b01607a1ec3abb534e"
EXPECTED_PRODUCTION_TREE="bff1d1b3f27a0608004c379189bd1adc038477ec"
BUILD_RECORD="/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-47741f322224-1959d0a2/target-images-redacted.json"
POSTGRES_ADMIN_ENV="/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in curl docker git jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
done
[[ -n "${STAGING_DIRECTORY}" && -n "${OBSERVATION_FINAL}" ]] \
  || fail usage_production_launch_staging_and_observation_final_required
ACTUAL_STAGING="$(realpath "${STAGING_DIRECTORY}")"
[[ "${ACTUAL_STAGING}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-* \
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
jq -e '
  .schemaVersion == "candidate-cycle-observation-closeout.v1"
  and .outcome == "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
  and .secretsPrinted == false' "${CLOSEOUT}" >/dev/null || fail observation_closeout_not_pass

[[ -d "${PRODUCTION_ROOT}/.git" && ! -L "${PRODUCTION_ROOT}" \
  && -f "${PRODUCTION_ROOT}/docker-compose.yml" \
  && -f "${PRODUCTION_ROOT}/.env.production" ]] || fail production_runtime_invalid
[[ -z "$(git -C "${PRODUCTION_ROOT}" status --porcelain)" \
  && -z "$(git -C "${PRODUCTION_ROOT}" branch --show-current)" ]] \
  || fail production_git_not_clean_detached
PRODUCTION_COMMIT="$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD)"
PRODUCTION_TREE="$(git -C "${PRODUCTION_ROOT}" rev-parse HEAD^{tree})"
[[ "${PRODUCTION_COMMIT}" == "${EXPECTED_PRODUCTION_COMMIT}"
  && "${PRODUCTION_TREE}" == "${EXPECTED_PRODUCTION_TREE}"
  && "$(jq -r '.commit' "${ACTUAL_FINAL}")" == "${PRODUCTION_COMMIT}" ]] \
  || fail observation_production_commit_mismatch

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
WEB_CONTAINER="$(sudo -n docker ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]{12,64}$ ]] || fail web_container_invalid
WEB_IMAGE="$(sudo -n docker inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail web_image_invalid
HEALTH="$(curl -fsS http://127.0.0.1/api/health)"
jq -e '.ok == true and .health.level == "ready" and .health.scan.freshness == "fresh"
  and .health.persistence.databaseStatus == "ready"
  and ([.health.runtimeProbes.workers[]?
    | select(.name == "candidate-shadow-worker" and .status == "healthy")] | length == 1)' \
  <<<"${HEALTH}" >/dev/null || fail production_health_not_ready_fresh
jq -e --arg web "${WEB_IMAGE}" '
  .schemaVersion == "candidate-cycle-target-images.v1"
  and .webImageId == $web and .secretsPrinted == false' \
  "${BUILD_RECORD}" >/dev/null || fail build_record_identity_invalid

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

jq -n \
  --arg productionCommit "${PRODUCTION_COMMIT}" \
  --arg productionTree "${PRODUCTION_TREE}" \
  --arg currentWebContainerId "${WEB_CONTAINER}" \
  --arg currentWebImageId "${WEB_IMAGE}" \
  --arg buildRecordPath "${BUILD_RECORD}" \
  --arg buildRecordSha256 "$(sha_file "${BUILD_RECORD}")" \
  --arg composeSha256 "$(sha_file "${PRODUCTION_ROOT}/docker-compose.yml")" \
  --arg productionEnvSha256 "$(sha_file "${PRODUCTION_ROOT}/.env.production")" \
  --arg postgresAdminEnvPath "${POSTGRES_ADMIN_ENV}" \
  --arg finalPath "${ACTUAL_FINAL}" --arg finalSha256 "$(sha_file "${ACTUAL_FINAL}")" \
  --arg samplesPath "${SAMPLES}" --arg samplesSha256 "$(sha_file "${SAMPLES}")" \
  --arg closeoutPath "${CLOSEOUT}" --arg closeoutSha256 "$(sha_file "${CLOSEOUT}")" \
  --argjson final "$(cat "${ACTUAL_FINAL}")" \
  '{productionCommit:$productionCommit,productionTree:$productionTree,
    currentWebContainerId:$currentWebContainerId,currentWebImageId:$currentWebImageId,
    buildRecordPath:$buildRecordPath,buildRecordSha256:$buildRecordSha256,
    buildRecordWebImageId:$currentWebImageId,composeSha256:$composeSha256,
    productionEnvSha256:$productionEnvSha256,postgresAdminEnvPath:$postgresAdminEnvPath,
    healthLevel:"ready",scanFreshness:"fresh",
    captureSpecification:{schemaVersion:"candidate-lineage-capture-specification.v3",
      packageId:"WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
      productionMutationAllowed:false,outputSchemaVersion:"candidate-multi-cycle-lineage-evidence.v3",
      unified:{authorityEpoch:$final.authorityEpoch,closeoutPath:$closeoutPath,
        closeoutSha256:$closeoutSha256,commit:$final.commit,finalPath:$finalPath,
        finalSha256:$finalSha256,migrationId:$final.migrationId,releaseId:$final.releaseId,
        samplesPath:$samplesPath,samplesSha256:$samplesSha256}}}' \
  > "${WORK}/runtime.json"
chmod 600 "${WORK}/runtime.json"

sudo -n docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_STAGING},dst=/packet,readonly" \
  --mount "type=bind,src=${WORK},dst=/request" \
  --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
  --mount "type=bind,src=$(dirname "${BUILD_RECORD}"),dst=$(dirname "${BUILD_RECORD}"),readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-readonly-superwindow/bundle.mjs request \
    --root /packet --manifest /packet/transport-manifest.json \
    --runtime /request/runtime.json --bundle "${BUNDLE_SHA256}" \
    --staging "${ACTUAL_STAGING}" --output /request/approval-request.json >/dev/null
install -m 0600 "${WORK}/approval-request.json" "${REQUEST}"
trap - EXIT
rm -rf -- "${WORK}"
bash "${ACTUAL_STAGING}/scripts/production/candidate-readonly-superwindow/production-entrypoint.sh"
