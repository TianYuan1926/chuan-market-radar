import type { StrategyWeightChangeExecutionReport } from "./strategy-weight-change-execution";
import type { StrategyWeightShadowReport } from "./strategy-weight-shadow";
import type { StrategyWeightShadowEvaluationReport } from "./strategy-weight-shadow-evaluation";

export type StrategyWeightActivationMode = "disabled" | "manual" | "shadow";

export type StrategyWeightActivationGateStatus =
  | "active_disabled_by_config"
  | "blocked"
  | "eligible_for_manual_activation";

export type StrategyWeightActivationGateCheckStatus = "blocked" | "disabled" | "passed";

export type StrategyWeightActivationGateCheck = {
  detail: string;
  id:
    | "activation_mode"
    | "manual_approval"
    | "no_quarantine"
    | "rollback_plan"
    | "sample_floor"
    | "shadow_positive"
    | "rollback_pressure";
  label: string;
  status: StrategyWeightActivationGateCheckStatus;
};

export type StrategyWeightActivationGateReport = {
  activationMode: StrategyWeightActivationMode;
  allowedUse: "research_only";
  blockerCount: number;
  blockers: string[];
  canAffectLiveSignals: false;
  canAutoAdjustWeights: false;
  canWriteRuleWeights: false;
  checks: StrategyWeightActivationGateCheck[];
  eligibleDiffCount: number;
  eligibleForManualActivation: boolean;
  guardrail: string;
  mode: "strategy_weight_activation_gate_mvp";
  nextStep: string;
  requiredPostApprovalSamples: number;
  requiresSeparateRelease: true;
  status: StrategyWeightActivationGateStatus;
};

const requiredPostApprovalSamples = 5;

export function normalizeStrategyWeightActivationMode(
  value: string | undefined,
): StrategyWeightActivationMode {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "manual" || normalized === "shadow") {
    return normalized;
  }

  return "disabled";
}

function disabledModeDetail(activationMode: StrategyWeightActivationMode) {
  if (activationMode === "shadow") {
    return "当前配置为 shadow，只允许影子观察，真实权重继续关闭。";
  }

  return "当前配置关闭真实权重启用；默认 disabled，不允许进入真实权重。";
}

function checkActivationMode(activationMode: StrategyWeightActivationMode): StrategyWeightActivationGateCheck {
  if (activationMode === "manual") {
    return {
      detail: "配置允许进入人工启用候选检查，但不会自动写入真实权重。",
      id: "activation_mode",
      label: "启用模式",
      status: "passed",
    };
  }

  return {
    detail: disabledModeDetail(activationMode),
    id: "activation_mode",
    label: "启用模式",
    status: "disabled",
  };
}

function checkManualApproval(
  executionReport: StrategyWeightChangeExecutionReport,
): StrategyWeightActivationGateCheck {
  const approvedItems = executionReport.items.filter((item) => item.executionStatus === "approved_recorded");
  const totalExecutableItems = executionReport.items.filter((item) => item.proposedDirection !== "none").length;
  const hasOnlyApprovedItems = totalExecutableItems > 0 &&
    approvedItems.length === totalExecutableItems &&
    executionReport.blockedRecordCount === 0 &&
    executionReport.pendingApprovalCount === 0;

  return {
    detail: hasOnlyApprovedItems
      ? `已记录 ${approvedItems.length} 个完整人工审批记录。`
      : `已审批 ${approvedItems.length}/${Math.max(1, totalExecutableItems)}，仍有待审批、阻断或需复核记录。`,
    id: "manual_approval",
    label: "人工审批",
    status: hasOnlyApprovedItems ? "passed" : "blocked",
  };
}

function checkShadowPositive(
  shadowEvaluationReport: StrategyWeightShadowEvaluationReport,
): StrategyWeightActivationGateCheck {
  const passed = shadowEvaluationReport.status === "improving" &&
    shadowEvaluationReport.evaluatedShadowCount > 0 &&
    shadowEvaluationReport.improvingCount === shadowEvaluationReport.evaluatedShadowCount &&
    shadowEvaluationReport.mixedCount === 0 &&
    shadowEvaluationReport.rollbackWatchCount === 0 &&
    shadowEvaluationReport.blockedCount === 0;

  return {
    detail: passed
      ? `影子表现 ${shadowEvaluationReport.improvingCount}/${shadowEvaluationReport.evaluatedShadowCount} 为正向。`
      : `当前影子表现为 ${shadowEvaluationReport.status}，不能进入真实权重候选。`,
    id: "shadow_positive",
    label: "影子表现",
    status: passed ? "passed" : "blocked",
  };
}

function checkSampleFloor(
  shadowEvaluationReport: StrategyWeightShadowEvaluationReport,
): StrategyWeightActivationGateCheck {
  const underSampledItems = shadowEvaluationReport.items.filter((item) =>
    item.postApprovalSamples < requiredPostApprovalSamples
  );
  const passed = shadowEvaluationReport.items.length > 0 && underSampledItems.length === 0;
  const lowestSampleCount = shadowEvaluationReport.items.reduce(
    (lowest, item) => Math.min(lowest, item.postApprovalSamples),
    Number.POSITIVE_INFINITY,
  );

  return {
    detail: passed
      ? `每个影子项均达到 ${requiredPostApprovalSamples} 个审批后样本。`
      : `审批后样本不足，最低 ${Number.isFinite(lowestSampleCount) ? lowestSampleCount : 0}/${requiredPostApprovalSamples}。`,
    id: "sample_floor",
    label: "样本门槛",
    status: passed ? "passed" : "blocked",
  };
}

