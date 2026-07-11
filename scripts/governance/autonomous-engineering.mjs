#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const STATE_PATH = resolve(REPO_ROOT, "AUTONOMOUS_ENGINEERING_STATE.json");
const RESULT_PATH = resolve(REPO_ROOT, ".autonomy/latest-gate-result.json");
const STATE_SCHEMA = "market-radar-autonomous-engineering-state.v1";
const RESULT_SCHEMA = "market-radar-autonomous-gate-result.v1";
const REQUIRED_TRUTH_LABELS = [
  "完整完成",
  "可运行但不完整",
  "临时验证版",
  "等待外部条件",
  "不能支撑实战",
];
const REQUIRED_HARD_LOCKS = {
  minimumStructuralRR: 3,
  automaticTrading: false,
  exchangeOrderApi: false,
  automaticRankingMutation: false,
  futureOutcomeAsProductionInput: false,
  frontendCreatesTradePlan: false,
  formalBacktestAutoRun: false,
  productionAutoApproval: false,
};
const ALLOWED_PACKAGE_STATUSES = new Set([
  "in_progress",
  "ready_for_gate",
  "blocked",
  "completed",
]);
const ACTIVE_QUEUE_STATUSES = new Set(["in_progress", "ready_for_gate"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

function normalizedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.includes("..")) {
    throw new Error(`unsafe_path:${String(value)}`);
  }
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function pathMatches(pattern, filePath) {
  const safePattern = normalizedPath(pattern);
  const safePath = normalizedPath(filePath);
  if (safePattern.endsWith("/**")) {
    const prefix = safePattern.slice(0, -3).replace(/\/$/, "");
    return safePath === prefix || safePath.startsWith(`${prefix}/`);
  }
  return safePath === safePattern;
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function validateState(state, { now = new Date() } = {}) {
  const violations = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return ["state_not_object"];
  }
  if (state.schemaVersion !== STATE_SCHEMA) violations.push("state_schema_version_invalid");
  if (state.mode !== "active_fail_closed") violations.push("automation_mode_not_fail_closed");
  if (!exactArray(state.truthLabels, REQUIRED_TRUTH_LABELS)) violations.push("truth_labels_changed");

  for (const [key, expected] of Object.entries(REQUIRED_HARD_LOCKS)) {
    if (state.hardLocks?.[key] !== expected) violations.push(`hard_lock_changed:${key}`);
  }

  if (state.wipLimits?.production !== 1) violations.push("production_wip_limit_changed");
  if (state.wipLimits?.localPreparation !== 1) violations.push("local_wip_limit_changed");

  const activePackage = state.activePackage;
  if (!activePackage || typeof activePackage !== "object") {
    violations.push("active_package_missing");
    return violations;
  }
  if (!ALLOWED_PACKAGE_STATUSES.has(activePackage.status)) violations.push("active_package_status_invalid");
  if (!["production", "localPreparation"].includes(activePackage.lane)) violations.push("active_package_lane_invalid");
  if (!Array.isArray(activePackage.allowedPaths) || activePackage.allowedPaths.length === 0) {
    violations.push("active_package_allowlist_missing");
  }
  if (!Array.isArray(activePackage.prohibitedPaths)) violations.push("active_package_prohibited_paths_missing");
  if (!Array.isArray(activePackage.requiredArtifacts) || activePackage.requiredArtifacts.length === 0) {
    violations.push("required_artifacts_missing");
  }

  const gateNames = [
    ...(activePackage.gateProfile?.targeted ?? []),
    ...(activePackage.gateProfile?.baseline ?? []),
    ...(activePackage.gateProfile?.security ?? []),
  ];
  if (gateNames.length === 0 || unique(gateNames).length !== gateNames.length) {
    violations.push("gate_profile_empty_or_duplicate");
  }
  if (gateNames.includes("backtest:formal")) violations.push("formal_backtest_auto_run_forbidden");

  const queue = Array.isArray(state.queue) ? state.queue : [];
  const queueIds = queue.map((item) => item?.id);
  if (queue.length === 0 || unique(queueIds).length !== queueIds.length) violations.push("queue_missing_or_duplicate");
  const activeQueueItem = queue.find((item) => item?.id === activePackage.id);
  if (!activeQueueItem || activeQueueItem.status !== activePackage.status) {
    violations.push("active_package_queue_mismatch");
  }
  for (const lane of ["production", "localPreparation"]) {
    const count = queue.filter((item) => item?.lane === lane && ACTIVE_QUEUE_STATUSES.has(item?.status)).length;
    const limit = state.wipLimits?.[lane];
    if (Number.isFinite(limit) && count > limit) violations.push(`wip_limit_exceeded:${lane}`);
  }

  if (activePackage.productionMutation || activePackage.lane === "production") {
    const approval = state.approvals?.find((item) => item?.packageId === activePackage.id);
    if (!activePackage.requiresExplicitApproval || !approval) {
      violations.push("production_approval_missing");
    } else {
      const expiresAt = new Date(approval.expiresAt);
      const issuedAt = new Date(approval.issuedAt);
      if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(issuedAt.getTime())) {
        violations.push("production_approval_timestamp_invalid");
      } else if (now < issuedAt || now > expiresAt) {
        violations.push("production_approval_not_current");
      }
      if (approval.scope !== activePackage.id) violations.push("production_approval_scope_mismatch");
    }
  }

  return unique(violations);
}

