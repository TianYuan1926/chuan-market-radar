#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_RECONCILIATION_ENTRYPOINT_MODE:-launcher}"
STAGING_BASENAME_PREFIX="wp-g0-2-current-cycle-reconciliation-"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
PACKET_VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-reconciliation/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-reconciliation/production-runner.sh"
AUTONOMY_TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
POSTGRES_ADMIN_ENV="/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }

for command_name in docker jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
done
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" ]] || fail approval_request_unavailable
APPROVED_STAGING="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE_SHA256="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
APPROVED_UNIT="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
APPROVED_TRUST_ROOT="$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ROOT="$(jq -r '.productionRoot // empty' "${REQUEST_FILE}")"
APPROVED_SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
APPROVED_OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
APPROVED_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")"
APPROVED_POSTGRES_ADMIN_ENV="$(jq -r '.postgresAdminEnvPath // empty' "${REQUEST_FILE}")"
LINEAGE_FINAL="$(jq -r '.lineageEvidencePath // empty' "${REQUEST_FILE}")"
ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST="$(realpath "${REQUEST_FILE}")"

[[ "${APPROVED_STAGING}" == "${ACTUAL_SOURCE_ROOT}" \
  && "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
  && "${ACTUAL_SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${ACTUAL_SOURCE_ROOT}" != "/" \
  && "${ACTUAL_SOURCE_ROOT}" != "${PRODUCTION_ROOT}" \
  && "${ACTUAL_REQUEST}" == "${ACTUAL_SOURCE_ROOT}/approval-request.json" ]] \
  || fail staging_boundary_mismatch
[[ -f "${BUNDLE_MARKER}" && ! -L "${BUNDLE_MARKER}" \
  && -f "${TRANSPORT_MANIFEST}" && ! -L "${TRANSPORT_MANIFEST}" \
  && -f "${PACKET_VALIDATOR}" && ! -L "${PACKET_VALIDATOR}" \
  && -f "${RUNNER}" && ! -L "${RUNNER}" ]] || fail staged_packet_incomplete
[[ "$(file_mode "${ACTUAL_SOURCE_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST}")" == "600" \
  && "${APPROVED_BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE_SHA256}" ]] \
  || fail staged_packet_boundary_invalid
[[ "${APPROVED_UNIT}" =~ ^market-radar-current-cycle-reconciliation-[a-z0-9][a-z0-9-]{7,48}$ \
  && "$(jq -r '.sessionIndependentExecutionRequired // false' "${REQUEST_FILE}")" == "true" \
  && "${APPROVED_TRUST_ROOT}" == "${AUTONOMY_TRUST_ROOT}" \
  && "${APPROVED_PRODUCTION_ROOT}" == "${PRODUCTION_ROOT}" \
  && "${APPROVED_POSTGRES_ADMIN_ENV}" == "${POSTGRES_ADMIN_ENV}" \
  && "${APPROVED_SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-reconciliation/* \
  && "${APPROVED_OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/reconciliation-ops/wp-g0-2-current-cycle-reconciliation-* \
  && "${APPROVED_EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-current-cycle-reconciliation-* ]] \
  || fail session_independent_identity_invalid
LINEAGE_DIRECTORY="$(dirname "${LINEAGE_FINAL}")"
[[ "$(realpath "${LINEAGE_DIRECTORY}")" == "${LINEAGE_DIRECTORY}"
  && "${LINEAGE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-* ]] \
  || fail lineage_evidence_directory_invalid
[[ -f "${LINEAGE_FINAL}" && ! -L "${LINEAGE_FINAL}"
  && "$(realpath "${LINEAGE_FINAL}")" == "${LINEAGE_FINAL}" ]] \
  || fail lineage_evidence_missing

sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=web' --format '{{.ID}}')"
POSTGRES_CONTAINER="$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]+$ && "${POSTGRES_CONTAINER}" =~ ^[0-9a-f]+$ ]] \
  || fail production_container_identity_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" == "$(jq -r '.webImageId' "${REQUEST_FILE}")" ]] \
  || fail current_web_image_identity_mismatch
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_SOURCE_ROOT},dst=/packet,readonly" \
  --mount "type=bind,src=${LINEAGE_DIRECTORY},dst=${LINEAGE_DIRECTORY},readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-reconciliation/bundle.mjs validate-request \
    --root /packet --request /packet/approval-request.json \
    --manifest /packet/transport-manifest.json \
    --bundle-sha256 "${APPROVED_BUNDLE_SHA256}" >/dev/null

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
  done
  UNIT_NAME="${APPROVED_UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
    || fail transient_unit_already_exists
  sudo -n systemd-run \
    --unit="${APPROVED_UNIT}" --collect --quiet --uid="$(id -u)" --gid="$(id -g)" \
    --property=Type=exec --property=Restart=no --property=KillMode=mixed \
    --property=TimeoutStopSec=120 --property=RuntimeMaxSec=3600 --property=UMask=0077 \
    --property=StandardOutput=journal --property=StandardError=journal \
    --setenv=CANDIDATE_RECONCILIATION_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-reconciliation/production-entrypoint.sh"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)" == "active" ]] \
    || fail transient_unit_not_active
  printf 'runner_unit=%s\nDETACHED_RECONCILIATION_STARTED\n' "${UNIT_NAME}"
  exit 0
