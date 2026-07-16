#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
RUNNER_MODE="${CANDIDATE_ACTIVATION_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_ACTIVATION:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
CONTRACT_FILE="${SOURCE_ROOT}/docs/governance/wp-g0-2-candidate-activation-production-execution.v1.json"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-activation/runner.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
NODE_RUNTIME="${CANDIDATE_ACTIVATION_NODE_RUNTIME:-auto}"
ROLLBACK_REPOSITORY="market-radar-rollback/wp-g0-2-candidate-activation"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
stat_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
stat_uid() { stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
assert_private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "secure_file_invalid:$(basename "$1")"
  local mode
  mode="$(stat_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "$1")"
}
match_file_ownership_and_mode() {
  local reference="$1" target="$2" owner
  chmod "$(stat_mode "${reference}")" "${target}"
  owner="$(stat_uid "${reference}"):$(stat -c '%g' "${reference}" 2>/dev/null || stat -f '%g' "${reference}")"
  [[ "$(stat_uid "${target}"):$(stat -c '%g' "${target}" 2>/dev/null || stat -f '%g' "${target}")" == "${owner}" ]] \
    || chown "${owner}" "${target}"
}

echo "package=WP-G0.2-SHADOW-CAPTURE-ACTIVATE-AND-OBSERVE"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web,candidate-shadow-worker"
echo "compose_profile=candidate-shadow-runtime"

if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: production code, control lifecycle, environment and services were not changed."
  echo "DRY-RUN: Dormant and Runtime Identity final PASS plus a future activation-authorized release are required."
  exit 0
fi
[[ "${RUNNER_MODE}" == "production_activate" || "${RUNNER_MODE}" == "automatic_rollback" ]] \
  || fail runner_mode_invalid
for command_name in git jq realpath sha256sum; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done
case "${NODE_RUNTIME}" in auto|host_node|container_node) ;; *) fail node_runtime_invalid ;; esac

assert_private_file "${REQUEST_FILE}"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-$(jq -r '.productionRoot // empty' "${REQUEST_FILE}")}"
SECURE_ROOT="${SECURE_ROOT:-$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")}"
OPS_ROOT="${OPS_ROOT:-$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")}"
EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY:-$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")}"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
REHEARSAL=false
case "${OPS_ROOT}/" in
  /tmp/wp_g0_2_rehearsal_candidate_activation_*/ops/) REHEARSAL=true ;;
  /home/ubuntu/.cache/market-radar-ops/candidate-activation-ops/wp-g0-2-candidate-activation-*/) ;;
  *) fail ops_root_invalid ;;
esac
[[ "${ROOT_DIR}" == "$(jq -r '.productionRoot' "${REQUEST_FILE}")" \
  && "${SECURE_ROOT}" == "$(jq -r '.secureRoot' "${REQUEST_FILE}")" \
  && "${OPS_ROOT}" == "$(jq -r '.opsRoot' "${REQUEST_FILE}")" ]] \
  || fail approved_path_binding_mismatch
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"

ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
DORMANT_EVIDENCE_FILE="${SECURE_ROOT}/dormant-deploy-result.json"
IDENTITY_EVIDENCE_FILE="${SECURE_ROOT}/runtime-identity-result.json"
for file in "${ADMIN_URL_FILE}" "${DORMANT_EVIDENCE_FILE}" "${IDENTITY_EVIDENCE_FILE}"; do
  assert_private_file "${file}"
done
[[ "$(sha_file "${DORMANT_EVIDENCE_FILE}")" == "$(jq -r '.dormantEvidenceSha256' "${REQUEST_FILE}")" \
  && "$(sha_file "${IDENTITY_EVIDENCE_FILE}")" == "$(jq -r '.runtimeIdentityEvidenceSha256' "${REQUEST_FILE}")" ]] \
  || fail prerequisite_evidence_checksum_mismatch
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" && -f "${ROOT_DIR}/docker-compose.yml" ]] \
  || fail production_runtime_file_missing

