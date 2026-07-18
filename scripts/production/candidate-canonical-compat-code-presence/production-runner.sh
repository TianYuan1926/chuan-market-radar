#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REQUEST_FILE="${REQUEST_FILE:-${SOURCE_ROOT}/approval-request.json}"
TRANSPORT_MANIFEST="${TRANSPORT_MANIFEST_OVERRIDE:-${SOURCE_ROOT}/transport-manifest.json}"
VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-code-presence/bundle.mjs"
EVIDENCE_VALIDATOR="${SOURCE_ROOT}/scripts/production/candidate-canonical-compat-code-presence/runner.mjs"
PRODUCTION_ROOT="/home/ubuntu/apps/chuan-market-radar"
ROOT_DIR="${ROOT_DIR_OVERRIDE:-${PRODUCTION_ROOT}}"
REHEARSAL="${CANONICAL_COMPAT_CODE_PRESENCE_REHEARSAL:-false}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
hash_file() { sha256sum "$1" | awk '{print $1}'; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

[[ -f "${REQUEST_FILE}" && ! -L "${REQUEST_FILE}" \
  && -f "${TRANSPORT_MANIFEST}" && ! -L "${TRANSPORT_MANIFEST}" ]] \
  || fail request_or_manifest_missing
[[ "$(file_mode "${REQUEST_FILE}")" == "600" \
  && "$(file_mode "${TRANSPORT_MANIFEST}")" == "600" ]] \
  || fail request_or_manifest_permissions_invalid
if [[ "${REHEARSAL}" != "true" ]]; then
  [[ "${ROOT_DIR}" == "${PRODUCTION_ROOT}" ]] || fail production_root_override_forbidden
fi

BUNDLE_SHA256="$(jq -r '.transportBundleSha256' "${REQUEST_FILE}")"
node "${VALIDATOR}" validate-request --manifest "${TRANSPORT_MANIFEST}" \
  --request "${REQUEST_FILE}" --bundle "${BUNDLE_SHA256}" >/dev/null

PRODUCTION_COMMIT="$(jq -r '.productionCommit' "${REQUEST_FILE}")"
PRODUCTION_TREE="$(jq -r '.productionTree' "${REQUEST_FILE}")"
BUILD_RECORD="$(jq -r '.buildRecordPath' "${REQUEST_FILE}")"
EVIDENCE_DIRECTORY="$(jq -r '.evidenceDirectory' "${REQUEST_FILE}")"
EXPECTED_WEB_CONTAINER="$(jq -r '.currentWebContainerId' "${REQUEST_FILE}")"
EXPECTED_WEB_IMAGE="$(jq -r '.currentWebImageId' "${REQUEST_FILE}")"
MIGRATION_ID="$(jq -r '.migrationId' "${REQUEST_FILE}")"
RELEASE_ID="$(jq -r '.releaseId' "${REQUEST_FILE}")"
AUTHORITY_EPOCH="$(jq -r '.authorityEpoch' "${REQUEST_FILE}")"
EXPECTED_MANIFEST_SHA="$(jq -r '.manifestSha256' "${REQUEST_FILE}")"

if [[ "${REHEARSAL}" == "true" ]]; then
  DOCKER=("${DOCKER_BIN_OVERRIDE:-docker}")
  HEALTH_URL="${HEALTH_URL_OVERRIDE:-http://127.0.0.1/api/health}"
  BUILD_RECORD="${BUILD_RECORD_PATH_OVERRIDE:-${BUILD_RECORD}}"
  EVIDENCE_DIRECTORY="${EVIDENCE_DIRECTORY_OVERRIDE:-${EVIDENCE_DIRECTORY}}"
else
  [[ -z "${DOCKER_BIN_OVERRIDE:-}${HEALTH_URL_OVERRIDE:-}${BUILD_RECORD_PATH_OVERRIDE:-}${EVIDENCE_DIRECTORY_OVERRIDE:-}" ]] \
    || fail production_rehearsal_override_forbidden
  DOCKER=(sudo -n docker)
  HEALTH_URL="http://127.0.0.1/api/health"
fi

[[ -f "${BUILD_RECORD}" && ! -L "${BUILD_RECORD}" \
  && "$(file_mode "${BUILD_RECORD}")" == "600" \
  && "$(hash_file "${BUILD_RECORD}")" == "$(jq -r '.buildRecordSha256' "${REQUEST_FILE}")" \
  && "$(jq -r '.schemaVersion' "${BUILD_RECORD}")" == "candidate-cycle-target-images.v1" \
  && "$(jq -r '.webTargetId' "${BUILD_RECORD}")" == "${EXPECTED_WEB_IMAGE}" \
  && "$(jq -r '.secretsPrinted' "${BUILD_RECORD}")" == "false" ]] \
  || fail build_record_identity_invalid

[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && -z "$(git -C "${ROOT_DIR}" branch --show-current)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD^{tree})" == "${PRODUCTION_TREE}" ]] \
  || fail production_git_identity_invalid

