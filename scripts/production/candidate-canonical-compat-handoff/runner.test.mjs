import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PACKAGE_ID,
  PIPELINE_PASS,
  REQUIRED_PRODUCTION_COMMIT,
  SEQUENCE,
  buildPhaseRuntimeFromCodePresence,
  createExecutionRequest,
  validateCodePresenceSummary,
  validateExecutionRequest,
  validatePipelineFinal,
  validateRuntime,
} from "./runner.mjs";
import { projectCodePresenceRuntime } from "./request-generator.mjs";
import {
  EVIDENCE_PASS as CODE_PRESENCE_PASS,
  PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
} from "../candidate-canonical-compat-code-presence/runner.mjs";
import {
  createProductionExecutionRequest as createPhaseExecutionRequest,
} from "../candidate-canonical-compat-phase/bundle.mjs";
import {
  validateDualReadEvidence,
  validateReconciliationEvidence,
} from "../candidate-canonical-compat-phase/runner.mjs";
import {
  LINEAGE_PASS,
  LINEAGE_SCHEMA,
  validateCandidateLineageEvidence,
} from "../candidate-lineage/runner.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const image = (character) => `sha256:${hash(character)}`;
const nonce = "12345678-1234-4234-8234-123456789abc";
const issuedAt = new Date("2026-07-18T20:00:00.000Z");
const releaseId = "candidate-shadow-cycle-7-47741f3";
const evidenceRoot = "/home/ubuntu/.cache/market-radar-ops/evidence/current-cycle-canonical-compat";

const RUNTIME_KEYS = Object.freeze([
  "baseEnvPath", "baseEnvSha256", "buildRecordPath", "buildRecordSha256",
  "buildRecordWebImageId", "candidateWorkerContainerId", "candidateWorkerImageId",
  "composeSha256", "currentApprovalDigest", "currentAuthorityEpoch",
  "currentManifestSha256", "currentWebContainerId", "currentWebImageId",
  "dualReadEvidencePath", "dualReadEvidenceSha256", "healthLevel",
  "identityOverridePath", "identityOverrideSha256", "identityWrapperPath",
  "identityWrapperSha256", "lineageEvidencePath", "lineageEvidenceSha256",
  "migrationId", "postgresAdminEnvPath", "productionCommit", "productionEnvPath",
  "productionEnvSha256", "productionTree", "reconciliationEvidencePath",
  "reconciliationEvidenceSha256", "releaseId", "scanFreshness",
  "targetProductionEnvSha256",
]);

const PHASE_RUNTIME_KEYS = Object.freeze([
  "baseEnvPath", "baseEnvSha256", "candidateWorkerContainerId",
  "candidateWorkerImageId", "codeReleaseEvidencePath", "codeReleaseEvidenceSha256",
  "composeSha256", "currentApprovalDigest",
  "currentAuthorityEpoch", "currentManifestSha256", "currentWebImageId",
  "dualReadEvidencePath", "dualReadEvidenceSha256", "identityOverridePath",
  "identityOverrideSha256", "identityWrapperPath", "identityWrapperSha256",
  "lineageEvidencePath", "lineageEvidenceSha256", "migrationId", "productionCommit",
  "productionCommitTree", "productionEnvPath", "productionEnvSha256", "productionTree",
  "reconciliationEvidencePath", "reconciliationEvidenceSha256", "releaseId",
  "targetProductionEnvSha256",
]);

