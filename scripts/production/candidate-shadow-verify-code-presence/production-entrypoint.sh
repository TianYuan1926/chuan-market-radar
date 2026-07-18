#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ $# -eq 1 ]] || { echo 'usage: production-entrypoint.sh STAGING_DIRECTORY' >&2; exit 2; }
STAGING_DIRECTORY="$1"
[[ "${STAGING_DIRECTORY}" =~ ^/home/ubuntu/\.cache/market-radar-ops/wp-g0-2-shadow-verify-code-presence-[a-z0-9][a-z0-9-]{15,48}$ \
  && -d "${STAGING_DIRECTORY}" && ! -L "${STAGING_DIRECTORY}" \
  && "$(stat -c '%a' "${STAGING_DIRECTORY}")" == "700" ]] \
  || { echo 'staging_boundary_invalid' >&2; exit 1; }

REQUEST_FILE="${STAGING_DIRECTORY}/approval-request.json"
MANIFEST_FILE="${STAGING_DIRECTORY}/transport-manifest.json"
RUNNER="${STAGING_DIRECTORY}/scripts/production/candidate-shadow-verify-code-presence/production-runner.sh"
for file in "${REQUEST_FILE}" "${MANIFEST_FILE}" "${RUNNER}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || { echo 'staged_file_invalid' >&2; exit 1; }
done
[[ "$(stat -c '%a' "${REQUEST_FILE}")" == "600" \
  && "$(stat -c '%a' "${MANIFEST_FILE}")" == "600" ]] \
  || { echo 'staged_permissions_invalid' >&2; exit 1; }

UNIT="$(jq -r '.runnerUnitName' "${REQUEST_FILE}")"
[[ "${UNIT}" =~ ^market-radar-shadow-verify-code-presence-[a-z0-9][a-z0-9-]{15,48}$ ]] \
  || { echo 'unit_identity_invalid' >&2; exit 1; }

sudo -n systemd-run --unit "${UNIT}" --collect --property=Restart=no \
  --property=RuntimeMaxSec=900 \
  --setenv="REQUEST_FILE=${REQUEST_FILE}" \
  --setenv="TRANSPORT_MANIFEST_OVERRIDE=${MANIFEST_FILE}" \
  /bin/bash "${RUNNER}"
printf 'STARTED_READ_ONLY_CODE_PRESENCE_UNIT=%s\n' "${UNIT}"
