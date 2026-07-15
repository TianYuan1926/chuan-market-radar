#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_ACTIVATION_ENTRYPOINT_MODE:-launcher}"
STAGING_BASENAME_PREFIX="wp-g0-2-candidate-activation-"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-activation/production-runner.sh"
OBSERVER_STARTED_MARKER="${SOURCE_ROOT}/.observer-started"
AUTONOMY_TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

for command_name in jq realpath; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
done
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" ]] || fail approval_request_unavailable
APPROVED_STAGING="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE_SHA256="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
APPROVED_UNIT="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
APPROVED_SESSION_INDEPENDENT="$(jq -r '.sessionIndependentExecutionRequired // false' "${REQUEST_FILE}")"
APPROVED_TRUST_ROOT="$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ROOT="$(jq -r '.productionRoot // empty' "${REQUEST_FILE}")"
APPROVED_SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
APPROVED_OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
APPROVED_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")"
ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST="$(realpath "${REQUEST_FILE}")"

[[ "${APPROVED_STAGING}" == "${ACTUAL_SOURCE_ROOT}" \
  && "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
  && "${ACTUAL_SOURCE_ROOT}" != "/" \
  && "${ACTUAL_SOURCE_ROOT}" != "/home/ubuntu" \
  && "${ACTUAL_SOURCE_ROOT}" != "/home/ubuntu/apps/chuan-market-radar" \
  && "${ACTUAL_REQUEST}" == "${ACTUAL_SOURCE_ROOT}/approval-request.json" ]] \
  || fail staging_boundary_mismatch
[[ -f "${BUNDLE_MARKER}" && ! -L "${BUNDLE_MARKER}" ]] || fail bundle_marker_unavailable
[[ "$(file_mode "${ACTUAL_SOURCE_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST}")" == "600" ]] || fail staging_permissions_unsafe
[[ "${APPROVED_BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE_SHA256}" ]] \
  || fail bundle_marker_mismatch
[[ "${APPROVED_UNIT}" =~ ^market-radar-candidate-activation-[a-z0-9][a-z0-9-]{7,48}$ \
  && "${APPROVED_SESSION_INDEPENDENT}" == "true" \
  && "${APPROVED_TRUST_ROOT}" == "${AUTONOMY_TRUST_ROOT}" \
  && "${APPROVED_PRODUCTION_ROOT}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${APPROVED_SECURE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${APPROVED_OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${APPROVED_EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/* \
  && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_SECURE_ROOT}" \
  && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_OPS_ROOT}" ]] \
  || fail session_independent_identity_invalid

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id sudo systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
  done
  UNIT_NAME="${APPROVED_UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
    || fail transient_unit_already_exists
  sudo -n systemd-run \
    --unit="${APPROVED_UNIT}" \
    --collect \
    --quiet \
    --uid="$(id -u)" \
    --gid="$(id -g)" \
    --property=Type=exec \
    --property=Restart=no \
    --property=KillMode=mixed \
    --property=TimeoutStopSec=600 \
    --property=RuntimeMaxSec=5400 \
    --property=UMask=0077 \
    --property=StandardOutput=journal \
    --property=StandardError=journal \
    --setenv=CANDIDATE_ACTIVATION_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-activation/production-entrypoint.sh"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)" == "active" ]] \
    || fail transient_unit_not_active
  printf 'runner_unit=%s\nDETACHED_CANDIDATE_ACTIVATION_STARTED\n' "${UNIT_NAME}"
  exit 0
fi

[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid

cleanup_staging() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ ! -f "${OBSERVER_STARTED_MARKER}" ]]; then
    [[ "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
      && "${ACTUAL_SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
      && "${APPROVED_SECURE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
      && "${APPROVED_OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
      && "${APPROVED_EVIDENCE_DIRECTORY}" != "${ACTUAL_SOURCE_ROOT}" \
      && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_SECURE_ROOT}" \
      && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_OPS_ROOT}" ]] || exit 98
    rm -rf -- "${APPROVED_OPS_ROOT}" "${APPROVED_SECURE_ROOT}" "${ACTUAL_SOURCE_ROOT}"
  fi
  exit "${exit_code}"
}
trap cleanup_staging EXIT
RUNNER_PID=""
forward_signal() {
  local signal="$1" exit_code="$2"
  [[ -z "${RUNNER_PID}" ]] || kill -s "${signal}" "${RUNNER_PID}" 2>/dev/null || true
  exit "${exit_code}"
}
trap 'forward_signal INT 130' INT
trap 'forward_signal TERM 143' TERM
trap 'forward_signal HUP 129' HUP

REQUEST_FILE="${ACTUAL_REQUEST}" \
CANDIDATE_ACTIVATION_MODE=production_activate \
CONFIRM_CANDIDATE_ACTIVATION=true \
MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
bash "${RUNNER}" &
RUNNER_PID=$!
set +e
wait "${RUNNER_PID}"
RUNNER_EXIT_CODE=$?
set -e
RUNNER_PID=""
exit "${RUNNER_EXIT_CODE}"