fi
[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  [[ "${ACTUAL_SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-reconciliation-* \
    && "${APPROVED_SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-reconciliation/* \
    && "${APPROVED_OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/reconciliation-ops/wp-g0-2-current-cycle-reconciliation-* \
    && "${APPROVED_EVIDENCE_DIRECTORY}" != "${ACTUAL_SOURCE_ROOT}" \
    && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_SECURE_ROOT}" \
    && "${APPROVED_EVIDENCE_DIRECTORY}" != "${APPROVED_OPS_ROOT}" ]] || exit 98
  rm -rf -- "${APPROVED_OPS_ROOT}" "${APPROVED_SECURE_ROOT}" "${ACTUAL_SOURCE_ROOT}"
  exit "${exit_code}"
}
trap cleanup EXIT
[[ ! -e "${APPROVED_SECURE_ROOT}" && ! -L "${APPROVED_SECURE_ROOT}" ]] \
  || fail secure_root_already_exists
for parent in \
  "$(dirname "${APPROVED_SECURE_ROOT}")" \
  "$(dirname "${APPROVED_OPS_ROOT}")" \
  "$(dirname "${APPROVED_EVIDENCE_DIRECTORY}")"; do
  mkdir -p "${parent}"
  [[ -d "${parent}" && ! -L "${parent}" && "$(realpath "${parent}")" == "${parent}" ]] \
    || fail runtime_parent_directory_invalid
done
mkdir "${APPROVED_SECURE_ROOT}"
chmod 700 "${APPROVED_SECURE_ROOT}"
install -m 0600 "${LINEAGE_FINAL}" "${APPROVED_SECURE_ROOT}/lineage-final.json"
jq '.reconciliationApproval' "${ACTUAL_REQUEST}" > "${APPROVED_SECURE_ROOT}/reconciliation-request.json"
chmod 600 "${APPROVED_SECURE_ROOT}/reconciliation-request.json"
[[ "$(sudo -n stat -c '%a' "${POSTGRES_ADMIN_ENV}")" == "600" \
  && "$(sudo -n stat -c '%u:%g' "${POSTGRES_ADMIN_ENV}")" == "0:0" \
  && ! -L "${POSTGRES_ADMIN_ENV}" ]] || fail postgres_admin_env_boundary_invalid
{
  sudo -n cat -- "${POSTGRES_ADMIN_ENV}"
  printf '\000'
  ${DOCKER[@]} exec "${POSTGRES_CONTAINER}" sh -c 'printf "%s\000%s" "$POSTGRES_USER" "$POSTGRES_DB"'
} | ${DOCKER[@]} run --rm -i --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${APPROVED_SECURE_ROOT},dst=/secure" \
  --mount "type=bind,src=${ACTUAL_SOURCE_ROOT},dst=/packet,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-reconciliation/bundle.mjs prepare-admin-url \
    --output /secure/migration-admin.url >/dev/null
chmod 600 "${APPROVED_SECURE_ROOT}/migration-admin.url"

REQUEST_FILE="${ACTUAL_REQUEST}" \
CANDIDATE_RECONCILIATION_MODE=production_collect \
CONFIRM_CANDIDATE_RECONCILIATION=true \
MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
bash "${RUNNER}"
