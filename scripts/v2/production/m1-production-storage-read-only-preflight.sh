#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-plan}"
PROBE_SOURCE="${P0_PROBE_SOURCE:-}"
PROBE_SHA256="${P0_PROBE_SHA256:-}"
SOURCE_COMMIT="${P0_SOURCE_COMMIT:-}"
PRODUCTION_WORKTREE="${P0_PRODUCTION_WORKTREE:-/home/ubuntu/market-radar}"
PRODUCTION_ENV_FILE="${P0_PRODUCTION_ENV_FILE:-${PRODUCTION_WORKTREE}/.env.production}"
OUTPUT_DIRECTORY="${P0_OUTPUT_DIRECTORY:-}"
CONFIRM_READ_ONLY_PREFLIGHT="${CONFIRM_READ_ONLY_PREFLIGHT:-}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

print_plan() {
  cat <<'JSON'
{"schemaVersion":"v2-m1-production-storage-read-only-runner-plan.v1","mode":"plan","databaseTransaction":"REPEATABLE_READ_READ_ONLY","effectiveRoles":["pg_monitor","pg_read_all_data"],"productionDatabaseMutation":false,"productionServiceMutation":false,"productionRepositoryMutation":false,"migrationAllowed":false,"temporaryContainerOnly":true}
JSON
}

if [[ "${MODE}" == "plan" ]]; then
  print_plan
  exit 0
fi
[[ "${MODE}" == "execute" ]] || fail "mode must be plan or execute"
[[ "${CONFIRM_READ_ONLY_PREFLIGHT}" == "EXECUTE_V2_M1_P0_READ_ONLY_PREFLIGHT" ]] \
  || fail "exact read-only preflight confirmation is required"

for command in awk comm date df docker du git install jq mktemp rm sha256sum sort sudo tr wc; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command missing: ${command}"
done
sudo docker version >/dev/null 2>&1 || fail "Docker is unavailable"

