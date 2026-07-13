#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  ACTION_RISK_TIERS,
  ALLOWED_ACTION_CLASSES,
  PACKAGE_APPROVAL_MAX_MINUTES,
  PROHIBITED_ACTION_CLASSES,
  AUTONOMOUS_SCOPE_GATES,
  STANDING_AUTHORIZATION_SCHEMA,
  MANDATORY_BASELINE_GATES,
  MANDATORY_SECURITY_GATES,
  REQUIRED_PACKAGE_APPROVAL_FIELDS,
} from "./autonomy-policy.mjs";
const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const STATE_PATH = resolve(REPO_ROOT, "AUTONOMOUS_ENGINEERING_STATE.json");
const RESULT_PATH = resolve(REPO_ROOT, ".autonomy/latest-gate-result.json");
const RESULT_DIR = resolve(REPO_ROOT, ".autonomy/gate-results");
const STATE_SCHEMA = "market-radar-autonomous-engineering-state.v1";
const RESULT_SCHEMA = "market-radar-autonomous-gate-result.v1";
const POLICY_PATH = resolve(REPO_ROOT, "scripts/governance/autonomy-policy.mjs");
const REQUIRED_TRUTH_LABELS = [
  "完整完成",
  "可运行但不完整",
  "临时验证版",
  "等待外部条件",
  "不能支撑实战",
];
const REQUIRED_MISSION = "快速对全市场覆盖性扫描，发现机会，给出策略，自我提升。";
const REQUIRED_CORE_CHAIN = [
  "全市场发现",
  "候选筛选",
  "深扫验证",
  "结构分析",
  "风险赔率",
  "交易计划",
  "复盘进化",
];
const REQUIRED_EVIDENCE_WINDOWS = [
  "G0 HTTPS TLS burn-in 7 days",
  "G1 initial SLO 7 days",
  "G2 data and tier SLA 14 days",
  "G4 at least 60 triggers and two frozen holdouts",
  "G5 real Shadow at least 60 days",
  "G7 paper workflow at least 30 days",
  "G8 governance horizon 180 days",
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
  g0G8StandingUserAuthorization: true,
  builderMayLowerQuality: false,
  destructiveProductionMutationAutoApproval: false,
  standingAuthorizationBeyondG8: false,
  exactPollutionCleanupRequired: true,
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

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export function validateStandingAuthorization(authority) {
  const violations = [];
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    return ["standing_authorization_missing"];
  }
  if (authority.schemaVersion !== STANDING_AUTHORIZATION_SCHEMA) {
    violations.push("standing_authorization_schema_invalid");
  }
  if (!nonEmptyString(authority.grantId)) violations.push("standing_authorization_grant_id_missing");
  if (!new Set(["active", "revoked", "completed_g8"]).has(authority.status)) {
    violations.push("standing_authorization_status_invalid");
  }
  if (authority.grantedBy !== "user") violations.push("standing_authorization_grantor_invalid");
  if (!Number.isFinite(new Date(authority.issuedAt).getTime())) {
    violations.push("standing_authorization_issued_at_invalid");
  }
  if (!Number.isSafeInteger(authority.revocationEpoch) || authority.revocationEpoch < 0) {
    violations.push("standing_authorization_revocation_epoch_invalid");
  }
  if (!exactArray(authority.scopeGates, AUTONOMOUS_SCOPE_GATES)) {
    violations.push("standing_authorization_scope_changed");
  }
  if (authority.terminatesOn !== "G8_EXIT_PASS_OR_USER_REVOCATION") {
    violations.push("standing_authorization_termination_changed");
  }
  if (authority.contractPath !== "docs/governance/G0_G8_STANDING_AUTONOMY_AUTHORIZATION_V1.json") {
    violations.push("standing_authorization_contract_path_changed");
  }
  if (!nonEmptyString(authority.builderAgentId)) violations.push("standing_authorization_builder_missing");
  if (authority.trustRootEnv !== "MARKET_RADAR_AUTONOMY_TRUST_ROOT") {
    violations.push("standing_authorization_trust_root_env_changed");
  }
  if (authority.externalTrustRequiredForProduction !== true) {
    violations.push("standing_authorization_external_trust_disabled");
  }
  if (authority.perPackageApprovalMaxMinutes !== PACKAGE_APPROVAL_MAX_MINUTES) {
    violations.push("standing_authorization_approval_window_changed");
  }
  if (authority.productionWipLimit !== 1) violations.push("standing_authorization_production_wip_changed");
  if (authority.localPreparationWipLimit !== 1) violations.push("standing_authorization_local_wip_changed");
  if (!exactArray(authority.allowedActionClasses, ALLOWED_ACTION_CLASSES)) {
    violations.push("standing_authorization_allowed_actions_changed");
  }
  if (!exactArray(authority.prohibitedActionClasses, PROHIBITED_ACTION_CLASSES)) {
    violations.push("standing_authorization_prohibited_actions_changed");
  }
  return unique(violations);
}

