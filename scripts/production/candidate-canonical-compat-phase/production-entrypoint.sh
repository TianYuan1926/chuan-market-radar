#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANONICAL_COMPAT_PHASE_ENTRYPOINT_MODE:-launcher}"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/production-runner.sh"
TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
POSTGRES_ADMIN_ENV="/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env"
STAGING_PREFIX="wp-g0-2-canonical-compat-phase-"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

for command_name in id jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 \
    || fail "entrypoint_command_missing:${command_name}"
done
for path in "${REQUEST_FILE}" "${BUNDLE_MARKER}" "${TRANSPORT_MANIFEST}" \
  "${VALIDATOR}" "${RUNNER}"; do
  [[ -f "${path}" && ! -L "${path}" ]] || fail "staged_file_invalid:$(basename "${path}")"
done

ACTUAL_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST="$(realpath "${REQUEST_FILE}")"
APPROVED_ROOT="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
RUNNER_UNIT="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
OBSERVER_UNIT="$(jq -r '.observerUnitName // empty' "${REQUEST_FILE}")"
CURRENT_WEB_IMAGE="$(jq -r '.currentWebImageId // empty' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")"
LINEAGE_EVIDENCE="$(jq -r '.lineageEvidencePath // empty' "${REQUEST_FILE}")"
RECONCILIATION_EVIDENCE="$(jq -r '.reconciliationEvidencePath // empty' "${REQUEST_FILE}")"
DUAL_READ_EVIDENCE="$(jq -r '.dualReadEvidencePath // empty' "${REQUEST_FILE}")"
CODE_RELEASE_EVIDENCE="$(jq -r '.codeReleaseEvidencePath // empty' "${REQUEST_FILE}")"

