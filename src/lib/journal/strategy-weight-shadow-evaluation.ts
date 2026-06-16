import type { JournalEvent } from "@/lib/analysis/types";
import type { StrategyWeightShadowDiff, StrategyWeightShadowReport } from "./strategy-weight-shadow";

export type StrategyWeightShadowEvaluationStatus =
  | "blocked"
  | "improving"
  | "insufficient_samples"
  | "mixed"
  | "rollback_watch";

export type StrategyWeightShadowRollbackPressure = "blocking" | "high" | "low" | "medium";

export type StrategyWeightShadowEvaluationItem = {
  approvedAt: string;
  direction: StrategyWeightShadowDiff["direction"];
  label: string;
  latestRecordId: string;
  matchingConfirmations: number;
  nextAction: string;
  pendingSamples: number;
  postApprovalSamples: number;
  rejectedSamples: number;
  rejectionRatePercent: number;
  rollbackPressure: StrategyWeightShadowRollbackPressure;
  rollbackTriggerMatched: boolean;
  status: StrategyWeightShadowEvaluationStatus;
  tag: string;
  validatedSamples: number;
  validationRatePercent: number;
  versionLabel: string;
};

export type StrategyWeightShadowEvaluationReport = {
  allowedUse: "research_only";
  blockedCount: number;
  canAffectLiveSignals: false;
  canAutoAdjustWeights: false;
  evaluatedShadowCount: number;
  guardrail: string;
  improvingCount: number;
  insufficientSamplesCount: number;
  items: StrategyWeightShadowEvaluationItem[];
  mixedCount: number;
  mode: "strategy_weight_shadow_evaluation_mvp";
  nextStep: string;
  rollbackWatchCount: number;
  status: StrategyWeightShadowEvaluationStatus;
  totalPostApprovalSamples: number;
};

type OutcomeBucket = "pending" | "rejected" | "validated";

const minimumPostApprovalSamples = 3;

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function sortableTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isCalibrationReview(event: JournalEvent) {
  return event.action === "calibration_review" &&
    event.allowedUse === "research_only" &&
    event.canAutoAdjustWeights === false &&
    Boolean(event.calibrationTag);
}

function isStrategyConfirmation(event: JournalEvent) {
  return event.action === "strategy_confirmation" &&
    event.allowedUse === "research_only" &&
    event.canAutoAdjustWeights === false &&
    Boolean(event.strategyTag ?? event.calibrationTag);
}

function confirmationTag(event: JournalEvent) {
  return event.strategyTag ?? event.calibrationTag ?? "";
}

function outcomeBucket(event: JournalEvent): OutcomeBucket {
  if (event.outcomeStatus === "loss" || event.result === "loss") {
    return "rejected";
  }

  if (
    event.outcomeStatus === "partial_win" ||
    event.outcomeStatus === "saved" ||
    event.result === "win" ||
    event.result === "saved"
  ) {
    return "validated";
  }

  return "pending";
}

function rollbackTriggerThreshold(trigger: string | undefined) {
  if (!trigger) {
    return 3;
  }

  const match = trigger.match(/(\d+)\s*个反证/);

  return match?.[1] ? Number(match[1]) : 3;
}

function matchingSamples(events: JournalEvent[], diff: StrategyWeightShadowDiff) {
  const approvedAt = sortableTime(diff.latestRecordAt);

  return events
    .filter(isCalibrationReview)
    .filter((event) => event.calibrationTag === diff.tag)
    .filter((event) => sortableTime(event.createdAt) > approvedAt);
}

function matchingConfirmations(events: JournalEvent[], diff: StrategyWeightShadowDiff) {
  const approvedAt = sortableTime(diff.latestRecordAt);

  return events
    .filter(isStrategyConfirmation)
    .filter((event) => confirmationTag(event) === diff.tag)
    .filter((event) => sortableTime(event.createdAt) >= approvedAt).length;
}

function rollbackTriggerFor(events: JournalEvent[], diff: StrategyWeightShadowDiff) {
  const matchingRecord = events.find((event) => event.id === diff.latestRecordId);

  return matchingRecord?.strategyWeightChange?.rollbackTrigger;
}

function statusFor({
  direction,
  postApprovalSamples,
  rejectedSamples,
  rollbackTriggerMatched,
  validationRatePercent,
}: {
  direction: StrategyWeightShadowDiff["direction"];
  postApprovalSamples: number;
  rejectedSamples: number;
  rollbackTriggerMatched: boolean;
  validationRatePercent: number;
}): StrategyWeightShadowEvaluationStatus {
  if (direction === "quarantine") {
    return "blocked";
  }

  if (rollbackTriggerMatched) {
    return "rollback_watch";
  }

  if (postApprovalSamples < minimumPostApprovalSamples) {
    return "insufficient_samples";
  }

  if (validationRatePercent >= 70 && rejectedSamples <= 1) {
    return "improving";
  }

  return "mixed";
}

function rollbackPressureFor({
  direction,
  rejectedSamples,
  rollbackTriggerMatched,
  status,
}: {
  direction: StrategyWeightShadowDiff["direction"];
  rejectedSamples: number;
  rollbackTriggerMatched: boolean;
  status: StrategyWeightShadowEvaluationStatus;
}): StrategyWeightShadowRollbackPressure {
  if (direction === "quarantine" || status === "blocked") {
    return "blocking";
  }

  if (rollbackTriggerMatched) {
    return "high";
  }

  if (rejectedSamples >= 2) {
    return "medium";
  }

  return "low";
}

