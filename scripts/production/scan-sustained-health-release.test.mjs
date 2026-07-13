import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { buildTransportBundle } from "./scan-sustained-health-release-bundle.mjs";
import {
  BASELINE_COMMIT,
  COMPOSE_WRAPPER_SHA256,
  CONTRACT_PATH,
  IDENTITY_OVERRIDE_SHA256,
  PACKAGE_ID,
  PRODUCTION_COMPOSE_SHA256,
  RELEASE_DIFF_SHA256,
  TARGET_COMMIT,
  TARGET_REMOTE_BRANCH,
  inspectRelease,
  inspectRunner,
  loadContract,
  productionPreflightSha256,
  rollbackEvidenceSha256,
  sha256,
  validateApprovalRequest,
  validateContract,
  validateLocalPreparation,
  validateStagedArtifact,
} from "./scan-sustained-health-release.mjs";

const execFileAsync = promisify(execFile);
const temporaryDirectories = [];
const hex64 = "a".repeat(64);
const imageA = `sha256:${"b".repeat(64)}`;
const imageB = `sha256:${"c".repeat(64)}`;

function sourceIdentityFixture(sourceCommit = "1".repeat(40)) {
  return {
    sourceCommit,
    sourceTree: "2".repeat(40),
    sourceParentCommit: "3".repeat(40),
    sourceDiffSha256: "4".repeat(64),
    sourcePathSetSha256: "5".repeat(64),
    gateEvidenceSha256: "6".repeat(64),
    policySha256: "7".repeat(64),
  };
}

function rollbackImageRef(service, imageId) {
  return `market-radar-rollback/wp-g0-2-scan-health:${service}-${imageId.slice(7, 23)}`;
}

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRequest(contract, overrides = {}) {
  const request = {
    approvalExpiresAt: "2026-07-13T02:30:00.000Z",
    approvalIssuedAt: "2026-07-13T01:00:00.000Z",
    approvalRef: "scan-health-release-approval",
    automaticRollbackAllowed: true,
    baseEnvSha256: hex64,
    baselineCommit: BASELINE_COMMIT,
    buildAllowed: true,
    cadenceSeconds: 900,
    candidateRuntimeMutationAllowed: false,
    composeSha256: PRODUCTION_COMPOSE_SHA256,
    composeWrapperSha256: COMPOSE_WRAPPER_SHA256,
    contractSha256: hex64,
    databaseMutationAllowed: false,
    detachedHeadAfterSuccess: true,
    environmentMutationAllowed: false,
    evidenceDirectory: "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-scan-sustained-health-approved1",
    execute: true,
    featureFlagMutationAllowed: false,
    identityOverrideSha256: IDENTITY_OVERRIDE_SHA256,
    migrationAllowed: false,
    observationDurationSeconds: 1800,
    operator: "codex",
    otherServiceRestartAllowed: false,
    packageId: PACKAGE_ID,
    productionEnvSha256: "d".repeat(64),
    productionRepositoryMutationAllowed: true,
    redisMutationAllowed: false,
    releaseArtifactSha256: contract.artifact.sha256,
    releaseDiffSha256: RELEASE_DIFF_SHA256,
    requiredCompletionAdvances: 2,
    rollbackImageRetentionRequired: true,
    rollbackScannerWorkerImageRef: rollbackImageRef("scanner-worker", imageB),
    rollbackWebImageRef: rollbackImageRef("web", imageA),
    runnerUnitName: "market-radar-scan-health-approved1",
    runnerSourceCommit: "e".repeat(40),
    scannerWorkerImageId: imageB,
    sessionIndependentExecutionRequired: true,
    services: ["web", "scanner-worker"],
    sourceFetchAllowed: true,
    stagingDirectory: "/home/ubuntu/.cache/market-radar-ops/wp-g0-2-scan-sustained-health-release-approved1",
    targetCommit: TARGET_COMMIT,
    targetRemoteBranch: TARGET_REMOTE_BRANCH,
    temporaryArtifactCleanupRequired: true,
    transportBundleSha256: "f".repeat(64),
    transportMethod: "approved_orcaterm_bundle_upload",
    webImageId: imageA,
    ...overrides,
  };
  request.autonomyTrustRoot ??= "/home/ubuntu/.local/state/market-radar-autonomy";
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: "scan-health-approval-test-1",
    nonce: "scan-health-nonce-test-1",
    gate: "G0",
    packageId: PACKAGE_ID,
    scope: PACKAGE_ID,
    actionClass: "reversible_service_release",
    riskTier: "R1_REVERSIBLE_RUNTIME",
    builderAgentId: "codex-primary",
    baseCommit: "0".repeat(40),
    targetCommit: request.runnerSourceCommit,
    targetTree: "1".repeat(40),
    diffSha256: "2".repeat(64),
    pathSetSha256: "3".repeat(64),
    contractSha256: request.contractSha256,
    runnerSha256: contract.artifact.fileSha256["scripts/production/scan-sustained-health-release.sh"],
    artifactSha256: contract.artifact.sha256,
    imageOrMigrationSha256: sha256(`${request.webImageId}\n${request.scannerWorkerImageId}\n`),
    composeSha256: request.composeSha256,
    environmentFingerprintSha256: sha256(`${request.baseEnvSha256}\n${request.productionEnvSha256}\n`),
    productionIdentitySha256: sha256(`${request.identityOverrideSha256}\n${request.composeWrapperSha256}\n`),
    gateEvidenceSha256: "4".repeat(64),
    preflightSha256: productionPreflightSha256(request),
    backupRestoreEvidenceSha256: rollbackEvidenceSha256(request),
    rollbackTarget: `${BASELINE_COMMIT}:web+scanner-worker`,
    observationContractSha256: sha256(JSON.stringify(contract.observation)),
    policySha256: contract.artifact.fileSha256["scripts/governance/autonomy-policy.mjs"],
    revocationEpoch: 2,
    issuedAt: request.approvalIssuedAt,
    expiresAt: request.approvalExpiresAt,
    maxExecutions: 1,
    packageAssertions: {
      qualityThresholdChanged: false,
      scopeMatchesBlueprint: true,
      dynamicPreflightCurrent: true,
      requiredGatesPassed: true,
      rollbackVerified: true,
      productionWipAvailable: true,
      secretsPresentInEvidence: false,
      knownP0Open: false,
      pollutionCleanupManifestExact: true,
    },
  };
  return request;
}

