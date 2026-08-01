#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-plan}"
PRODUCTION_WORKTREE="${P0R_PRODUCTION_WORKTREE:-/home/ubuntu/apps/chuan-market-radar}"
PRODUCTION_ENV_FILE="${P0R_PRODUCTION_ENV_FILE:-${PRODUCTION_WORKTREE}/.env.production}"
SECRET_INGRESS_WINDOW_SECONDS=1200
WAIT_FOR_AGE_SECONDS=1200

fail() {
  local caller_line="${BASH_LINENO[0]:-0}"
  [[ "${caller_line}" =~ ^[1-9][0-9]{0,4}$ ]] || caller_line=0
  printf '{"reasonCode":"p0r_session_line_%s","status":"BLOCKED"}\n' \
    "${caller_line}" >&2
  exit 1
}

if [[ "${MODE}" == "plan" ]]; then
  cat <<'JSON'
{"schemaVersion":"v2-m1-production-storage-p0r-session.v5","rawStsResponsePersisted":false,"terminalEchoDisabledDuringSecretInput":true,"readyMarkerAfterEchoDisabled":true,"boundedSecretInput":true,"inputCompletion":"NEWLINE_THEN_EOT_FROM_PREARMED_LOCAL_TTY_BRIDGE","localTtyBridgeRequired":true,"browserStateReadAfterResponseAllowed":false,"credentialCompileImmediate":true,"callerClockOverrideAllowed":false,"credentialOutputExclusive":true,"ageIdentityOutputExclusive":true,"credentialAndIdentityOnlyInDevShm":true,"credentialAndIdentityOwnerUid":0,"containerSelection":"EXACT_COMPOSE_PROJECT_AND_SERVICE_LABELS","composeInterpolationRequired":false,"runtimeCapsuleChecksumBound":true,"productionNodeModulesRequired":false,"sessionPidStartTokenAndSourceBound":true,"bothSshSessionsPrearmedBeforeIssuance":true,"postIssuanceNetworkReconnectRequired":false,"secretIngressWindowSeconds":1200,"runnerStartsAutomaticallyAfterBothSecrets":true,"sanitizedFailureSiteOnly":true,"abandonedSessionCleansSecrets":true,"secondaryFailureCleansAllSessionSecrets":true,"cancelledReadyAbortsPrimaryWait":true,"successRequiresVerifiedSecretCleanup":true,"productionDatabaseMutation":false,"productionServiceMutation":false,"productionRepositoryMutation":false}
JSON
  exit 0
fi

[[ "${MODE}" == "receive-credentials-and-run" || "${MODE}" == "receive-age-identity" ]] \
  || fail "mode must be plan, receive-credentials-and-run or receive-age-identity"

for command in awk bash chmod dirname docker id jq kill readlink rm seq sha256sum sleep stat stty sudo timeout; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command missing: ${command}"
done
sudo -n true >/dev/null 2>&1 || fail "passwordless sudo is unavailable"
sudo -n docker version >/dev/null 2>&1 || fail "Docker is unavailable"
[[ -t 0 ]] || fail "secret input must come from an interactive terminal"

SOURCE_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BINDINGS_FILE="${SOURCE_DIRECTORY}/p0r-bindings.env"
PLAN_FILE="${SOURCE_DIRECTORY}/cos-provisioning-plan.json"
PROVISIONING_TOOL="${SOURCE_DIRECTORY}/m1-production-storage-p0r-cos-provisioning.mjs"
RUNTIME_CAPSULE_TOOL="${SOURCE_DIRECTORY}/m1-production-storage-p0r-runtime-capsule.mjs"
NODE_RUNTIME_CAPSULE="${SOURCE_DIRECTORY}/p0r-node-runtime.tar"
RUNNER="${SOURCE_DIRECTORY}/m1-production-storage-p0r-runner.sh"
SESSION_SCRIPT="${SOURCE_DIRECTORY}/m1-production-storage-p0r-session.sh"

[[ -f "${BINDINGS_FILE}" && ! -L "${BINDINGS_FILE}" ]] \
  || fail "P0R binding file is invalid"
declare -A BINDINGS
while IFS='=' read -r key value; do
  [[ -n "${key}" ]] || continue
  [[ "${key}" =~ ^P0R_[A-Z0-9_]+$ ]] || fail "P0R binding name is invalid"
  [[ -z "${BINDINGS[${key}]+x}" ]] || fail "P0R binding is duplicated"
  BINDINGS["${key}"]="${value}"
