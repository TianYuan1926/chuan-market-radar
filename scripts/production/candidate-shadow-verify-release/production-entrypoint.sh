#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${SHADOW_VERIFY_RELEASE_ENTRYPOINT_MODE:-launcher}"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-release/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-release/production-runner.sh"
TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
STAGING_PREFIX="wp-g0-2-shadow-verify-release-"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" \
  && -f "${TRANSPORT_MANIFEST}" && ! -L "${TRANSPORT_MANIFEST}" \
  && -f "${BUNDLE_MARKER}" && ! -L "${BUNDLE_MARKER}" ]] \
  || fail staged_transport_files_missing

ACTUAL_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST="$(realpath "${REQUEST_FILE}")"
APPROVED_ROOT="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
APPROVED_UNIT="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
APPROVED_TRUST_ROOT="$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")"
CURRENT_WEB_IMAGE="$(jq -r '.currentWebImageId // empty' "${REQUEST_FILE}")"
LINEAGE_EVIDENCE="$(jq -r '.lineageEvidencePath // empty' "${REQUEST_FILE}")"
RECONCILIATION_EVIDENCE="$(jq -r '.reconciliationEvidencePath // empty' "${REQUEST_FILE}")"

[[ "${ACTUAL_ROOT}" == "${APPROVED_ROOT}" \
  && "$(basename "${ACTUAL_ROOT}")" == "${STAGING_PREFIX}"* \
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${ACTUAL_REQUEST}" == "${ACTUAL_ROOT}/approval-request.json" \
  && "${ACTUAL_ROOT}" != "/" && "${ACTUAL_ROOT}" != "/home/ubuntu" \
  && "${ACTUAL_ROOT}" != "/home/ubuntu/apps/chuan-market-radar" ]] \
  || fail staging_boundary_invalid
[[ "$(file_mode "${ACTUAL_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST}")" == "600" \
  && "$(file_mode "${TRANSPORT_MANIFEST}")" == "600" \
  && "$(file_mode "${BUNDLE_MARKER}")" == "600" ]] \
  || fail staging_permissions_invalid
[[ "${APPROVED_BUNDLE}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE}" \
  && "${APPROVED_UNIT}" =~ ^market-radar-shadow-verify-release-[a-z0-9][a-z0-9-]{7,48}$ \
  && "${APPROVED_TRUST_ROOT}" == "${TRUST_ROOT}" \
  && "${CURRENT_WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail staged_transport_binding_invalid
for evidence in "${LINEAGE_EVIDENCE}" "${RECONCILIATION_EVIDENCE}"; do
  [[ "${evidence}" == /home/ubuntu/.cache/market-radar-ops/evidence/* \
    && -f "${evidence}" && ! -L "${evidence}" && "$(file_mode "${evidence}")" == "600" ]] \
    || fail prerequisite_evidence_boundary_invalid
done

validate_request() {
  sudo -n docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${LINEAGE_EVIDENCE},dst=${LINEAGE_EVIDENCE},readonly" \
    --mount "type=bind,src=${RECONCILIATION_EVIDENCE},dst=${RECONCILIATION_EVIDENCE},readonly" \
    --entrypoint node "${CURRENT_WEB_IMAGE}" \
    /packet/scripts/production/candidate-shadow-verify-release/bundle.mjs validate-request \
    --manifest /packet/transport-manifest.json \
    --request /packet/approval-request.json >/dev/null
}

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id jq realpath sudo systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 \
      || fail "launcher_command_missing:${command_name}"
  done
  validate_request
  UNIT_NAME="${APPROVED_UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" \
    == "not-found" ]] || fail runner_unit_already_exists
  sudo -n systemd-run \
    --unit="${APPROVED_UNIT}" --collect --quiet \
    --uid="$(id -u)" --gid="$(id -g)" \
    --property=Type=exec --property=Restart=no --property=KillMode=mixed \
    --property=TimeoutStopSec=600 --property=RuntimeMaxSec=5400 \
    --property=UMask=0077 --property=StandardOutput=journal \
    --property=StandardError=journal \
    --setenv=SHADOW_VERIFY_RELEASE_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-release/production-entrypoint.sh"
  ACTIVE_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)"
  MAIN_PID="$(sudo -n systemctl show "${UNIT_NAME}" --property=ExecMainPID --value 2>/dev/null || true)"
  [[ "${ACTIVE_STATE}" == "active" && "${MAIN_PID}" =~ ^[1-9][0-9]*$ ]] \
    || fail runner_unit_not_active
  printf 'runner_unit=%s\nrunner_pid=%s\nDETACHED_SHADOW_VERIFY_CODE_RELEASE_STARTED\n' \
    "${UNIT_NAME}" "${MAIN_PID}"
  exit 0
fi

[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid

RUNNER_PID=""
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "$(basename "${ACTUAL_ROOT}")" == "${STAGING_PREFIX}"* \
    && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
    && "${ACTUAL_ROOT}" != "/" ]]; then
    rm -rf -- "${ACTUAL_ROOT}"
  else
    printf 'ERROR: staging_cleanup_boundary_invalid\n' >&2
    exit 1
  fi
  exit "${exit_code}"
}
forward_signal() {
  local signal_name="$1" exit_code="$2"
  if [[ -n "${RUNNER_PID}" ]] && kill -0 "${RUNNER_PID}" 2>/dev/null; then
    kill -s "${signal_name}" "${RUNNER_PID}" 2>/dev/null || true
    wait "${RUNNER_PID}" || true
  fi
  exit "${exit_code}"
}
trap cleanup EXIT
trap 'forward_signal INT 130' INT
trap 'forward_signal TERM 143' TERM
trap 'forward_signal HUP 129' HUP

unset ROOT_DIR_OVERRIDE SHADOW_VERIFY_RELEASE_REHEARSAL
unset TRUST_ROOT_OVERRIDE TRANSPORT_MANIFEST_OVERRIDE
unset OBSERVATION_DURATION_SECONDS OBSERVATION_POLL_SECONDS WEB_READY_TIMEOUT_SECONDS
REQUEST_FILE="${ACTUAL_REQUEST}" \
  bash "${RUNNER}" &
RUNNER_PID=$!
set +e
wait "${RUNNER_PID}"
RUNNER_EXIT=$?
set -e
RUNNER_PID=""
exit "${RUNNER_EXIT}"
