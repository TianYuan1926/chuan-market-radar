#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
STAGING_BASENAME_PREFIX="wp-g0-2-web-identity-recovery-"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
RECOVERY_RUNNER="${SOURCE_ROOT}/scripts/production/web-identity-recovery.sh"

if [[ ! -f "${REQUEST_FILE}" || -L "${REQUEST_FILE}" ]]; then
  echo "ERROR: staged approval request is unavailable." >&2
  exit 1
fi

APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE_SHA256="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
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
  echo "ERROR: temporary recovery staging boundary does not match approval." >&2
  exit 1
fi

cleanup_staging() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
    && "${ACTUAL_SOURCE_ROOT}" != "/" \
    && "${ACTUAL_SOURCE_ROOT}" != "/home/ubuntu" ]]; then
    if ! rm -rf -- "${ACTUAL_SOURCE_ROOT}"; then
      echo "ERROR: staging cleanup failed." >&2
      exit 1
    fi
  else
    echo "ERROR: staging cleanup boundary rejected." >&2
    exit 1
  fi
  exit "${exit_code}"
}
trap cleanup_staging EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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

unset ROOT_DIR_OVERRIDE BASE_ENV_FILE ENV_FILE IDENTITY_WRAPPER IDENTITY_OVERRIDE_FILE BASE_URL
unset WEB_READY_TIMEOUT_SECONDS WEB_READY_POLL_SECONDS WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR

REQUEST_FILE="${ACTUAL_REQUEST_FILE}" \
WEB_IDENTITY_RECOVERY_MODE=production_recovery \
CONFIRM_WEB_IDENTITY_RECOVERY=true \
WEB_READY_TIMEOUT_SECONDS=180 \
WEB_READY_POLL_SECONDS=3 \
WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR=false \
bash "${RECOVERY_RUNNER}"
