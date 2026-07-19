import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  PACKAGE_ID,
  PIPELINE_PASS,
  buildPhaseRuntimeFromReadOnlySummary,
  createExecutionRequest,
  validateExecutionRequest,
  validatePipelineFinal,
} from "./runner.mjs";
import { projectReadOnlyRuntime } from "./request-generator.mjs";
import {
  BUILD_RECORD_PATH,
  CODE_PRESENCE_PASS,
  LINEAGE_PASS,
  PACKAGE_ID as READ_ONLY_PACKAGE_ID,
  PRODUCTION_COMMIT,
  PRODUCTION_MIGRATION,
  PRODUCTION_RELEASE,
  PRODUCTION_TREE,
  RECONCILIATION_PASS,
  SUMMARY_PASS,
  SUMMARY_SCHEMA,
  sha256,
  validateRuntime as validateReadOnlyRuntime,
} from "../candidate-readonly-superwindow/runner.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const image = (character) => `sha256:${hash(character)}`;

function manifest() {
  return {
    schemaVersion: "wp-g0.2-current-cycle-to-shadow-verify-handoff-transport.v2",
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
      readOnlySuperwindow: {
        archivePath: "packets/current-cycle-readonly-superwindow.tar.gz",
        packageId: READ_ONLY_PACKAGE_ID,
        sha256: hash("5"),
      },
      shadowVerifyPhase: {
        archivePath: "packets/shadow-verify-phase.tar.gz",
        packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
        sha256: hash("6"),
      },
    },
  };
}

function currentCycleFinal(overrides = {}) {
  return {
    schemaVersion: "candidate-validation-cycle-observation.v2",
    status: "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE",
    commit: PRODUCTION_COMMIT,
    migrationId: PRODUCTION_MIGRATION,
    releaseId: PRODUCTION_RELEASE,
    authorityEpoch: 3,
    samples: 289,
    activationSamples: 289,
    elapsedSeconds: 86400,
    activationCoverageSeconds: 86400,
    completedWrites: 10000,
    completionAdvances: 13,
    accumulationReady: true,
    freshActivationReady: true,
    unresolvedOutbox: 0,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
    ...overrides,
  };
}

function runtime(final = currentCycleFinal()) {
  const evidenceRoot = "/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-72ee289388ee-2b13c6e6/observation";
  return {
    currentCycleFinal: final,
    productionCommit: final.commit,
    productionTree: PRODUCTION_TREE,
    currentWebContainerId: "8".repeat(12),
    currentWebImageId: image("9"),
    buildRecordPath: BUILD_RECORD_PATH,
    buildRecordSha256: hash("a"),
    buildRecordWebImageId: image("9"),
    composeSha256: hash("b"),
    productionEnvSha256: hash("c"),
    postgresAdminEnvPath: "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
    healthLevel: "ready",
    scanFreshness: "fresh",
    captureSpecification: {
      schemaVersion: "candidate-lineage-capture-specification.v3",
      packageId: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
      productionMutationAllowed: false,
      outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
      unified: {
        authorityEpoch: final.authorityEpoch,
        closeoutPath: `${evidenceRoot}/cycle-observation-closeout.json`,
        closeoutSha256: hash("d"),
        commit: final.commit,
        finalPath: `${evidenceRoot}/cycle-observation-final.json`,
        finalSha256: hash("e"),
        migrationId: final.migrationId,
        releaseId: final.releaseId,
        samplesPath: `${evidenceRoot}/cycle-observation-samples.jsonl`,
        samplesSha256: hash("f"),
      },
    },
    phase: {
      candidateWorkerContainerId: "1".repeat(12),
      candidateWorkerImageId: image("2"),
      baseEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env",
      baseEnvSha256: hash("3"),
      productionEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env.production",
      targetProductionEnvSha256: hash("4"),
      identityWrapperPath: "/usr/local/sbin/market-radar-compose",
      identityWrapperSha256: hash("5"),
      identityOverridePath: "/etc/market-radar/compose-identity.env",
      identityOverrideSha256: hash("6"),
    },
  };
}

