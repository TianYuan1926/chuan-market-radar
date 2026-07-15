#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${SOURCE_ROOT}}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
SECURE_ROOT="${SECURE_ROOT:-}"
OPS_ROOT="${OPS_ROOT:-}"
RUNNER_MODE="${RUNTIME_IDENTITY_MODE:-dry_run}"
CONFIRMED="${CONFIRM_RUNTIME_IDENTITY:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
CONTRACT_FILE="${CONTRACT_FILE_OVERRIDE:-${SOURCE_ROOT}/docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runner.mjs"
ACCESS_SQL="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runtime-access.sql"
REQUEST_FILE_OVERRIDE="${REQUEST_FILE_OVERRIDE:-}"
APPROVED_RUNTIME_REQUEST_SHA256="${APPROVED_RUNTIME_REQUEST_SHA256:-}"
TRANSPORT_MODE="${RUNTIME_IDENTITY_TRANSPORT_MODE:-repository}"
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST:-${SOURCE_ROOT}/transport-manifest.json}"
PACKET_VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/bundle.mjs"
AUTONOMY_REQUEST_FILE="${AUTONOMY_REQUEST_FILE:-}"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-/home/ubuntu/.local/state/market-radar-autonomy}"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY:-${OPS_ROOT}/evidence}"
NODE_RUNTIME="${RUNTIME_IDENTITY_NODE_RUNTIME:-auto}"
DOCKER=()
PREFLIGHT_WEB_CONTAINER=""
PREFLIGHT_WEB_IMAGE=""

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

stat_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

stat_uid() {
  stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"
}

stat_gid() {
  stat -c '%g' "$1" 2>/dev/null || stat -f '%g' "$1"
}

assert_private_file() {
  local file="$1"
  local mode
  mode="$(stat_mode "${file}")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "${file}")"
}

match_file_ownership_and_mode() {
  local reference="$1"
  local target="$2"
  chmod "$(stat_mode "${reference}")" "${target}"
  local owner
  owner="$(stat_uid "${reference}"):$(stat_gid "${reference}")"
  if [[ "$(stat_uid "${target}"):$(stat_gid "${target}")" != "${owner}" ]]; then
    chown "${owner}" "${target}"
  fi
}

privileged_file_mode() {
  sudo -n stat -c '%a' "$1" 2>/dev/null || sudo -n stat -f '%Lp' "$1"
}

privileged_file_uid() {
  sudo -n stat -c '%u' "$1" 2>/dev/null || sudo -n stat -f '%u' "$1"
}

echo "package=WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web"

if [[ "${RUNNER_MODE}" != "production_identity" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: production roles, permissions, environment and services were not changed."
  echo "DRY-RUN: current Dormant production PASS and an exact external time-bounded approval are required."
  exit 0
fi

for command_name in git id jq realpath sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done
case "${NODE_RUNTIME}" in
  auto|host_node|container_node) ;;
  *) fail node_runtime_invalid ;;
esac
if [[ "${NODE_RUNTIME}" == "host_node" ]]; then
  command -v node >/dev/null 2>&1 || fail required_command_missing:node
fi
sudo -n docker ps >/dev/null 2>&1 || fail docker_unavailable
DOCKER=(sudo -n docker)
[[ -n "${SECURE_ROOT}" && -d "${SECURE_ROOT}" ]] || fail secure_root_missing
[[ -n "${OPS_ROOT}" ]] || fail ops_root_missing
case "${OPS_ROOT}/" in
  /home/ubuntu/.cache/market-radar-ops/runtime-identity-ops/wp-g0-2-runtime-identity-*/) ;;
  /tmp/wp_g0_2_rehearsal_runtime_identity_runner_*/) ;;
  *) fail ops_root_invalid ;;
esac
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"
case "${EVIDENCE_DIRECTORY}/" in
  /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-runtime-identity-*/) ;;
  /tmp/wp_g0_2_rehearsal_runtime_identity_runner_*/evidence/) ;;
  *) fail evidence_directory_invalid ;;
esac
mkdir -p "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"

