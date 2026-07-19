import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BUILD_RECORD_PATH,
  CODE_PRESENCE_PASS,
  LINEAGE_PASS,
  OBSERVATION_PASS,
  PACKAGE_ID,
  POSTGRES_ADMIN_ENV,
  PRODUCTION_COMMIT,
  PRODUCTION_MIGRATION,
  PRODUCTION_RELEASE,
  PRODUCTION_TREE,
  RECONCILIATION_PASS,
  SUMMARY_SCHEMA,
  SUMMARY_PASS,
  createExecutionRequest,
  validateExecutionRequest,
  validateFinalSummary,
  validateObservationFinal,
  validateRuntime,
  sha256,
} from "./runner.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);

function runtime() {
  const directory =
    "/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-47741f322224-1959d0a2/observation";
  return {
    buildRecordPath: BUILD_RECORD_PATH,
    buildRecordSha256: hash("1"),
    buildRecordWebImageId: `sha256:${hash("2")}`,
    captureSpecification: {
      outputSchemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
      packageId: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
      productionMutationAllowed: false,
      schemaVersion: "candidate-lineage-capture-specification.v3",
      unified: {
        authorityEpoch: 1,
        closeoutPath: `${directory}/cycle-observation-closeout.json`,
        closeoutSha256: hash("3"),
        commit: PRODUCTION_COMMIT,
        finalPath: `${directory}/cycle-observation-final.json`,
        finalSha256: hash("5"),
        migrationId: PRODUCTION_MIGRATION,
        releaseId: PRODUCTION_RELEASE,
        samplesPath: `${directory}/cycle-observation-samples.jsonl`,
        samplesSha256: hash("6"),
      },
    },
    composeSha256: hash("7"),
    currentWebContainerId: "8".repeat(12),
    currentWebImageId: `sha256:${hash("2")}`,
    healthLevel: "ready",
    postgresAdminEnvPath: POSTGRES_ADMIN_ENV,
    productionCommit: PRODUCTION_COMMIT,
    productionEnvSha256: hash("9"),
    productionTree: PRODUCTION_TREE,
    scanFreshness: "fresh",
  };
}

function observationFinal() {
  return {
    schemaVersion: "candidate-validation-cycle-observation.v2",
    status: OBSERVATION_PASS,
    migrationId: PRODUCTION_MIGRATION,
    releaseId: PRODUCTION_RELEASE,
    commit: PRODUCTION_COMMIT,
    authorityEpoch: 1,
    samples: 289,
    elapsedSeconds: 86_400,
    completionAdvances: 8,
    completedWrites: 10_020,
    minimumComparedWrites: 10_000,
    accumulationReady: true,
    freshActivationReady: true,
    activationSamples: 289,
    minimumActivationSamples: 289,
    activationCoverageSeconds: 86_400,
    minimumActivationHours: 24,
    deadlineAt: "2026-07-21T16:28:52.072Z",
    deadlineRemainingSeconds: 30_000,
    unresolvedOutbox: 0,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
  };
}

const children = {
  codePresence: {
    archivePath: "packets/shadow-verify-code-presence.tar.gz",
    packageId: "WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION",
    sha256: hash("b"),
  },
  lineage: {
    archivePath: "packets/current-cycle-lineage.tar.gz",
    packageId: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
    sha256: hash("c"),
  },
  reconciliation: {
    archivePath: "packets/current-cycle-reconciliation.tar.gz",
    packageId: "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET",
    sha256: hash("d"),
  },
};

const manifest = {
  sourceCommit: commit("e"),
  sourceTree: commit("f"),
  runnerArtifactSha256: hash("a"),
  children,
};

test("runtime and current-cycle dual gate accept only the exact Cycle-7 production truth", () => {
  const validRuntime = runtime();
  assert.equal(validateRuntime(validRuntime), validRuntime);
  assert.equal(validateObservationFinal(observationFinal(), validRuntime).status, OBSERVATION_PASS);

  for (const [field, value] of [
    ["samples", 288],
    ["elapsedSeconds", 86_399],
    ["completedWrites", 9_999],
    ["unresolvedOutbox", 1],
    ["thresholdsChanged", true],
    ["productionReconciliationExecuted", true],
    ["shadowVerifyStarted", true],
  ]) {
    assert.throws(() => validateObservationFinal({
      ...observationFinal(),
      [field]: value,
    }, validRuntime), /observation_final_quality_gate_failed/u);
  }

  for (const stale of [
    { productionCommit: commit("4") },
    { productionTree: commit("a") },
    { buildRecordPath:
      "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-94b6d415573f-98459433/target-images-record.json" },
  ]) assert.throws(() => validateRuntime({ ...validRuntime, ...stale }));
  assert.throws(() => validateRuntime({
    ...validRuntime,
    captureSpecification: {
      ...validRuntime.captureSpecification,
      unified: {
        ...validRuntime.captureSpecification.unified,
        migrationId: "candidate-episode-v1-cycle-5",
      },
    },
  }), /capture_group_release_invalid/u);
});

