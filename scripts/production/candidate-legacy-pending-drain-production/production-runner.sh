#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
RUNNER_MODE="${CANDIDATE_PENDING_DRAIN_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_PENDING_DRAIN:-false}"
DB_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-legacy-pending-drain-production/db-runner.mjs"
BUNDLE_RUNNER="${SOURCE_ROOT}/scripts/production/candidate-legacy-pending-drain-production/bundle.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
PACKAGE_ID="WP-G0.2-CYCLE-6-LEGACY-PENDING-DRAIN-PRODUCTION"
readonly PREFLIGHT_CONTRACT_FILTER='.status == "PASS_LEGACY_PENDING_WITH_EVENT_MIRROR_DRAIN_PREFLIGHT" and .pending == $legacyPending and .outboxTotal == $outbox and .sourceEpoch == $sourceEpoch and .drainEpoch == $drainEpoch and .finalFrozenEpoch == $finalEpoch and .candidateEventPendingBefore == $candidateEventPending'
readonly DRAIN_OPEN_CONTRACT_FILTER='.status == "PASS_DRAIN_EPOCH_OPEN" and .control.phase == "shadow_capture" and .control.epoch == $drainEpoch and .control.write_frozen == false'
readonly DRAIN_VERIFY_CONTRACT_FILTER='.status == "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN" and .drained == $legacyPending and .legacyCompleted == $finalLegacyCompleted and .candidateEventPending == $finalCandidateEventPending and .outboxTotal == $finalOutbox and .finalEpoch == $finalEpoch and .legacyUnresolved == 0'

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
hash_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
file_uid() { stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"; }
assert_private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "secure_file_invalid:$(basename "$1")"
  local mode
  mode="$(file_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "$1")"
}
assert_regular_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "regular_file_invalid:$(basename "$1")"
}
match_file_identity() {
  local reference="$1" target="$2" group
  chmod "$(file_mode "${reference}")" "${target}"
  group="$(stat -c '%g' "${reference}" 2>/dev/null || stat -f '%g' "${reference}")"
  chown "$(file_uid "${reference}"):${group}" "${target}" 2>/dev/null || true
}

printf 'package=%s\nmode=%s\nservice_allowlist=web,scanner-worker,candidate-shadow-worker\n' \
  "${PACKAGE_ID}" "${RUNNER_MODE}"
if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  printf 'DRY-RUN: no production Git, environment, database, Redis or service mutation was performed.\n'
  exit 0
fi
[[ "${RUNNER_MODE}" == "production_drain" ]] || fail runner_mode_invalid
for command_name in curl docker git jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done
assert_private_file "${REQUEST_FILE}"

ROOT_DIR="$(jq -r '.productionRoot' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
BASE_ENV_FILE="${ROOT_DIR}/.env"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
DATABASE_URL_FILE="${SECURE_ROOT}/migration-admin.url"
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"