async function createReadOnlySummaryFixture() {
  const directory = await mkdtemp(join(tmpdir(), "handoff-readonly-summary-"));
  const packetCommit = commit("e");
  const packetTree = commit("f");
  const webImage = image("9");
  const grantId = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
  const packages = {
    code: "WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION",
    lineage: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
    reconciliation: "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET",
  };
  const writeJson = async (name, value) => {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(join(directory, name), bytes, { mode: 0o600 });
    return sha256(bytes);
  };
  const manifestRecord = (schemaVersion, packageId) => ({
    schemaVersion, packageId, sourceCommit: packetCommit, sourceTree: packetTree,
  });
  const authorization = (packageId, approvalId, schemaVersion =
    "market-radar-package-authorization.v1") => ({
    schemaVersion,
    mode: "g0_g8_standing_user_grant",
    grantId,
    approvalId,
    packageId,
    scope: packageId,
    actionClass: "read_only_production_preflight",
    riskTier: "R0_READ_ONLY",
    maxExecutions: 1,
  });
  const codeManifestSha = await writeJson(
    "code-presence-transport-manifest.json",
    manifestRecord("wp-g0.2-shadow-verify-code-presence-transport.v2", packages.code),
  );
  const codeRequestSha = await writeJson("code-presence-request.json", {
    packageId: packages.code,
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    currentWebImageId: webImage,
    buildRecordPath: BUILD_RECORD_PATH,
    transportBundleSha256: hash("b"),
    authorization: authorization(packages.code, "approval-code",
      "wp-g0.2-shadow-verify-code-presence-authorization.v2"),
  });
  const codeEvidenceSha = await writeJson("code-presence-evidence.json", {
    schemaVersion: "candidate-shadow-verify-code-presence-evidence.v1",
    status: CODE_PRESENCE_PASS,
    packageId: packages.code,
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    targetCommit: PRODUCTION_COMMIT,
    targetWebImageId: webImage,
    runningWebMatchesBuildRecord: true,
    servicesMutated: [],
  });
  const lineageManifestSha = await writeJson(
    "lineage-transport-manifest.json",
    manifestRecord("wp-g0.2-lineage-capture-transport.v2", packages.lineage),
  );
  const lineageRequestSha = await writeJson("lineage-request.json", {
    packageId: packages.lineage,
    approvedProductionCommit: PRODUCTION_COMMIT,
    webImageId: webImage,
    transportBundleSha256: hash("c"),
    captureSpecification: { unified: {
      commit: PRODUCTION_COMMIT,
      migrationId: PRODUCTION_MIGRATION,
      releaseId: PRODUCTION_RELEASE,
    } },
    autonomyAuthorization: authorization(packages.lineage, "approval-lineage"),
  });
  const lineageEvidenceSha = await writeJson("lineage-evidence.json", {
    schemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
    status: LINEAGE_PASS,
    currentMigrationId: PRODUCTION_MIGRATION,
    currentReleaseId: PRODUCTION_RELEASE,
    sourceReleaseCount: 6,
    validationCycle: 6,
    sourceReleaseWindows: Array.from({ length: 6 }, (_, index) => ({ index })),
    completedWrites: 10_000,
    unresolvedOutbox: 0,
    g0Completed: false,
  });
  const reconciliationManifestSha = await writeJson(
    "reconciliation-transport-manifest.json",
    manifestRecord(
      "wp-g0.2-current-cycle-reconciliation-transport.v3", packages.reconciliation,
    ),
  );
  const sourceReleaseWindows = Array.from({ length: 6 }, (_, index) => ({
    migrationId: index === 5 ? PRODUCTION_MIGRATION : `candidate-episode-v1-cycle-${index + 1}`,
    releaseId: index === 5 ? PRODUCTION_RELEASE : `candidate-shadow-cycle-${index + 1}`,
  }));
  const reconciliationRequestSha = await writeJson("reconciliation-request.json", {
    packageId: packages.reconciliation,
    approvedProductionCommit: PRODUCTION_COMMIT,
    webImageId: webImage,
    transportBundleSha256: hash("d"),
    sourceReleaseWindows,
    lineageEvidenceSha256: lineageEvidenceSha,
    autonomyAuthorization: authorization(packages.reconciliation, "approval-reconciliation"),
  });
  const reconciliationEvidenceSha = await writeJson("reconciliation-evidence.json", {
    schemaVersion: "candidate-multi-cycle-reconciliation-evidence.v3",
    status: RECONCILIATION_PASS,
    verificationMigrationId: PRODUCTION_MIGRATION,
    sourceReleaseCount: 6,
    comparedWrites: 10_000,
    comparisonDifferences: 0,
    g0Completed: false,
    productionRankingInputsUsed: false,
    futureOutcomeInputsUsed: false,
  });
  const writeLease = async (prefix, packageId, approvalId, leaseId) => {
    const executionSha256 = await writeJson(`${prefix}-lease-execution.json`, {
      schemaVersion: "market-radar-production-lease-execution.v1",
      grantId,
      approvalId,
      packageId,
      leaseId,
      status: "released",
      outcome: "PASS",
    });
    const events = [
      { leaseId, status: "active_unconsumed" },
      { leaseId, status: "pass" },
      { leaseId, status: "consumed" },
      { leaseId, status: "released", outcome: "PASS" },
    ];
    const bytes = Buffer.from(`${events.map(JSON.stringify).join("\n")}\n`);
    await writeFile(join(directory, `${prefix}-lease-events.jsonl`), bytes, { mode: 0o600 });
    return { executionSha256, eventsSha256: sha256(bytes) };
  };
  const lineageLease = await writeLease(
    "lineage", packages.lineage, "approval-lineage", "lease-lineage",
  );
  const reconciliationLease = await writeLease(
    "reconciliation", packages.reconciliation, "approval-reconciliation",
  );
  const child = ({ approvalId, authorizationSchemaVersion, evidenceFile, evidenceSha256,
    lease = null, lineageSha256 = null, manifestFile, manifestSha256, packageId,
    requestFile, requestSha256, sourceEvidencePath, status, step, transportBundleSha256 }) => ({
    step,
    status,
    packageId,
    sourceEvidencePath,
    transportBundleSha256,
    manifestFile,
    manifestSha256,
    requestFile,
    requestSha256,
    evidenceFile,
    evidenceSha256,
    authorizationMode: "g0_g8_standing_user_grant",
    authorizationSchemaVersion,
    authorizationGrantId: grantId,
    authorizationApprovalId: approvalId,
    leaseRequired: lease !== null,
    leaseExecutionFile: lease
      ? `${step === "current_cycle_lineage" ? "lineage" : "reconciliation"}-lease-execution.json`
      : null,
    leaseExecutionSha256: lease?.executionSha256 ?? null,
    leaseEventsFile: lease
      ? `${step === "current_cycle_lineage" ? "lineage" : "reconciliation"}-lease-events.jsonl`
      : null,
    leaseEventsSha256: lease?.eventsSha256 ?? null,
    lineageEvidenceSha256: lineageSha256,
  });
  const summary = {
    schemaVersion: SUMMARY_SCHEMA,
    status: SUMMARY_PASS,
    packageId: READ_ONLY_PACKAGE_ID,
    packetCommit,
    packetTree,
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    productionWebImageId: webImage,
    migrationId: PRODUCTION_MIGRATION,
    releaseId: PRODUCTION_RELEASE,
    buildRecordSha256: hash("1"),
    transportBundleSha256: hash("0"),
    sequence: [
      "shadow_verify_code_presence", "current_cycle_lineage", "current_cycle_reconciliation",
    ],
    childEvidence: [
      child({
        approvalId: "approval-code",
        authorizationSchemaVersion: "wp-g0.2-shadow-verify-code-presence-authorization.v2",
        evidenceFile: "code-presence-evidence.json",
        evidenceSha256: codeEvidenceSha,
        manifestFile: "code-presence-transport-manifest.json",
        manifestSha256: codeManifestSha,
        packageId: packages.code,
        requestFile: "code-presence-request.json",
        requestSha256: codeRequestSha,
        sourceEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-shadow-verify-code-presence-a/code-presence-evidence.json",
        status: CODE_PRESENCE_PASS,
        step: "shadow_verify_code_presence",
        transportBundleSha256: hash("b"),
      }),
      child({
        approvalId: "approval-lineage",
        authorizationSchemaVersion: "market-radar-package-authorization.v1",
        evidenceFile: "lineage-evidence.json",
        evidenceSha256: lineageEvidenceSha,
        lease: lineageLease,
        manifestFile: "lineage-transport-manifest.json",
        manifestSha256: lineageManifestSha,
        packageId: packages.lineage,
        requestFile: "lineage-request.json",
        requestSha256: lineageRequestSha,
        sourceEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-candidate-lineage-a/lineage-final.json",
        status: LINEAGE_PASS,
        step: "current_cycle_lineage",
        transportBundleSha256: hash("c"),
      }),
      child({
        approvalId: "approval-reconciliation",
        authorizationSchemaVersion: "market-radar-package-authorization.v1",
        evidenceFile: "reconciliation-evidence.json",
        evidenceSha256: reconciliationEvidenceSha,
        lease: reconciliationLease,
        lineageSha256: lineageEvidenceSha,
        manifestFile: "reconciliation-transport-manifest.json",
        manifestSha256: reconciliationManifestSha,
        packageId: packages.reconciliation,
        requestFile: "reconciliation-request.json",
        requestSha256: reconciliationRequestSha,
        sourceEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-current-cycle-reconciliation-a/reconciliation-result.json",
        status: RECONCILIATION_PASS,
        step: "current_cycle_reconciliation",
        transportBundleSha256: hash("d"),
      }),
    ],
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:10:00.000Z",
    productionMutationAllowed: false,
    servicesMutated: [],
    databaseMutation: false,
    redisMutation: false,
    workerMutation: false,
    gitMutation: false,
    environmentMutation: false,
    composeMutation: false,
    phaseTransition: false,
    manifestMutation: false,
    featureFlagMutation: false,
    migrationMutation: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
  };
  return { directory, summary, webImage };
}

