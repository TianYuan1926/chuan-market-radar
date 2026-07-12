#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-/home/ubuntu/apps/chuan-market-radar}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
IDENTITY_WRAPPER="${IDENTITY_WRAPPER:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/compose-identity-safe}"
IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE_FILE:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/runtime-identity.override.yml}"
REQUEST_FILE="${REQUEST_FILE:-}"
WEB_IDENTITY_RECOVERY_MODE="${WEB_IDENTITY_RECOVERY_MODE:-dry_run}"
CONFIRM_WEB_IDENTITY_RECOVERY="${CONFIRM_WEB_IDENTITY_RECOVERY:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
WEB_READY_TIMEOUT_SECONDS="${WEB_READY_TIMEOUT_SECONDS:-180}"
WEB_READY_POLL_SECONDS="${WEB_READY_POLL_SECONDS:-3}"
WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR="${WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR:-false}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/web-identity-recovery.mjs"
CONTRACT="${SOURCE_ROOT}/docs/governance/wp-g0-2-production-web-identity-recovery.v1.json"
ENTRYPOINT="${SOURCE_ROOT}/scripts/production/web-identity-recovery-entrypoint.sh"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"

echo "package=WP-G0.2-PRODUCTION-WEB-IDENTITY-RECOVERY"
echo "mode=${WEB_IDENTITY_RECOVERY_MODE}"
echo "service_allowlist=web"

if command -v node >/dev/null 2>&1; then
  node "${VALIDATOR}" validate --root "${SOURCE_ROOT}"
elif [[ "${WEB_IDENTITY_RECOVERY_MODE}" != "production_recovery" ]]; then
  echo "ERROR: local dry-run validation requires Node.js." >&2
  exit 1
fi

if [[ "${WEB_IDENTITY_RECOVERY_MODE}" != "production_recovery" || "${CONFIRM_WEB_IDENTITY_RECOVERY}" != "true" ]]; then
  echo "DRY-RUN: production Git, containers, database, Redis and environment were not changed."
  echo "DRY-RUN: exact production approval is required for recovery execution."
  exit 0
fi

for file in "${REQUEST_FILE}" "${CONTRACT}" "${VALIDATOR}" "${ENTRYPOINT}" "${TRANSPORT_MANIFEST}" "${ROOT_DIR}/docker-compose.yml" "${BASE_ENV_FILE}" "${ENV_FILE}"; do
  if [[ -z "${file}" || ! -f "${file}" || -L "${file}" ]]; then
    echo "ERROR: required regular non-symlink file is unavailable: ${file}" >&2
    exit 1
  fi
done
if ! sudo -n test -f "${IDENTITY_WRAPPER}" || sudo -n test -L "${IDENTITY_WRAPPER}" \
  || ! sudo -n test -f "${IDENTITY_OVERRIDE_FILE}" || sudo -n test -L "${IDENTITY_OVERRIDE_FILE}"; then
  echo "ERROR: privileged identity wrapper or override is unavailable or is a symlink." >&2
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
if [[ "$(privileged_file_mode "${IDENTITY_OVERRIDE_FILE}")" != "600" || "$(privileged_file_uid "${IDENTITY_OVERRIDE_FILE}")" != "0" ]]; then
  echo "ERROR: identity override must be root-owned with permissions 0600." >&2
  exit 1
fi
if [[ "$(privileged_file_mode "${IDENTITY_WRAPPER}")" != "700" || "$(privileged_file_uid "${IDENTITY_WRAPPER}")" != "0" ]]; then
  echo "ERROR: identity wrapper must be root-owned with permissions 0700." >&2
  exit 1
fi

if ! sudo -n docker ps >/dev/null 2>&1; then
  echo "ERROR: non-interactive privileged Docker access is unavailable." >&2
  exit 1
fi
DOCKER=(sudo -n docker)
WEB_CONTAINER_ID="$(${DOCKER[@]} ps --filter 'name=^/chuan-market-radar-web-1$' --format '{{.ID}}')"
if [[ -z "${WEB_CONTAINER_ID}" || "${WEB_CONTAINER_ID}" == *$'\n'* ]]; then
  echo "ERROR: exactly one current production Web container is required." >&2
  exit 1
fi

REQUEST_BASE64="$(base64 < "${REQUEST_FILE}" | tr -d '\r\n')"
CONTRACT_BASE64="$(base64 < "${CONTRACT}" | tr -d '\r\n')"
if command -v node >/dev/null 2>&1 && [[ "${WEB_IDENTITY_RECOVERY_FORCE_CONTAINER_VALIDATOR}" != "true" ]]; then
  node "${VALIDATOR}" request --root "${SOURCE_ROOT}" --request "${REQUEST_FILE}" >/dev/null
