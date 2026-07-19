import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MINIMUM_OBSERVATION_SAMPLES,
  buildShadowVerifyManifest,
  evaluateShadowVerifyObservation,
  manifestApprovalDigest,
  renderLegacyEnvironment,
  renderShadowVerifyEnvironment,
  serializeManifest,
  validateCodeReleaseEvidence,
  validateObservationSample,
  validateReconciliationEvidence,
} from "./runner.mjs";
import {
  PRODUCTION_COMMIT as CODE_PRESENCE_PRODUCTION_COMMIT,
  PRODUCTION_TREE as CODE_PRESENCE_PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
} from "../candidate-shadow-verify-code-presence/runner.mjs";

const releaseId = "candidate-shadow-release-12345678";
const migrationId = "candidate-episode-v1-cycle-7";
const reconciliationHash = `sha256:${"1".repeat(64)}`;
const manifestHash = `sha256:${"2".repeat(64)}`;
const productionEnvHash = "3".repeat(64);
const webImageId = `sha256:${"4".repeat(64)}`;
const workerImageId = `sha256:${"5".repeat(64)}`;
const productionCommit = CODE_PRESENCE_PRODUCTION_COMMIT;

function shadowCaptureEnvironment() {
  return [
    "CANDIDATE_SOURCE_DATABASE_URL=[REDACTED_SOURCE]",
    "CANDIDATE_CONSUMER_DATABASE_URL=[REDACTED_CONSUMER]",
    "CANDIDATE_MONITOR_DATABASE_URL=[REDACTED_MONITOR]",
    `CANDIDATE_RUNTIME_RELEASE_ID=${releaseId}`,
    "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
    "CANDIDATE_EPISODE_SHADOW_WRITE=true",
    "CANDIDATE_EPISODE_DUAL_READ=false",
    "CANDIDATE_EPISODE_CANONICAL_READ=false",
    "CANDIDATE_EPISODE_REVIEW_READ=false",
    "CANDIDATE_SHADOW_WORKER_EXPECTED=true",
    "UNRELATED=value",
  ].join("\n") + "\n";
}

const expected = {
  productionCommit,
  webContainerId: "web-container-1",
  webImageId,
  candidateWorkerContainerId: "worker-container-1",
  candidateWorkerImageId: workerImageId,
  migrationId,
  releaseId,
  authorityEpoch: 4,
  approvalDigest: manifestHash,
  manifestSha256: manifestHash.slice("sha256:".length),
  productionEnvSha256: productionEnvHash,
};

function fullSnapshot(databaseNow = "2026-07-17T00:00:00.000Z") {
  return {
    schemaVersion: "candidate-full-snapshot-parity.v1",
    status: "pass",
    sameDatabaseSnapshot: true,
    transactionIsolation: "serializable_read_only_deferrable",
    phase: "shadow_verify",
    migrationId,
    releaseId,
    authorityEpoch: 4,
    databaseNow,
    pageCount: 2,
    totalEpisodes: 1200,
    returnedEpisodes: 1200,
    duplicateEpisodeIds: 0,
    differenceCount: 0,
    allPagesVisited: true,
    referenceStatus: "ready",
    candidateStatus: "ready",
    databaseRole: "candidate_audit_role",
    transactionReadOnly: true,
    canAuthorizeCutover: false,
    automaticPhaseAdvance: false,
    authorityFingerprint: `sha256:${"7".repeat(64)}`,
    comparisonHash: `sha256:${"8".repeat(64)}`,
  };
}

function sample(index) {
  const sampledAt = new Date(Date.UTC(2026, 6, 17, 0, index * 5, 0)).toISOString();
  return {
    schemaVersion: "candidate-shadow-verify-observation-sample.v1",
    sampledAt,
    packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
    productionCommit,
    webContainerId: "web-container-1",
    webImageId,
    candidateWorkerContainerId: "worker-container-1",
    candidateWorkerImageId: workerImageId,
    migrationId,
    releaseId,
    authorityEpoch: 4,
    phase: "shadow_verify",
    approvalDigest: manifestHash,
    manifestSha256: manifestHash.slice("sha256:".length),
    productionEnvSha256: productionEnvHash,
    healthLevel: "ready",
    scanFreshness: "fresh",
    databaseStatus: "ready",
    redisStatus: "healthy",
    candidateWorkerStatus: "healthy",
    scannerWorkerStatus: "healthy",
    api: {
      httpStatus: 200,
      ok: true,
      mode: "dual_read_legacy_authority",
      readSource: "legacy",
      authority: "legacy_projection_non_authoritative",
      candidateCanonicalReviewUsable: false,
      canAuthorizeCutover: false,
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      automaticPhaseAdvance: false,
      parityStatus: "pass",
      differenceCount: 0,
      differences: 0,
      comparisonHash: `sha256:${"9".repeat(64)}`,
    },
    fullSnapshot: fullSnapshot(sampledAt),
  };
}