test("request locks one upload to R0 then R2 with independent child packets", async () => {
  const transport = manifest();
  const request = createExecutionRequest({
    bundleSha256: hash("0"),
    manifest: transport,
    nonce: "12345678-1234-4234-8234-123456789abc",
    now: new Date("2026-07-19T00:00:00.000Z"),
    runtime: runtime(),
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
  });
  assert.deepEqual(request.services, ["web"]);
  assert.deepEqual(request.sequence, ["current_cycle_readonly_superwindow", "shadow_verify_phase"]);
  assert.equal(request.authorization.actionClass, "shadow_verify_activation");
  assert.equal(request.authorization.riskTier, "R2_AUTHORITY_TRANSITION");
  assert.equal(request.authorization.maxExecutions, 1);
  assert.equal(request.expiresAt, "2026-07-19T01:29:00.000Z");
  assert.equal((await validateExecutionRequest(request, transport, hash("0"), {
    now: new Date("2026-07-19T00:30:00.000Z"),
    verifyEvidence: false,
  })).status, "PASS_SHADOW_VERIFY_HANDOFF_EXECUTION_REQUEST");
});

test("R0 receives only its exact read-only runtime contract", () => {
  const outer = { ...runtime(), untrustedExtra: "must-not-cross-child-boundary" };
  const projected = projectReadOnlyRuntime(outer);
  assert.equal(Object.hasOwn(projected, "currentCycleFinal"), false);
  assert.equal(Object.hasOwn(projected, "phase"), false);
  assert.equal(Object.hasOwn(projected, "untrustedExtra"), false);
  assert.equal(validateReadOnlyRuntime(projected), projected);
});

