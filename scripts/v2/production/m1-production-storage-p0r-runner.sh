#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-plan}"
SOURCE_DIRECTORY="${P0R_SOURCE_DIRECTORY:-}"
SOURCE_COMMIT="${P0R_SOURCE_COMMIT:-}"
PRODUCTION_WORKTREE="${P0R_PRODUCTION_WORKTREE:-/home/ubuntu/apps/chuan-market-radar}"
PRODUCTION_ENV_FILE="${P0R_PRODUCTION_ENV_FILE:-${PRODUCTION_WORKTREE}/.env.production}"
OUTPUT_DIRECTORY="${P0R_OUTPUT_DIRECTORY:-}"
RUN_ID="${P0R_RUN_ID:-}"
COS_CREDENTIAL_FILE="${P0R_COS_CREDENTIAL_FILE:-}"
AGE_IDENTITY_FILE="${P0R_AGE_IDENTITY_FILE:-}"
CONFIRM_RECOVERY_DRILL="${CONFIRM_P0R_RECOVERY_DRILL:-}"

POSTGRES_IMAGE="postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55"
MINIMUM_TARGET_BYTES=51836979428
AGE_SHA256="${P0R_AGE_SHA256:-}"
AGE_RECIPIENT_SHA256="${P0R_AGE_RECIPIENT_SHA256:-}"
COS_ARCHIVE_SHA256="${P0R_COS_ARCHIVE_SHA256:-}"
COS_PROVISIONING_PLAN_SHA256="${P0R_COS_PROVISIONING_PLAN_SHA256:-}"
COS_PROVISIONING_TOOL_SHA256="${P0R_COS_PROVISIONING_TOOL_SHA256:-}"
BACKUP_CAPTURE_SHA256="${P0R_BACKUP_CAPTURE_SHA256:-}"
FINGERPRINT_SHA256="${P0R_FINGERPRINT_SHA256:-}"
PREFLIGHT_LIBRARY_SHA256="${P0R_PREFLIGHT_LIBRARY_SHA256:-}"
RECOVERY_EVIDENCE_SHA256="${P0R_RECOVERY_EVIDENCE_SHA256:-}"
RUNNER_SHA256="${P0R_RUNNER_SHA256:-}"

fail() {
  printf '{"reason":%s,"status":"BLOCKED"}\n' "$(jq -Rn --arg value "$1" '$value')" >&2
  exit 1
}

print_plan() {
  cat <<'JSON'
{"schemaVersion":"v2-m1-production-storage-p0r-runner-plan.v3","mode":"plan","sourceTransaction":"REPEATABLE_READ_READ_ONLY","plaintextDumpCreated":false,"encryption":"AGE_X25519","offHostProvider":"TENCENT_COS","offHostAvailabilityZoneType":"SINGLE_AZ_REQUIRED","offHostVersioning":"ENABLED","offHostRetention":"COMPLIANCE_30D_MINIMUM","offHostObjectKey":"HIGH_ENTROPY_RUN_BOUND","offHostReadOnlyPreflightBeforeDatabaseCapture":true,"preUploadAbsenceRequired":true,"stsPolicyPlanBound":true,"restorePostgresMajor":16,"restoreNetworkMode":"none","restoreCpuNano":1500000000,"restoreMemoryBytes":2147483648,"restoreMemorySwapBytes":3221225472,"restorePidsLimit":256,"hostPortsPublished":false,"productionNetworksAttached":false,"productionVolumesMounted":false,"productionCredentialsMounted":false,"productionDatabaseMutation":false,"productionServiceMutation":false,"productionRepositoryMutation":false,"migrationAllowed":false,"capacityMutationAllowed":false,"automaticTradingAllowed":false}
JSON
}

if [[ "${MODE}" == "plan" ]]; then
  print_plan
  exit 0
fi
[[ "${MODE}" == "execute" ]] || fail "mode must be plan or execute"
[[ "${CONFIRM_RECOVERY_DRILL}" == "EXECUTE_V2_M1_P0R_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE" ]] \
  || fail "exact recovery drill confirmation is required"

for command in awk basename chmod chown cmp date df docker git head id install jq ln mktemp readlink rm seq sha256sum sleep sort stat sudo tee timeout tr wc; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command missing: ${command}"
done
sudo -n true >/dev/null 2>&1 || fail "passwordless sudo is unavailable"
sudo -n docker version >/dev/null 2>&1 || fail "Docker is unavailable"

[[ "${SOURCE_COMMIT}" =~ ^[0-9a-f]{40}$ ]] || fail "source commit is invalid"
[[ "${RUN_ID}" =~ ^[a-z0-9][a-z0-9-]{10,63}$ ]] || fail "run ID is invalid"
SOURCE_ROOT="/home/ubuntu/.cache/market-radar-v2/p0r/staging"
OUTPUT_ROOT="/home/ubuntu/.cache/market-radar-v2/p0r/evidence"
EXPECTED_SOURCE_DIRECTORY="${SOURCE_ROOT}/${RUN_ID}"
EXPECTED_OUTPUT_DIRECTORY="${OUTPUT_ROOT}/${RUN_ID}"
[[ -d "${SOURCE_ROOT}" && ! -L "${SOURCE_ROOT}" \
  && "$(readlink -f "${SOURCE_ROOT}")" == "${SOURCE_ROOT}" ]] \
  || fail "P0R staging root is invalid"