[[ "${ROOT_DIR}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-pending-drain/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/pending-drain-ops/* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-pending-drain-* \
  && "${TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
  || fail approved_path_boundary_invalid
for file in "${BASE_ENV_FILE}" "${ENV_FILE}" "${DATABASE_URL_FILE}"; do
  assert_private_file "${file}"
done
assert_regular_file "${COMPOSE_FILE}"
sudo -n test -f "${IDENTITY_WRAPPER}" && ! sudo -n test -L "${IDENTITY_WRAPPER}" \
  || fail identity_wrapper_invalid
sudo -n test -f "${IDENTITY_OVERRIDE}" && ! sudo -n test -L "${IDENTITY_OVERRIDE}" \
  || fail identity_override_invalid
[[ "$(sudo -n stat -c '%a:%u' "${IDENTITY_WRAPPER}")" == "700:0" \
  && "$(sudo -n stat -c '%a:%u' "${IDENTITY_OVERRIDE}")" == "600:0" \
  && "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" == "$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
  && "$(sudo -n sha256sum "${IDENTITY_OVERRIDE}" | awk '{print $1}')" == "$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" ]] \
  || fail identity_binding_mismatch

mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
DOCKER=(sudo -n docker)
COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
PROFILE_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
BASELINE_COMMIT="$(jq -r '.baselineCommit' "${REQUEST_FILE}")"
BASELINE_TREE="$(jq -r '.baselineTree' "${REQUEST_FILE}")"
TARGET_COMMIT="$(jq -r '.targetCommit' "${REQUEST_FILE}")"
TARGET_TREE="$(jq -r '.targetTree' "${REQUEST_FILE}")"
BASELINE_WEB_IMAGE="$(jq -r '.baselineWebImageId' "${REQUEST_FILE}")"
BASELINE_SCANNER_IMAGE="$(jq -r '.baselineScannerImageId' "${REQUEST_FILE}")"
ROLLBACK_WEB_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
ROLLBACK_SCANNER_REF="$(jq -r '.rollbackScannerImageRef' "${REQUEST_FILE}")"
SOURCE_EPOCH="$(jq -r '.sourceEpoch' "${REQUEST_FILE}")"
DRAIN_EPOCH="$(jq -r '.drainEpoch' "${REQUEST_FILE}")"
FINAL_EPOCH="$(jq -r '.finalEpoch' "${REQUEST_FILE}")"
EXPECTED_OUTBOX="$(jq -r '.expectedCounts.outbox' "${REQUEST_FILE}")"
EXPECTED_EVENTS="$(jq -r '.expectedCounts.events' "${REQUEST_FILE}")"
EXPECTED_LEGACY_COMPLETED="$(jq -r '.expectedCounts.legacyCompleted' "${REQUEST_FILE}")"
EXPECTED_LEGACY_PENDING="$(jq -r '.expectedCounts.legacyPending' "${REQUEST_FILE}")"
EXPECTED_CANDIDATE_EVENT_PENDING="$(jq -r '.expectedCounts.candidateEventPending' "${REQUEST_FILE}")"
FINAL_LEGACY_COMPLETED=$((EXPECTED_LEGACY_COMPLETED + EXPECTED_LEGACY_PENDING))
FINAL_EVENTS=$((EXPECTED_EVENTS + EXPECTED_LEGACY_PENDING))
FINAL_CANDIDATE_EVENT_PENDING=$((EXPECTED_CANDIDATE_EVENT_PENDING + EXPECTED_LEGACY_PENDING))
FINAL_OUTBOX=$((EXPECTED_OUTBOX + EXPECTED_LEGACY_PENDING))

[[ -d "${ROOT_DIR}/.git" && -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${BASELINE_COMMIT}" \
  && "$(git -C "${ROOT_DIR}" rev-parse 'HEAD^{tree}')" == "${BASELINE_TREE}" ]] \
  || fail production_git_baseline_invalid
[[ "$(hash_file "${BASE_ENV_FILE}")" == "$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${ENV_FILE}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" \
  && "$(hash_file "${COMPOSE_FILE}")" == "$(jq -r '.baselineComposeSha256' "${REQUEST_FILE}")" ]] \
  || fail production_stable_input_checksum_mismatch

WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
SCANNER_CONTAINER="$("${COMPOSE[@]}" ps -q scanner-worker)"
WORKER_CONTAINER="$("${PROFILE_COMPOSE[@]}" ps -q candidate-shadow-worker 2>/dev/null || true)"
[[ -n "${WEB_CONTAINER}" && -n "${SCANNER_CONTAINER}" && -z "${WORKER_CONTAINER}" ]] \
  || fail production_service_baseline_invalid
[[ "$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')" == "${BASELINE_WEB_IMAGE}" \
  && "$(${DOCKER[@]} inspect "${SCANNER_CONTAINER}" --format '{{.Image}}')" == "${BASELINE_SCANNER_IMAGE}" ]] \
  || fail production_image_baseline_invalid
BASELINE_SCAN_COMPLETED_AT="$(curl -fsS http://127.0.0.1/api/health \
  | jq -r '.health.scan.completedAt // empty')"
[[ -n "${BASELINE_SCAN_COMPLETED_AT}" ]] || fail baseline_scan_completion_missing

non_target_containers() {
  ${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
    --format '{{.Label "com.docker.compose.service"}}={{.ID}}={{.Image}}' \
    | grep -Ev '^(web|scanner-worker|candidate-shadow-worker)=' | LC_ALL=C sort
}
NON_TARGET_BEFORE="$(non_target_containers)"
NETWORK_NAME="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${NETWORK_NAME}" ]] || fail production_network_missing

run_packet_node() {
  local image="$1"; shift
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
    --mount "type=bind,src=${TRUST_ROOT},dst=${TRUST_ROOT}" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}" \
    --entrypoint node "${image}" "$@"
}
render_drain_environment() {
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
    --mount "type=bind,src=${ENV_FILE},dst=/runtime/env.production,readonly" \
    --mount "type=bind,src=${REQUEST_FILE},dst=/request/approval-request.json,readonly" \
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}" \
    --entrypoint node "${BASELINE_WEB_IMAGE}" \
    "${BUNDLE_RUNNER}" render-env \
      --source /runtime/env.production --request /request/approval-request.json \
      --output "${TARGET_ENV}" >/dev/null
}
database_runner() {
  local command="$1" image="$2"; shift 2
  ${DOCKER[@]} run --rm --network "${NETWORK_NAME}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${SOURCE_ROOT},dst=/packet,readonly" \
    --mount "type=bind,src=${REQUEST_FILE},dst=/request/approval-request.json,readonly" \
    --mount "type=bind,src=${DATABASE_URL_FILE},dst=/secure/migration-admin.url,readonly" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --entrypoint node "${image}" \
    /packet/scripts/production/candidate-legacy-pending-drain-production/db-runner.mjs "${command}" \
      --request /request/approval-request.json --database-url-file /secure/migration-admin.url \
      --scanner-paused true --candidate-worker-absent "$([[ "${command}" == "snapshot" ]] && echo false || echo true)" \
      --source-write-reachable false "$@"
}
lease_event() {
  local command="$1"; shift
  run_packet_node "${BASELINE_WEB_IMAGE}" "${LEASE_CLI}" "${command}" \
    --trust-root "${TRUST_ROOT}" --request "${REQUEST_FILE}" \
    --execution "${EVIDENCE_DIRECTORY}/lease-execution.json" "$@" \
    | tee -a "${EVIDENCE_DIRECTORY}/lease-events.jsonl" >/dev/null
}

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
TARGET_ENV="${OPS_ROOT}/backups/env.production.drain-only"
BEFORE_SNAPSHOT="${EVIDENCE_DIRECTORY}/before-snapshot.json"
TARGET_WEB_REF="market-radar-transient/wp-g0-2-pending-drain:web-${TARGET_COMMIT:0:12}"
TARGET_WORKER_REF="market-radar-transient/wp-g0-2-pending-drain:worker-${TARGET_COMMIT:0:12}"
LEASE_ACQUIRED=false
LEASE_RELEASED=false
SCANNER_STOPPED=false
CONTROL_OPENED=false
ENV_SWITCHED=false
GIT_SWITCHED=false
TARGET_WEB_IMAGE=""
TARGET_WORKER_IMAGE=""
SUCCEEDED=false
MUTATED=false
FAILURE_PHASE="pre-mutation"

wait_baseline_health() {
  local deadline=$((SECONDS + 1200))
  while true; do
    if ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
      STRICT_SCAN_FRESHNESS=true REQUIRE_IDENTITY_WRAPPER=true \
      IDENTITY_WRAPPER="${IDENTITY_WRAPPER}" \
      IDENTITY_WRAPPER_SHA256="$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
      IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE}" \
      IDENTITY_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" \
      bash "${SOURCE_ROOT}/scripts/verify/production-check.sh" >/dev/null 2>&1; then
      local completed_at
      completed_at="$(curl -fsS http://127.0.0.1/api/health \
        | jq -r '.health.scan.completedAt // empty' 2>/dev/null || true)"
      if [[ -n "${completed_at}" && "${completed_at}" != "${BASELINE_SCAN_COMPLETED_AT}" ]]; then
        return 0
      fi
    fi
    (( SECONDS < deadline )) || return 1
    sleep 10
  done
}

wait_for_scan_lock_absent() {
  local deadline=$((SECONDS + 660))
  local scan_locks
  while true; do
    scan_locks="$(${DOCKER[@]} exec "${REDIS_CONTAINER}" redis-cli --scan --pattern 'scan:lock:*')"
    [[ -n "${scan_locks}" ]] || return 0
    (( SECONDS < deadline )) || return 1
    sleep 2
  done
}

rollback_result_status() {
  local rollback_ok="$1" mutated="$2"
  if [[ "${rollback_ok}" != "true" ]]; then
    printf 'ROLLBACK_INCOMPLETE_LEASE_RETAINED\n'
  elif [[ "${mutated}" == "true" ]]; then
    printf 'ROLLBACK_PASS\n'
  else
    printf 'SAFE_STOP_PRE_MUTATION\n'
  fi
}

restore_baseline() {
  local restore_ok=true restored_web restored_scanner
  "${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
  "${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
  if [[ "${CONTROL_OPENED}" == "true" ]]; then
    database_runner rollback "${TARGET_WEB_IMAGE:-${BASELINE_WEB_IMAGE}}" \
      > "${EVIDENCE_DIRECTORY}/control-rollback-redacted.json" || restore_ok=false
    CONTROL_OPENED=false
  fi
  if [[ -f "${ENV_BACKUP}" ]]; then
    match_file_identity "${ENV_FILE}" "${ENV_BACKUP}" || restore_ok=false
    mv -f "${ENV_BACKUP}" "${ENV_FILE}" || restore_ok=false
    ENV_SWITCHED=false
  fi
  ${DOCKER[@]} tag "${ROLLBACK_WEB_REF}" chuan-market-radar-web:latest || restore_ok=false
  ${DOCKER[@]} tag "${ROLLBACK_SCANNER_REF}" chuan-market-radar-scanner-worker:latest || restore_ok=false
  git -C "${ROOT_DIR}" checkout --detach "${BASELINE_COMMIT}" >/dev/null 2>&1 || restore_ok=false
  GIT_SWITCHED=false
  "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || restore_ok=false
  "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate scanner-worker || restore_ok=false
  SCANNER_STOPPED=false
  wait_baseline_health || restore_ok=false
  restored_web="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
  restored_scanner="$("${COMPOSE[@]}" ps -q scanner-worker 2>/dev/null || true)"
  [[ -n "${restored_web}" && -n "${restored_scanner}" \
    && "$(${DOCKER[@]} inspect "${restored_web}" --format '{{.Image}}' 2>/dev/null || true)" == "${BASELINE_WEB_IMAGE}" \
    && "$(${DOCKER[@]} inspect "${restored_scanner}" --format '{{.Image}}' 2>/dev/null || true)" == "${BASELINE_SCANNER_IMAGE}" \
    && -z "$("${PROFILE_COMPOSE[@]}" ps -q candidate-shadow-worker 2>/dev/null || true)" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)" == "${BASELINE_COMMIT}" \
    && "$(git -C "${ROOT_DIR}" rev-parse 'HEAD^{tree}' 2>/dev/null || true)" == "${BASELINE_TREE}" \
    && -z "$(git -C "${ROOT_DIR}" status --porcelain 2>/dev/null || true)" \
    && "$(hash_file "${ENV_FILE}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" \
    && "$(hash_file "${COMPOSE_FILE}")" == "$(jq -r '.baselineComposeSha256' "${REQUEST_FILE}")" \
    && "$(non_target_containers)" == "${NON_TARGET_BEFORE}" ]] || restore_ok=false
  [[ "${restore_ok}" == "true" ]]
}

rollback_on_failure() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "${exit_code}" -eq 0 || "${SUCCEEDED}" == "true" ]]; then exit "${exit_code}"; fi
  local rollback_ok=true rollback_status lease_retained=false
  [[ "${LEASE_ACQUIRED}" != "true" ]] || lease_event safety-checkpoint --checkpoint rollback || true
  if [[ "${MUTATED}" == "true" ]]; then
    restore_baseline || rollback_ok=false
  fi
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    if [[ "${rollback_ok}" == "true" ]]; then
      if lease_event release --outcome "$([[ "${MUTATED}" == "true" ]] \
        && echo ROLLBACK_PASS || echo SAFE_STOP_PRE_MUTATION)"; then
        LEASE_RELEASED=true
      else
        rollback_ok=false
      fi
    fi
  fi
  rollback_status="$(rollback_result_status "${rollback_ok}" "${MUTATED}")"
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    lease_retained=true
  fi
  jq -n --arg status "${rollback_status}" \
    --arg failurePhase "${FAILURE_PHASE}" --arg baselineCommit "${BASELINE_COMMIT}" \
    --argjson leaseReleased "${LEASE_RELEASED}" --argjson leaseRetained "${lease_retained}" \
    '{status:$status,failurePhase:$failurePhase,baselineCommit:$baselineCommit,
      leaseReleased:$leaseReleased,leaseRetained:$leaseRetained,productionDrainPass:false}' \
    > "${EVIDENCE_DIRECTORY}/rollback-result.json" || true
  if [[ "${rollback_ok}" != "true" ]]; then
    printf 'P0_ROLLBACK_INCOMPLETE_LEASE_RETAINED\n' >&2
  elif [[ "${MUTATED}" == "true" ]]; then
    printf 'ROLLBACK_PASS\n' >&2
  else
    printf 'SAFE_STOP_PRE_MUTATION\n' >&2
  fi
  exit "${exit_code}"
}
trap rollback_on_failure EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