test("outer runtime rejects fields outside the explicit transport contract", () => {
  assert.throws(() => createExecutionRequest({
    bundleSha256: hash("0"),
    manifest: manifest(),
    runtime: { ...runtime(), untrustedExtra: "rejected" },
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
  }), /runtime_keys_invalid/u);
  assert.throws(() => createExecutionRequest({
    bundleSha256: hash("0"),
    manifest: manifest(),
    runtime: { ...runtime(), phase: { ...runtime().phase, untrustedExtra: "rejected" } },
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
  }), /phase_runtime_identity_invalid/u);
  assert.throws(() => createExecutionRequest({
    bundleSha256: hash("0"),
    manifest: manifest(),
    runtime: { ...runtime(), buildRecordPath: "/home/ubuntu/.cache/market-radar-ops/evidence/old.json" },
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
  }), /runtime_identity_invalid/u);
});

test("current-cycle thresholds cannot be shortened or relabeled", () => {
  for (const final of [
    currentCycleFinal({ samples: 288 }),
    currentCycleFinal({ activationSamples: 288 }),
    currentCycleFinal({ elapsedSeconds: 86399 }),
    currentCycleFinal({ activationCoverageSeconds: 86399 }),
    currentCycleFinal({ completedWrites: 9999 }),
    currentCycleFinal({ unresolvedOutbox: 1 }),
    currentCycleFinal({ thresholdsChanged: true }),
    currentCycleFinal({ migrationId: "candidate-episode-v1-cycle-5" }),
  ]) {
    assert.throws(() => createExecutionRequest({
      bundleSha256: hash("0"),
      manifest: manifest(),
      runtime: runtime(final),
      stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
    }), /current_cycle_final_not_pass/u);
  }
});