export function validatePackageApproval({ state, activePackage, approval, now = new Date() }) {
  const violations = [];
  const authority = state?.g0G8StandingAuthorization;
  violations.push(...validateStandingAuthorization(authority));
  if (authority?.status !== "active") violations.push("standing_authorization_not_active");
  if (approval?.mode !== "g0_g8_standing_user_grant") violations.push("package_approval_mode_invalid");
  if (approval?.approvedBy !== "user_standing_grant") {
    violations.push("package_approval_issuer_invalid");
  }
  if (approval?.grantId !== authority?.grantId) violations.push("package_approval_grant_mismatch");
  if (approval?.packageId !== activePackage?.id || approval?.scope !== activePackage?.id) {
    violations.push("package_approval_package_mismatch");
  }
  if (!AUTONOMOUS_SCOPE_GATES.includes(activePackage?.gate) || approval?.gate !== activePackage?.gate) {
    violations.push("package_approval_gate_mismatch");
  }
  if (!ALLOWED_ACTION_CLASSES.includes(activePackage?.actionClass)
      || approval?.actionClass !== activePackage?.actionClass) {
    violations.push("package_approval_action_not_allowed");
  }
  if (PROHIBITED_ACTION_CLASSES.includes(approval?.actionClass)) {
    violations.push("package_approval_action_prohibited");
  }
  if (approval?.riskTier !== ACTION_RISK_TIERS[approval?.actionClass]) {
    violations.push("package_approval_risk_tier_mismatch");
  }
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    if (approval?.[key] === undefined || approval?.[key] === null || approval?.[key] === "") {
      violations.push(`package_approval_required_field_missing:${key}`);
    }
  }
  if (approval?.builderAgentId !== authority?.builderAgentId) {
    violations.push("package_approval_builder_mismatch");
  }
  for (const [key, expected] of Object.entries({
    qualityThresholdChanged: false,
    scopeMatchesBlueprint: true,
    dynamicPreflightCurrent: true,
    requiredGatesPassed: true,
    rollbackVerified: true,
    productionWipAvailable: true,
    secretsPresentInEvidence: false,
    knownP0Open: false,
    pollutionCleanupManifestExact: true,
  })) {
    if (approval?.packageAssertions?.[key] !== expected) {
      violations.push(`package_approval_assertion_failed:${key}`);
    }
  }
  for (const key of ["baseCommit", "targetCommit", "targetTree"]) {
    if (!/^[a-f0-9]{40}$/u.test(approval?.[key] ?? "")) {
      violations.push(`package_approval_git_binding_invalid:${key}`);
    }
  }
  for (const key of [
    "diffSha256",
    "pathSetSha256",
    "contractSha256",
    "runnerSha256",
    "artifactSha256",
    "imageOrMigrationSha256",
    "composeSha256",
    "environmentFingerprintSha256",
    "productionIdentitySha256",
    "gateEvidenceSha256",
    "preflightSha256",
    "backupRestoreEvidenceSha256",
    "observationContractSha256",
    "policySha256",
  ]) {
    if (!isSha256(approval?.[key])) violations.push(`package_approval_binding_invalid:${key}`);
  }
  if (!nonEmptyString(approval?.rollbackTarget)) {
    violations.push("package_approval_rollback_target_missing");
  }
  if (!nonEmptyString(approval?.approvalId) || !nonEmptyString(approval?.nonce)) {
    violations.push("package_approval_identity_missing");
  }
  if (approval?.maxExecutions !== 1) violations.push("package_approval_execution_count_invalid");
  if (approval?.productionLeaseId !== undefined || approval?.fencingToken !== undefined) {
    violations.push("package_approval_embeds_runtime_lease_identity");
  }
  if (!Number.isSafeInteger(approval?.revocationEpoch) || approval.revocationEpoch < 0) {
    violations.push("package_approval_revocation_epoch_invalid");
  } else if (approval.revocationEpoch !== authority?.revocationEpoch) {
    violations.push("package_approval_revocation_epoch_mismatch");
  }
  const issuedAt = new Date(approval?.issuedAt);
  const expiresAt = new Date(approval?.expiresAt);
  if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    violations.push("package_approval_timestamp_invalid");
  } else {
    const durationMs = expiresAt.getTime() - issuedAt.getTime();
    if (durationMs <= 0 || durationMs > PACKAGE_APPROVAL_MAX_MINUTES * 60_000) {
      violations.push("package_approval_window_invalid");
    }
    if (now < issuedAt || now > expiresAt) violations.push("package_approval_not_current");
  }
  return unique(violations);
}