function throwsReason(reason, fn) {
  assert.throws(fn, (error) => error?.reason === reason);
}

test("contract and exact 90-minute approval request are accepted", async () => {
  const contract = await loadContract();
  assert.equal(validateContract(clone(contract)).release.targetCommit, TARGET_COMMIT);
  const request = makeRequest(contract);
  assert.equal(
    validateApprovalRequest(request, contract, { now: new Date("2026-07-13T01:45:00.000Z") }).targetCommit,
    TARGET_COMMIT,
  );
});

test("contract refuses release, service, observation and mutation boundary drift", async () => {
  const contract = await loadContract();
  const cases = [
    ["target_commit_not_locked", (value) => { value.release.targetCommit = "0".repeat(40); }],
    ["baseline_commit_not_locked", (value) => { value.release.baselineCommit = "0".repeat(40); }],
    ["target_remote_branch_not_locked", (value) => { value.release.targetRemoteBranch = "main"; }],
    ["release_diff_checksum_not_locked", (value) => { value.release.releaseDiffSha256 = hex64; }],
    ["release_diff_lines_mismatch", (value) => { value.release.releaseDiffLines.pop(); }],
    ["service_allowlist_mismatch", (value) => { value.scope.services.push("redis"); }],
    ["database_mutation_must_be_false", (value) => { value.scope.databaseMutationAllowed = true; }],
    ["redis_mutation_must_be_false", (value) => { value.scope.redisMutationAllowed = true; }],
    ["other_service_restart_must_be_false", (value) => { value.scope.otherServiceRestartAllowed = true; }],
    ["environment_mutation_must_be_false", (value) => { value.scope.environmentMutationAllowed = true; }],
    ["migration_must_be_false", (value) => { value.scope.migrationAllowed = true; }],
    ["observation_duration_not_locked", (value) => { value.observation.minimumDurationSeconds = 1799; }],
    ["completion_advance_count_not_locked", (value) => { value.observation.requiredCompletionAdvances = 1; }],
    ["two_image_rollback_required", (value) => { value.rollback.restoreBothTargetImages = false; }],
    ["rollback_image_retention_required", (value) => { value.rollback.retainImagesBeforeMutation = false; }],
    ["session_independent_execution_required", (value) => { value.execution.sessionIndependent = false; }],
  ];
  for (const [reason, mutate] of cases) {
    const value = clone(contract);
    mutate(value);
    throwsReason(reason, () => validateContract(value));
  }
});