else
  ${DOCKER[@]} exec -i -e WEB_IDENTITY_RECOVERY_STDIN=true "${WEB_CONTAINER_ID}" \
    node --input-type=module - request --request-base64 "${REQUEST_BASE64}" --contract-base64 "${CONTRACT_BASE64}" \
    < "${VALIDATOR}" >/dev/null
fi

APPROVED_HEAD="$(jq -r '.productionHead' "${REQUEST_FILE}")"
APPROVED_BASE_ENV_SHA256="$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ENV_SHA256="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
APPROVED_RECOVERY_ARTIFACT_SHA256="$(jq -r '.recoveryArtifactSha256' "${REQUEST_FILE}")"
APPROVED_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")"
APPROVED_WRAPPER_SHA256="$(jq -r '.composeWrapperSha256' "${REQUEST_FILE}")"
APPROVED_COMPOSE_SHA256="$(jq -r '.composeSha256' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE_ID="$(jq -r '.webImageId' "${REQUEST_FILE}")"
APPROVED_CONTRACT_SHA256="$(jq -r '.contractSha256' "${REQUEST_FILE}")"
APPROVED_RUNNER_SOURCE_COMMIT="$(jq -r '.runnerSourceCommit' "${REQUEST_FILE}")"
APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"

SOURCE_ROOT_REAL="$(realpath "${SOURCE_ROOT}")"
ROOT_DIR_REAL="$(realpath "${ROOT_DIR}")"
if [[ "${SOURCE_ROOT_REAL}" != "${APPROVED_STAGING_DIRECTORY}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}/"* ]]; then
  echo "ERROR: recovery runner must execute from the approved repository-external staging directory." >&2
  exit 1