export function evaluateProductionApprovalBindings({
  approval,
  gitHead,
  gitTree,
  policySha256,
  gateEvidenceSha256,
}) {
  if (!approval) return ["production_approval_missing"];
  const violations = [];
  if (approval.mode !== "g0_g8_standing_user_grant") {
    violations.push("production_approval_mode_invalid");
  }
  if (approval.targetCommit !== gitHead) violations.push("production_approval_target_commit_mismatch");
  if (approval.targetTree !== gitTree) violations.push("production_approval_target_tree_mismatch");
  if (approval.policySha256 !== policySha256) violations.push("production_approval_policy_mismatch");
  if (gateEvidenceSha256 !== undefined && approval.gateEvidenceSha256 !== gateEvidenceSha256) {
    violations.push("production_approval_gate_evidence_mismatch");
  }
  return unique(violations);
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

  violations.push(...validateStandingAuthorization(state.g0G8StandingAuthorization));

  if (state.wipLimits?.production !== 1) violations.push("production_wip_limit_changed");
  if (state.wipLimits?.localPreparation !== 1) violations.push("local_wip_limit_changed");

  const activePackage = state.activePackage;
  if (!activePackage || typeof activePackage !== "object") {
    violations.push("active_package_missing");
    return violations;
  }
  if (!ALLOWED_PACKAGE_STATUSES.has(activePackage.status)) violations.push("active_package_status_invalid");
  if (!["production", "localPreparation"].includes(activePackage.lane)) violations.push("active_package_lane_invalid");
  if (!AUTONOMOUS_SCOPE_GATES.includes(activePackage.gate)) violations.push("active_package_gate_invalid");
  if (!ALLOWED_ACTION_CLASSES.includes(activePackage.actionClass)) {
    violations.push("active_package_action_class_invalid");
  }
  if (activePackage.missionAlignment?.mission !== REQUIRED_MISSION
      || !["core", "supporting"].includes(activePackage.missionAlignment?.contributionType)
      || !Array.isArray(activePackage.missionAlignment?.coreChainStages)
      || activePackage.missionAlignment.coreChainStages.length === 0
      || activePackage.missionAlignment.coreChainStages.some(
        (stage) => !REQUIRED_CORE_CHAIN.includes(stage),
      )
      || !nonEmptyString(activePackage.missionAlignment?.measurableOutcome)) {
    violations.push("active_package_mission_alignment_invalid");
  }
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
  if (!Array.isArray(activePackage.gateProfile?.targeted)
      || activePackage.gateProfile.targeted.length === 0) {
    violations.push("targeted_gate_profile_missing");
  }
  if (!exactArray(activePackage.gateProfile?.baseline, MANDATORY_BASELINE_GATES)) {
    violations.push("mandatory_baseline_gate_profile_changed");
  }
  if (!exactArray(activePackage.gateProfile?.security, MANDATORY_SECURITY_GATES)) {
    violations.push("mandatory_security_gate_profile_changed");
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
    if (!activePackage.requiresExplicitApproval) {
      violations.push("production_explicit_approval_boundary_disabled");
    } else if (approval?.mode === "g0_g8_standing_user_grant") {
      violations.push("standing_authorization_approval_must_be_external");
    } else if (approval) {
      const expiresAt = new Date(approval.expiresAt);
      const issuedAt = new Date(approval.issuedAt);
      if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(issuedAt.getTime())) {
        violations.push("production_approval_timestamp_invalid");
      } else if (now < issuedAt || now > expiresAt) {
        violations.push("production_approval_not_current");
      }
      if (approval.scope !== activePackage.id) violations.push("production_approval_scope_mismatch");
      if (approval.approvedBy !== "user") violations.push("production_approval_issuer_invalid");
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
  requiredArtifactFingerprint,
  gitHead,
  gitTree,
  packageScriptsSha256,
  policySha256,
  now = new Date(),
}) {
  const violations = [];
  if (!result || result.schemaVersion !== RESULT_SCHEMA) return ["gate_result_missing_or_invalid"];
  if (result.status !== "pass") violations.push("gate_result_not_pass");
  if (result.stateHash !== stateHash) violations.push("gate_result_state_stale");
  if (result.worktreeFingerprint !== worktreeFingerprint) violations.push("gate_result_worktree_stale");
  if (result.requiredArtifactFingerprint !== requiredArtifactFingerprint) {
    violations.push("gate_result_artifacts_stale");
  }
  if (result.gitHead !== gitHead) violations.push("gate_result_commit_stale");
  if (result.gitTree !== gitTree) violations.push("gate_result_tree_stale");
  if (result.packageScriptsSha256 !== packageScriptsSha256) violations.push("gate_result_scripts_stale");
  if (result.policySha256 !== policySha256) violations.push("gate_result_policy_stale");
  const completedAt = new Date(result.completedAt);
  if (!Number.isFinite(completedAt.getTime())) {
    violations.push("gate_result_timestamp_invalid");
  } else if (completedAt > now || now.getTime() - completedAt.getTime() > 2 * 60 * 60 * 1000) {
    violations.push("gate_result_not_current");
  }
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

async function gitIdentity() {
  const [head, tree] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "HEAD^{tree}"]),
  ]);
  return { gitHead: head.trim(), gitTree: tree.trim() };
}