done < "${BINDINGS_FILE}"
EXPECTED_BINDING_KEYS=(
  P0R_SOURCE_COMMIT
  P0R_AGE_SHA256
  P0R_AGE_RECIPIENT_SHA256
  P0R_COS_ARCHIVE_SHA256
  P0R_COS_PROVISIONING_PLAN_SHA256
  P0R_COS_PROVISIONING_TOOL_SHA256
  P0R_BACKUP_CAPTURE_SHA256
  P0R_FINGERPRINT_SHA256
  P0R_PREFLIGHT_LIBRARY_SHA256
  P0R_RECOVERY_EVIDENCE_SHA256
  P0R_NODE_RUNTIME_SHA256
  P0R_RUNTIME_CAPSULE_TOOL_SHA256
  P0R_RUNNER_SHA256
  P0R_SESSION_SHA256
)
[[ "${#BINDINGS[@]}" -eq "${#EXPECTED_BINDING_KEYS[@]}" ]] \
  || fail "P0R binding set is not exact"
for key in "${EXPECTED_BINDING_KEYS[@]}"; do
  [[ -n "${BINDINGS[${key}]+x}" ]] || fail "required P0R binding is absent"
  if [[ "${key}" == "P0R_SOURCE_COMMIT" ]]; then
    [[ "${BINDINGS[${key}]}" =~ ^[0-9a-f]{40}$ ]] || fail "source commit binding is invalid"
  else
    [[ "${BINDINGS[${key}]}" =~ ^[0-9a-f]{64}$ ]] || fail "${key} binding is invalid"
  fi
  printf -v "${key}" '%s' "${BINDINGS[${key}]}"
  export "${key}"
done

verify_source() {
  local path="$1" expected="$2" label="$3"
  [[ -f "${path}" && ! -L "${path}" ]] || fail "${label} source is invalid"
  [[ "${expected}" =~ ^[0-9a-f]{64}$ ]] || fail "${label} checksum binding is invalid"
  [[ "$(sha256sum "${path}" | awk '{print $1}')" == "${expected}" ]] \
    || fail "${label} checksum mismatch"
}
verify_source "${PLAN_FILE}" "${P0R_COS_PROVISIONING_PLAN_SHA256:-}" "COS provisioning plan"
verify_source "${PROVISIONING_TOOL}" "${P0R_COS_PROVISIONING_TOOL_SHA256:-}" "COS provisioning tool"
verify_source "${NODE_RUNTIME_CAPSULE}" "${P0R_NODE_RUNTIME_SHA256:-}" "P0R Node runtime capsule"
verify_source \
  "${RUNTIME_CAPSULE_TOOL}" \
  "${P0R_RUNTIME_CAPSULE_TOOL_SHA256:-}" \
  "P0R runtime capsule tool"
verify_source "${RUNNER}" "${P0R_RUNNER_SHA256:-}" "P0R runner"
verify_source "${SESSION_SCRIPT}" "${P0R_SESSION_SHA256:-}" "P0R session"

RUN_ID="$(jq -er '.credentialGrant.runId' "${PLAN_FILE}")"
PLAN_SOURCE_COMMIT="$(jq -er '.sourceCommit' "${PLAN_FILE}")"
[[ "${RUN_ID}" =~ ^p0r-[0-9]{8}t[0-9]{6}z-[0-9a-f]{32}$ ]] || fail "run ID is invalid"
[[ "${PLAN_SOURCE_COMMIT}" == "${P0R_SOURCE_COMMIT}" ]] || fail "plan source commit mismatch"
EXPECTED_SOURCE_DIRECTORY="/home/ubuntu/.cache/market-radar-v2/p0r/staging/${RUN_ID}"
[[ "${SOURCE_DIRECTORY}" == "${EXPECTED_SOURCE_DIRECTORY}" ]] \
  || fail "session is outside the exact P0R staging directory"

mapfile -t WEB_CONTAINERS < <(
  sudo -n docker ps -q --no-trunc \
    --filter "label=com.docker.compose.project=chuan-market-radar" \
    --filter "label=com.docker.compose.service=web"
)
[[ "${#WEB_CONTAINERS[@]}" -eq 1 && "${WEB_CONTAINERS[0]}" =~ ^[0-9a-f]{64}$ ]] \
  || fail "exactly one production Web container is required"