REQUEST_FILE="${REQUEST_FILE_OVERRIDE:-${SECURE_ROOT}/request.json}"
CREDENTIAL_FILE="${SECURE_ROOT}/credentials.json"
ADMIN_URL_FILE="${SECURE_ROOT}/role-admin.url"
DORMANT_EVIDENCE_FILE="${SECURE_ROOT}/dormant-deploy-result.json"
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" ]] || fail request_file_missing
assert_private_file "${REQUEST_FILE}"
if [[ "${TRANSPORT_MODE}" == "staged_bundle" ]]; then
  [[ "${APPROVED_RUNTIME_REQUEST_SHA256}" =~ ^[0-9a-f]{64}$ \
    && "$(sha256sum "${REQUEST_FILE}" | awk '{print $1}')" == "${APPROVED_RUNTIME_REQUEST_SHA256}" ]] \
    || fail runtime_identity_request_checksum_mismatch
fi
for file in "${CREDENTIAL_FILE}" "${ADMIN_URL_FILE}" "${DORMANT_EVIDENCE_FILE}"; do
  [[ -f "${file}" ]] || fail "secure_file_missing:$(basename "${file}")"
  assert_private_file "${file}"
done
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" && -f "${ROOT_DIR}/docker-compose.yml" ]] \
  || fail production_runtime_file_missing

APPROVED_RUNNER_SOURCE_COMMIT="$(jq -r '.approvedRunnerSourceCommit' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_COMMIT="$(jq -r '.approvedProductionCommit' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE="$(jq -r '.approvedWebImageId' "${REQUEST_FILE}")"
APPROVED_ROLLBACK_WEB_IMAGE="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
APPROVED_BASE_ENV_SHA256="$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ENV_SHA256="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
APPROVED_COMPOSE_SHA256="$(jq -r '.composeSha256' "${REQUEST_FILE}")"
APPROVED_DORMANT_EVIDENCE_SHA256="$(jq -r '.dormantDeployEvidenceSha256' "${REQUEST_FILE}")"
APPROVED_IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
APPROVED_IDENTITY_WRAPPER_SHA256="$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")"
APPROVED_IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
APPROVED_IDENTITY_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")"
ACCESS_SHA="$(jq -r '.runtimeAccessSha256' "${REQUEST_FILE}")"