function checkRollbackPlan(
  executionReport: StrategyWeightChangeExecutionReport,
): StrategyWeightActivationGateCheck {
  const executableItems = executionReport.items.filter((item) => item.proposedDirection !== "none");
  const missingRollbackItems = executableItems.filter((item) =>
    !item.rollbackTrigger?.trim() ||
    !item.rollbackWindowDays ||
    item.rollbackWindowDays <= 0 ||
    !item.latestVersionLabel?.trim()
  );
  const passed = executableItems.length > 0 && missingRollbackItems.length === 0;

  return {
    detail: passed
      ? "所有人工记录都有版本标签、回滚窗口和回滚触发器。"
      : `${missingRollbackItems.length || executableItems.length} 个候选缺少完整回滚计划。`,
    id: "rollback_plan",
    label: "回滚计划",
    status: passed ? "passed" : "blocked",
  };
}

function checkNoQuarantine(
  shadowReport: StrategyWeightShadowReport,
  shadowEvaluationReport: StrategyWeightShadowEvaluationReport,
): StrategyWeightActivationGateCheck {
  const quarantineDiffs = shadowReport.diffs.filter((diff) => diff.direction === "quarantine").length;
  const blockedItems = shadowEvaluationReport.blockedCount;
  const passed = quarantineDiffs === 0 && blockedItems === 0;

  return {
    detail: passed
      ? "没有隔离候选或阻断级影子项。"
      : `发现 ${quarantineDiffs + blockedItems} 个隔离/阻断候选。`,
    id: "no_quarantine",
    label: "无隔离候选",
    status: passed ? "passed" : "blocked",
  };
}

function checkRollbackPressure(
  shadowEvaluationReport: StrategyWeightShadowEvaluationReport,
): StrategyWeightActivationGateCheck {
  const pressureItems = shadowEvaluationReport.items.filter((item) =>
    item.rollbackPressure === "blocking" ||
    item.rollbackPressure === "high" ||
    item.status === "rollback_watch"
  );
  const passed = pressureItems.length === 0 && shadowEvaluationReport.rollbackWatchCount === 0;

  return {
    detail: passed
      ? "没有高压回滚项，反证未触发回滚观察。"
      : `存在 ${pressureItems.length || shadowEvaluationReport.rollbackWatchCount} 个回滚压力项。`,
    id: "rollback_pressure",
    label: "回滚压力",
    status: passed ? "passed" : "blocked",
  };
}

function blockersFrom(checks: StrategyWeightActivationGateCheck[]) {
  return checks
    .filter((check) => check.status === "blocked" || check.status === "disabled")
    .map((check) => `${check.label}：${check.detail}`);
}

function statusFor({
  activationMode,
  checks,
}: {
  activationMode: StrategyWeightActivationMode;
  checks: StrategyWeightActivationGateCheck[];
}): StrategyWeightActivationGateStatus {
  if (activationMode !== "manual") {
    return "active_disabled_by_config";
  }

  return checks.every((check) => check.status === "passed")
    ? "eligible_for_manual_activation"
    : "blocked";
}

function nextStepFor(status: StrategyWeightActivationGateStatus) {
  if (status === "active_disabled_by_config") {
    return "配置关闭真实权重启用，继续保持影子观察和人工复盘。";
  }

  if (status === "eligible_for_manual_activation") {
    return "条件已满足人工启用候选，但仍需单独发布真实权重接入阶段，不会自动改变扫描。";
  }

  return "真实权重启用仍被阻断，先补齐样本、审批、回滚计划和影子表现条件。";
}

export function buildStrategyWeightActivationGate({
  activationMode,
  executionReport,
  shadowEvaluationReport,
  shadowReport,
}: {
  activationMode: string | undefined;
  executionReport: StrategyWeightChangeExecutionReport;
  shadowEvaluationReport: StrategyWeightShadowEvaluationReport;
  shadowReport: StrategyWeightShadowReport;
}): StrategyWeightActivationGateReport {
  const normalizedMode = normalizeStrategyWeightActivationMode(activationMode);
  const checks = [
    checkActivationMode(normalizedMode),
    checkManualApproval(executionReport),
    checkShadowPositive(shadowEvaluationReport),
    checkSampleFloor(shadowEvaluationReport),
    checkRollbackPlan(executionReport),
    checkNoQuarantine(shadowReport, shadowEvaluationReport),
    checkRollbackPressure(shadowEvaluationReport),
  ];
  const status = statusFor({
    activationMode: normalizedMode,
    checks,
  });
  const blockers = blockersFrom(checks);
  const eligibleForManualActivation = status === "eligible_for_manual_activation";

  return {
    activationMode: normalizedMode,
    allowedUse: "research_only",
    blockerCount: blockers.length,
    blockers,
    canAffectLiveSignals: false,
    canAutoAdjustWeights: false,
    canWriteRuleWeights: false,
    checks,
    eligibleDiffCount: eligibleForManualActivation ? shadowEvaluationReport.improvingCount : 0,
    eligibleForManualActivation,
    guardrail: "真实权重启用 gate 只做条件解释，不会改变扫描、评分、策略或规则权重；即使满足条件也仍需单独发布真实接入阶段。",
    mode: "strategy_weight_activation_gate_mvp",
    nextStep: nextStepFor(status),
    requiredPostApprovalSamples,
    requiresSeparateRelease: true,
    status,
  };
}
