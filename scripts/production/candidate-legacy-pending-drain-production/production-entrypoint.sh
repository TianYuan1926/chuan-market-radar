#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ENTRYPOINT_MODE="${CANDIDATE_PENDING_DRAIN_ENTRYPOINT_MODE:-launcher}"
BUNDLE_MARKER="${SOURCE_ROOT}/.transport-bundle.sha256"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-legacy-pending-drain-production/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-legacy-pending-drain-production/production-runner.sh"
TRUST_ROOT="/home/ubuntu/.local/state/market-radar-autonomy"
STAGING_PREFIX="wp-g0-2-pending-drain-"

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
BASELINE_WEB_IMAGE="$(jq -r '.baselineWebImageId // empty' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
POSTGRES_ADMIN_ENV="$(jq -r '.postgresAdminEnvPath // empty' "${REQUEST_FILE}")"

[[ "${ACTUAL_ROOT}" == "${APPROVED_ROOT}" \
  && "$(basename "${ACTUAL_ROOT}")" == "${STAGING_PREFIX}"* \
  && "${ACTUAL_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
  && "${ACTUAL_REQUEST}" == "${ACTUAL_ROOT}/approval-request.json" \
  && "${ACTUAL_ROOT}" != "/" && "${ACTUAL_ROOT}" != "/home/ubuntu" \
  && "${ACTUAL_ROOT}" != "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-pending-drain/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/pending-drain-ops/* ]] \
  || fail staging_boundary_invalid
[[ "$(file_mode "${ACTUAL_ROOT}")" == "700" \
  && "$(file_mode "${ACTUAL_REQUEST}")" == "600" \
  && "$(file_mode "${TRANSPORT_MANIFEST}")" == "600" \
  && "$(file_mode "${BUNDLE_MARKER}")" == "600" ]] \
  || fail staging_permissions_invalid
[[ "${APPROVED_BUNDLE}" =~ ^[0-9a-f]{64}$ \
  && "$(tr -d '\r\n' < "${BUNDLE_MARKER}")" == "${APPROVED_BUNDLE}" \
  && "${APPROVED_UNIT}" =~ ^market-radar-pending-drain-[a-f0-9]{7}-[a-f0-9]{8}$ \
  && "${APPROVED_TRUST_ROOT}" == "${TRUST_ROOT}" \
  && "${BASELINE_WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail staged_transport_binding_invalid
[[ "$(jq -r '.temporaryArtifactCleanupRequired' "${REQUEST_FILE}")" == "true" \
  && "${POSTGRES_ADMIN_ENV}" == /var/lib/market-radar-ops/*/secrets/postgres-admin.env ]] \
  || fail temporary_cleanup_or_admin_path_boundary_invalid

validate_request() {
  sudo -n docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --entrypoint node "${BASELINE_WEB_IMAGE}" \
    /packet/scripts/production/candidate-legacy-pending-drain-production/bundle.mjs validate-request \
      --manifest /packet/transport-manifest.json --request /packet/approval-request.json >/dev/null
}

prepare_admin_url() {
  local postgres_container parent
  [[ ! -e "${SECURE_ROOT}" && ! -L "${SECURE_ROOT}" ]] || fail secure_root_already_exists
  parent="$(dirname "${SECURE_ROOT}")"
  mkdir -p "${parent}"
  [[ -d "${parent}" && ! -L "${parent}" && "$(realpath "${parent}")" == "${parent}" ]] \
    || fail secure_parent_invalid
  mkdir "${SECURE_ROOT}"
  chmod 700 "${SECURE_ROOT}"
  sudo -n test -f "${POSTGRES_ADMIN_ENV}" && ! sudo -n test -L "${POSTGRES_ADMIN_ENV}" \
    || fail postgres_admin_env_boundary_invalid
  [[ "$(sudo -n stat -c '%a:%u:%g' "${POSTGRES_ADMIN_ENV}")" == "600:0:0" \
    && "$(sudo -n sha256sum "${POSTGRES_ADMIN_ENV}" | awk '{print $1}')" \
      == "$(jq -r '.postgresAdminEnvSha256' "${REQUEST_FILE}")" ]] \
    || fail postgres_admin_env_boundary_invalid
  postgres_container="$(sudo -n docker ps \
    --filter 'label=com.docker.compose.project=chuan-market-radar' \
    --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}')"
  [[ "${postgres_container}" =~ ^[0-9a-f]+$ ]] || fail production_postgres_container_invalid
  {
    sudo -n cat -- "${POSTGRES_ADMIN_ENV}"
    printf '\000'
    sudo -n docker exec "${postgres_container}" \
      sh -c 'printf "%s\000%s" "$POSTGRES_USER" "$POSTGRES_DB"'
  } | sudo -n docker run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${ACTUAL_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${SECURE_ROOT},dst=/secure" \
    --entrypoint node "${BASELINE_WEB_IMAGE}" \
    /packet/scripts/production/candidate-legacy-pending-drain-production/bundle.mjs prepare-admin-url \
      --output /secure/migration-admin.url
  chmod 600 "${SECURE_ROOT}/migration-admin.url"
}

LAUNCHER_HANDOFF=false
launcher_cleanup_on_failure() {
  local exit_code=$? active_state="not-found"
  trap - EXIT
  if [[ "${exit_code}" -ne 0 && "${LAUNCHER_HANDOFF}" != "true" ]]; then
    active_state="$(sudo -n systemctl show "${APPROVED_UNIT}.service" \
      --property=ActiveState --value 2>/dev/null || true)"
    if [[ "${active_state}" != "active" && -e "${SECURE_ROOT}" \
      && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-pending-drain/* \
      && "${SECURE_ROOT}" != "/" ]]; then
      rm -rf -- "${SECURE_ROOT}"
    fi
  fi
  exit "${exit_code}"
}

if [[ "${ENTRYPOINT_MODE}" == "launcher" ]]; then
  trap launcher_cleanup_on_failure EXIT
  for command_name in id jq realpath sudo systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 \
      || fail "launcher_command_missing:${command_name}"
  done
  validate_request
  prepare_admin_url
  UNIT_NAME="${APPROVED_UNIT}.service"
  [[ "$(sudo -n systemctl show "${UNIT_NAME}" --property=LoadState --value 2>/dev/null || true)" \
    == "not-found" ]] || fail runner_unit_already_exists
  sudo -n systemd-run --unit="${APPROVED_UNIT}" --collect --quiet \
    --uid="$(id -u)" --gid="$(id -g)" \
    --property=Type=exec --property=Restart=no --property=KillMode=mixed \
    --property=TimeoutStopSec=900 --property=RuntimeMaxSec=5400 \
    --property=UMask=0077 --property=StandardOutput=journal \
    --property=StandardError=journal \
    --setenv=CANDIDATE_PENDING_DRAIN_ENTRYPOINT_MODE=detached_worker \
    --setenv=REQUEST_FILE="${ACTUAL_REQUEST}" \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-legacy-pending-drain-production/production-entrypoint.sh"
  ACTIVE_STATE="$(sudo -n systemctl show "${UNIT_NAME}" --property=ActiveState --value 2>/dev/null || true)"
  MAIN_PID="$(sudo -n systemctl show "${UNIT_NAME}" --property=ExecMainPID --value 2>/dev/null || true)"
  [[ "${ACTIVE_STATE}" == "active" && "${MAIN_PID}" =~ ^[1-9][0-9]*$ ]] \
    || fail runner_unit_not_active
  LAUNCHER_HANDOFF=true
  trap - EXIT
  printf 'runner_unit=%s\nrunner_pid=%s\nDETACHED_PENDING_DRAIN_STARTED\n' \
    "${UNIT_NAME}" "${MAIN_PID}"
  exit 0
fi

[[ "${ENTRYPOINT_MODE}" == "detached_worker" ]] || fail entrypoint_mode_invalid
RUNNER_PID=""
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-pending-drain/* \
    && "${SECURE_ROOT}" != "/" ]]; then
    rm -rf -- "${SECURE_ROOT}"
  else
    printf 'ERROR: secure_cleanup_boundary_invalid\n' >&2
    exit 1
  fi
  if [[ "${exit_code}" -eq 0 && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/pending-drain-ops/* \
    && "${OPS_ROOT}" != "/" ]]; then
    rm -rf -- "${OPS_ROOT}"
  fi
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

unset ROOT_DIR_OVERRIDE TRUST_ROOT_OVERRIDE TRANSPORT_MANIFEST_OVERRIDE
REQUEST_FILE="${ACTUAL_REQUEST}" CANDIDATE_PENDING_DRAIN_MODE=production_drain \
  CONFIRM_CANDIDATE_PENDING_DRAIN=true bash "${RUNNER}" &
RUNNER_PID=$!
set +e
wait "${RUNNER_PID}"
RUNNER_EXIT=$?
set -e
RUNNER_PID=""
exit "${RUNNER_EXIT}"
