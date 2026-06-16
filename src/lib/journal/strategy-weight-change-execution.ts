import type { JournalEvent, StrategyWeightChangeExecutionRecord } from "@/lib/analysis/types";
import type {
  StrategyWeightChangeAuditItem,
  StrategyWeightChangeAuditReport,
} from "./strategy-weight-change-audit";

export type StrategyWeightChangeExecutionStatus =
  | "approved_recorded"
  | "awaiting_manual_approval"
  | "approval_rejected"
  | "blocked_by_audit"
  | "record_needs_review"
  | "rollback_watch";

export type StrategyWeightChangeExecutionReportStatus =
  | "awaiting_manual_approval"
  | "blocked"
  | "collecting"
  | "recorded_observation"
  | "rollback_watch";

export type StrategyWeightChangeExecutionItem = {
  allowedUse: "research_only";
  approvalBy: string | null;
  auditStatus: StrategyWeightChangeAuditItem["auditStatus"];
  blockers: string[];
  canAutoAdjustWeights: false;
  canExecuteWeightChange: false;
  executionStatus: StrategyWeightChangeExecutionStatus;
  label: string;
  latestRecordAt: string | null;
  latestRecordId: string | null;
  latestVersionLabel: string | null;
  proposedDirection: StrategyWeightChangeAuditItem["proposedDirection"];
  requiredApproval: string[];
  rollbackTrigger: string | null;
  rollbackWindowDays: number | null;
  tag: string;
};

export type StrategyWeightChangeExecutionReport = {
  allowedUse: "research_only";
  approvedRecordCount: number;
  blockedRecordCount: number;
  canAutoAdjustWeights: false;
  canExecuteWeightChange: false;
  canWriteRuleWeights: false;
  executionRecordCount: number;
  guardrail: string;
  items: StrategyWeightChangeExecutionItem[];
  mode: "strategy_weight_manual_execution_registry_mvp";
  nextStep: string;
  pendingApprovalCount: number;
  requiresManualApproval: true;
  rollbackWatchCount: number;
  status: StrategyWeightChangeExecutionReportStatus;
};

function sortableTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isStrategyWeightChangeExecutionEvent(event: JournalEvent): event is JournalEvent & {
  strategyWeightChange: StrategyWeightChangeExecutionRecord;
} {
  return event.action === "strategy_weight_change_execution" &&
    event.source === "strategy_weight_change_execution" &&
    event.allowedUse === "research_only" &&
    event.canAutoAdjustWeights === false &&
    event.strategyWeightChange?.canExecuteWeightChange === false &&
    Boolean(event.strategyWeightChange.tag);
}

function latestRecordsByTag(events: JournalEvent[]) {
  const records = events
    .filter(isStrategyWeightChangeExecutionEvent)
    .sort((left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt));
  const recordsByTag = new Map<string, JournalEvent & {
    strategyWeightChange: StrategyWeightChangeExecutionRecord;
  }>();

  for (const record of records) {
    if (!recordsByTag.has(record.strategyWeightChange.tag)) {
      recordsByTag.set(record.strategyWeightChange.tag, record);
    }
  }

  return {
    recordCount: records.length,
    recordsByTag,
  };
}

function requiredApproval(auditItem: StrategyWeightChangeAuditItem) {
  return [
    `审计状态：${auditItem.auditStatus}`,
    `方向：${auditItem.proposedDirection}`,
    "人工确认人、版本标签、回滚窗口和回滚触发器必须完整记录。",
  ];
}

function executionStatusFor({
  auditItem,
  record,
}: {
  auditItem: StrategyWeightChangeAuditItem;
  record?: JournalEvent & {
    strategyWeightChange: StrategyWeightChangeExecutionRecord;
  };
}): StrategyWeightChangeExecutionStatus {
  if (auditItem.auditStatus === "blocked_by_quarantine" || auditItem.blockers.length > 0) {
    return "blocked_by_audit";
  }

  if (auditItem.auditStatus === "rollback_verification_required") {
    return "rollback_watch";
  }

  if (!record) {
    return "awaiting_manual_approval";
  }

  if (record.strategyWeightChange.approvalStatus === "approved") {
    return auditItem.auditStatus === "ready_for_manual_audit"
      ? "approved_recorded"
      : "record_needs_review";
  }

  if (record.strategyWeightChange.approvalStatus === "pending_approval") {
    return "awaiting_manual_approval";
  }

  if (record.strategyWeightChange.approvalStatus === "rollback_watch") {
    return "rollback_watch";
  }

  return "approval_rejected";
}

