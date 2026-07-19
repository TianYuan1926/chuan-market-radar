import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CONTRACT_PATH,
  REQUIRED_PRODUCTION_COMMIT,
  REQUIRED_PRODUCTION_TREE,
  buildTransportBundle,
  createProductionExecutionRequest,
  prepareAdminUrl,
  validateApprovalRequest,
  validateAuthorization,
  validateContract,
} from "./bundle.mjs";
import {
  PRODUCTION_TREE as CODE_PRESENCE_PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
} from "../candidate-shadow-verify-code-presence/runner.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const image = (character) => `sha256:${hash(character)}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function reconciliationEvidence(lineageFileSha256 = hash("5")) {
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
    lineageEvidenceSha256: `sha256:${lineageFileSha256}`,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: hash("b"),
      unifiedFinal: hash("c"),
      unifiedSamples: hash("d"),
    },
    comparedWrites: 10000,
    comparisonDifferences: 0,
    duplicateOutboxMappings: 0,
    duplicateEventMappings: 0,
    resolvedQuarantineExclusions: 0,
    sourceReleaseCount: 7,
    verificationMigrationId: "candidate-episode-v1-cycle-7",
    evidenceHash: `sha256:${hash("a")}`,
    violations: [],
    differenceSample: [],
  };
}

function lineageEvidence() {
  return {
    schemaVersion: "candidate-multi-cycle-lineage-evidence.v3",
    status: "PASS_CURRENT_CYCLE_UNIFIED_LINEAGE_READY_FOR_RECONCILIATION_REFRESH",
    unifiedEvidenceSha256: hash("c"),
    unifiedSamplesSha256: hash("d"),
    controlSnapshotSha256: hash("b"),
    sourceReleaseWindows: [
      {
        controlEpoch: 6,
        deadlineAt: "2026-07-06T00:00:00.000Z",
        migrationId: "candidate-episode-v1",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-one",
        startedAt: "2026-07-03T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 2,
        deadlineAt: "2026-07-09T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-2",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-two",
        startedAt: "2026-07-06T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 2,
        deadlineAt: "2026-07-12T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-3",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-three",
        startedAt: "2026-07-09T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 2,
        deadlineAt: "2026-07-15T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-4",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-four",
        startedAt: "2026-07-12T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 2,
        deadlineAt: "2026-07-18T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-5",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-five",
        startedAt: "2026-07-15T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 2,
        deadlineAt: "2026-07-21T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-6",
        phase: "legacy",
        releaseId: "candidate-shadow-release-cycle-six",
        startedAt: "2026-07-18T00:00:00.000Z",
        writeFrozen: true,
      },
      {
        controlEpoch: 1,
        deadlineAt: "2026-07-24T00:00:00.000Z",
        migrationId: "candidate-episode-v1-cycle-7",
        phase: "shadow_capture",
        releaseId: "candidate-shadow-release-12345678",
        startedAt: "2026-07-21T00:00:00.000Z",
        writeFrozen: false,
      },
    ],
    completedWrites: 10000,
    unresolvedOutbox: 0,
    observationElapsedSeconds: 86400,
    completionAdvances: 12,
    activationSamples: 289,
    activationCoverageSeconds: 86400,
    minimumComparedWrites: 10000,
    minimumSamples: 7,
    minimumStabilitySeconds: 1800,
    maximumSampleGapSeconds: 600,
    minimumCompletionAdvances: 2,
    minimumActivationSamples: 289,
    minimumActivationHours: 24,
    unresolvedMaximum: 0,
    currentCycleStartedAt: "2026-07-21T00:00:00.000Z",
    currentMigrationId: "candidate-episode-v1-cycle-7",
    currentReleaseId: "candidate-shadow-release-12345678",
    currentAuthorityEpoch: 1,
    thresholdsChanged: false,
    productionReconciliationExecuted: false,
    shadowVerifyStarted: false,
    sourceReleaseCount: 7,
    canonicalAuthorityChanged: false,
    g0Completed: false,
    validationCycle: 7,
  };
}

function transportManifest() {
  return {
    sourceCommit: commit("1"),
    sourceTree: commit("2"),
    sourceParentCommit: commit("3"),
    sourceDiffSha256: hash("4"),
    sourcePathSetSha256: hash("5"),
    gateEvidenceSha256: hash("6"),
    contractSha256: hash("7"),
    runnerArtifactSha256: hash("8"),
    transportArtifactSha256: hash("9"),
    policySha256: hash("a"),
  };
}