export function evaluateScope(state, changedFiles, options = {}) {
  const violations = [...validateState(state, options)];
  const activePackage = state?.activePackage ?? {};
  const allowedPaths = activePackage.allowedPaths ?? [];
  const prohibitedPaths = activePackage.prohibitedPaths ?? [];
  for (const rawPath of changedFiles) {
    let filePath;
    try {
      filePath = normalizedPath(rawPath);
    } catch (error) {
      violations.push(error.message);
      continue;
    }
    if (!allowedPaths.some((pattern) => pathMatches(pattern, filePath))) {
      violations.push(`changed_file_outside_allowlist:${filePath}`);
    }
    if (prohibitedPaths.some((pattern) => pathMatches(pattern, filePath))) {
      violations.push(`changed_file_in_prohibited_path:${filePath}`);
    }
  }
  return unique(violations);
}

export function evaluateGateResult({
  result,
  requiredGates,
  stateHash,
  worktreeFingerprint,
}) {
  const violations = [];
  if (!result || result.schemaVersion !== RESULT_SCHEMA) return ["gate_result_missing_or_invalid"];
  if (result.status !== "pass") violations.push("gate_result_not_pass");
  if (result.stateHash !== stateHash) violations.push("gate_result_state_stale");
  if (result.worktreeFingerprint !== worktreeFingerprint) violations.push("gate_result_worktree_stale");
  const byName = new Map((result.gates ?? []).map((gate) => [gate.name, gate]));
  for (const gateName of requiredGates) {
    if (byName.get(gateName)?.status !== "pass") violations.push(`required_gate_not_pass:${gateName}`);
  }
  if ((result.gates ?? []).some((gate) => gate.name === "backtest:formal")) {
    violations.push("formal_backtest_present_in_result");
  }
  return unique(violations);
}

