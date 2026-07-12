#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${SOURCE_ROOT}}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
SECURE_ROOT="${SECURE_ROOT:-}"
OPS_ROOT="${OPS_ROOT:-}"
CONFIRMED="${CONFIRM_CANDIDATE_OBSERVATION:-false}"
CONTRACT_FILE="${SOURCE_ROOT}/docs/governance/wp-g0-2-activation-observation-runner-preparation.v1.json"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-activation/runner.mjs"
REQUEST_FILE="${SECURE_ROOT}/request.json"
ADMIN_URL_FILE="${SECURE_ROOT}/migration-admin.url"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[[ "${CONFIRMED}" == "true" ]] || fail observation_not_confirmed
[[ -n "${SECURE_ROOT}" && -n "${OPS_ROOT}" ]] || fail observation_paths_missing
[[ -f "${REQUEST_FILE}" && -f "${ADMIN_URL_FILE}" ]] || fail observation_secure_files_missing
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]] || fail observation_env_missing
case "${OPS_ROOT}/" in
  /var/lib/market-radar-ops/wp-g0-2-candidate-activation-*/) SAMPLE_LIMIT=289; INTERVAL_SECONDS=300 ;;
  /tmp/wp_g0_2_rehearsal_candidate_activation_*/)
    SAMPLE_LIMIT="${OBSERVATION_REHEARSAL_SAMPLE_LIMIT:-3}"
    INTERVAL_SECONDS="${OBSERVATION_REHEARSAL_INTERVAL_SECONDS:-1}"
    ;;
  *) fail ops_root_invalid ;;
esac
[[ "${SAMPLE_LIMIT}" =~ ^[0-9]+$ && "${INTERVAL_SECONDS}" =~ ^[0-9]+$ ]] || fail observation_limits_invalid

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  fail docker_unavailable
fi
COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
mkdir -p "${OPS_ROOT}/evidence" "${OPS_ROOT}/state"
chmod 700 "${OPS_ROOT}/evidence" "${OPS_ROOT}/state"
LOCK_DIR="${OPS_ROOT}/state/observation.lock"
mkdir "${LOCK_DIR}" 2>/dev/null || fail observation_already_running
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

read -r APPROVED_COMMIT RELEASE_ID < <(node - "${REQUEST_FILE}" <<'NODE'
const request = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
console.log(`${request.approvedCommit} ${request.releaseId}`);
NODE
)
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] || fail observation_commit_mismatch

WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail observation_web_missing

SAMPLES_FILE="${OPS_ROOT}/evidence/observation-samples.jsonl"
FINAL_FILE="${OPS_ROOT}/evidence/observation-final.json"
: > "${SAMPLES_FILE}"
chmod 600 "${SAMPLES_FILE}"

automatic_rollback() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then return; fi
  echo "ERROR: observation hard-stop; invoking pre-approved automatic rollback." >&2
  CANDIDATE_ACTIVATION_MODE=automatic_rollback CONFIRM_CANDIDATE_ACTIVATION=true \
    ROOT_DIR_OVERRIDE="${ROOT_DIR}" BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" \
    SECURE_ROOT="${SECURE_ROOT}" OPS_ROOT="${OPS_ROOT}" \
    bash "${SOURCE_ROOT}/scripts/production/candidate-activation/production-runner.sh" || true
  exit "${exit_code}"
}
trap automatic_rollback ERR

for (( sample_number=1; sample_number<=SAMPLE_LIMIT; sample_number++ )); do
  API_FILE="${OPS_ROOT}/state/api-sample.json"
  DB_FILE="${OPS_ROOT}/state/database-sample.json"
  SAMPLE_FILE="${OPS_ROOT}/state/observation-sample.json"

  "${COMPOSE[@]}" exec -T \
    -e OBS_COMMIT="${APPROVED_COMMIT}" -e OBS_RELEASE_ID="${RELEASE_ID}" web node - > "${API_FILE}" <<'NODE'
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

  node - "${API_FILE}" "${DB_FILE}" "${SAMPLE_FILE}" <<'NODE'
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
  node "${RUNNER_MODULE}" sample --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
    --input "${SAMPLE_FILE}" >/dev/null
  cat "${SAMPLE_FILE}" >> "${SAMPLES_FILE}"
  printf 'observation_sample=%s/%s status=pass\n' "${sample_number}" "${SAMPLE_LIMIT}"
  if (( sample_number < SAMPLE_LIMIT )); then sleep "${INTERVAL_SECONDS}"; fi
done

if [[ "${SAMPLE_LIMIT}" -eq 289 && "${INTERVAL_SECONDS}" -eq 300 ]]; then
  node "${RUNNER_MODULE}" observe --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" \
    --input "${SAMPLES_FILE}" > "${FINAL_FILE}"
  echo "PASS_ACTIVATE_AND_OBSERVE"
else
  echo "PASS_REHEARSAL_OBSERVER_CONTROL_FLOW_ONLY"
fi
trap - ERR