function runtime(evidence = {}) {
  return {
    productionCommit: REQUIRED_PRODUCTION_COMMIT,
    productionTree: REQUIRED_PRODUCTION_TREE,
    productionCommitTree: REQUIRED_PRODUCTION_TREE,
    currentWebImageId: image("c"),
    candidateWorkerContainerId: "d".repeat(12),
    candidateWorkerImageId: image("e"),
    migrationId: "candidate-episode-v1-cycle-7",
    releaseId: "candidate-shadow-release-12345678",
    currentAuthorityEpoch: 1,
    baseEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env",
    baseEnvSha256: hash("f"),
    productionEnvPath: "/home/ubuntu/apps/chuan-market-radar/.env.production",
    productionEnvSha256: hash("0"),
    targetProductionEnvSha256: hash("1"),
    composeSha256: hash("2"),
    identityWrapperPath: "/usr/local/sbin/market-radar-compose",
    identityWrapperSha256: hash("3"),
    identityOverridePath: "/etc/market-radar/compose-identity.env",
    identityOverrideSha256: hash("4"),
    lineageEvidencePath: evidence.lineagePath
      ?? "/home/ubuntu/.cache/market-radar-ops/evidence/lineage.json",
    lineageEvidenceSha256: evidence.lineageSha256 ?? hash("5"),
    reconciliationEvidencePath: evidence.reconciliationPath
      ?? "/home/ubuntu/.cache/market-radar-ops/evidence/reconciliation.json",
    reconciliationEvidenceSha256: evidence.reconciliationSha256 ?? hash("6"),
    codeReleaseEvidencePath: evidence.codeReleasePath
      ?? "/home/ubuntu/.cache/market-radar-ops/evidence/code-release.json",
    codeReleaseEvidenceSha256: evidence.codeReleaseSha256 ?? hash("7"),
    reconciliationEvidence: evidence.reconciliation
      ?? reconciliationEvidence(evidence.lineageSha256),
  };
}

async function evidenceFixture(lineageTransform = (value) => value) {
  const directory = await mkdtemp(join(tmpdir(), "shadow-verify-phase-evidence-"));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lineage = lineageTransform(lineageEvidence());
  const lineageBytes = Buffer.from(`${JSON.stringify(lineage, null, 2)}\n`);
  const lineageSha256 = sha256(lineageBytes);
  const reconciliation = reconciliationEvidence(lineageSha256);
  const reconciliationBytes = Buffer.from(`${JSON.stringify(reconciliation, null, 2)}\n`);
  const codeRelease = buildCodePresenceEvidence({
    productionCommit: REQUIRED_PRODUCTION_COMMIT,
    productionTree: CODE_PRESENCE_PRODUCTION_TREE,
    productionBlobs: Object.fromEntries(REFERENCE_CODE_PATHS.map((item) => [item.path, item.blob])),
    runningWebContainerId: "d".repeat(64),
    runningWebImageId: image("c"),
    buildRecordWebImageId: image("c"),
    buildRecordSha256: hash("e"),
    productionGitClean: true,
    productionGitDetached: true,
    candidateReadManifestAbsent: true,
    candidateReadEndpointFailClosed: true,
    healthLevel: "ready",
    scanFreshness: "fresh",
    verifiedAt: "2026-07-17T00:00:00.000Z",
  });
  const codeReleaseBytes = Buffer.from(`${JSON.stringify(codeRelease, null, 2)}\n`);
  const lineagePath = join(directory, "lineage.json");
  const reconciliationPath = join(directory, "reconciliation.json");
  const codeReleasePath = join(directory, "code-release.json");
  await writeFile(lineagePath, lineageBytes, { mode: 0o600 });
  await writeFile(reconciliationPath, reconciliationBytes, { mode: 0o600 });
  await writeFile(codeReleasePath, codeReleaseBytes, { mode: 0o600 });
  return {
    directory,
    lineagePath,
    lineageSha256,
    reconciliation,
    reconciliationPath,
    reconciliationSha256: sha256(reconciliationBytes),
    codeReleasePath,
    codeReleaseSha256: sha256(codeReleaseBytes),
  };
}

test("validates the checked-in phase-transition contract", async () => {
  const contract = JSON.parse(await readFile(resolve(root,
    CONTRACT_PATH)));
  assert.equal(validateContract(contract).productionExecuted, false);
});

