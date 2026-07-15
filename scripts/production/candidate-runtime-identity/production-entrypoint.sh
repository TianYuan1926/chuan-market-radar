#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_RUNTIME_IDENTITY_ENTRYPOINT_MODE:-launcher}"
STAGING_BASENAME_PREFIX="wp-g0-2-runtime-identity-"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
PACKET_VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/bundle.mjs"
RELEASE_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/production-runner.sh"
RUNTIME_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runner.mjs"
AUTONOMY_TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
OPS_PARENT="/home/ubuntu/.cache/market-radar-ops/runtime-identity-ops"
WEB_CONTAINER=""
WEB_IMAGE=""
POSTGRES_CONTAINER=""

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

for command_name in id jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "entrypoint_command_missing:${command_name}"
done
sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
WEB_CONTAINER="$(${DOCKER[@]} ps \
  --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=web' --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]+$ ]] || fail current_web_container_identity_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail current_web_image_identity_invalid
POSTGRES_CONTAINER="$(${DOCKER[@]} ps \
  --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}')"
[[ "${POSTGRES_CONTAINER}" =~ ^[0-9a-f]+$ ]] || fail current_postgres_container_identity_invalid

for file in "${REQUEST_FILE}" "${BUNDLE_MARKER}" "${TRANSPORT_MANIFEST}" "${PACKET_VALIDATOR}" \
  "${RELEASE_RUNNER}" "${RUNTIME_RUNNER}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "staged_regular_file_missing:$(basename "${file}")"
done

ACTUAL_SOURCE_ROOT="$(realpath "${SOURCE_ROOT}")"
ACTUAL_REQUEST_FILE="$(realpath "${REQUEST_FILE}")"
APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory // empty' "${REQUEST_FILE}")"
APPROVED_BUNDLE_SHA256="$(jq -r '.transportBundleSha256 // empty' "${REQUEST_FILE}")"
APPROVED_RUNNER_UNIT_NAME="$(jq -r '.runnerUnitName // empty' "${REQUEST_FILE}")"
APPROVED_SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
APPROVED_OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
APPROVED_EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")"
APPROVED_DORMANT_EVIDENCE="$(jq -r '.dormantEvidencePath // empty' "${REQUEST_FILE}")"
APPROVED_POSTGRES_ADMIN_ENV="$(jq -r '.runtimeIdentityApproval.postgresAdminEnvPath // empty' "${REQUEST_FILE}")"

[[ "${APPROVED_STAGING_DIRECTORY}" == "${ACTUAL_SOURCE_ROOT}" \
  && "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
  && "${ACTUAL_SOURCE_ROOT}" != "${PRODUCTION_ROOT}" \
  && "${ACTUAL_REQUEST_FILE}" == "${ACTUAL_SOURCE_ROOT}/approval-request.json" ]] \
  || fail staging_boundary_invalid
[[ "$(file_mode "${ACTUAL_SOURCE_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST_FILE}")" == "600" ]] || fail staging_permissions_invalid
[[ "${APPROVED_BUNDLE_SHA256}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE_SHA256}" ]] \
  || fail bundle_marker_mismatch

privileged_file_mode() {
  sudo -n stat -c '%a' "$1" 2>/dev/null || sudo -n stat -f '%Lp' "$1"
}

privileged_file_uid() {
  sudo -n stat -c '%u' "$1" 2>/dev/null || sudo -n stat -f '%u' "$1"
}

privileged_file_gid() {
  sudo -n stat -c '%g' "$1" 2>/dev/null || sudo -n stat -f '%g' "$1"
}

privileged_file_size() {
  sudo -n stat -c '%s' "$1" 2>/dev/null || sudo -n stat -f '%z' "$1"
}

[[ "${APPROVED_POSTGRES_ADMIN_ENV}" \
  == "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env" ]] \
  || fail postgres_admin_env_path_invalid
if ! sudo -n test -f "${APPROVED_POSTGRES_ADMIN_ENV}" \
  || sudo -n test -L "${APPROVED_POSTGRES_ADMIN_ENV}"; then
  fail postgres_admin_env_not_regular
fi
[[ "$(privileged_file_mode "${APPROVED_POSTGRES_ADMIN_ENV}")" == "600" \
  && "$(privileged_file_uid "${APPROVED_POSTGRES_ADMIN_ENV}")" == "0" \
  && "$(privileged_file_gid "${APPROVED_POSTGRES_ADMIN_ENV}")" == "0" ]] \
  || fail postgres_admin_env_permissions_invalid
POSTGRES_ADMIN_ENV_SIZE="$(privileged_file_size "${APPROVED_POSTGRES_ADMIN_ENV}")"
[[ "${POSTGRES_ADMIN_ENV_SIZE}" =~ ^[1-9][0-9]*$ && "${POSTGRES_ADMIN_ENV_SIZE}" -le 4096 ]] \
  || fail postgres_admin_env_size_invalid

${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=${ACTUAL_SOURCE_ROOT},dst=/packet,readonly" \
  --entrypoint node "${WEB_IMAGE}" \
  /packet/scripts/production/candidate-runtime-identity/bundle.mjs validate-request \
    --root /packet \
    --request /packet/approval-request.json \
    --manifest /packet/transport-manifest.json \
    --bundle-sha256 "${APPROVED_BUNDLE_SHA256}" \
    --runner /packet/scripts/production/candidate-runtime-identity/runner.mjs >/dev/null

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  for command_name in id jq realpath sudo systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 || fail "launcher_command_missing:${command_name}"
  done
  UNIT_NAME="${APPROVED_RUNNER_UNIT_NAME}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
    || fail transient_unit_already_exists
  sudo -n systemd-run \
    --unit="${APPROVED_RUNNER_UNIT_NAME}" \
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
    --setenv=CANDIDATE_RUNTIME_IDENTITY_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST_FILE}" \
    --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/production-entrypoint.sh"
  ACTIVE_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)"
  MAIN_PID="$(sudo -n systemctl show "${UNIT_NAME}" --property=ExecMainPID --value 2>/dev/null || true)"
  [[ "${ACTIVE_STATE}" == "active" && "${MAIN_PID}" =~ ^[1-9][0-9]*$ ]] \
    || fail transient_unit_not_active
  echo "runner_unit=${UNIT_NAME}"
  echo "runner_pid=${MAIN_PID}"
  echo "DETACHED_RUNTIME_IDENTITY_STARTED"
  exit 0