CODE_PATHS='[]'
while IFS= read -r row; do
  path="$(jq -r '.path' <<<"${row}")"
  reference_blob="$(jq -r '.blob' <<<"${row}")"
  production_blob="$(git -C "${ROOT_DIR}" rev-parse "${PRODUCTION_COMMIT}:${path}")"
  [[ "${production_blob}" == "${reference_blob}" ]] || fail "production_code_blob_mismatch:${path}"
  CODE_PATHS="$(jq -c --arg path "${path}" --arg referenceBlob "${reference_blob}" \
    --arg productionBlob "${production_blob}" \
    '. + [{path:$path,referenceBlob:$referenceBlob,productionBlob:$productionBlob}]' \
    <<<"${CODE_PATHS}")"
done < <(jq -c '.referenceCodePaths[]' "${REQUEST_FILE}")

web_container="$("${DOCKER[@]}" ps --filter name=^/chuan-market-radar-web-1$ --format '{{.ID}}')"
web_image="$("${DOCKER[@]}" inspect "${web_container}" --format '{{.Image}}')"
[[ "${web_container}" == "${EXPECTED_WEB_CONTAINER}" && "${web_image}" == "${EXPECTED_WEB_IMAGE}" ]] \
  || fail running_web_identity_invalid

non_web_snapshot() {
  "${DOCKER[@]}" ps --format '{{.Names}}={{.Image}}={{.ID}}' \
    | grep -v '^chuan-market-radar-web-1=' | LC_ALL=C sort
}
verify_candidate_read_authority() {
  MANIFEST_RAW="$("${DOCKER[@]}" exec "${web_container}" \
    cat /run/market-radar/candidate-read-authority.json)"
  [[ "$(printf '%s\n' "${MANIFEST_RAW}" | sha256sum | awk '{print $1}')" == "${EXPECTED_MANIFEST_SHA}" ]] \
    || return 1
  jq -e --arg migration "${MIGRATION_ID}" --arg release "${RELEASE_ID}" \
    --argjson epoch "${AUTHORITY_EPOCH}" \
    '.schemaVersion == "candidate-read-authority-manifest.v1"
      and .migrationId == $migration and .releaseId == $release
      and .authorityEpoch == $epoch and .phase == "shadow_verify"
      and .flags == {dualRead:true,canonicalRead:false,reviewRead:false}' \
    <<<"${MANIFEST_RAW}" >/dev/null || return 1
  API_RAW="$("${DOCKER[@]}" exec -i "${web_container}" node - <<'NODE'
const response = await fetch("http://127.0.0.1:3000/api/frontend/candidate-lifecycle", {
  headers: { "cache-control": "no-store" },
});
const body = await response.json();
const resource = body.resource ?? {};
process.stdout.write(JSON.stringify({
  httpStatus: response.status,
  ok: body.ok === true,
  mode: resource.mode,
  readSource: resource.readSource,
  authority: resource.authority,
  parityStatus: resource.parity?.status,
  differenceCount: resource.parity?.differenceCount,
  canAuthorizeCutover: resource.canAuthorizeCutover,
  canCreateTradePlan: resource.canCreateTradePlan,
  canMutateLiveRanking: resource.canMutateLiveRanking,
  automaticPhaseAdvance: resource.automaticPhaseAdvance,
}) + "\n");
NODE
  )"
  jq -e '.httpStatus == 200 and .ok == true
    and .mode == "dual_read_legacy_authority" and .readSource == "legacy"
    and .authority == "legacy_projection_non_authoritative"
    and .parityStatus == "pass" and .differenceCount == 0
    and .canAuthorizeCutover == false and .canCreateTradePlan == false
    and .canMutateLiveRanking == false and .automaticPhaseAdvance == false' \
    <<<"${API_RAW}" >/dev/null
}
NON_WEB_BEFORE="$(non_web_snapshot)"
HEALTH="$(curl -fsS "${HEALTH_URL}")"
jq -e '.ok == true and .health.level == "ready" and .health.scan.freshness == "fresh"
  and .health.persistence.databaseStatus == "ready"
  and ([.health.runtimeProbes.workers[]?
    | select(.name == "candidate-shadow-worker" and .status == "healthy")] | length == 1)' \
  <<<"${HEALTH}" >/dev/null || fail production_health_invalid
