import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
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

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRequest(contract, overrides = {}) {
  return {
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
    runnerSourceCommit: "e".repeat(40),
    scannerWorkerImageId: imageB,
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
    ["request_staging_directory_invalid", { stagingDirectory: "/home/ubuntu/apps/chuan-market-radar" }],
    ["request_evidence_directory_invalid", { evidenceDirectory: "/home/ubuntu/apps/chuan-market-radar/reports" }],
    ["automatic_rollback_not_allowed", { automaticRollbackAllowed: false }],
    ["source_fetch_not_allowed", { sourceFetchAllowed: false }],
    ["build_not_allowed", { buildAllowed: false }],
    ["repository_transition_not_allowed", { productionRepositoryMutationAllowed: false }],
    ["detached_head_not_required", { detachedHeadAfterSuccess: false }],
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
  const first = await buildTransportBundle({ root: process.cwd(), output: outputA, sourceCommit });
  const second = await buildTransportBundle({ root: process.cwd(), output: outputB, sourceCommit });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(await readFile(outputA), await readFile(outputB));
  assert.equal(first.manifest.sourceCommit, sourceCommit);
  assert.equal(first.manifest.targetCommit, TARGET_COMMIT);
  assert.equal(first.manifest.containsSecrets, false);
  assert.equal(first.manifest.productionRepositoryMutationAllowed, true);
  assert.deepEqual(first.manifest.services, ["web", "scanner-worker"]);
  const { stdout: listing } = await execFileAsync("tar", ["-tzf", outputA]);
  assert.deepEqual(listing.trim().split("\n").sort(), [
    CONTRACT_PATH,
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

test("approved entrypoint removes staging after child success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scan-health-entrypoint-"));
  temporaryDirectories.push(directory);
  const stage = join(directory, "wp-g0-2-scan-sustained-health-release-cleanup1");
  await mkdir(join(stage, "scripts/production"), { recursive: true, mode: 0o700 });
  await copyFile(
    "scripts/production/scan-sustained-health-release-entrypoint.sh",
    join(stage, "scripts/production/scan-sustained-health-release-entrypoint.sh"),
  );
  await writeFile(join(stage, "scripts/production/scan-sustained-health-release.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const stageReal = await realpath(stage);
  const bundleSha = createHash("sha256").update("bundle").digest("hex");
  await writeFile(join(stage, "approval-request.json"), `${JSON.stringify({
    stagingDirectory: stageReal,
    transportBundleSha256: bundleSha,
  })}\n`, { mode: 0o600 });
  await writeFile(join(stage, ".transport-bundle.sha256"), `${bundleSha}\n`, { mode: 0o600 });
  await chmod(stage, 0o700);
  await execFileAsync("bash", [join(stage, "scripts/production/scan-sustained-health-release-entrypoint.sh")]);
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