async function standingContractViolations(state) {
  const violations = [];
  const authority = state?.g0G8StandingAuthorization;
  let contract;
  try {
    const contractPath = resolve(REPO_ROOT, normalizedPath(authority?.contractPath));
    contract = JSON.parse(await readFile(contractPath, "utf8"));
  } catch {
    return ["standing_authorization_contract_missing_or_invalid"];
  }
  if (contract.schemaVersion !== STANDING_AUTHORIZATION_SCHEMA) {
    violations.push("standing_authorization_contract_schema_mismatch");
  }
  if (contract.grantId !== authority?.grantId) violations.push("standing_authorization_contract_grant_mismatch");
  if (contract.status !== authority?.status) violations.push("standing_authorization_contract_status_mismatch");
  if (contract.grantedBy !== authority?.grantedBy) violations.push("standing_authorization_contract_grantor_mismatch");
  if (contract.issuedAt !== authority?.issuedAt) violations.push("standing_authorization_contract_time_mismatch");
  if (contract.revocation?.epoch !== authority?.revocationEpoch) {
    violations.push("standing_authorization_contract_revocation_mismatch");
  }
  if (!exactArray(contract.scope?.gates, AUTONOMOUS_SCOPE_GATES)) {
    violations.push("standing_authorization_contract_scope_mismatch");
  }
  if (contract.scope?.terminatesOn !== authority?.terminatesOn) {
    violations.push("standing_authorization_contract_termination_mismatch");
  }
  if (contract.scope?.productionWipLimit !== 1 || contract.scope?.localPreparationWipLimit !== 1) {
    violations.push("standing_authorization_contract_wip_mismatch");
  }
  if (contract.scope?.perPackageApprovalMaxMinutes !== PACKAGE_APPROVAL_MAX_MINUTES) {
    violations.push("standing_authorization_contract_window_mismatch");
  }
  if (contract.authorityBoundary?.builderAgentId !== authority?.builderAgentId
      || contract.authorityBoundary?.authorizationSource
        !== "direct_user_standing_grant_in_current_thread"
      || contract.authorityBoundary?.builderMayMaterializeExactPackageApproval !== true
      || contract.authorityBoundary?.builderMayExpandBeyondG8 !== false
      || contract.authorityBoundary?.builderMayChangeQualityThresholds !== false
      || contract.authorityBoundary?.builderMayMarkFailedEvidencePass !== false
      || contract.authorityBoundary?.builderMayDeleteProductionBusinessData !== false) {
    violations.push("standing_authorization_contract_boundary_mismatch");
  }
  if (contract.executionSecurity?.externalTrustRootRequired !== true
      || authority?.trustRootEnv !== "MARKET_RADAR_AUTONOMY_TRUST_ROOT"
      || authority?.externalTrustRequiredForProduction !== true) {
    violations.push("standing_authorization_contract_external_trust_mismatch");
  }
  if (!exactArray(contract.allowedActionClasses, ALLOWED_ACTION_CLASSES)) {
    violations.push("standing_authorization_contract_allowed_actions_mismatch");
  }
  if (!exactArray(contract.prohibitedActionClasses, PROHIBITED_ACTION_CLASSES)) {
    violations.push("standing_authorization_contract_prohibited_actions_mismatch");
  }
  if (contract.missionLock?.statement !== REQUIRED_MISSION
      || !exactArray(contract.missionLock?.coreChain, REQUIRED_CORE_CHAIN)
      || contract.missionLock?.supportingWorkMustNameCoreChainImpact !== true
      || contract.missionLock?.decorativeOrUnrelatedWorkAutoAuthorized !== false) {
    violations.push("standing_authorization_contract_mission_lock_mismatch");
  }
  if (!exactArray(contract.requiredPerPackageBindings, REQUIRED_PACKAGE_APPROVAL_FIELDS)) {
    violations.push("standing_authorization_contract_required_bindings_mismatch");
  }
  if (contract.executionSecurity?.oneTimeNonceRequired !== true
      || contract.executionSecurity?.maxExecutions !== 1
      || contract.executionSecurity?.appendOnlyConsumptionLedgerRequired !== true
      || contract.executionSecurity?.productionLeaseRequired !== true
      || contract.executionSecurity?.fencingTokenRequired !== true
      || contract.executionSecurity?.mutationCheckpointRevalidationRequired !== true
      || contract.executionSecurity?.gateEvidenceMustBindCommitAndTree !== true
      || contract.executionSecurity?.automaticRollbackRequired !== true) {
    violations.push("standing_authorization_contract_execution_security_mismatch");
  }
  if (contract.executionSecurity?.productionMutationLeaseMaxMinutes !== PACKAGE_APPROVAL_MAX_MINUTES
      || contract.executionSecurity?.longObservationRunsReadOnlyAfterMutationLeaseRelease !== true
      || contract.evidenceWindowBoundary?.mayRunConcurrentReadOnlyCollection !== true
      || contract.evidenceWindowBoundary?.mayPrepareNextLocalPackage !== true
      || contract.evidenceWindowBoundary?.mayCountPreEntrySamplesAsFormalEvidence !== false
      || contract.evidenceWindowBoundary?.mayShortenRequiredWindow !== false
      || !exactArray(contract.evidenceWindowBoundary?.requiredWindows, REQUIRED_EVIDENCE_WINDOWS)) {
    violations.push("standing_authorization_contract_evidence_window_mismatch");
  }
  if (!Array.isArray(contract.pollutionCleanupBoundary?.requiredBeforeDelete)
      || contract.pollutionCleanupBoundary.requiredBeforeDelete.length !== 5
      || !contract.pollutionCleanupBoundary.autoDeleteForbidden?.includes("production_business_row")
      || !contract.pollutionCleanupBoundary.autoDeleteForbidden?.includes("unknown_file")) {
    violations.push("standing_authorization_pollution_cleanup_boundary_invalid");
  }
  return unique(violations);
}

