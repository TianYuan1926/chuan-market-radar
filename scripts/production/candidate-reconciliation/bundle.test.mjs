import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EXECUTION_CONTRACT_PATH,
  PACKAGE_ID,
  PREPARATION_CONTRACT_PATH,
  TRANSPORT_FILES,
  buildTransportBundle,
  createProductionExecutionRequest,
  prepareAdminUrl,
  sha256,
  validateMultiCycleLineageEvidence,
  validateProductionExecutionContract,
  validateProductionExecutionRequest,
} from "./bundle.mjs";
import { LINEAGE_PASS, LINEAGE_SCHEMA } from "../candidate-lineage/runner.mjs";

const root = process.cwd();
const sourceReleaseWindows = [
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-09T00:00:00.000Z",
    migrationId: "candidate-episode-v1",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-1",
    startedAt: "2026-07-06T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-12T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-2",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-2",
    startedAt: "2026-07-09T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-15T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-3",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-3",
    startedAt: "2026-07-12T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-18T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-4",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-4",
    startedAt: "2026-07-15T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-21T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-5",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-5",
    startedAt: "2026-07-18T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-24T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-6",
    phase: "legacy",
    releaseId: "candidate-shadow-release-cycle-6",
    startedAt: "2026-07-21T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 1,
    deadlineAt: "2026-07-27T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-7",
    phase: "shadow_capture",
    releaseId: "candidate-shadow-release-cycle-7",
    startedAt: "2026-07-24T00:00:00.000Z",
    writeFrozen: false,
  },
];
const lineage = {
  activationCoverageSeconds: 86_400,
  activationSamples: 289,
  canonicalAuthorityChanged: false,
  completedWrites: 10_020,
  completionAdvances: 8,
  controlSnapshotSha256: "c".repeat(64),
  currentAuthorityEpoch: 1,
  currentMigrationId: sourceReleaseWindows[6].migrationId,
  currentReleaseId: sourceReleaseWindows[6].releaseId,
  currentCycleStartedAt: sourceReleaseWindows[6].startedAt,
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
  sourceReleaseWindows,
  status: LINEAGE_PASS,
  thresholdsChanged: false,
  unifiedEvidenceSha256: "a".repeat(64),
  unifiedSamplesSha256: "b".repeat(64),
  unresolvedMaximum: 0,
  unresolvedOutbox: 0,
  validationCycle: 7,
};
const runtime = {
  approvedProductionCommit: "1".repeat(40),
  authorityEpoch: 1,
  composeSha256: "2".repeat(64),
  lineageEvidencePath:
    "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-3-unified-lineage-proof/lineage-final.json",
  lineageEvidenceSha256: "3".repeat(64),
  postgresAdminEnvPath:
    "/var/lib/market-radar-ops/wp-g0-2-identity-runner-20260711T034847Z/secrets/postgres-admin.env",
  productionEnvSha256: "4".repeat(64),
  releaseId: sourceReleaseWindows[6].releaseId,
  sourceReleaseWindows,
  webImageId: `sha256:${"5".repeat(64)}`,
};

async function contracts() {
  const [preparation, execution] = await Promise.all([
    readFile(PREPARATION_CONTRACT_PATH, "utf8").then(JSON.parse),
    readFile(EXECUTION_CONTRACT_PATH, "utf8").then(JSON.parse),
  ]);
  return { preparation, execution };
}

function manifest(execution) {
  return {
    sourceCommit: "6".repeat(40),
    sourceTree: "7".repeat(40),
    sourceParentCommit: "8".repeat(40),
    sourceDiffSha256: "9".repeat(64),
    sourcePathSetSha256: "a".repeat(64),
    gateEvidenceSha256: "b".repeat(64),
    policySha256: "c".repeat(64),
    executionContractSha256: "d".repeat(64),
    runnerArtifactSha256: execution.runnerArtifact.sha256,
  };
}

test("v4 production packet is locked to nine runner files and no production mutation", async () => {
  const result = await validateProductionExecutionContract(root);
  assert.equal(result.status,
    "PASS_CURRENT_CYCLE_UNIFIED_RECONCILIATION_PRODUCTION_PACKET_LOCAL");
  assert.equal(result.productionMutationAllowed, false);
  assert.deepEqual(result.violations, []);
  assert.equal(TRANSPORT_FILES.length, 11);
  assert.equal(TRANSPORT_FILES.some((file) => file.includes("candidate-activation")), false);
});

