import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  evaluateGateResult,
  evaluateProductionApprovalBindings,
  evaluateScope,
  inspect,
  loadExternalProductionApproval,
  pathMatches,
  validatePackageApproval,
  validateStandingAuthorization,
  validateState,
  worktreeFingerprint,
} from "./autonomous-engineering.mjs";
import {
  acquireProductionLease,
  advanceRevocationEpoch,
  consumeProductionApproval,
  releaseProductionLease,
  verifyProductionLease,
} from "./autonomy-production-lease.mjs";
import {
  ALLOWED_ACTION_CLASSES,
  AUTONOMOUS_SCOPE_GATES,
  PROHIBITED_ACTION_CLASSES,
} from "./autonomy-policy.mjs";

const execFileAsync = promisify(execFile);

function standingAuthorizationFixture() {
  return {
    schemaVersion: "market-radar-g0-g8-standing-authorization.v1",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-TEST",
    status: "active",
    grantedBy: "user",
    issuedAt: "2026-01-01T00:00:00.000Z",
    revocationEpoch: 1,
    scopeGates: [...AUTONOMOUS_SCOPE_GATES],
    terminatesOn: "G8_EXIT_PASS_OR_USER_REVOCATION",
    contractPath: "docs/governance/G0_G8_STANDING_AUTONOMY_AUTHORIZATION_V1.json",
    builderAgentId: "builder-agent",
    trustRootEnv: "MARKET_RADAR_AUTONOMY_TRUST_ROOT",
    externalTrustRequiredForProduction: true,
    perPackageApprovalMaxMinutes: 90,
    productionWipLimit: 1,
    localPreparationWipLimit: 1,
    allowedActionClasses: [...ALLOWED_ACTION_CLASSES],
    prohibitedActionClasses: [...PROHIBITED_ACTION_CLASSES],
  };
}

function stateFixture() {
  return {
    schemaVersion: "market-radar-autonomous-engineering-state.v1",
    mode: "active_fail_closed",
    wipLimits: { production: 1, localPreparation: 1 },
    truthLabels: ["完整完成", "可运行但不完整", "临时验证版", "等待外部条件", "不能支撑实战"],
    hardLocks: {
      minimumStructuralRR: 3,
      automaticTrading: false,
      exchangeOrderApi: false,
      automaticRankingMutation: false,
      futureOutcomeAsProductionInput: false,
      frontendCreatesTradePlan: false,
      formalBacktestAutoRun: false,
      productionAutoApproval: false,
      g0G8StandingUserAuthorization: true,
      builderMayLowerQuality: false,
      destructiveProductionMutationAutoApproval: false,
      standingAuthorizationBeyondG8: false,
      exactPollutionCleanupRequired: true,
    },
    g0G8StandingAuthorization: standingAuthorizationFixture(),
    activePackage: {
      id: "WP-TEST",
      gate: "G0",
      actionClass: "security_hardening_release",
      missionAlignment: {
        mission: "快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。",
        contributionType: "supporting",
        coreChainStages: ["全市场发现"],
        measurableOutcome: "Fail closed when the engineering package drifts from the market-scanning core.",
      },
      lane: "localPreparation",
      status: "in_progress",
      productionMutation: false,
      requiresExplicitApproval: false,
      allowedPaths: ["docs/governance/**", "package.json"],
      prohibitedPaths: ["src/**", "migrations/**"],
      requiredArtifacts: ["package.json"],
      gateProfile: {
        targeted: ["test:autonomy"],
        baseline: ["typecheck", "lint", "test:market", "build", "backtest:golden"],
        security: ["ci:forbidden-files", "ci:secret-patterns", "security:check"],
      },
    },
    approvals: [],
    queue: [{
      order: 1,
      id: "WP-TEST",
      lane: "localPreparation",
      status: "in_progress",
      requiresExplicitApproval: false,
    }],
  };
}