export async function loadExternalProductionApproval(state, { trustRootValue } = {}) {
  const activePackage = state?.activePackage;
  if (!(activePackage?.productionMutation || activePackage?.lane === "production")) {
    return { approval: undefined, trustRoot: undefined, violations: [] };
  }
  const trustRootEnvName = state.g0G8StandingAuthorization?.trustRootEnv;
  const configuredTrustRoot = trustRootValue
    ?? (nonEmptyString(trustRootEnvName) ? process.env[trustRootEnvName] : null);
  const violations = [];
  if (!nonEmptyString(configuredTrustRoot) || !isAbsolute(configuredTrustRoot)) {
    return {
      approval: undefined,
      trustRoot: undefined,
      violations: ["standing_authorization_external_trust_root_missing"],
    };
  }
  const trustRoot = resolve(configuredTrustRoot);
  if (trustRoot === REPO_ROOT || trustRoot.startsWith(`${REPO_ROOT}/`)) {
    return {
      approval: undefined,
      trustRoot,
      violations: ["standing_authorization_trust_root_inside_builder_repo"],
    };
  }
  const approvalPath = resolve(trustRoot, "approvals", `${activePackage.id}.json`);
  try {
    const facts = await lstat(approvalPath);
    if (!facts.isFile() || facts.isSymbolicLink()) {
      violations.push("standing_authorization_external_approval_not_regular_file");
    }
    if ((facts.mode & 0o777) !== 0o600) {
      violations.push("standing_authorization_external_approval_mode_invalid");
    }
    const approval = JSON.parse(await readFile(approvalPath, "utf8"));
    return { approval, approvalPath, trustRoot, violations };
  } catch (error) {
    violations.push(error?.code === "ENOENT"
      ? "standing_authorization_external_approval_missing"
      : "standing_authorization_external_approval_invalid");
    return { approval: undefined, approvalPath, trustRoot, violations };
  }
}