test("approval refuses extra keys, stale windows and every widened permission", async () => {
  const contract = await loadContract();
  const request = makeRequest(contract);
  throwsReason("request_keys_mismatch", () => validateApprovalRequest({ ...request, surprise: true }, contract));
  throwsReason("request_keys_mismatch", () => {
    const value = { ...request };
    delete value.webImageId;
    validateApprovalRequest(value, contract);
  });
  const cases = [
    ["request_target_commit_mismatch", { targetCommit: "0".repeat(40) }],
    ["request_target_remote_branch_mismatch", { targetRemoteBranch: "main" }],
    ["request_service_allowlist_mismatch", { services: ["web"] }],
    ["request_observation_duration_mismatch", { observationDurationSeconds: 900 }],
    ["request_completion_advance_count_mismatch", { requiredCompletionAdvances: 1 }],
    ["request_web_image_id_invalid", { webImageId: "latest" }],
    ["request_scanner_worker_image_id_invalid", { scannerWorkerImageId: "latest" }],
    ["request_runner_unit_name_invalid", { runnerUnitName: "scan.service" }],
    ["request_rollback_web_image_ref_mismatch", { rollbackWebImageRef: "market-radar-rollback/wp-g0-2-scan-health:web-wrong" }],
    ["request_rollback_scanner_image_ref_mismatch", { rollbackScannerWorkerImageRef: "market-radar-rollback/wp-g0-2-scan-health:scanner-worker-wrong" }],
    ["request_staging_directory_invalid", { stagingDirectory: "/home/ubuntu/apps/chuan-market-radar" }],
    ["request_autonomy_trust_root_mismatch", { autonomyTrustRoot: "/tmp/not-the-trust-root" }],
    ["request_evidence_directory_invalid", { evidenceDirectory: "/home/ubuntu/apps/chuan-market-radar/reports" }],
    ["automatic_rollback_not_allowed", { automaticRollbackAllowed: false }],
    ["source_fetch_not_allowed", { sourceFetchAllowed: false }],
    ["build_not_allowed", { buildAllowed: false }],
    ["repository_transition_not_allowed", { productionRepositoryMutationAllowed: false }],
    ["detached_head_not_required", { detachedHeadAfterSuccess: false }],
    ["session_independent_execution_not_required", { sessionIndependentExecutionRequired: false }],
    ["rollback_image_retention_not_required", { rollbackImageRetentionRequired: false }],
    ["candidateRuntimeMutationAllowed_must_be_false", { candidateRuntimeMutationAllowed: true }],
    ["databaseMutationAllowed_must_be_false", { databaseMutationAllowed: true }],
    ["environmentMutationAllowed_must_be_false", { environmentMutationAllowed: true }],
    ["featureFlagMutationAllowed_must_be_false", { featureFlagMutationAllowed: true }],
    ["migrationAllowed_must_be_false", { migrationAllowed: true }],
    ["otherServiceRestartAllowed_must_be_false", { otherServiceRestartAllowed: true }],
    ["redisMutationAllowed_must_be_false", { redisMutationAllowed: true }],
  ];
  for (const [reason, overrides] of cases) {
    throwsReason(reason, () => validateApprovalRequest(makeRequest(contract, overrides), contract, {
      now: new Date("2026-07-13T01:45:00.000Z"),
    }));
  }
  const wrongGrant = makeRequest(contract);
  wrongGrant.autonomyAuthorization.grantId = "wrong-grant";
  throwsReason("autonomy_grant_mismatch", () => validateApprovalRequest(wrongGrant, contract, {
    now: new Date("2026-07-13T01:45:00.000Z"),
  }));
  const embeddedLease = makeRequest(contract);
  embeddedLease.autonomyAuthorization.productionLeaseId = "runtime-only";
  throwsReason("autonomy_authorization_keys_mismatch", () => validateApprovalRequest(embeddedLease, contract, {
    now: new Date("2026-07-13T01:45:00.000Z"),
  }));
  throwsReason("approval_window_too_long", () => validateApprovalRequest(makeRequest(contract, {
    approvalExpiresAt: "2026-07-13T02:30:00.001Z",
  }), contract, { now: new Date("2026-07-13T01:45:00.000Z") }));
  throwsReason("approval_window_not_active", () => validateApprovalRequest(request, contract, {
    now: new Date("2026-07-13T02:30:01.000Z"),
  }));
});

