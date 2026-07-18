import assert from "node:assert/strict";
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
import { validateRuntime as validateReadOnlyRuntime } from
  "../candidate-readonly-superwindow/runner.mjs";

const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const image = (character) => `sha256:${hash(character)}`;

function manifest() {
  return {
    schemaVersion: "wp-g0.2-cycle-5-to-shadow-verify-handoff-transport.v1",
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
        archivePath: "packets/cycle5-readonly-superwindow.tar.gz",
        packageId: "WP-G0.2-CYCLE-5-READ-ONLY-VERIFICATION-SUPERWINDOW",
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

function cycle5Final(overrides = {}) {
  return {
    schemaVersion: "candidate-validation-cycle-observation.v2",
    status: "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE",
    commit: "94b6d415573f5d8b2d0190c809a4b8e128a25aa8",
    migrationId: "candidate-episode-v1-cycle-5",
    releaseId: "candidate-shadow-cycle-5-94b6d415",
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

function runtime(final = cycle5Final()) {
  const evidenceRoot = "/home/ubuntu/.cache/market-radar-ops/cycle-continuation-ops/wp-g0-2-cycle-continuation-94b6d415573f-98459433/observation";
  return {
    cycle5Final: final,
    productionCommit: final.commit,
    productionTree: commit("7"),
    currentWebContainerId: "8".repeat(12),
    currentWebImageId: image("9"),
    buildRecordPath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-94b6d415573f-98459433/target-images-record.json",
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

function readOnlySummary(overrides = {}) {
  const evidenceRoot = "/home/ubuntu/.cache/market-radar-ops/evidence";
  return {
    schemaVersion: "wp-g0.2-cycle-5-read-only-verification-superwindow-evidence.v1",
    status: "PASS_CYCLE_5_READ_ONLY_VERIFICATION_SUPERWINDOW",
    packageId: "WP-G0.2-CYCLE-5-READ-ONLY-VERIFICATION-SUPERWINDOW",
    productionCommit: "94b6d415573f5d8b2d0190c809a4b8e128a25aa8",
    productionMutationAllowed: false,
    servicesMutated: [],
    databaseMutation: false,
    environmentMutation: false,
    phaseTransition: false,
    childEvidence: [
      {
        step: "shadow_verify_code_presence",
        status: "PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED",
        path: `${evidenceRoot}/wp-g0-2-code-presence-a/code-presence-evidence.json`,
        sha256: hash("7"),
      },
      {
        step: "current_cycle_lineage",
        status: "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH",
        path: `${evidenceRoot}/wp-g0-2-lineage-a/lineage-final.json`,
        sha256: hash("8"),
      },
      {
        step: "current_cycle_reconciliation",
        status: "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
        path: `${evidenceRoot}/wp-g0-2-reconciliation-a/reconciliation-result.json`,
        sha256: hash("9"),
      },
    ],
    canonicalAuthorityChanged: false,
    g0Completed: false,
    ...overrides,
  };
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
  assert.deepEqual(request.sequence, ["cycle5_readonly_superwindow", "shadow_verify_phase"]);
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
  assert.equal(Object.hasOwn(projected, "cycle5Final"), false);
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
});

test("Cycle-5 thresholds cannot be shortened or relabeled", () => {
  for (const final of [
    cycle5Final({ samples: 288 }),
    cycle5Final({ activationSamples: 288 }),
    cycle5Final({ elapsedSeconds: 86399 }),
    cycle5Final({ activationCoverageSeconds: 86399 }),
    cycle5Final({ completedWrites: 9999 }),
    cycle5Final({ unresolvedOutbox: 1 }),
    cycle5Final({ thresholdsChanged: true }),
  ]) {
    assert.throws(() => createExecutionRequest({
      bundleSha256: hash("0"),
      manifest: manifest(),
      runtime: runtime(final),
      stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-shadow-verify-handoff-aaaaaaaaaaaa-12345678",
    }), /cycle5_final_not_pass/u);
  }
});

test("R2 runtime can only be derived from all three exact R0 PASS artifacts", () => {
  const derived = buildPhaseRuntimeFromReadOnlySummary({
    runtime: runtime(),
    summary: readOnlySummary(),
  });
  assert.equal(derived.codeReleaseEvidenceSha256, hash("7"));
  assert.equal(derived.lineageEvidenceSha256, hash("8"));
  assert.equal(derived.reconciliationEvidenceSha256, hash("9"));
  for (const summary of [
    readOnlySummary({ status: "WAITING" }),
    readOnlySummary({ productionMutationAllowed: true }),
    readOnlySummary({ childEvidence: readOnlySummary().childEvidence.slice(0, 2) }),
    readOnlySummary({ childEvidence: readOnlySummary().childEvidence.map((item, index) => (
      index === 1 ? { ...item, status: "WAITING" } : item
    )) }),
  ]) {
    assert.throws(() => buildPhaseRuntimeFromReadOnlySummary({
      runtime: runtime(), summary,
    }), /readonly_summary_/u);
  }
});

test("handoff final proves observer start but cannot claim observation or G0 completion", () => {
  const value = {
    schemaVersion: "wp-g0.2-cycle-5-to-shadow-verify-handoff-evidence.v1",
    status: PIPELINE_PASS,
    packageId: PACKAGE_ID,
    sequence: ["cycle5_readonly_superwindow", "shadow_verify_phase"],
    readOnlyStatus: "PASS_CYCLE_5_READ_ONLY_VERIFICATION_SUPERWINDOW",
    phaseImmediateStatus: "PASS_IMMEDIATE_SHADOW_VERIFY_OBSERVATION_ACTIVE",
    observerActive: true,
    dualReadObservationCompleted: false,
    canonicalCompatStarted: false,
    canonicalCutoverExecuted: false,
    g0Completed: false,
    servicesMutated: ["web"],
    databasePhaseTransition: "shadow_capture_to_shadow_verify",
    secretsPrinted: false,
  };
  assert.equal(validatePipelineFinal(value).status, PIPELINE_PASS);
  assert.throws(() => validatePipelineFinal({ ...value, dualReadObservationCompleted: true }),
    /pipeline_final_boundary_invalid/u);
  assert.throws(() => validatePipelineFinal({ ...value, g0Completed: true }),
    /pipeline_final_boundary_invalid/u);
});
