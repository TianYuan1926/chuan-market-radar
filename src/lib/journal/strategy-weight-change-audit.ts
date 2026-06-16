import type {
  StrategyWeightCalibrationCandidate,
  StrategyWeightCalibrationRecommendation,
  StrategyWeightCalibrationReport,
} from "./strategy-weight-calibration";

export type StrategyWeightChangeAuditStatus =
  | "blocked"
  | "collecting"
  | "manual_audit_ready"
  | "rollback_verification_required";

export type StrategyWeightChangeAuditItemStatus =
  | "blocked_by_quarantine"
  | "ready_for_manual_audit"
  | "requires_confirmation"
  | "requires_more_samples"
  | "rollback_verification_required";

export type StrategyWeightChangeDirection =
  | "decrease"
  | "increase"
  | "none"
  | "quarantine";

export type StrategyWeightRollbackCheck = {
  detail: string;
  id:
    | "counterevidence_review"
    | "manual_confirmation"
    | "rollback_trigger"
    | "sample_floor";
  label: string;
  status: "blocked" | "passed" | "required";
};

export type StrategyWeightChangeAuditItem = {
  allowedUse: "research_only";
  auditStatus: StrategyWeightChangeAuditItemStatus;
  blockers: string[];
  canAutoAdjustWeights: false;
  canExecuteWeightChange: false;
  closedSamples: number;
  label: string;
  latestVersionLabel: string | null;
  proposedDirection: StrategyWeightChangeDirection;
  reason: string;
  recommendation: StrategyWeightCalibrationRecommendation;
  requiredEvidence: string[];
  rollbackChecks: StrategyWeightRollbackCheck[];
  tag: string;
  validationRatePercent: number;
};

export type StrategyWeightChangeAuditReport = {
  allowedUse: "research_only";
  auditCandidateCount: number;
  blockedAuditCount: number;
  canAutoAdjustWeights: false;
  canExecuteWeightChange: false;
  guardrail: string;
  items: StrategyWeightChangeAuditItem[];
  mode: "strategy_weight_change_audit_mvp";
  nextStep: string;
  readyAuditCount: number;
  rollbackVerificationCount: number;
  status: StrategyWeightChangeAuditStatus;
};

const minimumClosedSamplesForChangeAudit = 5;
const minimumClosedSamplesForRollbackAudit = 3;

function proposedDirection(
  recommendation: StrategyWeightCalibrationRecommendation,
): StrategyWeightChangeDirection {
  const directions: Record<StrategyWeightCalibrationRecommendation, StrategyWeightChangeDirection> = {
    decrease_candidate: "decrease",
    hold_observation: "none",
    increase_candidate: "increase",
    quarantine_candidate: "quarantine",
  };

  return directions[recommendation];
}

function auditStatusFor(candidate: StrategyWeightCalibrationCandidate): StrategyWeightChangeAuditItemStatus {
  if (candidate.recommendation === "quarantine_candidate") {
    return "blocked_by_quarantine";
  }

  if (candidate.recommendation === "decrease_candidate") {
    return "rollback_verification_required";
  }

  if (candidate.confirmedVersions === 0) {
    return "requires_confirmation";
  }

  if (candidate.closedSamples < minimumClosedSamplesForChangeAudit) {
    return "requires_more_samples";
  }

  return "ready_for_manual_audit";
}

function blockersFor(
  candidate: StrategyWeightCalibrationCandidate,
  auditStatus: StrategyWeightChangeAuditItemStatus,
) {
  const blockers: string[] = [];

  if (auditStatus === "blocked_by_quarantine") {
    blockers.push("隔离候选必须先从决策路径隔离或删除，不能进入权重变更。");
  }

  if (auditStatus === "requires_confirmation") {
    blockers.push("缺少人工确认策略版本，不能进入权重变更审计。");
  }

  if (auditStatus === "requires_more_samples") {
    blockers.push(`已关闭样本 ${candidate.closedSamples} 个，低于人工变更审计门槛。`);
  }

  return blockers;
}

function requiredEvidence(candidate: StrategyWeightCalibrationCandidate) {
  const evidence = [
    `已关闭样本 ${candidate.closedSamples} 个`,
    `有效率 ${candidate.validationRatePercent}%`,
    `反证率 ${candidate.rejectionRatePercent}%`,
  ];

  if (candidate.latestVersionLabel) {
    evidence.push(`人工确认版本 ${candidate.latestVersionLabel}`);
  } else {
    evidence.push("人工确认版本缺失");
  }

  return evidence;
}

