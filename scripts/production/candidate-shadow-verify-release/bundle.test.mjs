import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod, mkdtemp, mkdir, readFile, rm, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  createProductionExecutionRequest,
  PACKAGE_ID,
  sha256,
  validateApprovalRequest,
  validateLocalPreparation,
  verifyStagedTransport,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);
const HASH = "a".repeat(64);
const WEB_IMAGE = `sha256:${"1".repeat(64)}`;
const WORKER_IMAGE = `sha256:${"2".repeat(64)}`;

function lineage() {
  return {
    schemaVersion: "candidate-multi-cycle-lineage-evidence.v2",
    status: "PASS_CYCLE3_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH",
    unifiedEvidenceSha256: "1".repeat(64),
    unifiedSamplesSha256: "2".repeat(64),
    controlSnapshotSha256: "7".repeat(64),
    completedWrites: 10_020,
    observationElapsedSeconds: 86_400,
    completionAdvances: 12,
    activationSamples: 289,
    activationCoverageSeconds: 86_400,
    minimumComparedWrites: 10_000,
    minimumSamples: 7,
    minimumStabilitySeconds: 1_800,
    maximumSampleGapSeconds: 600,
    minimumCompletionAdvances: 2,
    minimumActivationSamples: 289,
    minimumActivationHours: 24,
    unresolvedMaximum: 0,
    unresolvedOutbox: 0,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    canonicalAuthorityChanged: false,
    g0Completed: false,
    currentMigrationId: "candidate-episode-v1-cycle-3",
    currentReleaseId: "candidate-shadow-cycle-three",
    currentAuthorityEpoch: 1,
    currentCycleStartedAt: "2026-07-18T00:00:00.000Z",
    sourceReleaseWindows: [
      {
        migrationId: "candidate-episode-v1",
        releaseId: "candidate-shadow-cycle-one",
        controlEpoch: 6,
        phase: "legacy",
        writeFrozen: true,
        startedAt: "2026-07-12T00:00:00.000Z",
        deadlineAt: "2026-07-15T00:00:00.000Z",
      },
      {
        migrationId: "candidate-episode-v1-cycle-2",
        releaseId: "candidate-shadow-cycle-two",
        controlEpoch: 2,
        phase: "legacy",
        writeFrozen: true,
        startedAt: "2026-07-15T00:00:00.000Z",
        deadlineAt: "2026-07-18T00:00:00.000Z",
      },
      {
        migrationId: "candidate-episode-v1-cycle-3",
        releaseId: "candidate-shadow-cycle-three",
        controlEpoch: 1,
        phase: "shadow_capture",
        writeFrozen: false,
        startedAt: "2026-07-18T00:00:00.000Z",
        deadlineAt: "2026-07-21T00:00:00.000Z",
      },
    ],
  };
}

function reconciliation(lineageFileSha256) {
  return {
    schemaVersion: "candidate-cycle3-reconciliation-evidence.v2",
    status: "PASS_CYCLE3_UNIFIED_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
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
    lineageEvidenceSha256: `sha256:${lineageFileSha256}`,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: "7".repeat(64),
      unifiedFinal: "1".repeat(64),
      unifiedSamples: "2".repeat(64),
    },
    comparedWrites: 10_020,
    comparisonDifferences: 0,
    duplicateOutboxMappings: 0,
    duplicateEventMappings: 0,
    resolvedQuarantineExclusions: 0,
    sourceReleaseCount: 3,
    verificationMigrationId: "candidate-episode-v1-cycle-3",
    evidenceHash: `sha256:${"8".repeat(64)}`,
    violations: [],
    differenceSample: [],
  };
}

function sourceIdentity() {
  return {
    sourceCommit: "a".repeat(40),
    sourceTree: "b".repeat(40),
    sourceParentCommit: "c".repeat(40),
    sourceDiffSha256: "d".repeat(64),
    sourcePathSetSha256: "e".repeat(64),
  };
}

async function evidenceFixture({
  lineageValue = lineage(), reconciliationFactory = reconciliation,
} = {}) {
  const evidenceRoot = await mkdtemp(join(tmpdir(), "shadow-verify-evidence-root-"));
  const root = join(evidenceRoot, `shadow-verify-test-${process.pid}-${Date.now()}`);
  await mkdir(root, { mode: 0o700 });
  const lineagePath = join(root, "lineage.json");
  const reconciliationPath = join(root, "reconciliation.json");
  const lineageBytes = Buffer.from(`${JSON.stringify(lineageValue, null, 2)}\n`);
  const lineageSha256 = sha256(lineageBytes);
  const reconciliationBytes = Buffer.from(
    `${JSON.stringify(reconciliationFactory(lineageSha256), null, 2)}\n`,
  );
  await writeFile(lineagePath, lineageBytes, { mode: 0o600 });
  await writeFile(reconciliationPath, reconciliationBytes, { mode: 0o600 });
  return {
    root,
    evidenceRoot,
    lineagePath,
    lineageSha256,
    reconciliationPath,
    reconciliationSha256: sha256(reconciliationBytes),
  };
}

function runtime(evidence) {
  return {
    baseEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env",
    baseEnvSha256: HASH,
    candidateAuthorityEpoch: 1,
    candidateMigrationId: "candidate-episode-v1-cycle-3",
    candidateReleaseId: "candidate-shadow-cycle-three",
    candidateWorkerContainerId: "a".repeat(12),
    candidateWorkerImageId: WORKER_IMAGE,
    composeSha256: HASH,
    currentWebImageId: WEB_IMAGE,
    identityOverridePath: "/var/lib/market-radar-ops/identity/candidate-override.yml",
    identityOverrideSha256: HASH,
    identityWrapperPath: "/var/lib/market-radar-ops/identity/compose-wrapper",
    identityWrapperSha256: HASH,
    lineageEvidencePath: evidence.lineagePath,
    lineageEvidenceSha256: evidence.lineageSha256,
    productionEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env.production",
    productionEnvSha256: HASH,
    reconciliationEvidencePath: evidence.reconciliationPath,
    reconciliationEvidenceSha256: evidence.reconciliationSha256,
  };
}