function transportManifest() {
  return {
    schemaVersion: "wp-g0.2-current-cycle-canonical-compat-handoff-transport.v1",
    packageId: PACKAGE_ID,
    approvalEligible: true,
    sourceCommit: commit("a"),
    sourceTree: commit("b"),
    sourceParentCommit: commit("c"),
    sourceDiffSha256: hash("d"),
    sourcePathSetSha256: hash("e"),
    gateEvidenceSha256: hash("f"),
    policySha256: hash("1"),
    contractSha256: hash("2"),
    runnerArtifactSha256: hash("3"),
    transportArtifactSha256: hash("4"),
    transportBundleSha256: "bound_after_archive_creation",
    children: {
      codePresence: {
        archivePath: "packets/canonical-compat-code-presence.tar.gz",
        packageId: "WP-G0.2-CANONICAL-COMPAT-PRODUCTION-CODE-PRESENCE-CURRENT-CYCLE",
        sha256: hash("5"),
      },
      canonicalCompatPhase: {
        archivePath: "packets/canonical-compat-phase.tar.gz",
        packageId: "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION",
        sha256: hash("6"),
      },
    },
  };
}

function runtime(overrides = {}) {
  return {
    baseEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env",
    baseEnvSha256: hash("1"),
    buildRecordPath: `${evidenceRoot}/target-images-record.json`,
    buildRecordSha256: hash("2"),
    buildRecordWebImageId: image("3"),
    candidateWorkerContainerId: "4".repeat(64),
    candidateWorkerImageId: image("5"),
    composeSha256: hash("6"),
    currentApprovalDigest: `sha256:${hash("7")}`,
    currentAuthorityEpoch: 4,
    currentManifestSha256: hash("8"),
    currentWebContainerId: "9".repeat(64),
    currentWebImageId: image("3"),
    dualReadEvidencePath: `${evidenceRoot}/dual-read-final.json`,
    dualReadEvidenceSha256: hash("a"),
    healthLevel: "ready",
    identityOverridePath: "/etc/market-radar/compose-identity.env",
    identityOverrideSha256: hash("b"),
    identityWrapperPath: "/usr/local/sbin/market-radar-compose",
    identityWrapperSha256: hash("c"),
    lineageEvidencePath: `${evidenceRoot}/lineage-final.json`,
    lineageEvidenceSha256: hash("d"),
    migrationId: "candidate-episode-v1-cycle-7",
    postgresAdminEnvPath:
      "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    productionCommit: REQUIRED_PRODUCTION_COMMIT,
    productionEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env.production",
    productionEnvSha256: hash("e"),
    productionTree: PRODUCTION_TREE,
    reconciliationEvidencePath: `${evidenceRoot}/reconciliation-result.json`,
    reconciliationEvidenceSha256: hash("f"),
    releaseId,
    scanFreshness: "fresh",
    targetProductionEnvSha256: hash("0"),
    ...overrides,
  };
}

function sourceReleaseWindows() {
  return Array.from({ length: 7 }, (_, index) => {
    const startedAt = new Date(Date.UTC(2026, 6, 6 + index * 3)).toISOString();
    const deadlineAt = new Date(Date.parse(startedAt) + 72 * 60 * 60_000).toISOString();
    const current = index === 6;
    return {
      controlEpoch: current ? 3 : 2,
      deadlineAt,
      migrationId: index === 0 ? "candidate-episode-v1" : `candidate-episode-v1-cycle-${index + 1}`,
      phase: current ? "shadow_capture" : "legacy",
      releaseId: current ? releaseId : `candidate-shadow-release-cycle-${index + 1}`,
      startedAt,
      writeFrozen: !current,
    };
  });
}

function lineageEvidence(overrides = {}) {
  const windows = sourceReleaseWindows();
  return {
    activationCoverageSeconds: 86_400,
    activationSamples: 289,
    canonicalAuthorityChanged: false,
    completedWrites: 10_020,
    completionAdvances: 8,
    controlSnapshotSha256: hash("1"),
    currentAuthorityEpoch: 3,
    currentMigrationId: "candidate-episode-v1-cycle-7",
    currentReleaseId: releaseId,
    currentCycleStartedAt: windows[6].startedAt,
    g0Completed: false,
    maximumSampleGapSeconds: 600,
    minimumActivationHours: 24,
    minimumActivationSamples: 289,
    minimumComparedWrites: 10_000,
    minimumCompletionAdvances: 2,
    minimumSamples: 7,
    minimumStabilitySeconds: 1_800,
    observationElapsedSeconds: 86_400,
    productionReconciliationExecuted: false,
    schemaVersion: LINEAGE_SCHEMA,
    shadowVerifyStarted: false,
    sourceReleaseCount: 7,
    sourceReleaseWindows: windows,
    status: LINEAGE_PASS,
    thresholdsChanged: false,
    unifiedEvidenceSha256: hash("2"),
    unifiedSamplesSha256: hash("3"),
    unresolvedMaximum: 0,
    unresolvedOutbox: 0,
    validationCycle: 7,
    ...overrides,
  };
}

