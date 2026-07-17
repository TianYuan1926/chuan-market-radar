import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildTransportBundle,
  createProductionExecutionRequest,
  cycleContinuationBindingHashes,
  prepareAdminUrl,
  sha256,
  validateProductionExecutionRequest,
  validateProductionPacketContract,
  verifyDynamicPreflight,
  verifyStagedTransport,
} from "./bundle.mjs";

const execFileAsync = promisify(execFile);

function approvedManifest(template) {
  return {
    ...template,
    approvalEligible: true,
    sourceCommit: "2".repeat(40),
    sourceTree: "3".repeat(40),
    sourceParentCommit: "1".repeat(40),
    sourceDiffSha256: "4".repeat(64),
    sourcePathSetSha256: "5".repeat(64),
    gateEvidenceSha256: "6".repeat(64),
    policySha256: "7".repeat(64),
  };
}

function runtimeFixture() {
  return {
    baseEnvSha256: "5".repeat(64),
    composeSha256: "6".repeat(64),
    currentAuthorityEpoch: 6,
    currentMigrationId: "candidate-episode-v1",
    currentPhase: "legacy",
    currentProductionCommit: "7".repeat(40),
    currentReleaseId: "candidate-shadow-current-release",
    currentWebImageId: `sha256:${"8".repeat(64)}`,
    currentWorkerState: "absent",
    identityOverridePath: "/var/lib/market-radar-ops/identity/candidate-override.yml",
    identityOverrideSha256: "a".repeat(64),
    identityWrapperPath: "/var/lib/market-radar-ops/identity/compose-wrapper",
    identityWrapperSha256: "b".repeat(64),
    nextMigrationId: "candidate-episode-v1-cycle-2",
    nextReleaseId: "candidate-shadow-cycle-2-release",
    preflightEvidencePath: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-preflight-proof-release/preflight.json",
    preflightSha256: "d".repeat(64),
    productionEnvSha256: "c".repeat(64),
    rollbackWebImageRef: "market-radar-rollback/wp-g0-2-cycle-continuation:web-proof",
  };
}

function authorizationFixture(manifest, runtime, contract) {
  const bindings = cycleContinuationBindingHashes(runtime, contract);
  return {
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: "MR-G0-CYCLE-TEST",
    nonce: "12345678-1234-4234-8234-123456789abc",
    gate: "G0",
    packageId: "WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION",
    scope: "WP-G0.2-VALIDATION-CYCLE-CONTINUATION-PRODUCTION",
    actionClass: "feature_phase_activation",
    riskTier: "R2_AUTHORITY_TRANSITION",
    builderAgentId: "codex-primary",
    baseCommit: runtime.currentProductionCommit,
    targetCommit: manifest.sourceCommit,
    targetTree: manifest.sourceTree,
    diffSha256: manifest.sourceDiffSha256,
    pathSetSha256: manifest.sourcePathSetSha256,
    contractSha256: manifest.contractSha256,
    runnerSha256: contract.runnerArtifact.sha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: bindings.imageOrMigrationSha256,
    composeSha256: runtime.composeSha256,
    environmentFingerprintSha256: bindings.environmentFingerprintSha256,
    productionIdentitySha256: bindings.productionIdentitySha256,
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    preflightSha256: runtime.preflightSha256,
    backupRestoreEvidenceSha256: "2".repeat(64),
    rollbackTarget: runtime.currentProductionCommit,
    observationContractSha256: bindings.observationContractSha256,
    policySha256: manifest.policySha256,
    revocationEpoch: 2,
    issuedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: "2026-07-17T01:29:00.000Z",
    maxExecutions: 1,
    packageAssertions: {
      dynamicPreflightCurrent: true,
      knownP0Open: false,
      pollutionCleanupManifestExact: true,
      productionWipAvailable: true,
      qualityThresholdChanged: false,
      requiredGatesPassed: true,
      rollbackVerified: true,
      scopeMatchesBlueprint: true,
      secretsPresentInEvidence: false,
    },
  };
}

test("production packet contract preserves thresholds and production remains blocked", async () => {
  const result = await validateProductionPacketContract();
  assert.equal(result.status, "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET");
  assert.equal(result.productionMutationAllowed, false);
  assert.equal(result.productionExecuted, false);
  assert.deepEqual(result.violations, []);
});