APPROVED_COMMIT="$(jq -r '.approvedCommit' "${REQUEST_FILE}")"
ROLLBACK_COMMIT="$(jq -r '.rollbackCommit' "${REQUEST_FILE}")"
RELEASE_ID="$(jq -r '.releaseId' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE="$(jq -r '.webImageId' "${REQUEST_FILE}")"
ROLLBACK_IMAGE_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
[[ "${ROLLBACK_IMAGE_REF}" == "${ROLLBACK_REPOSITORY}:web-"* ]] || fail rollback_image_repository_mismatch
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
IDENTITY_OVERRIDE="$(jq -r '.identityOverridePath' "${REQUEST_FILE}")"
OBSERVER_UNIT="$(jq -r '.observerUnitName' "${REQUEST_FILE}")"

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi

if [[ "${REHEARSAL}" == "true" ]]; then
  COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  PROFILE_COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
else
  [[ "${AUTONOMY_TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" \
    && ! -L "${AUTONOMY_TRUST_ROOT}" ]] || fail autonomy_trust_root_invalid
  sudo -n test -f "${IDENTITY_WRAPPER}" && ! sudo -n test -L "${IDENTITY_WRAPPER}" \
    || fail identity_wrapper_not_regular
  sudo -n test -f "${IDENTITY_OVERRIDE}" && ! sudo -n test -L "${IDENTITY_OVERRIDE}" \
    || fail identity_override_not_regular
  [[ "$(sudo -n stat -c '%a' "${IDENTITY_WRAPPER}")" == "700" \
    && "$(sudo -n stat -c '%u' "${IDENTITY_WRAPPER}")" == "0" \
    && "$(sudo -n stat -c '%a' "${IDENTITY_OVERRIDE}")" == "600" \
    && "$(sudo -n stat -c '%u' "${IDENTITY_OVERRIDE}")" == "0" ]] \
    || fail identity_boundary_invalid
  [[ "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" == "$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
    && "$(sudo -n sha256sum "${IDENTITY_OVERRIDE}" | awk '{print $1}')" == "$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" ]] \
    || fail identity_checksum_mismatch
  COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
  PROFILE_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
fi
cd "${ROOT_DIR}"
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail web_runtime_identity_missing

use_host_node() {
  [[ "${NODE_RUNTIME}" == "host_node" ]] \
    || { [[ "${NODE_RUNTIME}" == "auto" ]] && command -v node >/dev/null 2>&1; }
}
run_node() {
  local write_ops="$1"
  shift
  if use_host_node; then node "$@"; return; fi
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${ROOT_DIR},dst=${ROOT_DIR},readonly"
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  if [[ "${REHEARSAL}" != "true" ]]; then
    mounts+=(--mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}")
  fi
  if [[ "${write_ops}" == "true" ]]; then
    mounts+=(--mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}")
  fi
  "${DOCKER[@]}" run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}
run_node false "${RUNNER_MODULE}" "$([[ "${RUNNER_MODE}" == "automatic_rollback" ]] && echo rollback-request || echo request)" \
  --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null

if [[ "${REHEARSAL}" != "true" ]]; then
  [[ "${WEB_IMAGE}" == "${APPROVED_WEB_IMAGE}" ]] || fail web_image_identity_mismatch
  [[ "$(sha_file "${BASE_ENV_FILE}")" == "$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")" \
    && "$(sha_file "${ENV_FILE}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" \
    && "$(sha_file "${ROOT_DIR}/docker-compose.yml")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" ]] \
    || fail production_input_checksum_mismatch
fi

database_runner() {
  local command="$1" image="$2"
  "${DOCKER[@]}" run --rm --network "${NETWORK}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --volume "${SOURCE_ROOT}:${SOURCE_ROOT}:ro" --volume "${SECURE_ROOT}:${SECURE_ROOT}:ro" \
    --entrypoint node "${image}" "${RUNNER_MODULE}" "${command}" \
    --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" --admin-url-file "${ADMIN_URL_FILE}"
}

LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
LEASE_ACQUIRED=false
LEASE_CONSUMED=false
LEASE_RELEASED=false
lease_event() {
  local action="$1"; shift
  [[ "${REHEARSAL}" != "true" ]] || return 0
  run_node true "${LEASE_CLI}" "${action}" --trust-root "${AUTONOMY_TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION_FILE}" "$@" \
    | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}
lease_acquire() { lease_event acquire --owner-id "WP-G0.2-ACTIVATION:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"; }
lease_checkpoint() { lease_event checkpoint --checkpoint "$1"; }
lease_safety_checkpoint() { lease_event safety-checkpoint --checkpoint "$1"; }
lease_consume() { lease_event consume; }
lease_release() { lease_event release --outcome "$1"; }

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
RENDERED_ENV="${OPS_ROOT}/backups/env.production.activation"
STATE_FILE="${OPS_ROOT}/state/activation-state.json"
CONTROL_STARTED=false
ENV_SWITCHED=false
GIT_SWITCHED=false
WEB_RECREATE_ATTEMPTED=false
WORKER_STARTED=false

run_production_check() {
  ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    BASE_URL="${BASE_URL}" STRICT_SCAN_FRESHNESS=true REQUIRE_IDENTITY_WRAPPER="$([[ "${REHEARSAL}" == "true" ]] && echo false || echo true)" \
    IDENTITY_WRAPPER="${IDENTITY_WRAPPER}" IDENTITY_WRAPPER_SHA256="$(jq -r '.identityWrapperSha256' "${REQUEST_FILE}")" \
    IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE}" IDENTITY_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")" \
    bash "${ROOT_DIR}/scripts/verify/production-check.sh"
}

