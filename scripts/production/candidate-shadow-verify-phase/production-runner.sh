#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST_OVERRIDE:-${SOURCE_ROOT}/transport-manifest.json}"
MODE="${SHADOW_VERIFY_PHASE_MODE:-dry_run}"
CONFIRMED="${CONFIRM_SHADOW_VERIFY_PHASE:-false}"
ROOT_DIR_OVERRIDE="${ROOT_DIR_OVERRIDE:-}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-phase/bundle.mjs"
RUNNER="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-phase/runner.mjs"
OBSERVER="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-phase/observation-runner.sh"
FULL_SNAPSHOT="${SOURCE_ROOT}/scripts/production/candidate-shadow-verify-phase/full-snapshot-observer.cjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
MANIFEST_PATH="/run/market-radar/candidate-read-authority.json"
FULL_SNAPSHOT_PATH="/run/market-radar/candidate-read-full-snapshot.cjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
stat_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
stat_uid() { stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"; }
stat_gid() { stat -c '%g' "$1" 2>/dev/null || stat -f '%g' "$1"; }
private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "private_file_invalid:$(basename "$1")"
  local mode
  mode="$(stat_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "private_file_permissions_invalid:$(basename "$1")"
}
match_file_identity() {
  local reference="$1" target="$2"
  chmod "$(stat_mode "${reference}")" "${target}"
  if [[ "$(stat_uid "${target}"):$(stat_gid "${target}")" \
    != "$(stat_uid "${reference}"):$(stat_gid "${reference}")" ]]; then
    chown "$(stat_uid "${reference}"):$(stat_gid "${reference}")" "${target}"
  fi
}

if [[ "${MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  printf '%s\n' 'DRY-RUN: no production environment, phase, manifest, service or data changed.'
  exit 0
fi
[[ "${MODE}" == "production_transition" || "${MODE}" == "automatic_rollback" ]] \
  || fail mode_invalid
for command_name in git jq realpath sha256sum curl; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "command_missing:${command_name}"
done
private_file "${REQUEST_FILE}"
private_file "${TRANSPORT_MANIFEST}"

PACKAGE_ID="$(jq -r '.packageId' "${REQUEST_FILE}")"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(jq -r '.productionRoot' "${REQUEST_FILE}")}"
BASE_ENV="$(jq -r '.baseEnvPath' "${REQUEST_FILE}")"
ENV_FILE="$(jq -r '.productionEnvPath' "${REQUEST_FILE}")"
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
TRUST_ROOT="${TRUST_ROOT_OVERRIDE:-$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")}"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
PRODUCTION_COMMIT="$(jq -r '.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.productionTree' "${REQUEST_FILE}")"
WEB_IMAGE="$(jq -r '.currentWebImageId' "${REQUEST_FILE}")"
WORKER_CONTAINER="$(jq -r '.candidateWorkerContainerId' "${REQUEST_FILE}")"
WORKER_IMAGE="$(jq -r '.candidateWorkerImageId' "${REQUEST_FILE}")"
RELEASE_ID="$(jq -r '.releaseId' "${REQUEST_FILE}")"
MIGRATION_ID="$(jq -r '.migrationId' "${REQUEST_FILE}")"
CURRENT_EPOCH="$(jq -r '.currentAuthorityEpoch' "${REQUEST_FILE}")"
TARGET_EPOCH="$(jq -r '.targetAuthorityEpoch' "${REQUEST_FILE}")"
OBSERVER_UNIT="$(jq -r '.observerUnitName' "${REQUEST_FILE}")"

[[ "${PACKAGE_ID}" == "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION" \
  && "${ROOT_DIR}" == "${PRODUCTION_ROOT}" \
  && "${PRODUCTION_COMMIT}" == "72ee289388eea922d0aee58fd4ec7a3f18a91007" \
  && "$(jq -r '.productionTree' "${REQUEST_FILE}")" == "bb1492d5a3c79a75c79dfa392dd9a7c2d185f70d" \
  && "${TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
  || fail request_identity_invalid
case "${OPS_ROOT}/" in
  /home/ubuntu/.cache/market-radar-ops/shadow-verify-phase-ops/*/) REHEARSAL=false ;;
  /tmp/wp_g0_2_rehearsal_shadow_verify_phase_*/ops/) REHEARSAL=true ;;
  *) fail ops_root_invalid ;;