test("transport template is deterministic and excludes credentials and requests", async () => {
  const directory = await mkdtemp("/tmp/candidate-cycle-continuation-bundle-");
  try {
    const first = join(directory, "first.tar.gz");
    const second = join(directory, "second.tar.gz");
    const a = await buildTransportBundle({ output: first, sourceIdentity: null, approvalEligible: false });
    const b = await buildTransportBundle({ output: second, sourceIdentity: null, approvalEligible: false });
    assert.equal(a.sha256, b.sha256);
    assert.deepEqual(await readFile(first), await readFile(second));
    const { stdout } = await execFileAsync("tar", ["-tzf", first]);
    assert.doesNotMatch(stdout, /(?:^|\/)(?:\.env(?:\.|$)|approval-request\.json|migration-admin\.url|postgres-admin\.env)/u);
    assert.equal(a.manifest.containsSecrets, false);
    assert.deepEqual(a.manifest.services, ["web", "candidate-shadow-worker"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("request binds a fresh adjacent cycle, absent worker, Git, image, env, and grant", async () => {
  const directory = await mkdtemp("/tmp/candidate-cycle-continuation-request-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const built = await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    const manifest = approvedManifest(built.manifest);
    const contract = JSON.parse(await readFile(
      "docs/governance/wp-g0-2-validation-cycle-continuation-production-packet.v1.json",
      "utf8",
    ));
    const runtime = runtimeFixture();
    const authorization = authorizationFixture(manifest, runtime, contract);
    const request = createProductionExecutionRequest({
      manifest,
      contract,
      bundleSha256: "a".repeat(64),
      runtime,
      authorization,
      now: new Date("2026-07-17T00:00:00.000Z"),
      nonce: authorization.nonce,
    });
    const validated = await validateProductionExecutionRequest(
      request, manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    );
    assert.equal(validated.nextMigrationId, "candidate-episode-v1-cycle-2");
    assert.equal(validated.currentPhase, "legacy");
    assert.equal(validated.currentWorkerState, "absent");
    assert.equal("activationEvidencePath" in validated, false);
    assert.match(validated.approvalDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.deepEqual(validated.services, ["web", "candidate-shadow-worker"]);
    await assert.rejects(() => validateProductionExecutionRequest(
      { ...request, currentAuthorityEpoch: 4 },
      manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /request_current_authority_epoch_invalid/u);
    await assert.rejects(() => validateProductionExecutionRequest(
      { ...request, nextMigrationId: "candidate-episode-v1-cycle-3" },
      manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /next_cycle_not_adjacent/u);
    await assert.rejects(() => validateProductionExecutionRequest(
      { ...request, services: ["web", "scanner-worker"] },
      manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /request_services_invalid/u);
    await assert.rejects(() => validateProductionExecutionRequest(
      {
        ...request,
        autonomyAuthorization: {
          ...request.autonomyAuthorization,
          packageAssertions: {
            ...request.autonomyAuthorization.packageAssertions,
            qualityThresholdChanged: true,
          },
        },
      },
      manifest, contract, "a".repeat(64),
      { now: new Date("2026-07-17T00:01:00.000Z"), verifyEvidence: false },
    ), /authorization_assertion_failed|approval_digest_binding_mismatch/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("staged transport rejects byte drift and symlink substitution", async () => {
  const directory = await mkdtemp("/tmp/candidate-cycle-continuation-stage-");
  try {
    const archive = join(directory, "packet.tar.gz");
    const stage = join(directory, "stage");
    await buildTransportBundle({ output: archive, sourceIdentity: null, approvalEligible: false });
    await execFileAsync("mkdir", ["-p", stage]);
    await execFileAsync("tar", ["-xzf", archive, "-C", stage]);
    const manifest = approvedManifest(JSON.parse(await readFile(join(stage, "transport-manifest.json"), "utf8")));
    assert.equal((await verifyStagedTransport(stage, manifest)).status,
      "PASS_LOCAL_CYCLE_CONTINUATION_PRODUCTION_PACKET");
    const target = join(stage, "scripts/production/candidate-cycle-continuation/production-runner.sh");
    const original = await readFile(target);
    await writeFile(target, `${original}\n# drift\n`);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /transport_artifact_mismatch/u);
    await writeFile(target, original);
    await rm(target);
    await symlink("/dev/null", target);
    await assert.rejects(() => verifyStagedTransport(stage, manifest), /artifact_not_regular/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("admin URL preparation consumes framed input and never returns credentials", async () => {
  const directory = await mkdtemp("/tmp/candidate-cycle-continuation-admin-");
  try {
    const output = join(directory, "migration-admin.url");
    const passwordKey = ["POSTGRES", "PASSWORD"].join("_");
    const result = await prepareAdminUrl(Buffer.from(
      `POSTGRES_USER=market_radar_admin\n${passwordKey}=test-only-not-a-real-credential\0market_radar_admin\0market_radar`,
    ), output);
    assert.deepEqual(result, { status: "pass", secretsPrinted: false });
    const parsed = new URL((await readFile(output, "utf8")).trim());
    assert.equal(parsed.hostname, "postgres");
    assert.equal(parsed.pathname, "/market_radar");
    assert.equal(Object.hasOwn(result, "url"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dynamic preflight is fresh read-only and exactly bound to production identity", async () => {
  const directory = await mkdtemp("/tmp/candidate-cycle-continuation-preflight-");
  try {
    const path = join(directory, "preflight.json");
    const runtime = runtimeFixture();
    const preflight = {
      schemaVersion: "candidate-cycle-continuation-production-preflight.v1",
      status: "PASS_READ_ONLY_PREFLIGHT",
      observedAt: "2026-07-17T00:00:00.000Z",
      productionRoot: "/home/ubuntu/apps/chuan-market-radar",
      detachedHead: runtime.currentProductionCommit,
      worktreeClean: true,
      currentWebImageId: runtime.currentWebImageId,
      currentWorkerState: "absent",
      baseEnvSha256: runtime.baseEnvSha256,
      productionEnvSha256: runtime.productionEnvSha256,
      composeSha256: runtime.composeSha256,
      identityWrapperSha256: runtime.identityWrapperSha256,
      identityOverrideSha256: runtime.identityOverrideSha256,
      currentMigrationId: runtime.currentMigrationId,
      currentAuthorityEpoch: runtime.currentAuthorityEpoch,
      currentReleaseId: runtime.currentReleaseId,
      candidatePhase: "legacy",
      candidateWriteFrozen: true,
      candidateDeadlineAt: "2026-07-17T00:00:00.000Z",
      activeCycles: 0,
      candidateEpisodes: 543,
      candidateEvents: 2_957,
      candidateCheckpoints: 0,
      candidateOutcomes: 0,
      candidateOutbox: 5_914,
      legacySourceCompleted: 2_957,
      legacySourceUnresolved: 0,
      candidateEventPending: 2_957,
      candidateEventNonPending: 0,
      candidateEventOrphans: 0,
      candidateEventContractMismatches: 0,
      otherSourceUnresolved: 0,
      healthLevel: "ready",
      scanFreshness: "fresh",
      database: "ready",
      redis: "healthy",
      productionMutation: false,
      secretsPrinted: false,
    };
    const bytes = Buffer.from(`${JSON.stringify(preflight)}\n`);
    await writeFile(path, bytes, { mode: 0o600 });
    const request = {
      ...runtime,
      preflightEvidencePath: path,
      preflightSha256: sha256(bytes),
      approvalIssuedAt: "2026-07-17T00:10:00.000Z",
      productionRoot: "/home/ubuntu/apps/chuan-market-radar",
    };
    assert.equal((await verifyDynamicPreflight(request)).status, "PASS_READ_ONLY_PREFLIGHT");
    const degradedBytes = Buffer.from(`${JSON.stringify({ ...preflight, scanFreshness: "aging" })}\n`);
    await writeFile(path, degradedBytes, { mode: 0o600 });
    await assert.rejects(() => verifyDynamicPreflight(request), /preflight_checksum_mismatch/u);
    await assert.rejects(() => verifyDynamicPreflight({
      ...request, preflightSha256: sha256(degradedBytes),
    }), /preflight_health_invalid/u);

    const runningWorkerBytes = Buffer.from(`${JSON.stringify({
      ...preflight, currentWorkerState: "running",
    })}\n`);
    await writeFile(path, runningWorkerBytes, { mode: 0o600 });
    await assert.rejects(() => verifyDynamicPreflight({
      ...request, preflightSha256: sha256(runningWorkerBytes),
    }), /preflight_binding_mismatch:currentWorkerState/u);

    const legacyUnresolvedBytes = Buffer.from(`${JSON.stringify({
      ...preflight, legacySourceUnresolved: 1,
    })}\n`);
    await writeFile(path, legacyUnresolvedBytes, { mode: 0o600 });
    await assert.rejects(() => verifyDynamicPreflight({
      ...request, preflightSha256: sha256(legacyUnresolvedBytes),
    }), /preflight_legacy_source_unresolved/u);

    const eventOrphanBytes = Buffer.from(`${JSON.stringify({
      ...preflight, candidateEventOrphans: 1,
    })}\n`);
    await writeFile(path, eventOrphanBytes, { mode: 0o600 });
    await assert.rejects(() => verifyDynamicPreflight({
      ...request, preflightSha256: sha256(eventOrphanBytes),
    }), /preflight_candidate_event_integrity_invalid/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