bounded_rollback() {
  local rollback_failed=false
  echo "candidate activation rollback: restoring exact dormant boundary" >&2
  [[ "${LEASE_ACQUIRED}" == "true" ]] && lease_safety_checkpoint rollback || true
  "${PROFILE_COMPOSE[@]}" stop candidate-shadow-worker >/dev/null 2>&1 || true
  "${PROFILE_COMPOSE[@]}" rm -f candidate-shadow-worker >/dev/null 2>&1 || true
  if [[ "${CONTROL_STARTED}" == "true" ]]; then
    database_runner control-rollback "${ROLLBACK_IMAGE_REF}" \
      > "${EVIDENCE_DIRECTORY}/control-rollback-redacted.json" || rollback_failed=true
  fi
  if [[ -f "${ENV_BACKUP}" ]]; then cp -p "${ENV_BACKUP}" "${ENV_FILE}" || rollback_failed=true; fi
  "${DOCKER[@]}" tag "${ROLLBACK_IMAGE_REF}" chuan-market-radar-web:latest || rollback_failed=true
  if [[ "${WEB_RECREATE_ATTEMPTED}" == "true" || "${ENV_SWITCHED}" == "true" ]]; then
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || rollback_failed=true
  fi
  git -C "${ROOT_DIR}" checkout --detach "${ROLLBACK_COMMIT}" >/dev/null 2>&1 || rollback_failed=true
  [[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${ROLLBACK_COMMIT}" ]] || rollback_failed=true
  run_production_check >/dev/null 2>&1 || rollback_failed=true
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    lease_release ROLLBACK_PASS || rollback_failed=true
    LEASE_RELEASED=true
  fi
  [[ "${rollback_failed}" == "false" ]] || fail automatic_rollback_incomplete
}

if [[ "${RUNNER_MODE}" == "automatic_rollback" ]]; then
  [[ -f "${STATE_FILE}" && -f "${ENV_BACKUP}" && -f "${LEASE_EXECUTION_FILE}" ]] || fail rollback_state_missing
  CONTROL_STARTED=true
  ENV_SWITCHED=true
  WEB_RECREATE_ATTEMPTED=true
  LEASE_ACQUIRED=true
  bounded_rollback
  echo "PASS_AUTOMATIC_ROLLBACK_TO_DORMANT"
  exit 0
fi

run_node false "${RUNNER_MODULE}" release --contract "${CONTRACT_FILE}" \
  --request "${REQUEST_FILE}" --root "${SOURCE_ROOT}" >/dev/null
run_node false "${RUNNER_MODULE}" request --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
node_or_container_evidence_check() {
  run_node false - "${DORMANT_EVIDENCE_FILE}" "${IDENTITY_EVIDENCE_FILE}" "${ROLLBACK_COMMIT}" <<'NODE'
const fs = require("node:fs");
const dormant = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const identity = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const rollbackCommit = process.argv[4];
if (dormant.status !== "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION") throw new Error("dormant_deploy_not_pass");
if (identity.status !== "PASS_RUNTIME_IDENTITY_AND_PERMISSION") throw new Error("runtime_identity_not_pass");
if (identity.productionCommit !== rollbackCommit || identity.dormantDeployCommit !== dormant.targetCommit) throw new Error("runtime_identity_lineage_mismatch");
if (identity.runtimeLogins !== 3 || identity.candidateDatabaseUrlsConfigured !== 3 || identity.candidateFeatureFlagsEnabled !== 0) throw new Error("runtime_identity_boundary_mismatch");
const completedAt = Date.parse(identity.completedAt);
if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60000 || Date.now() - completedAt > 86400000) throw new Error("runtime_identity_evidence_not_fresh");
NODE
}
node_or_container_evidence_check

[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_worktree_dirty
[[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" ]] || fail production_branch_not_detached
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${ROLLBACK_COMMIT}" ]] || fail production_rollback_commit_mismatch
if [[ "${REHEARSAL}" != "true" ]]; then
  git -C "${ROOT_DIR}" fetch --no-tags origin "${APPROVED_COMMIT}"
  [[ "$(git -C "${ROOT_DIR}" rev-parse FETCH_HEAD)" == "${APPROVED_COMMIT}" ]] || fail fetched_commit_mismatch
fi
if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_already_running
fi
database_runner control-preflight "${WEB_IMAGE}" > "${EVIDENCE_DIRECTORY}/control-preflight-redacted.json"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
"${DOCKER[@]}" tag "${WEB_IMAGE}" "${ROLLBACK_IMAGE_REF}"
if [[ "${REHEARSAL}" != "true" ]]; then
  [[ "$("${DOCKER[@]}" image inspect "${ROLLBACK_IMAGE_REF}" --format '{{.Id}}')" == "${APPROVED_WEB_IMAGE}" ]] \
    || fail rollback_image_retention_mismatch
fi

rollback_on_failure() {
  local exit_code=$?
  [[ "${exit_code}" -ne 0 ]] || return
  trap - EXIT
  echo "ERROR: activation failed; executing bounded rollback." >&2
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_CONSUMED}" != "true" \
    && "${GIT_SWITCHED}" != "true" ]]; then
    lease_release SAFE_STOP_PRE_MUTATION || true
    LEASE_RELEASED=true
  elif [[ "${LEASE_ACQUIRED}" == "true" || "${GIT_SWITCHED}" == "true" ]]; then
    bounded_rollback || true
  fi
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

lease_acquire
LEASE_ACQUIRED=true
lease_checkpoint pre_mutation
lease_consume
LEASE_CONSUMED=true
git -C "${ROOT_DIR}" checkout --detach "${APPROVED_COMMIT}"
GIT_SWITCHED=true
[[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_COMMIT}" \
  && -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_target_checkout_invalid
lease_checkpoint target_checked_out
"${PROFILE_COMPOSE[@]}" build web candidate-shadow-worker
run_node true "${RUNNER_MODULE}" render-env --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}" >/dev/null
database_runner control-start "${WEB_IMAGE}" > "${EVIDENCE_DIRECTORY}/control-start-redacted.json"
CONTROL_STARTED=true
match_file_ownership_and_mode "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
WEB_RECREATE_ATTEMPTED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
"${PROFILE_COMPOSE[@]}" up -d --no-deps --no-build candidate-shadow-worker
WORKER_STARTED=true
lease_checkpoint services_started

"${COMPOSE[@]}" exec -T web node - <<'NODE'
const expected = {
  CANDIDATE_EPISODE_CANONICAL_WRITE: "false",
  CANDIDATE_EPISODE_SHADOW_WRITE: "true",
  CANDIDATE_EPISODE_DUAL_READ: "false",
  CANDIDATE_EPISODE_CANONICAL_READ: "false",
  CANDIDATE_EPISODE_REVIEW_READ: "false",
  CANDIDATE_SHADOW_WORKER_EXPECTED: "true",
};
for (const [key, value] of Object.entries(expected)) {
  if (String(process.env[key] ?? "false").trim().toLowerCase() !== value) throw new Error(`activation_env_${key}`);
}
if (!String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "").startsWith("candidate-shadow-")) throw new Error("activation_release_missing");
const response = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
  method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await response.json();
if (response.status !== 200 || body.ok !== true || body.mode !== "active" || body.runtime?.enabled !== true
  || body.runtime?.blockers?.length !== 0 || body.monitor?.status !== "ready" || body.monitor?.phase !== "shadow_capture") {
  throw new Error("candidate_activation_contract_failed");
}
console.log(JSON.stringify({ candidateMode: body.mode, authorityEpoch: body.runtime.authorityEpoch, secretsPrinted: false }));
NODE
run_production_check
lease_checkpoint immediate_verification_passed

run_node true - "${STATE_FILE}" "${APPROVED_COMMIT}" "${ROLLBACK_COMMIT}" "${ROLLBACK_IMAGE_REF}" \
  "${RELEASE_ID}" "${LEASE_EXECUTION_FILE}" <<'NODE'
const fs = require("node:fs");
const [path, approvedCommit, rollbackCommit, rollbackWebImageRef, releaseId, leaseExecutionFile] = process.argv.slice(2);
fs.writeFileSync(path, JSON.stringify({ schemaVersion: "candidate-activation-state.v2", approvedCommit,
  rollbackCommit, rollbackWebImageRef, releaseId, leaseExecutionFile, activatedAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
NODE

if [[ "${START_CANDIDATE_OBSERVER:-true}" == "true" ]]; then
  [[ "${REHEARSAL}" != "true" ]] || fail rehearsal_observer_must_be_started_separately
  command -v systemd-run >/dev/null 2>&1 || fail systemd_run_missing
  [[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=LoadState --value 2>/dev/null || true)" == "not-found" ]] \
    || fail observer_unit_already_exists
  sudo -n systemd-run --unit="${OBSERVER_UNIT}" --collect --quiet --uid="$(id -u)" --gid="$(id -g)" \
    --property=Type=exec --property=Restart=no --property=KillMode=mixed --property=TimeoutStopSec=900 \
    --property=RuntimeMaxSec=90000 --property=UMask=0077 --property=StandardOutput=journal --property=StandardError=journal \
    --setenv=ROOT_DIR_OVERRIDE="${ROOT_DIR}" --setenv=BASE_ENV_FILE="${BASE_ENV_FILE}" \
    --setenv=ENV_FILE="${ENV_FILE}" --setenv=REQUEST_FILE="${REQUEST_FILE}" \
    --setenv=SECURE_ROOT="${SECURE_ROOT}" --setenv=OPS_ROOT="${OPS_ROOT}" \
    --setenv=EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY}" \
    --setenv=MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    --setenv=CANDIDATE_ACTIVATION_NODE_RUNTIME="${NODE_RUNTIME}" \
    --setenv=CONFIRM_CANDIDATE_OBSERVATION=true \
    /bin/bash "${SOURCE_ROOT}/scripts/production/candidate-activation/observation-runner.sh"
  [[ "$(sudo -n systemctl show "${OBSERVER_UNIT}.service" --property=ActiveState --value)" == "active" ]] \
    || fail observer_unit_not_active
  touch "${SOURCE_ROOT}/.observer-started"
elif [[ "${REHEARSAL}" != "true" ]]; then
  fail production_observer_required
fi

echo "PASS_IMMEDIATE_SHADOW_CAPTURE_AWAITING_OBSERVATION"
trap - EXIT