function reconciliationEvidence(lineage = lineageEvidence(), overrides = {}) {
  return {
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
    lineageEvidenceSha256: `sha256:${runtime().lineageEvidenceSha256}`,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: lineage.controlSnapshotSha256,
      unifiedFinal: lineage.unifiedEvidenceSha256,
      unifiedSamples: lineage.unifiedSamplesSha256,
    },
    comparedWrites: 10_020,
    comparisonDifferences: 0,
    duplicateOutboxMappings: 0,
    duplicateEventMappings: 0,
    resolvedQuarantineExclusions: 0,
    sourceReleaseCount: 7,
    verificationMigrationId: "candidate-episode-v1-cycle-7",
    evidenceHash: `sha256:${hash("4")}`,
    violations: [],
    differenceSample: [],
    ...overrides,
  };
}

function dualReadEvidence(overrides = {}) {
  return {
    schemaVersion: "candidate-shadow-verify-observation-evidence.v1",
    status: "PASS_DUAL_READ_OBSERVATION",
    packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
    migrationId: "candidate-episode-v1-cycle-7",
    releaseId,
    authorityEpoch: 4,
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
    evidenceHash: `sha256:${hash("5")}`,
    ...overrides,
  };
}

function codePresenceEvidence(overrides = {}) {
  const current = runtime();
  return buildCodePresenceEvidence({
    productionCommit: current.productionCommit,
    productionTree: current.productionTree,
    productionBlobs: Object.fromEntries(
      REFERENCE_CODE_PATHS.map(({ path, blob }) => [path, blob])),
    runningWebImageId: current.currentWebImageId,
    buildRecordWebImageId: current.buildRecordWebImageId,
    runningWebContainerId: current.currentWebContainerId,
    buildRecordSha256: current.buildRecordSha256,
    productionGitClean: true,
    productionGitDetached: true,
    manifestSha256: current.currentManifestSha256,
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
    verifiedAt: "2026-07-19T00:05:00.000Z",
    ...overrides,
  });
}

function createOuterRequest(runtimeValue = runtime()) {
  return createExecutionRequest({
    bundleSha256: hash("7"),
    manifest: transportManifest(),
    nonce,
    now: issuedAt,
    runtime: runtimeValue,
    stagingDirectory:
      "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-handoff-aaaaaaaaaaaa-12345678",
  });
}

test("outer runtime has an exact key contract and current production identity", () => {
  const value = runtime();
  assert.deepEqual(Object.keys(value).sort(), [...RUNTIME_KEYS].sort());
  assert.equal(validateRuntime(value), value);
  assert.equal(value.productionCommit, "47741f3222247562843932b01607a1ec3abb534e");
  assert.equal(value.productionTree, PRODUCTION_TREE);
  assert.throws(() => validateRuntime({ ...value, untrustedExtra: true }),
    /runtime_keys_invalid/u);
  const missing = { ...value };
  delete missing.currentManifestSha256;
  assert.throws(() => validateRuntime(missing), /runtime_keys_invalid/u);
  assert.throws(() => validateRuntime({ ...value, productionCommit: commit("f") }),
    /runtime_production_identity_invalid/u);
  assert.throws(() => validateRuntime({ ...value, currentAuthorityEpoch: 3 }),
    /runtime_shadow_verify_identity_invalid/u);
});