function rollbackChecks(candidate: StrategyWeightCalibrationCandidate): StrategyWeightRollbackCheck[] {
  const sampleFloor = candidate.recommendation === "increase_candidate"
    ? minimumClosedSamplesForChangeAudit
    : minimumClosedSamplesForRollbackAudit;
  const needsCounterevidenceReview = candidate.recommendation === "decrease_candidate" ||
    candidate.recommendation === "quarantine_candidate";

  return [
    {
      detail: candidate.confirmedVersions > 0
        ? `最近确认版本：${candidate.latestVersionLabel}`
        : "缺少人工确认版本，不能进入变更执行。",
      id: "manual_confirmation",
      label: "人工确认版本",
      status: candidate.confirmedVersions > 0 ? "passed" : "blocked",
    },
    {
      detail: `已关闭样本 ${candidate.closedSamples}/${sampleFloor}`,
      id: "sample_floor",
      label: "样本门槛",
      status: candidate.closedSamples >= sampleFloor ? "passed" : "blocked",
    },
    {
      detail: needsCounterevidenceReview
        ? "反证或隔离候选必须先人工复核失败路径。"
        : "反证不占优，但仍需保留失败路径观察。",
      id: "counterevidence_review",
      label: "反证复核",
      status: needsCounterevidenceReview ? "required" : "passed",
    },
    {
      detail: "执行前必须写明触发回滚的样本条件、窗口和版本标签。",
      id: "rollback_trigger",
      label: "回滚触发器",
      status: "required",
    },
  ];
}

function buildItem(candidate: StrategyWeightCalibrationCandidate): StrategyWeightChangeAuditItem {
  const auditStatus = auditStatusFor(candidate);

  return {
    allowedUse: "research_only",
    auditStatus,
    blockers: blockersFor(candidate, auditStatus),
    canAutoAdjustWeights: false,
    canExecuteWeightChange: false,
    closedSamples: candidate.closedSamples,
    label: candidate.label,
    latestVersionLabel: candidate.latestVersionLabel,
    proposedDirection: proposedDirection(candidate.recommendation),
    reason: candidate.reason,
    recommendation: candidate.recommendation,
    requiredEvidence: requiredEvidence(candidate),
    rollbackChecks: rollbackChecks(candidate),
    tag: candidate.tag,
    validationRatePercent: candidate.validationRatePercent,
  };
}

function reportStatus({
  blockedAuditCount,
  readyAuditCount,
  rollbackVerificationCount,
}: {
  blockedAuditCount: number;
  readyAuditCount: number;
  rollbackVerificationCount: number;
}): StrategyWeightChangeAuditStatus {
  if (blockedAuditCount > 0) {
    return "blocked";
  }

  if (rollbackVerificationCount > 0) {
    return "rollback_verification_required";
  }

  if (readyAuditCount > 0) {
    return "manual_audit_ready";
  }

  return "collecting";
}

function reportNextStep(status: StrategyWeightChangeAuditStatus) {
  if (status === "blocked") {
    return "存在隔离或阻断候选，先完成失败路径复核，不能进入真实权重变更。";
  }

  if (status === "rollback_verification_required") {
    return "存在降权或回滚验证候选，先补齐反证复核和回滚触发条件。";
  }

  if (status === "manual_audit_ready") {
    return "可进入人工权重变更审计包准备，但仍不能自动执行权重变更。";
  }

  return "继续积累回测候选和人工确认记录，暂不进入权重变更审计。";
}

export function buildStrategyWeightChangeAuditReport(
  calibrationReport: StrategyWeightCalibrationReport,
): StrategyWeightChangeAuditReport {
  const severityOrder: Record<StrategyWeightChangeAuditItemStatus, number> = {
    blocked_by_quarantine: 0,
    rollback_verification_required: 1,
    requires_confirmation: 2,
    requires_more_samples: 3,
    ready_for_manual_audit: 4,
  };
  const items = calibrationReport.candidates
    .filter((candidate) => candidate.recommendation !== "hold_observation")
    .map(buildItem)
    .sort((left, right) => (
      severityOrder[left.auditStatus] - severityOrder[right.auditStatus] ||
      right.closedSamples - left.closedSamples ||
      left.label.localeCompare(right.label, "zh-CN")
    ));
  const readyAuditCount = items.filter((item) => item.auditStatus === "ready_for_manual_audit").length;
  const rollbackVerificationCount = items
    .filter((item) => item.auditStatus === "rollback_verification_required").length;
  const blockedAuditCount = items
    .filter((item) => item.auditStatus === "blocked_by_quarantine" || item.blockers.length > 0).length;
  const status = reportStatus({
    blockedAuditCount,
    readyAuditCount,
    rollbackVerificationCount,
  });

  return {
    allowedUse: "research_only",
    auditCandidateCount: items.length,
    blockedAuditCount,
    canAutoAdjustWeights: false,
    canExecuteWeightChange: false,
    guardrail: "策略权重变更审计 MVP 只生成只读人工审计包和回滚验证要求，不执行真实权重变更。",
    items,
    mode: "strategy_weight_change_audit_mvp",
    nextStep: reportNextStep(status),
    readyAuditCount,
    rollbackVerificationCount,
    status,
  };
}