[[ "${ACTUAL_ROOT}" == "${APPROVED_ROOT}" \
  && "$(basename "${ACTUAL_ROOT}")" == "${STAGING_PREFIX}"* \
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${ACTUAL_REQUEST}" == "${ACTUAL_ROOT}/approval-request.json" \
  && "${ACTUAL_ROOT}" != "/" && "${ACTUAL_ROOT}" != "/home/ubuntu" \
  && "${ACTUAL_ROOT}" != "${PRODUCTION_ROOT}" ]] || fail staging_boundary_invalid
[[ "$(file_mode "${ACTUAL_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST}")" == "600" \
  && "$(file_mode "${BUNDLE_MARKER}")" == "600" \
  && "$(file_mode "${TRANSPORT_MANIFEST}")" == "600" \
  && "${APPROVED_BUNDLE}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE}" ]] \
  || fail staging_identity_invalid
[[ "${RUNNER_UNIT}" =~ ^market-radar-canonical-compat-phase-[a-z0-9][a-z0-9-]{7,48}$ \
  && "${OBSERVER_UNIT}" =~ ^market-radar-canonical-compat-observer-[a-z0-9][a-z0-9-]{7,48}$ \
  && "$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")" == "${TRUST_ROOT}" \
  && "$(jq -r '.productionRoot' "${REQUEST_FILE}")" == "${PRODUCTION_ROOT}" \
  && "$(jq -r '.postgresAdminEnvPath' "${REQUEST_FILE}")" == "${POSTGRES_ADMIN_ENV}" \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/canonical-compat-phase-ops/* \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-canonical-compat-phase/* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-phase-* ]] \
  || fail runtime_path_identity_invalid

for evidence in "${LINEAGE_EVIDENCE}" "${RECONCILIATION_EVIDENCE}" \
  "${DUAL_READ_EVIDENCE}" "${CODE_RELEASE_EVIDENCE}"; do
  [[ "${evidence}" == /home/ubuntu/.cache/market-radar-ops/evidence/* \
    && -f "${evidence}" && ! -L "${evidence}" \
    && "$(realpath "${evidence}")" == "${evidence}" \
    && "$(file_mode "${evidence}")" == "600" ]] \
    || fail "prerequisite_evidence_invalid:$(basename "${evidence}")"
done

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$("${DOCKER[@]}" ps \
  --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=web' --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]{12,64}$ \
  && "$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')" == "${CURRENT_WEB_IMAGE}" ]] \
  || fail current_web_identity_invalid

validate_request() {
  "${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${LINEAGE_EVIDENCE},dst=${LINEAGE_EVIDENCE},readonly" \
    --mount "type=bind,src=${RECONCILIATION_EVIDENCE},dst=${RECONCILIATION_EVIDENCE},readonly" \
    --mount "type=bind,src=${DUAL_READ_EVIDENCE},dst=${DUAL_READ_EVIDENCE},readonly" \
    --mount "type=bind,src=${CODE_RELEASE_EVIDENCE},dst=${CODE_RELEASE_EVIDENCE},readonly" \
    --entrypoint node "${CURRENT_WEB_IMAGE}" \
    /packet/scripts/production/candidate-canonical-compat-phase/bundle.mjs validate-request \
    --manifest /packet/transport-manifest.json --request /packet/approval-request.json >/dev/null
}
validate_request

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 \
      || fail "launcher_command_missing:${command_name}"
  done
  UNIT_NAME="${RUNNER_UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" \
    == "not-found" ]] || fail runner_unit_already_exists
  sudo -n systemd-run --unit="${RUNNER_UNIT}" --collect --quiet \
    --uid="$(id -u)" --gid="$(id -g)" --property=Type=exec --property=Restart=no \
    --property=KillMode=mixed --property=TimeoutStopSec=900 --property=RuntimeMaxSec=5400 \
    --property=UMask=0077 --property=StandardOutput=journal --property=StandardError=journal \
    --setenv=CANONICAL_COMPAT_PHASE_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-phase/production-entrypoint.sh"
  ACTIVE_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)"
  MAIN_PID="$(sudo -n systemctl show "${UNIT_NAME}" --property=ExecMainPID --value 2>/dev/null || true)"
  [[ "${ACTIVE_STATE}" == "active" && "${MAIN_PID}" =~ ^[1-9][0-9]*$ ]] \
    || fail runner_unit_not_active
  printf 'runner_unit=%s\nrunner_pid=%s\nDETACHED_CANONICAL_COMPAT_PHASE_STARTED\n' \
    "${UNIT_NAME}" "${MAIN_PID}"
  exit 0
fi

[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid
for path in "${OPS_ROOT}" "${SECURE_ROOT}" "${EVIDENCE_DIRECTORY}"; do
  [[ ! -e "${path}" && ! -L "${path}" ]] || fail runtime_directory_already_exists
  parent="$(dirname "${path}")"
  mkdir -p "${parent}"
  [[ -d "${parent}" && ! -L "${parent}" && "$(realpath "${parent}")" == "${parent}" ]] \
    || fail runtime_parent_invalid
done
mkdir "${OPS_ROOT}" "${SECURE_ROOT}" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${SECURE_ROOT}" "${EVIDENCE_DIRECTORY}"

[[ "$(sudo -n stat -c '%a:%u:%g' "${POSTGRES_ADMIN_ENV}")" == "600:0:0" \
  && ! -L "${POSTGRES_ADMIN_ENV}" ]] || fail postgres_admin_env_boundary_invalid
POSTGRES_CONTAINER="$("${DOCKER[@]}" ps \
  --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}')"
[[ "${POSTGRES_CONTAINER}" =~ ^[0-9a-f]{12,64}$ ]] || fail postgres_container_invalid
{
  sudo -n cat -- "${POSTGRES_ADMIN_ENV}"
  printf '\000'
  "${DOCKER[@]}" exec "${POSTGRES_CONTAINER}" sh -c \
    'printf "%s\000%s" "$POSTGRES_USER" "$POSTGRES_DB"'
} | "${DOCKER[@]}" run --rm -i --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${SECURE_ROOT},dst=/secure" \
  --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
  --entrypoint node "${CURRENT_WEB_IMAGE}" \
  /packet/scripts/production/candidate-canonical-compat-phase/bundle.mjs prepare-admin-url \
  --output /secure/migration-admin.url >/dev/null
chmod 600 "${SECURE_ROOT}/migration-admin.url"

set +e
CANONICAL_COMPAT_PHASE_MODE=production_transition CONFIRM_CANONICAL_COMPAT_PHASE=true \
  REQUEST_FILE="${ACTUAL_REQUEST}" bash "${RUNNER}"
RUNNER_EXIT=$?
set -e
if [[ "${RUNNER_EXIT}" -ne 0 ]]; then
  for path in "${OPS_ROOT}" "${SECURE_ROOT}" "${ACTUAL_ROOT}"; do
    [[ ! -e "${path}" ]] || rm -rf -- "${path}"
  done
fi
exit "${RUNNER_EXIT}"