[[ "${PROBE_SOURCE}" == /* && -f "${PROBE_SOURCE}" ]] || fail "P0_PROBE_SOURCE must be an absolute file"
[[ "${PRODUCTION_WORKTREE}" == /* && -d "${PRODUCTION_WORKTREE}" ]] \
  || fail "production worktree is invalid"
[[ "$(git -C "${PRODUCTION_WORKTREE}" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] \
  || fail "production worktree is not a Git worktree"
[[ "${PRODUCTION_ENV_FILE}" == /* && -f "${PRODUCTION_ENV_FILE}" ]] \
  || fail "production env file is unavailable"
[[ "${OUTPUT_DIRECTORY}" == /home/ubuntu/.cache/market-radar-v2/p0/* ]] \
  || fail "output directory is outside the locked P0 cache root"
[[ ! -e "${OUTPUT_DIRECTORY}" ]] || fail "output directory already exists"
[[ "${SOURCE_COMMIT}" =~ ^[0-9a-f]{40}$ ]] || fail "source commit is invalid"
[[ "${PROBE_SHA256}" =~ ^[0-9a-f]{64}$ ]] || fail "probe checksum is invalid"
[[ "$(sha256sum "${PROBE_SOURCE}" | awk '{print $1}')" == "${PROBE_SHA256}" ]] \
  || fail "probe checksum mismatch"

install -d -m 700 "${OUTPUT_DIRECTORY}"
SECRET_FILE="${OUTPUT_DIRECTORY}/.database-connection.secret"
RUNNER_NAME="market-radar-v2-m1-p0-${SOURCE_COMMIT:0:12}"
SECRET_REMOVED=false
CONTAINER_REMOVED=false

cleanup() {
  sudo docker rm -f "${RUNNER_NAME}" >/dev/null 2>&1 || true
  if [[ -e "${SECRET_FILE}" ]]; then
    sudo rm -f "${SECRET_FILE}"
  fi
}
trap cleanup EXIT

compose() {
  sudo docker compose \
    --env-file "${PRODUCTION_ENV_FILE}" \
    -f "${PRODUCTION_WORKTREE}/docker-compose.yml" \
    "$@"
}

capture_docker_state() {
  local target="$1"
  local containers_file networks_file volumes_file
  containers_file="$(mktemp)"
  networks_file="$(mktemp)"
  volumes_file="$(mktemp)"
  mapfile -t container_ids < <(sudo docker ps -q --no-trunc | sort)
  mapfile -t network_ids < <(sudo docker network ls -q --no-trunc | sort)
  mapfile -t volume_names < <(sudo docker volume ls -q | sort)
  if (( ${#container_ids[@]} > 0 )); then
    sudo docker inspect "${container_ids[@]}" > "${containers_file}"
  else
    printf '[]\n' > "${containers_file}"
  fi
  if (( ${#network_ids[@]} > 0 )); then
    sudo docker network inspect "${network_ids[@]}" > "${networks_file}"
  else
    printf '[]\n' > "${networks_file}"
  fi
  if (( ${#volume_names[@]} > 0 )); then
    sudo docker volume inspect "${volume_names[@]}" > "${volumes_file}"
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

BEFORE_SNAPSHOT="${OUTPUT_DIRECTORY}/docker-before.json"
AFTER_SNAPSHOT="${OUTPUT_DIRECTORY}/docker-after.json"
DATABASE_FACTS="${OUTPUT_DIRECTORY}/database-facts.json"
HOST_FACTS="${OUTPUT_DIRECTORY}/host-facts.json"

PRODUCTION_HEAD_BEFORE="$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)"
[[ "${PRODUCTION_HEAD_BEFORE}" =~ ^[0-9a-f]{40}$ ]] || fail "production HEAD is invalid"
if [[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]]; then
  WORKTREE_CLEAN_BEFORE=true
else
  WORKTREE_CLEAN_BEFORE=false
fi
capture_docker_state "${BEFORE_SNAPSHOT}"
BEFORE_DIGEST="sha256:$(sha256sum "${BEFORE_SNAPSHOT}" | awk '{print $1}')"

WEB_CONTAINER="$(compose ps -q web)"
POSTGRES_CONTAINER="$(compose ps -q postgres)"
[[ -n "${WEB_CONTAINER}" && -n "${POSTGRES_CONTAINER}" ]] \
  || fail "production Web or PostgreSQL container is absent"
[[ "$(sudo docker inspect -f '{{.State.Running}}' "${WEB_CONTAINER}")" == "true" ]] \
  || fail "production Web container is not running"
[[ "$(sudo docker inspect -f '{{.State.Running}}' "${POSTGRES_CONTAINER}")" == "true" ]] \
  || fail "production PostgreSQL container is not running"

WEB_NETWORKS="${OUTPUT_DIRECTORY}/.web-networks"
POSTGRES_NETWORKS="${OUTPUT_DIRECTORY}/.postgres-networks"
sudo docker inspect "${WEB_CONTAINER}" | jq -r '.[0].NetworkSettings.Networks | keys[]' | sort > "${WEB_NETWORKS}"
sudo docker inspect "${POSTGRES_CONTAINER}" | jq -r '.[0].NetworkSettings.Networks | keys[]' | sort > "${POSTGRES_NETWORKS}"
mapfile -t COMMON_NETWORKS < <(comm -12 "${WEB_NETWORKS}" "${POSTGRES_NETWORKS}")
rm -f "${WEB_NETWORKS}" "${POSTGRES_NETWORKS}"
[[ ${#COMMON_NETWORKS[@]} -eq 1 ]] || fail "Web/PostgreSQL common network is not unique"
NETWORK_NAME="${COMMON_NETWORKS[0]}"
WEB_IMAGE="$(sudo docker inspect -f '{{.Image}}' "${WEB_CONTAINER}")"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "production Web image is not content addressed"

sudo docker inspect "${POSTGRES_CONTAINER}" \
  | jq -er '
      .[0].Config.Env
      | map(capture("^(?<key>POSTGRES_(?:USER|PASSWORD|DB))=(?<value>.*)$"))
      | from_entries
      | (.POSTGRES_USER // "") as $username
      | (.POSTGRES_PASSWORD // "") as $password
      | (.POSTGRES_DB // "") as $database
      | if ([$username, $password, $database] | all(length > 0)) then
          "postgresql://\($username | @uri):\($password | @uri)@postgres:5432/\($database | @uri)"
        else
          error("PostgreSQL bootstrap identity is incomplete")
        end
    ' \
  | sudo tee "${SECRET_FILE}" >/dev/null
[[ "$(sudo wc -l < "${SECRET_FILE}" | tr -d ' ')" == "1" ]] \
  || fail "exactly one database connection must be materialized"
sudo chmod 600 "${SECRET_FILE}"
sudo chown 1000:1000 "${SECRET_FILE}"

sudo docker run --name "${RUNNER_NAME}" --rm \
  --network "${NETWORK_NAME}" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 512m \
  --cpus 1 \
  --user 1000:1000 \
  --mount "type=bind,src=${PROBE_SOURCE},dst=/app/m1-p0-read-only-preflight.mjs,readonly" \
  --mount "type=bind,src=${SECRET_FILE},dst=/run/secrets/database-connection,readonly" \
  "${WEB_IMAGE}" \
  node /app/m1-p0-read-only-preflight.mjs probe \
    --database-connection-file /run/secrets/database-connection \
    --source-commit "${SOURCE_COMMIT}" \
  > "${DATABASE_FACTS}"
chmod 600 "${DATABASE_FACTS}"
jq -e '
  .schemaVersion == "v2-m1-production-storage-database-read-only-facts.v1"
  and .transaction.readOnly == true
  and .transaction.insertedRows == 0
  and .transaction.updatedRows == 0
  and .transaction.deletedRows == 0
  and .boundary.productionDatabaseMutation == false
  and .boundary.productionServiceMutation == false
  and .boundary.migrationPerformed == false
' "${DATABASE_FACTS}" >/dev/null || fail "database read-only fact boundary failed"

sudo rm -f "${SECRET_FILE}"
SECRET_REMOVED=true
[[ -z "$(sudo docker ps -aq --filter "name=^/${RUNNER_NAME}$")" ]] \
  || fail "temporary P0 container remains"
CONTAINER_REMOVED=true

capture_docker_state "${AFTER_SNAPSHOT}"
AFTER_DIGEST="sha256:$(sha256sum "${AFTER_SNAPSHOT}" | awk '{print $1}')"
[[ "${AFTER_DIGEST}" == "${BEFORE_DIGEST}" ]] || fail "production Docker state drifted"

PRODUCTION_HEAD_AFTER="$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)"
if [[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]]; then
  WORKTREE_CLEAN_AFTER=true
else
  WORKTREE_CLEAN_AFTER=false
fi
[[ "${PRODUCTION_HEAD_AFTER}" == "${PRODUCTION_HEAD_BEFORE}" ]] \
  || fail "production HEAD changed during P0"

POSTGRES_DATA_SOURCE="$(sudo docker inspect "${POSTGRES_CONTAINER}" \
  | jq -er '.[0].Mounts[] | select(.Destination == "/var/lib/postgresql/data") | .Source')"
[[ -d "${POSTGRES_DATA_SOURCE}" ]] || fail "PostgreSQL data source is unavailable"
read -r DISK_TOTAL_BYTES DISK_USED_BYTES DISK_AVAILABLE_BYTES < <(
  sudo df -B1 --output=size,used,avail "${POSTGRES_DATA_SOURCE}" | awk 'NR == 2 {print $1, $2, $3}'
)
POSTGRES_DATA_BYTES="$(sudo du -sb "${POSTGRES_DATA_SOURCE}" | awk '{print $1}')"
POSTGRES_WAL_BYTES="$(sudo du -sb "${POSTGRES_DATA_SOURCE}/pg_wal" | awk '{print $1}')"
for value in DISK_TOTAL_BYTES DISK_USED_BYTES DISK_AVAILABLE_BYTES POSTGRES_DATA_BYTES POSTGRES_WAL_BYTES; do
  [[ "${!value}" =~ ^[1-9][0-9]*$ ]] || fail "${value} is invalid"
done

CAPTURED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -n \
  --arg schemaVersion "v2-m1-production-storage-host-read-only-facts.v1" \
  --arg capturedAt "${CAPTURED_AT}" \
  --arg sourceCommit "${SOURCE_COMMIT}" \
  --arg productionHeadBefore "${PRODUCTION_HEAD_BEFORE}" \
  --arg productionHeadAfter "${PRODUCTION_HEAD_AFTER}" \
  --argjson productionWorktreeCleanBefore "${WORKTREE_CLEAN_BEFORE}" \
  --argjson productionWorktreeCleanAfter "${WORKTREE_CLEAN_AFTER}" \
  --arg beforeDigest "${BEFORE_DIGEST}" \
  --arg afterDigest "${AFTER_DIGEST}" \
  --argjson runningBefore "$(jq '.containers | length' "${BEFORE_SNAPSHOT}")" \
  --argjson runningAfter "$(jq '.containers | length' "${AFTER_SNAPSHOT}")" \
  --argjson networksBefore "$(jq '.networks | length' "${BEFORE_SNAPSHOT}")" \
  --argjson networksAfter "$(jq '.networks | length' "${AFTER_SNAPSHOT}")" \
  --argjson volumesBefore "$(jq '.volumes | length' "${BEFORE_SNAPSHOT}")" \
  --argjson volumesAfter "$(jq '.volumes | length' "${AFTER_SNAPSHOT}")" \
  --argjson diskTotal "${DISK_TOTAL_BYTES}" \
  --argjson diskUsed "${DISK_USED_BYTES}" \
  --argjson diskAvailable "${DISK_AVAILABLE_BYTES}" \
  --argjson postgresData "${POSTGRES_DATA_BYTES}" \
  --argjson postgresWal "${POSTGRES_WAL_BYTES}" \
  --argjson secretRemoved "${SECRET_REMOVED}" \
  --argjson containerRemoved "${CONTAINER_REMOVED}" \
  '{
    schemaVersion: $schemaVersion,
    capturedAt: $capturedAt,
    sourceCommit: $sourceCommit,
    productionHeadBefore: $productionHeadBefore,
    productionHeadAfter: $productionHeadAfter,
    productionWorktreeCleanBefore: $productionWorktreeCleanBefore,
    productionWorktreeCleanAfter: $productionWorktreeCleanAfter,
    docker: {
      stateDigestBefore: $beforeDigest,
      stateDigestAfter: $afterDigest,
      runningContainerCountBefore: $runningBefore,
      runningContainerCountAfter: $runningAfter,
      networkCountBefore: $networksBefore,
      networkCountAfter: $networksAfter,
      volumeCountBefore: $volumesBefore,
      volumeCountAfter: $volumesAfter
    },
    disk: {
      totalBytes: $diskTotal,
      usedBytes: $diskUsed,
      availableBytes: $diskAvailable,
      postgresDataBytes: $postgresData,
      postgresWalBytes: $postgresWal
    },
    runnerBoundary: {
      temporaryContainerRemoved: $containerRemoved,
      secretFileRemoved: $secretRemoved,
      productionDatabaseMutation: false,
      productionRepositoryMutation: false,
      productionServiceMutation: false
    }
  }' > "${HOST_FACTS}"
chmod 600 "${HOST_FACTS}"

cat <<JSON
{"status":"PASS_READ_ONLY_FACT_CAPTURE","sourceCommit":"${SOURCE_COMMIT}","probeSha256":"${PROBE_SHA256}","databaseFactsSha256":"$(sha256sum "${DATABASE_FACTS}" | awk '{print $1}')","hostFactsSha256":"$(sha256sum "${HOST_FACTS}" | awk '{print $1}')","dockerStateDigest":"${AFTER_DIGEST}","productionHead":"${PRODUCTION_HEAD_AFTER}","productionDatabaseMutation":false,"productionServiceMutation":false,"productionRepositoryMutation":false,"migrationPerformed":false,"containsSecret":false}
JSON
