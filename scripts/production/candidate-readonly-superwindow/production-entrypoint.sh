#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_READONLY_SUPERWINDOW_ENTRYPOINT_MODE:-launcher}"
MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-readonly-superwindow/production-runner.sh"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in docker jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "entrypoint_command_missing:${command_name}"
done
ACTUAL_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST="$(realpath "${REQUEST_FILE}")"
[[ "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-* \
  && "${ACTUAL_ROOT}" != "/" && "${ACTUAL_ROOT}" != "${PRODUCTION_ROOT}"
  && "${ACTUAL_REQUEST}" == "${ACTUAL_ROOT}/approval-request.json"
  && "$(file_mode "${ACTUAL_ROOT}")" == "700" ]] || fail staging_boundary_invalid
for file in "${ACTUAL_REQUEST}" "${MANIFEST}" "${MARKER}" "${RUNNER}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "staged_file_invalid:$(basename "${file}")"
done
[[ "$(file_mode "${ACTUAL_REQUEST}")" == "600"
  && "$(file_mode "${MANIFEST}")" == "600"
  && "$(file_mode "${MARKER}")" == "600" ]] || fail staged_permissions_invalid
BUNDLE_SHA256="$(tr -d '\r\n' < "${MARKER}")"
[[ "${BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$
  && "$(jq -r '.transportBundleSha256 // empty' "${ACTUAL_REQUEST}")" == "${BUNDLE_SHA256}"
  && "$(jq -r '.stagingDirectory // empty' "${ACTUAL_REQUEST}")" == "${ACTUAL_ROOT}" ]] \
  || fail request_bundle_or_staging_binding_invalid

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
WEB_CONTAINER="$(sudo -n docker ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
WEB_IMAGE="$(sudo -n docker inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_CONTAINER}" == "$(jq -r '.runtime.currentWebContainerId' "${ACTUAL_REQUEST}")"
  && "${WEB_IMAGE}" == "$(jq -r '.runtime.currentWebImageId' "${ACTUAL_REQUEST}")" ]] \
  || fail current_web_identity_mismatch
OBSERVATION_DIRECTORY="$(dirname "$(jq -r '.runtime.captureSpecification.unified.finalPath' "${ACTUAL_REQUEST}")")"
BUILD_RECORD_DIRECTORY="$(dirname "$(jq -r '.runtime.buildRecordPath' "${ACTUAL_REQUEST}")")"
[[ "${OBSERVATION_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-*/observation
  && "${BUILD_RECORD_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-* ]] \
  || fail evidence_mount_boundary_invalid
sudo -n docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
  --mount "type=bind,src=${OBSERVATION_DIRECTORY},dst=${OBSERVATION_DIRECTORY},readonly" \
  --mount "type=bind,src=${BUILD_RECORD_DIRECTORY},dst=${BUILD_RECORD_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-readonly-superwindow/bundle.mjs validate-request \
    --root /packet --manifest /packet/transport-manifest.json \
    --request /packet/approval-request.json --bundle "${BUNDLE_SHA256}" >/dev/null

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
  done
  UNIT="$(jq -r '.runnerUnitName' "${ACTUAL_REQUEST}")"
  UNIT_NAME="${UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
    || fail transient_unit_already_exists
  sudo -n systemd-run \
    --unit="${UNIT}" --collect --quiet --uid="$(id -u)" --gid="$(id -g)" \
    --property=Type=exec --property=Restart=no --property=KillMode=mixed \
    --property=TimeoutStopSec=120 --property=RuntimeMaxSec=4800 --property=UMask=0077 \
    --property=StandardOutput=journal --property=StandardError=journal \
    --setenv=CANDIDATE_READONLY_SUPERWINDOW_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-readonly-superwindow/production-entrypoint.sh"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)" == "active" ]] \
    || fail transient_unit_not_active
  printf 'runner_unit=%s\nDETACHED_READ_ONLY_SUPERWINDOW_STARTED\n' "${UNIT_NAME}"
  exit 0
fi
[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid
REQUEST_FILE="${ACTUAL_REQUEST}" bash "${RUNNER}"