lease_event acquire --owner-id "${PACKAGE_ID}:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre-mutation
lease_event consume
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
${DOCKER[@]} tag "${BASELINE_WEB_IMAGE}" "${ROLLBACK_WEB_REF}"
${DOCKER[@]} tag "${BASELINE_SCANNER_IMAGE}" "${ROLLBACK_SCANNER_REF}"
[[ "$(${DOCKER[@]} image inspect "${ROLLBACK_WEB_REF}" --format '{{.Id}}')" == "${BASELINE_WEB_IMAGE}" \
  && "$(${DOCKER[@]} image inspect "${ROLLBACK_SCANNER_REF}" --format '{{.Id}}')" == "${BASELINE_SCANNER_IMAGE}" ]] \
  || fail rollback_image_retention_failed

FAILURE_PHASE="target-checkout-build"
MUTATED=true
git -C "${ROOT_DIR}" fetch --no-tags origin "${TARGET_COMMIT}"
[[ "$(git -C "${ROOT_DIR}" rev-parse FETCH_HEAD)" == "${TARGET_COMMIT}" ]] || fail fetched_commit_mismatch
git -C "${ROOT_DIR}" checkout --detach "${TARGET_COMMIT}"
GIT_SWITCHED=true
[[ "$(git -C "${ROOT_DIR}" rev-parse 'HEAD^{tree}')" == "${TARGET_TREE}" \
  && -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && "$(hash_file "${COMPOSE_FILE}")" == "$(jq -r '.targetComposeSha256' "${REQUEST_FILE}")" ]] \
  || fail target_checkout_invalid