test("request binds one upload to strict Code Presence then Canonical Compat order", async () => {
  const request = createOuterRequest();
  assert.deepEqual(request.sequence, SEQUENCE);
  assert.deepEqual(request.sequence, ["canonical_code_presence", "canonical_compat_phase"]);
  assert.deepEqual(request.services, ["web"]);
  assert.deepEqual(Object.keys(request.childPackets), ["codePresence", "canonicalCompatPhase"]);
  assert.equal(request.authorization.actionClass, "canonical_compat_activation");
  assert.equal(request.authorization.riskTier, "R2_AUTHORITY_TRANSITION");
  assert.equal(request.authorization.maxExecutions, 1);
  assert.equal(request.authorization.packageAssertions.childAuthorizationsIndependent, true);
  assert.equal(request.authorization.packageAssertions.phaseRequestAfterCodePresencePassOnly, true);
  assert.equal(request.expiresAt, "2026-07-18T21:29:00.000Z");
  assert.equal((await validateExecutionRequest(request, transportManifest(), hash("7"), {
    now: new Date("2026-07-18T20:30:00.000Z"),
    verifyEvidence: false,
  })).status, "PASS_CANONICAL_COMPAT_HANDOFF_EXECUTION_REQUEST");
  const reversed = { ...request, sequence: [...request.sequence].reverse() };
  await assert.rejects(validateExecutionRequest(reversed, transportManifest(), hash("7"), {
    now: new Date("2026-07-18T20:30:00.000Z"), verifyEvidence: false,
  }), /request_boundary_invalid/u);
});

test("accepts only seven-cycle Lineage v3 and Reconciliation v3 truth", () => {
  const lineage = lineageEvidence();
  const reconciliation = reconciliationEvidence(lineage);
  assert.equal(validateCandidateLineageEvidence(lineage).sourceReleaseCount, 7);
  assert.equal(validateCandidateLineageEvidence(lineage).sourceReleaseWindows.length, 7);
  assert.equal(validateReconciliationEvidence(reconciliation).sourceReleaseCount, 7);
  assert.equal(reconciliation.lineageSemanticEvidenceSha256.controlSnapshot,
    lineage.controlSnapshotSha256);
  assert.equal(reconciliation.lineageSemanticEvidenceSha256.unifiedFinal,
    lineage.unifiedEvidenceSha256);
  assert.equal(reconciliation.lineageSemanticEvidenceSha256.unifiedSamples,
    lineage.unifiedSamplesSha256);
  assert.throws(() => validateCandidateLineageEvidence({
    ...lineage,
    sourceReleaseCount: 4,
  }), /lineage_cycle_count_identity_mismatch/u);
  assert.throws(() => validateReconciliationEvidence({
    ...reconciliation,
    sourceReleaseCount: 4,
  }), /reconciliation_cycle_count_mismatch/u);
  assert.throws(() => validateReconciliationEvidence({
    ...reconciliation,
    comparisonDifferences: 1,
  }), /reconciliation_result_invalid/u);
});

test("requires exactly 289 Dual Read samples, 24 hours, all pages, and zero differences", () => {
  const evidence = dualReadEvidence();
  assert.equal(validateDualReadEvidence(evidence, {
    migrationId: runtime().migrationId,
    releaseId: runtime().releaseId,
    authorityEpoch: runtime().currentAuthorityEpoch,
  }), evidence);
  for (const changed of [
    { sampleCount: 288 },
    { coverageHours: 23.99 },
    { maximumGapSeconds: 601 },
    { allPagesComparedEverySample: false },
    { differenceCount: 1 },
    { legacyResponseAuthority: false },
    { canonicalCompatStarted: true },
  ]) assert.throws(() => validateDualReadEvidence({ ...evidence, ...changed }, {
    migrationId: runtime().migrationId,
    releaseId: runtime().releaseId,
    authorityEpoch: runtime().currentAuthorityEpoch,
  }), /dual_read_observation_result_invalid/u);
});