function blockersFor(
  auditItem: StrategyWeightChangeAuditItem,
  executionStatus: StrategyWeightChangeExecutionStatus,
) {
  if (executionStatus === "blocked_by_audit") {
    return auditItem.blockers.length > 0
      ? auditItem.blockers
      : ["审计状态未通过，不能执行真实权重变更。"];
  }

  if (executionStatus === "record_needs_review") {
    return ["执行记录与当前审计状态不一致，需要人工复核后才能保留。"];
  }

  return [];
}

function buildExecutionItem({
  auditItem,
  record,
}: {
  auditItem: StrategyWeightChangeAuditItem;
  record?: JournalEvent & {
    strategyWeightChange: StrategyWeightChangeExecutionRecord;
  };
}): StrategyWeightChangeExecutionItem {
  const executionStatus = executionStatusFor({ auditItem, record });
  const weightChange = record?.strategyWeightChange;

  return {
    allowedUse: "research_only",
    approvalBy: weightChange?.approvedBy ?? null,
    auditStatus: auditItem.auditStatus,
    blockers: blockersFor(auditItem, executionStatus),
    canAutoAdjustWeights: false,
    canExecuteWeightChange: false,
    executionStatus,
    label: auditItem.label,
    latestRecordAt: record?.createdAt ?? null,
    latestRecordId: record?.id ?? null,
    latestVersionLabel: weightChange?.versionLabel ?? auditItem.latestVersionLabel,
    proposedDirection: auditItem.proposedDirection,
    requiredApproval: requiredApproval(auditItem),
    rollbackTrigger: weightChange?.rollbackTrigger ?? null,
    rollbackWindowDays: weightChange?.rollbackWindowDays ?? null,
    tag: auditItem.tag,
  };
}

function reportStatus({
  approvedRecordCount,
  blockedRecordCount,
  pendingApprovalCount,
  rollbackWatchCount,
}: {
  approvedRecordCount: number;
  blockedRecordCount: number;
  pendingApprovalCount: number;
  rollbackWatchCount: number;
}): StrategyWeightChangeExecutionReportStatus {
  if (blockedRecordCount > 0) {
    return "blocked";
  }

  if (rollbackWatchCount > 0) {
    return "rollback_watch";
  }

  if (approvedRecordCount > 0) {
    return "recorded_observation";
  }

  if (pendingApprovalCount > 0) {
    return "awaiting_manual_approval";
  }

  return "collecting";
}

function nextStep(status: StrategyWeightChangeExecutionReportStatus) {
  if (status === "blocked") {
    return "存在未通过审计的候选，不能执行真实权重变更，先处理阻断和失败路径。";
  }

  if (status === "rollback_watch") {
    return "存在降权或回滚观察候选，先记录回滚触发器和人工验证窗口。";
  }

  if (status === "recorded_observation") {
    return "已有人工执行记录进入观察期，继续用后续 outcome 样本验证，不写入自动权重。";
  }

  if (status === "awaiting_manual_approval") {
    return "存在可审计候选，下一步只能补人工审批记录，不能自动执行。";
  }

  return "继续积累审计候选和人工确认样本，暂不生成执行记录。";
}

export function buildStrategyWeightChangeExecutionReport(
  auditReport: StrategyWeightChangeAuditReport,
  events: JournalEvent[],
): StrategyWeightChangeExecutionReport {
  const { recordCount, recordsByTag } = latestRecordsByTag(events);
  const items = auditReport.items.map((auditItem) => buildExecutionItem({
    auditItem,
    record: recordsByTag.get(auditItem.tag),
  }));
  const approvedRecordCount = items.filter((item) => item.executionStatus === "approved_recorded").length;
  const pendingApprovalCount = items.filter((item) => item.executionStatus === "awaiting_manual_approval").length;
  const rollbackWatchCount = items.filter((item) => item.executionStatus === "rollback_watch").length;
  const blockedRecordCount = items
    .filter((item) => item.executionStatus === "blocked_by_audit" || item.executionStatus === "record_needs_review").length;
  const status = reportStatus({
    approvedRecordCount,
    blockedRecordCount,
    pendingApprovalCount,
    rollbackWatchCount,
  });

  return {
    allowedUse: "research_only",
    approvedRecordCount,
    blockedRecordCount,
    canAutoAdjustWeights: false,
    canExecuteWeightChange: false,
    canWriteRuleWeights: false,
    executionRecordCount: recordCount,
    guardrail: "人工权重变更执行记录 MVP 只保存审批与回滚观察边界，不写入规则权重，不触发自动调权。",
    items,
    mode: "strategy_weight_manual_execution_registry_mvp",
    nextStep: nextStep(status),
    pendingApprovalCount,
    requiresManualApproval: true,
    rollbackWatchCount,
    status,
  };
}
