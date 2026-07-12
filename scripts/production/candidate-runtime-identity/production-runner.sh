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
CONTRACT_FILE="${SOURCE_ROOT}/docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json"
RUNNER_MODULE="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runner.mjs"
ACCESS_SQL="${SOURCE_ROOT}/scripts/production/candidate-runtime-identity/runtime-access.sql"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

stat_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

stat_uid() {
  stat -f '%u' "$1" 2>/dev/null || stat -c '%u' "$1"
}

stat_gid() {
  stat -f '%g' "$1" 2>/dev/null || stat -c '%g' "$1"
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

echo "package=WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION"
echo "mode=${RUNNER_MODE}"
echo "service_allowlist=web"

if [[ "${RUNNER_MODE}" != "production_identity" || "${CONFIRMED}" != "true" ]]; then
  echo "DRY-RUN: production roles, permissions, environment and services were not changed."
  echo "DRY-RUN: Dormant Deploy final PASS and an exact time-bounded approval are required."
  exit 0
fi

[[ -n "${SECURE_ROOT}" && -d "${SECURE_ROOT}" ]] || fail secure_root_missing
[[ -n "${OPS_ROOT}" ]] || fail ops_root_missing
case "${OPS_ROOT}/" in
  /var/lib/market-radar-ops/wp-g0-2-runtime-identity-*/) ;;
  /tmp/wp_g0_2_rehearsal_runtime_identity_runner_*/) ;;
  *) fail ops_root_invalid ;;
esac
mkdir -p "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"
chmod 700 "${OPS_ROOT}" "${OPS_ROOT}/backups" "${OPS_ROOT}/evidence"

REQUEST_FILE="${SECURE_ROOT}/request.json"
CREDENTIAL_FILE="${SECURE_ROOT}/credentials.json"
ADMIN_URL_FILE="${SECURE_ROOT}/role-admin.url"
DORMANT_EVIDENCE_FILE="${SECURE_ROOT}/dormant-deploy-result.json"
for file in "${REQUEST_FILE}" "${CREDENTIAL_FILE}" "${ADMIN_URL_FILE}" "${DORMANT_EVIDENCE_FILE}"; do
  [[ -f "${file}" ]] || fail "secure_file_missing:$(basename "${file}")"
  assert_private_file "${file}"
done
[[ -f "${BASE_ENV_FILE}" && -f "${ENV_FILE}" ]] || fail production_env_missing

node "${RUNNER_MODULE}" request --contract "${CONTRACT_FILE}" --request "${REQUEST_FILE}" >/dev/null
node "${RUNNER_MODULE}" credentials --credentials "${CREDENTIAL_FILE}" >/dev/null
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env --env-file "${BASE_ENV_FILE}" >/dev/null
node "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs" env --env-file "${ENV_FILE}" >/dev/null

read -r APPROVED_COMMIT ACCESS_SHA < <(node - "${REQUEST_FILE}" "${DORMANT_EVIDENCE_FILE}" <<'NODE'
const fs = require("node:fs");
const request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const dormant = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (dormant.status !== "PASS_DORMANT_RUNTIME_DEPLOY") throw new Error("dormant_deploy_not_pass");
if (dormant.productionCommit !== request.approvedCommit) throw new Error("dormant_commit_mismatch");
const completedAt = Date.parse(dormant.completedAt);
if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60_000 || Date.now() - completedAt > 24 * 60 * 60_000) {
  throw new Error("dormant_evidence_not_fresh");
}
if (dormant.candidateDatabaseUrlsConfigured !== 0 || dormant.candidateFeatureFlagsEnabled !== 0) {
  throw new Error("dormant_boundary_mismatch");
}
console.log(`${request.approvedCommit} ${request.runtimeAccessSha256}`);
NODE
)

[[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] || fail runner_source_commit_mismatch
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || fail production_worktree_dirty
[[ "$(git -C "${ROOT_DIR}" branch --show-current)" == "main" ]] || fail production_branch_not_main
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${APPROVED_COMMIT}" ]] || fail production_commit_mismatch

if docker ps >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker ps >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  fail docker_unavailable
fi
COMPOSE=("${DOCKER[@]}" compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}")
cd "${ROOT_DIR}"
if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -q 'candidate-shadow-worker'; then
  fail candidate_worker_already_running
fi
WEB_CONTAINER="$("${COMPOSE[@]}" ps -q web)"
[[ -n "${WEB_CONTAINER}" ]] || fail web_container_missing
WEB_IMAGE="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{.Image}}')"
NETWORK="$("${DOCKER[@]}" inspect "${WEB_CONTAINER}" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' | head -n 1)"
[[ -n "${WEB_IMAGE}" && -n "${NETWORK}" ]] || fail web_runtime_identity_missing
ROLLBACK_TAG="chuan-market-radar-web:runtime-identity-rollback-${APPROVED_COMMIT:0:12}"
"${DOCKER[@]}" tag "${WEB_IMAGE}" "${ROLLBACK_TAG}"

ENV_BACKUP="${OPS_ROOT}/backups/env.production.before"
cp -p "${ENV_FILE}" "${ENV_BACKUP}"
chmod 600 "${ENV_BACKUP}"
RENDERED_ENV="${OPS_ROOT}/backups/env.production.rendered"
node "${RUNNER_MODULE}" render-env --credentials "${CREDENTIAL_FILE}" \
  --source "${ENV_FILE}" --output "${RENDERED_ENV}" >/dev/null

PROVISIONED=false
ENV_SWITCHED=false
WEB_RECREATED=false
rollback_on_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -eq 0 ]]; then return; fi
  echo "ERROR: runtime identity package failed; starting bounded rollback." >&2
  if [[ "${ENV_SWITCHED}" == "true" && -f "${ENV_BACKUP}" ]]; then
    cp -p "${ENV_BACKUP}" "${ENV_FILE}" || true
  fi
  if [[ "${WEB_RECREATED}" == "true" ]]; then
    "${DOCKER[@]}" tag "${ROLLBACK_TAG}" chuan-market-radar-web:latest || true
    "${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || true
  fi
  if [[ "${PROVISIONED}" == "true" ]]; then
    "${DOCKER[@]}" run --rm --network "${NETWORK}" \
      --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
      --entrypoint node "${WEB_IMAGE}" \
      /src/scripts/production/candidate-runtime-identity/runner.mjs rollback \
      --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
      --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
      --access-sha256 "${ACCESS_SHA}" >/dev/null || true
  fi
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

"${DOCKER[@]}" run --rm --network "${NETWORK}" \
  --volume "${SOURCE_ROOT}:/src:ro" --volume "${SECURE_ROOT}:/secure:ro" \
  --entrypoint node "${WEB_IMAGE}" \
  /src/scripts/production/candidate-runtime-identity/runner.mjs provision \
  --credentials /secure/credentials.json --admin-url-file /secure/role-admin.url \
  --access-sql /src/scripts/production/candidate-runtime-identity/runtime-access.sql \
  --access-sha256 "${ACCESS_SHA}" > "${OPS_ROOT}/evidence/provision-redacted.json"
PROVISIONED=true

match_file_ownership_and_mode "${ENV_FILE}" "${RENDERED_ENV}"
mv -f "${RENDERED_ENV}" "${ENV_FILE}"
ENV_SWITCHED=true
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
WEB_RECREATED=true

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
BASE_ENV_FILE="${BASE_ENV_FILE}" ENV_FILE="${ENV_FILE}" BASE_URL="${BASE_URL}" \
  STRICT_SCAN_FRESHNESS=true bash "${ROOT_DIR}/scripts/verify/production-check.sh"

echo "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION"
trap - EXIT