"${PROFILE_COMPOSE[@]}" build web candidate-shadow-worker
TARGET_WEB_IMAGE="$(${DOCKER[@]} image inspect chuan-market-radar-web:latest --format '{{.Id}}')"
TARGET_WORKER_IMAGE="$(${DOCKER[@]} image inspect chuan-market-radar-candidate-shadow-worker:latest --format '{{.Id}}')"
${DOCKER[@]} tag "${TARGET_WEB_IMAGE}" "${TARGET_WEB_REF}"
${DOCKER[@]} tag "${TARGET_WORKER_IMAGE}" "${TARGET_WORKER_REF}"
[[ "${TARGET_WEB_IMAGE}" != "${BASELINE_WEB_IMAGE}" && "${TARGET_WORKER_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail target_image_identity_invalid

FAILURE_PHASE="scanner-pause"
"${COMPOSE[@]}" stop scanner-worker
SCANNER_STOPPED=true
sleep 2
REDIS_CONTAINER="$("${COMPOSE[@]}" ps -q redis)"
[[ -n "${REDIS_CONTAINER}" ]] || fail redis_container_missing
wait_for_scan_lock_absent || fail scanner_lock_still_present_after_wait

FAILURE_PHASE="database-preflight"
database_runner preflight "${TARGET_WEB_IMAGE}" \
  > "${EVIDENCE_DIRECTORY}/database-preflight-redacted.json"
jq -e --argjson legacyPending "${EXPECTED_LEGACY_PENDING}" \
  --argjson candidateEventPending "${EXPECTED_CANDIDATE_EVENT_PENDING}" \
  --argjson outbox "${EXPECTED_OUTBOX}" --argjson sourceEpoch "${SOURCE_EPOCH}" \
  --argjson drainEpoch "${DRAIN_EPOCH}" --argjson finalEpoch "${FINAL_EPOCH}" \
  "${PREFLIGHT_CONTRACT_FILTER}" \
  "${EVIDENCE_DIRECTORY}/database-preflight-redacted.json" >/dev/null \
  || fail database_preflight_contract_failed
jq '.snapshot' "${EVIDENCE_DIRECTORY}/database-preflight-redacted.json" > "${BEFORE_SNAPSHOT}"
chmod 600 "${BEFORE_SNAPSHOT}"

FAILURE_PHASE="drain-only-environment"
render_drain_environment
match_file_identity "${ENV_FILE}" "${TARGET_ENV}"
mv -f "${TARGET_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
TEMP_WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ "$(${DOCKER[@]} inspect "${TEMP_WEB_CONTAINER}" --format '{{.Image}}')" == "${TARGET_WEB_IMAGE}" \
  && "$(${DOCKER[@]} inspect "${TEMP_WEB_CONTAINER}" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -c '^CANDIDATE_EPISODE_DRAIN_ONLY=true$')" == "1" ]] \
  || fail drain_only_web_not_proven

