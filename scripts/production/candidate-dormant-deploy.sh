#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-/home/ubuntu/apps/chuan-market-radar}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
IDENTITY_WRAPPER="${IDENTITY_WRAPPER:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/compose-identity-safe}"
IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE_FILE:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/runtime-identity.override.yml}"
REQUEST_FILE="${REQUEST_FILE:-}"
DORMANT_DEPLOY_MODE="${DORMANT_DEPLOY_MODE:-dry_run}"
CONFIRM_DORMANT_DEPLOY="${CONFIRM_DORMANT_DEPLOY:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
WEB_READY_TIMEOUT_SECONDS="${WEB_READY_TIMEOUT_SECONDS:-240}"
WEB_READY_POLL_SECONDS="${WEB_READY_POLL_SECONDS:-3}"
OBSERVATION_POLL_SECONDS="${OBSERVATION_POLL_SECONDS:-30}"
CANDIDATE_DORMANT_DEPLOY_FORCE_CONTAINER_VALIDATOR="${CANDIDATE_DORMANT_DEPLOY_FORCE_CONTAINER_VALIDATOR:-false}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.mjs"
CONTRACT="${SOURCE_ROOT}/docs/governance/wp-g0-2-shadow-capture-dormant-runtime-deploy.v1.json"
ENTRYPOINT="${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy-entrypoint.sh"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
LEASE_MODULE="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease.mjs"
AUTONOMY_POLICY="${SOURCE_ROOT}/scripts/governance/autonomy-policy.mjs"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-/home/ubuntu/.local/state/market-radar-autonomy}"
AUTONOMY_LEASE_CLI_RUNTIME="${AUTONOMY_LEASE_CLI_RUNTIME:-auto}"

PACKAGE_ID="WP-G0.2-DORMANT-RUNTIME-DEPLOY-STANDING-AUTHORITY-AND-RUNNER-REFRESH"
BASELINE_COMMIT="70722ea71b33268b688be5d42af9908d40f49859"
TARGET_COMMIT="cec0b6572bb09ae91ff9e013f8bb160f73c045e2"
TARGET_TREE="eb217a7fbaad5b464279a08d4441a8249fc266e3"
TARGET_REMOTE_BRANCH="codex/wp-g0-2-dormant-runtime-release-v2"
RELEASE_DIFF_SHA256="ee814eb07b7b4fa6c4f36f92293d9ec9fbf2269fbb0e348d0705799637e4f4fa"
RELEASE_PATH_SET_SHA256="595fe25980a91548c7a88a7301f141c24ea29e1ea61c1960284a59c950aef19a"
TARGET_COMPOSE_SHA256="9e22cf32574e19e8526cf42795726627bff9b90cd990db69b5639d20e9ff0820"

echo "package=${PACKAGE_ID}"
echo "mode=${DORMANT_DEPLOY_MODE}"
echo "service_allowlist=web"
echo "target_commit=${TARGET_COMMIT}"

