#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_DORMANT_ENTRYPOINT_MODE:-launcher}"
STAGING_BASENAME_PREFIX="wp-g0-2-dormant-runtime-deploy-"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
RELEASE_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.sh"
ENTRYPOINT_READY_MARKER="${SOURCE_ROOT}/.entrypoint-ready"
AUTONOMY_TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"

if [[ ! -f "${REQUEST_FILE}" || -L "${REQUEST_FILE}" ]]; then
  echo "ERROR: staged approval request is unavailable." >&2
  exit 1
fi

APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE_SHA256="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
APPROVED_RUNNER_UNIT_NAME="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
APPROVED_SESSION_INDEPENDENT="$(jq -r '.sessionIndependentExecutionRequired // false' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_TRUST_ROOT="$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")"
ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST_FILE="$(realpath "${REQUEST_FILE}")"

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

if [[ "${APPROVED_STAGING_DIRECTORY}" != "${ACTUAL_SOURCE_ROOT}" \
  || "$(basename "${ACTUAL_SOURCE_ROOT}")" != "${STAGING_BASENAME_PREFIX}"* \
  || "${ACTUAL_SOURCE_ROOT}" == *".."* \
  || "${ACTUAL_SOURCE_ROOT}" == "/" \
  || "${ACTUAL_SOURCE_ROOT}" == "/home" \
  || "${ACTUAL_SOURCE_ROOT}" == "/home/ubuntu" \
  || "${ACTUAL_SOURCE_ROOT}" == "/home/ubuntu/apps/chuan-market-radar" \
  || "${ACTUAL_REQUEST_FILE}" != "${ACTUAL_SOURCE_ROOT}/approval-request.json" ]]; then
  echo "ERROR: temporary dormant deploy staging boundary does not match approval." >&2
  exit 1
fi

if [[ ! -f "${BUNDLE_MARKER}" || -L "${BUNDLE_MARKER}" ]]; then
  echo "ERROR: staged bundle marker is unavailable." >&2
  exit 1
fi
if [[ "$(file_mode "${ACTUAL_SOURCE_ROOT}")" != "700" \
  || "$(file_mode "${ACTUAL_REQUEST_FILE}")" != "600" ]]; then
  echo "ERROR: staging directory or approval request permissions are unsafe." >&2
  exit 1
fi
if [[ ! "${APPROVED_BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ \
  || "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" != "${APPROVED_BUNDLE_SHA256}" ]]; then
  echo "ERROR: staged bundle marker does not match approval." >&2
  exit 1
fi
if [[ ! "${APPROVED_RUNNER_UNIT_NAME}" =~ ^market-radar-dormant-[a-z0-9][a-z0-9-]{7,56}$ \
  || "${APPROVED_SESSION_INDEPENDENT}" != "true" \
  || "${APPROVED_AUTONOMY_TRUST_ROOT}" != "${AUTONOMY_TRUST_ROOT}" ]]; then
  echo "ERROR: approved session-independent runner identity is invalid." >&2
  exit 1
fi

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id sudo systemctl systemd-run; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      echo "ERROR: session-independent launcher command is unavailable: ${command_name}" >&2
      exit 1
    fi
  done
  UNIT_NAME="${APPROVED_RUNNER_UNIT_NAME}.service"
  LOAD_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)"
  if [[ "${LOAD_STATE}" != "not-found" ]]; then
    echo "ERROR: approved transient runner unit already exists or cannot be proven absent." >&2
    exit 1
  fi
  RUNNER_UID="$(id -u)"
  RUNNER_GID="$(id -g)"
  sudo -n systemd-run \
    --unit="${APPROVED_RUNNER_UNIT_NAME}" \
    --collect \
    --quiet \
    --uid="${RUNNER_UID}" \
    --gid="${RUNNER_GID}" \
    --property=Type=exec \
    --property=Restart=no \
    --property=KillMode=mixed \
    --property=TimeoutStopSec=600 \
    --property=RuntimeMaxSec=5400 \
    --property=UMask=0077 \
    --property=StandardOutput=journal \
    --property=StandardError=journal \
    --setenv=CANDIDATE_DORMANT_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST_FILE}" \
    --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy-entrypoint.sh"

  ACTIVE_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)"
  MAIN_PID="$(sudo -n systemctl show "${UNIT_NAME}" --property=ExecMainPID --value 2>/dev/null || true)"
  if [[ "${ACTIVE_STATE}" != "active" || ! "${MAIN_PID}" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: transient dormant deploy unit did not enter an active process state." >&2
    exit 1
  fi
  echo "runner_unit=${UNIT_NAME}"
  echo "runner_pid=${MAIN_PID}"
  echo "monitor_command=sudo systemctl status ${UNIT_NAME}"
  echo "journal_command=sudo journalctl -u ${UNIT_NAME}"
  echo "DETACHED_CANDIDATE_DORMANT_DEPLOY_STARTED"
  exit 0
fi

if [[ "${ENTRYPOINT_MODE}" != "detached_worker" ]]; then
  echo "ERROR: unsupported dormant deploy entrypoint mode." >&2
  exit 1
fi

RUNNER_PID=""
cleanup_staging() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
    && "${ACTUAL_SOURCE_ROOT}" != "/" \
    && "${ACTUAL_SOURCE_ROOT}" != "/home/ubuntu" ]]; then
    rm -rf -- "${ACTUAL_SOURCE_ROOT}"
  else
    echo "ERROR: staging cleanup boundary rejected." >&2
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

trap cleanup_staging EXIT
trap 'forward_signal INT 130' INT
trap 'forward_signal TERM 143' TERM
trap 'forward_signal HUP 129' HUP

unset ROOT_DIR_OVERRIDE BASE_ENV_FILE ENV_FILE COMPOSE_IDENTITY_OVERRIDE_FILE BASE_URL
unset WEB_READY_TIMEOUT_SECONDS WEB_READY_POLL_SECONDS OBSERVATION_POLL_SECONDS
unset AUTONOMY_LEASE_CLI_RUNTIME
printf 'ready\n' > "${ENTRYPOINT_READY_MARKER}"

REQUEST_FILE="${ACTUAL_REQUEST_FILE}" \
DORMANT_DEPLOY_MODE=production_deploy \
CONFIRM_DORMANT_DEPLOY=true \
WEB_READY_TIMEOUT_SECONDS=240 \
WEB_READY_POLL_SECONDS=3 \
OBSERVATION_POLL_SECONDS=30 \
MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
bash "${RELEASE_RUNNER}" &
RUNNER_PID=$!
set +e
wait "${RUNNER_PID}"
RUNNER_EXIT_CODE=$?
set -e
RUNNER_PID=""
exit "${RUNNER_EXIT_CODE}"