test("release object proves exact parent, 16 paths and diff checksum", async () => {
  const contract = await loadContract();
  const release = await inspectRelease(process.cwd(), contract);
  assert.deepEqual(release, {
    baselineCommit: BASELINE_COMMIT,
    changedFileCount: 16,
    releaseDiffSha256: RELEASE_DIFF_SHA256,
    targetCommit: TARGET_COMMIT,
  });
});

test("runner source proves two-service, rollback and observation guardrails", async () => {
  const facts = await inspectRunner(process.cwd());
  assert.equal(Object.values(facts).every(Boolean), true);
  const source = await readFile("scripts/production/scan-sustained-health-release.sh", "utf8");
  assert.doesNotMatch(source, /fetch[^\n]*origin\s+main/);
  assert.doesNotMatch(source, /git[^\n]*(?:pull|merge|rebase)/);
  assert.match(source, /build web scanner-worker/);
  assert.match(source, /PASS_PRODUCTION_SCAN_SUSTAINED_HEALTH_TWO_CADENCE_OBSERVATION/);
  assert.match(source, /P0_ROLLBACK_PRODUCTION_SCAN_SUSTAINED_HEALTH_NOT_VERIFIED/);
  assert.match(source, /create_rollback_image_retention/);
  assert.match(source, /verify_rollback_image_retention/);
  const entrypoint = await readFile("scripts/production/scan-sustained-health-release-entrypoint.sh", "utf8");
  assert.match(entrypoint, /systemd-run/);
  assert.match(entrypoint, /SCAN_SUSTAINED_HEALTH_ENTRYPOINT_MODE=detached_worker/);
  assert.doesNotMatch(entrypoint, /nohup/);
});

test("standing authorization is consumed once and lease fencing guards every mutation checkpoint", async () => {
  const contract = await loadContract();
  assert.equal(contract.autonomy?.grantId, "MR-G0-G8-USER-STANDING-GRANT-20260714-034826");
  assert.equal(contract.autonomy?.gate, "G0");
  assert.equal(contract.autonomy?.actionClass, "reversible_service_release");
  assert.equal(contract.autonomy?.externalProductionLeaseRequired, true);
  assert.equal(contract.autonomy?.oneTimeApprovalConsumptionRequired, true);
  assert.equal(contract.autonomy?.mutationCheckpointRevalidationRequired, true);

  await access("scripts/governance/autonomy-production-lease-cli.mjs");
  const source = await readFile("scripts/production/scan-sustained-health-release.sh", "utf8");
  assert.match(source, /lease_acquire/);
  assert.match(source, /lease_consume/);
  for (const checkpoint of [
    "rollback-retention-web",
    "rollback-retention-scanner",
    "checkout-target",
    "build-target-images",
    "recreate-web",
    "recreate-scanner-worker",
    "observation-sample",
  ]) assert.match(source, new RegExp(`lease_checkpoint ${checkpoint}`));
  assert.match(source, /lease_safety_checkpoint rollback/);
  assert.match(source, /lease_release PASS/);

  const entrypoint = await readFile("scripts/production/scan-sustained-health-release-entrypoint.sh", "utf8");
  assert.match(entrypoint, /MARKET_RADAR_AUTONOMY_TRUST_ROOT/);
  assert.match(entrypoint, /\/home\/ubuntu\/\.local\/state\/market-radar-autonomy/);

  const bundle = await readFile("scripts/production/scan-sustained-health-release-bundle.mjs", "utf8");
  assert.match(bundle, /scripts\/governance\/autonomy-production-lease-cli\.mjs/);
  assert.match(bundle, /scripts\/governance\/autonomy-production-lease\.mjs/);
});