WEB_PID="$(sudo -n docker inspect -f '{{.State.Pid}}' "${WEB_CONTAINERS[0]}")"
[[ "${WEB_PID}" =~ ^[1-9][0-9]*$ ]] || fail "production Web PID is invalid"
HOST_NODE="/proc/${WEB_PID}/root/usr/local/bin/node"
sudo -n test -x "${HOST_NODE}" || fail "production Node runtime is unavailable"

CREDENTIAL_FILE="/dev/shm/market-radar-v2-p0r-${RUN_ID}.cos-credentials.json"
AGE_IDENTITY_FILE="/dev/shm/market-radar-v2-p0r-${RUN_ID}.age-identity.txt"
SESSION_READY_FILE="/dev/shm/market-radar-v2-p0r-${RUN_ID}.session-ready"
OUTPUT_DIRECTORY="/home/ubuntu/.cache/market-radar-v2/p0r/evidence/${RUN_ID}"

require_absent() {
  [[ ! -e "$1" && ! -L "$1" ]] || fail "$2 already exists"
}

require_secure_file() {
  local path="$1" label="$2" maximum_size="$3" expected_owner_uid="$4" mode size
  [[ -f "${path}" && ! -L "${path}" ]] || fail "${label} must be a regular non-symlink file"
  [[ "$(stat -c '%u' "${path}")" == "${expected_owner_uid}" ]] \
    || fail "${label} owner is invalid"
  mode="$(stat -c '%a' "${path}")"
  [[ "$(( 8#${mode} & 8#077 ))" -eq 0 ]] || fail "${label} permissions are too open"
  size="$(stat -c '%s' "${path}")"
  [[ "${size}" -gt 0 && "${size}" -le "${maximum_size}" ]] || fail "${label} size is invalid"
}

TTY_ECHO_DISABLED=false
CLEANUP_SCOPE="none"
restore_tty() {
  if [[ "${TTY_ECHO_DISABLED}" == "true" ]]; then
    stty echo >/dev/null 2>&1 || true
    TTY_ECHO_DISABLED=false
    printf '\n'
  fi
}

cleanup_session_secrets_best_effort() {
  sudo -n rm -f \
    "${CREDENTIAL_FILE}" \
    "${AGE_IDENTITY_FILE}" \
    "${SESSION_READY_FILE}" >/dev/null 2>&1 || true
}

cleanup_session_secrets_verified() {
  sudo -n rm -f \
    "${CREDENTIAL_FILE}" \
    "${AGE_IDENTITY_FILE}" \
    "${SESSION_READY_FILE}" \
    || fail "P0R session secret cleanup failed"
  for path in "${CREDENTIAL_FILE}" "${AGE_IDENTITY_FILE}" "${SESSION_READY_FILE}"; do
    [[ ! -e "${path}" && ! -L "${path}" ]] \
      || fail "P0R session secret cleanup verification failed"
  done
}

cleanup_on_exit() {
  restore_tty
  if [[ "${CLEANUP_SCOPE}" == "all" ]]; then
    cleanup_session_secrets_best_effort
  fi
}
trap cleanup_on_exit EXIT
trap 'exit 130' HUP INT TERM

receive_secret() {
  local action="$1" ready_status="$2"
  stty -echo
  TTY_ECHO_DISABLED=true
  printf '{"status":"%s","runId":"%s","terminalEcho":false,"inputCompletion":"NEWLINE_THEN_EOT_FROM_PREARMED_LOCAL_TTY_BRIDGE"}\n' \
    "${ready_status}" "${RUN_ID}"
  set +e
  sudo -n timeout --foreground "${SECRET_INGRESS_WINDOW_SECONDS}s" \
    "${HOST_NODE}" --preserve-symlinks \
    "${PROVISIONING_TOOL}" "${action}" --plan "${PLAN_FILE}"
  local status=$?
  set -e
  restore_tty
  return "${status}"
}