test("superwindow request binds one upload, three children and a current 89-minute R0 grant", async () => {
  const now = new Date("2026-07-21T00:00:00.000Z");
  const request = createExecutionRequest({
    bundleSha256: hash("0"),
    manifest,
    runtime: runtime(),
    stagingDirectory:
      "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-current-cycle-read-only-superwindow-e00000000000-12345678",
    now,
    nonce: "12345678-1234-4234-8234-123456789012",
  });
  assert.deepEqual(request.services, []);
  assert.equal(request.productionMutationAllowed, false);
  assert.equal(request.authorization.riskTier, "R0_READ_ONLY");
  assert.equal(request.childPackets.reconciliation.sha256, children.reconciliation.sha256);
  assert.equal(await validateExecutionRequest(request, manifest, hash("0"), {
    now: new Date("2026-07-21T00:30:00.000Z"),
    verifyEvidence: false,
  }), request);

  const reordered = structuredClone(request);
  reordered.sequence.reverse();
  await assert.rejects(validateExecutionRequest(reordered, manifest, hash("0"), {
    now,
    verifyEvidence: false,
  }), /request_identity_invalid/u);
  const elevated = structuredClone(request);
  elevated.services.push("web");
  await assert.rejects(validateExecutionRequest(elevated, manifest, hash("0"), {
    now,
    verifyEvidence: false,
  }), /request_identity_invalid/u);
  const tampered = structuredClone(request);
  tampered.childPackets.lineage.sha256 = hash("f");
  await assert.rejects(validateExecutionRequest(tampered, manifest, hash("0"), {
    now,
    verifyEvidence: false,
  }), /child_packet_binding_invalid:lineage/u);
});

