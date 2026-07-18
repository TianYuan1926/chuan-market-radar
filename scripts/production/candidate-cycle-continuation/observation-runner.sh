#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
CONFIRMED="${CONFIRM_CANDIDATE_CYCLE_OBSERVATION:-false}"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-cycle-continuation/runner.mjs"
OBSERVER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-cycle-continuation/observation-runner.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[[ "${CONFIRMED}" == "true" ]] || fail observation_not_confirmed
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" ]] || fail observation_request_missing
ROOT_DIR="$(jq -r '.productionRoot' "${REQUEST_FILE}")"
SECURE_ROOT="$(jq -r '.secureRoot' "${REQUEST_FILE}")"
OPS_ROOT="$(jq -r '.opsRoot' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")}"
BASE_ENV_FILE="${ROOT_DIR}/.env"
ENV_FILE="${ROOT_DIR}/.env.production"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"
IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
TARGET_COMMIT="$(jq -r '.targetCommit' "${REQUEST_FILE}")"
NEXT_CYCLE="$(jq -r '.nextMigrationId' "${REQUEST_FILE}")"
NEXT_RELEASE="$(jq -r '.nextReleaseId' "${REQUEST_FILE}")"
ROLLBACK_COMMIT="$(jq -r '.currentProductionCommit' "${REQUEST_FILE}")"
ROLLBACK_WEB_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
[[ "${ROOT_DIR}" == "/home/ubuntu/apps/chuan-market-radar" \
  && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-cycle-continuation/* \
  && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-* \
  && "${EVIDENCE_DIRECTORY}" == /home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-* \
  && "${AUTONOMY_TRUST_ROOT}" == "/home/ubuntu/.local/state/market-radar-autonomy" ]] \
  || fail observation_path_boundary_invalid
for file in "${BASE_ENV_FILE}" "${ENV_FILE}" "${ADMIN_URL_FILE}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || fail "observation_input_missing:$(basename "${file}")"
done
mkdir -p "${OPS_ROOT}/observation" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}/observation" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
LOCK_DIR="${OPS_ROOT}/state/observation.lock"
mkdir "${LOCK_DIR}" 2>/dev/null || fail observation_already_running
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

DOCKER=(sudo -n docker)
COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
PROFILE_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" --profile candidate-shadow-runtime)
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail observation_web_missing
WEB_IMAGE="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$(${DOCKER[@]} inspect "${WEB_CONTAINER}" \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail observation_runtime_identity_missing

run_node() {
  local write_ops="$1"; shift
  local -a mounts=(
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly"
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly"
    --mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  [[ "${write_ops}" != "true" ]] || mounts+=(--mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}")
  ${DOCKER[@]} run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}
database_snapshot() {
  ${DOCKER[@]} run --rm --network "${NETWORK}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT},dst=${SOURCE_ROOT},readonly" \
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly" \
    --entrypoint node "${WEB_IMAGE}" "${RUNNER_MODULE}" observation-snapshot \
    --request "${REQUEST_FILE}" --admin-url-file "${ADMIN_URL_FILE}"
}
LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
lease_event() {
  local action="$1"; shift
  run_node true "${LEASE_CLI}" "${action}" --trust-root "${AUTONOMY_TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION_FILE}" "$@" \
    | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}

SAMPLES_FILE="${OPS_ROOT}/observation/cycle-observation-samples.jsonl"
FINAL_FILE="${OPS_ROOT}/observation/cycle-observation-final.json"
: > "${SAMPLES_FILE}"
chmod 600 "${SAMPLES_FILE}"

retain_evidence() {
  local outcome="$1"
  [[ -f "${SAMPLES_FILE}" ]] && install -m 0600 "${SAMPLES_FILE}" "${EVIDENCE_DIRECTORY}/cycle-observation-samples.jsonl"
  [[ -f "${FINAL_FILE}" ]] && install -m 0600 "${FINAL_FILE}" "${EVIDENCE_DIRECTORY}/cycle-observation-final.json"
  printf '{"schemaVersion":"candidate-cycle-observation-closeout.v1","outcome":"%s","closedAt":"%s","secretsPrinted":false}\n' \
    "${outcome}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${EVIDENCE_DIRECTORY}/cycle-observation-closeout.json"
  chmod 600 "${EVIDENCE_DIRECTORY}/cycle-observation-closeout.json"
}

cleanup_target_image() {
  local image_id="$1"
  local baseline_image="$2"
  local container_ids image_inventory
  [[ -z "${image_id}" ]] && return 0
  [[ "${image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || { echo "ERROR: cleanup_target_image_identity_invalid" >&2; return 1; }
  [[ "${image_id}" != "${baseline_image}" ]] || return 0
  if ! container_ids="$(${DOCKER[@]} ps -aq --filter "ancestor=${image_id}")"; then
    echo "ERROR: cleanup_target_image_usage_check_failed" >&2
    return 1
  fi
  [[ -z "${container_ids}" ]] \
    || { echo "ERROR: cleanup_target_image_still_in_use" >&2; return 1; }
  if ! image_inventory="$(${DOCKER[@]} image ls --no-trunc --quiet)"; then
    echo "ERROR: cleanup_image_inventory_failed" >&2
    return 1
  fi
  if [[ $'\n'"${image_inventory}"$'\n' == *$'\n'"${image_id}"$'\n'* ]]; then
    ${DOCKER[@]} image rm "${image_id}" >/dev/null \
      || { echo "ERROR: cleanup_target_image_remove_failed" >&2; return 1; }
  fi
}

cleanup_rollback_image_artifacts() {
  local target_file="${EVIDENCE_DIRECTORY}/target-images-redacted.json"
  local baseline_image target_web_image target_worker_image current_web_container current_web_image candidate_containers
  local git_status git_head rollback_ref_id
  if ! baseline_image="$(jq -r '.currentWebImageId' "${REQUEST_FILE}")"; then
    echo "ERROR: cleanup_request_read_failed" >&2
    return 1
  fi
  [[ "${ROLLBACK_WEB_REF}" == market-radar-rollback/wp-g0-2-cycle-continuation:web-* \
    && "${baseline_image}" =~ ^sha256:[0-9a-f]{64}$ \
    && -f "${target_file}" && ! -L "${target_file}" ]] \
    || { echo "ERROR: cleanup_image_boundary_invalid" >&2; return 1; }
  if ! target_web_image="$(jq -r '.webImageId' "${target_file}")" \
      || ! target_worker_image="$(jq -r '.workerImageId' "${target_file}")"; then
    echo "ERROR: cleanup_target_image_evidence_read_failed" >&2
    return 1
  fi
  if ! current_web_container="$("${COMPOSE[@]}" ps -q web)"; then
    echo "ERROR: cleanup_baseline_web_query_failed" >&2
    return 1
  fi
  [[ -n "${current_web_container}" ]] \
    || { echo "ERROR: cleanup_baseline_web_missing" >&2; return 1; }
  if ! current_web_image="$(${DOCKER[@]} inspect "${current_web_container}" --format '{{.Image}}')"; then
    echo "ERROR: cleanup_baseline_web_inspect_failed" >&2
    return 1
  fi
  if ! candidate_containers="$(${DOCKER[@]} ps -aq \
      --filter 'label=com.docker.compose.project=chuan-market-radar' \
      --filter 'label=com.docker.compose.service=candidate-shadow-worker')"; then
    echo "ERROR: cleanup_candidate_container_check_failed" >&2
    return 1
  fi
  if ! git_status="$(git -C "${ROOT_DIR}" status --porcelain)" \
      || ! git_head="$(git -C "${ROOT_DIR}" rev-parse HEAD)"; then
    echo "ERROR: cleanup_git_identity_check_failed" >&2
    return 1
  fi
  [[ "${current_web_image}" == "${baseline_image}" \
    && -z "${candidate_containers}" \
    && -z "${git_status}" \
    && "${git_head}" == "${ROLLBACK_COMMIT}" ]] \
    || { echo "ERROR: cleanup_baseline_identity_mismatch" >&2; return 1; }
  if ! rollback_ref_id="$(${DOCKER[@]} image ls --no-trunc --quiet "${ROLLBACK_WEB_REF}")"; then
    echo "ERROR: cleanup_rollback_image_ref_query_failed" >&2
    return 1
  fi
  [[ -z "${rollback_ref_id}" || "${rollback_ref_id}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || { echo "ERROR: cleanup_rollback_image_ref_identity_invalid" >&2; return 1; }
  if [[ -n "${rollback_ref_id}" ]]; then
    ${DOCKER[@]} image rm "${ROLLBACK_WEB_REF}" >/dev/null \
      || { echo "ERROR: cleanup_rollback_image_ref_remove_failed" >&2; return 1; }
  fi
  cleanup_target_image "${target_worker_image}" "${baseline_image}" || return 1
  if [[ "${target_web_image}" != "${target_worker_image}" ]]; then
    cleanup_target_image "${target_web_image}" "${baseline_image}" || return 1
  fi
  printf '{"schemaVersion":"candidate-cycle-observation-rollback-image-cleanup.v1","status":"PASS","evidenceRetained":true,"secretsPrinted":false}\n' \
    > "${EVIDENCE_DIRECTORY}/rollback-image-cleanup-redacted.json" \
    || { echo "ERROR: cleanup_evidence_write_failed" >&2; return 1; }
  chmod 600 "${EVIDENCE_DIRECTORY}/rollback-image-cleanup-redacted.json" \
    || { echo "ERROR: cleanup_evidence_permissions_failed" >&2; return 1; }
}

cleanup_temporary_artifacts() {
  local staging="$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
  [[ "$(jq -r '.temporaryArtifactCleanupRequired' "${REQUEST_FILE}")" == "true" \
    && "${staging}" == "${SOURCE_ROOT}" \
    && "${staging}" == /home/ubuntu/.cache/market-radar-ops/wp-g0-2-cycle-continuation-* \
    && "${SECURE_ROOT}" == /home/ubuntu/.local/state/market-radar-cycle-continuation/* \
    && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-* \
    && "${EVIDENCE_DIRECTORY}" != "${staging}" \
    && "${EVIDENCE_DIRECTORY}" != "${SECURE_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${OPS_ROOT}" ]] || fail cleanup_boundary_invalid
  rm -rf -- "${OPS_ROOT}" "${SECURE_ROOT}" "${staging}"
}

automatic_rollback() {
  local exit_code="${1:-$?}"
  trap - ERR
  echo "ERROR: cycle observation hard-stop; invoking pre-approved Legacy-safe rollback." >&2
  if ! CANDIDATE_CYCLE_CONTINUATION_MODE=automatic_rollback \
    CONFIRM_CANDIDATE_CYCLE_CONTINUATION=true REQUEST_FILE="${REQUEST_FILE}" \
    MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    bash "${SOURCE_ROOT}/scripts/production/candidate-cycle-continuation/production-runner.sh"; then
    retain_evidence ROLLBACK_FAILED
    exit 98
  fi
  retain_evidence ROLLBACK_TO_LEGACY_AUTHORITY
  cleanup_rollback_image_artifacts
  cleanup_temporary_artifacts
  exit "${exit_code}"
}
trap 'automatic_rollback "$?"' ERR

lease_event observation-checkpoint --checkpoint fresh_activation_and_accumulation_observer_started
SAMPLE_NUMBER=0
while true; do
  SAMPLE_NUMBER=$((SAMPLE_NUMBER + 1))
  HEALTH_FILE="${OPS_ROOT}/state/health-sample.json"
  API_FILE="${OPS_ROOT}/state/api-sample.json"
  DB_BEFORE_FILE="${OPS_ROOT}/state/database-before-sample.json"
  DB_AFTER_FILE="${OPS_ROOT}/state/database-after-sample.json"
  SAMPLE_FILE="${OPS_ROOT}/state/combined-sample.json"
  "${COMPOSE[@]}" exec -T web node - > "${HEALTH_FILE}" <<'NODE'
(async () => {
  const {
    classifyCycleObservationHealth,
    HEALTH_RECHECK_INTERVAL_SECONDS,
    MAXIMUM_HEALTH_RECHECK_SECONDS,
  } = await import("file:///app/scripts/production/candidate-cycle-continuation/observation-runner.mjs");
  const healthRecheckDeadline = Date.now() + MAXIMUM_HEALTH_RECHECK_SECONDS * 1_000;
  let acceptedHealth;
  while (true) {
    const healthResponse = await fetch("http://127.0.0.1:3000/api/health", {
      headers: { "cache-control": "no-store" },
    });
    const healthBody = await healthResponse.json();
    const health = healthBody.health ?? {};
    const workers = health.runtimeProbes?.workers ?? [];
    const candidateWorker = workers.find((worker) => String(worker.key).includes("candidate"));
    const allExpectedHealthy = workers.filter((worker) => worker.expected !== false)
      .every((worker) => worker.status === "healthy");
    const classification = classifyCycleObservationHealth({
      httpStatus: healthResponse.status,
      bodyOk: healthBody.ok,
      level: health.level,
      scanFreshness: health.scan?.freshness,
      database: health.persistence?.databaseStatus,
      redis: health.runtimeProbes?.redis?.status,
      candidateWorker: candidateWorker?.status,
      workersHealthy: allExpectedHealthy,
    });
    if (classification.action === "accept_fresh") {
      acceptedHealth = { healthResponse, healthBody, health, candidateWorker, allExpectedHealthy };
      break;
    }
    if (classification.action !== "retry_aging") {
      throw new Error(`cycle_observation_health_contract_failed:${classification.reason}`);
    }
    const remainingMs = healthRecheckDeadline - Date.now();
    if (remainingMs <= 0) throw new Error("cycle_observation_health_recheck_exhausted");
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(HEALTH_RECHECK_INTERVAL_SECONDS * 1_000, remainingMs),
    ));
  }
  const { healthResponse, healthBody, health, candidateWorker, allExpectedHealthy } = acceptedHealth;
  process.stdout.write(JSON.stringify({
    health: {
      ok: healthResponse.status === 200 && healthBody.ok === true,
      level: health.level,
      scanFreshness: health.scan?.freshness,
      database: health.persistence?.databaseStatus,
      redis: health.runtimeProbes?.redis?.status,
      candidateWorker: candidateWorker?.status,
      workersHealthy: allExpectedHealthy,
    },
  }) + "\n");
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
  database_snapshot > "${DB_BEFORE_FILE}"
  "${COMPOSE[@]}" exec -T -e OBS_COMMIT="${TARGET_COMMIT}" \
    -e OBS_CYCLE="${NEXT_CYCLE}" -e OBS_RELEASE="${NEXT_RELEASE}" web node - > "${API_FILE}" <<'NODE'
(async () => {
  const candidateResponse = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
    method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const candidate = await candidateResponse.json();
  if (candidateResponse.status !== 200 || candidate.ok !== true || candidate.mode !== "active"
      || candidate.runtime?.enabled !== true
      || candidate.runtime?.blockers?.length !== 0 || candidate.monitor?.status !== "ready"
      || candidate.monitor?.migrationId !== process.env.OBS_CYCLE
      || candidate.monitor?.phase !== "shadow_capture"
      || process.env.CANDIDATE_RUNTIME_MIGRATION_ID !== process.env.OBS_CYCLE
      || process.env.CANDIDATE_RUNTIME_RELEASE_ID !== process.env.OBS_RELEASE) {
    throw new Error("cycle_observation_api_contract_failed");
  }
  process.stdout.write(JSON.stringify({
    commit: process.env.OBS_COMMIT,
    candidate,
  }) + "\n");
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
  database_snapshot > "${DB_AFTER_FILE}"
  run_node true - "${HEALTH_FILE}" "${API_FILE}" "${DB_BEFORE_FILE}" \
    "${DB_AFTER_FILE}" "${SAMPLE_FILE}" <<'NODE'
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const api = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const beforeDatabase = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const afterDatabase = JSON.parse(fs.readFileSync(process.argv[5], "utf8"));
const sanitizeDatabase = (database) => {
  const { secretsPrinted: _ignored, schemaVersion: _schema, status: _status, ...db } = database;
  return db;
};
const before = sanitizeDatabase(beforeDatabase);
const after = sanitizeDatabase(afterDatabase);
const sample = {
  schemaVersion: "candidate-validation-cycle-observation-sample.v3",
  ...after,
  commit: api.commit,
  health: health.health,
  candidate: api.candidate,
  databaseWindow: { before, after },
};
fs.writeFileSync(process.argv[6], JSON.stringify(sample) + "\n", { mode: 0o600 });
NODE
  cat "${SAMPLE_FILE}" >> "${SAMPLES_FILE}"
  run_node true "${OBSERVER_MODULE}" evaluate --input "${SAMPLES_FILE}" \
    --commit "${TARGET_COMMIT}" --migration-id "${NEXT_CYCLE}" --release-id "${NEXT_RELEASE}" \
    > "${FINAL_FILE}"
  STATUS="$(jq -r '.status' "${FINAL_FILE}")"
  COMPLETED="$(jq -r '.completedWrites' "${FINAL_FILE}")"
  printf 'cycle_observation_sample=%s completed=%s status=%s\n' "${SAMPLE_NUMBER}" "${COMPLETED}" "${STATUS}"
  lease_event observation-checkpoint --checkpoint "fresh_activation_accumulation_sample_${SAMPLE_NUMBER}"
  if [[ "${STATUS}" == "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE" ]]; then
    retain_evidence "${STATUS}"
    lease_event release --outcome PASS_OBSERVATION
    trap - ERR
    cleanup_temporary_artifacts
    echo "${STATUS}"
    exit 0
  fi
  [[ "${STATUS}" == "IN_PROGRESS_FRESH_ACTIVATION_AND_ACCUMULATION" \
    || "${STATUS}" == "IN_PROGRESS_FRESH_ACTIVATION_OBSERVATION" \
    || "${STATUS}" == "IN_PROGRESS_ACCUMULATING_REAL_WRITES" ]] \
    || fail "cycle_observation_terminal:${STATUS}"
  sleep 300
done
