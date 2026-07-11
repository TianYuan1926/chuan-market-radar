import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  evaluateGateResult,
  evaluateScope,
  pathMatches,
  validateState,
  worktreeFingerprint,
} from "./autonomous-engineering.mjs";

const execFileAsync = promisify(execFile);

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
    },
    activePackage: {
      id: "WP-TEST",
      lane: "localPreparation",
      status: "in_progress",
      productionMutation: false,
      requiresExplicitApproval: false,
      allowedPaths: ["docs/governance/**", "package.json"],
      prohibitedPaths: ["src/**", "migrations/**"],
      requiredArtifacts: ["package.json"],
      gateProfile: {
        targeted: ["test:autonomy"],
        baseline: ["typecheck"],
        security: ["security:check"],
      },
    },
    approvals: [],
    queue: [
      {
        order: 1,
        id: "WP-TEST",
        lane: "localPreparation",
        status: "in_progress",
        requiresExplicitApproval: false,
      },
    ],
  };
}

test("pathMatches supports exact paths and directory allowlists", () => {
  assert.equal(pathMatches("package.json", "package.json"), true);
  assert.equal(pathMatches("docs/governance/**", "docs/governance/protocol.md"), true);
  assert.equal(pathMatches("docs/governance/**", "docs/other.md"), false);
});

test("validateState accepts the locked local preparation fixture", () => {
  assert.deepEqual(validateState(stateFixture()), []);
});

test("validateState rejects a lower structural RR lock", () => {
  const state = stateFixture();
  state.hardLocks.minimumStructuralRR = 2;
  assert.ok(validateState(state).includes("hard_lock_changed:minimumStructuralRR"));
});

test("validateState rejects automatic trading", () => {
  const state = stateFixture();
  state.hardLocks.automaticTrading = true;
  assert.ok(validateState(state).includes("hard_lock_changed:automaticTrading"));
});

test("validateState rejects automatic formal backtest execution", () => {
  const state = stateFixture();
  state.activePackage.gateProfile.targeted.push("backtest:formal");
  assert.ok(validateState(state).includes("formal_backtest_auto_run_forbidden"));
});

test("validateState rejects changed truth labels", () => {
  const state = stateFixture();
  state.truthLabels[0] = "基本完成";
  assert.ok(validateState(state).includes("truth_labels_changed"));
});

test("validateState enforces one active local package", () => {
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

test("validateState rejects production work without explicit approval", () => {
  const state = stateFixture();
  state.activePackage.lane = "production";
  state.activePackage.productionMutation = true;
  state.activePackage.requiresExplicitApproval = true;
  state.queue[0].lane = "production";
  assert.ok(validateState(state).includes("production_approval_missing"));
});

test("validateState rejects expired production approval", () => {
  const state = stateFixture();
  state.activePackage.lane = "production";
  state.activePackage.productionMutation = true;
  state.activePackage.requiresExplicitApproval = true;
  state.queue[0].lane = "production";
  state.approvals = [{
    packageId: "WP-TEST",
    scope: "WP-TEST",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
  }];
  assert.ok(validateState(state, { now: new Date("2026-01-02T00:00:00.000Z") })
    .includes("production_approval_not_current"));
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
  const violations = evaluateGateResult({
    result: {
      schemaVersion: "market-radar-autonomous-gate-result.v1",
      status: "pass",
      stateHash: "state",
      worktreeFingerprint: "tree",
      gates: [
        { name: "test:autonomy", status: "pass" },
        { name: "typecheck", status: "pass" },
      ],
    },
    requiredGates: ["test:autonomy", "typecheck"],
    stateHash: "state",
    worktreeFingerprint: "tree",
  });
  assert.deepEqual(violations, []);
});

test("evaluateGateResult rejects stale state and worktree evidence", () => {
  const violations = evaluateGateResult({
    result: {
      schemaVersion: "market-radar-autonomous-gate-result.v1",
      status: "pass",
      stateHash: "old-state",
      worktreeFingerprint: "old-tree",
      gates: [{ name: "test:autonomy", status: "pass" }],
    },
    requiredGates: ["test:autonomy"],
    stateHash: "new-state",
    worktreeFingerprint: "new-tree",
  });
  assert.ok(violations.includes("gate_result_state_stale"));
  assert.ok(violations.includes("gate_result_worktree_stale"));
});

test("evaluateGateResult rejects a missing required gate", () => {
  const violations = evaluateGateResult({
    result: {
      schemaVersion: "market-radar-autonomous-gate-result.v1",
      status: "pass",
      stateHash: "state",
      worktreeFingerprint: "tree",
      gates: [{ name: "test:autonomy", status: "pass" }],
    },
    requiredGates: ["test:autonomy", "security:check"],
    stateHash: "state",
    worktreeFingerprint: "tree",
  });
  assert.ok(violations.includes("required_gate_not_pass:security:check"));
});

test("evaluateGateResult rejects formal backtest evidence even when marked pass", () => {
  const violations = evaluateGateResult({
    result: {
      schemaVersion: "market-radar-autonomous-gate-result.v1",
      status: "pass",
      stateHash: "state",
      worktreeFingerprint: "tree",
      gates: [{ name: "backtest:formal", status: "pass" }],
    },
    requiredGates: [],
    stateHash: "state",
    worktreeFingerprint: "tree",
  });
  assert.ok(violations.includes("formal_backtest_present_in_result"));
});