async function createFinalSummaryFixture() {
  const directory = await mkdtemp(join(tmpdir(), "readonly-superwindow-summary-"));
  const packetCommit = commit("e");
  const packetTree = commit("f");
  const webImage = `sha256:${hash("2")}`;
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
  const manifest = (schemaVersion, packageId) => ({
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
  const codeManifestSha = await writeJson("code-presence-transport-manifest.json", manifest(
    "wp-g0.2-shadow-verify-code-presence-transport.v2", packages.code,
  ));
  const codeRequest = {
    packageId: packages.code,
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    currentWebImageId: webImage,
    buildRecordPath: BUILD_RECORD_PATH,
    transportBundleSha256: hash("b"),
    authorization: authorization(packages.code, "approval-code",
      "wp-g0.2-shadow-verify-code-presence-authorization.v2"),
  };
  const codeRequestSha = await writeJson("code-presence-request.json", codeRequest);
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

  const lineageManifestSha = await writeJson("lineage-transport-manifest.json", manifest(
    "wp-g0.2-lineage-capture-transport.v2", packages.lineage,
  ));
  const lineageRequest = {
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
  };
  const lineageRequestSha = await writeJson("lineage-request.json", lineageRequest);
  const lineageEvidenceSha = await writeJson("lineage-evidence.json", {
    schemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
    status: LINEAGE_PASS,
    currentMigrationId: PRODUCTION_MIGRATION,
    currentReleaseId: PRODUCTION_RELEASE,
    sourceReleaseCount: 7,
    validationCycle: 7,
    sourceReleaseWindows: Array.from({ length: 7 }, (_, index) => ({ index })),
    completedWrites: 10_000,
    unresolvedOutbox: 0,
    g0Completed: false,
  });

  const reconciliationManifestSha = await writeJson(
    "reconciliation-transport-manifest.json",
    manifest("wp-g0.2-current-cycle-reconciliation-transport.v3", packages.reconciliation),
  );
  const sourceReleaseWindows = Array.from({ length: 7 }, (_, index) => ({
    migrationId: index === 6 ? PRODUCTION_MIGRATION : `candidate-episode-v1-cycle-${index + 1}`,
    releaseId: index === 6 ? PRODUCTION_RELEASE : `candidate-shadow-cycle-${index + 1}`,
  }));
  const reconciliationRequest = {
    packageId: packages.reconciliation,
    approvedProductionCommit: PRODUCTION_COMMIT,
    webImageId: webImage,
    transportBundleSha256: hash("d"),
    sourceReleaseWindows,
    lineageEvidenceSha256: lineageEvidenceSha,
    autonomyAuthorization: authorization(packages.reconciliation, "approval-reconciliation"),
  };
  const reconciliationRequestSha = await writeJson(
    "reconciliation-request.json", reconciliationRequest,
  );
  const reconciliationEvidenceSha = await writeJson("reconciliation-evidence.json", {
    schemaVersion: "candidate-multi-cycle-reconciliation-evidence.v3",
    status: RECONCILIATION_PASS,
    verificationMigrationId: PRODUCTION_MIGRATION,
    sourceReleaseCount: 7,
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
    "reconciliation", packages.reconciliation, "approval-reconciliation", "lease-reconciliation",
  );
  const child = ({ approvalId, authorizationSchemaVersion, evidenceFile, evidenceSha256,
    lease = null, manifestFile, manifestSha256, packageId, requestFile, requestSha256,
    sourceEvidencePath, status, step, transportBundleSha256, lineageSha256 = null }) => ({
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
    leaseExecutionFile: lease ? `${step === "current_cycle_lineage" ? "lineage" : "reconciliation"}-lease-execution.json` : null,
    leaseExecutionSha256: lease?.executionSha256 ?? null,
    leaseEventsFile: lease ? `${step === "current_cycle_lineage" ? "lineage" : "reconciliation"}-lease-events.jsonl` : null,
    leaseEventsSha256: lease?.eventsSha256 ?? null,
    lineageEvidenceSha256: lineageSha256,
  });
  const summary = {
    schemaVersion: SUMMARY_SCHEMA,
    status: SUMMARY_PASS,
    packageId: PACKAGE_ID,
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
  return { directory, summary };
}

test("final evidence binds real child bytes, independent authorizations and released leases", async () => {
  const { directory, summary } = await createFinalSummaryFixture();
  try {
    assert.equal(await validateFinalSummary(summary, directory), summary);
    await assert.rejects(validateFinalSummary({ ...summary, g0Completed: true }, directory),
      /summary_mutation_boundary_failed:g0Completed/u);
    const failedChild = structuredClone(summary);
    failedChild.childEvidence[1].status = "WAITING";
    await assert.rejects(validateFinalSummary(failedChild, directory),
      /summary_child_evidence_invalid:current_cycle_lineage/u);
    const duplicateAuthorization = structuredClone(summary);
    const lineageRequestPath = join(directory, "lineage-request.json");
    const lineageRequest = JSON.parse(await readFile(lineageRequestPath, "utf8"));
    lineageRequest.autonomyAuthorization.approvalId = "approval-code";
    const lineageRequestBytes = Buffer.from(`${JSON.stringify(lineageRequest, null, 2)}\n`);
    await writeFile(lineageRequestPath, lineageRequestBytes, { mode: 0o600 });
    duplicateAuthorization.childEvidence[1].requestSha256 = sha256(lineageRequestBytes);
    duplicateAuthorization.childEvidence[1].authorizationApprovalId = "approval-code";
    const leasePath = join(directory, "lineage-lease-execution.json");
    const leaseExecution = JSON.parse(await readFile(leasePath, "utf8"));
    leaseExecution.approvalId = "approval-code";
    const leaseBytes = Buffer.from(`${JSON.stringify(leaseExecution, null, 2)}\n`);
    await writeFile(leasePath, leaseBytes, { mode: 0o600 });
    duplicateAuthorization.childEvidence[1].leaseExecutionSha256 = sha256(leaseBytes);
    await assert.rejects(validateFinalSummary(duplicateAuthorization, directory),
      /summary_child_authorizations_not_independent/u);
    await writeFile(join(directory, "code-presence-evidence.json"), "{}\n", { mode: 0o600 });
    await assert.rejects(validateFinalSummary(summary, directory),
      /summary_shadow_verify_code_presence_evidence_checksum_mismatch/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
