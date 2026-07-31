#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
DISPATCH_ENVELOPE="${SOURCE_ROOT}/.dispatch.json"
OUTER_MANIFEST="${SOURCE_ROOT}/p0r-transport-staging-manifest.json"
INNER_BUNDLE="${SOURCE_ROOT}/p0r-transport.tar.gz"
RUNNER="${SOURCE_ROOT}/scripts/v2/production/m1-p0r-transport-staging.mjs"
STAGING_ROOT="/home/ubuntu/.cache/market-radar-v2"
STAGING_PREFIX="m1-p0r-transport-stage-"
ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST_FILE="$(realpath "${REQUEST_FILE}")"

cleanup_dispatch_staging() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "$(dirname "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_ROOT}" \
    && "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_PREFIX}"* \
    && "${ACTUAL_SOURCE_ROOT}" != "${STAGING_ROOT}" ]]; then
    rm -rf -- "${ACTUAL_SOURCE_ROOT}"
  else
    echo "ERROR: P0R transport dispatch staging cleanup rejected." >&2
    exit 1
  fi
  exit "${exit_code}"
}

trap cleanup_dispatch_staging EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [[ "$(dirname "${ACTUAL_SOURCE_ROOT}")" != "${STAGING_ROOT}" \
  || "$(basename "${ACTUAL_SOURCE_ROOT}")" != "${STAGING_PREFIX}"* \
  || "${ACTUAL_REQUEST_FILE}" != "${ACTUAL_SOURCE_ROOT}/approval-request.json" \
  || ! -f "${BUNDLE_MARKER}" \
  || -L "${BUNDLE_MARKER}" \
  || ! -f "${DISPATCH_ENVELOPE}" \
  || -L "${DISPATCH_ENVELOPE}" \
  || ! -f "${OUTER_MANIFEST}" \
  || -L "${OUTER_MANIFEST}" \
  || ! -f "${INNER_BUNDLE}" \
  || -L "${INNER_BUNDLE}" \
  || ! -f "${RUNNER}" \
  || -L "${RUNNER}" ]]; then
  echo "ERROR: P0R transport dispatch staging boundary is invalid." >&2
  exit 1
fi

node "${RUNNER}" stage
echo "PASS_V2_M1_6_P0R_TRANSPORT_STAGED"