test("lease CLI acquires, consumes, rejects replay, observes revocation and permits safety closeout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-health-lease-cli-"));
  temporaryDirectories.push(directory);
  const trustRoot = join(directory, "trust");
  const requestPath = join(directory, "approval-request.json");
  const executionPath = join(directory, "execution.json");
  const contract = await loadContract();
  const request = makeRequest(contract);
  await mkdir(trustRoot, { mode: 0o700 });
  await writeFile(requestPath, `${JSON.stringify(request)}\n`, { mode: 0o600 });
  const cli = "scripts/governance/autonomy-production-lease-cli.mjs";
  const run = (command, args = [], now = "2026-07-13T01:45:00.000Z") => execFileAsync(
    process.execPath,
    [cli, command, "--trust-root", trustRoot, "--request", requestPath,
      "--execution", executionPath, ...args, "--now", now],
    { cwd: process.cwd() },
  );
  const acquired = JSON.parse((await run("acquire", ["--owner-id", "scan-health-test-runner"])).stdout);
  assert.equal(acquired.status, "active_unconsumed");
  assert.ok(acquired.fencingToken > 0);
  assert.equal(JSON.parse((await run("checkpoint", ["--checkpoint", "before-test"])).stdout).status, "pass");
  assert.equal(JSON.parse((await run("consume")).stdout).status, "consumed");
  const replayExecution = join(directory, "replay-execution.json");
  await assert.rejects(execFileAsync(process.execPath, [
    cli, "acquire", "--trust-root", trustRoot, "--request", requestPath,
    "--execution", replayExecution, "--owner-id", "scan-health-replay-runner",
    "--now", "2026-07-13T01:46:00.000Z",
  ]), (error) => {
    assert.match(error.stderr, /production_approval_already_consumed/);
    return true;
  });
  await writeFile(join(trustRoot, "revocation.json"), `${JSON.stringify({ epoch: 3 })}\n`, { mode: 0o600 });
  await assert.rejects(run("checkpoint", ["--checkpoint", "after-revocation"]), (error) => {
    assert.match(error.stderr, /production_lease_revoked/);
    return true;
  });
  assert.equal(JSON.parse((await run("safety-checkpoint", ["--checkpoint", "rollback"])).stdout).status, "pass");
  assert.equal(JSON.parse((await run("release", ["--outcome", "ROLLBACK_PASS"])).stdout).outcome, "ROLLBACK_PASS");
});

test("local preparation is approval-blocked and staged validation needs no Git repository", async () => {
  const local = await validateLocalPreparation();
  assert.equal(local.status, "PASS_LOCAL_SCAN_SUSTAINED_HEALTH_RELEASE_PREPARATION");
  assert.equal(local.productionDecision, "BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL");
  assert.equal(local.productionMutationAllowed, false);

  const directory = await mkdtemp(join(tmpdir(), "scan-health-staged-"));
  temporaryDirectories.push(directory);
  const files = [
    CONTRACT_PATH,
    "scripts/governance/autonomy-production-lease-cli.mjs",
    "scripts/governance/autonomy-production-lease.mjs",
    "scripts/governance/autonomy-policy.mjs",
    "scripts/production/scan-sustained-health-release-entrypoint.sh",
    "scripts/production/scan-sustained-health-release.mjs",
    "scripts/production/scan-sustained-health-release.sh",
  ];
  for (const file of files) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await copyFile(file, join(directory, file));
  }
  const staged = await validateStagedArtifact(directory);
  assert.equal(staged.status, "PASS_STAGED_SCAN_SUSTAINED_HEALTH_RELEASE_ARTIFACT");
});