function packageApprovalFixture() {
  return {
    packageId: "WP-TEST",
    scope: "WP-TEST",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-TEST",
    gate: "G0",
    actionClass: "reversible_service_release",
    riskTier: "R1_REVERSIBLE_RUNTIME",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:30:00.000Z",
    builderAgentId: "builder-agent",
    approvalId: "approval-test-1",
    nonce: "nonce-test-1",
    baseCommit: "0".repeat(40),
    targetCommit: "a".repeat(40),
    targetTree: "1".repeat(40),
    diffSha256: "2".repeat(64),
    pathSetSha256: "3".repeat(64),
    contractSha256: "b".repeat(64),
    runnerSha256: "4".repeat(64),
    artifactSha256: "c".repeat(64),
    imageOrMigrationSha256: "5".repeat(64),
    composeSha256: "6".repeat(64),
    environmentFingerprintSha256: "7".repeat(64),
    productionIdentitySha256: "8".repeat(64),
    gateEvidenceSha256: "9".repeat(64),
    preflightSha256: "d".repeat(64),
    backupRestoreEvidenceSha256: "a".repeat(64),
    rollbackTarget: "baseline-release",
    observationContractSha256: "b".repeat(64),
    policySha256: "c".repeat(64),
    revocationEpoch: 1,
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
}

const GATE_IDENTITY = {
  stateHash: "state",
  worktreeFingerprint: "tree",
  requiredArtifactFingerprint: "artifacts",
  gitHead: "a".repeat(40),
  gitTree: "b".repeat(40),
  packageScriptsSha256: "c".repeat(64),
  policySha256: "d".repeat(64),
};

function gateResultFixture(gates) {
  return {
    schemaVersion: "market-radar-autonomous-gate-result.v1",
    status: "pass",
    completedAt: "2026-01-01T00:30:00.000Z",
    gates,
    ...GATE_IDENTITY,
  };
}

function productionStateFixture() {
  const state = stateFixture();
  state.activePackage.lane = "production";
  state.activePackage.productionMutation = true;
  state.activePackage.requiresExplicitApproval = true;
  state.activePackage.actionClass = "reversible_service_release";
  state.queue[0].lane = "production";
  state.queue[0].requiresExplicitApproval = true;
  state.approvals = [packageApprovalFixture()];
  return state;
}

test("pathMatches supports exact paths and directory allowlists", () => {
  assert.equal(pathMatches("package.json", "package.json"), true);
  assert.equal(pathMatches("docs/governance/**", "docs/governance/protocol.md"), true);
  assert.equal(pathMatches("docs/governance/**", "docs/other.md"), false);
});

test("validateState accepts the locked local G0-G8 preparation fixture", () => {
  assert.deepEqual(validateState(stateFixture()), []);
});

test("repository inspection executes without controller naming collisions", async () => {
  const result = await inspect();
  assert.ok(["pass", "fail"].includes(result.status));
  assert.equal(typeof result.worktreeFingerprint, "string");
});

test("validateStandingAuthorization accepts the exact direct user grant", () => {
  assert.deepEqual(validateStandingAuthorization(standingAuthorizationFixture()), []);
});

test("standing authorization cannot silently expand to G9", () => {
  const authority = standingAuthorizationFixture();
  authority.scopeGates.push("G9");
  assert.ok(validateStandingAuthorization(authority)
    .includes("standing_authorization_scope_changed"));
});

test("validateState rejects quality, trading, and formal-backtest lock relaxation", () => {
  const state = stateFixture();
  state.hardLocks.minimumStructuralRR = 2;
  state.hardLocks.automaticTrading = true;
  state.activePackage.gateProfile.targeted.push("backtest:formal");
  const violations = validateState(state);
  assert.ok(violations.includes("hard_lock_changed:minimumStructuralRR"));
  assert.ok(violations.includes("hard_lock_changed:automaticTrading"));
  assert.ok(violations.includes("formal_backtest_auto_run_forbidden"));
});

test("validateState rejects changed truth labels", () => {
  const state = stateFixture();
  state.truthLabels[0] = "基本完成";
  assert.ok(validateState(state).includes("truth_labels_changed"));
});

test("validateState rejects mission drift and untraceable supporting work", () => {
  const state = stateFixture();
  state.activePackage.missionAlignment.mission = "Build a decorative dashboard";
  state.activePackage.missionAlignment.coreChainStages = [];
  assert.ok(validateState(state).includes("active_package_mission_alignment_invalid"));
});

test("validateState enforces one active package per lane", () => {
  const state = stateFixture();
  state.queue.push({
    order: 2,
    id: "WP-OTHER",
    lane: "localPreparation",
    status: "in_progress",
    requiresExplicitApproval: false,
  });
  assert.ok(validateState(state).includes("wip_limit_exceeded:localPreparation"));
});

test("production work may run read-only gates without approval but cannot gain deploy binding", () => {
  const state = productionStateFixture();
  state.approvals = [];
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(evaluateProductionApprovalBindings({
    approval: undefined,
    gitHead: "a".repeat(40),
    gitTree: "b".repeat(40),
    policySha256: "c".repeat(64),
    gateEvidenceSha256: "d".repeat(64),
  }), ["production_approval_missing"]);
});

test("validateState rejects tracked standing approvals to avoid commit-binding cycles", () => {
  const state = productionStateFixture();
  assert.ok(validateState(state, { now: new Date("2026-01-01T00:30:00.000Z") })
    .includes("standing_authorization_approval_must_be_external"));
});

test("external production approval must be a 0600 regular file outside the repository", async () => {
  const trustRoot = await mkdtemp(join(tmpdir(), "market-radar-external-approval-"));
  try {
    const state = productionStateFixture();
    state.approvals = [];
    const approvals = join(trustRoot, "approvals");
    const approvalPath = join(approvals, "WP-TEST.json");
    await mkdir(approvals, { mode: 0o700 });
    await writeFile(approvalPath, `${JSON.stringify(packageApprovalFixture())}\n`, { mode: 0o600 });
    const accepted = await loadExternalProductionApproval(state, { trustRootValue: trustRoot });
    assert.deepEqual(accepted.violations, []);
    assert.equal(accepted.approval.approvalId, "approval-test-1");
    await chmod(approvalPath, 0o644);
    const rejected = await loadExternalProductionApproval(state, { trustRootValue: trustRoot });
    assert.ok(rejected.violations.includes("standing_authorization_external_approval_mode_invalid"));
  } finally {
    await rm(trustRoot, { recursive: true, force: true });
  }
});

test("package authorization stays immutable and cannot embed runtime lease identity", () => {
  const state = productionStateFixture();
  const approval = packageApprovalFixture();
  assert.deepEqual(validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval,
    now: new Date("2026-01-01T00:30:00.000Z"),
  }), []);
  approval.productionLeaseId = "lease-must-be-runtime-only";
  approval.fencingToken = 7;
  const violations = validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval,
    now: new Date("2026-01-01T00:30:00.000Z"),
  });
  assert.ok(violations.includes("package_approval_embeds_runtime_lease_identity"));
});

