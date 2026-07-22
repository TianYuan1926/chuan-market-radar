#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
RUNNER="${SOURCE_ROOT}/scripts/v2/production/fixed-channel/production-dispatch-acceptance.mjs"
STAGING_ROOT="/home/ubuntu/.cache/market-radar-v2"
STAGING_PREFIX="g0-fixed-dispatch-acceptance-"
ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST_FILE="$(realpath "${REQUEST_FILE}")"

cleanup_staging() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "$(dirname "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_ROOT}" \
    && "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_PREFIX}"* \
    && "${ACTUAL_SOURCE_ROOT}" != "${STAGING_ROOT}" ]]; then
    rm -rf -- "${ACTUAL_SOURCE_ROOT}"
  else
    echo "ERROR: acceptance staging cleanup boundary rejected." >&2
    exit 1
  fi
  exit "${exit_code}"
}

trap cleanup_staging EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [[ "$(dirname "${ACTUAL_SOURCE_ROOT}")" != "${STAGING_ROOT}" \
  || "$(basename "${ACTUAL_SOURCE_ROOT}")" != "${STAGING_PREFIX}"* \
  || "${ACTUAL_REQUEST_FILE}" != "${ACTUAL_SOURCE_ROOT}/approval-request.json" \
  || ! -f "${BUNDLE_MARKER}" \
  || -L "${BUNDLE_MARKER}" \
  || ! -f "${RUNNER}" \
  || -L "${RUNNER}" ]]; then
  echo "ERROR: acceptance staging boundary is invalid." >&2
  exit 1
fi

node "${RUNNER}" run \
  --request "${ACTUAL_REQUEST_FILE}" \
  --bundle-marker "${BUNDLE_MARKER}"
echo "PASS_FIXED_DISPATCH_FIRST_SIGNED_ACCEPTANCE"
