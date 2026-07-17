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
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
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
  cleanup_temporary_artifacts
  exit "${exit_code}"
}
trap 'automatic_rollback "$?"' ERR

lease_event observation-checkpoint --checkpoint fresh_activation_and_accumulation_observer_started
SAMPLE_NUMBER=0
while true; do
  SAMPLE_NUMBER=$((SAMPLE_NUMBER + 1))
  API_FILE="${OPS_ROOT}/state/api-sample.json"
  DB_FILE="${OPS_ROOT}/state/database-sample.json"
  SAMPLE_FILE="${OPS_ROOT}/state/combined-sample.json"
  "${COMPOSE[@]}" exec -T -e OBS_COMMIT="${TARGET_COMMIT}" \
    -e OBS_CYCLE="${NEXT_CYCLE}" -e OBS_RELEASE="${NEXT_RELEASE}" web node - > "${API_FILE}" <<'NODE'
(async () => {
  const healthResponse = await fetch("http://127.0.0.1:3000/api/health", { headers: { "cache-control": "no-store" } });
  const healthBody = await healthResponse.json();
  const candidateResponse = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
    method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const candidate = await candidateResponse.json();
  const health = healthBody.health ?? {};
  const workers = health.runtimeProbes?.workers ?? [];
  const candidateWorker = workers.find((worker) => String(worker.key).includes("candidate"));
  const allExpectedHealthy = workers.filter((worker) => worker.expected !== false)
    .every((worker) => worker.status === "healthy");
  if (healthResponse.status !== 200 || healthBody.ok !== true || candidateResponse.status !== 200
      || candidate.ok !== true || candidate.mode !== "active" || candidate.runtime?.enabled !== true
      || candidate.runtime?.blockers?.length !== 0 || candidate.monitor?.status !== "ready"
      || candidate.monitor?.migrationId !== process.env.OBS_CYCLE
      || candidate.monitor?.phase !== "shadow_capture"
      || process.env.CANDIDATE_RUNTIME_MIGRATION_ID !== process.env.OBS_CYCLE
      || process.env.CANDIDATE_RUNTIME_RELEASE_ID !== process.env.OBS_RELEASE) {
    throw new Error("cycle_observation_api_contract_failed");
  }
  process.stdout.write(JSON.stringify({
    commit: process.env.OBS_COMMIT,
    health: {
      ok: healthResponse.status === 200 && healthBody.ok === true,
      level: health.level,
      scanFreshness: health.scan?.freshness,
      database: health.persistence?.databaseStatus,
      redis: health.runtimeProbes?.redis?.status,
      candidateWorker: candidateWorker?.status,
      workersHealthy: allExpectedHealthy,
    },
    candidate,
  }) + "\n");
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE
  database_snapshot > "${DB_FILE}"
  run_node true - "${API_FILE}" "${DB_FILE}" "${SAMPLE_FILE}" <<'NODE'
const fs = require("node:fs");
const api = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const database = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const { secretsPrinted: _ignored, schemaVersion: _schema, status: _status, ...db } = database;
const sample = {
  schemaVersion: "candidate-validation-cycle-observation-sample.v2",
  ...db,
  commit: api.commit,
  health: api.health,
  candidate: api.candidate,
};
fs.writeFileSync(process.argv[4], JSON.stringify(sample) + "\n", { mode: 0o600 });
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
