#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-/home/ubuntu/apps/chuan-market-radar}"
BASE_ENV_FILE="${BASE_ENV_FILE:-${ROOT_DIR}/.env}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
IDENTITY_WRAPPER="${IDENTITY_WRAPPER:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/compose-identity-safe}"
IDENTITY_OVERRIDE_FILE="${IDENTITY_OVERRIDE_FILE:-/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/runtime/runtime-identity.override.yml}"
REQUEST_FILE="${REQUEST_FILE:-}"
SCAN_SUSTAINED_HEALTH_RELEASE_MODE="${SCAN_SUSTAINED_HEALTH_RELEASE_MODE:-dry_run}"
CONFIRM_SCAN_SUSTAINED_HEALTH_RELEASE="${CONFIRM_SCAN_SUSTAINED_HEALTH_RELEASE:-false}"
BASE_URL="${BASE_URL:-http://127.0.0.1}"
WEB_READY_TIMEOUT_SECONDS="${WEB_READY_TIMEOUT_SECONDS:-240}"
WEB_READY_POLL_SECONDS="${WEB_READY_POLL_SECONDS:-3}"
OBSERVATION_POLL_SECONDS="${OBSERVATION_POLL_SECONDS:-30}"
SCAN_SUSTAINED_HEALTH_RELEASE_FORCE_CONTAINER_VALIDATOR="${SCAN_SUSTAINED_HEALTH_RELEASE_FORCE_CONTAINER_VALIDATOR:-false}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/scan-sustained-health-release.mjs"
CONTRACT="${SOURCE_ROOT}/docs/governance/wp-g0-2-scan-sustained-health-production-release.v1.json"
ENTRYPOINT="${SOURCE_ROOT}/scripts/production/scan-sustained-health-release-entrypoint.sh"
TRANSPORT_MANIFEST="${SOURCE_ROOT}/transport-manifest.json"
LEASE_CLI="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease-cli.mjs"
LEASE_MODULE="${SOURCE_ROOT}/scripts/governance/autonomy-production-lease.mjs"
AUTONOMY_POLICY="${SOURCE_ROOT}/scripts/governance/autonomy-policy.mjs"
AUTONOMY_TRUST_ROOT="${MARKET_RADAR_AUTONOMY_TRUST_ROOT:-/home/ubuntu/.local/state/market-radar-autonomy}"
AUTONOMY_LEASE_CLI_RUNTIME="${AUTONOMY_LEASE_CLI_RUNTIME:-auto}"

PACKAGE_ID="WP-G0.2-SCAN-SUSTAINED-HEALTH-PRODUCTION-RELEASE"
BASELINE_COMMIT="0599f802f261fe8e3c1982a07106f362bd62ac13"
TARGET_COMMIT="70722ea71b33268b688be5d42af9908d40f49859"
TARGET_REMOTE_BRANCH="codex/wp-g0-2-scanner-sustained-health-release"
RELEASE_DIFF_SHA256="80bab7d7e3cdd5a9811dc0815c5df10205bce54e3f87c14d1791c94bcd3f6f58"

echo "package=${PACKAGE_ID}"
echo "mode=${SCAN_SUSTAINED_HEALTH_RELEASE_MODE}"
echo "service_allowlist=web,scanner-worker"
echo "target_commit=${TARGET_COMMIT}"

if command -v node >/dev/null 2>&1; then
  node "${VALIDATOR}" staged --root "${SOURCE_ROOT}"
elif [[ "${SCAN_SUSTAINED_HEALTH_RELEASE_MODE}" != "production_release" ]]; then
  echo "ERROR: local dry-run validation requires Node.js." >&2
  exit 1
fi

if [[ "${SCAN_SUSTAINED_HEALTH_RELEASE_MODE}" != "production_release" \
  || "${CONFIRM_SCAN_SUSTAINED_HEALTH_RELEASE}" != "true" ]]; then
  echo "DRY-RUN: production Git, images, containers, database, Redis and environment were not changed."
  echo "DRY-RUN: exact production approval is required for release execution."
  echo "production_decision=BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL"
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
if ! sudo -n docker ps >/dev/null 2>&1; then
  echo "ERROR: non-interactive privileged Docker access is unavailable." >&2
  exit 1
fi

DOCKER=(sudo -n docker)
IDENTITY_COMPOSE=(sudo -n "${IDENTITY_WRAPPER}")
WEB_CONTAINER_NAME="chuan-market-radar-web-1"
SCANNER_CONTAINER_NAME="chuan-market-radar-scanner-worker-1"
WEB_CONTAINER_ID="$(${DOCKER[@]} ps --filter "name=^/${WEB_CONTAINER_NAME}$" --format '{{.ID}}')"
SCANNER_CONTAINER_ID="$(${DOCKER[@]} ps --filter "name=^/${SCANNER_CONTAINER_NAME}$" --format '{{.ID}}')"
if [[ -z "${WEB_CONTAINER_ID}" || "${WEB_CONTAINER_ID}" == *$'\n'* \
  || -z "${SCANNER_CONTAINER_ID}" || "${SCANNER_CONTAINER_ID}" == *$'\n'* ]]; then
  echo "ERROR: exactly one current Web and scanner-worker container are required." >&2
  exit 1
fi

