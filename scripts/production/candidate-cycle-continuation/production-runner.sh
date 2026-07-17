#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
RUNNER_MODE="${CANDIDATE_CYCLE_CONTINUATION_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_CYCLE_CONTINUATION:-false}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-cycle-continuation/runner.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
file_uid() { stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
assert_private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "secure_file_invalid:$(basename "$1")"
  local mode="$(file_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "$1")"
}
match_file_identity() {
  local reference="$1" target="$2" group
  chmod "$(file_mode "${reference}")" "${target}"
  group="$(stat -c '%g' "${reference}" 2>/dev/null || stat -f '%g' "${reference}")"
  chown "$(file_uid "${reference}"):${group}" "${target}" 2>/dev/null || true
}

echo "package=WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web,candidate-shadow-worker"
if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: no production Git, image, environment, database control or service mutation was performed."
  exit 0
fi
[[ "${RUNNER_MODE}" == "production_continue" || "${RUNNER_MODE}" == "automatic_rollback" ]] \
  || fail runner_mode_invalid
for command_name in docker git jq sha256sum sudo; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done
assert_private_file "${REQUEST_FILE}"
ROOT_DIR="$(jq -r '.productionRoot' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")}"
BASE_ENV_FILE="${ROOT_DIR}/.env"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
[[ "${ROOT_DIR}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-cycle-continuation/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-* \
  && "${AUTONOMY_TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
  || fail approved_path_boundary_invalid
for file in "${BASE_ENV_FILE}" "${ENV_FILE}" "${COMPOSE_FILE}" "${ADMIN_URL_FILE}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "production_input_missing:$(basename "${file}")"
done
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"

IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
sudo -n test -f "${IDENTITY_WRAPPER}" && ! sudo -n test -L "${IDENTITY_WRAPPER}" \
  || fail identity_wrapper_invalid
sudo -n test -f "${IDENTITY_OVERRIDE}" && ! sudo -n test -L "${IDENTITY_OVERRIDE}" \
  || fail identity_override_invalid
[[ "$(sudo -n stat -c '%a:%u' "${IDENTITY_WRAPPER}")" == "700:0" \
  && "$(sudo -n stat -c '%a:%u' "${IDENTITY_OVERRIDE}")" == "600:0" \
  && "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" == "$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
  && "$(sudo -n sha256sum "${IDENTITY_OVERRIDE}" | awk '{print $1}')" == "$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" ]] \
  || fail identity_binding_mismatch
DOCKER=(sudo -n docker)
COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
PROFILE_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
APPROVED_TARGET="$(jq -r '.targetCommit' "${REQUEST_FILE}")"
ROLLBACK_COMMIT="$(jq -r '.currentProductionCommit' "${REQUEST_FILE}")"
ROLLBACK_WEB_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
OBSERVER_UNIT="$(jq -r '.observerUnitName' "${REQUEST_FILE}")"

[[ -d "${ROOT_DIR}/.git" && -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] || fail production_git_boundary_invalid
[[ "$(sha_file "${BASE_ENV_FILE}")" == "$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")" \
  && "$(sha_file "${COMPOSE_FILE}")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
  || fail production_stable_input_checksum_mismatch
if [[ "${RUNNER_MODE}" == "production_continue" ]]; then
  [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${ROLLBACK_COMMIT}" \
    && "$(sha_file "${ENV_FILE}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" ]] \
    || fail production_precontinuation_identity_mismatch
else
  [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_TARGET}" ]] \
    || fail production_rollback_source_identity_mismatch
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
WORKER_CONTAINERS="$(${DOCKER[@]} ps -aq \
  --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=candidate-shadow-worker')"
[[ -n "${WEB_CONTAINER}" ]] || fail production_web_runtime_missing
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
RUNTIME_NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${RUNTIME_NETWORK}" ]] || fail production_network_identity_missing
if [[ "${RUNNER_MODE}" == "production_continue" ]]; then
  [[ "${WEB_IMAGE}" == "$(jq -r '.currentWebImageId' "${REQUEST_FILE}")" ]] \
    || fail production_image_identity_mismatch
  [[ "$(jq -r '.currentWorkerState' "${REQUEST_FILE}")" == "absent" \
    && -z "${WORKER_CONTAINERS}" ]] || fail candidate_baseline_worker_not_absent
fi

run_node() {
  local write_ops="$1"; shift
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly"
    --mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  [[ "${write_ops}" != "true" ]] || mounts+=(--mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}")
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}
database_runner() {
  local command="$1" image="$2"
  ${DOCKER[@]} run --rm --network "${RUNTIME_NETWORK}" \
    --read-only --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly" \
    --entrypoint node "${image}" "${RUNNER_MODULE}" "${command}" \
    --request "${REQUEST_FILE}" --admin-url-file "${ADMIN_URL_FILE}"
}

LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
LEASE_ACQUIRED=false
LEASE_RELEASED=false
lease_event() {
  local action="$1"; shift
  run_node true "${LEASE_CLI}" "${action}" --trust-root "${AUTONOMY_TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION_FILE}" "$@" \
    | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
TARGET_ENV="${OPS_ROOT}/backups/env.production.target"
DISABLED_ENV="${OPS_ROOT}/backups/env.production.disabled"
CONTROL_CONTINUED=false
ENV_SWITCHED=false
GIT_SWITCHED=false
WEB_RECREATE_ATTEMPTED=false
TARGET_WEB_IMAGE=""
TARGET_WORKER_IMAGE=""

run_production_check() {
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    STRICT_SCAN_FRESHNESS=true REQUIRE_IDENTITY_WRAPPER=true \
    IDENTITY_WRAPPER="${IDENTITY_WRAPPER}" IDENTITY_WRAPPER_SHA256="$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
    IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE}" IDENTITY_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" \
    bash "${SOURCE_ROOT}/scripts/verify/production-check.sh"
}

bounded_rollback() {
  local rollback_failed=false
  local rollback_database_image="${TARGET_WEB_IMAGE:-${WEB_IMAGE}}"
  echo "cycle continuation rollback: freezing new cycle and restoring Legacy authority" >&2
  [[ "${LEASE_ACQUIRED}" != "true" ]] || lease_event safety-checkpoint --checkpoint rollback || true
  "${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
  "${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
  if [[ "${CONTROL_CONTINUED}" == "true" ]]; then
    database_runner control-rollback "${rollback_database_image}" \
      > "${EVIDENCE_DIRECTORY}/control-rollback-redacted.json" || rollback_failed=true
  fi
  if [[ -f "${ENV_BACKUP}" ]]; then
    if [[ "${CONTROL_CONTINUED}" == "true" ]]; then
      ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
        --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
        --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}" \
        --entrypoint node "${rollback_database_image}" "${RUNNER_MODULE}" render-disabled-env \
        --request "${REQUEST_FILE}" --source "${ENV_BACKUP}" --output "${DISABLED_ENV}" >/dev/null \
        || rollback_failed=true
      [[ ! -f "${DISABLED_ENV}" ]] \
        || { match_file_identity "${ENV_FILE}" "${DISABLED_ENV}"; mv -f "${DISABLED_ENV}" "${ENV_FILE}"; }
    else
      cp -p "${ENV_BACKUP}" "${ENV_FILE}" || rollback_failed=true
    fi
  fi
  ${DOCKER[@]} tag "${ROLLBACK_WEB_REF}" chuan-market-radar-web:latest || rollback_failed=true
  WEB_RECREATE_ATTEMPTED=true
  "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_failed=true
  git -C "${ROOT_DIR}" checkout --detach "${ROLLBACK_COMMIT}" >/dev/null 2>&1 || rollback_failed=true
  [[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${ROLLBACK_COMMIT}" ]] || rollback_failed=true
  [[ -z "$(${DOCKER[@]} ps -aq \
    --filter 'label=com.docker.compose.project=chuan-market-radar' \
    --filter 'label=com.docker.compose.service=candidate-shadow-worker')" ]] \
    || rollback_failed=true
  run_production_check >/dev/null 2>&1 || rollback_failed=true
  if [[ "${rollback_failed}" == "false" \
    && "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    if lease_event release --outcome ROLLBACK_PASS; then
      LEASE_RELEASED=true
    else
      rollback_failed=true
    fi
  fi
  if [[ "${rollback_failed}" != "false" ]]; then
    echo "ROLLBACK_INCOMPLETE_LEASE_RETAINED" >&2
    return 1
  fi
  echo "ROLLBACK_PASS"
}

if [[ "${RUNNER_MODE}" == "automatic_rollback" ]]; then
  CONTROL_CONTINUED=true
  LEASE_ACQUIRED=true
  bounded_rollback || fail automatic_rollback_incomplete
  echo "PASS_AUTOMATIC_ROLLBACK_TO_LEGACY_AUTHORITY"
  exit 0
fi

database_runner control-preflight "${WEB_IMAGE}" > "${EVIDENCE_DIRECTORY}/control-preflight-redacted.json"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
${DOCKER[@]} tag "${WEB_IMAGE}" "${ROLLBACK_WEB_REF}"
[[ "$(${DOCKER[@]} image inspect "${ROLLBACK_WEB_REF}" --format '{{.Id}}')" == "${WEB_IMAGE}" ]] \
  || fail rollback_image_retention_mismatch

rollback_on_failure() {
  local exit_code=$?
  local rollback_exit=0
  [[ "${exit_code}" -ne 0 ]] || return
  trap - EXIT
  if [[ "${LEASE_ACQUIRED}" == "true" || "${GIT_SWITCHED}" == "true" ]]; then
    bounded_rollback || rollback_exit=$?
  fi
  [[ "${rollback_exit}" -eq 0 ]] || exit 98
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

lease_event acquire --owner-id "WP-G0.2-CYCLE-CONTINUATION:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre_mutation
lease_event consume
git -C "${ROOT_DIR}" fetch --no-tags origin "${APPROVED_TARGET}"
[[ "$(git -C "${ROOT_DIR}" rev-parse FETCH_HEAD)" == "${APPROVED_TARGET}" ]] || fail fetched_commit_mismatch
git -C "${ROOT_DIR}" checkout --detach "${APPROVED_TARGET}"
GIT_SWITCHED=true
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_TARGET}" ]] \
  || fail target_checkout_invalid
lease_event checkpoint --checkpoint target_checked_out
"${PROFILE_COMPOSE[@]}" build web candidate-shadow-worker
TARGET_WEB_IMAGE="$(${DOCKER[@]} image inspect chuan-market-radar-web:latest --format '{{.Id}}')"
TARGET_WORKER_IMAGE="$(${DOCKER[@]} image inspect \
  chuan-market-radar-candidate-shadow-worker:latest --format '{{.Id}}')"
[[ "${TARGET_WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ \
  && "${TARGET_WORKER_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail target_image_identity_invalid
printf '{"schemaVersion":"candidate-cycle-target-images.v1","webImageId":"%s","workerImageId":"%s","secretsPrinted":false}\n' \
  "${TARGET_WEB_IMAGE}" "${TARGET_WORKER_IMAGE}" \
  > "${EVIDENCE_DIRECTORY}/target-images-redacted.json"
${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
  --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}" \
  --mount "type=bind,src=${ENV_FILE},dst=/runtime/env.production,readonly" \
  --entrypoint node "${TARGET_WEB_IMAGE}" "${RUNNER_MODULE}" render-env \
  --request "${REQUEST_FILE}" --source /runtime/env.production --output "${TARGET_ENV}" >/dev/null
"${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
"${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
database_runner control-continue "${TARGET_WEB_IMAGE}" \
  > "${EVIDENCE_DIRECTORY}/control-continuation-redacted.json"
CONTROL_CONTINUED=true
match_file_identity "${ENV_FILE}" "${TARGET_ENV}"
mv -f "${TARGET_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
WEB_RECREATE_ATTEMPTED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
"${PROFILE_COMPOSE[@]}" up -d --no-deps --no-build candidate-shadow-worker
lease_event checkpoint --checkpoint services_started
run_production_check
"${COMPOSE[@]}" exec -T \
  -e EXPECTED_CYCLE="$(jq -r '.nextMigrationId' "${REQUEST_FILE}")" \
  -e EXPECTED_RELEASE="$(jq -r '.nextReleaseId' "${REQUEST_FILE}")" web node - <<'NODE'
(async () => {
  if (process.env.CANDIDATE_RUNTIME_MIGRATION_ID !== process.env.EXPECTED_CYCLE
      || process.env.CANDIDATE_RUNTIME_RELEASE_ID !== process.env.EXPECTED_RELEASE) {
    throw new Error("candidate_cycle_environment_mismatch");
  }
  const response = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
    method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const body = await response.json();
  if (response.status !== 200 || body.ok !== true || body.mode !== "active"
      || body.runtime?.enabled !== true || body.runtime?.blockers?.length !== 0
      || body.monitor?.status !== "ready" || body.monitor?.phase !== "shadow_capture") {
    throw new Error("candidate_cycle_runtime_contract_failed");
  }
  console.log(JSON.stringify({ status: "pass", secretsPrinted: false }));
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
lease_event checkpoint --checkpoint immediate_verification_passed
lease_event observation-checkpoint --checkpoint accumulation_observation_start

[[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
  || fail observer_unit_already_exists
sudo -n systemd-run --unit="${OBSERVER_UNIT}" --collect --quiet --uid="$(id -u)" --gid="$(id -g)" \
  --property=Type=exec --property=Restart=no --property=KillMode=mixed --property=TimeoutStopSec=900 \
  --property=RuntimeMaxSec=260000 --property=UMask=0077 --property=StandardOutput=journal \
  --property=StandardError=journal --setenv=REQUEST_FILE="${REQUEST_FILE}" \
  --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
  --setenv=CONFIRM_CANDIDATE_CYCLE_OBSERVATION=true \
  /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-cycle-continuation/observation-runner.sh"
[[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=ActiveState --value)" == "active" ]] \
  || fail observer_unit_not_active
trap - EXIT
echo "PASS_IMMEDIATE_CYCLE_CONTINUATION_AWAITING_REAL_WRITE_ACCUMULATION"