test("renders only the guarded Shadow Verify read flags", () => {
  const rendered = renderShadowVerifyEnvironment(shadowCaptureEnvironment(), releaseId);
  assert.match(rendered, /^CANDIDATE_EPISODE_DUAL_READ="true"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_CANONICAL_READ="false"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_REVIEW_READ="false"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_SHADOW_WRITE=true$/mu);
  assert.match(rendered, /^UNRELATED=value$/mu);
});

test("renders a fail-closed legacy environment without deleting database URLs", () => {
  const rendered = renderLegacyEnvironment(shadowCaptureEnvironment());
  for (const key of [
    "CANDIDATE_EPISODE_CANONICAL_WRITE",
    "CANDIDATE_EPISODE_SHADOW_WRITE",
    "CANDIDATE_EPISODE_DUAL_READ",
    "CANDIDATE_EPISODE_CANONICAL_READ",
    "CANDIDATE_EPISODE_REVIEW_READ",
    "CANDIDATE_SHADOW_WORKER_EXPECTED",
  ]) assert.match(rendered, new RegExp(`^${key}="false"$`, "mu"));
  assert.match(rendered, /^CANDIDATE_RUNTIME_RELEASE_ID="disabled"$/mu);
  assert.match(rendered, /^CANDIDATE_MONITOR_DATABASE_URL=\[REDACTED_MONITOR\]$/mu);
});

test("builds an exact next-epoch manifest bound to reconciliation", () => {
  const manifest = buildShadowVerifyManifest({
    currentAuthorityEpoch: 3,
    generatedAt: "2026-07-17T00:00:00.000Z",
    migrationId,
    reconciliationEvidenceHash: reconciliationHash,
    releaseId,
  });
  assert.equal(manifest.authorityEpoch, 4);
  assert.equal(manifest.phase, "shadow_verify");
  assert.deepEqual(manifest.flags, {
    dualRead: true,
    canonicalRead: false,
    reviewRead: false,
  });
  assert.equal(manifest.evidence.reconciliation.evidenceHash, reconciliationHash);
  assert.match(manifestApprovalDigest(serializeManifest(manifest)), /^sha256:[0-9a-f]{64}$/u);
});

test("accepts only a complete zero-difference reconciliation", () => {
  const evidence = {
    schemaVersion: "candidate-multi-cycle-reconciliation-evidence.v3",
    status:
      "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
    automaticPhaseAdvance: false,
    phaseTransitionExecuted: false,
    shadowVerifyTransitionExecuted: false,
    canonicalReadEnabled: false,
    canonicalWriteEnabled: false,
    reviewReadEnabled: false,
    g0Completed: false,
    productionRankingInputsUsed: false,
    futureOutcomeInputsUsed: false,
    databaseIdentity: {
      currentRole: "candidate_audit_role",
      transactionReadOnly: true,
      transactionIsolation: "repeatable read",
    },
    lineageIdentityBinding: "file_hash_request_database_exact_match",
    lineageEvidenceSha256: `sha256:${"a".repeat(64)}`,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: "b".repeat(64),
      unifiedFinal: "c".repeat(64),
      unifiedSamples: "d".repeat(64),
    },
    comparedWrites: 10000,
    comparisonDifferences: 0,
    duplicateOutboxMappings: 0,
    duplicateEventMappings: 0,
    resolvedQuarantineExclusions: 0,
    sourceReleaseCount: 7,
    verificationMigrationId: migrationId,
    evidenceHash: reconciliationHash,
    violations: [],
    differenceSample: [],
  };
  assert.equal(validateReconciliationEvidence(evidence), evidence);
  assert.throws(() => validateReconciliationEvidence({ ...evidence, comparedWrites: 9999 }),
    /reconciliation_result_invalid/u);
  assert.throws(() => validateReconciliationEvidence({ ...evidence, comparisonDifferences: 1 }),
    /reconciliation_result_invalid/u);
  assert.throws(() => validateReconciliationEvidence({
    ...evidence,
    schemaVersion: "candidate-shadow-reconciliation-evidence.v1",
  }), /reconciliation_status_invalid/u);
  assert.throws(() => validateReconciliationEvidence({ ...evidence, sourceReleaseCount: 2 }),
    /reconciliation_cycle_count_mismatch/u);
});