test("Lineage v3 binds exact current identity and all seven source windows", () => {
  const request = {
    authorityEpoch: runtime.authorityEpoch,
    lineageSchemaVersion: LINEAGE_SCHEMA,
    lineageStatus: LINEAGE_PASS,
    releaseId: runtime.releaseId,
    sourceReleaseWindows,
  };
  assert.equal(validateMultiCycleLineageEvidence(lineage, request), lineage);
  assert.throws(() => validateMultiCycleLineageEvidence(lineage, {
    ...request,
    sourceReleaseWindows: sourceReleaseWindows.map((window, index) => (
      index === 0 ? { ...window, controlEpoch: 8 } : window
    )),
  }), /lineage_release_windows_mismatch/u);
  assert.throws(() => validateMultiCycleLineageEvidence({
    ...lineage,
    productionReconciliationExecuted: true,
  }, request), /lineage_future_stage_claim_invalid/u);
});

test("request generator contains one Lineage input and exact read-only inner approval", async () => {
  const { preparation, execution } = await contracts();
  const bundleSha256 = "e".repeat(64);
  const sourceManifest = manifest(execution);
  const request = createProductionExecutionRequest({
    manifest: sourceManifest,
    execution,
    preparation,
    bundleSha256,
    runtime,
    now: new Date("2026-07-18T08:00:00.000Z"),
    approvalId: "MR-G0-RECON-TEST",
    nonce: "11111111-2222-4333-8444-555555555555",
  });
  assert.equal(request.packageId, PACKAGE_ID);
  assert.equal(request.lineageSchemaVersion, LINEAGE_SCHEMA);
  assert.equal(request.lineageStatus, LINEAGE_PASS);
  assert.equal(request.reconciliationApproval.sourceReleaseWindows.length, 7);
  assert.equal(request.reconciliationApproval.shadowVerifyTransitionAllowed, false);
  assert.equal(request.services.length, 0);
  assert.equal(Object.keys(request).some((key) => key.toLowerCase().includes("activation")), false);
  assert.equal(await validateProductionExecutionRequest(
    request,
    sourceManifest,
    preparation,
    execution,
    bundleSha256,
    { now: new Date("2026-07-18T08:30:00.000Z"), verifyEvidence: false },
  ), request);
});

test("request, packet, authorization and Lineage bindings fail closed on drift", async () => {
  const { preparation, execution } = await contracts();
  const bundleSha256 = "e".repeat(64);
  const sourceManifest = manifest(execution);
  const request = createProductionExecutionRequest({
    manifest: sourceManifest,
    execution,
    preparation,
    bundleSha256,
    runtime,
    now: new Date("2026-07-18T08:00:00.000Z"),
    nonce: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
  const options = { now: new Date("2026-07-18T08:30:00.000Z"), verifyEvidence: false };
  await assert.rejects(validateProductionExecutionRequest(
    { ...request, transportBundleSha256: "0".repeat(64) },
    sourceManifest, preparation, execution, bundleSha256, options,
  ), /request_bundle_binding_mismatch/u);
  await assert.rejects(validateProductionExecutionRequest(
    { ...request, lineageStatus: "WAITING" },
    sourceManifest, preparation, execution, bundleSha256, options,
  ), /request_lineage_status_invalid/u);
  const elevated = structuredClone(request);
  elevated.reconciliationApproval.canonicalReadAllowed = true;
  await assert.rejects(validateProductionExecutionRequest(
    elevated, sourceManifest, preparation, execution, bundleSha256, options,
  ), /canonicalReadAllowed_must_be_false/u);
});

test("admin URL conversion writes the secret only to a private file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reconciliation-admin-url-"));
  const output = join(directory, "admin.url");
  try {
    const input = Buffer.from("POSTGRES_USER=market_radar\nPOSTGRES_PASSWORD=[REDACTED_TEST_VALUE]\n\0market_radar\0market_radar");
    assert.deepEqual(await prepareAdminUrl(input, output), {
      status: "pass",
      secretsPrinted: false,
    });
    const url = await readFile(output, "utf8");
    assert.match(url,
      /^postgresql:\/\/market_radar:%5BREDACTED_TEST_VALUE%5D@postgres:5432\/market_radar\n$/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("redacted transport template is byte reproducible", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reconciliation-transport-"));
  const first = join(directory, "first.tar.gz");
  const second = join(directory, "second.tar.gz");
  try {
    const a = await buildTransportBundle({ root, output: first, approvalEligible: false });
    const b = await buildTransportBundle({ root, output: second, approvalEligible: false });
    assert.equal(a.status, "PASS_LOCAL_CURRENT_CYCLE_RECONCILIATION_TRANSPORT_TEMPLATE");
    assert.equal(a.sha256, b.sha256);
    assert.equal(a.sha256, sha256(await readFile(first)));
    assert.equal(a.manifest.containsSecrets, false);
    assert.equal(a.manifest.services.length, 0);
    assert.equal(a.manifest.files.some((file) => file.includes("candidate-activation")), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