test("R0 receives only the exact current code-presence runtime", () => {
  const projected = projectCodePresenceRuntime({ ...runtime(), untrustedExtra: "drop" });
  assert.deepEqual(Object.keys(projected).sort(), [
    "authorityEpoch", "buildRecordSha256", "buildRecordWebImageId",
    "currentWebContainerId", "currentWebImageId", "healthLevel", "manifestSha256",
    "migrationId", "releaseId", "scanFreshness",
  ].sort());
  assert.equal(projected.currentWebImageId, runtime().currentWebImageId);
  assert.equal(projected.authorityEpoch, 4);
  assert.equal(Object.hasOwn(projected, "untrustedExtra"), false);
  assert.equal(Object.hasOwn(projected, "targetProductionEnvSha256"), false);
});

test("code-presence PASS is bound to commit, tree, image, container, build, and manifest", () => {
  const current = runtime();
  const evidence = codePresenceEvidence();
  assert.equal(validateCodePresenceSummary(evidence, current).status, CODE_PRESENCE_PASS);
  assert.equal(evidence.productionCommit, REQUIRED_PRODUCTION_COMMIT);
  assert.equal(evidence.productionTree, PRODUCTION_TREE);
  assert.equal(evidence.codePaths.length, 8);
  assert.deepEqual(evidence.servicesMutated, []);
  for (const changed of [
    { targetWebImageId: image("a") },
    { runningWebContainerId: "b".repeat(64) },
    { buildRecordSha256: hash("c") },
    { manifestSha256: hash("d") },
  ]) assert.throws(() => validateCodePresenceSummary({ ...evidence, ...changed }, current),
    /code_presence_runtime_identity_mismatch/u);
});

test("R2 runtime and request are derived only after current code-presence PASS", () => {
  const current = runtime();
  const evidence = codePresenceEvidence();
  const codePresenceEvidencePath = `${evidenceRoot}/code-presence-evidence.json`;
  const codePresenceEvidenceSha256 = hash("9");
  const derived = buildPhaseRuntimeFromCodePresence({
    runtime: current,
    codePresence: evidence,
    codePresenceEvidencePath,
    codePresenceEvidenceSha256,
  });
  assert.deepEqual(Object.keys(derived).sort(), [...PHASE_RUNTIME_KEYS].sort());
  assert.equal(derived.productionCommit, REQUIRED_PRODUCTION_COMMIT);
  assert.equal(derived.productionTree, PRODUCTION_TREE);
  assert.equal(derived.productionCommitTree, PRODUCTION_TREE);
  assert.equal(derived.currentWebImageId, evidence.targetWebImageId);
  assert.equal(derived.currentManifestSha256, evidence.manifestSha256);
  assert.equal(derived.codeReleaseEvidencePath, codePresenceEvidencePath);
  assert.equal(derived.codeReleaseEvidenceSha256, codePresenceEvidenceSha256);

  const phaseRequest = createPhaseExecutionRequest({
    bundleSha256: hash("6"),
    manifest: {
      sourceCommit: commit("a"),
      sourceTree: commit("b"),
      sourceParentCommit: commit("c"),
      sourceDiffSha256: hash("d"),
      sourcePathSetSha256: hash("e"),
      gateEvidenceSha256: hash("f"),
      contractSha256: hash("1"),
      runnerArtifactSha256: hash("2"),
      transportArtifactSha256: hash("3"),
      policySha256: hash("4"),
    },
    nonce,
    now: issuedAt,
    runtime: {
      ...derived,
      lineageEvidence: lineageEvidence(),
      reconciliationEvidence: reconciliationEvidence(),
      dualReadEvidence: dualReadEvidence(),
    },
  });
  assert.equal(phaseRequest.productionCommit, REQUIRED_PRODUCTION_COMMIT);
  assert.equal(phaseRequest.currentAuthorityEpoch, 4);
  assert.equal(phaseRequest.targetAuthorityEpoch, 5);
  assert.equal(phaseRequest.codeReleaseEvidencePath,
    `${evidenceRoot}/code-presence-evidence.json`);
  assert.equal(phaseRequest.codeReleaseEvidenceSha256, hash("9"));
  assert.deepEqual(phaseRequest.services, ["web", "candidate-shadow-worker"]);
  assert.equal(phaseRequest.autonomyAuthorization.packageId,
    "WP-G0.2-CANONICAL-COMPAT-PHASE-TRANSITION-AND-OBSERVATION");
  assert.throws(() => buildPhaseRuntimeFromCodePresence({
    runtime: current,
    codePresence: { ...evidence, manifestSha256: hash("a") },
    codePresenceEvidencePath,
    codePresenceEvidenceSha256,
  }), /code_presence_runtime_identity_mismatch/u);
  assert.throws(() => buildPhaseRuntimeFromCodePresence({
    runtime: current,
    codePresence: evidence,
    codePresenceEvidencePath: "/tmp/code-presence.json",
    codePresenceEvidenceSha256,
  }), /code_presence_evidence_identity_invalid/u);
  assert.throws(() => buildPhaseRuntimeFromCodePresence({
    runtime: current,
    codePresence: evidence,
    codePresenceEvidencePath,
    codePresenceEvidenceSha256: "not-a-hash",
  }), /code_presence_evidence_identity_invalid/u);
});