FAILURE_PHASE="control-open"
database_runner open "${TARGET_WEB_IMAGE}" > "${EVIDENCE_DIRECTORY}/control-open-redacted.json"
CONTROL_OPENED=true
jq -e --argjson drainEpoch "${DRAIN_EPOCH}" "${DRAIN_OPEN_CONTRACT_FILTER}" \
  "${EVIDENCE_DIRECTORY}/control-open-redacted.json" >/dev/null || fail control_open_invalid

FAILURE_PHASE="pending-drain"
"${PROFILE_COMPOSE[@]}" up -d --no-deps --no-build candidate-shadow-worker
WORKER_CONTAINER="$("${PROFILE_COMPOSE[@]}" ps -q candidate-shadow-worker)"
[[ -n "${WORKER_CONTAINER}" \
  && "$(${DOCKER[@]} inspect "${WORKER_CONTAINER}" --format '{{.Image}}')" == "${TARGET_WORKER_IMAGE}" ]] \
  || fail candidate_worker_start_invalid
DEADLINE=$((SECONDS + 3600))
PREVIOUS_LEGACY_COMPLETED="${EXPECTED_LEGACY_COMPLETED}"
PREVIOUS_CANDIDATE_EVENT_PENDING="${EXPECTED_CANDIDATE_EVENT_PENDING}"
SAMPLE=0
while true; do
  SAMPLE=$((SAMPLE + 1))
  SNAPSHOT_FILE="${EVIDENCE_DIRECTORY}/drain-snapshot-${SAMPLE}.json"
  database_runner snapshot "${TARGET_WEB_IMAGE}" > "${SNAPSHOT_FILE}"
  OUTBOX="$(jq -r '.counts.outbox' "${SNAPSHOT_FILE}")"
  EVENTS="$(jq -r '.counts.events' "${SNAPSHOT_FILE}")"
  LEGACY_COMPLETED="$(jq -r '.counts.legacyCompleted' "${SNAPSHOT_FILE}")"
  LEGACY_PENDING="$(jq -r '.counts.legacyPending' "${SNAPSHOT_FILE}")"
  LEGACY_UNRESOLVED="$(jq -r '.counts.legacyUnresolved' "${SNAPSHOT_FILE}")"
  CANDIDATE_EVENT_PENDING="$(jq -r '.counts.candidateEventPending' "${SNAPSHOT_FILE}")"
  CANDIDATE_EVENT_NON_PENDING="$(jq -r '.counts.candidateEventNonPending' "${SNAPSHOT_FILE}")"
  CANDIDATE_EVENT_ORPHANS="$(jq -r '.counts.candidateEventOrphans' "${SNAPSHOT_FILE}")"
  CANDIDATE_EVENT_MISMATCHES="$(jq -r '.counts.candidateEventContractMismatches' "${SNAPSHOT_FILE}")"
  CLAIMED="$(jq -r '.counts.claimed' "${SNAPSHOT_FILE}")"
  RETRY_WAIT="$(jq -r '.counts.retryWait' "${SNAPSHOT_FILE}")"
  QUARANTINED="$(jq -r '.counts.quarantined' "${SNAPSHOT_FILE}")"
  RESOLUTIONS="$(jq -r '.counts.resolutions' "${SNAPSHOT_FILE}")"
  [[ "${OUTBOX}" -ge "${EXPECTED_OUTBOX}" && "${OUTBOX}" -le "${FINAL_OUTBOX}" \
    && "${EVENTS}" -ge "${EXPECTED_EVENTS}" && "${EVENTS}" -le "${FINAL_EVENTS}" \
    && "${LEGACY_COMPLETED}" -ge "${PREVIOUS_LEGACY_COMPLETED}" \
    && "${LEGACY_COMPLETED}" -le "${FINAL_LEGACY_COMPLETED}" \
    && "${CANDIDATE_EVENT_PENDING}" -ge "${PREVIOUS_CANDIDATE_EVENT_PENDING}" \
    && "${CANDIDATE_EVENT_PENDING}" -le "${FINAL_CANDIDATE_EVENT_PENDING}" \
    && "${OUTBOX}" -eq "$((EXPECTED_OUTBOX + LEGACY_COMPLETED - EXPECTED_LEGACY_COMPLETED))" \
    && "${EVENTS}" -eq "$((EXPECTED_EVENTS + LEGACY_COMPLETED - EXPECTED_LEGACY_COMPLETED))" \
    && "${CANDIDATE_EVENT_PENDING}" -eq "$((EXPECTED_CANDIDATE_EVENT_PENDING + LEGACY_COMPLETED - EXPECTED_LEGACY_COMPLETED))" \
    && "${LEGACY_UNRESOLVED}" -ge "${LEGACY_PENDING}" \
    && "${RETRY_WAIT}" == "0" && "${QUARANTINED}" == "0" && "${RESOLUTIONS}" == "0" \
    && "${CANDIDATE_EVENT_NON_PENDING}" == "0" && "${CANDIDATE_EVENT_ORPHANS}" == "0" \
    && "${CANDIDATE_EVENT_MISMATCHES}" == "0" ]] \
    || fail drain_invariant_failed
  PREVIOUS_LEGACY_COMPLETED="${LEGACY_COMPLETED}"
  PREVIOUS_CANDIDATE_EVENT_PENDING="${CANDIDATE_EVENT_PENDING}"
  if [[ "${LEGACY_COMPLETED}" == "${FINAL_LEGACY_COMPLETED}" \
    && "${LEGACY_PENDING}" == "0" && "${LEGACY_UNRESOLVED}" == "0" \
    && "${CLAIMED}" == "0" ]]; then break; fi
  (( SECONDS < DEADLINE )) || fail pending_drain_timeout
  sleep 5