test("R2 runtime can only be derived from all three byte-verified R0 PASS artifacts", async () => {
  const fixture = await createReadOnlySummaryFixture();
  try {
    const derived = await buildPhaseRuntimeFromReadOnlySummary({
      evidenceRoot: fixture.directory,
      productionPaths: false,
      runtime: runtime(),
      summary: fixture.summary,
    });
    assert.equal(derived.codeReleaseEvidenceSha256,
      fixture.summary.childEvidence[0].evidenceSha256);
    assert.equal(derived.lineageEvidenceSha256,
      fixture.summary.childEvidence[1].evidenceSha256);
    assert.equal(derived.reconciliationEvidenceSha256,
      fixture.summary.childEvidence[2].evidenceSha256);
    assert.equal(derived.codeReleaseEvidencePath,
      join(fixture.directory, "code-presence-evidence.json"));
    await writeFile(join(fixture.directory, "lineage-evidence.json"), "{}\n", { mode: 0o600 });
    await assert.rejects(buildPhaseRuntimeFromReadOnlySummary({
      evidenceRoot: fixture.directory,
      productionPaths: false,
      runtime: runtime(),
      summary: fixture.summary,
    }), /summary_current_cycle_lineage_evidence_checksum_mismatch/u);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("handoff final byte-binds R0 and phase evidence without claiming G0", async () => {
  const fixture = await createReadOnlySummaryFixture();
  try {
    const readOnlyPath = join(fixture.directory, "superwindow-final.json");
    const readOnlyBytes = Buffer.from(`${JSON.stringify(fixture.summary, null, 2)}\n`);
    await writeFile(readOnlyPath, readOnlyBytes, { mode: 0o600 });
    const phase = {
      schemaVersion: "candidate-shadow-verify-phase-immediate.v2",
      packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
      status: "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE",
      productionCommit: PRODUCTION_COMMIT,
      productionTree: PRODUCTION_TREE,
      webImageId: fixture.webImage,
      migrationId: PRODUCTION_MIGRATION,
      releaseId: PRODUCTION_RELEASE,
      targetAuthorityEpoch: 4,
      observerUnit: "market-radar-shadow-verify-observer-abcdef0-12345678.service",
      candidateResponseAuthority: "legacy",
      automaticPhaseAdvance: false,
      secretsPrinted: false,
    };
    const phasePath = join(fixture.directory, "immediate-summary.json");
    const phaseBytes = Buffer.from(`${JSON.stringify(phase, null, 2)}\n`);
    await writeFile(phasePath, phaseBytes, { mode: 0o600 });
    const value = {
    schemaVersion: "wp-g0.2-current-cycle-to-shadow-verify-handoff-evidence.v2",
    status: PIPELINE_PASS,
    packageId: PACKAGE_ID,
    sequence: ["current_cycle_readonly_superwindow", "shadow_verify_phase"],
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    migrationId: PRODUCTION_MIGRATION,
    releaseId: PRODUCTION_RELEASE,
    webImageId: fixture.webImage,
    readOnlyStatus: SUMMARY_PASS,
    phaseImmediateStatus: "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE",
    observerActive: true,
    dualReadObservationCompleted: false,
    canonicalCompatStarted: false,
    canonicalCutoverExecuted: false,
    g0Completed: false,
    servicesMutated: ["web"],
    databasePhaseTransition: "shadow_capture_to_shadow_verify",
    secretsPrinted: false,
    readOnlyEvidence: { path: readOnlyPath, sha256: sha256(readOnlyBytes) },
    phaseEvidence: { path: phasePath, sha256: sha256(phaseBytes) },
    phaseObserverUnit: phase.observerUnit,
    phaseStagingDirectory:
      "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-phase-abcdefabcdef-12345678",
    };
    assert.equal((await validatePipelineFinal(value, { productionPaths: false })).status,
      PIPELINE_PASS);
    await assert.rejects(validatePipelineFinal({
      ...value, dualReadObservationCompleted: true,
    }, { productionPaths: false }), /pipeline_final_boundary_invalid/u);
    await writeFile(phasePath, "{}\n", { mode: 0o600 });
    await assert.rejects(validatePipelineFinal(value, { productionPaths: false }),
      /phase_evidence_checksum_mismatch/u);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