async function productionAuthorizationSnapshot(state, bindings) {
  const activePackage = state?.activePackage;
  if (!(activePackage?.productionMutation || activePackage?.lane === "production")) {
    return { approval: undefined, violations: [] };
  }
  const external = await loadExternalProductionApproval(state);
  const violations = [...external.violations];
  const approval = external.approval;
  violations.push(...evaluateProductionApprovalBindings({ approval, ...bindings }));
  if (approval?.mode === "g0_g8_standing_user_grant") {
    violations.push(...validatePackageApproval({ state, activePackage, approval }));
  }
  return { approval, violations: unique(violations) };
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

export async function inspect() {
  const { raw, state, stateHash } = await readState();
  const files = await changedFiles();
  const scopeViolations = evaluateScope(state, files);
  const contractViolations = await standingContractViolations(state);
  const artifactsMissing = await missingArtifacts(state);
  const fingerprint = await worktreeFingerprint(files);
  const requiredArtifactFingerprint = await worktreeFingerprint(
    state.activePackage.requiredArtifacts ?? [],
  );
  const identity = await gitIdentity();
  const scripts = await packageScripts();
  const packageScriptsSha256 = sha256(JSON.stringify(scripts));
  const policySha256 = sha256(await readFile(POLICY_PATH));
  const productionAuthorization = await productionAuthorizationSnapshot(state, {
    gitHead: identity.gitHead,
    gitTree: identity.gitTree,
    policySha256,
  });
  const violations = unique([
    ...scopeViolations,
    ...contractViolations,
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
    requiredArtifactFingerprint,
    ...identity,
    packageScriptsSha256,
    policySha256,
    productionApproval: productionAuthorization.approval,
    productionAuthorizationViolations: productionAuthorization.violations,
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
  await mkdir(RESULT_DIR, { recursive: true, mode: 0o700 });
  const resultPath = resolve(RESULT_DIR, `${value.resultId}.json`);
  const raw = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(resultPath, raw, { flag: "wx", mode: 0o600 });
  await writeFile(RESULT_PATH, `${JSON.stringify({
    schemaVersion: "market-radar-autonomous-gate-result-pointer.v1",
    resultPath: `.autonomy/gate-results/${value.resultId}.json`,
    resultSha256: sha256(raw),
  }, null, 2)}\n`, { mode: 0o600 });
}

async function readLatestResult() {
  const pointer = JSON.parse(await readFile(RESULT_PATH, "utf8"));
  if (pointer.schemaVersion !== "market-radar-autonomous-gate-result-pointer.v1") {
    throw new Error("gate_result_pointer_invalid");
  }
  const resultPath = resolve(REPO_ROOT, normalizedPath(pointer.resultPath));
  const raw = await readFile(resultPath, "utf8");
  if (sha256(raw) !== pointer.resultSha256) throw new Error("gate_result_pointer_hash_mismatch");
  return { result: JSON.parse(raw), resultSha256: pointer.resultSha256 };
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
  const worktreeUnchanged = before.worktreeFingerprint === after.worktreeFingerprint
    && before.requiredArtifactFingerprint === after.requiredArtifactFingerprint
    && before.gitHead === after.gitHead
    && before.gitTree === after.gitTree
    && before.packageScriptsSha256 === after.packageScriptsSha256
    && before.policySha256 === after.policySha256
    && before.stateHash === after.stateHash;
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
    requiredArtifactFingerprint: before.requiredArtifactFingerprint,
    gitHead: before.gitHead,
    gitTree: before.gitTree,
    packageScriptsSha256: before.packageScriptsSha256,
    policySha256: before.policySha256,
    resultId: randomUUID(),
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
  let resultSha256 = null;
  try {
    ({ result, resultSha256 } = await readLatestResult());
  } catch {
    result = null;
  }
  const gateViolations = evaluateGateResult({
    result,
    requiredGates: requiredGates(current.state),
    stateHash: current.stateHash,
    worktreeFingerprint: current.worktreeFingerprint,
    requiredArtifactFingerprint: current.requiredArtifactFingerprint,
    gitHead: current.gitHead,
    gitTree: current.gitTree,
    packageScriptsSha256: current.packageScriptsSha256,
    policySha256: current.policySha256,
  });
  const violations = unique([...current.violations, ...gateViolations]);
  const approval = current.productionApproval;
  const deploymentViolations = unique([
    ...current.productionAuthorizationViolations,
    ...((current.state.activePackage.productionMutation
      || current.state.activePackage.lane === "production")
      ? evaluateProductionApprovalBindings({
        approval,
        gitHead: current.gitHead,
        gitTree: current.gitTree,
        policySha256: current.policySha256,
        gateEvidenceSha256: resultSha256,
      })
      : []),
  ]);
  const canAutoCommit = violations.length === 0 && current.state.activePackage.status === "ready_for_gate";
  const response = {
    activePackage: current.activePackage,
    canAutoCommit,
    canAutoDeploy: canAutoCommit
      && current.state.activePackage.lane === "production"
      && current.state.activePackage.requiresExplicitApproval === true
      && deploymentViolations.length === 0,
    deploymentViolations,
    status: violations.length === 0 ? "pass" : "fail",
    gateEvidenceSha256: resultSha256,
    gitHead: current.gitHead,
    gitTree: current.gitTree,
    policySha256: current.policySha256,
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
    productionAuthorizationViolations: current.productionAuthorizationViolations,
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
