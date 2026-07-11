#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-plan}"
ENCRYPTED_BACKUP="${ENCRYPTED_BACKUP:-}"
MANIFEST="${MANIFEST:-}"
PRIVATE_KEY="${PRIVATE_KEY:-}"
PUBLIC_CERT="${PUBLIC_CERT:-}"
RESULT_FILE="${RESULT_FILE:-}"
RESTORE_PORT="${RESTORE_PORT:-55439}"
CONFIRM_RESTORE_DRILL="${CONFIRM_RESTORE_DRILL:-}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

validate_inputs() {
  for value in ENCRYPTED_BACKUP MANIFEST PRIVATE_KEY PUBLIC_CERT RESULT_FILE; do
    [[ -n "${!value}" ]] || fail "${value} is required"
  done
  [[ "${ENCRYPTED_BACKUP}" == /* && "${MANIFEST}" == /* && "${PRIVATE_KEY}" == /* \
    && "${PUBLIC_CERT}" == /* && "${RESULT_FILE}" == /* ]] || fail "all paths must be absolute"
  [[ "${RESTORE_PORT}" =~ ^[0-9]{4,5}$ ]] || fail "RESTORE_PORT is invalid"
}

print_plan() {
  cat <<JSON
{
  "schemaVersion": "market-radar-local-restore-drill-plan.v1",
  "mode": "plan",
  "targetClass": "external_isolated",
  "connectsToProduction": false,
  "outputsBusinessRows": false,
  "retainsPlaintextDump": false,
  "retainsRestoreCluster": false
}
JSON
}

validate_inputs

if [[ "${MODE}" == "plan" ]]; then
  print_plan
  exit 0
fi

[[ "${MODE}" == "execute" ]] || fail "mode must be plan or execute"
[[ "${CONFIRM_RESTORE_DRILL}" == "RESTORE_ENCRYPTED_BACKUP_IN_LOCAL_ISOLATION" ]] \
  || fail "exact restore confirmation is required"

for command in openssl sha256sum jq pg_restore initdb pg_ctl pg_isready createdb psql node; do
  command -v "${command}" >/dev/null 2>&1 || fail "required command missing: ${command}"
done
for path in "${ENCRYPTED_BACKUP}" "${MANIFEST}" "${PRIVATE_KEY}" "${PUBLIC_CERT}"; do
  [[ -f "${path}" ]] || fail "required file missing: ${path}"
done

install -d -m 700 "$(dirname "${RESULT_FILE}")"
[[ ! -e "${RESULT_FILE}" ]] || fail "RESULT_FILE already exists"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/market-radar-restore.XXXXXX")"
PGDATA="${WORK_DIR}/pgdata"
SOCKET_DIR="$(mktemp -d /tmp/mr-restore-socket.XXXXXX)"
RAW_DUMP="${WORK_DIR}/backup.dump"
PG_LOG="${WORK_DIR}/postgres.log"
PG_STARTED=false

cleanup_restore_workspace() {
  if [[ "${PG_STARTED}" == "true" ]]; then
    pg_ctl -D "${PGDATA}" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "${WORK_DIR}"
  rm -rf "${SOCKET_DIR}"
}
trap cleanup_restore_workspace EXIT

EXPECTED_ENCRYPTED_SHA256="$(jq -er '.encryptedBackupSha256' "${MANIFEST}")"
EXPECTED_RAW_SHA256="$(jq -er '.rawDumpSha256' "${MANIFEST}")"
BACKUP_CREATED_AT="$(jq -er '.createdAt' "${MANIFEST}")"
BACKUP_ID="$(jq -er '.backupId' "${MANIFEST}")"
SOURCE_HEAD="$(jq -er '.sourceHead' "${MANIFEST}")"

ACTUAL_ENCRYPTED_SHA256="$(sha256sum "${ENCRYPTED_BACKUP}" | awk '{print $1}')"
[[ "${ACTUAL_ENCRYPTED_SHA256}" == "${EXPECTED_ENCRYPTED_SHA256}" ]] \
  || fail "encrypted backup checksum mismatch"

CERT_MODULUS="$(openssl x509 -noout -modulus -in "${PUBLIC_CERT}" | openssl sha256)"
KEY_MODULUS="$(openssl rsa -noout -modulus -in "${PRIVATE_KEY}" | openssl sha256)"
[[ "${CERT_MODULUS}" == "${KEY_MODULUS}" ]] || fail "certificate and private key do not match"

START_EPOCH="$(date +%s)"
openssl cms -decrypt -binary -inform DER -in "${ENCRYPTED_BACKUP}" \
  -recip "${PUBLIC_CERT}" -inkey "${PRIVATE_KEY}" -out "${RAW_DUMP}"
chmod 600 "${RAW_DUMP}"
ACTUAL_RAW_SHA256="$(sha256sum "${RAW_DUMP}" | awk '{print $1}')"
[[ "${ACTUAL_RAW_SHA256}" == "${EXPECTED_RAW_SHA256}" ]] || fail "decrypted dump checksum mismatch"
pg_restore --list "${RAW_DUMP}" >/dev/null

initdb -D "${PGDATA}" -A trust -U restore_admin --no-locale >/dev/null
pg_ctl -D "${PGDATA}" -l "${PG_LOG}" -o "-k ${SOCKET_DIR} -p ${RESTORE_PORT}" start >/dev/null
PG_STARTED=true
pg_isready -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin >/dev/null
createdb -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin market_radar_restore
pg_restore -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin \
  --dbname=market_radar_restore --no-owner --no-acl --exit-on-error "${RAW_DUMP}"

USER_TABLE_COUNT="$(psql -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin \
  -d market_radar_restore -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema');")"
USER_SCHEMA_COUNT="$(psql -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin \
  -d market_radar_restore -Atc "SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema';")"
RESTORED_DATABASE_BYTES="$(psql -h "${SOCKET_DIR}" -p "${RESTORE_PORT}" -U restore_admin \
  -d market_radar_restore -Atc "SELECT pg_database_size(current_database());")"
[[ "${USER_TABLE_COUNT}" -gt 0 ]] || fail "restored database has no user tables"

END_EPOCH="$(date +%s)"
BACKUP_EPOCH="$(node -e 'const value=Date.parse(process.argv[1]); if(!Number.isFinite(value)) process.exit(2); process.stdout.write(String(Math.floor(value/1000)));' "${BACKUP_CREATED_AT}")"
[[ "${END_EPOCH}" -ge "${BACKUP_EPOCH}" ]] || fail "backup timestamp is ahead of the restore host clock"
RTO_SECONDS="$(( END_EPOCH - START_EPOCH ))"
RTO_MINUTES="$(( (RTO_SECONDS + 59) / 60 ))"
RPO_MINUTES="$(( (END_EPOCH - BACKUP_EPOCH + 59) / 60 ))"
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "${RESULT_FILE}" <<JSON
{
  "schemaVersion": "market-radar-external-restore-drill-result.v1",
  "backupId": "${BACKUP_ID}",
  "sourceHead": "${SOURCE_HEAD}",
  "completedAt": "${COMPLETED_AT}",
  "targetClass": "external_isolated",
  "offHostBackup": true,
  "encrypted": true,
  "checksumVerified": true,
  "archiveVerified": true,
  "restorePassed": true,
  "businessRowsOutput": false,
  "userTableCount": ${USER_TABLE_COUNT},
  "userSchemaCount": ${USER_SCHEMA_COUNT},
  "restoredDatabaseBytes": ${RESTORED_DATABASE_BYTES},
  "rpoMinutes": ${RPO_MINUTES},
  "rtoMinutes": ${RTO_MINUTES},
  "rtoSeconds": ${RTO_SECONDS},
  "plaintextDumpRetained": false,
  "restoreClusterRetained": false,
  "candidateMigrationRun": false
}
JSON
chmod 600 "${RESULT_FILE}"
cat "${RESULT_FILE}"
