#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
RUNNER_MODE="${CANDIDATE_RECONCILIATION_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_RECONCILIATION:-false}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-reconciliation/runner.mjs"
PREPARATION_CONTRACT="${SOURCE_ROOT}/docs/governance/wp-g0-2-shadow-verify-reconciliation-preparation.v1.json"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
sha_file() { sha256sum "$1" | awk '{print $1}'; }
assert_private_file() {
  [[ -f "$1" && ! -L "$1" ]] || fail "secure_file_invalid:$(basename "$1")"
  local mode
  mode="$(file_mode "$1")"
  (( (8#${mode} & 8#077) == 0 )) || fail "secure_file_permissions_too_open:$(basename "$1")"
}

echo "package=WP-G0.2-SHADOW-VERIFY-RECONCILIATION"
echo "mode=${RUNNER_MODE}"
echo "production_mutation_allowed=false"

if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: no production query, mutation, phase transition, or service operation was performed."
  exit 0
fi
[[ "${RUNNER_MODE}" == "production_collect" ]] || fail runner_mode_invalid
for command_name in docker git jq sha256sum; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "required_command_missing:${command_name}"
done

assert_private_file "${REQUEST_FILE}"
ROOT_DIR="$(jq -r '.productionRoot // empty' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot // empty' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot // empty' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory // empty' "${REQUEST_FILE}")"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-$(jq -r '.autonomyTrustRoot // empty' "${REQUEST_FILE}")}"
BASE_ENV_FILE="${ROOT_DIR}/.env"
ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"

[[ "${ROOT_DIR}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-reconciliation/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/reconciliation-ops/wp-g0-2-reconciliation-* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-reconciliation-* \
  && "${AUTONOMY_TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" \
  && "${SECURE_ROOT}" != "${OPS_ROOT}" \
  && "${SECURE_ROOT}" != "${EVIDENCE_DIRECTORY}" \
  && "${OPS_ROOT}" != "${EVIDENCE_DIRECTORY}" ]] || fail approved_path_boundary_invalid
[[ -d "${ROOT_DIR}/.git" && ! -L "${ROOT_DIR}" \
  && -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" && -f "${COMPOSE_FILE}" ]] \
  || fail production_runtime_file_missing
[[ ! -L "${AUTONOMY_TRUST_ROOT}" ]] || fail autonomy_trust_root_invalid

mkdir -p "${OPS_ROOT}" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}" "${EVIDENCE_DIRECTORY}"
INNER_REQUEST="${SECURE_ROOT}/reconciliation-request.json"
ACTIVATION_FINAL="${SECURE_ROOT}/observation-final.json"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
for file in "${INNER_REQUEST}" "${ACTIVATION_FINAL}" "${ADMIN_URL_FILE}"; do
  assert_private_file "${file}"
done

APPROVED_COMMIT="$(jq -r '.approvedProductionCommit' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE="$(jq -r '.webImageId' "${REQUEST_FILE}")"
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] \
  || fail production_git_identity_mismatch
[[ "$(sha_file "${COMPOSE_FILE}")" == "$(jq -r '.composeSha256' "${REQUEST_FILE}")" \
  && "$(sha_file "${ENV_FILE}")" == "$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")" ]] \
  || fail production_stable_input_checksum_mismatch

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi
WEB_CONTAINER="$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=web' --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]+$ ]] || fail production_web_container_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ "${WEB_IMAGE}" == "${APPROVED_WEB_IMAGE}" && -n "${NETWORK}" ]] \
  || fail production_web_identity_mismatch
[[ -z "$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=candidate-shadow-worker' --format '{{.ID}}')" ]] \
  || fail candidate_shadow_worker_still_active

run_lease_node() {
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
    --mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}

LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
LEASE_ACQUIRED=false
LEASE_RELEASED=false
lease_event() {
  local action="$1"
  shift
  run_lease_node "${LEASE_CLI}" "${action}" --trust-root "${AUTONOMY_TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION_FILE}" "$@" \
    | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}
release_on_failure() {
  local exit_code=$?
  [[ "${exit_code}" -ne 0 ]] || return
  trap - EXIT
  if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
    lease_event release --outcome SAFE_STOP_PRE_MUTATION || true
  fi
  exit "${exit_code}"
}
trap release_on_failure EXIT

lease_event acquire --owner-id "WP-G0.2-RECONCILIATION:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre_read_only_query
lease_event consume
lease_event checkpoint --checkpoint approval_consumed_before_read_only_query

OUTPUT_FILE="${EVIDENCE_DIRECTORY}/reconciliation-result.json"
[[ ! -e "${OUTPUT_FILE}" ]] || fail reconciliation_output_already_exists
set +e
${DOCKER[@]} run --rm --network "${NETWORK}" --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --env MARKET_RADAR_APPLICATION_ROOT=/app \
  --env CANDIDATE_RECONCILIATION_REQUEST_FILE="${INNER_REQUEST}" \
  --env CANDIDATE_RECONCILIATION_CONTRACT_FILE="${PREPARATION_CONTRACT}" \
  --env CANDIDATE_ACTIVATION_EVIDENCE_FILE="${ACTIVATION_FINAL}" \
  --env CANDIDATE_RECONCILIATION_DATABASE_URL_FILE="${ADMIN_URL_FILE}" \
  --env CANDIDATE_RECONCILIATION_OUTPUT_FILE="${OUTPUT_FILE}" \
  --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
  --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly" \
  --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
  --entrypoint node "${WEB_IMAGE}" "${RUNNER_MODULE}" collect \
  > "${EVIDENCE_DIRECTORY}/runner-stdout-redacted.json"
RUNNER_EXIT=$?
set -e
[[ "${RUNNER_EXIT}" -eq 0 ]] || fail "reconciliation_runner_failed:${RUNNER_EXIT}"
assert_private_file "${OUTPUT_FILE}"
[[ "$(jq -r '.status // empty' "${OUTPUT_FILE}")" \
    == "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL" \
  && "$(jq -r '.comparedWrites // 0' "${OUTPUT_FILE}")" -ge 10000 \
  && "$(jq -r '.comparisonDifferences // -1' "${OUTPUT_FILE}")" -eq 0 \
  && "$(jq -r '.automaticPhaseAdvance // true' "${OUTPUT_FILE}")" == "false" \
  && "$(jq -r '.phaseTransitionExecuted // true' "${OUTPUT_FILE}")" == "false" \
  && "$(jq -r '.databaseIdentity.currentRole // empty' "${OUTPUT_FILE}")" == "candidate_audit_role" \
  && "$(jq -r '.databaseIdentity.transactionReadOnly // false' "${OUTPUT_FILE}")" == "true" ]] \
  || fail reconciliation_result_gate_failed
lease_event checkpoint --checkpoint reconciliation_pass_verified
lease_event release --outcome PASS
LEASE_RELEASED=true
trap - EXIT
printf 'PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL\n'