test("contract, minimal release target and deterministic redacted transport are valid", async () => {
  const root = await mkdtemp(join(tmpdir(), "shadow-verify-release-bundle-"));
  try {
    const preparation = await validateLocalPreparation();
    assert.equal(preparation.status, "PASS_LOCAL_SHADOW_VERIFY_CODE_RELEASE_PREPARATION");
    assert.equal(preparation.release.targetCommit, "eb48827b8b403452328b65dc4b415c3fc0ecf765");
    const first = await buildTransportBundle({
      output: join(root, "first.tar.gz"), sourceIdentity: sourceIdentity(),
    });
    const second = await buildTransportBundle({
      output: join(root, "second.tar.gz"), sourceIdentity: sourceIdentity(),
    });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, ["web"]);
    const stage = join(root, "stage");
    await mkdir(stage);
    await execFileAsync("tar", ["-xzf", first.output, "-C", stage]);
    const stagedManifest = JSON.parse(await readFile(join(stage, "transport-manifest.json")));
    await verifyStagedTransport(stage, stagedManifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exact standing authorization binds private Lineage and zero-difference Reconciliation", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "shadow-verify-release-request-"));
  const evidence = await evidenceFixture();
  try {
    const bundle = await buildTransportBundle({
      output: join(outputRoot, "bundle.tar.gz"), sourceIdentity: sourceIdentity(),
    });
    const now = new Date("2026-07-18T03:00:00.000Z");
    const request = createProductionExecutionRequest({
      manifest: bundle.manifest,
      bundleSha256: bundle.sha256,
      runtime: runtime(evidence),
      now,
      nonce: "11111111-2222-4333-8444-555555555555",
    });
    const result = await validateApprovalRequest({
      manifest: bundle.manifest, request, now, evidenceRoot: evidence.evidenceRoot,
    });
    assert.equal(result.status, "PASS_SHADOW_VERIFY_CODE_RELEASE_REQUEST");
    assert.equal(request.packageId, PACKAGE_ID);
    assert.deepEqual(request.services, ["web"]);
    assert.equal(request.autonomyAuthorization.packageAssertions.databaseMutation, false);
    assert.equal(request.autonomyAuthorization.packageAssertions.workerMutation, false);

    const wrongEpoch = structuredClone(request);
    wrongEpoch.candidateAuthorityEpoch = 3;
    await assert.rejects(
      validateApprovalRequest({
        manifest: bundle.manifest, request: wrongEpoch, now,
        evidenceRoot: evidence.evidenceRoot,
      }),
      /authorization_preflight_binding_invalid|request_candidate_lineage_mismatch/u,
    );

    const stale = new Date("2026-07-18T05:00:00.000Z");
    await assert.rejects(
      validateApprovalRequest({
        manifest: bundle.manifest, request, now: stale,
        evidenceRoot: evidence.evidenceRoot,
      }),
      /request_approval_window_invalid/u,
    );

    await chmod(evidence.lineagePath, 0o644);
    await assert.rejects(
      validateApprovalRequest({
        manifest: bundle.manifest, request, now,
        evidenceRoot: evidence.evidenceRoot,
      }),
      /lineage_file_boundary_invalid/u,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
    await rm(evidence.evidenceRoot, { recursive: true, force: true });
  }
});

test("legacy v1 and two-window evidence cannot authorize the Cycle-3 release", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "shadow-verify-release-v1-rejection-"));
  try {
    const bundle = await buildTransportBundle({
      output: join(outputRoot, "bundle.tar.gz"), sourceIdentity: sourceIdentity(),
    });
    const now = new Date("2026-07-18T03:00:00.000Z");
    const twoWindows = lineage();
    twoWindows.sourceReleaseWindows = twoWindows.sourceReleaseWindows.slice(1);
    const cases = [
      {
        name: "lineage-v1",
        fixture: {
          lineageValue: {
            ...lineage(),
            schemaVersion: "candidate-multi-cycle-lineage-evidence.v1",
            status: "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION",
          },
        },
      },
      { name: "two-window-lineage", fixture: { lineageValue: twoWindows } },
      {
        name: "reconciliation-v1",
        fixture: {
          reconciliationFactory: (lineageSha256) => ({
            ...reconciliation(lineageSha256),
            schemaVersion: "candidate-shadow-reconciliation-evidence.v1",
            status: "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL",
          }),
        },
      },
    ];
    for (const candidate of cases) {
      const evidence = await evidenceFixture(candidate.fixture);
      try {
        const request = createProductionExecutionRequest({
          manifest: bundle.manifest,
          bundleSha256: bundle.sha256,
          runtime: runtime(evidence),
          now,
          nonce: `11111111-2222-4333-8444-${candidate.name.padEnd(12, "0").slice(0, 12)}`,
        });
        await assert.rejects(
          validateApprovalRequest({
            manifest: bundle.manifest, request, now,
            evidenceRoot: evidence.evidenceRoot,
          }),
          /lineage_evidence_status_invalid|lineage_windows_invalid|reconciliation_status_invalid/u,
          candidate.name,
        );
      } finally {
        await rm(evidence.evidenceRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