[[ "${APPROVED_WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail approved_web_image_invalid

ensure_container_node_runtime() {
  [[ -n "${PREFLIGHT_WEB_CONTAINER}" && -n "${PREFLIGHT_WEB_IMAGE}" ]] && return 0
  local discovered_web_container
  discovered_web_container="$(${DOCKER[@]} ps \
    --filter 'label=com.docker.compose.project=chuan-market-radar' \
    --filter 'label=com.docker.compose.service=web' --format '{{.ID}}')"
  [[ "${discovered_web_container}" =~ ^[0-9a-f]+$ ]] || fail current_web_container_identity_invalid
  PREFLIGHT_WEB_CONTAINER="$(${DOCKER[@]} inspect "${discovered_web_container}" --format '{{.Id}}')"
  [[ "${PREFLIGHT_WEB_CONTAINER}" =~ ^[0-9a-f]{64}$ ]] || fail current_web_container_identity_invalid
  PREFLIGHT_WEB_IMAGE="$(${DOCKER[@]} inspect "${PREFLIGHT_WEB_CONTAINER}" --format '{{.Image}}')"
  [[ "${PREFLIGHT_WEB_IMAGE}" == "${APPROVED_WEB_IMAGE}" ]] || fail web_image_identity_mismatch
}

use_host_node() {
  [[ "${NODE_RUNTIME}" == "host_node" ]] \
    || { [[ "${NODE_RUNTIME}" == "auto" ]] && command -v node >/dev/null 2>&1; }
}

run_isolated_node() {
  local write_ops="$1"
  shift
  if use_host_node; then
    node "$@"
    return
  fi
  ensure_container_node_runtime
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly"
  )
  if [[ "$(realpath "${ROOT_DIR}")" != "$(realpath "${SOURCE_ROOT}")" ]]; then
    mounts+=(--mount "type=bind,src=${ROOT_DIR},dst=${ROOT_DIR},readonly")
  fi
  if [[ "${write_ops}" == "true" ]]; then
    mounts+=(--mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}")
  fi
  ${DOCKER[@]} run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${PREFLIGHT_WEB_IMAGE}" "$@"
}

run_isolated_node false "${RUNNER_MODULE}" request \
  --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
run_isolated_node false "${RUNNER_MODULE}" credentials --credentials "${CREDENTIAL_FILE}" >/dev/null
run_isolated_node false "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" \
  env --env-file "${BASE_ENV_FILE}" >/dev/null
run_isolated_node false "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" \
  env --env-file "${ENV_FILE}" >/dev/null

DORMANT_EVIDENCE_REFRESH_REQUIRED=false
if ! run_isolated_node false "${RUNNER_MODULE}" dormant-evidence \
  --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
  --evidence "${DORMANT_EVIDENCE_FILE}" >/dev/null 2>&1; then
  run_isolated_node false "${RUNNER_MODULE}" dormant-evidence-lineage \
    --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
    --evidence "${DORMANT_EVIDENCE_FILE}" >/dev/null
  DORMANT_EVIDENCE_REFRESH_REQUIRED=true
fi

[[ "$(sha256sum "${BASE_ENV_FILE}" | awk '{print $1}')" == "${APPROVED_BASE_ENV_SHA256}" \
  && "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${APPROVED_PRODUCTION_ENV_SHA256}" \
  && "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" == "${APPROVED_COMPOSE_SHA256}" \
  && "$(sha256sum "${DORMANT_EVIDENCE_FILE}" | awk '{print $1}')" == "${APPROVED_DORMANT_EVIDENCE_SHA256}" ]] \
  || fail production_input_checksum_mismatch
if ! sudo -n test -f "${APPROVED_IDENTITY_WRAPPER}" \
  || sudo -n test -L "${APPROVED_IDENTITY_WRAPPER}"; then
  fail identity_wrapper_not_regular
fi
if ! sudo -n test -f "${APPROVED_IDENTITY_OVERRIDE}" \
  || sudo -n test -L "${APPROVED_IDENTITY_OVERRIDE}"; then
  fail identity_override_not_regular
fi
[[ "$(privileged_file_mode "${APPROVED_IDENTITY_WRAPPER}")" == "700" \
  && "$(privileged_file_uid "${APPROVED_IDENTITY_WRAPPER}")" == "0" ]] \
  || fail identity_wrapper_not_root_owned_0700
[[ "$(privileged_file_mode "${APPROVED_IDENTITY_OVERRIDE}")" == "600" \
  && "$(privileged_file_uid "${APPROVED_IDENTITY_OVERRIDE}")" == "0" ]] \
  || fail identity_override_not_root_owned_0600
[[ "$(sudo -n sha256sum "${APPROVED_IDENTITY_WRAPPER}" | awk '{print $1}')" == "${APPROVED_IDENTITY_WRAPPER_SHA256}" ]] \
  || fail identity_wrapper_checksum_mismatch
[[ "$(sudo -n sha256sum "${APPROVED_IDENTITY_OVERRIDE}" | awk '{print $1}')" == "${APPROVED_IDENTITY_OVERRIDE_SHA256}" ]] \
  || fail identity_override_checksum_mismatch

if [[ "${TRANSPORT_MODE}" == "staged_bundle" ]]; then
  [[ -n "${AUTONOMY_REQUEST_FILE}" && -f "${AUTONOMY_REQUEST_FILE}" && ! -L "${AUTONOMY_REQUEST_FILE}" ]] \
    || fail autonomy_request_missing
  [[ -f "${TRANSPORT_MANIFEST}" && ! -L "${TRANSPORT_MANIFEST}" ]] || fail transport_manifest_missing
  run_isolated_node false "${PACKET_VALIDATOR}" validate-request \
    --root "${SOURCE_ROOT}" \
    --request "${AUTONOMY_REQUEST_FILE}" \
    --manifest "${TRANSPORT_MANIFEST}" \
    --bundle-sha256 "$(jq -r '.transportBundleSha256' "${AUTONOMY_REQUEST_FILE}")" \
    --runner "${RUNNER_MODULE}" >/dev/null
  [[ "$(jq -r '.sourceCommit' "${TRANSPORT_MANIFEST}")" == "${APPROVED_RUNNER_SOURCE_COMMIT}" ]] \
    || fail runner_source_commit_mismatch
elif [[ "${TRANSPORT_MODE}" == "repository" ]]; then
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" == "${APPROVED_RUNNER_SOURCE_COMMIT}" ]] \
    || fail runner_source_commit_mismatch
else
  fail transport_mode_invalid
fi
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_worktree_dirty
[[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] || fail production_branch_not_detached
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_PRODUCTION_COMMIT}" ]] \
  || fail production_commit_mismatch

COMPOSE=(sudo -n "${APPROVED_IDENTITY_WRAPPER}" \
  --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
"${COMPOSE[@]}" config --services >/dev/null || fail identity_wrapper_compose_unavailable
cd "${ROOT_DIR}"
if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_already_running
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail web_runtime_identity_missing
[[ "${WEB_IMAGE}" == "${APPROVED_WEB_IMAGE}" ]] || fail web_image_identity_mismatch
if [[ -n "${PREFLIGHT_WEB_CONTAINER}" ]]; then
  [[ "${WEB_CONTAINER}" == "${PREFLIGHT_WEB_CONTAINER}" \
    && "${WEB_IMAGE}" == "${PREFLIGHT_WEB_IMAGE}" ]] || fail web_runtime_changed_during_preflight
fi
ROLLBACK_TAG="${APPROVED_ROLLBACK_WEB_IMAGE}"

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
RENDERED_ENV="${OPS_ROOT}/backups/env.production.rendered"
run_isolated_node true "${RUNNER_MODULE}" render-env --credentials "${CREDENTIAL_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}" >/dev/null

PROVISIONED=false
ENV_SWITCHED=false
WEB_RECREATE_ATTEMPTED=false
LEASE_REQUIRED=false
LEASE_ACQUIRED=false
LEASE_RELEASED=false
LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
if [[ "${TRANSPORT_MODE}" == "staged_bundle" ]]; then
  LEASE_REQUIRED=true
  [[ "${AUTONOMY_TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" \
    && ! -L "${AUTONOMY_TRUST_ROOT}" ]] || fail autonomy_trust_root_invalid
  [[ -f "${LEASE_CLI}" && ! -L "${LEASE_CLI}" ]] || fail autonomy_lease_cli_missing
fi

lease_event() {
  local action="$1"
  shift
  [[ "${LEASE_REQUIRED}" == "true" ]] || return 0
  if use_host_node; then
    node "${LEASE_CLI}" "${action}" \
      --trust-root "${AUTONOMY_TRUST_ROOT}" \
      --request "${AUTONOMY_REQUEST_FILE}" \
      --execution "${LEASE_EXECUTION_FILE}" \
      "$@" | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
    return
  fi
  ensure_container_node_runtime
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT}/scripts/governance,dst=/runner,readonly" \
    --mount "type=bind,src=${AUTONOMY_REQUEST_FILE},dst=/request/approval-request.json,readonly" \
    --mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --entrypoint node "${PREFLIGHT_WEB_IMAGE}" \
    /runner/autonomy-production-lease-cli.mjs "${action}" \
      --trust-root "${AUTONOMY_TRUST_ROOT}" \
      --request /request/approval-request.json \
      --execution "${LEASE_EXECUTION_FILE}" \
      "$@" | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}

lease_acquire() {
  lease_event acquire --owner-id "WP-G0.2-RUNTIME-IDENTITY:$(jq -r '.autonomyAuthorization.approvalId' "${AUTONOMY_REQUEST_FILE}")"
}

lease_checkpoint() {
  lease_event checkpoint --checkpoint "$1"
}

lease_safety_checkpoint() {
  lease_event safety-checkpoint --checkpoint "$1"
}

lease_consume() {
  lease_event consume
}

lease_release() {
  lease_event release --outcome "$1"
}

run_identity_safe_production_check() {
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    BASE_URL="${BASE_URL}" STRICT_SCAN_FRESHNESS=true REQUIRE_IDENTITY_WRAPPER=true \
    IDENTITY_WRAPPER="${APPROVED_IDENTITY_WRAPPER}" \
    IDENTITY_WRAPPER_SHA256="${APPROVED_IDENTITY_WRAPPER_SHA256}" \
    IDENTITY_OVERRIDE_FILE="${APPROVED_IDENTITY_OVERRIDE}" \
    IDENTITY_OVERRIDE_SHA256="${APPROVED_IDENTITY_OVERRIDE_SHA256}" \
    bash "${SOURCE_ROOT}/scripts/verify/production-check.sh"
}

container_snapshot_excluding_web() {
  "${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v '^chuan-market-radar-web-1=' | LC_ALL=C sort
}

verify_dormant_candidate_contract() {
  "${COMPOSE[@]}" exec -T web node - <<'NODE' >/dev/null
const flags = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE", "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ", "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const urls = [
  "CANDIDATE_SOURCE_DATABASE_URL", "CANDIDATE_CONSUMER_DATABASE_URL",
  "CANDIDATE_MONITOR_DATABASE_URL",
];
const exactFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!flags.every((key) => exactFalse(process.env[key]))) throw new Error("candidate_feature_flag_not_false");
if (!urls.every((key) => !String(process.env[key] ?? "").trim())) {
  throw new Error("candidate_database_url_configured_before_identity");
}
if (String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase() !== "disabled") {
  throw new Error("candidate_release_not_disabled");
}
if (!exactFalse(process.env.CANDIDATE_SHADOW_WORKER_EXPECTED)) throw new Error("candidate_worker_expected");
const endpoint = "http://127.0.0.1:3000/api/admin/candidate-shadow/run";
const unauthorized = await fetch(endpoint, { method: "POST", headers: { authorization: "Bearer invalid" } });
if (unauthorized.status !== 401) throw new Error(`candidate_unauthorized_status_${unauthorized.status}`);
const authorized = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await authorized.json();
if (authorized.status !== 200 || body.ok !== true || body.mode !== "dormant" || body.batch !== null) {
  throw new Error("candidate_dormant_contract_failed");
}
if (!body.runtime?.blockers?.includes("release_not_authorized_in_code")) {
  throw new Error("candidate_code_authorization_blocker_missing");
}
NODE
}

refresh_dormant_evidence_if_required() {
  [[ "${DORMANT_EVIDENCE_REFRESH_REQUIRED}" == "true" ]] || return 0
  local duration poll minimum_samples started deadline now remaining sample_count
  local observation_file refreshed_file rollback_ref current_web current_image
  duration="$(jq -r '.dormantEvidence.freshnessRenewal.observationDurationSeconds' "${CONTRACT_FILE}")"
  poll="$(jq -r '.dormantEvidence.freshnessRenewal.pollSeconds' "${CONTRACT_FILE}")"
  minimum_samples="$(jq -r '.dormantEvidence.freshnessRenewal.minimumSampleCount' "${CONTRACT_FILE}")"
  [[ "${duration}" == "1800" && "${poll}" == "30" && "${minimum_samples}" == "57" ]] \
    || fail dormant_evidence_refresh_contract_invalid
  observation_file="${EVIDENCE_DIRECTORY}/dormant-evidence-refresh-observation.jsonl"
  refreshed_file="${EVIDENCE_DIRECTORY}/dormant-evidence-refreshed.json"
  rollback_ref="$(jq -r '.rollbackWebImageRef' "${DORMANT_EVIDENCE_FILE}")"
  DORMANT_NON_TARGET_CONTAINERS_BEFORE="$(container_snapshot_excluding_web)"
  started="$(date +%s)"
  deadline=$((started + duration))
  sample_count=0
  : > "${observation_file}"
  chmod 600 "${observation_file}"
  while true; do
    if [[ "${LEASE_REQUIRED}" == "true" ]]; then lease_checkpoint dormant-evidence-refresh-sample; fi
    [[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
      && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
      && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_PRODUCTION_COMMIT}" ]] \
      || fail dormant_refresh_production_identity_drift
    current_web="$("${COMPOSE[@]}" ps -q web)"
    current_image="$("${DOCKER[@]}" inspect "${current_web}" --format '{{.Image}}')"
    [[ -n "${current_web}" && "${current_image}" == "${APPROVED_WEB_IMAGE}" ]] \
      || fail dormant_refresh_web_identity_drift
    [[ "$(container_snapshot_excluding_web)" == "${DORMANT_NON_TARGET_CONTAINERS_BEFORE}" ]] \
      || fail dormant_refresh_non_target_container_drift
    ! "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker' \
      || fail dormant_refresh_candidate_worker_present
    "${DOCKER[@]}" image inspect "${rollback_ref}" >/dev/null \
      || fail dormant_refresh_rollback_image_missing
    (
      export READY_TIMEOUT_SECONDS=0
      export SHADOW_READY_TIMEOUT_SECONDS=0
      run_identity_safe_production_check >/dev/null
    )
    verify_dormant_candidate_contract
    sample_count=$((sample_count + 1))
    jq -n -c \
      --arg sampledAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --argjson sample "${sample_count}" \
      --arg webImageId "${current_image}" \
      '{sampledAt:$sampledAt,sample:$sample,health:"ready",scanFreshness:"fresh",candidateMode:"dormant",candidateWorkerAbsent:true,webImageId:$webImageId}' \
      >> "${observation_file}"
    now="$(date +%s)"
    (( now >= deadline )) && break
    remaining=$((deadline - now))
    (( remaining < poll )) && sleep "${remaining}" || sleep "${poll}"
  done
  (( $(date +%s) - started >= duration )) || fail dormant_refresh_duration_too_short
  (( sample_count >= minimum_samples )) || fail dormant_refresh_sample_count_too_low
  jq \
    --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson duration "${duration}" \
    --argjson sampleCount "${sample_count}" \
    '.completedAt=$completedAt
      | .observationDurationSeconds=$duration
      | .sampleCount=$sampleCount
      | .continuousReadyFresh=true
      | .candidateDormant=true
      | .candidateWorkerAbsent=true
      | .databaseMutation=false
      | .redisMutation=false
      | .environmentMutation=false
      | .otherServiceMutation=false' \
    "${DORMANT_EVIDENCE_FILE}" > "${refreshed_file}"
  chmod 600 "${refreshed_file}"
  run_isolated_node false "${RUNNER_MODULE}" dormant-evidence \
    --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
    --evidence "${refreshed_file}" >/dev/null
  printf 'PASS_DORMANT_EVIDENCE_REFRESH|duration=%s|samples=%s\n' "${duration}" "${sample_count}"
}

rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then return; fi
  trap - EXIT
  local rollback_failed=false
  echo "ERROR: runtime identity package failed; starting bounded rollback." >&2
  if [[ "${LEASE_ACQUIRED}" == "true" && ( "${PROVISIONED}" == "true" \
    || "${ENV_SWITCHED}" == "true" || "${WEB_RECREATE_ATTEMPTED}" == "true" ) ]]; then
    lease_safety_checkpoint rollback || rollback_failed=true
  fi
  if [[ "${ENV_SWITCHED}" == "true" && -f "${ENV_BACKUP}" ]]; then
    cp -p "${ENV_BACKUP}" "${ENV_FILE}" || rollback_failed=true
  fi
  if [[ "${WEB_RECREATE_ATTEMPTED}" == "true" ]]; then
    "${DOCKER[@]}" tag "${ROLLBACK_TAG}" chuan-market-radar-web:latest || rollback_failed=true
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_failed=true
  fi
  if [[ "${PROVISIONED}" == "true" ]]; then
    "${DOCKER[@]}" run --rm --network "${NETWORK}" \
      --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
      --env MARKET_RADAR_APPLICATION_ROOT=/app \
      --entrypoint node "${WEB_IMAGE}" \
      /src/scripts/production/candidate-runtime-identity/runner.mjs rollback \
      --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
      --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
      --access-sha256 "${ACCESS_SHA}" >/dev/null || rollback_failed=true
  fi
  [[ "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" == "${APPROVED_PRODUCTION_ENV_SHA256}" ]] \
    || rollback_failed=true
  rollback_web_container="$("${COMPOSE[@]}" ps -q web 2>/dev/null || true)"
  [[ -n "${rollback_web_container}" \
    && "$("${DOCKER[@]}" inspect "${rollback_web_container}" --format '{{.Image}}' 2>/dev/null || true)" == "${WEB_IMAGE}" ]] \
    || rollback_failed=true
  if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
    rollback_failed=true
  fi
  run_identity_safe_production_check >/dev/null 2>&1 || rollback_failed=true
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    if [[ "${rollback_failed}" == "false" ]]; then
      local lease_outcome="SAFE_STOP_PRE_MUTATION"
      if [[ "${PROVISIONED}" == "true" || "${ENV_SWITCHED}" == "true" \
        || "${WEB_RECREATE_ATTEMPTED}" == "true" ]]; then
        lease_outcome="ROLLBACK_PASS"
      fi
      if lease_release "${lease_outcome}"; then LEASE_RELEASED=true; else rollback_failed=true; fi
    else
      lease_safety_checkpoint rollback-incomplete >/dev/null 2>&1 || true
    fi
  fi
  if [[ "${rollback_failed}" == "true" ]]; then
    echo "ERROR: runtime_identity_rollback_incomplete" >&2
    exit 96
  fi
  echo "ROLLBACK_VERIFIED: env, Web image, Candidate worker absence and production contracts restored." >&2
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

if [[ "${LEASE_REQUIRED}" == "true" ]]; then
  lease_acquire
  LEASE_ACQUIRED=true
  lease_checkpoint dynamic-preflight
fi

refresh_dormant_evidence_if_required
run_identity_safe_production_check >/dev/null
"${DOCKER[@]}" run --rm --network "${NETWORK}" \
  --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
  --env MARKET_RADAR_APPLICATION_ROOT=/app \
  --entrypoint node "${WEB_IMAGE}" \
  /src/scripts/production/candidate-runtime-identity/runner.mjs preflight \
  --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
  > "${EVIDENCE_DIRECTORY}/database-preflight-redacted.json"

if [[ "${LEASE_REQUIRED}" == "true" ]]; then
  lease_checkpoint rollback-image-retention
fi
"${DOCKER[@]}" tag "${WEB_IMAGE}" "${ROLLBACK_TAG}"
[[ "$("${DOCKER[@]}" image inspect "${ROLLBACK_TAG}" --format '{{.Id}}')" == "${WEB_IMAGE}" ]] \
  || fail rollback_image_retention_drift
if [[ "${LEASE_REQUIRED}" == "true" ]]; then
  lease_consume
  lease_checkpoint provision-runtime-identities
fi

"${DOCKER[@]}" run --rm --network "${NETWORK}" \
  --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
  --env MARKET_RADAR_APPLICATION_ROOT=/app \
  --entrypoint node "${WEB_IMAGE}" \
  /src/scripts/production/candidate-runtime-identity/runner.mjs provision \
  --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
  --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
  --access-sha256 "${ACCESS_SHA}" > "${EVIDENCE_DIRECTORY}/provision-redacted.json"
PROVISIONED=true

if [[ "${LEASE_REQUIRED}" == "true" ]]; then lease_checkpoint switch-environment; fi
match_file_ownership_and_mode "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
WEB_RECREATE_ATTEMPTED=true
if [[ "${LEASE_REQUIRED}" == "true" ]]; then lease_checkpoint recreate-web; fi
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web

"${COMPOSE[@]}" exec -T web node - <<'NODE'
const pg = require("pg");
const roles = {
  CANDIDATE_SOURCE_DATABASE_URL: "candidate_application_writer_role",
  CANDIDATE_CONSUMER_DATABASE_URL: "candidate_shadow_executor_role",
  CANDIDATE_MONITOR_DATABASE_URL: "candidate_audit_role",
};
const flags = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE", "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ", "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const exactFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!flags.every((key) => exactFalse(process.env[key]))) throw new Error("candidate_feature_flag_not_false");
if (String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").toLowerCase() !== "disabled") throw new Error("candidate_release_not_disabled");
if (!exactFalse(process.env.CANDIDATE_SHADOW_WORKER_EXPECTED)) throw new Error("candidate_worker_expected");
const urls = Object.keys(roles).map((key) => process.env[key]?.trim());
if (urls.some((value) => !value) || new Set(urls).size !== 3) throw new Error("candidate_database_urls_not_unique");
for (const [key, role] of Object.entries(roles)) {
  const client = new pg.Client({ connectionString: process.env[key] });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE "${role}"`);
    const result = await client.query("SELECT current_user, session_user");
    if (result.rows[0]?.current_user !== role || result.rows[0]?.session_user === role) {
      throw new Error(`candidate_identity_mismatch_${key}`);
    }
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
const endpoint = "http://127.0.0.1:3000/api/admin/candidate-shadow/run";
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await response.json();
if (response.status !== 200 || body.ok !== true || body.mode !== "dormant" || body.batch !== null) {
  throw new Error("candidate_identity_dormant_contract_failed");
}
console.log(JSON.stringify({ candidateDatabaseUrlsConfigured: 3, candidateFeatureFlagsEnabled: 0,
  candidateMode: "dormant", candidateBatch: null, runtimeIdentitiesVerified: 3 }));
NODE

if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_started_unexpectedly
fi
if [[ "${LEASE_REQUIRED}" == "true" ]]; then lease_checkpoint final-verification; fi
run_identity_safe_production_check

if [[ "${LEASE_REQUIRED}" == "true" ]]; then
  lease_checkpoint success-closeout
  lease_release PASS
  LEASE_RELEASED=true
fi

echo "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION"
trap - EXIT
