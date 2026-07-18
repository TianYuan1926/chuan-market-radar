import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILD_RECORD_PATH,
  CODE_PRESENCE_PASS,
  LINEAGE_PASS,
  OBSERVATION_PASS,
  PACKAGE_ID,
  POSTGRES_ADMIN_ENV,
  RECONCILIATION_PASS,
  SUMMARY_PASS,
  createExecutionRequest,
  validateExecutionRequest,
  validateFinalSummary,
  validateObservationFinal,
  validateRuntime,
} from "./runner.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);

function runtime() {
  const directory =
    "/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-94b6d415573f-98459433/observation";
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
        commit: commit("4"),
        finalPath: `${directory}/cycle-observation-final.json`,
        finalSha256: hash("5"),
        migrationId: "candidate-episode-v1-cycle-5",
        releaseId: "candidate-shadow-cycle-5-94b6d415",
        samplesPath: `${directory}/cycle-observation-samples.jsonl`,
        samplesSha256: hash("6"),
      },
    },
    composeSha256: hash("7"),
    currentWebContainerId: "8".repeat(12),
    currentWebImageId: `sha256:${hash("2")}`,
    healthLevel: "ready",
    postgresAdminEnvPath: POSTGRES_ADMIN_ENV,
    productionCommit: commit("4"),
    productionEnvSha256: hash("9"),
    productionTree: commit("a"),
    scanFreshness: "fresh",
  };
}

function observationFinal() {
  return {
    schemaVersion: "candidate-validation-cycle-observation.v2",
    status: OBSERVATION_PASS,
    migrationId: "candidate-episode-v1-cycle-5",
    releaseId: "candidate-shadow-cycle-5-94b6d415",
    commit: commit("4"),
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

test("runtime and Cycle-5 dual gate accept only the full production truth", () => {
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
});

test("superwindow request binds one upload, three children and a current 89-minute R0 grant", async () => {
  const now = new Date("2026-07-21T00:00:00.000Z");
  const request = createExecutionRequest({
    bundleSha256: hash("0"),
    manifest,
    runtime: runtime(),
    stagingDirectory:
      "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-cycle-5-read-only-superwindow-e00000000000-12345678",
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

test("final evidence cannot promote G0 or hide a child failure", () => {
  const root = "/home/ubuntu/.cache/market-radar-ops/evidence";
  const summary = {
    schemaVersion: "wp-g0.2-cycle-5-read-only-verification-superwindow-evidence.v1",
    status: SUMMARY_PASS,
    packageId: PACKAGE_ID,
    productionCommit: commit("4"),
    transportBundleSha256: hash("0"),
    sequence: [
      "shadow_verify_code_presence", "current_cycle_lineage", "current_cycle_reconciliation",
    ],
    childEvidence: [
      {
        step: "shadow_verify_code_presence",
        status: CODE_PRESENCE_PASS,
        path: `${root}/wp-g0-2-shadow-verify-code-presence-a/code-presence-evidence.json`,
        sha256: hash("1"),
      },
      {
        step: "current_cycle_lineage",
        status: LINEAGE_PASS,
        path: `${root}/wp-g0-2-candidate-lineage-a/lineage-final.json`,
        sha256: hash("2"),
      },
      {
        step: "current_cycle_reconciliation",
        status: RECONCILIATION_PASS,
        path: `${root}/wp-g0-2-current-cycle-reconciliation-a/reconciliation-result.json`,
        sha256: hash("3"),
      },
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
  assert.equal(validateFinalSummary(summary), summary);
  assert.throws(() => validateFinalSummary({ ...summary, g0Completed: true }),
    /summary_mutation_boundary_failed:g0Completed/u);
  const failedChild = structuredClone(summary);
  failedChild.childEvidence[1].status = "WAITING";
  assert.throws(() => validateFinalSummary(failedChild),
    /summary_child_evidence_invalid:current_cycle_lineage/u);
});
