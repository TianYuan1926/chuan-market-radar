#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST_OVERRIDE:-${SOURCE_ROOT}/transport-manifest.json}"
MODE="${CANONICAL_ROLLBACK_ADD_SCHEMA_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANONICAL_ROLLBACK_ADD_SCHEMA:-false}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-canonical-rollback-add-schema/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-canonical-rollback-add-schema/runner.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "private_file_invalid:$(basename "$1")"
  local mode
  mode="$(stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "private_file_permissions_invalid:$(basename "$1")"
}

if [[ "${MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  printf '%s\n' 'DRY-RUN: no production database, service, source, environment or data changed.'
  exit 0
fi
[[ "${MODE}" == "production_add_schema" ]] || fail mode_invalid
for command_name in docker git jq realpath sha256sum curl; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "command_missing:${command_name}"
done
private_file "${REQUEST_FILE}"
private_file "${TRANSPORT_MANIFEST}"

PACKAGE_ID="$(jq -r '.packageId' "${REQUEST_FILE}")"
ROOT_DIR="$(jq -r '.productionRoot' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
MIGRATION_URL_FILE="$(jq -r '.migrationUrlFile' "${REQUEST_FILE}")"
WEB_IMAGE="$(jq -r '.webImageId' "${REQUEST_FILE}")"
PRODUCTION_COMMIT="$(jq -r '.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.productionTree' "${REQUEST_FILE}")"

[[ "${PACKAGE_ID}" == "WP-G0.2-CANONICAL-ROLLBACK-SAFETY-PRODUCTION-ADD-SCHEMA" \
  && "${ROOT_DIR}" == "${PRODUCTION_ROOT}" \
  && "${TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
  || fail request_identity_invalid
case "${OPS_ROOT}/" in
  /home/ubuntu/.cache/market-radar-ops/canonical-rollback-add-schema-ops/*/) REHEARSAL=false ;;
  /tmp/wp_g0_2_rehearsal_canonical_rollback_add_schema_*/ops/) REHEARSAL=true ;;
  *) fail ops_root_invalid ;;
esac
[[ "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-rollback-add-schema-* \
  || "${REHEARSAL}" == "true" ]] || fail evidence_directory_invalid
private_file "${MIGRATION_URL_FILE}"

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi
WEB_CONTAINER="$(${DOCKER[@]} ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
[[ -n "${WEB_CONTAINER}" && "$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')" == "${WEB_IMAGE}" ]] \
  || fail web_identity_mismatch
NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${NETWORK}" ]] || fail network_missing

run_node() {
  local network="$1"; shift
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=/app/packet,readonly"
    --mount "type=bind,src=${MIGRATION_URL_FILE},dst=${MIGRATION_URL_FILE},readonly"
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  if [[ "${REHEARSAL}" != "true" ]]; then
    mounts+=(--mount "type=bind,src=${TRUST_ROOT},dst=${TRUST_ROOT}")
  fi
  "${DOCKER[@]}" run --rm --network "${network}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}

database_runner() {
  local command="$1"
  run_node "${NETWORK}" "/app/packet/${RUNNER#${SOURCE_ROOT}/}" "${command}" \
    --request /app/packet/approval-request.json \
    --migration-url-file "${MIGRATION_URL_FILE}" --root /app/packet --production true
}
lease_event() {
  local action="$1"; shift
  [[ "${REHEARSAL}" == "true" ]] && return 0
  run_node none "/app/packet/${LEASE_CLI#${SOURCE_ROOT}/}" "${action}" \
    --trust-root "${TRUST_ROOT}" --request /app/packet/approval-request.json \
    --execution "${EVIDENCE_DIRECTORY}/lease-execution.json" "$@" \
    | tee -a "${EVIDENCE_DIRECTORY}/lease-events.jsonl" >/dev/null
}
health_ready() {
  curl -fsS http://127.0.0.1/api/health | jq -e '
    .ok == true and .health.level == "ready"
    and .health.persistence.databaseStatus == "ready"
    and (.health.scan.freshness == "fresh" or .health.scan.freshness == "aging")
    and ([.health.runtimeProbes.workers[]?
      | select((.name // .key) == "scanner-worker" and .status == "healthy")] | length == 1)
  ' >/dev/null
}
container_identity() {
  "${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' | LC_ALL=C sort
}
cleanup_temporary() {
  [[ "${REHEARSAL}" == "true" ]] && return 0
  [[ "${SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-rollback-add-schema-* \
    && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/canonical-rollback-add-schema-ops/* \
    && "${EVIDENCE_DIRECTORY}" != "${SOURCE_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${OPS_ROOT}" ]] || fail cleanup_boundary_invalid
  rm -rf -- "${OPS_ROOT}" "${SOURCE_ROOT}"
}

mkdir -p "${OPS_ROOT}" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${EVIDENCE_DIRECTORY}"
[[ ! -L "${ROOT_DIR}" && "$(realpath "${ROOT_DIR}")" == "${ROOT_DIR}" \
  && -z "$(git -C "${ROOT_DIR}" status --porcelain=v1 --untracked-files=all)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}" ]] \
  || fail production_worktree_identity_invalid
[[ "$(sha_file "${ROOT_DIR}/docker-compose.yml")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
  || fail compose_checksum_mismatch
container_identity > "${EVIDENCE_DIRECTORY}/containers-before.txt"
health_ready || fail health_before_not_ready
curl -fsS http://127.0.0.1/api/health > "${EVIDENCE_DIRECTORY}/health-before.json"
run_node none "/app/packet/${VALIDATOR#${SOURCE_ROOT}/}" validate-request \
  --manifest /app/packet/transport-manifest.json --request /app/packet/approval-request.json \
  --bundle-sha256 "$(jq -r '.bundleSha256' "${REQUEST_FILE}")" --production true \
  > "${EVIDENCE_DIRECTORY}/request-validation.json"

if [[ "${REHEARSAL}" != "true" ]]; then
  lease_event acquire --owner-id "canonical-rollback-add-schema-$(date +%s)"
  lease_event checkpoint --checkpoint preflight
fi
database_runner preflight > "${EVIDENCE_DIRECTORY}/database-preflight.json"
jq -e '.status == "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_PREFLIGHT" and .migrationRows == 9' \
  "${EVIDENCE_DIRECTORY}/database-preflight.json" >/dev/null || fail database_preflight_invalid
container_identity > "${EVIDENCE_DIRECTORY}/containers-pre-execute.txt"
cmp -s "${EVIDENCE_DIRECTORY}/containers-before.txt" "${EVIDENCE_DIRECTORY}/containers-pre-execute.txt" \
  || fail container_identity_changed_before_execute
health_ready || fail health_pre_execute_not_ready

if [[ "${REHEARSAL}" != "true" ]]; then
  lease_event consume
  lease_event checkpoint --checkpoint immediately_before_schema_transaction
fi
database_runner execute > "${EVIDENCE_DIRECTORY}/database-execute.json"
jq -e '.status == "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_EXECUTE"
  and .applied == ["010_candidate_canonical_rollback_safety"]
  and .businessDataChanged == false' "${EVIDENCE_DIRECTORY}/database-execute.json" >/dev/null \
  || fail database_execute_invalid
database_runner verify > "${EVIDENCE_DIRECTORY}/database-verify.json"
jq -e '.status == "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_VERIFY" and .migrationRows == 10
  and .functionOwner == "candidate_migration_role" and .leastPrivilege == true' \
  "${EVIDENCE_DIRECTORY}/database-verify.json" >/dev/null || fail database_verify_invalid
container_identity > "${EVIDENCE_DIRECTORY}/containers-after.txt"
cmp -s "${EVIDENCE_DIRECTORY}/containers-before.txt" "${EVIDENCE_DIRECTORY}/containers-after.txt" \
  || fail non_target_container_identity_changed
health_ready || fail health_after_not_ready
curl -fsS http://127.0.0.1/api/health > "${EVIDENCE_DIRECTORY}/health-after.json"
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain=v1 --untracked-files=all)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" ]] \
  || fail production_worktree_changed
if grep -ERIq 'postgres(ql)?://|DATABASE_URL=|PASSWORD=|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' \
  "${EVIDENCE_DIRECTORY}"; then
  fail evidence_secret_pattern_detected
fi
if [[ "${REHEARSAL}" != "true" ]]; then
  lease_event release --outcome PASS
fi
jq -n --arg packageId "${PACKAGE_ID}" --arg migration "010_candidate_canonical_rollback_safety" \
  '{status:"PASS_PRODUCTION_CANONICAL_ROLLBACK_SAFETY_ADD_SCHEMA",packageId:$packageId,
    migration:$migration,productionSchemaRows:10,serviceMutation:false,sourceMutation:false,
    environmentMutation:false,businessDataMutation:false,secretsPrinted:false}' \
  | tee "${EVIDENCE_DIRECTORY}/result.json"
cleanup_temporary
