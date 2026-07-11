#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-plan}"
AUTHORIZED_HEAD="${AUTHORIZED_HEAD:-}"
BACKUP_ID="${BACKUP_ID:-}"
OPS_ROOT="${OPS_ROOT:-}"
PUBLIC_CERT="${PUBLIC_CERT:-}"
PRODUCTION_WORKTREE="${PRODUCTION_WORKTREE:-/home/ubuntu/apps/chuan-market-radar}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-chuan-market-radar-postgres-1}"
TRANSFER_ROOT="${TRANSFER_ROOT:-/home/ubuntu/market-radar-offhost-transfer}"
CONFIRM_BACKUP="${CONFIRM_BACKUP:-}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

validate_inputs() {
  [[ "${#AUTHORIZED_HEAD}" -eq 40 && "${AUTHORIZED_HEAD}" =~ ^[0-9a-f]+$ ]] \
    || fail "AUTHORIZED_HEAD must be a 40-character commit"
  [[ "${#BACKUP_ID}" -ge 8 && "${#BACKUP_ID}" -le 96 \
    && "${BACKUP_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9-]+$ ]] || fail "BACKUP_ID format is invalid"
  [[ "${OPS_ROOT}" == /var/lib/market-radar-ops/* ]] || fail "OPS_ROOT must be under /var/lib/market-radar-ops"
  [[ "${PUBLIC_CERT}" == /* ]] || fail "PUBLIC_CERT must be absolute"
}

print_plan() {
  cat <<JSON
{
  "schemaVersion": "market-radar-production-encrypted-backup-plan.v1",
  "mode": "plan",
  "backupId": "${BACKUP_ID}",
  "connectsToProductionDatabase": false,
  "executesMigration": false,
  "executesRestore": false,
  "deletesDockerResources": false,
  "changesApplicationRelease": false,
  "privateKeyAcceptedByProduction": false,
  "transferArtifacts": ["encrypted_backup", "manifest", "public_certificate"]
}
JSON
}

validate_inputs

if [[ "${MODE}" == "plan" ]]; then
  print_plan
  exit 0
fi

[[ "${MODE}" == "execute" ]] || fail "mode must be plan or execute"
[[ "${CONFIRM_BACKUP}" == "CREATE_ENCRYPTED_OFFHOST_BACKUP_ONLY" ]] \
  || fail "exact backup confirmation is required"
[[ "${EUID}" -eq 0 ]] || fail "execute must run as root"

for command in docker git openssl sha256sum curl awk stat du df realpath grep install chown date; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command missing: ${command}"
done

[[ -d "${PRODUCTION_WORKTREE}/.git" ]] || fail "production worktree is unavailable"
[[ -f "${PUBLIC_CERT}" ]] || fail "public certificate is unavailable"
openssl x509 -in "${PUBLIC_CERT}" -noout >/dev/null 2>&1 || fail "public certificate is invalid"

ACTUAL_HEAD="$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)"
[[ "${ACTUAL_HEAD}" == "${AUTHORIZED_HEAD}" ]] || fail "production HEAD mismatch"
[[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]] || fail "production worktree is dirty"
[[ "$(docker inspect -f '{{.State.Running}}' "${POSTGRES_CONTAINER}")" == "true" ]] \
  || fail "postgres container is not running"

OPS_REAL="$(realpath -m "${OPS_ROOT}")"
WORKTREE_REAL="$(realpath -m "${PRODUCTION_WORKTREE}")"
[[ "${OPS_REAL}" != "${WORKTREE_REAL}" && "${OPS_REAL}" != "${WORKTREE_REAL}/"* ]] \
  || fail "OPS_ROOT cannot be inside the production worktree"

umask 077
BACKUP_DIR="${OPS_ROOT}/backup"
EVIDENCE_DIR="${OPS_ROOT}/evidence"
TRANSFER_DIR="${TRANSFER_ROOT}/${BACKUP_ID}"
RAW_DUMP="${BACKUP_DIR}/${BACKUP_ID}.dump"
ENCRYPTED_BACKUP="${BACKUP_DIR}/${BACKUP_ID}.dump.cms"
ARCHIVE_LIST="${EVIDENCE_DIR}/${BACKUP_ID}.archive-list.txt"
MANIFEST="${EVIDENCE_DIR}/${BACKUP_ID}.manifest.json"

install -d -m 700 "${OPS_ROOT}" "${BACKUP_DIR}" "${EVIDENCE_DIR}" "${TRANSFER_DIR}"
[[ ! -e "${RAW_DUMP}" && ! -e "${ENCRYPTED_BACKUP}" ]] || fail "backup artifact already exists"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
read -r DISK_TOTAL_KIB DISK_USED_KIB DISK_AVAILABLE_KIB DISK_USE_PERCENT < <(
  df -Pk / | awk 'NR == 2 {gsub(/%/, "", $5); print $2, $3, $4, $5}'
)
DATA_BYTES="$(( $(docker exec "${POSTGRES_CONTAINER}" du -sk /var/lib/postgresql/data | awk '{print $1}') * 1024 ))"
WAL_BYTES="$(( $(docker exec "${POSTGRES_CONTAINER}" du -sk /var/lib/postgresql/data/pg_wal | awk '{print $1}') * 1024 ))"

docker exec "${POSTGRES_CONTAINER}" sh -eu -c \
  'test -n "$POSTGRES_USER"; test -n "$POSTGRES_DB"; exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "${RAW_DUMP}"
[[ -s "${RAW_DUMP}" ]] || fail "pg_dump produced an empty artifact"
chmod 600 "${RAW_DUMP}"

docker exec -i "${POSTGRES_CONTAINER}" pg_restore --list < "${RAW_DUMP}" > "${ARCHIVE_LIST}"
[[ -s "${ARCHIVE_LIST}" ]] || fail "pg_restore archive verification failed"
chmod 600 "${ARCHIVE_LIST}"

RAW_BYTES="$(stat -c %s "${RAW_DUMP}")"
RAW_SHA256="$(sha256sum "${RAW_DUMP}" | awk '{print $1}')"
CERT_SHA256="$(sha256sum "${PUBLIC_CERT}" | awk '{print $1}')"

openssl cms -encrypt -binary -aes-256-cbc -outform DER \
  -in "${RAW_DUMP}" -out "${ENCRYPTED_BACKUP}" "${PUBLIC_CERT}"
openssl cms -cmsout -inform DER -in "${ENCRYPTED_BACKUP}" -noout >/dev/null
chmod 600 "${ENCRYPTED_BACKUP}"

ENCRYPTED_BYTES="$(stat -c %s "${ENCRYPTED_BACKUP}")"
ENCRYPTED_SHA256="$(sha256sum "${ENCRYPTED_BACKUP}" | awk '{print $1}')"
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "${MANIFEST}" <<JSON
{
  "schemaVersion": "market-radar-encrypted-backup-manifest.v1",
  "backupId": "${BACKUP_ID}",
  "createdAt": "${STARTED_AT}",
  "completedAt": "${COMPLETED_AT}",
  "sourceHead": "${ACTUAL_HEAD}",
  "databaseDataBytes": ${DATA_BYTES},
  "walBytes": ${WAL_BYTES},
  "rawDumpBytes": ${RAW_BYTES},
  "rawDumpSha256": "${RAW_SHA256}",
  "encryptedBackupBytes": ${ENCRYPTED_BYTES},
  "encryptedBackupSha256": "${ENCRYPTED_SHA256}",
  "publicCertificateSha256": "${CERT_SHA256}",
  "archiveVerified": true,
  "encrypted": true,
  "offHost": false,
  "rawDumpRetainedRootOnly": true,
  "diskTotalBytes": $(( DISK_TOTAL_KIB * 1024 )),
  "diskUsedBytes": $(( DISK_USED_KIB * 1024 )),
  "diskAvailableBytes": $(( DISK_AVAILABLE_KIB * 1024 )),
  "diskUsePercent": ${DISK_USE_PERCENT},
  "candidateMigrationRun": false,
  "productionSchemaChanged": false,
  "productionRestoreRun": false
}
JSON
chmod 600 "${MANIFEST}"

cp "${ENCRYPTED_BACKUP}" "${TRANSFER_DIR}/"
cp "${MANIFEST}" "${TRANSFER_DIR}/"
cp "${PUBLIC_CERT}" "${TRANSFER_DIR}/public-cert.pem"
chmod 600 "${TRANSFER_DIR}/"*
chown -R ubuntu:ubuntu "${TRANSFER_DIR}"

[[ "$(git -C "${PRODUCTION_WORKTREE}" rev-parse HEAD)" == "${AUTHORIZED_HEAD}" ]] \
  || fail "production HEAD changed during backup"
[[ -z "$(git -C "${PRODUCTION_WORKTREE}" status --porcelain=v1)" ]] \
  || fail "production worktree changed during backup"
curl -fsSI http://127.0.0.1/api/health | grep -qi '^X-Chuan-Health-Level: ready' \
  || fail "production health is not ready after backup"

cat <<JSON
{
  "status": "pass",
  "phase": "production_encrypted_backup",
  "backupId": "${BACKUP_ID}",
  "encryptedBackupSha256": "${ENCRYPTED_SHA256}",
  "transferDirectory": "${TRANSFER_DIR}",
  "rawDumpRetainedRootOnly": true,
  "offHostTransferComplete": false,
  "candidateMigrationRun": false
}
JSON