verify_candidate_read_authority || fail candidate_read_authority_invalid

[[ "$(non_web_snapshot)" == "${NON_WEB_BEFORE}" \
  && -z "$(git -C "${ROOT_DIR}" status --porcelain)" \
  && "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${PRODUCTION_COMMIT}" ]] \
  || fail read_only_boundary_drift
verify_candidate_read_authority || fail candidate_read_authority_drift

mkdir -p "$(dirname "${EVIDENCE_DIRECTORY}")"
mkdir "${EVIDENCE_DIRECTORY}"
chmod 700 "${EVIDENCE_DIRECTORY}"
SUMMARY="${EVIDENCE_DIRECTORY}/code-presence-evidence.json"
jq -n \
  --arg schemaVersion "candidate-canonical-compat-code-presence-evidence.v1" \
  --arg status "PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED" \
  --arg packageId "$(jq -r '.packageId' "${REQUEST_FILE}")" \
  --arg referenceCommit "$(jq -r '.referenceCommit' "${REQUEST_FILE}")" \
  --arg productionCommit "${PRODUCTION_COMMIT}" --arg productionTree "${PRODUCTION_TREE}" \
  --arg targetCommit "${PRODUCTION_COMMIT}" --arg targetWebImageId "${web_image}" \
  --arg runningWebContainerId "${web_container}" \
  --arg buildRecordSha256 "$(hash_file "${BUILD_RECORD}")" \
  --arg manifestSha256 "${EXPECTED_MANIFEST_SHA}" \
  --argjson candidateLifecycleApi "${API_RAW}" \
  --arg verifiedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson codePaths "${CODE_PATHS}" \
  '{schemaVersion:$schemaVersion,status:$status,packageId:$packageId,
    referenceCommit:$referenceCommit,productionCommit:$productionCommit,
    productionTree:$productionTree,targetCommit:$targetCommit,targetWebImageId:$targetWebImageId,
    runningWebContainerId:$runningWebContainerId,buildRecordSha256:$buildRecordSha256,
    codePaths:$codePaths,allCodePathsIdentical:true,productionGitClean:true,
    productionGitDetached:true,runningWebMatchesBuildRecord:true,healthLevel:"ready",
    manifestSha256:$manifestSha256,manifestPhase:"shadow_verify",
    readFlags:{dualRead:true,canonicalRead:false,reviewRead:false},
    candidateLifecycleApi:$candidateLifecycleApi,
    scanFreshness:"fresh",verifiedAt:$verifiedAt,
    verificationMode:"read_only_existing_canonical_code_identity",requiresWebRelease:false,
    servicesMutated:[],databaseMutation:false,redisMutation:false,workerMutation:false,
    phaseTransition:false,manifestMutation:false,environmentMutation:false,
    composeMutation:false,gitMutation:false,legacyResponseAuthority:true}' > "${SUMMARY}"

node "${EVIDENCE_VALIDATOR}" validate "${SUMMARY}" >/dev/null
printf 'PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED\n'