if [[ "${MODE}" == "receive-age-identity" ]]; then
  CLEANUP_SCOPE="all"
  require_secure_file \
    "${SESSION_READY_FILE}" "P0R session-ready file" 256 "$(id -u)"
  require_absent "${AGE_IDENTITY_FILE}" "age identity file"
  read -r SESSION_PID SESSION_START_TOKEN SESSION_SOURCE_COMMIT SESSION_EXTRA \
    < "${SESSION_READY_FILE}"
  [[ "${SESSION_PID}" =~ ^[1-9][0-9]*$ ]] || fail "P0R session PID is invalid"
  [[ "${SESSION_START_TOKEN}" =~ ^[1-9][0-9]*$ ]] \
    || fail "P0R session start token is invalid"
  [[ "${SESSION_SOURCE_COMMIT}" == "${P0R_SOURCE_COMMIT}" && -z "${SESSION_EXTRA:-}" ]] \
    || fail "P0R session source identity is invalid"
  kill -0 "${SESSION_PID}" >/dev/null 2>&1 || fail "P0R credential session is no longer alive"
  CURRENT_SESSION_START_TOKEN="$(awk '{print $22}' "/proc/${SESSION_PID}/stat" 2>/dev/null)" \
    || fail "P0R credential session process identity is unavailable"
  [[ "${CURRENT_SESSION_START_TOKEN}" == "${SESSION_START_TOKEN}" ]] \
    || fail "P0R credential session start token mismatch"
  if ! receive_secret "receive-age-identity" "READY_P0R_AGE_IDENTITY_INPUT_NO_ECHO"; then
    fail "age identity ingress failed"
  fi
  for _ in $(seq 1 20); do
    [[ ! -e "${SESSION_READY_FILE}" ]] && break
    sleep 0.5
  done
  if [[ -e "${SESSION_READY_FILE}" ]]; then
    fail "credential session did not claim the age identity"
  fi
  CLEANUP_SCOPE="none"
  printf '{"status":"PASS_P0R_AGE_IDENTITY_HANDOFF","containsSecret":false}\n'
  exit 0
fi

require_absent "${CREDENTIAL_FILE}" "COS credential file"
require_absent "${AGE_IDENTITY_FILE}" "age identity file"
require_absent "${SESSION_READY_FILE}" "P0R session-ready file"
require_absent "${OUTPUT_DIRECTORY}" "P0R evidence directory"
CLEANUP_SCOPE="all"

umask 077
set -o noclobber
SESSION_START_TOKEN="$(awk '{print $22}' "/proc/$$/stat")"
[[ "${SESSION_START_TOKEN}" =~ ^[1-9][0-9]*$ ]] \
  || fail "P0R credential session start token is invalid"
printf '%s %s %s\n' "$$" "${SESSION_START_TOKEN}" "${P0R_SOURCE_COMMIT}" \
  > "${SESSION_READY_FILE}"
set +o noclobber
chmod 600 "${SESSION_READY_FILE}"

receive_secret "receive-credentials" "READY_P0R_STS_RESPONSE_INPUT_NO_ECHO" \
  || fail "STS credential ingress or immediate compile failed"
require_secure_file "${CREDENTIAL_FILE}" "COS credential file" 65536 0

printf '{"status":"WAITING_P0R_AGE_IDENTITY","runId":"%s","waitSeconds":%s}\n' \
  "${RUN_ID}" "${WAIT_FOR_AGE_SECONDS}"

for _ in $(seq 1 "${WAIT_FOR_AGE_SECONDS}"); do
  [[ -e "${AGE_IDENTITY_FILE}" ]] && break
  [[ -e "${SESSION_READY_FILE}" ]] \
    || fail "P0R session was cancelled before age identity handoff"
  sleep 1
done
require_secure_file "${AGE_IDENTITY_FILE}" "age identity file" 8192 0
sudo -n rm -f "${SESSION_READY_FILE}"

export P0R_SOURCE_DIRECTORY="${SOURCE_DIRECTORY}"
export P0R_SOURCE_COMMIT
export P0R_PRODUCTION_WORKTREE="${PRODUCTION_WORKTREE}"
export P0R_PRODUCTION_ENV_FILE="${PRODUCTION_ENV_FILE}"
export P0R_OUTPUT_DIRECTORY="${OUTPUT_DIRECTORY}"
export P0R_RUN_ID="${RUN_ID}"
export P0R_COS_CREDENTIAL_FILE="${CREDENTIAL_FILE}"
export P0R_AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE}"
export CONFIRM_P0R_RECOVERY_DRILL="EXECUTE_V2_M1_P0R_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE"

bash "${RUNNER}" execute
cleanup_session_secrets_verified
CLEANUP_SCOPE="none"
