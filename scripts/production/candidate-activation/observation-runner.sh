#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
SECURE_ROOT="${SECURE_ROOT:-}"
OPS_ROOT="${OPS_ROOT:-}"
EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY:-}"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-/home/ubuntu/.local/state/market-radar-autonomy}"
NODE_RUNTIME="${CANDIDATE_ACTIVATION_NODE_RUNTIME:-auto}"
CONFIRMED="${CONFIRM_CANDIDATE_OBSERVATION:-false}"
CONTRACT_FILE="${SOURCE_ROOT}/docs/governance/wp-g0-2-activation-observation-runner-preparation.v1.json"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-activation/runner.mjs"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[[ "${CONFIRMED}" == "true" ]] || fail observation_not_confirmed
[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" ]] || fail observation_request_missing
ROOT_DIR="${ROOT_DIR:-$(jq -r '.productionRoot' "${REQUEST_FILE}")}"
SECURE_ROOT="${SECURE_ROOT:-$(jq -r '.secureRoot' "${REQUEST_FILE}")}"
OPS_ROOT="${OPS_ROOT:-$(jq -r '.opsRoot' "${REQUEST_FILE}")}"
EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY:-$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")}"
[[ "${ROOT_DIR}" == "$(jq -r '.productionRoot' "${REQUEST_FILE}")" \
  && "${SECURE_ROOT}" == "$(jq -r '.secureRoot' "${REQUEST_FILE}")" \
  && "${OPS_ROOT}" == "$(jq -r '.opsRoot' "${REQUEST_FILE}")" \
  && "${EVIDENCE_DIRECTORY}" == "$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")" ]] \
  || fail observation_path_binding_mismatch
[[ -f "${SECURE_ROOT}/migration-admin.url" && -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]] \
  || fail observation_input_missing

REHEARSAL=false
case "${OPS_ROOT}/" in
  /home/ubuntu/.cache/market-radar-ops/candidate-activation-ops/wp-g0-2-candidate-activation-*/)
    SAMPLE_LIMIT=289
    INTERVAL_SECONDS=300
    ;;
  /tmp/wp_g0_2_rehearsal_candidate_activation_*/ops/)
    REHEARSAL=true
    SAMPLE_LIMIT="${OBSERVATION_REHEARSAL_SAMPLE_LIMIT:-3}"
    INTERVAL_SECONDS="${OBSERVATION_REHEARSAL_INTERVAL_SECONDS:-1}"
    ;;
  *) fail ops_root_invalid ;;
esac
[[ "${SAMPLE_LIMIT}" =~ ^[0-9]+$ && "${INTERVAL_SECONDS}" =~ ^[0-9]+$ ]] \
  || fail observation_limits_invalid
mkdir -p "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
chmod 700 "${OPS_ROOT}/evidence" "${OPS_ROOT}/state" "${EVIDENCE_DIRECTORY}"
LOCK_DIR="${OPS_ROOT}/state/observation.lock"
mkdir "${LOCK_DIR}" 2>/dev/null || fail observation_already_running
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  fail docker_unavailable
fi
if [[ "${REHEARSAL}" == "true" ]]; then
  COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
else
  IDENTITY_WRAPPER="$(jq -r '.identityWrapperPath' "${REQUEST_FILE}")"
  COMPOSE=(sudo -n "${IDENTITY_WRAPPER}" --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail observation_web_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
[[ "${WEB_IMAGE}" =~ ^sha256:[0-9a-f]{64}$ || "${REHEARSAL}" == "true" ]] \
  || fail observation_web_image_invalid

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
    --mount "type=bind,src=${SECURE_ROOT},dst=${SECURE_ROOT},readonly"
    --mount "type=bind,src=${OPS_ROOT},dst=${OPS_ROOT}"
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}"
  )
  if [[ "${REHEARSAL}" != "true" ]]; then
    mounts+=(--mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}")
  fi
  "${DOCKER[@]}" run --rm -i --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m "${mounts[@]}" \
    --entrypoint node "${WEB_IMAGE}" "$@"
}