[[ -d "${OUTPUT_ROOT}" && ! -L "${OUTPUT_ROOT}" \
  && "$(readlink -f "${OUTPUT_ROOT}")" == "${OUTPUT_ROOT}" ]] \
  || fail "P0R evidence root is invalid"
[[ "${SOURCE_DIRECTORY}" == "${EXPECTED_SOURCE_DIRECTORY}" \
  && -d "${SOURCE_DIRECTORY}" && ! -L "${SOURCE_DIRECTORY}" \
  && "$(readlink -f "${SOURCE_DIRECTORY}")" == "${EXPECTED_SOURCE_DIRECTORY}" ]] \
  || fail "source directory is outside the locked P0R run scope"
[[ "${OUTPUT_DIRECTORY}" == "${EXPECTED_OUTPUT_DIRECTORY}" ]] \
  || fail "output directory is outside the locked P0R run scope"
[[ ! -e "${OUTPUT_DIRECTORY}" ]] || fail "output directory already exists"
[[ "${PRODUCTION_WORKTREE}" == /* && -d "${PRODUCTION_WORKTREE}" ]] \
  || fail "production worktree is invalid"
[[ "${PRODUCTION_ENV_FILE}" == "${PRODUCTION_WORKTREE}/.env.production" \
  && -f "${PRODUCTION_ENV_FILE}" && ! -L "${PRODUCTION_ENV_FILE}" ]] \
  || fail "production env file is unavailable"
[[ "$(git -C "${PRODUCTION_WORKTREE}" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] \
  || fail "production worktree is not Git"
[[ "${COS_CREDENTIAL_FILE}" == "/dev/shm/market-radar-v2-p0r-${RUN_ID}.cos-credentials.json" ]] \
  || fail "COS credential file must be an ephemeral /dev/shm file"
[[ "${AGE_IDENTITY_FILE}" == "/dev/shm/market-radar-v2-p0r-${RUN_ID}.age-identity.txt" ]] \
  || fail "age identity file must be an ephemeral /dev/shm file"

require_secure_secret() {
  local path="$1" label="$2" maximum_size="$3" mode size
  [[ -f "${path}" && ! -L "${path}" ]] || fail "${label} must be a regular non-symlink file"
  mode="$(stat -c '%a' "${path}")"
  [[ "$(( 8#${mode} & 8#077 ))" -eq 0 ]] || fail "${label} permissions are too open"
  size="$(stat -c '%s' "${path}")"
  [[ "${size}" -gt 0 && "${size}" -le "${maximum_size}" ]] || fail "${label} size is invalid"
}
require_secure_secret "${COS_CREDENTIAL_FILE}" "COS credential file" 65536
require_secure_secret "${AGE_IDENTITY_FILE}" "age identity file" 8192
read -r AGE_IDENTITY_LINE_COUNT AGE_IDENTITY_VALID_COUNT < <(
  sudo -n awk '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    { total += 1; if ($0 ~ /^AGE-SECRET-KEY-1[0-9A-Z]+$/) valid += 1 }
    END { print total + 0, valid + 0 }
  ' "${AGE_IDENTITY_FILE}"
)
[[ "${AGE_IDENTITY_LINE_COUNT}" -eq 1 && "${AGE_IDENTITY_VALID_COUNT}" -eq 1 ]] \
  || fail "age identity file must contain exactly one X25519 identity"

BACKUP_CAPTURE_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-backup-capture.mjs"
FINGERPRINT_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-database-fingerprint.mjs"
PREFLIGHT_LIBRARY_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-read-only-preflight.mjs"
RECOVERY_EVIDENCE_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-recovery-evidence.mjs"
RUNNER_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-p0r-runner.sh"
AGE_BINARY_SOURCE="${SOURCE_DIRECTORY}/age"
AGE_RECIPIENT_SOURCE="${SOURCE_DIRECTORY}/age-recipient.txt"
COS_ARCHIVE_SOURCE="${SOURCE_DIRECTORY}/p0r-cos-archive"
COS_PROVISIONING_PLAN_SOURCE="${SOURCE_DIRECTORY}/cos-provisioning-plan.json"
COS_PROVISIONING_TOOL_SOURCE="${SOURCE_DIRECTORY}/m1-production-storage-p0r-cos-provisioning.mjs"

verify_source() {
  local path="$1" expected="$2" label="$3"
  [[ -f "${path}" && ! -L "${path}" ]] || fail "${label} source is invalid"
  [[ "${expected}" =~ ^[0-9a-f]{64}$ ]] || fail "${label} checksum binding is invalid"
  [[ "$(sha256sum "${path}" | awk '{print $1}')" == "${expected}" ]] \
    || fail "${label} checksum mismatch"
}
verify_source "${BACKUP_CAPTURE_SOURCE}" "${BACKUP_CAPTURE_SHA256}" "backup capture"
verify_source "${FINGERPRINT_SOURCE}" "${FINGERPRINT_SHA256}" "database fingerprint"
verify_source "${PREFLIGHT_LIBRARY_SOURCE}" "${PREFLIGHT_LIBRARY_SHA256}" "preflight library"
verify_source "${RECOVERY_EVIDENCE_SOURCE}" "${RECOVERY_EVIDENCE_SHA256}" "recovery evidence"
verify_source "${RUNNER_SOURCE}" "${RUNNER_SHA256}" "P0R runner"
verify_source "${AGE_BINARY_SOURCE}" "${AGE_SHA256}" "age binary"
verify_source "${COS_ARCHIVE_SOURCE}" "${COS_ARCHIVE_SHA256}" "COS archive binary"
verify_source "${COS_PROVISIONING_PLAN_SOURCE}" "${COS_PROVISIONING_PLAN_SHA256}" "COS provisioning plan"
verify_source "${COS_PROVISIONING_TOOL_SOURCE}" "${COS_PROVISIONING_TOOL_SHA256}" "COS provisioning tool"
verify_source "${AGE_RECIPIENT_SOURCE}" "${AGE_RECIPIENT_SHA256}" "age recipient"
[[ "$(stat -c '%s' "${AGE_RECIPIENT_SOURCE}")" -le 8192 ]] \
  || fail "age recipient source is too large"
[[ "$(readlink -f "$0")" == "$(readlink -f "${RUNNER_SOURCE}")" ]] \
  || fail "executed runner path is not the checksum-bound staging file"

install -d -m 700 "${OUTPUT_DIRECTORY}"
RUNTIME_DIRECTORY="${OUTPUT_DIRECTORY}/.runtime"
HOST_RUNTIME_DIRECTORY="${RUNTIME_DIRECTORY}/node"
install -d -m 700 "${RUNTIME_DIRECTORY}" "${HOST_RUNTIME_DIRECTORY}"

RESTORE_CONTAINER="mr-v2-p0r-${RUN_ID}"
RESTORE_VOLUME="mr-v2-p0r-${RUN_ID}"
DATABASE_CONNECTION_FILE="/dev/shm/market-radar-v2-p0r-${RUN_ID}.database.secret"
RESTORE_CONNECTION_FILE="/dev/shm/market-radar-v2-p0r-${RUN_ID}.restore.secret"
CANARY_PLAINTEXT="/dev/shm/market-radar-v2-p0r-${RUN_ID}.canary"
CANARY_ENCRYPTED="/dev/shm/market-radar-v2-p0r-${RUN_ID}.canary.age"
CANARY_DECRYPTED="/dev/shm/market-radar-v2-p0r-${RUN_ID}.canary.restored"
LOCAL_ENCRYPTED="${RUNTIME_DIRECTORY}/production.dump.age"
RETRIEVED_ENCRYPTED="${RUNTIME_DIRECTORY}/retrieved.dump.age"
CAPTURE_FACTS="${OUTPUT_DIRECTORY}/backup-capture-facts.json"
ARCHIVE_FACTS="${OUTPUT_DIRECTORY}/cos-archive-facts.json"
BACKUP_FACTS="${OUTPUT_DIRECTORY}/backup-facts.json"
RESTORE_FINGERPRINT="${OUTPUT_DIRECTORY}/restore-fingerprint.json"
RESTORE_UNSIGNED="${RUNTIME_DIRECTORY}/restore-unsigned.json"
RESTORE_FACTS="${OUTPUT_DIRECTORY}/restore-facts.json"
RECOVERY_EVIDENCE="${OUTPUT_DIRECTORY}/recovery-evidence.json"
RUNNER_REPORT="${OUTPUT_DIRECTORY}/runner-report.json"
DOCKER_BEFORE="${RUNTIME_DIRECTORY}/docker-before.json"
DOCKER_AFTER="${RUNTIME_DIRECTORY}/docker-after.json"

RESTORE_CONTAINER_CREATED=false
RESTORE_VOLUME_CREATED=false
COS_CREDENTIAL_REMOVED=false
AGE_IDENTITY_REMOVED=false
DATABASE_CONNECTION_REMOVED=false
RESTORE_CONNECTION_REMOVED=false
RUNTIME_REMOVED=false

cleanup() {
  if [[ "${RESTORE_CONTAINER_CREATED}" == "true" ]]; then
    sudo -n docker rm --force "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
  fi
  if [[ "${RESTORE_VOLUME_CREATED}" == "true" ]]; then
    sudo -n docker volume rm --force "${RESTORE_VOLUME}" >/dev/null 2>&1 || true
  fi
  sudo -n rm -f \
    "${DATABASE_CONNECTION_FILE}" \
    "${RESTORE_CONNECTION_FILE}" \
    "${CANARY_PLAINTEXT}" \
    "${CANARY_ENCRYPTED}" \
    "${CANARY_DECRYPTED}" \
    "${COS_CREDENTIAL_FILE}" \
    "${AGE_IDENTITY_FILE}" >/dev/null 2>&1 || true
  if [[ -e "${RUNTIME_DIRECTORY}" ]]; then
    sudo -n rm -rf "${RUNTIME_DIRECTORY}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

compose() {
  sudo -n docker compose \
    --env-file "${PRODUCTION_ENV_FILE}" \
    -f "${PRODUCTION_WORKTREE}/docker-compose.yml" \
    "$@"
}

capture_docker_state() {
  local target="$1" containers_file networks_file volumes_file
  containers_file="$(mktemp)"
  networks_file="$(mktemp)"
  volumes_file="$(mktemp)"
  mapfile -t container_ids < <(sudo -n docker ps -q --no-trunc | sort)
  mapfile -t network_ids < <(sudo -n docker network ls -q --no-trunc | sort)
  mapfile -t volume_names < <(sudo -n docker volume ls -q | sort)
  if (( ${#container_ids[@]} > 0 )); then
    sudo -n docker inspect "${container_ids[@]}" > "${containers_file}"
  else
    printf '[]\n' > "${containers_file}"
  fi
  if (( ${#network_ids[@]} > 0 )); then
    sudo -n docker network inspect "${network_ids[@]}" > "${networks_file}"
  else
    printf '[]\n' > "${networks_file}"
  fi
  if (( ${#volume_names[@]} > 0 )); then
    sudo -n docker volume inspect "${volume_names[@]}" > "${volumes_file}"
  else
    printf '[]\n' > "${volumes_file}"
  fi
  jq -S -n \
    --slurpfile containers "${containers_file}" \
    --slurpfile networks "${networks_file}" \
    --slurpfile volumes "${volumes_file}" \
    '{
      containers: ($containers[0] | map({
        health: (.State.Health.Status // "none"),
        id: .Id,
        image: .Image,
        name: (.Name | ltrimstr("/")),
        restartCount: .RestartCount,
        status: .State.Status
      }) | sort_by(.name)),
      networks: ($networks[0] | map({driver: .Driver, id: .Id, name: .Name, scope: .Scope}) | sort_by(.name)),
      volumes: ($volumes[0] | map({driver: .Driver, name: .Name}) | sort_by(.name))
    }' > "${target}"
  rm -f "${containers_file}" "${networks_file}" "${volumes_file}"
  chmod 600 "${target}"
}

adopt_evidence() {
  local path="$1"
  sudo -n chmod 600 "${path}"
  sudo -n chown "$(id -u):$(id -g)" "${path}"
}

PRODUCTION_HEAD_BEFORE="$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)"
[[ "${PRODUCTION_HEAD_BEFORE}" =~ ^[0-9a-f]{40}$ ]] || fail "production HEAD is invalid"
[[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]] \
  || fail "production worktree is dirty"
capture_docker_state "${DOCKER_BEFORE}"
DOCKER_BEFORE_DIGEST="sha256:$(sha256sum "${DOCKER_BEFORE}" | awk '{print $1}')"

WEB_CONTAINER="$(compose ps -q web)"
POSTGRES_CONTAINER="$(compose ps -q postgres)"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]{64}$ && "${POSTGRES_CONTAINER}" =~ ^[0-9a-f]{64}$ ]] \
  || fail "production Web or PostgreSQL container identity is invalid"
[[ "$(sudo -n docker inspect -f '{{.State.Running}}' "${WEB_CONTAINER}")" == "true" ]] \
  || fail "production Web container is not running"
[[ "$(sudo -n docker inspect -f '{{.State.Running}}' "${POSTGRES_CONTAINER}")" == "true" ]] \
  || fail "production PostgreSQL container is not running"

WEB_PID="$(sudo -n docker inspect -f '{{.State.Pid}}' "${WEB_CONTAINER}")"
POSTGRES_PID="$(sudo -n docker inspect -f '{{.State.Pid}}' "${POSTGRES_CONTAINER}")"
[[ "${WEB_PID}" =~ ^[1-9][0-9]*$ && "${POSTGRES_PID}" =~ ^[1-9][0-9]*$ ]] \
  || fail "production container PID is invalid"
HOST_NODE_BINARY="/proc/${WEB_PID}/root/usr/local/bin/node"
HOST_NODE_MODULES="/proc/${WEB_PID}/root/app/node_modules"
POSTGRES_SOCKET_SOURCE="/proc/${POSTGRES_PID}/root/var/run/postgresql"
sudo -n test -x "${HOST_NODE_BINARY}" || fail "production Node runtime is unavailable"
sudo -n test -d "${HOST_NODE_MODULES}" || fail "production Node modules are unavailable"
sudo -n test -S "${POSTGRES_SOCKET_SOURCE}/.s.PGSQL.5432" \
  || fail "production PostgreSQL local socket is unavailable"

for source in \
  "${BACKUP_CAPTURE_SOURCE}" \
  "${COS_PROVISIONING_TOOL_SOURCE}" \
  "${FINGERPRINT_SOURCE}" \
  "${PREFLIGHT_LIBRARY_SOURCE}" \
  "${RECOVERY_EVIDENCE_SOURCE}"; do
  install -m 500 "${source}" "${HOST_RUNTIME_DIRECTORY}/$(basename "${source}")"
done
install -m 500 "${AGE_BINARY_SOURCE}" "${RUNTIME_DIRECTORY}/age"
install -m 500 "${COS_ARCHIVE_SOURCE}" "${RUNTIME_DIRECTORY}/p0r-cos-archive"
install -m 400 "${AGE_RECIPIENT_SOURCE}" "${RUNTIME_DIRECTORY}/age-recipient.txt"
install -m 400 "${COS_PROVISIONING_PLAN_SOURCE}" "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json"
ln -s "${HOST_NODE_MODULES}" "${HOST_RUNTIME_DIRECTORY}/node_modules"

sudo -n "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-p0r-cos-provisioning.mjs" verify-plan \
    --input "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json" \
    --run-id "${RUN_ID}" \
    --source-commit "${SOURCE_COMMIT}" >/dev/null

# A memory-only canary proves the supplied private identity matches the public recipient.
sudo -n head -c 64 /dev/urandom > "${CANARY_PLAINTEXT}"
sudo -n chmod 600 "${CANARY_PLAINTEXT}"
sudo -n "${RUNTIME_DIRECTORY}/age" --encrypt \
  --recipients-file "${RUNTIME_DIRECTORY}/age-recipient.txt" \
  --output "${CANARY_ENCRYPTED}" "${CANARY_PLAINTEXT}"
sudo -n "${RUNTIME_DIRECTORY}/age" --decrypt \
  --identity "${AGE_IDENTITY_FILE}" \
  --output "${CANARY_DECRYPTED}" "${CANARY_ENCRYPTED}"
sudo -n cmp --silent "${CANARY_PLAINTEXT}" "${CANARY_DECRYPTED}" \
  || fail "age recovery identity does not match the recipient"
sudo -n rm -f "${CANARY_PLAINTEXT}" "${CANARY_ENCRYPTED}" "${CANARY_DECRYPTED}"

# Prove the exact temporary grant against COS before touching the production database.
sudo -n timeout 5m "${RUNTIME_DIRECTORY}/p0r-cos-archive" preflight \
  --credentials "${COS_CREDENTIAL_FILE}" \
  --provisioning-plan "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json" \
  --run-id "${RUN_ID}" >/dev/null

sudo -n docker inspect "${POSTGRES_CONTAINER}" \
  | jq -er --arg socketDirectory "${POSTGRES_SOCKET_SOURCE}" '
      .[0].Config.Env
      | map(capture("^(?<key>POSTGRES_(?:USER|DB))=(?<value>.*)$"))
      | from_entries
      | (.POSTGRES_USER // "") as $username
      | (.POSTGRES_DB // "") as $database
      | if ([$username, $database] | all(test("^[A-Za-z_][A-Za-z0-9_$-]{0,62}$"))) then
          "postgresql://\($username | @uri):local-socket@localhost/\($database | @uri)?host=\($socketDirectory | @uri)"
        else
          error("PostgreSQL bootstrap identity is invalid")
        end
    ' \
  | sudo -n tee "${DATABASE_CONNECTION_FILE}" >/dev/null
sudo -n chmod 600 "${DATABASE_CONNECTION_FILE}"
DATABASE_USER="$(sudo -n docker inspect "${POSTGRES_CONTAINER}" | jq -er '.[0].Config.Env[] | select(startswith("POSTGRES_USER=")) | sub("^POSTGRES_USER="; "")')"
DATABASE_NAME="$(sudo -n docker inspect "${POSTGRES_CONTAINER}" | jq -er '.[0].Config.Env[] | select(startswith("POSTGRES_DB=")) | sub("^POSTGRES_DB="; "")')"

sudo -n timeout 35m "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-backup-capture.mjs" capture \
    --age-binary "${RUNTIME_DIRECTORY}/age" \
    --age-binary-sha256 "${AGE_SHA256}" \
    --age-recipient-file "${RUNTIME_DIRECTORY}/age-recipient.txt" \
    --database-connection-file "${DATABASE_CONNECTION_FILE}" \
    --database-name "${DATABASE_NAME}" \
    --database-user "${DATABASE_USER}" \
    --docker-binary "$(command -v docker)" \
    --encrypted-output "${LOCAL_ENCRYPTED}" \
    --output "${CAPTURE_FACTS}" \
    --postgres-container "${POSTGRES_CONTAINER}" \
    --production-head "${PRODUCTION_HEAD_BEFORE}" \
    --source-commit "${SOURCE_COMMIT}" >/dev/null
adopt_evidence "${CAPTURE_FACTS}"
sudo -n rm -f "${DATABASE_CONNECTION_FILE}"
DATABASE_CONNECTION_REMOVED=true

sudo -n timeout 35m "${RUNTIME_DIRECTORY}/p0r-cos-archive" archive \
  --credentials "${COS_CREDENTIAL_FILE}" \
  --encrypted-backup "${LOCAL_ENCRYPTED}" \
  --output "${ARCHIVE_FACTS}" \
  --provisioning-plan "${RUNTIME_DIRECTORY}/cos-provisioning-plan.json" \
  --retrieved-backup "${RETRIEVED_ENCRYPTED}" \
  --run-id "${RUN_ID}" >/dev/null
adopt_evidence "${ARCHIVE_FACTS}"
sudo -n rm -f "${COS_CREDENTIAL_FILE}"
COS_CREDENTIAL_REMOVED=true

sudo -n "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-recovery-evidence.mjs" assemble-backup \
    --archive-facts "${ARCHIVE_FACTS}" \
    --capture-facts "${CAPTURE_FACTS}" \
    --output "${BACKUP_FACTS}" >/dev/null
adopt_evidence "${BACKUP_FACTS}"

sudo -n docker container inspect "${RESTORE_CONTAINER}" >/dev/null 2>&1 \
  && fail "restore container namespace already exists"
sudo -n docker volume inspect "${RESTORE_VOLUME}" >/dev/null 2>&1 \
  && fail "restore volume namespace already exists"
sudo -n docker image inspect "${POSTGRES_IMAGE}" >/dev/null 2>&1 \
  || fail "pinned PostgreSQL 16 restore image is not present"
RESTORE_IMAGE_ID="$(sudo -n docker image inspect -f '{{.Id}}' "${POSTGRES_IMAGE}")"
[[ "${RESTORE_IMAGE_ID}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "pinned PostgreSQL 16 restore image ID is invalid"

sudo -n docker volume create \
  --label "market-radar-v2.scope=p0r-isolated-restore" \
  --label "market-radar-v2.run-id=${RUN_ID}" \
  "${RESTORE_VOLUME}" >/dev/null
RESTORE_VOLUME_CREATED=true
RESTORE_MOUNTPOINT="$(sudo -n docker volume inspect -f '{{.Mountpoint}}' "${RESTORE_VOLUME}")"
[[ "${RESTORE_MOUNTPOINT}" == /* ]] || fail "restore volume mountpoint is invalid"
TARGET_AVAILABLE_BYTES="$(sudo -n df -B1 --output=avail "${RESTORE_MOUNTPOINT}" | awk 'NR == 2 {print $1}')"
[[ "${TARGET_AVAILABLE_BYTES}" =~ ^[1-9][0-9]*$ ]] || fail "restore target capacity is invalid"
[[ "${TARGET_AVAILABLE_BYTES}" -ge "${MINIMUM_TARGET_BYTES}" ]] \
  || fail "restore target capacity is below the P0 requirement"

RESTORE_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
sudo -n docker run --detach \
  --name "${RESTORE_CONTAINER}" \
  --label "market-radar-v2.scope=p0r-isolated-restore" \
  --label "market-radar-v2.run-id=${RUN_ID}" \
  --network none \
  --read-only \
  --cpus 1.5 \
  --memory 2g \
  --memory-swap 3g \
  --pids-limit 256 \
  --restart no \
  --security-opt no-new-privileges=true \
  --tmpfs /run/postgresql:rw,noexec,nosuid,size=64m \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --mount "type=volume,source=${RESTORE_VOLUME},target=/var/lib/postgresql/data" \
  --env POSTGRES_DB=market_radar_restore \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --health-cmd 'pg_isready -U postgres -d market_radar_restore' \
  --health-interval 2s \
  --health-timeout 2s \
  --health-retries 60 \
  "${POSTGRES_IMAGE}" >/dev/null
RESTORE_CONTAINER_CREATED=true

sudo -n docker inspect "${RESTORE_CONTAINER}" | jq -e \
  --arg volume "${RESTORE_VOLUME}" \
  --arg image "${POSTGRES_IMAGE}" \
  --arg imageId "${RESTORE_IMAGE_ID}" '
    .[0].Config.Image == $image
    and .[0].Image == $imageId
    and .[0].HostConfig.NetworkMode == "none"
    and .[0].HostConfig.NanoCpus == 1500000000
    and .[0].HostConfig.Memory == 2147483648
    and .[0].HostConfig.MemorySwap == 3221225472
    and .[0].HostConfig.PidsLimit == 256
    and .[0].HostConfig.ReadonlyRootfs == true
    and .[0].HostConfig.Privileged == false
    and .[0].HostConfig.RestartPolicy.Name == "no"
    and ((.[0].HostConfig.SecurityOpt // []) | any(
      . == "no-new-privileges"
      or . == "no-new-privileges:true"
      or . == "no-new-privileges=true"
    ))
    and ((.[0].HostConfig.PortBindings // {}) | length == 0)
    and (
      (.[0].NetworkSettings.Networks // {}) as $networks
      | (($networks | length) == 0 or (
          ($networks | keys) == ["none"]
          and (($networks.none.IPAddress // "") == "")
          and (($networks.none.GlobalIPv6Address // "") == "")
          and (($networks.none.Gateway // "") == "")
          and (($networks.none.IPv6Gateway // "") == "")
          and (($networks.none.Aliases // []) | length == 0)
          and (($networks.none.Links // []) | length == 0)
        ))
    )
    and (.[0].Mounts | length == 1)
    and .[0].Mounts[0].Type == "volume"
    and .[0].Mounts[0].Name == $volume
    and .[0].Mounts[0].Destination == "/var/lib/postgresql/data"
  ' >/dev/null || fail "restore container isolation contract failed"

for _ in $(seq 1 60); do
  [[ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' "${RESTORE_CONTAINER}")" == "healthy" ]] && break
  sleep 2
done
[[ "$(sudo -n docker inspect -f '{{.State.Health.Status}}' "${RESTORE_CONTAINER}")" == "healthy" ]] \
  || fail "isolated PostgreSQL restore target is not healthy"

set +e
sudo -n "${RUNTIME_DIRECTORY}/age" --decrypt \
  --identity "${AGE_IDENTITY_FILE}" "${RETRIEVED_ENCRYPTED}" \
  | sudo -n docker exec --interactive "${RESTORE_CONTAINER}" \
      pg_restore \
        --username postgres \
        --dbname market_radar_restore \
        --no-owner \
        --no-acl \
        --no-password \
        --exit-on-error \
        --single-transaction
RESTORE_PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
[[ "${RESTORE_PIPE_STATUS[0]}" -eq 0 && "${RESTORE_PIPE_STATUS[1]}" -eq 0 ]] \
  || fail "age decryption or isolated pg_restore failed"
sudo -n rm -f "${AGE_IDENTITY_FILE}"
AGE_IDENTITY_REMOVED=true

RESTORE_PID="$(sudo -n docker inspect -f '{{.State.Pid}}' "${RESTORE_CONTAINER}")"
[[ "${RESTORE_PID}" =~ ^[1-9][0-9]*$ ]] || fail "restore container PID is invalid"
RESTORE_SOCKET_SOURCE="/proc/${RESTORE_PID}/root/var/run/postgresql"
sudo -n test -S "${RESTORE_SOCKET_SOURCE}/.s.PGSQL.5432" \
  || fail "restore PostgreSQL local socket is unavailable"
printf 'postgresql://postgres:local-socket@localhost/market_radar_restore?host=%s\n' \
  "$(jq -rn --arg value "${RESTORE_SOCKET_SOURCE}" '$value | @uri')" \
  | sudo -n tee "${RESTORE_CONNECTION_FILE}" >/dev/null
sudo -n chmod 600 "${RESTORE_CONNECTION_FILE}"
sudo -n timeout 20m "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-database-fingerprint.mjs" capture \
    --database-connection-file "${RESTORE_CONNECTION_FILE}" \
    --output "${RESTORE_FINGERPRINT}" \
    --source-commit "${SOURCE_COMMIT}" >/dev/null
adopt_evidence "${RESTORE_FINGERPRINT}"
sudo -n rm -f "${RESTORE_CONNECTION_FILE}"
RESTORE_CONNECTION_REMOVED=true

SOURCE_STRUCTURAL_DIGEST="$(jq -er '.structuralDigest' "${CAPTURE_FACTS}")"
SOURCE_VERIFICATION_DIGEST="$(jq -er '.verificationDigest' "${CAPTURE_FACTS}")"
[[ "$(jq -er '.structuralDigest' "${RESTORE_FINGERPRINT}")" == "${SOURCE_STRUCTURAL_DIGEST}" ]] \
  || fail "restored database structural digest mismatch"
[[ "$(jq -er '.verificationDigest' "${RESTORE_FINGERPRINT}")" == "${SOURCE_VERIFICATION_DIGEST}" ]] \
  || fail "restored database verification digest mismatch"

sudo -n docker rm --force "${RESTORE_CONTAINER}" >/dev/null
RESTORE_CONTAINER_CREATED=false
sudo -n docker volume rm "${RESTORE_VOLUME}" >/dev/null
RESTORE_VOLUME_CREATED=false
sudo -n rm -f "${LOCAL_ENCRYPTED}" "${RETRIEVED_ENCRYPTED}"
[[ ! -e "${LOCAL_ENCRYPTED}" && ! -e "${RETRIEVED_ENCRYPTED}" ]] \
  || fail "local encrypted backup copies were not removed"

RESTORE_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -S -n \
  --arg schemaVersion "v2-m1-production-storage-isolated-restore-facts.v1" \
  --arg completedAt "${RESTORE_COMPLETED_AT}" \
  --arg startedAt "${RESTORE_STARTED_AT}" \
  --arg sourceCommit "${SOURCE_COMMIT}" \
  --arg productionHead "${PRODUCTION_HEAD_BEFORE}" \
  --arg sourceDatabaseIdentityDigest "$(jq -er '.databaseIdentityDigest' "${CAPTURE_FACTS}")" \
  --arg sourceDatabaseStructuralDigest "${SOURCE_STRUCTURAL_DIGEST}" \
  --arg sourceDatabaseVerificationDigest "${SOURCE_VERIFICATION_DIGEST}" \
  --arg sourceEncryptedBackupDigest "$(jq -er '.encryption.encryptedBackupDigest' "${CAPTURE_FACTS}")" \
  --arg retrievedBackupDigest "$(jq -er '.offHost.retrievedDigest' "${ARCHIVE_FACTS}")" \
  --argjson targetAvailableBytes "${TARGET_AVAILABLE_BYTES}" \
  '{
    cleanup: {
      credentialFileRemoved: true,
      decryptedBackupRemoved: true,
      plaintextDumpRemoved: true,
      restoreClusterRemoved: true,
      restoreVolumeRemoved: true
    },
    completedAt: $completedAt,
    isolation: {
      containerized: true,
      hostPortsPublished: false,
      networkMode: "NONE",
      productionCredentialsMounted: false,
      productionNetworksAttached: false,
      productionVolumesMounted: false
    },
    postgresMajor: 16,
    productionDatabaseMutation: false,
    productionHead: $productionHead,
    productionRepositoryMutation: false,
    productionServiceMutation: false,
    retrievedBackupDigest: $retrievedBackupDigest,
    schemaVersion: $schemaVersion,
    sourceCommit: $sourceCommit,
    sourceDatabaseIdentityDigest: $sourceDatabaseIdentityDigest,
    sourceDatabaseStructuralDigest: $sourceDatabaseStructuralDigest,
    sourceDatabaseVerificationDigest: $sourceDatabaseVerificationDigest,
    sourceEncryptedBackupDigest: $sourceEncryptedBackupDigest,
    startedAt: $startedAt,
    targetAvailableBytes: $targetAvailableBytes,
    verification: {
      businessRowValuesOutput: false,
      constraintsVerified: true,
      decryptSucceeded: true,
      indexesVerified: true,
      restoreSucceeded: true,
      restoredDatabaseStructuralDigest: $sourceDatabaseStructuralDigest,
      restoredDatabaseVerificationDigest: $sourceDatabaseVerificationDigest
    }
  }' > "${RESTORE_UNSIGNED}"
chmod 600 "${RESTORE_UNSIGNED}"

sudo -n "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-recovery-evidence.mjs" seal-restore \
    --input "${RESTORE_UNSIGNED}" \
    --output "${RESTORE_FACTS}" >/dev/null
adopt_evidence "${RESTORE_FACTS}"
sudo -n "${HOST_NODE_BINARY}" --preserve-symlinks \
  "${HOST_RUNTIME_DIRECTORY}/m1-production-storage-recovery-evidence.mjs" build \
    --backup-facts "${BACKUP_FACTS}" \
    --restore-facts "${RESTORE_FACTS}" \
    --source-commit "${SOURCE_COMMIT}" \
    --production-head "${PRODUCTION_HEAD_BEFORE}" \
    --database-identity-digest "$(jq -er '.databaseIdentityDigest' "${CAPTURE_FACTS}")" \
    --output "${RECOVERY_EVIDENCE}" >/dev/null
adopt_evidence "${RECOVERY_EVIDENCE}"

capture_docker_state "${DOCKER_AFTER}"
DOCKER_AFTER_DIGEST="sha256:$(sha256sum "${DOCKER_AFTER}" | awk '{print $1}')"
[[ "${DOCKER_AFTER_DIGEST}" == "${DOCKER_BEFORE_DIGEST}" ]] \
  || fail "Docker state did not return to the production baseline"
PRODUCTION_HEAD_AFTER="$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)"
[[ "${PRODUCTION_HEAD_AFTER}" == "${PRODUCTION_HEAD_BEFORE}" ]] \
  || fail "production HEAD changed during P0R"
[[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]] \
  || fail "production worktree changed during P0R"

for path in \
  "${COS_CREDENTIAL_FILE}" \
  "${AGE_IDENTITY_FILE}" \
  "${DATABASE_CONNECTION_FILE}" \
  "${RESTORE_CONNECTION_FILE}"; do
  [[ ! -e "${path}" ]] || fail "ephemeral credential material remains"
done
[[ "${COS_CREDENTIAL_REMOVED}" == "true" \
  && "${AGE_IDENTITY_REMOVED}" == "true" \
  && "${DATABASE_CONNECTION_REMOVED}" == "true" \
  && "${RESTORE_CONNECTION_REMOVED}" == "true" ]] \
  || fail "credential cleanup state is incomplete"

jq -S -n \
  --arg schemaVersion "v2-m1-production-storage-p0r-runner-report.v1" \
  --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  --arg sourceCommit "${SOURCE_COMMIT}" \
  --arg productionHead "${PRODUCTION_HEAD_AFTER}" \
  --arg dockerStateDigest "${DOCKER_AFTER_DIGEST}" \
  --arg backupEvidenceDigest "$(jq -er '.evidenceDigest' "${BACKUP_FACTS}")" \
  --arg restoreEvidenceDigest "$(jq -er '.evidenceDigest' "${RESTORE_FACTS}")" \
  --arg recoveryEvidenceDigest "sha256:$(sha256sum "${RECOVERY_EVIDENCE}" | awk '{print $1}')" \
  '{
    schemaVersion: $schemaVersion,
    status: "PASS_P0R_RECOVERY_DRILL",
    completedAt: $completedAt,
    sourceCommit: $sourceCommit,
    productionHead: $productionHead,
    dockerStateDigest: $dockerStateDigest,
    backupEvidenceDigest: $backupEvidenceDigest,
    restoreEvidenceDigest: $restoreEvidenceDigest,
    recoveryEvidenceDigest: $recoveryEvidenceDigest,
    plaintextDumpCreated: false,
    businessRowsOutput: false,
    productionDatabaseMutation: false,
    productionServiceMutation: false,
    productionRepositoryMutation: false,
    migrationPerformed: false,
    capacityMutationPerformed: false,
    ephemeralCredentialsRemoved: true,
    temporaryContainerRemoved: true,
    temporaryVolumeRemoved: true
  }' > "${RUNNER_REPORT}"
chmod 600 "${RUNNER_REPORT}"

sudo -n rm -rf "${RUNTIME_DIRECTORY}"
[[ ! -e "${RUNTIME_DIRECTORY}" ]] || fail "P0R runtime directory was not removed"
RUNTIME_REMOVED=true
for file in "${OUTPUT_DIRECTORY}"/*.json; do
  sudo -n chmod 600 "${file}"
  sudo -n chown "$(id -u):$(id -g)" "${file}"
done

printf '{"status":"PASS_P0R_RECOVERY_DRILL","sourceCommit":"%s","productionHead":"%s","recoveryEvidenceSha256":"%s","productionDatabaseMutation":false,"productionServiceMutation":false,"productionRepositoryMutation":false,"migrationPerformed":false,"capacityMutationPerformed":false,"containsSecret":false}\n' \
  "${SOURCE_COMMIT}" \
  "${PRODUCTION_HEAD_AFTER}" \
  "$(sha256sum "${RECOVERY_EVIDENCE}" | awk '{print $1}')"