test("rejects historical Web release evidence after exact code presence is available", () => {
  const evidence = {
    status: "PASS_PRODUCTION_SHADOW_VERIFY_CODE_AUTHORIZATION_WEB_ONLY",
    targetCommit: productionCommit,
    targetWebImageId: webImageId,
    servicesMutated: ["web"],
    databaseMutation: false,
    redisMutation: false,
    workerMutation: false,
    phaseTransition: false,
    manifestMutation: false,
    legacyResponseAuthority: true,
  };
  assert.throws(() => validateCodeReleaseEvidence(evidence),
    /shadow_verify_code_presence_required/u);
});

test("accepts exact zero-mutation production code presence instead of a no-op release", () => {
  const evidence = buildCodePresenceEvidence({
    productionCommit: CODE_PRESENCE_PRODUCTION_COMMIT,
    productionTree: CODE_PRESENCE_PRODUCTION_TREE,
    productionBlobs: Object.fromEntries(REFERENCE_CODE_PATHS.map((item) => [item.path, item.blob])),
    runningWebContainerId: "9".repeat(64),
    runningWebImageId: webImageId,
    buildRecordWebImageId: webImageId,
    buildRecordSha256: "8".repeat(64),
    productionGitClean: true,
    productionGitDetached: true,
    candidateReadManifestAbsent: true,
    candidateReadEndpointFailClosed: true,
    healthLevel: "ready",
    scanFreshness: "fresh",
    verifiedAt: "2026-07-19T01:50:00.000Z",
  });
  assert.equal(validateCodeReleaseEvidence(evidence), evidence);
  assert.throws(() => validateCodeReleaseEvidence({ ...evidence, gitMutation: true }),
    /code_presence_mutation_boundary_invalid/u);
});

test("requires API Legacy authority and full-snapshot parity in every sample", () => {
  assert.equal(validateObservationSample(sample(0), expected).api.readSource, "legacy");
  assert.throws(() => validateObservationSample({
    ...sample(0),
    api: { ...sample(0).api, readSource: "candidate" },
  }, expected), /observation_api_boundary_invalid/u);
  assert.throws(() => validateObservationSample({
    ...sample(0),
    fullSnapshot: { ...sample(0).fullSnapshot, allPagesVisited: false },
  }, expected), /full_snapshot_contract_invalid/u);
  assert.throws(() => validateObservationSample({
    ...sample(0),
    sampledAt: "2026-07-17T00:00:01.000Z",
  }, expected), /observation_sample_database_time_mismatch/u);
});

test("passes exactly 289 samples spanning 24 hours without automatic advancement", () => {
  const samples = Array.from({ length: MINIMUM_OBSERVATION_SAMPLES }, (_, index) => sample(index));
  const evidence = evaluateShadowVerifyObservation(samples, expected);
  assert.equal(evidence.status, "PASS_DUAL_READ_OBSERVATION");
  assert.equal(evidence.sampleCount, 289);
  assert.equal(evidence.coverageHours, 24);
  assert.equal(evidence.differenceCount, 0);
  assert.equal(evidence.legacyResponseAuthority, true);
  assert.equal(evidence.automaticPhaseAdvance, false);
  assert.equal(evidence.canonicalCompatStarted, false);
  assert.match(evidence.evidenceHash, /^sha256:[0-9a-f]{64}$/u);
});

test("fails shortened, missing-page, drifted, and nonzero-difference observations", () => {
  const complete = Array.from({ length: MINIMUM_OBSERVATION_SAMPLES }, (_, index) => sample(index));
  assert.equal(evaluateShadowVerifyObservation(complete.slice(1), expected).status,
    "FAIL_SHADOW_VERIFY_OBSERVATION");
  const missingPage = complete.map((value, index) => index === 20
    ? { ...value, fullSnapshot: { ...value.fullSnapshot, allPagesVisited: false } }
    : value);
  assert.equal(evaluateShadowVerifyObservation(missingPage, expected).status,
    "FAIL_SHADOW_VERIFY_OBSERVATION");
  const drift = complete.map((value, index) => index === 30
    ? { ...value, webImageId: `sha256:${"a".repeat(64)}` }
    : value);
  assert.equal(evaluateShadowVerifyObservation(drift, expected).status,
    "FAIL_SHADOW_VERIFY_OBSERVATION");
  const difference = complete.map((value, index) => index === 40
    ? { ...value, api: { ...value.api, differenceCount: 1 } }
    : value);
  assert.equal(evaluateShadowVerifyObservation(difference, expected).status,
    "FAIL_SHADOW_VERIFY_OBSERVATION");
});