esac
[[ "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-shadow-verify-phase/* \
  || "${REHEARSAL}" == "true" ]] || fail secure_root_invalid
[[ "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-phase-* \
  || "${REHEARSAL}" == "true" ]] || fail evidence_directory_invalid

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi
if [[ "${REHEARSAL}" == "true" ]]; then
  COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV}" --env-file "${ENV_FILE}")
  PROFILE_COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
else
  [[ ! -L "${TRUST_ROOT}" && "$(realpath "${TRUST_ROOT}")" == "${TRUST_ROOT}" ]] \
    || fail trust_root_invalid
  [[ "$(sudo -n stat -c '%a:%u' "${IDENTITY_WRAPPER}")" == "700:0" \
    && "$(sudo -n stat -c '%a:%u' "${IDENTITY_OVERRIDE}")" == "600:0" \
    && ! -L "${IDENTITY_WRAPPER}" && ! -L "${IDENTITY_OVERRIDE}" ]] \
    || fail identity_file_boundary_invalid
  [[ "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" \
      == "$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
    && "$(sudo -n sha256sum "${IDENTITY_OVERRIDE}" | awk '{print $1}')" \
      == "$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" ]] \
    || fail identity_file_checksum_mismatch
  COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV}" --env-file "${ENV_FILE}")
  PROFILE_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
fi

for path in "${BASE_ENV}" "${ENV_FILE}" "${ADMIN_URL_FILE}"; do
  private_file "${path}"
done
[[ -f "${ROOT_DIR}/docker-compose.yml" && ! -L "${ROOT_DIR}/docker-compose.yml" ]] \
  || fail compose_file_invalid
[[ "$(sha_file "${BASE_ENV}")" == "$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")" \
  && "$(sha_file "${ROOT_DIR}/docker-compose.yml")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
  || fail stable_input_checksum_mismatch

WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${NETWORK}" ]] || fail network_missing

run_node() {
  local network="$1"; shift
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}"
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  if [[ "${REHEARSAL}" != "true" ]]; then
    mounts+=(--mount "type=bind,src=${TRUST_ROOT},dst=${TRUST_ROOT}")
  fi
  "${DOCKER[@]}" run --rm -i --network "${network}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}

database_runner() {
  local command="$1"; shift
  run_node "${NETWORK}" "${RUNNER}" "${command}" --request "${REQUEST_FILE}" \
    --admin-url-file "${ADMIN_URL_FILE}" "$@"
}

validate_request() {
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=/packet,readonly"
    --mount "type=bind,src=$(jq -r '.lineageEvidencePath' "${REQUEST_FILE}"),dst=$(jq -r '.lineageEvidencePath' "${REQUEST_FILE}"),readonly"
    --mount "type=bind,src=$(jq -r '.reconciliationEvidencePath' "${REQUEST_FILE}"),dst=$(jq -r '.reconciliationEvidencePath' "${REQUEST_FILE}"),readonly"
    --mount "type=bind,src=$(jq -r '.codeReleaseEvidencePath' "${REQUEST_FILE}"),dst=$(jq -r '.codeReleaseEvidencePath' "${REQUEST_FILE}"),readonly"
  )
  "${DOCKER[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    "${mounts[@]}" --entrypoint node "${WEB_IMAGE}" \
    /packet/scripts/production/candidate-shadow-verify-phase/bundle.mjs validate-request \
    --manifest /packet/transport-manifest.json --request /packet/approval-request.json >/dev/null
}

health_ready() {
  curl -fsS http://127.0.0.1/api/health | jq -e '
    .ok == true and .health.level == "ready"
    and .health.persistence.databaseStatus == "ready"
    and .health.scan.freshness == "fresh"
    and ([.health.runtimeProbes.workers[]?
      | select((.name // .key) == "candidate-shadow-worker" and .status == "healthy")] | length == 1)
    and ([.health.runtimeProbes.workers[]?
      | select((.name // .key) == "scanner-worker" and .status == "healthy")] | length == 1)
  ' >/dev/null
}
health_ready_legacy() {
  curl -fsS http://127.0.0.1/api/health | jq -e '
    .ok == true and .health.level == "ready"
    and .health.persistence.databaseStatus == "ready"
    and .health.scan.freshness == "fresh"
    and ([.health.runtimeProbes.workers[]?
      | select((.name // .key) == "candidate-shadow-worker")] | length == 0)
    and ([.health.runtimeProbes.workers[]?
      | select((.name // .key) == "scanner-worker" and .status == "healthy")] | length == 1)
  ' >/dev/null
}
wait_health() {
  local expected_phase="${1:-shadow_verify}"
  local deadline=$((SECONDS + 240))
  until { [[ "${expected_phase}" == "legacy" ]] && health_ready_legacy; } \
    || { [[ "${expected_phase}" != "legacy" ]] && health_ready; }; do
    (( SECONDS < deadline )) || return 1
    sleep 3
  done
}
endpoint_fail_closed() {
  local container="$1"
  "${DOCKER[@]}" exec -i "${container}" node - <<'NODE'
const response = await fetch("http://127.0.0.1:3000/api/frontend/candidate-lifecycle?limit=1000");
const body = await response.json();
if (response.status !== 503 || body.ok !== false
    || body.error !== "candidate_read_control_unavailable") process.exit(1);
NODE
}
verify_worker() {
  local current image
  current="$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')"
  image="$("${DOCKER[@]}" inspect "${current}" --format '{{.Image}}' 2>/dev/null || true)"
  [[ "${current}" == "${WORKER_CONTAINER}" && "${image}" == "${WORKER_IMAGE}" ]]
}
non_web_identity() {
  "${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v '^chuan-market-radar-web-1=' | LC_ALL=C sort
}
verify_manifest_absent() {
  local container="$1"
  "${DOCKER[@]}" exec "${container}" test ! -e "${MANIFEST_PATH}"
}

mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${OPS_ROOT}/evidence" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${OPS_ROOT}/evidence" "${EVIDENCE_DIRECTORY}"
LEASE_EXECUTION="${EVIDENCE_DIRECTORY}/lease-execution.json"
LEASE_EVENTS="${EVIDENCE_DIRECTORY}/lease-events.jsonl"
ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
RENDERED_ENV="${OPS_ROOT}/state/env.production.shadow-verify"
LEGACY_ENV="${OPS_ROOT}/state/env.production.legacy"
MANIFEST_FILE="${OPS_ROOT}/state/candidate-read-authority.json"
STATE_FILE="${OPS_ROOT}/state/phase-state.json"
OBSERVATION_CONTEXT="${OPS_ROOT}/state/observation-context.json"
IMMEDIATE_SAMPLE="${OPS_ROOT}/evidence/immediate-sample.json"

lease_event() {
  local action="$1"; shift
  [[ "${REHEARSAL}" == "true" ]] && return 0
  run_node none "${LEASE_CLI}" "${action}" --trust-root "${TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION}" "$@" \
    | tee -a "${LEASE_EVENTS}" >/dev/null
}

cleanup_temporary() {
  [[ "${REHEARSAL}" == "true" ]] && return 0
  [[ "${SOURCE_ROOT}" == "$(jq -r '.stagingDirectory' "${REQUEST_FILE}")" \
    && "${SOURCE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-phase-* \
    && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/shadow-verify-phase-ops/* \
    && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-shadow-verify-phase/* \
    && "${EVIDENCE_DIRECTORY}" != "${SOURCE_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${OPS_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${SECURE_ROOT}" ]] || fail cleanup_boundary_invalid
  rm -rf -- "${OPS_ROOT}" "${SECURE_ROOT}" "${SOURCE_ROOT}"
}

verify_rollback_boundary() {
  local phase="$1" web
  web="$("${COMPOSE[@]}" ps -q web)"
  [[ -n "${web}" && "$("${DOCKER[@]}" inspect "${web}" --format '{{.Image}}')" == "${WEB_IMAGE}" \
    && -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" ]] \
    || return 1
  endpoint_fail_closed "${web}" && verify_manifest_absent "${web}" \
    && { [[ "${phase}" == "legacy" ]] && health_ready_legacy \
      || { [[ "${phase}" != "legacy" ]] && health_ready; }; }
}

automatic_rollback() {
  local original_exit="${1:-1}" rollback_ok=true phase
  set +e
  lease_event safety-checkpoint --checkpoint shadow_verify_rollback
  database_runner control-rollback > "${EVIDENCE_DIRECTORY}/control-rollback.json"
  if [[ "$?" -ne 0 ]]; then rollback_ok=false; fi
  phase="$(jq -r '.phase // "unknown"' "${EVIDENCE_DIRECTORY}/control-rollback.json" 2>/dev/null)"
  if [[ "${phase}" == "legacy" ]]; then
    run_node none "${RUNNER}" render-legacy-env --source "${ENV_FILE}" --output "${LEGACY_ENV}"
    [[ "$?" -eq 0 && "$(sha_file "${LEGACY_ENV}")" != "$(sha_file "${ENV_FILE}")" ]] \
      || rollback_ok=false
    match_file_identity "${ENV_FILE}" "${LEGACY_ENV}" || rollback_ok=false
    mv -f "${LEGACY_ENV}" "${ENV_FILE}" || rollback_ok=false
    "${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
    "${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_ok=false
  elif [[ "${phase}" == "shadow_capture" ]]; then
    [[ -f "${ENV_BACKUP}" ]] && cp -p "${ENV_BACKUP}" "${ENV_FILE}" || rollback_ok=false
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_ok=false
  else
    rollback_ok=false
  fi
  wait_health "${phase}" || rollback_ok=false
  if [[ "${phase}" == "legacy" ]]; then
    [[ -z "$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-candidate-shadow-worker-1$ --format '{{.ID}}')" ]] \
      || rollback_ok=false
  else
    verify_worker || rollback_ok=false
  fi
  verify_rollback_boundary "${phase}" || rollback_ok=false
  if [[ "${rollback_ok}" == "true" ]]; then
    lease_event release --outcome ROLLBACK_PASS
    printf '{"status":"ROLLBACK_PASS_SHADOW_VERIFY_TO_%s","candidateDataDeleted":false,"secretsPrinted":false}\n' \
      "${phase^^}" > "${EVIDENCE_DIRECTORY}/rollback-summary.json"
    cleanup_temporary
    exit "${original_exit}"
  fi
  printf '%s\n' 'P0_SHADOW_VERIFY_ROLLBACK_NOT_VERIFIED' >&2
  exit 98
}

if [[ "${MODE}" == "automatic_rollback" ]]; then
  [[ -f "${STATE_FILE}" && -f "${ENV_BACKUP}" && -f "${LEASE_EXECUTION}" ]] \
    || fail rollback_state_missing
  automatic_rollback 1
fi

validate_request
[[ "$(sha_file "${ENV_FILE}")" == "$(jq -r '.preTransitionProductionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail pretransition_environment_checksum_mismatch
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}" ]] \
  || fail production_git_identity_invalid
[[ "$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')" == "${WEB_IMAGE}" ]] \
  || fail web_image_identity_invalid
verify_worker || fail candidate_worker_identity_invalid
NON_WEB_BEFORE="$(non_web_identity)"
printf '%s\n' "${NON_WEB_BEFORE}" > "${OPS_ROOT}/state/non-web-identity.txt"
chmod 600 "${OPS_ROOT}/state/non-web-identity.txt"
verify_manifest_absent "${WEB_CONTAINER}" || fail manifest_pretransition_present
health_ready || fail health_pretransition_invalid
endpoint_fail_closed "${WEB_CONTAINER}" || fail endpoint_pretransition_not_fail_closed

run_node none "${RUNNER}" render-env --request "${REQUEST_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}"
[[ "$(sha_file "${RENDERED_ENV}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail target_environment_checksum_mismatch
run_node none "${RUNNER}" build-manifest --request "${REQUEST_FILE}" \
  --output "${MANIFEST_FILE}" --now "$(jq -r '.manifestGeneratedAt' "${REQUEST_FILE}")"
[[ "sha256:$(sha_file "${MANIFEST_FILE}")" == "$(jq -r '.manifestApprovalDigest' "${REQUEST_FILE}")" ]] \
  || fail generated_manifest_checksum_mismatch
database_runner control-preflight > "${EVIDENCE_DIRECTORY}/control-preflight.json"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
jq -n --arg status prepared --arg productionCommit "${PRODUCTION_COMMIT}" \
  --arg webImageId "${WEB_IMAGE}" --arg migrationId "${MIGRATION_ID}" \
  --arg releaseId "${RELEASE_ID}" --argjson currentAuthorityEpoch "${CURRENT_EPOCH}" \
  --argjson targetAuthorityEpoch "${TARGET_EPOCH}" \
  '{schemaVersion:"candidate-shadow-verify-phase-state.v1",status:$status,productionCommit:$productionCommit,webImageId:$webImageId,migrationId:$migrationId,releaseId:$releaseId,currentAuthorityEpoch:$currentAuthorityEpoch,targetAuthorityEpoch:$targetAuthorityEpoch}' \
  > "${STATE_FILE}"
chmod 600 "${STATE_FILE}"

LEASE_ACQUIRED=false
MUTATION_STARTED=false
SUCCEEDED=false
rollback_trap() {
  local exit_code=$?
  trap - ERR EXIT INT TERM HUP
  [[ "${exit_code}" -ne 0 && "${SUCCEEDED}" != "true" ]] || exit "${exit_code}"
  if [[ "${MUTATION_STARTED}" == "true" ]]; then
    automatic_rollback "${exit_code}"
  elif [[ "${LEASE_ACQUIRED}" == "true" ]]; then
    lease_event release --outcome SAFE_STOP_PRE_MUTATION || true
  fi
  exit "${exit_code}"
}
trap rollback_trap ERR EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

lease_event acquire --owner-id "${PACKAGE_ID}:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre_mutation
lease_event consume
lease_event checkpoint --checkpoint switch_read_flags
match_file_identity "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
MUTATION_STARTED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
wait_health shadow_verify || fail target_web_not_ready
TARGET_WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${TARGET_WEB_CONTAINER}" \
  && "$(${DOCKER[@]} inspect "${TARGET_WEB_CONTAINER}" --format '{{.Image}}')" == "${WEB_IMAGE}" \
  && "${TARGET_WEB_CONTAINER}" != "${WEB_CONTAINER}" ]] || fail target_web_identity_invalid
verify_worker && [[ "$(non_web_identity)" == "${NON_WEB_BEFORE}" ]] \
  || fail non_web_identity_changed
"${DOCKER[@]}" exec -e EXPECTED_CANDIDATE_RELEASE_ID="${RELEASE_ID}" \
  "${TARGET_WEB_CONTAINER}" node - <<'NODE'
const expected = {
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "true",
  CANDIDATE_EPISODE_DUAL_READ: "true",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
};
for (const [key, value] of Object.entries(expected)) {
  if (process.env[key] !== value) throw new Error(`candidate_read_environment_mismatch:${key}`);
}
if (process.env.CANDIDATE_RUNTIME_RELEASE_ID !== process.env.EXPECTED_CANDIDATE_RELEASE_ID) {
  throw new Error("candidate_runtime_release_environment_mismatch");
}
NODE

lease_event checkpoint --checkpoint install_manifest_and_full_snapshot
"${DOCKER[@]}" exec "${TARGET_WEB_CONTAINER}" mkdir -p /run/market-radar
"${DOCKER[@]}" cp "${MANIFEST_FILE}" "${TARGET_WEB_CONTAINER}:${MANIFEST_PATH}.tmp"
"${DOCKER[@]}" cp "${FULL_SNAPSHOT}" "${TARGET_WEB_CONTAINER}:${FULL_SNAPSHOT_PATH}.tmp"
"${DOCKER[@]}" exec "${TARGET_WEB_CONTAINER}" install -o root -g root -m 0600 \
  "${MANIFEST_PATH}.tmp" "${MANIFEST_PATH}"
"${DOCKER[@]}" exec "${TARGET_WEB_CONTAINER}" install -o root -g root -m 0500 \
  "${FULL_SNAPSHOT_PATH}.tmp" "${FULL_SNAPSHOT_PATH}"
"${DOCKER[@]}" exec "${TARGET_WEB_CONTAINER}" rm -f \
  "${MANIFEST_PATH}.tmp" "${FULL_SNAPSHOT_PATH}.tmp"
endpoint_fail_closed "${TARGET_WEB_CONTAINER}" || fail endpoint_should_fail_before_phase_transition

lease_event checkpoint --checkpoint transition_shadow_verify
database_runner control-transition --manifest "${MANIFEST_FILE}" \
  > "${EVIDENCE_DIRECTORY}/control-transition.json"
jq '.status="transitioned"' "${STATE_FILE}" > "${STATE_FILE}.tmp"
mv "${STATE_FILE}.tmp" "${STATE_FILE}"

jq --arg webContainerId "${TARGET_WEB_CONTAINER}" \
  '. + {webContainerId:$webContainerId}' "${REQUEST_FILE}" > "${OBSERVATION_CONTEXT}"
chmod 600 "${OBSERVATION_CONTEXT}"
SHADOW_VERIFY_OBSERVATION_MODE=sample REQUEST_FILE="${REQUEST_FILE}" \
  OBSERVATION_CONTEXT="${OBSERVATION_CONTEXT}" OUTPUT_SAMPLE="${IMMEDIATE_SAMPLE}" \
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" bash "${OBSERVER}"

lease_event checkpoint --checkpoint immediate_shadow_verify_pass
if [[ "${REHEARSAL}" == "true" ]]; then
  printf '%s\n' 'PASS_REHEARSAL_SHADOW_VERIFY_PHASE_IMMEDIATE'
  SUCCEEDED=true
  trap - ERR EXIT INT TERM HUP
  exit 0
fi
[[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=LoadState --value 2>/dev/null || true)" \
  == "not-found" ]] || fail observer_unit_already_exists
sudo -n systemd-run --unit="${OBSERVER_UNIT}" --collect --quiet \
  --uid="$(id -u)" --gid="$(id -g)" --property=Type=exec --property=Restart=no \
  --property=KillMode=mixed --property=TimeoutStopSec=900 \
  --property=RuntimeMaxSec=90000 --property=UMask=0077 \
  --property=StandardOutput=journal --property=StandardError=journal \
  --setenv=SHADOW_VERIFY_OBSERVATION_MODE=full \
  --setenv=REQUEST_FILE="${REQUEST_FILE}" \
  --setenv=OBSERVATION_CONTEXT="${OBSERVATION_CONTEXT}" \
  --setenv=ROOT_DIR_OVERRIDE="${ROOT_DIR}" \
  /bin/bash "${OBSERVER}"
[[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=ActiveState --value)" == "active" ]] \
  || fail observer_unit_not_active
jq -n --arg schemaVersion "candidate-shadow-verify-phase-immediate.v2" \
  --arg packageId "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION" \
  --arg status "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE" \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg productionTree "${PRODUCTION_TREE}" \
  --arg webImageId "${WEB_IMAGE}" --arg migrationId "${MIGRATION_ID}" \
  --arg releaseId "${RELEASE_ID}" --argjson targetAuthorityEpoch "${TARGET_EPOCH}" \
  --arg observerUnit "${OBSERVER_UNIT}.service" '
  {schemaVersion:$schemaVersion,packageId:$packageId,status:$status,
   productionCommit:$productionCommit,productionTree:$productionTree,webImageId:$webImageId,
   migrationId:$migrationId,releaseId:$releaseId,targetAuthorityEpoch:$targetAuthorityEpoch,
   observerUnit:$observerUnit,candidateResponseAuthority:"legacy",
   automaticPhaseAdvance:false,secretsPrinted:false}' \
  > "${EVIDENCE_DIRECTORY}/immediate-summary.json"
SUCCEEDED=true
trap - ERR EXIT INT TERM HUP
printf '%s\n' 'PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE'
