import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  REQUIRED_PRODUCTION_COMMIT,
  REQUIRED_PRODUCTION_TREE,
  buildTransportBundle,
  createProductionExecutionRequest,
  prepareAdminUrl,
  validateAuthorization,
  validateContract,
} from "./bundle.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const hash = (character) => character.repeat(64);
const commit = (character) => character.repeat(40);
const image = (character) => `sha256:${hash(character)}`;

function reconciliationEvidence() {
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
    lineageEvidenceSha256: `sha256:${hash("b")}`,
    lineageSemanticEvidenceSha256: {
      controlSnapshot: hash("c"),
      unifiedFinal: hash("d"),
      unifiedSamples: hash("e"),
    },
    comparedWrites: 10000,
    comparisonDifferences: 0,
    duplicateOutboxMappings: 0,
    duplicateEventMappings: 0,
    resolvedQuarantineExclusions: 0,
    sourceReleaseCount: 6,
    verificationMigrationId: "candidate-episode-v1-cycle-6",
    evidenceHash: `sha256:${hash("a")}`,
    violations: [],
    differenceSample: [],
  };
}

function dualReadEvidence() {
  return {
    schemaVersion: "candidate-shadow-verify-observation-evidence.v1",
    status: "PASS_DUAL_READ_OBSERVATION",
    packageId: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
    migrationId: "candidate-episode-v1-cycle-6",
    releaseId: "candidate-shadow-release-12345678",
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
    evidenceHash: `sha256:${hash("9")}`,
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

function runtime() {
  return {
    productionCommit: REQUIRED_PRODUCTION_COMMIT,
    productionTree: REQUIRED_PRODUCTION_TREE,
    productionCommitTree: REQUIRED_PRODUCTION_TREE,
    currentWebImageId: image("c"),
    candidateWorkerContainerId: "d".repeat(12),
    candidateWorkerImageId: image("e"),
    migrationId: "candidate-episode-v1-cycle-6",
    releaseId: "candidate-shadow-release-12345678",
    currentAuthorityEpoch: 4,
    currentApprovalDigest: `sha256:${hash("8")}`,
    currentManifestSha256: hash("9"),
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
    lineageEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/lineage.json",
    lineageEvidenceSha256: hash("5"),
    reconciliationEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/reconciliation.json",
    reconciliationEvidenceSha256: hash("6"),
    dualReadEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/dual-read.json",
    dualReadEvidenceSha256: hash("8"),
    codeReleaseEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/code-release.json",
    codeReleaseEvidenceSha256: hash("7"),
    reconciliationEvidence: reconciliationEvidence(),
    dualReadEvidence: dualReadEvidence(),
  };
}

test("validates the checked-in phase-transition contract", async () => {
  const contract = JSON.parse(await readFile(resolve(root,
    "docs/governance/wp-g0-2-canonical-compat-phase-transition-and-observation.v3.json")));
  assert.equal(validateContract(contract).productionExecuted, false);
});

test("creates a one-use, exact 90-minute Web-and-worker execution request", () => {
  const issuedAt = new Date("2026-07-17T00:00:00.000Z");
  const request = createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    nonce: "12345678-1234-4234-8234-123456789abc",
    now: issuedAt,
    runtime: runtime(),
  });
  assert.equal(request.productionCommit, REQUIRED_PRODUCTION_COMMIT);
  assert.equal(request.targetAuthorityEpoch, 5);
  assert.deepEqual(request.services, ["web", "candidate-shadow-worker"]);
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
    runtime: { ...runtime(), dualReadEvidence: { ...dualReadEvidence(), sampleCount: 288 } },
  }), /dual_read_observation_result_invalid/u);
  assert.throws(() => createProductionExecutionRequest({
    bundleSha256: hash("8"),
    manifest: transportManifest(),
    runtime: { ...runtime(), candidateWorkerContainerId: "not-a-container" },
  }), /runtime_identity_invalid/u);
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
    assert.deepEqual(first.manifest.services, ["web", "candidate-shadow-worker"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
