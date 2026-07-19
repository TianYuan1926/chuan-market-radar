import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MINIMUM_OBSERVATION_SAMPLES,
  buildCanonicalCompatManifest,
  evaluateCanonicalCompatObservation,
  manifestApprovalDigest,
  renderLegacyEnvironment,
  renderCanonicalCompatEnvironment,
  serializeManifest,
  validateCodeReleaseEvidence,
  validateDualReadEvidence,
  validateObservationSample,
  validateReconciliationEvidence,
} from "./runner.mjs";
import {
  PRODUCTION_COMMIT as CODE_PRESENCE_PRODUCTION_COMMIT,
  PRODUCTION_TREE as CODE_PRESENCE_PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
} from "../candidate-canonical-compat-code-presence/runner.mjs";

const releaseId = "candidate-shadow-release-12345678";
const migrationId = "candidate-episode-v1-cycle-6";
const reconciliationHash = `sha256:${"1".repeat(64)}`;
const manifestHash = `sha256:${"2".repeat(64)}`;
const productionEnvHash = "3".repeat(64);
const webImageId = `sha256:${"4".repeat(64)}`;
const workerImageId = `sha256:${"5".repeat(64)}`;
const productionCommit = "6".repeat(40);

function shadowVerifyEnvironment() {
  return [
    "CANDIDATE_SOURCE_DATABASE_URL=[REDACTED_SOURCE]",
    "CANDIDATE_CONSUMER_DATABASE_URL=[REDACTED_CONSUMER]",
    "CANDIDATE_MONITOR_DATABASE_URL=[REDACTED_MONITOR]",
    `CANDIDATE_RUNTIME_RELEASE_ID=${releaseId}`,
    "CANDIDATE_EPISODE_CANONICAL_WRITE=false",
    "CANDIDATE_EPISODE_SHADOW_WRITE=true",
    "CANDIDATE_EPISODE_DUAL_READ=true",
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
    schemaVersion: "candidate-canonical-compat-full-snapshot-parity.v1",
    status: "pass",
    sameDatabaseSnapshot: true,
    transactionIsolation: "serializable_read_only_deferrable",
    phase: "canonical_compat",
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
    schemaVersion: "candidate-canonical-compat-observation-sample.v1",
    sampledAt,
    packageId: "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION",
    productionCommit,
    webContainerId: "web-container-1",
    webImageId,
    candidateWorkerContainerId: "worker-container-1",
    candidateWorkerImageId: workerImageId,
    migrationId,
    releaseId,
    authorityEpoch: 4,
    phase: "canonical_compat",
    approvalDigest: manifestHash,
    manifestSha256: manifestHash.slice("sha256:".length),
    productionEnvSha256: productionEnvHash,
    healthLevel: "ready",
    scanFreshness: "fresh",
    databaseStatus: "ready",
    redisStatus: "healthy",
    candidateWorkerStatus: "absent",
    scannerWorkerStatus: "healthy",
    api: {
      httpStatus: 200,
      ok: true,
      status: "ready",
      mode: "canonical_compat_candidate",
      readSource: "candidate",
      authority: "candidate_authority",
      allowedUse: "candidate_lifecycle_and_review_only",
      candidateCanonicalReviewUsable: true,
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

test("renders only the guarded Canonical Compat read flags", () => {
  const rendered = renderCanonicalCompatEnvironment(shadowVerifyEnvironment(), releaseId);
  assert.match(rendered, /^CANDIDATE_EPISODE_DUAL_READ="true"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_CANONICAL_READ="true"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_REVIEW_READ="true"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_SHADOW_WRITE="false"$/mu);
  assert.match(rendered, /^CANDIDATE_EPISODE_CANONICAL_WRITE="false"$/mu);
  assert.match(rendered, /^CANDIDATE_SHADOW_WORKER_EXPECTED="false"$/mu);
  assert.match(rendered, /^UNRELATED=value$/mu);
});

test("renders a fail-closed legacy environment without deleting database URLs", () => {
  const rendered = renderLegacyEnvironment(shadowVerifyEnvironment());
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

test("builds an exact next-epoch manifest bound to reconciliation and dual-read evidence", () => {
  const manifest = buildCanonicalCompatManifest({
    currentAuthorityEpoch: 3,
    dualReadEvidenceHash: `sha256:${"a".repeat(64)}`,
    generatedAt: "2026-07-17T00:00:00.000Z",
    migrationId,
    reconciliationEvidenceHash: reconciliationHash,
    releaseId,
  });
  assert.equal(manifest.authorityEpoch, 4);
  assert.equal(manifest.phase, "canonical_compat");
  assert.deepEqual(manifest.flags, {
    dualRead: true,
    canonicalRead: true,
    reviewRead: true,
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
    sourceReleaseCount: 6,
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
  assert.throws(() => validateReconciliationEvidence({ ...evidence, sourceReleaseCount: 2 }),
    /reconciliation_cycle_count_mismatch/u);
});

test("accepts the already deployed Web-only code release that retained Legacy authority", () => {
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
  assert.equal(validateCodeReleaseEvidence(evidence), evidence);
  assert.throws(() => validateCodeReleaseEvidence({ ...evidence, databaseMutation: true }),
    /canonical_compat_code_release_boundary_invalid/u);
});

test("accepts exact zero-mutation Canonical code presence under Shadow Verify", () => {
  const imageId = `sha256:${"a".repeat(64)}`;
  const evidence = buildCodePresenceEvidence({
    productionCommit: CODE_PRESENCE_PRODUCTION_COMMIT,
    productionTree: CODE_PRESENCE_PRODUCTION_TREE,
    productionBlobs: Object.fromEntries(
      REFERENCE_CODE_PATHS.map(({ path, blob }) => [path, blob])),
    runningWebImageId: imageId,
    buildRecordWebImageId: imageId,
    runningWebContainerId: "b".repeat(64),
    buildRecordSha256: "c".repeat(64),
    productionGitClean: true,
    productionGitDetached: true,
    manifestSha256: "d".repeat(64),
    manifestPhase: "shadow_verify",
    readFlags: { dualRead: true, canonicalRead: false, reviewRead: false },
    candidateLifecycleApi: {
      httpStatus: 200,
      ok: true,
      mode: "dual_read_legacy_authority",
      readSource: "legacy",
      authority: "legacy_projection_non_authoritative",
      parityStatus: "pass",
      differenceCount: 0,
      canAuthorizeCutover: false,
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      automaticPhaseAdvance: false,
    },
    healthLevel: "ready",
    scanFreshness: "fresh",
    verifiedAt: "2026-07-20T05:00:00.000Z",
  });
  assert.equal(validateCodeReleaseEvidence(evidence), evidence);
});

test("requires parity-gated Candidate authority and full-snapshot parity in every sample", () => {
  assert.equal(validateObservationSample(sample(0), expected).api.readSource, "candidate");
  assert.throws(() => validateObservationSample({
    ...sample(0),
    api: { ...sample(0).api, readSource: "legacy_fallback" },
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
  const evidence = evaluateCanonicalCompatObservation(samples, expected);
  assert.equal(evidence.status, "PASS_CANONICAL_COMPAT_OBSERVATION");
  assert.equal(evidence.sampleCount, 289);
  assert.equal(evidence.coverageHours, 24);
  assert.equal(evidence.differenceCount, 0);
  assert.equal(evidence.candidateResponseAuthorityConditionalOnParity, true);
  assert.equal(evidence.legacyFallbackObserved, false);
  assert.equal(evidence.candidateCanonicalReviewUsable, true);
  assert.equal(evidence.automaticPhaseAdvance, false);
  assert.equal(evidence.canonicalCompatStarted, true);
  assert.match(evidence.evidenceHash, /^sha256:[0-9a-f]{64}$/u);
});

test("accepts only the exact 24-hour dual-read prerequisite for this authority identity", () => {
  const evidence = {
    schemaVersion: "candidate-shadow-verify-observation-evidence.v1",
    status: "PASS_DUAL_READ_OBSERVATION",
    packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
    migrationId,
    releaseId,
    authorityEpoch: 3,
    sampleCount: 289,
    coverageHours: 24,
    maximumGapSeconds: 300,
    allPagesComparedEverySample: true,
    differenceCount: 0,
    legacyResponseAuthority: true,
    candidateCanonicalReviewUsable: false,
    canAuthorizeCutover: false,
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    automaticPhaseAdvance: false,
    canonicalCompatStarted: false,
    canonicalCutoverExecuted: false,
    g0Completed: false,
    violations: [],
    evidenceHash: `sha256:${"a".repeat(64)}`,
  };
  assert.equal(validateDualReadEvidence(evidence, {
    migrationId, releaseId, authorityEpoch: 3,
  }), evidence);
  assert.throws(() => validateDualReadEvidence({ ...evidence, sampleCount: 288 }),
    /dual_read_observation_result_invalid/u);
  assert.throws(() => validateDualReadEvidence({ ...evidence, authorityEpoch: 2 }, {
    authorityEpoch: 3,
  }), /dual_read_observation_identity_mismatch/u);
});

test("fails shortened, missing-page, drifted, and nonzero-difference observations", () => {
  const complete = Array.from({ length: MINIMUM_OBSERVATION_SAMPLES }, (_, index) => sample(index));
  assert.equal(evaluateCanonicalCompatObservation(complete.slice(1), expected).status,
    "FAIL_CANONICAL_COMPAT_OBSERVATION");
  const missingPage = complete.map((value, index) => index === 20
    ? { ...value, fullSnapshot: { ...value.fullSnapshot, allPagesVisited: false } }
    : value);
  assert.equal(evaluateCanonicalCompatObservation(missingPage, expected).status,
    "FAIL_CANONICAL_COMPAT_OBSERVATION");
  const drift = complete.map((value, index) => index === 30
    ? { ...value, webImageId: `sha256:${"a".repeat(64)}` }
    : value);
  assert.equal(evaluateCanonicalCompatObservation(drift, expected).status,
    "FAIL_CANONICAL_COMPAT_OBSERVATION");
  const difference = complete.map((value, index) => index === 40
    ? { ...value, api: { ...value.api, differenceCount: 1 } }
    : value);
  assert.equal(evaluateCanonicalCompatObservation(difference, expected).status,
    "FAIL_CANONICAL_COMPAT_OBSERVATION");
});