done

FAILURE_PHASE="refreeze-and-verify"
"${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker
"${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker
database_runner close "${TARGET_WEB_IMAGE}" > "${EVIDENCE_DIRECTORY}/control-close-redacted.json"
CONTROL_OPENED=false
database_runner verify "${TARGET_WEB_IMAGE}" --before-snapshot "${BEFORE_SNAPSHOT}" \
  > "${EVIDENCE_DIRECTORY}/database-final-redacted.json"
jq -e --argjson legacyPending "${EXPECTED_LEGACY_PENDING}" \
  --argjson finalLegacyCompleted "${FINAL_LEGACY_COMPLETED}" \
  --argjson finalCandidateEventPending "${FINAL_CANDIDATE_EVENT_PENDING}" \
  --argjson finalOutbox "${FINAL_OUTBOX}" --argjson finalEpoch "${FINAL_EPOCH}" \
  "${DRAIN_VERIFY_CONTRACT_FILTER}" \
  "${EVIDENCE_DIRECTORY}/database-final-redacted.json" >/dev/null || fail database_final_contract_failed

FAILURE_PHASE="baseline-restore"
restore_baseline || fail production_baseline_restore_failed
lease_event checkpoint --checkpoint baseline-restored
lease_event release --outcome PASS
LEASE_RELEASED=true
SUCCEEDED=true
trap - EXIT INT TERM HUP
jq -n --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg baselineCommit "${BASELINE_COMMIT}" --arg targetCommit "${TARGET_COMMIT}" \
  --argjson drained "${EXPECTED_LEGACY_PENDING}" --argjson outboxTotal "${FINAL_OUTBOX}" \
  --argjson finalEpoch "${FINAL_EPOCH}" \
  '{schemaVersion:"candidate-legacy-pending-drain-production-result.v2",status:"PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN",completedAt:$completedAt,drained:$drained,outboxTotal:$outboxTotal,finalEpoch:$finalEpoch,finalPhase:"legacy",finalWriteFrozen:true,candidateWorkerAbsent:true,scannerReadyFresh:true,baselineCommit:$baselineCommit,targetCommit:$targetCommit,nextCycleStarted:false,secretsPrinted:false}' \
  > "${EVIDENCE_DIRECTORY}/result.json"
printf 'PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN\n'