if [[ "${DORMANT_DEPLOY_MODE}" != "production_deploy" \
  || "${CONFIRM_DORMANT_DEPLOY}" != "true" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: local dry-run validation requires Node.js." >&2
    exit 1
  fi
  node "${VALIDATOR}" validate --root "${SOURCE_ROOT}"
  echo "DRY-RUN: production Git, images, containers, database, Redis and environment were not changed."
  echo "production_decision=BLOCKED_UNTIL_CURRENT_DYNAMIC_PREFLIGHT_AND_EXTERNAL_SINGLE_USE_APPROVAL"
  exit 0
fi

for command_name in base64 curl git jq realpath sha256sum sudo; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "ERROR: required production command is unavailable: ${command_name}" >&2
    exit 1
  fi
done
for file in "${REQUEST_FILE}" "${CONTRACT}" "${VALIDATOR}" "${ENTRYPOINT}" "${TRANSPORT_MANIFEST}" \
  "${LEASE_CLI}" "${LEASE_MODULE}" "${AUTONOMY_POLICY}" \
  "${ROOT_DIR}/docker-compose.yml" "${BASE_ENV_FILE}" "${ENV_FILE}"; do
  if [[ -z "${file}" || ! -f "${file}" || -L "${file}" ]]; then
    echo "ERROR: required regular non-symlink file is unavailable: ${file}" >&2
    exit 1
  fi
done
if [[ "$(realpath "${ROOT_DIR}")" != "/home/ubuntu/apps/chuan-market-radar" ]]; then
  echo "ERROR: production root is not the locked Market Radar path." >&2
  exit 1
fi
if ! sudo -n test -f "${IDENTITY_WRAPPER}" || sudo -n test -L "${IDENTITY_WRAPPER}" \
  || ! sudo -n test -f "${IDENTITY_OVERRIDE_FILE}" || sudo -n test -L "${IDENTITY_OVERRIDE_FILE}"; then
  echo "ERROR: privileged identity wrapper or override is unavailable or is a symlink." >&2
  exit 1
fi
if ! sudo -n docker ps >/dev/null 2>&1; then
  echo "ERROR: non-interactive privileged Docker access is unavailable." >&2
  exit 1
fi

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

privileged_file_mode() {
  sudo -n stat -c '%a' "$1" 2>/dev/null || sudo -n stat -f '%Lp' "$1"
}

privileged_file_uid() {
  sudo -n stat -c '%u' "$1" 2>/dev/null || sudo -n stat -f '%u' "$1"
}

if [[ "$(file_mode "${REQUEST_FILE}")" != "600" ]]; then
  echo "ERROR: approval request permissions must be 0600." >&2
  exit 1
fi
if [[ "$(privileged_file_mode "${IDENTITY_OVERRIDE_FILE}")" != "600" \
  || "$(privileged_file_uid "${IDENTITY_OVERRIDE_FILE}")" != "0" ]]; then
  echo "ERROR: identity override must be root-owned with permissions 0600." >&2
  exit 1
fi
if [[ "$(privileged_file_mode "${IDENTITY_WRAPPER}")" != "700" \
  || "$(privileged_file_uid "${IDENTITY_WRAPPER}")" != "0" ]]; then
  echo "ERROR: identity wrapper must be root-owned with permissions 0700." >&2
  exit 1
fi

DOCKER=(sudo -n docker)
IDENTITY_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}")
WEB_CONTAINER_NAME="chuan-market-radar-web-1"
POSTGRES_CONTAINER_NAME="chuan-market-radar-postgres-1"
REDIS_CONTAINER_NAME="chuan-market-radar-redis-1"
WEB_CONTAINER_ID="$(${DOCKER[@]} ps --filter "name=^/${WEB_CONTAINER_NAME}$" --format '{{.ID}}')"
if [[ -z "${WEB_CONTAINER_ID}" || "${WEB_CONTAINER_ID}" == *$'\n'* ]]; then
  echo "ERROR: exactly one current Web container is required for fail-closed validation." >&2
  exit 1
fi

REQUEST_BASE64="$(base64 < "${REQUEST_FILE}" | tr -d '\r\n')"
CONTRACT_BASE64="$(base64 < "${CONTRACT}" | tr -d '\r\n')"
BASE_ENV_BASE64="$(base64 < "${BASE_ENV_FILE}" | tr -d '\r\n')"
PRODUCTION_ENV_BASE64="$(base64 < "${ENV_FILE}" | tr -d '\r\n')"
if command -v node >/dev/null 2>&1 \
  && [[ "${CANDIDATE_DORMANT_DEPLOY_FORCE_CONTAINER_VALIDATOR}" != "true" ]]; then
  node "${VALIDATOR}" request --root "${SOURCE_ROOT}" --request "${REQUEST_FILE}" >/dev/null
  node "${VALIDATOR}" env --env-file "${BASE_ENV_FILE}" >/dev/null
  node "${VALIDATOR}" env --env-file "${ENV_FILE}" >/dev/null
else
  ${DOCKER[@]} exec -i -e CANDIDATE_DORMANT_DEPLOY_STDIN=true "${WEB_CONTAINER_ID}" \
    node --input-type=module - request \
      --request-base64 "${REQUEST_BASE64}" --contract-base64 "${CONTRACT_BASE64}" \
      < "${VALIDATOR}" >/dev/null
  ${DOCKER[@]} exec -i -e CANDIDATE_DORMANT_DEPLOY_STDIN=true "${WEB_CONTAINER_ID}" \
    node --input-type=module - env --env-base64 "${BASE_ENV_BASE64}" \
      < "${VALIDATOR}" >/dev/null
  ${DOCKER[@]} exec -i -e CANDIDATE_DORMANT_DEPLOY_STDIN=true "${WEB_CONTAINER_ID}" \
    node --input-type=module - env --env-base64 "${PRODUCTION_ENV_BASE64}" \
      < "${VALIDATOR}" >/dev/null
fi

APPROVED_BASELINE_COMMIT="$(jq -r '.baselineCommit' "${REQUEST_FILE}")"
APPROVED_TARGET_COMMIT="$(jq -r '.targetCommit' "${REQUEST_FILE}")"
APPROVED_TARGET_TREE="$(jq -r '.targetTree' "${REQUEST_FILE}")"
APPROVED_TARGET_REMOTE_BRANCH="$(jq -r '.targetRemoteBranch' "${REQUEST_FILE}")"
APPROVED_RELEASE_DIFF_SHA256="$(jq -r '.releaseDiffSha256' "${REQUEST_FILE}")"
APPROVED_RELEASE_PATH_SET_SHA256="$(jq -r '.releasePathSetSha256' "${REQUEST_FILE}")"
APPROVED_BASELINE_COMPOSE_SHA256="$(jq -r '.baselineComposeSha256' "${REQUEST_FILE}")"
APPROVED_TARGET_COMPOSE_SHA256="$(jq -r '.targetComposeSha256' "${REQUEST_FILE}")"
APPROVED_BASE_ENV_SHA256="$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ENV_SHA256="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
APPROVED_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")"
APPROVED_WRAPPER_SHA256="$(jq -r '.composeWrapperSha256' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE_ID="$(jq -r '.webImageId' "${REQUEST_FILE}")"
APPROVED_ROLLBACK_WEB_IMAGE_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
APPROVED_CONTRACT_SHA256="$(jq -r '.contractSha256' "${REQUEST_FILE}")"
APPROVED_RUNNER_SHA256="$(jq -r '.runnerSha256' "${REQUEST_FILE}")"
APPROVED_RUNNER_SOURCE_COMMIT="$(jq -r '.runnerSourceCommit' "${REQUEST_FILE}")"
APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
OBSERVATION_DURATION_SECONDS="$(jq -r '.observationDurationSeconds' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_APPROVAL_ID="$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"

if [[ "${APPROVED_BASELINE_COMMIT}" != "${BASELINE_COMMIT}" \
  || "${APPROVED_TARGET_COMMIT}" != "${TARGET_COMMIT}" \
  || "${APPROVED_TARGET_TREE}" != "${TARGET_TREE}" \
  || "${APPROVED_TARGET_REMOTE_BRANCH}" != "${TARGET_REMOTE_BRANCH}" \
  || "${APPROVED_RELEASE_DIFF_SHA256}" != "${RELEASE_DIFF_SHA256}" \
  || "${APPROVED_RELEASE_PATH_SET_SHA256}" != "${RELEASE_PATH_SET_SHA256}" \
  || "${APPROVED_TARGET_COMPOSE_SHA256}" != "${TARGET_COMPOSE_SHA256}" ]]; then
  echo "ERROR: release identity does not match the locked runner." >&2
  exit 1
fi
if [[ "${APPROVED_AUTONOMY_TRUST_ROOT}" != "/home/ubuntu/.local/state/market-radar-autonomy" \
  || "${AUTONOMY_TRUST_ROOT}" != "${APPROVED_AUTONOMY_TRUST_ROOT}" ]]; then
  echo "ERROR: production autonomy trust root does not match the locked external path." >&2
  exit 1
fi

SOURCE_ROOT_REAL="$(realpath "${SOURCE_ROOT}")"
ROOT_DIR_REAL="$(realpath "${ROOT_DIR}")"
if [[ "${SOURCE_ROOT_REAL}" != "${APPROVED_STAGING_DIRECTORY}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}/"* ]]; then
  echo "ERROR: dormant runner must execute from the approved repository-external staging directory." >&2
  exit 1
fi
if [[ -e "${EVIDENCE_DIRECTORY}" ]]; then
  echo "ERROR: approved evidence directory already exists." >&2
  exit 1
fi
if [[ "$(sha256sum "${CONTRACT}" | awk '{print $1}')" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(sha256sum "${SOURCE_ROOT}/scripts/production/candidate-dormant-deploy.sh" | awk '{print $1}')" != "${APPROVED_RUNNER_SHA256}" \
  || "$(jq -r '.sourceCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_RUNNER_SOURCE_COMMIT}" \
  || "$(jq -r '.targetCommit' "${TRANSPORT_MANIFEST}")" != "${TARGET_COMMIT}" \
  || "$(jq -r '.baselineCommit' "${TRANSPORT_MANIFEST}")" != "${BASELINE_COMMIT}" \
  || "$(jq -r '.releaseDiffSha256' "${TRANSPORT_MANIFEST}")" != "${RELEASE_DIFF_SHA256}" \
  || "$(jq -r '.contractSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(jq -r '.approvalEligible' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.reproducibleArchive' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.archiveFormat' "${TRANSPORT_MANIFEST}")" != "ustar+gzip-n" \
  || "$(jq -r '.containsSecrets' "${TRANSPORT_MANIFEST}")" != "false" \
  || "$(jq -r '.sessionIndependentExecutionRequired' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.rollbackImageRetentionRequired' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.rollbackRetentionRepository' "${TRANSPORT_MANIFEST}")" != "market-radar-rollback/wp-g0-2-dormant" \
  || "$(jq -r '.rollbackCleanupRequiresSeparateApproval' "${TRANSPORT_MANIFEST}")" != "true" ]]; then
  echo "ERROR: staged transport manifest does not match approval." >&2
  exit 1
fi
if [[ "$(sha256sum "${BASE_ENV_FILE}" | awk '{print $1}')" != "${APPROVED_BASE_ENV_SHA256}" \
  || "$(sha256sum "${ENV_FILE}" | awk '{print $1}')" != "${APPROVED_PRODUCTION_ENV_SHA256}" \
  || "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" != "${APPROVED_BASELINE_COMPOSE_SHA256}" \
  || "$(sudo -n sha256sum "${IDENTITY_OVERRIDE_FILE}" | awk '{print $1}')" != "${APPROVED_OVERRIDE_SHA256}" \
  || "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" != "${APPROVED_WRAPPER_SHA256}" ]]; then
  echo "ERROR: production environment, Compose or identity fingerprint drifted." >&2
  exit 1
fi

if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" \
  || "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${BASELINE_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" ]]; then
  echo "ERROR: production repository is not the clean detached approved baseline." >&2
  exit 1
fi
git -C "${ROOT_DIR}" fetch origin \
  "refs/heads/${TARGET_REMOTE_BRANCH}:refs/remotes/origin/${TARGET_REMOTE_BRANCH}"
if [[ "$(git -C "${ROOT_DIR}" rev-parse "origin/${TARGET_REMOTE_BRANCH}")" != "${TARGET_COMMIT}" \
  || "$(git -C "${ROOT_DIR}" rev-parse "${TARGET_COMMIT}^{tree}")" != "${TARGET_TREE}" \
  || "$(git -C "${ROOT_DIR}" rev-list --parents -n 1 "${TARGET_COMMIT}")" \
    != "${TARGET_COMMIT} ${BASELINE_COMMIT}" \
  || "$(git -C "${ROOT_DIR}" diff-tree --no-commit-id --name-status -r "${TARGET_COMMIT}" | sha256sum | awk '{print $1}')" \
    != "${RELEASE_DIFF_SHA256}" \
  || "$(git -C "${ROOT_DIR}" diff-tree --no-commit-id --name-only -r "${TARGET_COMMIT}" | sort | sha256sum | awk '{print $1}')" \
    != "${RELEASE_PATH_SET_SHA256}" \
  || "$(git -C "${ROOT_DIR}" show "${TARGET_COMMIT}:docker-compose.yml" | sha256sum | awk '{print $1}')" \
    != "${TARGET_COMPOSE_SHA256}" ]]; then
  echo "ERROR: fetched target commit, parent, tree or exact release diff is invalid." >&2
  exit 1
fi

WEB_CONTAINER_ID="$(${DOCKER[@]} ps --filter "name=^/${WEB_CONTAINER_NAME}$" --format '{{.ID}}')"
CURRENT_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${WEB_CONTAINER_ID}")"
PREVIOUS_WEB_IMAGE_REF="$(${DOCKER[@]} inspect --format '{{.Config.Image}}' "${WEB_CONTAINER_ID}")"
if [[ -z "${WEB_CONTAINER_ID}" || "${WEB_CONTAINER_ID}" == *$'\n'* \
  || "${CURRENT_WEB_IMAGE_ID}" != "${APPROVED_WEB_IMAGE_ID}" \
  || -z "${PREVIOUS_WEB_IMAGE_REF}" ]]; then
  echo "ERROR: current Web container or approved rollback image identity is invalid." >&2
  exit 1
fi

container_ids_excluding_web() {
  ${DOCKER[@]} ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v "^${WEB_CONTAINER_NAME}=" | LC_ALL=C sort
}

verify_candidate_absent() {
  ! ${DOCKER[@]} ps --format '{{.Names}}' | grep -qx 'chuan-market-radar-candidate-shadow-worker-1'
}

NON_TARGET_CONTAINERS_BEFORE="$(container_ids_excluding_web)"
if ! verify_candidate_absent; then
  echo "ERROR: Candidate shadow worker is already running." >&2
  exit 1
fi
if [[ "$(${DOCKER[@]} exec "${REDIS_CONTAINER_NAME}" redis-cli ping)" != "PONG" ]]; then
  echo "ERROR: Redis is not ready before release." >&2
  exit 1
fi
if ! ${DOCKER[@]} exec "${POSTGRES_CONTAINER_NAME}" pg_isready -U postgres >/dev/null; then
  echo "ERROR: Postgres is not ready before release." >&2
  exit 1
fi

EXPECTED_WEB_DATABASE_URL_SHA256="$(${IDENTITY_COMPOSE[@]} config --format json \
  | jq -erj '.services.web.environment.DATABASE_URL | select(type == "string" and length > 0)' \
  | sha256sum | awk '{print $1}')"
if [[ -z "${EXPECTED_WEB_DATABASE_URL_SHA256}" ]]; then
  echo "ERROR: approved Web database identity fingerprint is unavailable." >&2
  exit 1
fi

mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
if [[ -L "${AUTONOMY_TRUST_ROOT}" ]]; then
  echo "ERROR: production autonomy trust root cannot be a symlink." >&2
  exit 1
fi
mkdir -p "${AUTONOMY_TRUST_ROOT}"
chmod 700 "${AUTONOMY_TRUST_ROOT}"
if [[ "$(realpath "${AUTONOMY_TRUST_ROOT}")" != "/home/ubuntu/.local/state/market-radar-autonomy" \
  || "$(realpath "${AUTONOMY_TRUST_ROOT}")" == "${ROOT_DIR_REAL}" \
  || "$(realpath "${AUTONOMY_TRUST_ROOT}")" == "${SOURCE_ROOT_REAL}" ]]; then
  echo "ERROR: autonomy trust root escaped its repository-external boundary." >&2
  exit 1
fi

OBSERVATION_FILE="${EVIDENCE_DIRECTORY}/dormant-observation.jsonl"
SUMMARY_FILE="${EVIDENCE_DIRECTORY}/summary.json"
ROLLBACK_FILE="${EVIDENCE_DIRECTORY}/rollback.json"
ROLLBACK_RETENTION_FILE="${EVIDENCE_DIRECTORY}/rollback-image-retention.json"
LEASE_EXECUTION_FILE="${EVIDENCE_DIRECTORY}/production-lease-execution.json"
LEASE_EVENTS_FILE="${EVIDENCE_DIRECTORY}/production-lease-events.jsonl"

run_lease_cli() {
  local command_name="$1"
  shift
  if [[ "${AUTONOMY_LEASE_CLI_RUNTIME}" == "host_node" ]] \
    || { [[ "${AUTONOMY_LEASE_CLI_RUNTIME}" == "auto" ]] && command -v node >/dev/null 2>&1; }; then
    node "${LEASE_CLI}" "${command_name}" \
      --trust-root "${AUTONOMY_TRUST_ROOT}" \
      --request "${REQUEST_FILE}" \
      --execution "${LEASE_EXECUTION_FILE}" \
      "$@"
    return
  fi
  if [[ "${AUTONOMY_LEASE_CLI_RUNTIME}" != "auto" \
    && "${AUTONOMY_LEASE_CLI_RUNTIME}" != "container_node" ]]; then
    echo "ERROR: unsupported autonomy lease CLI runtime." >&2
    return 1
  fi
  ${DOCKER[@]} run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=${SOURCE_ROOT}/scripts/governance,dst=/runner,readonly" \
    --mount "type=bind,src=${REQUEST_FILE},dst=/request/approval-request.json,readonly" \
    --mount "type=bind,src=${AUTONOMY_TRUST_ROOT},dst=${AUTONOMY_TRUST_ROOT}" \
    --mount "type=bind,src=${EVIDENCE_DIRECTORY},dst=${EVIDENCE_DIRECTORY}" \
    --entrypoint node "${APPROVED_WEB_IMAGE_ID}" \
    /runner/autonomy-production-lease-cli.mjs "${command_name}" \
      --trust-root "${AUTONOMY_TRUST_ROOT}" \
      --request /request/approval-request.json \
      --execution "${LEASE_EXECUTION_FILE}" \
      "$@"
}

lease_event() {
  run_lease_cli "$@" | tee -a "${LEASE_EVENTS_FILE}" >/dev/null
}

lease_acquire() {
  lease_event acquire --owner-id "${PACKAGE_ID}:${APPROVED_AUTONOMY_APPROVAL_ID}"
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

verify_rollback_image_retention() {
  [[ "$(${DOCKER[@]} image inspect --format '{{.Id}}' "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" 2>/dev/null || true)" \
    == "${CURRENT_WEB_IMAGE_ID}" ]]
}

verify_non_target_containers_unchanged() {
  [[ "$(container_ids_excluding_web)" == "${NON_TARGET_CONTAINERS_BEFORE}" ]]
}

verify_web_identity() {
  local container_id actual_sha256
  container_id="$(${IDENTITY_COMPOSE[@]} ps -q web)"
  actual_sha256="$(${DOCKER[@]} exec "${container_id}" sh -lc 'printf %s "$DATABASE_URL" | sha256sum' | awk '{print $1}')"
  [[ -n "${container_id}" && "${actual_sha256}" == "${EXPECTED_WEB_DATABASE_URL_SHA256}" ]]
}

wait_for_web_http() {
  local deadline=$((SECONDS + WEB_READY_TIMEOUT_SECONDS)) body
  while true; do
    body="$(curl -fsS "${BASE_URL}/api/health" 2>/dev/null || true)"
    if jq -e '.ok == true' >/dev/null 2>&1 <<<"${body}"; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep "${WEB_READY_POLL_SECONDS}"
  done
}

verify_contract_endpoints() {
  local endpoint
  for endpoint in /api/frontend/radar-contract /api/radar/backend-contract /api/radar/business-capability; do
    curl -fsS "${BASE_URL}${endpoint}" | jq -e '.ok == true' >/dev/null
  done
}

verify_candidate_dormant() {
  ${IDENTITY_COMPOSE[@]} exec -T web node - <<'NODE' >/dev/null
const flags = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const urls = ["CANDIDATE_SOURCE_DATABASE_URL", "CANDIDATE_CONSUMER_DATABASE_URL", "CANDIDATE_MONITOR_DATABASE_URL"];
const exactFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!flags.every((key) => exactFalse(process.env[key]))) throw new Error("candidate_feature_flag_not_false");
if (!urls.every((key) => !String(process.env[key] ?? "").trim())) throw new Error("candidate_database_url_configured");
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

verify_health_ready_fresh() {
  curl -fsS "${BASE_URL}/api/health" | jq -e '
    .ok == true
    and .health.level == "ready"
    and .health.persistence.databaseStatus == "ready"
    and .health.scan.freshness == "fresh"
    and ([.health.runtimeProbes.workers[]? | select(.name == "scanner-worker" and .status == "healthy")] | length == 1)
  ' >/dev/null
}

verify_candidate_schema_read_only() {
  local result
  result="$(${DOCKER[@]} exec "${POSTGRES_CONTAINER_NAME}" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT (SELECT count(*) FROM candidate_authority.schema_migrations WHERE status = '\''applied'\''), (SELECT count(*) FROM candidate_authority.candidate_migration_control);"')"
  [[ "${result}" == "9|0" ]]
}

MUTATED=false
RELEASE_SUCCEEDED=false
LEASE_ACQUIRED=false
LEASE_RELEASED=false
rollback_on_failure() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [[ "${exit_code}" -eq 0 || "${RELEASE_SUCCEEDED}" == "true" ]]; then
    exit "${exit_code}"
  fi
  if [[ "${MUTATED}" != "true" ]]; then
    if [[ "${LEASE_ACQUIRED}" == "true" && "${LEASE_RELEASED}" != "true" ]]; then
      lease_safety_checkpoint pre-mutation-stop >/dev/null 2>&1 || true
      if lease_release SAFE_STOP_PRE_MUTATION >/dev/null 2>&1; then
        LEASE_RELEASED=true
      fi
    fi
    exit "${exit_code}"
  fi
  echo "ERROR: dormant deploy failed; restoring approved Web image and detached baseline target." >&2
  local rollback_ok=false retained_ok=false rollback_container_id rollback_image_id
  if ! lease_safety_checkpoint rollback; then
    echo "P0_ROLLBACK_DORMANT_DEPLOY_FENCING_REJECTED" >&2
    exit "${exit_code}"
  fi
  if verify_rollback_image_retention; then retained_ok=true; fi
  ${DOCKER[@]} tag "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" "${PREVIOUS_WEB_IMAGE_REF}" || true
  git -C "${ROOT_DIR}" checkout --detach "${BASELINE_COMMIT}" || true
  ${IDENTITY_COMPOSE[@]} up -d --no-deps --no-build --force-recreate web || true
  wait_for_web_http || true
  rollback_container_id="$(${IDENTITY_COMPOSE[@]} ps -q web 2>/dev/null || true)"
  rollback_image_id="$(${DOCKER[@]} inspect --format '{{.Image}}' "${rollback_container_id}" 2>/dev/null || true)"
  if [[ "${retained_ok}" == "true" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)" == "${BASELINE_COMMIT}" \
    && -z "$(git -C "${ROOT_DIR}" branch --show-current 2>/dev/null || true)" \
    && "${rollback_image_id}" == "${CURRENT_WEB_IMAGE_ID}" ]] \
    && verify_web_identity \
    && verify_non_target_containers_unchanged \
    && verify_candidate_absent \
    && verify_health_ready_fresh; then
    rollback_ok=true
  fi
  jq -n \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson originalExitCode "${exit_code}" \
    --argjson rollbackVerified "${rollback_ok}" \
    --argjson rollbackRetentionVerified "${retained_ok}" \
    --arg baselineCommit "${BASELINE_COMMIT}" \
    --arg webImageId "${rollback_image_id}" \
    --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
    '{at:$at,originalExitCode:$originalExitCode,rollbackVerified:$rollbackVerified,rollbackRetentionVerified:$rollbackRetentionVerified,baselineCommit:$baselineCommit,webImageId:$webImageId,rollbackWebImageRef:$rollbackWebImageRef}' \
    > "${ROLLBACK_FILE}" || true
  if [[ "${rollback_ok}" == "true" ]] && lease_release ROLLBACK_PASS; then
    LEASE_RELEASED=true
    echo "ROLLBACK_DORMANT_DEPLOY_BASELINE_VERIFIED" >&2
  else
    echo "P0_ROLLBACK_DORMANT_DEPLOY_NOT_VERIFIED" >&2
  fi
  exit "${exit_code}"
}

trap rollback_on_failure EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

lease_acquire
LEASE_ACQUIRED=true
lease_checkpoint pre-mutation
lease_consume
lease_checkpoint rollback-image-retention
${DOCKER[@]} tag "${CURRENT_WEB_IMAGE_ID}" "${APPROVED_ROLLBACK_WEB_IMAGE_REF}"
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback Web image retention failed before production mutation." >&2
  exit 1
fi
jq -n \
  --arg retainedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg webImageId "${CURRENT_WEB_IMAGE_ID}" \
  --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
  '{retainedAt:$retainedAt,verified:true,retainAfterSuccess:true,cleanupRequiresSeparateApproval:true,webImageId:$webImageId,rollbackWebImageRef:$rollbackWebImageRef}' \
  > "${ROLLBACK_RETENTION_FILE}"

lease_checkpoint checkout-target
git -C "${ROOT_DIR}" checkout --detach "${TARGET_COMMIT}"
MUTATED=true
if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" \
  || "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${TARGET_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" ]]; then
  echo "ERROR: production Git did not reach the clean detached target." >&2
  exit 1
fi
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback image retention drifted after target checkout." >&2
  exit 1
fi

lease_checkpoint build-web
${IDENTITY_COMPOSE[@]} build web
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback image retention drifted during Web build." >&2
  exit 1
fi
lease_checkpoint recreate-web
${IDENTITY_COMPOSE[@]} up -d --no-deps --force-recreate web
if ! wait_for_web_http; then
  echo "ERROR: target Web did not become reachable within the approved timeout." >&2
  exit 1
fi

TARGET_WEB_CONTAINER_ID="$(${IDENTITY_COMPOSE[@]} ps -q web)"
TARGET_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${TARGET_WEB_CONTAINER_ID}")"
if [[ -z "${TARGET_WEB_CONTAINER_ID}" || "${TARGET_WEB_IMAGE_ID}" == "${CURRENT_WEB_IMAGE_ID}" ]]; then
  echo "ERROR: target Web image transition was not proven." >&2
  exit 1
fi
if [[ "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" != "${TARGET_COMPOSE_SHA256}" \
  || "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${TARGET_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" \
  || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: target Git or Compose identity drifted after Web recreation." >&2
  exit 1
fi
if ! verify_web_identity \
  || ! verify_candidate_absent \
  || ! verify_non_target_containers_unchanged \
  || ! verify_candidate_dormant \
  || ! verify_candidate_schema_read_only \
  || ! verify_contract_endpoints \
  || ! verify_health_ready_fresh; then
  echo "ERROR: immediate dormant runtime or production health contract failed." >&2
  exit 1
fi
if [[ "$(${DOCKER[@]} exec "${REDIS_CONTAINER_NAME}" redis-cli ping)" != "PONG" ]] \
  || ! ${DOCKER[@]} exec "${POSTGRES_CONTAINER_NAME}" pg_isready -U postgres >/dev/null; then
  echo "ERROR: Redis or Postgres readiness failed after release." >&2
  exit 1
fi

OBSERVATION_STARTED_EPOCH="$(date +%s)"
OBSERVATION_DEADLINE=$((OBSERVATION_STARTED_EPOCH + OBSERVATION_DURATION_SECONDS))
SAMPLE_COUNT=0
while true; do
  lease_checkpoint observation-sample
  NOW_EPOCH="$(date +%s)"
  if ! verify_health_ready_fresh \
    || ! verify_candidate_dormant \
    || ! verify_candidate_absent \
    || ! verify_non_target_containers_unchanged \
    || ! verify_web_identity \
    || ! verify_rollback_image_retention; then
    echo "ERROR: continuous dormant runtime observation failed." >&2
    exit 1
  fi
  SAMPLE_COUNT=$((SAMPLE_COUNT + 1))
  jq -n -c \
    --arg sampledAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson sample "${SAMPLE_COUNT}" \
    --arg webImageId "${TARGET_WEB_IMAGE_ID}" \
    '{sampledAt:$sampledAt,sample:$sample,health:"ready",scanFreshness:"fresh",candidateMode:"dormant",candidateWorkerAbsent:true,webImageId:$webImageId}' \
    >> "${OBSERVATION_FILE}"
  if (( NOW_EPOCH >= OBSERVATION_DEADLINE )); then break; fi
  sleep "${OBSERVATION_POLL_SECONDS}"
done

if ! verify_contract_endpoints \
  || ! verify_candidate_schema_read_only \
  || ! verify_health_ready_fresh \
  || ! verify_candidate_dormant \
  || ! verify_candidate_absent \
  || ! verify_non_target_containers_unchanged \
  || ! verify_rollback_image_retention; then
  echo "ERROR: final dormant runtime closeout verification failed." >&2
  exit 1
fi

lease_checkpoint success-closeout
lease_release PASS
LEASE_RELEASED=true

jq -n \
  --arg status "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION" \
  --arg packageId "${PACKAGE_ID}" \
  --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg baselineCommit "${BASELINE_COMMIT}" \
  --arg targetCommit "${TARGET_COMMIT}" \
  --arg webImageId "${TARGET_WEB_IMAGE_ID}" \
  --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
  --argjson observationDurationSeconds "${OBSERVATION_DURATION_SECONDS}" \
  --argjson sampleCount "${SAMPLE_COUNT}" \
  '{status:$status,packageId:$packageId,completedAt:$completedAt,baselineCommit:$baselineCommit,targetCommit:$targetCommit,detachedHead:true,webImageId:$webImageId,rollbackImageRetained:true,rollbackWebImageRef:$rollbackWebImageRef,rollbackCleanupRequiresSeparateApproval:true,observationDurationSeconds:$observationDurationSeconds,sampleCount:$sampleCount,continuousReadyFresh:true,candidateDormant:true,candidateWorkerAbsent:true,databaseMutation:false,redisMutation:false,environmentMutation:false,otherServiceMutation:false}' \
  > "${SUMMARY_FILE}"

RELEASE_SUCCEEDED=true
trap - EXIT INT TERM HUP
echo "summary=${SUMMARY_FILE}"
echo "PASS_PRODUCTION_DORMANT_RUNTIME_WEB_ONLY_1800_SECOND_OBSERVATION"