test("package approval accepts G8 but rejects G9 scope", () => {
  const state = productionStateFixture();
  state.activePackage.gate = "G8";
  state.approvals[0].gate = "G8";
  assert.deepEqual(validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-01T00:30:00.000Z"),
  }), []);
  state.activePackage.gate = "G9";
  state.approvals[0].gate = "G9";
  assert.ok(validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-01T00:30:00.000Z"),
  }).includes("package_approval_gate_mismatch"));
});

test("production approval binding rejects another commit, tree, policy, or gate result", () => {
  const approval = packageApprovalFixture();
  const violations = evaluateProductionApprovalBindings({
    approval,
    gitHead: "f".repeat(40),
    gitTree: "e".repeat(40),
    policySha256: "d".repeat(64),
    gateEvidenceSha256: "c".repeat(64),
  });
  assert.ok(violations.includes("production_approval_target_commit_mismatch"));
  assert.ok(violations.includes("production_approval_target_tree_mismatch"));
  assert.ok(violations.includes("production_approval_policy_mismatch"));
  assert.ok(violations.includes("production_approval_gate_evidence_mismatch"));
});

test("package approval rejects destructive production business-data deletion", () => {
  const state = productionStateFixture();
  state.activePackage.actionClass = "production_business_data_delete";
  state.approvals[0].actionClass = "production_business_data_delete";
  const violations = validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-01T00:30:00.000Z"),
  });
  assert.ok(violations.includes("package_approval_action_not_allowed"));
  assert.ok(violations.includes("package_approval_action_prohibited"));
});

test("package approval rejects mutation windows longer than 90 minutes", () => {
  const state = productionStateFixture();
  state.approvals[0].expiresAt = "2026-01-01T01:30:01.000Z";
  assert.ok(validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-01T00:30:00.000Z"),
  }).includes("package_approval_window_invalid"));
});

test("package approval rejects stale approvals and missing evidence hashes", () => {
  const state = productionStateFixture();
  state.approvals[0].preflightSha256 = "missing";
  const violations = validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.ok(violations.includes("package_approval_binding_invalid:preflightSha256"));
  assert.ok(violations.includes("package_approval_not_current"));
});

test("package approval fails closed when package assertions are false", () => {
  const state = productionStateFixture();
  state.approvals[0].packageAssertions.knownP0Open = true;
  assert.ok(validatePackageApproval({
    state,
    activePackage: state.activePackage,
    approval: state.approvals[0],
    now: new Date("2026-01-01T00:30:00.000Z"),
  }).includes("package_approval_assertion_failed:knownP0Open"));
});