REQUEST_BASE64="$(base64 < "${REQUEST_FILE}" | tr -d '\r\n')"
CONTRACT_BASE64="$(base64 < "${CONTRACT}" | tr -d '\r\n')"
if command -v node >/dev/null 2>&1 \
  && [[ "${SCAN_SUSTAINED_HEALTH_RELEASE_FORCE_CONTAINER_VALIDATOR}" != "true" ]]; then
  node "${VALIDATOR}" request --root "${SOURCE_ROOT}" --request "${REQUEST_FILE}" >/dev/null
else
  ${DOCKER[@]} exec -i -e SCAN_SUSTAINED_HEALTH_RELEASE_STDIN=true "${WEB_CONTAINER_ID}" \
    node --input-type=module - request --request-base64 "${REQUEST_BASE64}" --contract-base64 "${CONTRACT_BASE64}" \
    < "${VALIDATOR}" >/dev/null
fi

APPROVED_BASELINE_COMMIT="$(jq -r '.baselineCommit' "${REQUEST_FILE}")"
APPROVED_TARGET_COMMIT="$(jq -r '.targetCommit' "${REQUEST_FILE}")"
APPROVED_TARGET_REMOTE_BRANCH="$(jq -r '.targetRemoteBranch' "${REQUEST_FILE}")"
APPROVED_RELEASE_DIFF_SHA256="$(jq -r '.releaseDiffSha256' "${REQUEST_FILE}")"
APPROVED_BASE_ENV_SHA256="$(jq -r '.baseEnvSha256' "${REQUEST_FILE}")"
APPROVED_PRODUCTION_ENV_SHA256="$(jq -r '.productionEnvSha256' "${REQUEST_FILE}")"
APPROVED_ARTIFACT_SHA256="$(jq -r '.releaseArtifactSha256' "${REQUEST_FILE}")"
APPROVED_OVERRIDE_SHA256="$(jq -r '.identityOverrideSha256' "${REQUEST_FILE}")"
APPROVED_WRAPPER_SHA256="$(jq -r '.composeWrapperSha256' "${REQUEST_FILE}")"
APPROVED_COMPOSE_SHA256="$(jq -r '.composeSha256' "${REQUEST_FILE}")"
APPROVED_WEB_IMAGE_ID="$(jq -r '.webImageId' "${REQUEST_FILE}")"
APPROVED_SCANNER_IMAGE_ID="$(jq -r '.scannerWorkerImageId' "${REQUEST_FILE}")"
APPROVED_ROLLBACK_WEB_IMAGE_REF="$(jq -r '.rollbackWebImageRef' "${REQUEST_FILE}")"
APPROVED_ROLLBACK_SCANNER_IMAGE_REF="$(jq -r '.rollbackScannerWorkerImageRef' "${REQUEST_FILE}")"
ROLLBACK_IMAGE_RETENTION_REQUIRED="$(jq -r '.rollbackImageRetentionRequired' "${REQUEST_FILE}")"
SESSION_INDEPENDENT_EXECUTION_REQUIRED="$(jq -r '.sessionIndependentExecutionRequired' "${REQUEST_FILE}")"
APPROVED_CONTRACT_SHA256="$(jq -r '.contractSha256' "${REQUEST_FILE}")"
APPROVED_RUNNER_SOURCE_COMMIT="$(jq -r '.runnerSourceCommit' "${REQUEST_FILE}")"
APPROVED_STAGING_DIRECTORY="$(jq -r '.stagingDirectory' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
OBSERVATION_DURATION_SECONDS="$(jq -r '.observationDurationSeconds' "${REQUEST_FILE}")"
CADENCE_SECONDS="$(jq -r '.cadenceSeconds' "${REQUEST_FILE}")"
REQUIRED_COMPLETION_ADVANCES="$(jq -r '.requiredCompletionAdvances' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_TRUST_ROOT="$(jq -r '.autonomyTrustRoot' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_APPROVAL_ID="$(jq -r '.autonomyAuthorization.approvalId' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_BASE_COMMIT="$(jq -r '.autonomyAuthorization.baseCommit' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_TARGET_COMMIT="$(jq -r '.autonomyAuthorization.targetCommit' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_TARGET_TREE="$(jq -r '.autonomyAuthorization.targetTree' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_DIFF_SHA256="$(jq -r '.autonomyAuthorization.diffSha256' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_PATH_SET_SHA256="$(jq -r '.autonomyAuthorization.pathSetSha256' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_GATE_EVIDENCE_SHA256="$(jq -r '.autonomyAuthorization.gateEvidenceSha256' "${REQUEST_FILE}")"
APPROVED_AUTONOMY_POLICY_SHA256="$(jq -r '.autonomyAuthorization.policySha256' "${REQUEST_FILE}")"

if [[ "${APPROVED_BASELINE_COMMIT}" != "${BASELINE_COMMIT}" \
  || "${APPROVED_TARGET_COMMIT}" != "${TARGET_COMMIT}" \
  || "${APPROVED_TARGET_REMOTE_BRANCH}" != "${TARGET_REMOTE_BRANCH}" \
  || "${APPROVED_RELEASE_DIFF_SHA256}" != "${RELEASE_DIFF_SHA256}" ]]; then
  echo "ERROR: release identity does not match the locked runner." >&2
  exit 1
fi
if [[ "${APPROVED_AUTONOMY_TRUST_ROOT}" != "/home/ubuntu/.local/state/market-radar-autonomy" \
  || "${AUTONOMY_TRUST_ROOT}" != "${APPROVED_AUTONOMY_TRUST_ROOT}" ]]; then
  echo "ERROR: production autonomy trust root does not match the locked external path." >&2
  exit 1
fi
WEB_DIGEST="${APPROVED_WEB_IMAGE_ID#sha256:}"
SCANNER_DIGEST="${APPROVED_SCANNER_IMAGE_ID#sha256:}"
EXPECTED_ROLLBACK_WEB_IMAGE_REF="market-radar-rollback/wp-g0-2-scan-health:web-${WEB_DIGEST:0:16}"
EXPECTED_ROLLBACK_SCANNER_IMAGE_REF="market-radar-rollback/wp-g0-2-scan-health:scanner-worker-${SCANNER_DIGEST:0:16}"
if [[ "${ROLLBACK_IMAGE_RETENTION_REQUIRED}" != "true" \
  || "${SESSION_INDEPENDENT_EXECUTION_REQUIRED}" != "true" \
  || "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" != "${EXPECTED_ROLLBACK_WEB_IMAGE_REF}" \
  || "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" != "${EXPECTED_ROLLBACK_SCANNER_IMAGE_REF}" ]]; then
  echo "ERROR: session-independent execution or rollback image retention approval is invalid." >&2
  exit 1
fi

SOURCE_ROOT_REAL="$(realpath "${SOURCE_ROOT}")"
ROOT_DIR_REAL="$(realpath "${ROOT_DIR}")"
if [[ "${SOURCE_ROOT_REAL}" != "${APPROVED_STAGING_DIRECTORY}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}" \
  || "${SOURCE_ROOT_REAL}" == "${ROOT_DIR_REAL}/"* ]]; then
  echo "ERROR: release runner must execute from the approved repository-external staging directory." >&2
  exit 1
fi
if [[ -e "${EVIDENCE_DIRECTORY}" ]]; then
  echo "ERROR: approved evidence directory already exists." >&2
  exit 1
fi

if [[ "$(sha256sum "${CONTRACT}" | awk '{print $1}')" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(jq -r '.sourceCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_RUNNER_SOURCE_COMMIT}" \
  || "$(jq -r '.sourceParentCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_BASE_COMMIT}" \
  || "$(jq -r '.sourceCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_TARGET_COMMIT}" \
  || "$(jq -r '.sourceTree' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_TARGET_TREE}" \
  || "$(jq -r '.sourceDiffSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_DIFF_SHA256}" \
  || "$(jq -r '.sourcePathSetSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_PATH_SET_SHA256}" \
  || "$(jq -r '.gateEvidenceSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_GATE_EVIDENCE_SHA256}" \
  || "$(jq -r '.policySha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_AUTONOMY_POLICY_SHA256}" \
  || "$(sha256sum "${AUTONOMY_POLICY}" | awk '{print $1}')" != "${APPROVED_AUTONOMY_POLICY_SHA256}" \
  || "$(jq -r '.targetCommit' "${TRANSPORT_MANIFEST}")" != "${APPROVED_TARGET_COMMIT}" \
  || "$(jq -r '.contractSha256' "${TRANSPORT_MANIFEST}")" != "${APPROVED_CONTRACT_SHA256}" \
  || "$(jq -r '.approvalEligible' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.transportMethod' "${TRANSPORT_MANIFEST}")" != "approved_orcaterm_bundle_upload" \
  || "$(jq -r '.reproducibleArchive' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.archiveFormat' "${TRANSPORT_MANIFEST}")" != "ustar+gzip-n" \
  || "$(jq -r '.sourceDateEpoch' "${TRANSPORT_MANIFEST}")" != "946684800" \
  || "$(jq -r '.containsSecrets' "${TRANSPORT_MANIFEST}")" != "false" \
  || "$(jq -r '.executionMode' "${TRANSPORT_MANIFEST}")" != "transient_systemd_unit" \
  || "$(jq -r '.sessionIndependentExecutionRequired' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.runnerLogs' "${TRANSPORT_MANIFEST}")" != "journald" \
  || "$(jq -r '.rollbackImageRetentionRequired' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.rollbackRetentionRepository' "${TRANSPORT_MANIFEST}")" != "market-radar-rollback/wp-g0-2-scan-health" \
  || "$(jq -r '.rollbackCleanupRequiresSeparateApproval' "${TRANSPORT_MANIFEST}")" != "true" \
  || "$(jq -r '.productionRepositoryMutationAllowed' "${TRANSPORT_MANIFEST}")" != "true" ]]; then
  echo "ERROR: staged transport manifest does not match approval." >&2
  exit 1
fi

if [[ "${APPROVED_ARTIFACT_SHA256}" != "$(jq -r '.artifact.sha256' "${CONTRACT}")" ]]; then
  echo "ERROR: release artifact checksum does not match approval." >&2
  exit 1
fi
while IFS= read -r artifact_file; do
  if [[ "$(sha256sum "${SOURCE_ROOT}/${artifact_file}" | awk '{print $1}')" \
    != "$(jq -r --arg file "${artifact_file}" '.artifact.fileSha256[$file]' "${CONTRACT}")" ]]; then
    echo "ERROR: staged release artifact file checksum mismatch: ${artifact_file}" >&2
    exit 1
  fi
done < <(jq -r '.artifact.files[]' "${CONTRACT}")

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
  echo "ERROR: production environment fingerprints do not match approval." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${APPROVED_BASELINE_COMMIT}" \
  || "$(git -C "${ROOT_DIR}" branch --show-current)" != "main" \
  || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: production Git baseline is not clean main at the approved commit." >&2
  exit 1
fi
if ${DOCKER[@]} ps --format '{{.Names}}' | grep -qx 'chuan-market-radar-candidate-shadow-worker-1'; then
  echo "ERROR: Candidate shadow worker must remain absent." >&2
  exit 1
fi

CURRENT_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${WEB_CONTAINER_ID}")"
CURRENT_SCANNER_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${SCANNER_CONTAINER_ID}")"
if [[ "${CURRENT_WEB_IMAGE_ID}" != "${APPROVED_WEB_IMAGE_ID}" \
  || "${CURRENT_SCANNER_IMAGE_ID}" != "${APPROVED_SCANNER_IMAGE_ID}" ]]; then
  echo "ERROR: current Web or scanner-worker image does not match approval." >&2
  exit 1
fi

git -C "${ROOT_DIR}" fetch --no-tags origin \
  "refs/heads/${TARGET_REMOTE_BRANCH}:refs/remotes/origin/${TARGET_REMOTE_BRANCH}"
REMOTE_TARGET="$(git -C "${ROOT_DIR}" rev-parse "refs/remotes/origin/${TARGET_REMOTE_BRANCH}")"
PARENT_LINE="$(git -C "${ROOT_DIR}" rev-list --parents -n 1 "${REMOTE_TARGET}")"
ACTUAL_RELEASE_DIFF_SHA256="$(git -C "${ROOT_DIR}" diff-tree --no-commit-id --name-status -r "${REMOTE_TARGET}" | sha256sum | awk '{print $1}')"
if [[ "${REMOTE_TARGET}" != "${TARGET_COMMIT}" \
  || "${PARENT_LINE}" != "${TARGET_COMMIT} ${BASELINE_COMMIT}" \
  || "${ACTUAL_RELEASE_DIFF_SHA256}" != "${RELEASE_DIFF_SHA256}" ]]; then
  echo "ERROR: fetched release commit, parent or path-set checksum is not approved." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" show "${TARGET_COMMIT}:docker-compose.yml" | sha256sum | awk '{print $1}')" \
  != "${APPROVED_COMPOSE_SHA256}" ]]; then
  echo "ERROR: target release does not preserve the approved Compose file." >&2
  exit 1
fi

health_body="$(curl -fsS "${BASE_URL}/api/health")"
if ! jq -e '.ok == true and .health.persistence.databaseStatus == "ready"' >/dev/null <<<"${health_body}"; then
  echo "ERROR: production persistence baseline is not safe for release." >&2
  exit 1
fi
BASELINE_SCAN_COMPLETED_AT="$(jq -r '.health.scan.completedAt // empty' <<<"${health_body}")"

EXPECTED_WEB_DATABASE_URL_SHA256="$(${IDENTITY_COMPOSE[@]} config --format json \
  | jq -j '.services.web.environment.DATABASE_URL' | sha256sum | awk '{print $1}')"
EXPECTED_SCANNER_DATABASE_URL_SHA256="$(${IDENTITY_COMPOSE[@]} config --format json \
  | jq -j '.services["scanner-worker"].environment.DATABASE_URL' | sha256sum | awk '{print $1}')"
if [[ -z "${EXPECTED_WEB_DATABASE_URL_SHA256}" || -z "${EXPECTED_SCANNER_DATABASE_URL_SHA256}" ]]; then
  echo "ERROR: expected database identity fingerprints are unavailable." >&2
  exit 1
fi
POSTGRES_CONTAINER_ID="$(${DOCKER[@]} ps --filter 'name=^/chuan-market-radar-postgres-1$' --format '{{.ID}}')"
EXPECTED_DATABASE_URL="$(${IDENTITY_COMPOSE[@]} config --format json | jq -r '.services.web.environment.DATABASE_URL')"
if [[ -z "${POSTGRES_CONTAINER_ID}" ]] \
  || ! printf '%s\n' "${EXPECTED_DATABASE_URL}" | ${DOCKER[@]} exec -i "${POSTGRES_CONTAINER_ID}" \
    sh -lc 'read -r database_url; psql "$database_url" -Atqc "select 1"' | grep -qx '1'; then
  unset EXPECTED_DATABASE_URL
  echo "ERROR: approved runtime database identity failed a read-only connection probe." >&2
  exit 1
fi
unset EXPECTED_DATABASE_URL

container_ids_excluding_targets() {
  ${DOCKER[@]} ps --format '{{.Names}}={{.ID}}' \
    | awk -F= -v web="${WEB_CONTAINER_NAME}" -v scanner="${SCANNER_CONTAINER_NAME}" \
      '$1 != web && $1 != scanner { print }' \
    | sort
}

NON_TARGET_CONTAINERS_BEFORE="$(container_ids_excluding_targets)"
PREVIOUS_WEB_IMAGE_ID="${CURRENT_WEB_IMAGE_ID}"
PREVIOUS_SCANNER_IMAGE_ID="${CURRENT_SCANNER_IMAGE_ID}"
PREVIOUS_WEB_IMAGE_REF="$(${DOCKER[@]} inspect --format '{{.Config.Image}}' "${WEB_CONTAINER_ID}")"
PREVIOUS_SCANNER_IMAGE_REF="$(${DOCKER[@]} inspect --format '{{.Config.Image}}' "${SCANNER_CONTAINER_ID}")"
if [[ -z "${PREVIOUS_WEB_IMAGE_REF}" || -z "${PREVIOUS_SCANNER_IMAGE_REF}" ]]; then
  echo "ERROR: rollback image references are unavailable." >&2
  exit 1
fi

umask 077
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
  echo "ERROR: production autonomy trust root escaped its repository-external boundary." >&2
  exit 1
fi
OBSERVATION_FILE="${EVIDENCE_DIRECTORY}/cadence-observation.jsonl"
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

verify_service_identity() {
  local service="$1" container_id="$2" expected_sha256 actual_sha256
  if [[ "${service}" == "web" ]]; then
    expected_sha256="${EXPECTED_WEB_DATABASE_URL_SHA256}"
  else
    expected_sha256="${EXPECTED_SCANNER_DATABASE_URL_SHA256}"
  fi
  actual_sha256="$(${DOCKER[@]} exec "${container_id}" sh -lc 'printf %s "$DATABASE_URL" | sha256sum' | awk '{print $1}')"
  [[ -n "${actual_sha256}" && "${actual_sha256}" == "${expected_sha256}" ]]
}

verify_non_target_containers_unchanged() {
  NON_TARGET_CONTAINERS_AFTER="$(container_ids_excluding_targets)"
  [[ "${NON_TARGET_CONTAINERS_AFTER}" == "${NON_TARGET_CONTAINERS_BEFORE}" ]]
}

verify_candidate_absent() {
  ! ${DOCKER[@]} ps --format '{{.Names}}' | grep -qx 'chuan-market-radar-candidate-shadow-worker-1'
}

verify_rollback_image_retention() {
  local retained_web_id retained_scanner_id
  retained_web_id="$(${DOCKER[@]} image inspect --format '{{.Id}}' "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" 2>/dev/null || true)"
  retained_scanner_id="$(${DOCKER[@]} image inspect --format '{{.Id}}' "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" 2>/dev/null || true)"
  [[ "${retained_web_id}" == "${PREVIOUS_WEB_IMAGE_ID}" \
    && "${retained_scanner_id}" == "${PREVIOUS_SCANNER_IMAGE_ID}" ]]
}

create_rollback_image_retention() {
  lease_checkpoint rollback-retention-web
  ${DOCKER[@]} tag "${PREVIOUS_WEB_IMAGE_ID}" "${APPROVED_ROLLBACK_WEB_IMAGE_REF}"
  lease_checkpoint rollback-retention-scanner
  ${DOCKER[@]} tag "${PREVIOUS_SCANNER_IMAGE_ID}" "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}"
  verify_rollback_image_retention
}

verify_contract_endpoints() {
  local endpoint
  for endpoint in /api/frontend/radar-contract /api/radar/backend-contract /api/radar/business-capability; do
    curl -fsS "${BASE_URL}${endpoint}" | jq -e '.ok == true' >/dev/null
  done
}

verify_release_payload() {
  ${DOCKER[@]} exec -i "${WEB_CONTAINER_NAME}" node - <<'NODE'
const { readFileSync } = require("node:fs");
const schedule = readFileSync("/app/deploy/workers/worker-schedule.mjs", "utf8");
const worker = readFileSync("/app/deploy/workers/protected-api-worker.mjs", "utf8");
if (!schedule.includes("nextFixedRateRunAt")) process.exit(1);
if (!worker.includes("fixed_rate_skip_missed") || !worker.includes('acceptedResultStatuses: ["updated"]')) process.exit(1);
NODE
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
  echo "ERROR: scan sustained-health release failed; restoring both approved baseline images and main HEAD." >&2
  if ! lease_safety_checkpoint rollback; then
    echo "P0_ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_FENCING_REJECTED" >&2
    exit "${exit_code}"
  fi
  local retention_ok=false
  if verify_rollback_image_retention; then
    retention_ok=true
  fi
  ${DOCKER[@]} tag "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" "${PREVIOUS_WEB_IMAGE_REF}" || true
  ${DOCKER[@]} tag "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" "${PREVIOUS_SCANNER_IMAGE_REF}" || true
  git -C "${ROOT_DIR}" checkout main || true
  ${IDENTITY_COMPOSE[@]} up -d --no-deps --no-build --force-recreate web || true
  wait_for_web_http || true
  ${IDENTITY_COMPOSE[@]} up -d --no-deps --no-build --force-recreate scanner-worker || true
  sleep 3
  local rollback_web_id rollback_scanner_id rollback_web_image rollback_scanner_image rollback_ok=false
  rollback_web_id="$(${IDENTITY_COMPOSE[@]} ps -q web 2>/dev/null || true)"
  rollback_scanner_id="$(${IDENTITY_COMPOSE[@]} ps -q scanner-worker 2>/dev/null || true)"
  rollback_web_image="$(${DOCKER[@]} inspect --format '{{.Image}}' "${rollback_web_id}" 2>/dev/null || true)"
  rollback_scanner_image="$(${DOCKER[@]} inspect --format '{{.Image}}' "${rollback_scanner_id}" 2>/dev/null || true)"
  if [[ "${retention_ok}" == "true" \
    && "$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)" == "${BASELINE_COMMIT}" \
    && "$(git -C "${ROOT_DIR}" branch --show-current 2>/dev/null || true)" == "main" \
    && "${rollback_web_image}" == "${PREVIOUS_WEB_IMAGE_ID}" \
    && "${rollback_scanner_image}" == "${PREVIOUS_SCANNER_IMAGE_ID}" ]] \
    && verify_service_identity web "${rollback_web_id}" \
    && verify_service_identity scanner-worker "${rollback_scanner_id}" \
    && verify_non_target_containers_unchanged \
    && verify_candidate_absent; then
    rollback_ok=true
  fi
  jq -n \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson originalExitCode "${exit_code}" \
    --argjson rollbackVerified "${rollback_ok}" \
    --argjson rollbackRetentionVerified "${retention_ok}" \
    --arg baselineCommit "${BASELINE_COMMIT}" \
    --arg webImageId "${rollback_web_image}" \
    --arg scannerWorkerImageId "${rollback_scanner_image}" \
    --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
    --arg rollbackScannerWorkerImageRef "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" \
    '{at:$at,originalExitCode:$originalExitCode,rollbackVerified:$rollbackVerified,rollbackRetentionVerified:$rollbackRetentionVerified,baselineCommit:$baselineCommit,webImageId:$webImageId,scannerWorkerImageId:$scannerWorkerImageId,rollbackWebImageRef:$rollbackWebImageRef,rollbackScannerWorkerImageRef:$rollbackScannerWorkerImageRef}' \
    > "${ROLLBACK_FILE}" || true
  if [[ "${rollback_ok}" == "true" ]]; then
    if lease_release ROLLBACK_PASS; then
      LEASE_RELEASED=true
    else
      rollback_ok=false
    fi
  fi
  if [[ "${rollback_ok}" == "true" ]]; then
    echo "ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_BASELINE_VERIFIED" >&2
  else
    echo "P0_ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_NOT_VERIFIED" >&2
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

if ! create_rollback_image_retention; then
  echo "ERROR: rollback image retention verification failed before production mutation." >&2
  exit 1
fi
jq -n \
  --arg retainedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg webImageId "${PREVIOUS_WEB_IMAGE_ID}" \
  --arg scannerWorkerImageId "${PREVIOUS_SCANNER_IMAGE_ID}" \
  --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
  --arg rollbackScannerWorkerImageRef "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" \
  '{retainedAt:$retainedAt,verified:true,retainAfterSuccess:true,cleanupRequiresSeparateApproval:true,webImageId:$webImageId,scannerWorkerImageId:$scannerWorkerImageId,rollbackWebImageRef:$rollbackWebImageRef,rollbackScannerWorkerImageRef:$rollbackScannerWorkerImageRef}' \
  > "${ROLLBACK_RETENTION_FILE}"

MUTATED=true
lease_checkpoint checkout-target
git -C "${ROOT_DIR}" checkout --detach "${TARGET_COMMIT}"
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${TARGET_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" \
  || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: production repository did not enter clean detached target state." >&2
  exit 1
fi
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback image retention drifted after target checkout." >&2
  exit 1
fi

lease_checkpoint build-target-images
${IDENTITY_COMPOSE[@]} build web scanner-worker
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback image retention drifted during target build." >&2
  exit 1
fi
lease_checkpoint recreate-web
${IDENTITY_COMPOSE[@]} up -d --no-deps --no-build --force-recreate web
if ! wait_for_web_http; then
  echo "ERROR: target Web did not become reachable within the release timeout." >&2
  exit 1
fi
DEPLOY_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback image retention drifted before scanner-worker recreation." >&2
  exit 1
fi
lease_checkpoint recreate-scanner-worker
${IDENTITY_COMPOSE[@]} up -d --no-deps --no-build --force-recreate scanner-worker

TARGET_WEB_CONTAINER_ID="$(${IDENTITY_COMPOSE[@]} ps -q web)"
TARGET_SCANNER_CONTAINER_ID="$(${IDENTITY_COMPOSE[@]} ps -q scanner-worker)"
TARGET_WEB_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${TARGET_WEB_CONTAINER_ID}")"
TARGET_SCANNER_IMAGE_ID="$(${DOCKER[@]} inspect --format '{{.Image}}' "${TARGET_SCANNER_CONTAINER_ID}")"
if [[ -z "${TARGET_WEB_CONTAINER_ID}" || -z "${TARGET_SCANNER_CONTAINER_ID}" \
  || "${TARGET_WEB_IMAGE_ID}" == "${PREVIOUS_WEB_IMAGE_ID}" \
  || "${TARGET_SCANNER_IMAGE_ID}" == "${PREVIOUS_SCANNER_IMAGE_ID}" ]]; then
  echo "ERROR: target Web or scanner-worker image transition was not proven." >&2
  exit 1
fi
if ! verify_service_identity web "${TARGET_WEB_CONTAINER_ID}" \
  || ! verify_service_identity scanner-worker "${TARGET_SCANNER_CONTAINER_ID}"; then
  echo "ERROR: target Web or scanner-worker database identity fingerprint drifted." >&2
  exit 1
fi
if ! verify_non_target_containers_unchanged; then
  echo "ERROR: a non-target production container changed during release." >&2
  exit 1
fi
if ! verify_candidate_absent; then
  echo "ERROR: Candidate shadow worker appeared during release." >&2
  exit 1
fi
if [[ "$(sha256sum "${ROOT_DIR}/docker-compose.yml" | awk '{print $1}')" != "${APPROVED_COMPOSE_SHA256}" \
  || "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${TARGET_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" \
  || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: target Git or Compose identity drifted after service recreation." >&2
  exit 1
fi
verify_release_payload
verify_contract_endpoints
if [[ "$(${DOCKER[@]} exec chuan-market-radar-redis-1 redis-cli ping)" != "PONG" ]]; then
  echo "ERROR: Redis readiness failed after release." >&2
  exit 1
fi
if ! ${DOCKER[@]} exec chuan-market-radar-postgres-1 pg_isready -U postgres >/dev/null; then
  echo "ERROR: Postgres readiness failed after release." >&2
  exit 1
fi

INITIAL_HEALTH_DEADLINE=$((SECONDS + CADENCE_SECONDS + WEB_READY_TIMEOUT_SECONDS))
INITIAL_COMPLETED_AT=""
while true; do
  lease_checkpoint initial-scan-wait
  health_body="$(curl -fsS "${BASE_URL}/api/health" 2>/dev/null || true)"
  if jq -e \
    '.ok == true
      and .health.persistence.databaseStatus == "ready"
      and .health.scan.freshness == "fresh"
      and ([.health.runtimeProbes.workers[]? | select(.name == "scanner-worker" and .status == "healthy")] | length == 1)' \
    >/dev/null 2>&1 <<<"${health_body}"; then
    INITIAL_COMPLETED_AT="$(jq -r '.health.scan.completedAt // empty' <<<"${health_body}")"
    if [[ -n "${INITIAL_COMPLETED_AT}" && "${INITIAL_COMPLETED_AT}" != "${BASELINE_SCAN_COMPLETED_AT}" ]]; then
      break
    fi
  fi
  if (( SECONDS >= INITIAL_HEALTH_DEADLINE )); then
    echo "ERROR: first target scan did not prove fresh completion and healthy scanner heartbeat." >&2
    exit 1
  fi
  sleep "${OBSERVATION_POLL_SECONDS}"
done

OBSERVATION_STARTED_EPOCH="$(date +%s)"
OBSERVATION_DEADLINE=$((OBSERVATION_STARTED_EPOCH + OBSERVATION_DURATION_SECONDS))
LAST_COMPLETED_AT="${INITIAL_COMPLETED_AT}"
COMPLETION_ADVANCES=0
SAMPLE_COUNT=0
while true; do
  lease_checkpoint observation-sample
  NOW_EPOCH="$(date +%s)"
  health_body="$(curl -fsS "${BASE_URL}/api/health" 2>/dev/null || true)"
  if ! jq -e \
    '.ok == true
      and .health.persistence.databaseStatus == "ready"
      and .health.scan.freshness == "fresh"
      and ([.health.runtimeProbes.workers[]? | select(.name == "scanner-worker" and .status == "healthy")] | length == 1)' \
    >/dev/null 2>&1 <<<"${health_body}"; then
    echo "ERROR: continuous fresh scan or healthy scanner heartbeat failed during observation." >&2
    exit 1
  fi
  CURRENT_COMPLETED_AT="$(jq -r '.health.scan.completedAt // empty' <<<"${health_body}")"
  if [[ -z "${CURRENT_COMPLETED_AT}" ]]; then
    echo "ERROR: scan completion truth is absent during observation." >&2
    exit 1
  fi
  if [[ "${CURRENT_COMPLETED_AT}" != "${LAST_COMPLETED_AT}" ]]; then
    COMPLETION_ADVANCES=$((COMPLETION_ADVANCES + 1))
    LAST_COMPLETED_AT="${CURRENT_COMPLETED_AT}"
  fi
  SAMPLE_COUNT=$((SAMPLE_COUNT + 1))
  jq -c \
    --arg sampledAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson completionAdvances "${COMPLETION_ADVANCES}" \
    '{sampledAt:$sampledAt,completionAdvances:$completionAdvances,level:.health.level,persistence:.health.persistence.databaseStatus,scan:{completedAt:.health.scan.completedAt,freshness:.health.scan.freshness,ageMinutes:.health.scan.ageMinutes,status:.health.scan.status},scannerWorker:([.health.runtimeProbes.workers[]? | select(.name == "scanner-worker")][0] // null)}' \
    <<<"${health_body}" >> "${OBSERVATION_FILE}"
  if (( NOW_EPOCH >= OBSERVATION_DEADLINE )); then
    break
  fi
  sleep "${OBSERVATION_POLL_SECONDS}"
done

if (( COMPLETION_ADVANCES < REQUIRED_COMPLETION_ADVANCES )); then
  echo "ERROR: observation did not prove the required scan completion advances." >&2
  exit 1
fi
if ! jq -e '.health.level == "ready" and .health.scan.freshness == "fresh" and .health.persistence.databaseStatus == "ready"' \
  >/dev/null <<<"${health_body}"; then
  echo "ERROR: final production health is not ready/fresh with ready persistence." >&2
  exit 1
fi

SCANNER_LOGS="$(${DOCKER[@]} logs --since "${DEPLOY_STARTED_AT}" "${TARGET_SCANNER_CONTAINER_ID}" 2>&1)"
FIXED_RATE_START_COUNT="$(jq -Rsc '[split("\n")[] | fromjson? | select(.message == "task-started" and .task == "scheduled-scan" and .scheduleMode == "fixed_rate_skip_missed")] | length' <<<"${SCANNER_LOGS}")"
UPDATED_SUCCESS_COUNT="$(jq -Rsc '[split("\n")[] | fromjson? | select(.message == "task-ok" and .task == "scheduled-scan" and .resultStatus == "updated")] | length' <<<"${SCANNER_LOGS}")"
FALSE_SUCCESS_COUNT="$(jq -Rsc '[split("\n")[] | fromjson? | select(.message == "task-ok" and .task == "scheduled-scan" and .resultStatus != "updated")] | length' <<<"${SCANNER_LOGS}")"
TASK_FAILURE_COUNT="$(jq -Rsc '[split("\n")[] | fromjson? | select((.message == "task-failed" or .message == "task-error") and .task == "scheduled-scan")] | length' <<<"${SCANNER_LOGS}")"
if (( FIXED_RATE_START_COUNT != 1 \
  || UPDATED_SUCCESS_COUNT < REQUIRED_COMPLETION_ADVANCES + 1 \
  || FALSE_SUCCESS_COUNT != 0 \
  || TASK_FAILURE_COUNT != 0 )); then
  echo "ERROR: scanner logs do not prove fixed-rate, updated-only successful cadence execution." >&2
  exit 1
fi

verify_contract_endpoints
verify_release_payload
if ! verify_non_target_containers_unchanged || ! verify_candidate_absent; then
  echo "ERROR: final non-target container or Candidate boundary failed." >&2
  exit 1
fi
if [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" != "${TARGET_COMMIT}" \
  || -n "$(git -C "${ROOT_DIR}" branch --show-current)" \
  || -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  echo "ERROR: final production Git identity is not clean detached target." >&2
  exit 1
fi
if ! verify_rollback_image_retention; then
  echo "ERROR: rollback images are not retained at successful release closeout." >&2
  exit 1
fi

lease_checkpoint success-closeout
lease_release PASS
LEASE_RELEASED=true

jq -n \
  --arg packageId "${PACKAGE_ID}" \
  --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg baselineCommit "${BASELINE_COMMIT}" \
  --arg targetCommit "${TARGET_COMMIT}" \
  --arg webImageId "${TARGET_WEB_IMAGE_ID}" \
  --arg scannerWorkerImageId "${TARGET_SCANNER_IMAGE_ID}" \
  --arg rollbackWebImageRef "${APPROVED_ROLLBACK_WEB_IMAGE_REF}" \
  --arg rollbackScannerWorkerImageRef "${APPROVED_ROLLBACK_SCANNER_IMAGE_REF}" \
  --arg initialCompletedAt "${INITIAL_COMPLETED_AT}" \
  --arg finalCompletedAt "${LAST_COMPLETED_AT}" \
  --argjson observationDurationSeconds "${OBSERVATION_DURATION_SECONDS}" \
  --argjson sampleCount "${SAMPLE_COUNT}" \
  --argjson completionAdvances "${COMPLETION_ADVANCES}" \
  --argjson updatedSuccessCount "${UPDATED_SUCCESS_COUNT}" \
  --argjson nonTargetContainersUnchanged true \
  '{status:"PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION",packageId:$packageId,completedAt:$completedAt,baselineCommit:$baselineCommit,targetCommit:$targetCommit,detachedHead:true,webImageId:$webImageId,scannerWorkerImageId:$scannerWorkerImageId,rollbackImagesRetained:true,rollbackWebImageRef:$rollbackWebImageRef,rollbackScannerWorkerImageRef:$rollbackScannerWorkerImageRef,rollbackCleanupRequiresSeparateApproval:true,initialCompletedAt:$initialCompletedAt,finalCompletedAt:$finalCompletedAt,observationDurationSeconds:$observationDurationSeconds,sampleCount:$sampleCount,completionAdvances:$completionAdvances,updatedSuccessCount:$updatedSuccessCount,continuousFreshness:true,scannerHeartbeatHealthy:true,finalHealth:"ready",nonTargetContainersUnchanged:$nonTargetContainersUnchanged,candidateRuntimeMutation:false,databaseMutation:false,redisMutation:false,environmentMutation:false}' \
  > "${SUMMARY_FILE}"

RELEASE_SUCCEEDED=true
trap - EXIT INT TERM HUP
echo "evidence_directory=${EVIDENCE_DIRECTORY}"
echo "PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION"