test("transport bundle is reproducible, secret-free and source-commit bound", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-health-transport-"));
  temporaryDirectories.push(directory);
  const outputA = join(directory, "a.tar.gz");
  const outputB = join(directory, "b.tar.gz");
  const sourceCommit = "1".repeat(40);
  const sourceIdentity = sourceIdentityFixture(sourceCommit);
  const first = await buildTransportBundle({ root: process.cwd(), output: outputA, sourceCommit, sourceIdentity });
  const second = await buildTransportBundle({ root: process.cwd(), output: outputB, sourceCommit, sourceIdentity });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(await readFile(outputA), await readFile(outputB));
  assert.equal(first.manifest.sourceCommit, sourceCommit);
  assert.equal(first.manifest.sourceTree, sourceIdentity.sourceTree);
  assert.equal(first.manifest.sourceParentCommit, sourceIdentity.sourceParentCommit);
  assert.equal(first.manifest.gateEvidenceSha256, sourceIdentity.gateEvidenceSha256);
  assert.equal(first.manifest.policySha256, sourceIdentity.policySha256);
  assert.equal(first.manifest.targetCommit, TARGET_COMMIT);
  assert.equal(first.manifest.containsSecrets, false);
  assert.equal(first.manifest.productionRepositoryMutationAllowed, true);
  assert.equal(first.manifest.executionMode, "transient_systemd_unit");
  assert.equal(first.manifest.sessionIndependentExecutionRequired, true);
  assert.equal(first.manifest.runnerLogs, "journald");
  assert.equal(first.manifest.rollbackImageRetentionRequired, true);
  assert.equal(first.manifest.rollbackCleanupRequiresSeparateApproval, true);
  assert.deepEqual(first.manifest.services, ["web", "scanner-worker"]);
  const { stdout: listing } = await execFileAsync("tar", ["-tzf", outputA]);
  assert.deepEqual(listing.trim().split("\n").sort(), [
    CONTRACT_PATH,
    "scripts/governance/autonomy-production-lease-cli.mjs",
    "scripts/governance/autonomy-production-lease.mjs",
    "scripts/governance/autonomy-policy.mjs",
    "scripts/production/scan-sustained-health-release-entrypoint.sh",
    "scripts/production/scan-sustained-health-release.mjs",
    "scripts/production/scan-sustained-health-release.sh",
    "transport-manifest.json",
  ].sort());
  const bytes = await readFile(outputA);
  assert.equal(bytes.includes(Buffer.from("CRON_SECRET=")), false);
  assert.equal(bytes.includes(Buffer.from("DATABASE_URL=")), false);
  assert.equal(bytes.includes(Buffer.from("PRIVATE KEY")), false);
});

test("dirty/precommit transport template cannot claim an approval source commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-health-template-"));
  temporaryDirectories.push(directory);
  const result = await buildTransportBundle({
    root: process.cwd(),
    output: join(directory, "template.tar.gz"),
    sourceCommit: null,
    approvalEligible: false,
  });
  assert.equal(result.status, "PASS_LOCAL_SCAN_SUSTAINED_HEALTH_RELEASE_TRANSPORT_TEMPLATE");
  assert.equal(result.manifest.approvalEligible, false);
  assert.equal(result.manifest.sourceCommit, null);
});

test("default shell mode is dry-run and cannot touch production", async () => {
  const { stdout } = await execFileAsync("bash", ["scripts/production/scan-sustained-health-release.sh"], {
    cwd: process.cwd(),
    env: { ...process.env, SCAN_SUSTAINED_HEALTH_RELEASE_MODE: "dry_run" },
  });
  assert.match(stdout, /DRY-RUN: production Git, images, containers, database, Redis and environment were not changed/);
  assert.match(stdout, /BLOCKED_AWAITING_EXACT_PRODUCTION_APPROVAL/);
});