fi
if [[ "$(sha256sum "${CONTRACT}" | awk '{print $1}')" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(jq -r '.sourceCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_RUNNER_SOURCE_COMMIT}" \
  || "$(jq -r '.contractSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(jq -r '.approvalEligible' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.transportMethod' "${TRANSPORT_MANIFEST}")" != "approved_orcaterm_bundle_upload" \
  || "$(jq -r '.containsSecrets' "${TRANSPORT_MANIFEST}")" != "false" \
  || "$(jq -r '.productionRepositoryMutationAllowed' "${TRANSPORT_MANIFEST}")" != "false" ]]; then
  echo "ERROR: staged transport manifest does not match approval." >&2
  exit 1
fi

if [[ "${APPROVED_RECOVERY_ARTIFACT_SHA256}" != "$(jq -r '.artifact.sha256' "${CONTRACT}")" \
  || "$(sha256sum "${ENTRYPOINT}" | awk '{print $1}')" != "$(jq -r --arg file 'scripts/production/web-identity-recovery-entrypoint.sh' '.artifact.fileSha256[$file]' "${CONTRACT}")" \
  || "$(sha256sum "${VALIDATOR}" | awk '{print $1}')" != "$(jq -r --arg file 'scripts/production/web-identity-recovery.mjs' '.artifact.fileSha256[$file]' "${CONTRACT}")" \
  || "$(sha256sum "${SOURCE_ROOT}/scripts/production/web-identity-recovery.sh" | awk '{print $1}')" != "$(jq -r --arg file 'scripts/production/web-identity-recovery.sh' '.artifact.fileSha256[$file]' "${CONTRACT}")" ]]; then
  echo "ERROR: recovery runner artifact does not match approval and contract." >&2
  exit 1
fi

if [[ "$(sudo -n sha256sum "${IDENTITY_OVERRIDE_FILE}" | awk '{print $1}')" != "${APPROVED_OVERRIDE_SHA256}" ]]; then
  echo "ERROR: identity override checksum does not match approval." >&2
  exit 1
fi
if [[ "$(sudo -n sha256sum "${IDENTITY_WRAPPER}" | awk '{print $1}')" != "${APPROVED_WRAPPER_SHA256}" ]]; then
  echo "ERROR: identity wrapper checksum does not match approval." >&2
  exit 1
fi
if [[ "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" != "${APPROVED_COMPOSE_SHA256}" ]]; then
  echo "ERROR: production Compose checksum does not match approval." >&2
  exit 1
fi
if [[ "$(sudo -n sha256sum "${BASE_ENV_FILE}" | awk '{print $1}')" != "${APPROVED_BASE_ENV_SHA256}" \
  || "$(sudo -n sha256sum "${ENV_FILE}" | awk '{print $1}')" != "${APPROVED_PRODUCTION_ENV_SHA256}" ]]; then
  echo "ERROR: production environment file fingerprint does not match approval." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${APPROVED_HEAD}" || "$(git -C "${ROOT_DIR}" branch --show-current)" != "main" ]]; then
  echo "ERROR: production Git baseline does not match approval." >&2
  exit 1
fi
if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: production worktree is not clean." >&2
  exit 1
fi

CURRENT_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${WEB_CONTAINER_ID}")"
if [[ "${CURRENT_WEB_IMAGE_ID}" != "${APPROVED_WEB_IMAGE_ID}" ]]; then
  echo "ERROR: current Web image does not match approval." >&2
  exit 1
fi
if ${DOCKER[@]} ps --format '{{.Names}}' | grep -qx 'chuan-market-radar-candidate-shadow-worker-1'; then
  echo "ERROR: Candidate shadow worker must remain absent." >&2
  exit 1
fi

IDENTITY_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}")
BASELINE_COMPOSE=(sudo -n docker compose --env-file "${BASE_ENV_FILE}" --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.yml")

EXPECTED_DATABASE_URL_SHA256="$(${IDENTITY_COMPOSE[@]} config --format json \
  | jq -j '.services.web.environment.DATABASE_URL' | sha256sum | awk '{print $1}')"
ACTUAL_DATABASE_URL_SHA256="$(${DOCKER[@]} exec "${WEB_CONTAINER_ID}" sh -lc 'printf %s "$DATABASE_URL" | sha256sum' | awk '{print $1}')"
if [[ -z "${EXPECTED_DATABASE_URL_SHA256}" ]]; then
  echo "ERROR: expected Web database identity fingerprint is unavailable." >&2
  exit 1
fi

POSTGRES_CONTAINER_ID="$(${DOCKER[@]} ps --filter 'name=^/chuan-market-radar-postgres-1$' --format '{{.ID}}')"
if [[ -z "${POSTGRES_CONTAINER_ID}" ]]; then
  echo "ERROR: production Postgres container is unavailable." >&2
  exit 1
fi
EXPECTED_DATABASE_URL="$(${IDENTITY_COMPOSE[@]} config --format json | jq -r '.services.web.environment.DATABASE_URL')"
if ! printf '%s\n' "${EXPECTED_DATABASE_URL}" | ${DOCKER[@]} exec -i "${POSTGRES_CONTAINER_ID}" \
  sh -lc 'read -r database_url; psql "$database_url" -Atqc "select 1"' | grep -qx '1'; then
  unset EXPECTED_DATABASE_URL
  echo "ERROR: approved Web database identity failed a read-only connection probe." >&2
  exit 1
fi
unset EXPECTED_DATABASE_URL

WEB_CONTAINER_NAME="$(${DOCKER[@]} inspect --format '{{.Name}}' "${WEB_CONTAINER_ID}" | sed 's#^/##')"
OTHER_CONTAINERS_BEFORE="$(${DOCKER[@]} ps --format '{{.Names}}={{.ID}}' | grep -v "^${WEB_CONTAINER_NAME}=" | sort)"

health_body="$(curl -fsS "${BASE_URL}/api/health")"
if ! jq -e '.ok == true and .health.persistence.databaseStatus == "ready"' >/dev/null <<<"${health_body}"; then
  echo "ERROR: production health baseline is not safe for Web-only recovery." >&2
  exit 1
fi

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

verify_other_containers_unchanged() {
  local after
  after="$(${DOCKER[@]} ps --format '{{.Names}}={{.ID}}' | grep -v "^${WEB_CONTAINER_NAME}=" | sort)"
  OTHER_CONTAINERS_AFTER="${after}"
  [[ "${OTHER_CONTAINERS_AFTER}" == "${OTHER_CONTAINERS_BEFORE}" ]]
}

MUTATED=false
rollback_on_failure() {
  local exit_code=$?
  trap - EXIT
  if [[ "${exit_code}" -eq 0 || "${MUTATED}" != "true" ]]; then
    exit "${exit_code}"
  fi
  echo "ERROR: identity recovery failed; restoring the approved pre-recovery Web baseline." >&2
  "${BASELINE_COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web || true
  wait_for_web_http || true
  if ! verify_other_containers_unchanged; then
    echo "ERROR: non-Web container identity changed during rollback." >&2
  fi
  echo "ROLLBACK_PRE_RECOVERY_WEB_BASELINE_ATTEMPTED" >&2
  exit "${exit_code}"
}
trap rollback_on_failure EXIT

if [[ "${ACTUAL_DATABASE_URL_SHA256}" == "${EXPECTED_DATABASE_URL_SHA256}" ]]; then
  echo "NOOP_WEB_IDENTITY_ALREADY_MATCHES_APPROVED_OVERRIDE"
else
  MUTATED=true
  "${IDENTITY_COMPOSE[@]}" up -d --no-deps --no-build --force-recreate web
fi

if ! wait_for_web_http; then
  echo "ERROR: Web did not become reachable within the recovery timeout." >&2
  exit 1
fi

RECOVERED_WEB_CONTAINER_ID="$(${IDENTITY_COMPOSE[@]} ps -q web)"
RECOVERED_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${RECOVERED_WEB_CONTAINER_ID}")"
ACTUAL_DATABASE_URL_SHA256="$(${DOCKER[@]} exec "${RECOVERED_WEB_CONTAINER_ID}" sh -lc 'printf %s "$DATABASE_URL" | sha256sum' | awk '{print $1}')"
if [[ "${RECOVERED_WEB_IMAGE_ID}" != "${APPROVED_WEB_IMAGE_ID}" || "${ACTUAL_DATABASE_URL_SHA256}" != "${EXPECTED_DATABASE_URL_SHA256}" ]]; then
  echo "ERROR: recovered Web image or database identity does not match approval." >&2
  exit 1
fi
if ! verify_other_containers_unchanged; then
  echo "ERROR: a non-Web container changed during recovery." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${APPROVED_HEAD}" || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: production Git baseline changed during recovery." >&2
  exit 1
fi

health_body="$(curl -fsS "${BASE_URL}/api/health")"
if ! jq -e '
  .ok == true
  and .health.level == "ready"
  and .health.scan.freshness == "fresh"
  and .health.persistence.databaseStatus == "ready"
  and ((.health.persistence.detail // "") | ascii_downcase | contains("authentication failed") | not)
  and ((.health.persistence.detail // "") | ascii_downcase | contains("storage unavailable") | not)
' >/dev/null <<<"${health_body}"; then
  echo "ERROR: production health did not recover to ready/fresh persistence truth." >&2
  exit 1
fi
for endpoint in /api/frontend/radar-contract /api/radar/backend-contract /api/radar/business-capability; do
  if ! curl -fsS "${BASE_URL}${endpoint}" | jq -e '.ok == true' >/dev/null; then
    echo "ERROR: production contract verification failed: ${endpoint}" >&2
    exit 1
  fi
done
if ! ${DOCKER[@]} exec chuan-market-radar-postgres-1 pg_isready -U postgres >/dev/null; then
  echo "ERROR: Postgres readiness failed after recovery." >&2
  exit 1
fi
if [[ "$(${DOCKER[@]} exec chuan-market-radar-redis-1 redis-cli ping)" != "PONG" ]]; then
  echo "ERROR: Redis readiness failed after recovery." >&2
  exit 1
fi
${DOCKER[@]} exec -i "${RECOVERED_WEB_CONTAINER_ID}" node - <<'NODE'
const falseKeys = [
  "CANDIDATE_EPISODE_CANONICAL_WRITE",
  "CANDIDATE_EPISODE_SHADOW_WRITE",
  "CANDIDATE_EPISODE_DUAL_READ",
  "CANDIDATE_EPISODE_CANONICAL_READ",
  "CANDIDATE_EPISODE_REVIEW_READ",
];
const blankKeys = ["CANDIDATE_SOURCE_DATABASE_URL", "CANDIDATE_CONSUMER_DATABASE_URL", "CANDIDATE_MONITOR_DATABASE_URL"];
const isFalse = (value) => String(value ?? "false").trim().toLowerCase() === "false";
if (!falseKeys.every((key) => isFalse(process.env[key]))) process.exit(1);
if (!blankKeys.every((key) => !String(process.env[key] ?? "").trim())) process.exit(1);
if (String(process.env.CANDIDATE_RUNTIME_RELEASE_ID ?? "disabled").trim().toLowerCase() !== "disabled") process.exit(1);
if (!isFalse(process.env.CANDIDATE_SHADOW_WORKER_EXPECTED)) process.exit(1);
NODE
if ${DOCKER[@]} ps --format '{{.Names}}' | grep -qx 'chuan-market-radar-candidate-shadow-worker-1'; then
  echo "ERROR: Candidate worker appeared during recovery." >&2
  exit 1
fi

trap - EXIT
echo "PASS_PRODUCTION_WEB_IDENTITY_RECOVERY"