APPROVED_COMMIT="$(jq -r '.approvedCommit' "${REQUEST_FILE}")"
RELEASE_ID="$(jq -r '.releaseId' "${REQUEST_FILE}")"
[[ -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] \
  || fail observation_commit_boundary_mismatch

LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"
lease_observation_checkpoint() {
  [[ "${REHEARSAL}" == "true" ]] && return 0
  run_node true "${LEASE_CLI}" observation-checkpoint \
    --trust-root "${AUTONOMY_TRUST_ROOT}" --request "${REQUEST_FILE}" \
    --execution "${LEASE_EXECUTION_FILE}" --checkpoint "$1" \
    | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}
lease_release_observation() {
  [[ "${REHEARSAL}" == "true" ]] && return 0
  run_node true "${LEASE_CLI}" release --trust-root "${AUTONOMY_TRUST_ROOT}" \
    --request "${REQUEST_FILE}" --execution "${LEASE_EXECUTION_FILE}" \
    --outcome PASS_OBSERVATION | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}

SAMPLES_FILE="${OPS_ROOT}/evidence/observation-samples.jsonl"
FINAL_FILE="${OPS_ROOT}/evidence/observation-final.json"
: > "${SAMPLES_FILE}"
chmod 600 "${SAMPLES_FILE}"

retain_evidence() {
  local outcome="$1"
  [[ -f "${SAMPLES_FILE}" ]] && install -m 0600 "${SAMPLES_FILE}" "${EVIDENCE_DIRECTORY}/observation-samples.jsonl"
  [[ -f "${FINAL_FILE}" ]] && install -m 0600 "${FINAL_FILE}" "${EVIDENCE_DIRECTORY}/observation-final.json"
  printf '{"schemaVersion":"candidate-observation-closeout.v1","outcome":"%s","closedAt":"%s","secretsPrinted":false}\n' \
    "${outcome}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${EVIDENCE_DIRECTORY}/observation-closeout.json"
  chmod 600 "${EVIDENCE_DIRECTORY}/observation-closeout.json"
}

cleanup_temporary_artifacts() {
  [[ "${REHEARSAL}" != "true" ]] || return 0
  local approved_staging
  approved_staging="$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
  [[ "$(jq -r '.temporaryArtifactCleanupRequired' "${REQUEST_FILE}")" == "true" \
    && "${approved_staging}" == "${SOURCE_ROOT}" \
    && "$(basename "${approved_staging}")" == wp-g0-2-candidate-activation-* \
    && "${approved_staging}" == /home/ubuntu/.cache/market-radar-ops/* \
    && "${SECURE_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
    && "${OPS_ROOT}" == /home/ubuntu/.cache/market-radar-ops/* \
    && "${EVIDENCE_DIRECTORY}" != "${approved_staging}" \
    && "${EVIDENCE_DIRECTORY}" != "${SECURE_ROOT}" \
    && "${EVIDENCE_DIRECTORY}" != "${OPS_ROOT}" ]] || fail temporary_cleanup_boundary_invalid
  rm -rf -- "${OPS_ROOT}" "${SECURE_ROOT}" "${approved_staging}"
}

automatic_rollback() {
  local exit_code=$?
  [[ "${exit_code}" -ne 0 ]] || return
  trap - ERR
  echo "ERROR: observation hard-stop; invoking pre-approved automatic rollback." >&2
  if ! CANDIDATE_ACTIVATION_MODE=automatic_rollback CONFIRM_CANDIDATE_ACTIVATION=true \
    REQUEST_FILE="${REQUEST_FILE}" ROOT_DIR_OVERRIDE="${ROOT_DIR}" \
    BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" SECURE_ROOT="${SECURE_ROOT}" \
    OPS_ROOT="${OPS_ROOT}" EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY}" \
    MARKET_RADAR_AUTONOMY_TRUST_ROOT="${AUTONOMY_TRUST_ROOT}" \
    CANDIDATE_ACTIVATION_NODE_RUNTIME="${NODE_RUNTIME}" \
    bash "${SOURCE_ROOT}/scripts/production/candidate-activation/production-runner.sh"; then
    retain_evidence ROLLBACK_FAILED
    exit 98
  fi
  retain_evidence ROLLBACK
  cleanup_temporary_artifacts
  exit "${exit_code}"
}
trap automatic_rollback ERR
lease_observation_checkpoint observation_start

for (( sample_number=1; sample_number<=SAMPLE_LIMIT; sample_number++ )); do
  lease_observation_checkpoint "sample_${sample_number}_preflight"
  API_FILE="${OPS_ROOT}/state/api-sample.json"
  DB_FILE="${OPS_ROOT}/state/database-sample.json"
  SAMPLE_FILE="${OPS_ROOT}/state/observation-sample.json"

  "${COMPOSE[@]}" exec -T -e OBS_COMMIT="${APPROVED_COMMIT}" -e OBS_RELEASE_ID="${RELEASE_ID}" web node - > "${API_FILE}" <<'NODE'
const healthResponse = await fetch("http://127.0.0.1:3000/api/health", { headers: { "cache-control": "no-store" } });
const healthBody = await healthResponse.json();
const candidateResponse = await fetch("http://127.0.0.1:3000/api/admin/candidate-shadow/run", {
  method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const candidateBody = await candidateResponse.json();
const health = healthBody.health ?? {};
process.stdout.write(JSON.stringify({
  schemaVersion: "candidate-shadow-observation-sample.v1",
  commit: process.env.OBS_COMMIT,
  releaseId: process.env.OBS_RELEASE_ID,
  health: {
    ok: healthResponse.status === 200 && healthBody.ok === true,
    level: health.level,
    scanFreshness: health.scan?.freshness,
    databaseStatus: health.persistence?.databaseStatus,
    redisStatus: health.runtimeProbes?.redis?.status,
    workers: (health.runtimeProbes?.workers ?? []).map(({ key, status, ageSec }) => ({ key, status, ageSec })),
  },
  candidate: candidateBody,
}) + "\n");
NODE

  "${COMPOSE[@]}" exec -T postgres sh -lc 'psql -X -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT json_build_object(
      '\''status'\'', '\''pass'\'',
      '\''databaseNow'\'', clock_timestamp(),
      '\''identityErrors'\'', 0,
      '\''lockWaiters'\'', (SELECT count(*)::int FROM pg_locks WHERE NOT granted),
      '\''longTransactions'\'', (SELECT count(*)::int FROM pg_stat_activity
        WHERE pid <> pg_backend_pid() AND xact_start IS NOT NULL
          AND clock_timestamp() - xact_start > interval '\''5 minutes'\'')
    )"' > "${DB_FILE}"

  run_node true - "${API_FILE}" "${DB_FILE}" "${SAMPLE_FILE}" <<'NODE'
const fs = require("node:fs");
const api = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const database = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (database.status !== "pass") throw new Error("database_observation_failed");
const sample = { ...api, sampledAt: database.databaseNow, database: {
  identityErrors: database.identityErrors,
  lockWaiters: database.lockWaiters,
  longTransactions: database.longTransactions,
} };
fs.writeFileSync(process.argv[4], JSON.stringify(sample) + "\n", { mode: 0o600 });
NODE
  run_node false "${RUNNER_MODULE}" sample --contract "${CONTRACT_FILE}" \
    --request "${REQUEST_FILE}" --input "${SAMPLE_FILE}" >/dev/null
  cat "${SAMPLE_FILE}" >> "${SAMPLES_FILE}"
  printf 'observation_sample=%s/%s status=pass\n' "${sample_number}" "${SAMPLE_LIMIT}"
  if (( sample_number < SAMPLE_LIMIT )); then sleep "${INTERVAL_SECONDS}"; fi
done

if [[ "${SAMPLE_LIMIT}" -eq 289 && "${INTERVAL_SECONDS}" -eq 300 ]]; then
  run_node false "${RUNNER_MODULE}" observe --contract "${CONTRACT_FILE}" \
    --request "${REQUEST_FILE}" --input "${SAMPLES_FILE}" > "${FINAL_FILE}"
  lease_observation_checkpoint observation_final
  retain_evidence PASS_ACTIVATE_AND_OBSERVE
  lease_release_observation
  trap - ERR
  cleanup_temporary_artifacts
  echo "PASS_ACTIVATE_AND_OBSERVE"
else
  retain_evidence PASS_REHEARSAL_OBSERVER_CONTROL_FLOW_ONLY
  echo "PASS_REHEARSAL_OBSERVER_CONTROL_FLOW_ONLY"
fi
trap - ERR
