#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
RUNNER_MODE="${CANDIDATE_LINEAGE_CAPTURE_MODE:-dry_run}"
CONFIRMED="${CONFIRM_CANDIDATE_LINEAGE_CAPTURE:-false}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-lineage/production-runner.mjs"
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

echo "package=WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET"
echo "mode=${RUNNER_MODE}"
echo "production_mutation_allowed=false"

if [[ "${RUNNER_MODE}" == "dry_run" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: no production query, mutation, phase transition, or service operation was performed."
  exit 0
fi
[[ "${RUNNER_MODE}" == "production_collect" ]] || fail runner_mode_invalid
for command_name in cmp docker git jq sha256sum sort; do
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
SPECIFICATION_FILE="${SECURE_ROOT}/capture-specification.json"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"

[[ "${ROOT_DIR}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-lineage-capture/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/lineage-capture-ops/wp-g0-2-lineage-capture-* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-candidate-lineage-* \
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
for file in "${SPECIFICATION_FILE}" "${ADMIN_URL_FILE}"; do
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
POSTGRES_CONTAINER="$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}')"
CANDIDATE_CONTAINER="$(${DOCKER[@]} ps --filter 'label=com.docker.compose.project=chuan-market-radar' \
  --filter 'label=com.docker.compose.service=candidate-shadow-worker' --format '{{.ID}}')"
[[ "${WEB_CONTAINER}" =~ ^[0-9a-f]+$ && "${POSTGRES_CONTAINER}" =~ ^[0-9a-f]+$ \
  && "${CANDIDATE_CONTAINER}" =~ ^[0-9a-f]+$ ]] || fail production_container_identity_invalid
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ "${WEB_IMAGE}" == "${APPROVED_WEB_IMAGE}" && -n "${NETWORK}" \
  && "$(${DOCKER[@]} inspect "${CANDIDATE_CONTAINER}" --format '{{.State.Status}}')" == "running" ]] \
  || fail production_runtime_identity_mismatch
${DOCKER[@]} exec -i "${WEB_CONTAINER}" node - <<'NODE'
(async () => {
  const response = await fetch("http://127.0.0.1:3000/api/health", {
    headers: { "cache-control": "no-store" },
  });
  const body = await response.json();
  const health = body.health ?? {};
  const candidate = (health.runtimeProbes?.workers ?? [])
    .find((worker) => String(worker.key).includes("candidate"));
  if (response.status !== 200 || body.ok !== true || health.level !== "ready"
      || health.scan?.freshness !== "fresh" || candidate?.status !== "healthy") {
    throw new Error("candidate_lineage_capture_runtime_not_ready");
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE

runtime_snapshot() {
  local output="$1"
  {
    printf 'git_head=%s\n' "$(git -C "${ROOT_DIR}" rev-parse HEAD)"
    printf 'git_dirty=%s\n' "$([[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] && echo false || echo true)"
    printf 'compose_sha256=%s\n' "$(sha_file "${COMPOSE_FILE}")"
    printf 'production_env_sha256=%s\n' "$(sha_file "${ENV_FILE}")"
    mapfile -t containers < <(${DOCKER[@]} ps -q --filter 'label=com.docker.compose.project=chuan-market-radar' | sort)
    for container in "${containers[@]}"; do
      ${DOCKER[@]} inspect "${container}" \
        --format 'container={{.Id}}|image={{.Image}}|name={{.Name}}|restart={{.RestartCount}}|state={{.State.Status}}'
    done
  } | sort > "${output}"
  chmod 600 "${output}"
}

runtime_snapshot "${EVIDENCE_DIRECTORY}/runtime-before.txt"
printf '%s\n' "$(sha_file "${REQUEST_FILE}")" > "${EVIDENCE_DIRECTORY}/approval-request.sha256"
chmod 600 "${EVIDENCE_DIRECTORY}/approval-request.sha256"

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

lease_event acquire --owner-id "WP-G0.2-LINEAGE-CAPTURE:$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
LEASE_ACQUIRED=true
lease_event checkpoint --checkpoint pre_read_only_capture
lease_event consume
lease_event checkpoint --checkpoint approval_consumed_before_read_only_capture

LINEAGE_OUTPUT="${EVIDENCE_DIRECTORY}/lineage-final.json"
METADATA_OUTPUT="${EVIDENCE_DIRECTORY}/lineage-capture-metadata.json"
[[ ! -e "${LINEAGE_OUTPUT}" && ! -e "${METADATA_OUTPUT}" ]] \
  || fail lineage_capture_output_already_exists
set +e
${DOCKER[@]} run --rm --network "${NETWORK}" --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --env MARKET_RADAR_APPLICATION_ROOT=/app \
  --env CANDIDATE_LINEAGE_CAPTURE_SPECIFICATION_FILE="${SPECIFICATION_FILE}" \
  --env CANDIDATE_LINEAGE_CAPTURE_DATABASE_URL_FILE="${ADMIN_URL_FILE}" \
  --env CANDIDATE_LINEAGE_CAPTURE_OUTPUT_FILE="${LINEAGE_OUTPUT}" \
  --env CANDIDATE_LINEAGE_CAPTURE_METADATA_FILE="${METADATA_OUTPUT}" \
  --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
  --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly" \
  --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
  --entrypoint node "${WEB_IMAGE}" "${RUNNER_MODULE}" collect \
  > "${EVIDENCE_DIRECTORY}/runner-stdout-redacted.json"
RUNNER_EXIT=$?
set -e
[[ "${RUNNER_EXIT}" -eq 0 ]] || fail "lineage_capture_runner_failed:${RUNNER_EXIT}"
for file in "${LINEAGE_OUTPUT}" "${METADATA_OUTPUT}"; do
  assert_private_file "${file}"
done
[[ "$(jq -r '.status // empty' "${LINEAGE_OUTPUT}")" \
    == "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH" \
  && "$(jq -r '.schemaVersion // empty' "${LINEAGE_OUTPUT}")" \
    == "candidate-multi-cycle-lineage-evidence.v3" \
  && "$(jq -r '.validationCycle // 0' "${LINEAGE_OUTPUT}")" -eq 5 \
  && "$(jq -r '.sourceReleaseCount // 0' "${LINEAGE_OUTPUT}")" -eq 5 \
  && "$(jq -r '.sourceReleaseWindows | length' "${LINEAGE_OUTPUT}")" -eq 5 \
  && "$(jq -r '.completedWrites // 0' "${LINEAGE_OUTPUT}")" -ge 10000 \
  && "$(jq -r '.activationSamples // 0' "${LINEAGE_OUTPUT}")" -ge 289 \
  && "$(jq -r '.activationCoverageSeconds // 0' "${LINEAGE_OUTPUT}")" -ge 86400 \
  && "$(jq -r '.maximumSampleGapSeconds // 0' "${LINEAGE_OUTPUT}")" -eq 600 \
  && "$(jq -r '.completionAdvances // 0' "${LINEAGE_OUTPUT}")" -ge 2 \
  && "$(jq -r '.minimumCompletionAdvances // 0' "${LINEAGE_OUTPUT}")" -eq 2 \
  && "$(jq -r '.unresolvedOutbox // 1' "${LINEAGE_OUTPUT}")" -eq 0 \
  && "$(jq -r '.unresolvedMaximum // 1' "${LINEAGE_OUTPUT}")" -eq 0 \
  && "$(jq -r '.productionReconciliationExecuted // true' "${LINEAGE_OUTPUT}")" == "false" \
  && "$(jq -r '.shadowVerifyStarted // true' "${LINEAGE_OUTPUT}")" == "false" \
  && "$(jq -r '.canonicalAuthorityChanged // true' "${LINEAGE_OUTPUT}")" == "false" \
  && "$(jq -r '.g0Completed // true' "${LINEAGE_OUTPUT}")" == "false" \
  && "$(jq -r '.databaseIdentity.currentRole // empty' "${METADATA_OUTPUT}")" == "candidate_audit_role" \
  && "$(jq -r '.databaseIdentity.transactionIsolation // empty' "${METADATA_OUTPUT}")" == "repeatable read" \
  && "$(jq -r '.databaseIdentity.transactionReadOnly // false' "${METADATA_OUTPUT}")" == "true" \
  && "$(jq -r '.databaseMutationExecuted // true' "${METADATA_OUTPUT}")" == "false" \
  && "$(jq -r '.schemaVersion // empty' "${METADATA_OUTPUT}")" \
    == "candidate-lineage-capture-result.v3" \
  && "$(jq -r '.sourceEvidenceSha256 | keys == ["unified"]' "${METADATA_OUTPUT}")" == "true" \
  && "$(jq -r '.servicesMutated | length' "${METADATA_OUTPUT}")" -eq 0 ]] \
  || fail lineage_capture_result_gate_failed

runtime_snapshot "${EVIDENCE_DIRECTORY}/runtime-after.txt"
cmp -s "${EVIDENCE_DIRECTORY}/runtime-before.txt" "${EVIDENCE_DIRECTORY}/runtime-after.txt" \
  || fail non_target_runtime_identity_changed
lease_event checkpoint --checkpoint lineage_capture_pass_verified
lease_event release --outcome PASS
LEASE_RELEASED=true
trap - EXIT
printf '{"schemaVersion":"candidate-lineage-capture-closeout.v3","outcome":"PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH","closedAt":"%s","temporaryArtifactsCleanupRequired":true,"secretsPrinted":false}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${EVIDENCE_DIRECTORY}/lineage-capture-closeout.json"
chmod 600 "${EVIDENCE_DIRECTORY}/lineage-capture-closeout.json"
printf 'PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH\n'