test("evaluateScope rejects files outside the package allowlist", () => {
  const violations = evaluateScope(stateFixture(), ["src/lib/market/example.ts"]);
  assert.ok(violations.includes("changed_file_outside_allowlist:src/lib/market/example.ts"));
  assert.ok(violations.includes("changed_file_in_prohibited_path:src/lib/market/example.ts"));
});

test("evaluateScope accepts files inside the package allowlist", () => {
  assert.deepEqual(evaluateScope(stateFixture(), ["docs/governance/protocol.md", "package.json"]), []);
});

test("worktree fingerprint is unchanged when identical content moves into the Git index", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "market-radar-autonomy-"));
  try {
    await execFileAsync("git", ["init", "--quiet"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.email", "autonomy-test@example.invalid"], { cwd: repoRoot });
    await execFileAsync("git", ["config", "user.name", "Autonomy Test"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "tracked.txt"), "baseline\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "tracked.txt"), "changed\n", "utf8");

    const beforeStage = await worktreeFingerprint(["tracked.txt"], { repoRoot });
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repoRoot });
    const afterStage = await worktreeFingerprint(["tracked.txt"], { repoRoot });

    assert.equal(afterStage, beforeStage);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("evaluateGateResult accepts matching fresh complete evidence", () => {
  assert.deepEqual(evaluateGateResult({
    result: gateResultFixture([
      { name: "test:autonomy", status: "pass" },
      { name: "typecheck", status: "pass" },
    ]),
    requiredGates: ["test:autonomy", "typecheck"],
    ...GATE_IDENTITY,
    now: new Date("2026-01-01T01:00:00.000Z"),
  }), []);
});

test("evaluateGateResult rejects stale state, worktree, artifact, commit, tree, scripts, and policy evidence", () => {
  const result = gateResultFixture([{ name: "test:autonomy", status: "pass" }]);
  for (const key of Object.keys(GATE_IDENTITY)) result[key] = `old-${key}`;
  const violations = evaluateGateResult({
    result,
    requiredGates: ["test:autonomy"],
    ...GATE_IDENTITY,
    now: new Date("2026-01-01T01:00:00.000Z"),
  });
  assert.ok(violations.includes("gate_result_state_stale"));
  assert.ok(violations.includes("gate_result_worktree_stale"));
  assert.ok(violations.includes("gate_result_artifacts_stale"));
  assert.ok(violations.includes("gate_result_commit_stale"));
  assert.ok(violations.includes("gate_result_tree_stale"));
  assert.ok(violations.includes("gate_result_scripts_stale"));
  assert.ok(violations.includes("gate_result_policy_stale"));
});

test("evaluateGateResult rejects missing gates, formal evidence, and stale timestamps", () => {
  const result = gateResultFixture([
    { name: "test:autonomy", status: "pass" },
    { name: "backtest:formal", status: "pass" },
  ]);
  result.completedAt = "2025-12-31T20:00:00.000Z";
  const violations = evaluateGateResult({
    result,
    requiredGates: ["test:autonomy", "security:check"],
    ...GATE_IDENTITY,
    now: new Date("2026-01-01T01:00:00.000Z"),
  });
  assert.ok(violations.includes("required_gate_not_pass:security:check"));
  assert.ok(violations.includes("formal_backtest_present_in_result"));
  assert.ok(violations.includes("gate_result_not_current"));
});

test("validateState rejects a mutable fake baseline or security gate profile", () => {
  const state = stateFixture();
  state.activePackage.gateProfile.baseline = ["fake:pass"];
  state.activePackage.gateProfile.security = [];
  const violations = validateState(state);
  assert.ok(violations.includes("mandatory_baseline_gate_profile_changed"));
  assert.ok(violations.includes("mandatory_security_gate_profile_changed"));
});

test("production lease enforces WIP=1, fencing, one-time approval, and revocation", async () => {
  const trustRoot = await mkdtemp(join(tmpdir(), "market-radar-autonomy-trust-"));
  try {
    const lease = await acquireProductionLease({
      trustRoot,
      packageId: "WP-TEST",
      approvalId: "approval-1",
      nonce: "nonce-1",
      ownerId: "deployer-1",
      approvalExpiresAt: "2026-01-01T01:30:00.000Z",
      revocationEpoch: 1,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    await assert.rejects(() => acquireProductionLease({
      trustRoot,
      packageId: "WP-OTHER",
      approvalId: "approval-2",
      nonce: "nonce-2",
      ownerId: "deployer-2",
      approvalExpiresAt: "2026-01-01T01:30:00.000Z",
      revocationEpoch: 1,
      now: new Date("2026-01-01T00:10:00.000Z"),
    }), /production_lease_already_held/u);

    assert.deepEqual(await verifyProductionLease({
      trustRoot,
      leaseId: lease.leaseId,
      packageId: lease.packageId,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      fencingToken: lease.fencingToken,
      revocationEpoch: lease.revocationEpoch,
      now: new Date("2026-01-01T00:20:00.000Z"),
    }), []);

    await consumeProductionApproval({
      trustRoot,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      consumedAt: new Date("2026-01-01T00:20:00.000Z"),
    });
    await assert.rejects(() => consumeProductionApproval({
      trustRoot,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
    }), /production_approval_already_consumed/u);

    await advanceRevocationEpoch({
      trustRoot,
      epoch: 2,
      reason: "test revoke",
      now: new Date("2026-01-01T00:25:00.000Z"),
    });
    assert.ok((await verifyProductionLease({
      trustRoot,
      leaseId: lease.leaseId,
      packageId: lease.packageId,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      fencingToken: lease.fencingToken,
      revocationEpoch: lease.revocationEpoch,
      now: new Date("2026-01-01T00:30:00.000Z"),
    })).includes("production_lease_revoked"));
  } finally {
    await rm(trustRoot, { recursive: true, force: true });
  }
});

test("released production lease permits only a newer fencing token", async () => {
  const trustRoot = await mkdtemp(join(tmpdir(), "market-radar-autonomy-trust-"));
  try {
    const first = await acquireProductionLease({
      trustRoot,
      packageId: "WP-ONE",
      approvalId: "approval-one",
      nonce: "nonce-one",
      ownerId: "deployer",
      approvalExpiresAt: "2026-01-01T01:00:00.000Z",
      revocationEpoch: 1,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    await releaseProductionLease({
      trustRoot,
      leaseId: first.leaseId,
      packageId: first.packageId,
      approvalId: first.approvalId,
      nonce: first.nonce,
      fencingToken: first.fencingToken,
      revocationEpoch: first.revocationEpoch,
      outcome: "PASS",
      now: new Date("2026-01-01T00:10:00.000Z"),
    });
    const second = await acquireProductionLease({
      trustRoot,
      packageId: "WP-TWO",
      approvalId: "approval-two",
      nonce: "nonce-two",
      ownerId: "deployer",
      approvalExpiresAt: "2026-01-01T02:00:00.000Z",
      revocationEpoch: 1,
      now: new Date("2026-01-01T01:00:00.000Z"),
    });
    assert.ok(second.fencingToken > first.fencingToken);
  } finally {
    await rm(trustRoot, { recursive: true, force: true });
  }
});

test("production lease rejects traversal identities and permits expired rollback closeout only", async () => {
  const trustRoot = await mkdtemp(join(tmpdir(), "market-radar-autonomy-trust-"));
  try {
    await assert.rejects(() => acquireProductionLease({
      trustRoot,
      packageId: "WP-TEST",
      approvalId: "../escape",
      nonce: "nonce-safe",
      ownerId: "deployer",
      approvalExpiresAt: "2026-01-01T02:00:00.000Z",
      revocationEpoch: 1,
      now: new Date("2026-01-01T00:00:00.000Z"),
    }), /lease_identity_unsafe/u);

    const lease = await acquireProductionLease({
      trustRoot,
      packageId: "WP-TEST",
      approvalId: "approval-expiry",
      nonce: "nonce-expiry",
      ownerId: "deployer",
      approvalExpiresAt: "2026-01-01T02:00:00.000Z",
      revocationEpoch: 1,
      ttlSeconds: 60,
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    await assert.rejects(() => releaseProductionLease({
      trustRoot,
      leaseId: lease.leaseId,
      packageId: lease.packageId,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      fencingToken: lease.fencingToken,
      revocationEpoch: lease.revocationEpoch,
      outcome: "PASS",
      now: new Date("2026-01-01T00:02:00.000Z"),
    }), /production_lease_expired/u);
    const released = await releaseProductionLease({
      trustRoot,
      leaseId: lease.leaseId,
      packageId: lease.packageId,
      approvalId: lease.approvalId,
      nonce: lease.nonce,
      fencingToken: lease.fencingToken,
      revocationEpoch: lease.revocationEpoch,
      outcome: "ROLLBACK_PASS",
      now: new Date("2026-01-01T00:02:00.000Z"),
    });
    assert.equal(released.outcome, "ROLLBACK_PASS");
  } finally {
    await rm(trustRoot, { recursive: true, force: true });
  }
});