fi

[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid

RUNNER_PID=""
cleanup_runtime_identity_packet() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  [[ "${APPROVED_SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-runtime-identity/* \
    && "${APPROVED_SECURE_ROOT}" != "/home/ubuntu/.local/state/market-radar-runtime-identity" ]] \
    || exit 97
  [[ "${APPROVED_OPS_ROOT}" == "${OPS_PARENT}"/wp-g0-2-runtime-identity-* \
    && "${APPROVED_OPS_ROOT}" != "${OPS_PARENT}" ]] || exit 96
  [[ "$(basename "${ACTUAL_SOURCE_ROOT}")" == "${STAGING_BASENAME_PREFIX}"* \
    && "${ACTUAL_SOURCE_ROOT}" != "/" && "${ACTUAL_SOURCE_ROOT}" != "/home/ubuntu" ]] \
    || exit 98
  rm -rf -- "${APPROVED_SECURE_ROOT}"
  rm -rf -- "${APPROVED_OPS_ROOT}"
  rm -rf -- "${ACTUAL_SOURCE_ROOT}"
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

trap cleanup_runtime_identity_packet EXIT
trap 'forward_signal INT 130' INT
trap 'forward_signal TERM 143' TERM
trap 'forward_signal HUP 129' HUP

for command_name in jq openssl realpath sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "worker_command_missing:${command_name}"
done
[[ ! -e "${APPROVED_SECURE_ROOT}" && ! -L "${APPROVED_SECURE_ROOT}" ]] || fail secure_root_already_exists
mkdir -p "$(dirname "${APPROVED_SECURE_ROOT}")"
mkdir "${APPROVED_SECURE_ROOT}"
chmod 700 "${APPROVED_SECURE_ROOT}"
jq -cS '.runtimeIdentityApproval' "${ACTUAL_REQUEST_FILE}" > "${APPROVED_SECURE_ROOT}/request.json"
chmod 600 "${APPROVED_SECURE_ROOT}/request.json"
APPROVED_RUNTIME_REQUEST_SHA256="$(jq -r '.runtimeIdentityApprovalSha256' "${ACTUAL_REQUEST_FILE}")"
[[ "$(sha256sum "${APPROVED_SECURE_ROOT}/request.json" | awk '{print $1}')" \
  == "${APPROVED_RUNTIME_REQUEST_SHA256}" ]] || fail runtime_identity_request_checksum_mismatch
[[ -f "${APPROVED_DORMANT_EVIDENCE}" && ! -L "${APPROVED_DORMANT_EVIDENCE}" ]] \
  || fail dormant_evidence_missing
cp "${APPROVED_DORMANT_EVIDENCE}" "${APPROVED_SECURE_ROOT}/dormant-deploy-result.json"
chmod 600 "${APPROVED_SECURE_ROOT}/dormant-deploy-result.json"

{
  sudo -n cat -- "${APPROVED_POSTGRES_ADMIN_ENV}"
  printf '\000'
  ${DOCKER[@]} exec "${POSTGRES_CONTAINER}" sh -c \
    'printf "%s\000%s" "$POSTGRES_USER" "$POSTGRES_DB"'
} | ${DOCKER[@]} run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${APPROVED_SECURE_ROOT},dst=/secure" \
    --mount "type=bind,src=${ACTUAL_SOURCE_ROOT},dst=/packet,readonly" \
    --entrypoint node "${WEB_IMAGE}" \
    /packet/scripts/production/candidate-runtime-identity/runner.mjs prepare-secure-inputs \
      --secure-root /secure >/dev/null
chmod 600 "${APPROVED_SECURE_ROOT}/credentials.json" "${APPROVED_SECURE_ROOT}/role-admin.url"

install -d -m 0700 "${OPS_PARENT}" "${APPROVED_OPS_ROOT}" \
  "${APPROVED_OPS_ROOT}/backups" "${APPROVED_OPS_ROOT}/evidence"

REQUEST_FILE_OVERRIDE="${APPROVED_SECURE_ROOT}/request.json" \
APPROVED_RUNTIME_REQUEST_SHA256="${APPROVED_RUNTIME_REQUEST_SHA256}" \
AUTONOMY_REQUEST_FILE="${ACTUAL_REQUEST_FILE}" \
MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
OPS_ROOT="${APPROVED_OPS_ROOT}" \
EVIDENCE_DIRECTORY="${APPROVED_EVIDENCE_DIRECTORY}" \
ROOT_DIR_OVERRIDE="${PRODUCTION_ROOT}" \
RUNTIME_IDENTITY_TRANSPORT_MODE=staged_bundle \
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST}" \
RUNTIME_IDENTITY_MODE=production_identity \
CONFIRM_RUNTIME_IDENTITY=true \
SECURE_ROOT="${APPROVED_SECURE_ROOT}" \
bash "${RELEASE_RUNNER}" &
RUNNER_PID=$!
set +e
wait "${RUNNER_PID}"
RUNNER_EXIT_CODE=$?
set -e
RUNNER_PID=""
exit "${RUNNER_EXIT_CODE}"