async function git(args, { encoding = "utf8" } = {}) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: REPO_ROOT,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function changedFiles() {
  const tracked = (await git(["diff", "--name-only", "-z", "HEAD", "--"])).split("\0").filter(Boolean);
  const untracked = (await git(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
  return unique([...tracked, ...untracked]).sort();
}

export async function worktreeFingerprint(files, { repoRoot = REPO_ROOT } = {}) {
  const hash = createHash("sha256");
  for (const filePath of files) {
    hash.update(`\0${filePath}\0`);
    try {
      const absolutePath = resolve(repoRoot, filePath);
      const fileStat = await lstat(absolutePath);
      hash.update(`mode:${fileStat.mode & 0o111};type:${fileStat.isSymbolicLink() ? "symlink" : "file"};`);
      if (fileStat.isSymbolicLink()) {
        hash.update(await readlink(absolutePath));
      } else {
        hash.update(await readFile(absolutePath));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
  }
  return hash.digest("hex");
}

async function readState() {
  const raw = await readFile(STATE_PATH, "utf8");
  return { raw, state: JSON.parse(raw), stateHash: sha256(raw) };
}

async function missingArtifacts(state) {
  const missing = [];
  for (const filePath of state.activePackage.requiredArtifacts ?? []) {
    try {
      await access(resolve(REPO_ROOT, normalizedPath(filePath)), fsConstants.R_OK);
    } catch {
      missing.push(filePath);
    }
  }
  return missing;
}

async function inspect() {
  const { raw, state, stateHash } = await readState();
  const files = await changedFiles();
  const scopeViolations = evaluateScope(state, files);
  const artifactsMissing = await missingArtifacts(state);
  const fingerprint = await worktreeFingerprint(files);
  const violations = unique([
    ...scopeViolations,
    ...artifactsMissing.map((filePath) => `required_artifact_missing:${filePath}`),
  ]);
  return {
    activePackage: state.activePackage.id,
    activePackageStatus: state.activePackage.status,
    changedFiles: files,
    mode: state.mode,
    state,
    stateHash,
    stateRawBytes: Buffer.byteLength(raw),
    status: violations.length === 0 ? "pass" : "fail",
    violations,
    worktreeFingerprint: fingerprint,
  };
}

function requiredGates(state) {
  return [
    ...(state.activePackage.gateProfile?.targeted ?? []),
    ...(state.activePackage.gateProfile?.security ?? []),
    ...(state.activePackage.gateProfile?.baseline ?? []),
  ];
}

async function packageScripts() {
  const packageJson = JSON.parse(await readFile(resolve(REPO_ROOT, "package.json"), "utf8"));
  return packageJson.scripts ?? {};
}

async function runNpmGate(name) {
  const startedAt = new Date();
  const outputHash = createHash("sha256");
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn("npm", ["run", name], { cwd: REPO_ROOT, env: process.env });
    child.stdout.on("data", (chunk) => {
      outputHash.update(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      outputHash.update(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", resolveExit);
  });
  return {
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode,
    name,
    outputSha256: outputHash.digest("hex"),
    startedAt: startedAt.toISOString(),
    status: exitCode === 0 ? "pass" : "fail",
  };
}

async function writeResult(value) {
  await mkdir(resolve(REPO_ROOT, ".autonomy"), { recursive: true, mode: 0o700 });
  await writeFile(RESULT_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function runGates() {
  const before = await inspect();
  if (before.status !== "pass") {
    throw new Error(`scope_or_state_blocked:${before.violations.join(",")}`);
  }
  const scripts = await packageScripts();
  const gates = requiredGates(before.state);
  const missingScripts = gates.filter((name) => !scripts[name]);
  if (missingScripts.length > 0) throw new Error(`gate_scripts_missing:${missingScripts.join(",")}`);
  if (gates.includes("backtest:formal")) throw new Error("formal_backtest_auto_run_forbidden");

  const gateResults = [];
  for (const gateName of gates) {
    const gateResult = await runNpmGate(gateName);
    gateResults.push(gateResult);
    if (gateResult.status !== "pass") break;
  }

  const after = await inspect();
  const worktreeUnchanged = before.worktreeFingerprint === after.worktreeFingerprint;
  const allPassed = gateResults.length === gates.length && gateResults.every((gate) => gate.status === "pass");
  const result = {
    schemaVersion: RESULT_SCHEMA,
    activePackage: before.activePackage,
    completedAt: new Date().toISOString(),
    gates: gateResults,
    requiredGates: gates,
    stateHash: before.stateHash,
    status: allPassed && worktreeUnchanged && after.status === "pass" ? "pass" : "fail",
    worktreeFingerprint: before.worktreeFingerprint,
    worktreeUnchanged,
    postGateViolations: after.violations,
  };
  await writeResult(result);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    activePackage: result.activePackage,
    gatesPassed: gateResults.filter((gate) => gate.status === "pass").length,
    gatesRequired: gates.length,
    worktreeUnchanged,
  })}\n`);
  if (result.status !== "pass") process.exitCode = 2;
}

async function verify() {
  const current = await inspect();
  let result;
  try {
    result = JSON.parse(await readFile(RESULT_PATH, "utf8"));
  } catch {
    result = null;
  }
  const gateViolations = evaluateGateResult({
    result,
    requiredGates: requiredGates(current.state),
    stateHash: current.stateHash,
    worktreeFingerprint: current.worktreeFingerprint,
  });
  const violations = unique([...current.violations, ...gateViolations]);
  const canAutoCommit = violations.length === 0 && current.state.activePackage.status === "ready_for_gate";
  const response = {
    activePackage: current.activePackage,
    canAutoCommit,
    canAutoDeploy: canAutoCommit
      && current.state.activePackage.lane === "production"
      && current.state.activePackage.requiresExplicitApproval === true,
    status: violations.length === 0 ? "pass" : "fail",
    truthLabel: violations.length === 0 ? "可运行但不完整" : "不能支撑实战",
    violations,
  };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (response.status !== "pass") process.exitCode = 2;
}

async function status() {
  const current = await inspect();
  process.stdout.write(`${JSON.stringify({
    activePackage: current.activePackage,
    activePackageStatus: current.activePackageStatus,
    changedFiles: current.changedFiles,
    mode: current.mode,
    status: current.status,
    truthLabel: current.status === "pass" ? "可运行但不完整" : "不能支撑实战",
    violations: current.violations,
  }, null, 2)}\n`);
  if (current.status !== "pass") process.exitCode = 2;
}

async function main() {
  const command = process.argv[2] ?? "status";
  if (command === "status") return status();
  if (command === "run-gates") return runGates();
  if (command === "verify") return verify();
  throw new Error(`unsupported_command:${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