test("creates a one-use, exact 90-minute, Web-only execution request", () => {
  const issuedAt = new Date("2026-07-17T00:00:00.000Z");
  const request = createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    nonce: "12345678-1234-4234-8234-123456789abc",
    now: issuedAt,
    runtime: runtime(),
  });
  assert.equal(request.productionCommit, REQUIRED_PRODUCTION_COMMIT);
  assert.equal(request.targetAuthorityEpoch, 2);
  assert.deepEqual(request.services, ["web"]);
  assert.equal(request.approvalExpiresAt, "2026-07-17T01:30:00.000Z");
  assert.equal(request.autonomyAuthorization.maxExecutions, 1);
  assert.equal(request.autonomyAuthorization.packageAssertions.allPagesCompared, true);
  assert.match(request.manifestApprovalDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.doesNotThrow(() => validateAuthorization(
    request.autonomyAuthorization, request, transportManifest(),
  ));
  assert.throws(() => validateAuthorization({
    ...request.autonomyAuthorization,
    preflightSha256: hash("f"),
  }, request, transportManifest()), /authorization_derived_binding_invalid/u);
  assert.throws(() => createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    runtime: { ...runtime(), targetProductionEnvSha256: runtime().productionEnvSha256 },
  }), /runtime_identity_invalid/u);
  assert.throws(() => createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    runtime: {
      ...runtime(),
      reconciliationEvidence: {
        ...reconciliationEvidence(),
        schemaVersion: "candidate-shadow-reconciliation-evidence.v1",
      },
    },
  }), /reconciliation_status_invalid/u);
  assert.throws(() => createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    runtime: { ...runtime(), candidateWorkerContainerId: "not-a-container" },
  }), /runtime_identity_invalid/u);
});

test("phase approval accepts only exact current Lineage v3 and bound Reconciliation v3", async () => {
  const manifest = transportManifest();
  const now = new Date("2026-07-17T00:00:00.000Z");
  const cases = [
    { name: "cycle7-v3", transform: (value) => value, passes: true },
    {
      name: "cycle5-v3",
      transform: (value) => ({
        ...value,
        sourceReleaseWindows: value.sourceReleaseWindows.slice(0, 5),
        currentMigrationId: "candidate-episode-v1-cycle-5",
        sourceReleaseCount: 5,
        validationCycle: 5,
      }),
      passes: false,
    },
    {
      name: "lineage-v1",
      transform: (value) => ({
        ...value,
        schemaVersion: "candidate-multi-cycle-lineage-evidence.v1",
        status: "PASS_FRESH_VERIFICATION_CYCLE_READY_FOR_RECONCILIATION",
      }),
      passes: false,
    },
    {
      name: "two-windows",
      transform: (value) => ({
        ...value,
        sourceReleaseWindows: value.sourceReleaseWindows.slice(1),
      }),
      passes: false,
    },
  ];
  for (const candidate of cases) {
    const evidence = await evidenceFixture(candidate.transform);
    try {
      const request = createProductionExecutionRequest({
        bundleSha256: hash("8"),
        manifest,
        nonce: "12345678-1234-4234-8234-123456789abc",
        now,
        runtime: runtime(evidence),
      });
      const operation = validateApprovalRequest({ manifest, request, productionPaths: false });
      if (candidate.passes) {
        assert.equal((await operation).status, "PASS_SHADOW_VERIFY_PHASE_EXECUTION_REQUEST");
      } else {
        await assert.rejects(operation,
          /lineage_evidence_status_invalid|lineage_windows_invalid|lineage_evidence_shape_invalid|lineage_window_count_cycle_mismatch|lineage_window_state_invalid|lineage_cycle_count_identity_mismatch/u,
          candidate.name);
      }
    } finally {
      await rm(evidence.directory, { recursive: true, force: true });
    }
  }
});

test("prepares a private Postgres URL without returning its secret", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "shadow-verify-admin-url-"));
  try {
    const output = join(temporary, "migration-admin.url");
    const input = Buffer.from("POSTGRES_USER=market_admin\nPOSTGRES_PASSWORD=p@ss word\n\0market_admin\0radar");
    const result = await prepareAdminUrl(input, output);
    const parsed = new URL((await readFile(output, "utf8")).trim());
    assert.deepEqual(result, { status: "pass", secretsPrinted: false });
    assert.equal(parsed.username, "market_admin");
    assert.equal(decodeURIComponent(parsed.password), "p@ss word");
    assert.equal(parsed.pathname, "/radar");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("builds byte-identical transport bundles from the same source identity", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "shadow-verify-bundle-"));
  try {
    const sourceIdentity = {
      sourceCommit: commit("1"),
      sourceTree: commit("2"),
      sourceParentCommit: commit("3"),
      sourceDiffSha256: hash("4"),
      sourcePathSetSha256: hash("5"),
      gateEvidenceSha256: hash("6"),
    };
    const first = await buildTransportBundle({
      root, output: join(temporary, "first.tar.gz"), sourceIdentity,
    });
    const second = await buildTransportBundle({
      root, output: join(temporary, "second.tar.gz"), sourceIdentity,
    });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(await readFile(first.output), await readFile(second.output));
    assert.equal(first.manifest.containsSecrets, false);
    assert.deepEqual(first.manifest.services, ["web"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