test("approved entrypoint survives launcher exit through a transient unit and worker cleans staging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-health-entrypoint-"));
  temporaryDirectories.push(directory);
  const fakeBin = join(directory, "bin");
  const stage = join(directory, "wp-g0-2-scan-sustained-health-release-cleanup1");
  const completionFile = join(directory, "detached-complete");
  const systemdState = join(directory, "systemd-state.json");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(join(stage, "scripts/production"), { recursive: true, mode: 0o700 });
  await copyFile(
    "scripts/production/scan-sustained-health-release-entrypoint.sh",
    join(stage, "scripts/production/scan-sustained-health-release-entrypoint.sh"),
  );
  await writeFile(
    join(stage, "scripts/production/scan-sustained-health-release.sh"),
    "#!/bin/sh\nsleep 1\nprintf complete > \"$FAKE_COMPLETION_FILE\"\n",
    { mode: 0o700 },
  );
  await writeFile(join(fakeBin, "sudo"), "#!/bin/sh\n[ \"$1\" = \"-n\" ] && shift\nexec \"$@\"\n", { mode: 0o700 });
  await writeFile(join(fakeBin, "systemd-run"), [
    "#!/usr/bin/env node",
    "const fs = require('node:fs');",
    "const { spawn } = require('node:child_process');",
    "const args = process.argv.slice(2); const env = { ...process.env };",
    "for (const arg of args) if (arg.startsWith('--setenv=')) { const pair=arg.slice(9); const at=pair.indexOf('='); env[pair.slice(0,at)]=pair.slice(at+1); }",
    "const commandIndex = args.indexOf('/bin/bash'); if (commandIndex < 0) process.exit(2);",
    "const child = spawn(args[commandIndex], args.slice(commandIndex + 1), { detached: true, stdio: 'ignore', env }); child.unref();",
    "fs.writeFileSync(process.env.FAKE_SYSTEMD_STATE, JSON.stringify({ pid: child.pid }));",
    "",
  ].join("\n"), { mode: 0o700 });
  await writeFile(join(fakeBin, "systemctl"), [
    "#!/usr/bin/env node",
    "const fs = require('node:fs'); const args=process.argv.slice(2).join(' '); const exists=fs.existsSync(process.env.FAKE_SYSTEMD_STATE);",
    "if (args.includes('LoadState')) console.log(exists ? 'loaded' : 'not-found');",
    "else if (args.includes('ActiveState')) console.log(exists ? 'active' : 'inactive');",
    "else if (args.includes('ExecMainPID')) console.log(exists ? JSON.parse(fs.readFileSync(process.env.FAKE_SYSTEMD_STATE)).pid : '0');",
    "else process.exit(1);",
    "",
  ].join("\n"), { mode: 0o700 });
  await chmod(join(fakeBin, "sudo"), 0o700);
  await chmod(join(fakeBin, "systemd-run"), 0o700);
  await chmod(join(fakeBin, "systemctl"), 0o700);
  const stageReal = await realpath(stage);
  const bundleSha = createHash("sha256").update("bundle").digest("hex");
  await writeFile(join(stage, "approval-request.json"), `${JSON.stringify({
    stagingDirectory: stageReal,
    transportBundleSha256: bundleSha,
    runnerUnitName: "market-radar-scan-health-cleanup1",
    sessionIndependentExecutionRequired: true,
    autonomyTrustRoot: "/home/ubuntu/.local/state/market-radar-autonomy",
  })}\n`, { mode: 0o600 });
  await writeFile(join(stage, ".transport-bundle.sha256"), `${bundleSha}\n`, { mode: 0o600 });
  await chmod(stage, 0o700);
  const launch = await execFileAsync("bash", [join(stage, "scripts/production/scan-sustained-health-release-entrypoint.sh")], {
    env: {
      ...process.env,
      FAKE_COMPLETION_FILE: completionFile,
      FAKE_SYSTEMD_STATE: systemdState,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
  });
  assert.match(launch.stdout, /DETACHED_SCAN_SUSTAINED_HEALTH_RELEASE_STARTED/);
  await assert.rejects(access(completionFile), { code: "ENOENT" });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await access(completionFile);
      break;
    } catch {
      await delay(100);
    }
  }
  await access(completionFile);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await access(stage);
      await delay(50);
    } catch {
      break;
    }
  }
  await assert.rejects(stat(stage), { code: "ENOENT" });
});

test("artifact checksum is canonical ordered file-checksum JSON", async () => {
  const contract = await loadContract();
  const checksums = {};
  for (const file of contract.artifact.files) {
    checksums[file] = sha256(await readFile(file));
  }
  assert.equal(sha256(JSON.stringify(checksums)), contract.artifact.sha256);
  assert.equal(sha256(await readFile(CONTRACT_PATH)), sha256(await readFile(CONTRACT_PATH)));
});