function nextActionFor(status: StrategyWeightShadowEvaluationStatus) {
  if (status === "blocked") {
    return "影子权重仍处于隔离状态，只能复核失败路径，不能进入真实权重。";
  }

  if (status === "rollback_watch") {
    return "反证已触发回滚压力，先做人工回滚复核，不能继续推进真实权重。";
  }

  if (status === "improving") {
    return "影子表现偏正向，继续观察更多样本，仍不进入真实调权。";
  }

  if (status === "mixed") {
    return "影子表现分歧，继续分层复盘有效样本与反证样本。";
  }

  return "观察期样本不足，继续积累，不形成权重生效判断。";
}

function reportStatus({
  blockedCount,
  improvingCount,
  items,
  mixedCount,
  rollbackWatchCount,
}: {
  blockedCount: number;
  improvingCount: number;
  items: StrategyWeightShadowEvaluationItem[];
  mixedCount: number;
  rollbackWatchCount: number;
}): StrategyWeightShadowEvaluationStatus {
  if (blockedCount > 0) {
    return "blocked";
  }

  if (rollbackWatchCount > 0) {
    return "rollback_watch";
  }

  if (mixedCount > 0) {
    return "mixed";
  }

  if (items.length > 0 && improvingCount === items.length) {
    return "improving";
  }

  return "insufficient_samples";
}

function reportNextStep(status: StrategyWeightShadowEvaluationStatus) {
  if (status === "blocked") {
    return "存在阻断级影子权重，真实权重生效继续关闭。";
  }

  if (status === "rollback_watch") {
    return "存在回滚压力，先人工复核反证样本和回滚触发器。";
  }

  if (status === "improving") {
    return "影子表现偏正向，继续扩大观察样本，仍不能自动生效。";
  }

  if (status === "mixed") {
    return "影子表现分歧，继续拆分市场环境和样本质量。";
  }

  return "继续积累影子观察期样本，暂不判断策略权重。";
}

function itemFor(events: JournalEvent[], diff: StrategyWeightShadowDiff): StrategyWeightShadowEvaluationItem {
  const samples = matchingSamples(events, diff);
  const counts = samples.reduce<Record<OutcomeBucket, number>>((current, event) => {
    const bucket = outcomeBucket(event);

    return {
      ...current,
      [bucket]: current[bucket] + 1,
    };
  }, {
    pending: 0,
    rejected: 0,
    validated: 0,
  });
  const postApprovalSamples = samples.length;
  const decisiveSamples = counts.validated + counts.rejected;
  const validationRatePercent = percent(counts.validated, decisiveSamples);
  const rejectionRatePercent = percent(counts.rejected, decisiveSamples);
  const rollbackThreshold = rollbackTriggerThreshold(rollbackTriggerFor(events, diff));
  const rollbackTriggerMatched = counts.rejected >= rollbackThreshold;
  const status = statusFor({
    direction: diff.direction,
    postApprovalSamples,
    rejectedSamples: counts.rejected,
    rollbackTriggerMatched,
    validationRatePercent,
  });

  return {
    approvedAt: diff.latestRecordAt,
    direction: diff.direction,
    label: diff.label,
    latestRecordId: diff.latestRecordId,
    matchingConfirmations: matchingConfirmations(events, diff),
    nextAction: nextActionFor(status),
    pendingSamples: counts.pending,
    postApprovalSamples,
    rejectedSamples: counts.rejected,
    rejectionRatePercent,
    rollbackPressure: rollbackPressureFor({
      direction: diff.direction,
      rejectedSamples: counts.rejected,
      rollbackTriggerMatched,
      status,
    }),
    rollbackTriggerMatched,
    status,
    tag: diff.tag,
    validatedSamples: counts.validated,
    validationRatePercent,
    versionLabel: diff.versionLabel,
  };
}

export function buildStrategyWeightShadowEvaluationReport({
  events,
  shadowReport,
}: {
  events: JournalEvent[];
  shadowReport: StrategyWeightShadowReport;
}): StrategyWeightShadowEvaluationReport {
  const statusOrder: Record<StrategyWeightShadowEvaluationStatus, number> = {
    blocked: 0,
    rollback_watch: 1,
    mixed: 2,
    improving: 3,
    insufficient_samples: 4,
  };
  const items = shadowReport.diffs
    .map((diff) => itemFor(events, diff))
    .sort((left, right) => (
      statusOrder[left.status] - statusOrder[right.status] ||
      right.postApprovalSamples - left.postApprovalSamples ||
      left.label.localeCompare(right.label, "zh-CN")
    ));
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const improvingCount = items.filter((item) => item.status === "improving").length;
  const insufficientSamplesCount = items.filter((item) => item.status === "insufficient_samples").length;
  const mixedCount = items.filter((item) => item.status === "mixed").length;
  const rollbackWatchCount = items.filter((item) => item.status === "rollback_watch").length;
  const status = reportStatus({
    blockedCount,
    improvingCount,
    items,
    mixedCount,
    rollbackWatchCount,
  });

  return {
    allowedUse: "research_only",
    blockedCount,
    canAffectLiveSignals: false,
    canAutoAdjustWeights: false,
    evaluatedShadowCount: items.length,
    guardrail: "影子表现评估只读观察人工审批后的样本表现，不执行真实权重、不自动调权。",
    improvingCount,
    insufficientSamplesCount,
    items,
    mixedCount,
    mode: "strategy_weight_shadow_evaluation_mvp",
    nextStep: reportNextStep(status),
    rollbackWatchCount,
    status,
    totalPostApprovalSamples: items.reduce((sum, item) => sum + item.postApprovalSamples, 0),
  };
}