test("outer request evidence identities are authorization-bound", async () => {
  const request = createOuterRequest();
  const changed = {
    ...request,
    runtime: { ...request.runtime, dualReadEvidenceSha256: hash("b") },
  };
  await assert.rejects(validateExecutionRequest(changed, transportManifest(), hash("7"), {
    now: new Date("2026-07-18T20:30:00.000Z"), verifyEvidence: false,
  }), /authorization_binding_invalid/u);
});

test("handoff final can claim observer active but never completion, cutover, WP-G0.2, or G0", () => {
  const value = {
    schemaVersion: "wp-g0.2-current-cycle-canonical-compat-handoff-evidence.v1",
    status: PIPELINE_PASS,
    packageId: PACKAGE_ID,
    sequence: ["canonical_code_presence", "canonical_compat_phase"],
    codePresenceStatus: CODE_PRESENCE_PASS,
    phaseImmediateStatus: "PASS_IMMEDIATE_CANONICAL_COMPAT_OBSERVATION_ACTIVE",
    observerActive: true,
    canonicalCompatObservationCompleted: false,
    canonicalCutoverExecuted: false,
    wpG02Completed: false,
    g0Completed: false,
    servicesMutated: ["web"],
    databasePhaseTransition: "shadow_verify_to_canonical_compat",
    secretsPrinted: false,
    codePresenceEvidence: {
      path: `${evidenceRoot}/code-presence-evidence.json`,
      sha256: hash("6"),
    },
    phaseEvidence: {
      path: `${evidenceRoot}/phase-immediate-summary.json`,
      sha256: hash("7"),
    },
    phaseObserverUnit: "market-radar-canonical-compat-observer-aaaaaaa-12345678.service",
    phaseStagingDirectory:
      "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-phase-aaaaaaaaaaaa-12345678",
  };
  assert.equal(validatePipelineFinal(value).status, PIPELINE_PASS);
  for (const forbiddenClaim of [
    "canonicalCompatObservationCompleted", "canonicalCutoverExecuted", "wpG02Completed",
    "g0Completed",
  ]) assert.throws(() => validatePipelineFinal({ ...value, [forbiddenClaim]: true }),
    /pipeline_final_boundary_invalid/u);
  assert.throws(() => validatePipelineFinal({ ...value, observerActive: false }),
    /pipeline_final_boundary_invalid/u);
});
