import type { JournalEvent } from "@/lib/analysis/types";
import {
  buildOutcomeCalibrationAdmission,
  outcomeCalibrationAdmissionThresholds,
  type OutcomeCalibrationAdmissionStatus,
  type OutcomeCalibrationAdmission,
} from "./outcome-sample-admission";

export type OutcomeCalibrationFlowStatus =
  | "awaiting_manual_confirmation"
  | "blocked"
  | "collecting_samples"
  | "confirmed_observation"
  | "rollback_watch";

export type OutcomeCalibrationFlowCheckpointStatus =
  | "blocked"
  | "collecting"
  | "complete"
  | "ready"
  | "waiting"
  | "watch";

export type OutcomeCalibrationFlowCheckpoint = {
  detail: string;
  id: "sample_admission" | "manual_confirmation" | "rollback_boundary";
  label: string;
  status: OutcomeCalibrationFlowCheckpointStatus;
};

export type OutcomeCalibrationThresholdLayerId =
  | "counterevidence_pressure"
  | "manual_confirmation"
  | "rollback_pressure"
  | "sample_floor"
  | "validation_quality";

export type OutcomeCalibrationThresholdLayerStatus =
  | "blocked"
  | "collecting"
  | "ready"
  | "watch";

export type OutcomeCalibrationThresholdLayer = {
  current: string;
  detail: string;
  id: OutcomeCalibrationThresholdLayerId;
  label: string;
  nextStep: string;
  status: OutcomeCalibrationThresholdLayerStatus;
  target: string;
};

export type OutcomeCalibrationBlockerCode =
  | "closed_samples_below_threshold"
  | "counterevidence_dominates"
  | "loss_cluster"
  | "validation_rate_below_threshold";

export type OutcomeCalibrationBlockerDetail = {
  code: OutcomeCalibrationBlockerCode;
  detail: string;
  label: string;
  nextStep: string;
  severity: "attention" | "blocked" | "watch";
};

export type OutcomeCalibrationSampleBreakdown = Record<CalibrationBucket, number>;

export type OutcomeCalibrationSampleDrilldown = {
  allowedUse: "research_only";
  bucket: CalibrationBucket;
  canAutoAdjustWeights: false;
  createdAt: string;
  id: string;
  label: string;
  reason: string;
  reviewStatus: JournalEvent["reviewStatus"];
  symbol: string;
  tag: string;
};

export type OutcomeCalibrationRollbackPlanStage =
  | "awaiting_manual_confirmation"
  | "collect_samples"
  | "freeze_weight_discussion"
  | "manual_review"
  | "observe_confirmed_version";

export type OutcomeCalibrationRollbackPlan = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  checkpoints: Array<{
    detail: string;
    id: "confirm_version" | "freeze_or_retain" | "observe_followups";
    label: string;
    nextStep: string;
    status: OutcomeCalibrationFlowCheckpointStatus;
  }>;
  guardrail: string;
  mode: "manual_rollback_plan";
  nextStep: string;
  severity: "high" | "low" | "medium";
  stage: OutcomeCalibrationRollbackPlanStage;
  trigger: string;
};

export type OutcomeCalibrationFlow = {
  admissionStatus: OutcomeCalibrationAdmissionStatus;
  allowedUse: "research_only";
  autoWeightEligible: false;
  blockerDetails: OutcomeCalibrationBlockerDetail[];
  calibrationReviewEvents: number;
  canAutoAdjustWeights: false;
  checkpoints: OutcomeCalibrationFlowCheckpoint[];
  confirmedStrategyVersions: number;
  guardrail: string;
  manualConfirmationEvents: number;
  manualReviewVersions: number;
  mode: "outcome_calibration_readonly_flow";
  nextStep: string;
  pendingCalibrationReviews: number;
  retainedObservationVersions: number;
  rollbackWatchVersions: number;
  sampleBreakdown: OutcomeCalibrationSampleBreakdown;
  sampleDrilldown: OutcomeCalibrationSampleDrilldown[];
  sampleGateReady: boolean;
  status: OutcomeCalibrationFlowStatus;
  thresholdLayers: OutcomeCalibrationThresholdLayer[];
  rollbackPlan: OutcomeCalibrationRollbackPlan;
};

type CalibrationBucket = "expired" | "pending" | "rejected" | "validated";

type ConfirmationPerformance = {
  expired: number;
  pending: number;
  rejected: number;
  status: "awaiting_samples" | "manual_review_required" | "retain_observation" | "rollback_watch";
  validated: number;
  verifiedSampleCount: number;
};

const strategyVersionPerformanceThresholds = {
  maxRejectedForRetain: 1,
  minimumVerifiedSamples: 3,
  retainValidationMinimum: 3,
  rollbackRejectionMinimum: 2,
} as const;

function sortableTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isCalibrationReview(event: JournalEvent) {
  return event.action === "calibration_review";
}

function isManualStrategyConfirmation(event: JournalEvent) {
  return event.action === "strategy_confirmation"
    && event.source === "strategy_version_confirmation"
    && event.allowedUse === "research_only"
    && event.canAutoAdjustWeights === false;
}

function calibrationBucket(event: JournalEvent): CalibrationBucket {
  if (event.outcomeStatus === "expired") {
    return "expired";
  }

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

function calibrationBucketLabel(bucket: CalibrationBucket) {
  return {
    expired: "过期",
    pending: "待复查",
    rejected: "反证",
    validated: "有效",
  }[bucket];
}

function calibrationBucketReason(bucket: CalibrationBucket) {
  return {
    expired: "样本过期或窗口失效，暂不支持规则加权。",
    pending: "样本仍待复查，不能提前纳入权重讨论。",
    rejected: "样本形成反证，优先复核失败路径和适用条件。",
    validated: "样本表现有效，只能进入人工复核候选，不能自动加权。",
  }[bucket];
}

function confirmationTag(event: JournalEvent) {
  return event.strategyTag ?? event.calibrationTag ?? "";
}

function performanceStatus({
  pending,
  rejected,
  validated,
  verifiedSampleCount,
}: {
  pending: number;
  rejected: number;
  validated: number;
  verifiedSampleCount: number;
}): ConfirmationPerformance["status"] {
  if (verifiedSampleCount < strategyVersionPerformanceThresholds.minimumVerifiedSamples || pending > 0) {
    return "awaiting_samples";
  }

  if (
    rejected >= strategyVersionPerformanceThresholds.rollbackRejectionMinimum &&
    rejected > validated
  ) {
    return "rollback_watch";
  }

  if (
    validated >= strategyVersionPerformanceThresholds.retainValidationMinimum &&
    rejected <= strategyVersionPerformanceThresholds.maxRejectedForRetain
  ) {
    return "retain_observation";
  }

  return "manual_review_required";
}

function buildConfirmationPerformance(
  confirmation: JournalEvent,
  calibrationReviews: JournalEvent[],
): ConfirmationPerformance {
  const tag = confirmationTag(confirmation);
  const confirmedAt = sortableTime(confirmation.createdAt);
  const followups = calibrationReviews.filter((event) => (
    event.calibrationTag === tag &&
    sortableTime(event.createdAt) > confirmedAt
  ));
  const counts = followups.reduce<Record<CalibrationBucket, number>>((current, event) => {
    const bucket = calibrationBucket(event);

    return {
      ...current,
      [bucket]: current[bucket] + 1,
    };
  }, {
    expired: 0,
    pending: 0,
    rejected: 0,
    validated: 0,
  });
  const verifiedSampleCount = counts.expired + counts.rejected + counts.validated;

  return {
    ...counts,
    status: performanceStatus({
      pending: counts.pending,
      rejected: counts.rejected,
      validated: counts.validated,
      verifiedSampleCount,
    }),
    verifiedSampleCount,
  };
}

function flowStatus({
  admissionStatus,
  manualConfirmationEvents,
  rollbackWatchVersions,
  sampleGateReady,
}: {
  admissionStatus: OutcomeCalibrationAdmissionStatus;
  manualConfirmationEvents: number;
  rollbackWatchVersions: number;
  sampleGateReady: boolean;
}): OutcomeCalibrationFlowStatus {
  if (admissionStatus === "blocked") {
    return "blocked";
  }

  if (rollbackWatchVersions > 0) {
    return "rollback_watch";
  }

  if (manualConfirmationEvents > 0) {
    return "confirmed_observation";
  }

  if (sampleGateReady) {
    return "awaiting_manual_confirmation";
  }

  return "collecting_samples";
}

function nextStep(status: OutcomeCalibrationFlowStatus) {
  if (status === "blocked") {
    return "样本准入或反证结构阻断，先复查规则假设，不能提高权重。";
  }

  if (status === "rollback_watch") {
    return "确认后表现触发回滚观察，冻结加权讨论，人工复核失败路径，不能自动改权重。";
  }

  if (status === "confirmed_observation") {
    return "已有人工确认版本，继续观察确认后样本和回滚边界，不能自动改权重。";
  }

  if (status === "awaiting_manual_confirmation") {
    return "样本已达到准入门槛，等待人工确认策略版本和适用边界，不能自动改权重。";
  }

  return "继续积累 outcome 样本和校准复盘，不进入策略版本确认。";
}

function sampleCheckpoint(
  admissionStatus: OutcomeCalibrationAdmissionStatus,
  sampleGateReady: boolean,
): OutcomeCalibrationFlowCheckpoint {
  return {
    detail: sampleGateReady ? "样本准入已满足人工校准门槛。" : "继续积累 outcome 样本并观察阻断项。",
    id: "sample_admission",
    label: "样本准入",
    status: admissionStatus === "blocked" ? "blocked" : sampleGateReady ? "complete" : "collecting",
  };
}

function manualCheckpoint({
  calibrationReviewEvents,
  manualConfirmationEvents,
  sampleGateReady,
}: {
  calibrationReviewEvents: number;
  manualConfirmationEvents: number;
  sampleGateReady: boolean;
}): OutcomeCalibrationFlowCheckpoint {
  return {
    detail: `${manualConfirmationEvents} 个人工确认 / ${calibrationReviewEvents} 个校准复盘。`,
    id: "manual_confirmation",
    label: "人工确认",
    status: manualConfirmationEvents > 0 ? "complete" : sampleGateReady ? "ready" : "waiting",
  };
}

function rollbackCheckpoint({
  manualConfirmationEvents,
  rollbackWatchVersions,
}: {
  manualConfirmationEvents: number;
  rollbackWatchVersions: number;
}): OutcomeCalibrationFlowCheckpoint {
  return {
    detail: `${rollbackWatchVersions} 个版本进入回滚观察。`,
    id: "rollback_boundary",
    label: "回滚边界",
    status: rollbackWatchVersions > 0 ? "watch" : manualConfirmationEvents > 0 ? "collecting" : "waiting",
  };
}

function blockerDetail(code: string): OutcomeCalibrationBlockerDetail {
  const fallback: OutcomeCalibrationBlockerDetail = {
    code: "closed_samples_below_threshold",
    detail: "已关闭样本不足，当前只能继续观察。",
    label: "样本不足",
    nextStep: "继续积累已关闭 outcome 样本，不进入权重讨论。",
    severity: "watch",
  };
  const details: Record<OutcomeCalibrationBlockerCode, OutcomeCalibrationBlockerDetail> = {
    closed_samples_below_threshold: fallback,
    counterevidence_dominates: {
      code: "counterevidence_dominates",
      detail: "反证样本数量超过有效样本，说明当前规则假设可能不稳。",
      label: "反证占优",
      nextStep: "先复查样本来源、市场环境和规则适用边界，不能提高权重。",
      severity: "blocked",
    },
    loss_cluster: {
      code: "loss_cluster",
      detail: "亏损样本形成聚集，可能存在系统性误报。",
      label: "亏损聚集",
      nextStep: "冻结加权讨论，优先拆解失败路径并降级为观察。",
      severity: "blocked",
    },
    validation_rate_below_threshold: {
      code: "validation_rate_below_threshold",
      detail: "有效率低于人工校准阈值，不能支撑策略版本升级。",
      label: "有效率不足",
      nextStep: "继续补样本并复核反证，暂不进入自动调权准入。",
      severity: "attention",
    },
  };

  return details[code as OutcomeCalibrationBlockerCode] ?? fallback;
}

function sampleBreakdown(calibrationReviews: JournalEvent[]): OutcomeCalibrationSampleBreakdown {
  return calibrationReviews.reduce<OutcomeCalibrationSampleBreakdown>((current, event) => {
    const bucket = calibrationBucket(event);

    return {
      ...current,
      [bucket]: current[bucket] + 1,
    };
  }, {
    expired: 0,
    pending: 0,
    rejected: 0,
    validated: 0,
  });
}

function sampleDrilldown(calibrationReviews: JournalEvent[]): OutcomeCalibrationSampleDrilldown[] {
  return [...calibrationReviews]
    .sort((left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt))
    .slice(0, 5)
    .map((event) => {
      const bucket = calibrationBucket(event);

      return {
        allowedUse: "research_only",
        bucket,
        canAutoAdjustWeights: false,
        createdAt: event.createdAt,
        id: event.id,
        label: calibrationBucketLabel(bucket),
        reason: calibrationBucketReason(bucket),
        reviewStatus: event.reviewStatus,
        symbol: event.symbol,
        tag: event.calibrationTag ?? "unclassified",
      };
    });
}

function thresholdLayers({
  admission,
  manualConfirmationEvents,
  manualReviewVersions,
  rollbackWatchVersions,
}: {
  admission: OutcomeCalibrationAdmission;
  manualConfirmationEvents: number;
  manualReviewVersions: number;
  rollbackWatchVersions: number;
}): OutcomeCalibrationThresholdLayer[] {
  const hasCounterEvidenceBlocker = admission.blockers.includes("counterevidence_dominates") ||
    admission.blockers.includes("loss_cluster");
  const hasValidationBlocker = admission.blockers.includes("validation_rate_below_threshold");

  return [
    {
      current: `${admission.closedEvents} 已关闭`,
      detail: admission.closedEvents >= outcomeCalibrationAdmissionThresholds.minimumClosedSamples
        ? "已关闭样本达到人工校准最低样本地板。"
        : "已关闭样本不足，继续等待 outcome executor 写回。",
      id: "sample_floor",
      label: "样本地板",
      nextStep: admission.closedEvents >= outcomeCalibrationAdmissionThresholds.minimumClosedSamples
        ? "可以继续看有效率和反证压力。"
        : "继续积累已关闭样本，不进入确认流程。",
      status: admission.closedEvents >= outcomeCalibrationAdmissionThresholds.minimumClosedSamples
        ? "ready"
        : "collecting",
      target: `>= ${outcomeCalibrationAdmissionThresholds.minimumClosedSamples} 已关闭样本`,
    },
    {
      current: `${admission.validationRatePercent}% 有效率`,
      detail: "有效率只用于人工校准准入，不能直接升级策略权重。",
      id: "validation_quality",
      label: "有效率阈值",
      nextStep: hasValidationBlocker
        ? "有效率不足，先复核样本边界和反证原因。"
        : "有效率达到基础线后仍需人工确认。",
      status: hasValidationBlocker
        ? "blocked"
        : admission.closedEvents >= outcomeCalibrationAdmissionThresholds.minimumClosedSamples
          ? "ready"
          : "collecting",
      target: `>= ${outcomeCalibrationAdmissionThresholds.minimumValidationRate}% 有效已关闭样本`,
    },
    {
      current: `${admission.counterEvidenceEvents} 反证 / ${admission.validatedEvents} 有效`,
      detail: "反证不能压过有效样本；一旦反证占优，策略只能降级或进入观察。",
      id: "counterevidence_pressure",
      label: "反证压力",
      nextStep: hasCounterEvidenceBlocker
        ? "先冻结加权讨论，拆解失败路径。"
        : "保留反证监控，等待更多样本验证。",
      status: hasCounterEvidenceBlocker
        ? "blocked"
        : admission.counterEvidenceEvents > 0
          ? "watch"
          : "ready",
      target: "反证不高于有效样本，且亏损不形成聚集",
    },
    {
      current: `${manualConfirmationEvents} 个人工确认`,
      detail: "策略版本必须经过人工确认后才能进入长期表现观察。",
      id: "manual_confirmation",
      label: "人工确认",
      nextStep: manualConfirmationEvents > 0
        ? "继续观察确认后样本。"
        : "等待人工确认策略版本和适用边界。",
      status: manualConfirmationEvents > 0
        ? "ready"
        : admission.manualCalibrationReady
          ? "watch"
          : "collecting",
      target: ">= 1 个人工确认版本",
    },
    {
      current: `${rollbackWatchVersions} 回滚观察 / ${manualReviewVersions} 人工复核`,
      detail: "确认后反证会触发回滚观察；该层只冻结加权讨论，不写权重。",
      id: "rollback_pressure",
      label: "回滚压力",
      nextStep: rollbackWatchVersions > 0
        ? "进入人工回滚复核，不能自动改权重。"
        : "继续按确认后样本观察保留、复核或回滚边界。",
      status: rollbackWatchVersions > 0
        ? "watch"
        : manualConfirmationEvents > 0
          ? "collecting"
          : "collecting",
      target: "0 个回滚观察版本，或明确人工降级理由",
    },
  ];
}

function rollbackPlan({
  manualConfirmationEvents,
  manualReviewVersions,
  pendingCalibrationReviews,
  retainedObservationVersions,
  rollbackWatchVersions,
  sampleGateReady,
}: {
  manualConfirmationEvents: number;
  manualReviewVersions: number;
  pendingCalibrationReviews: number;
  retainedObservationVersions: number;
  rollbackWatchVersions: number;
  sampleGateReady: boolean;
}): OutcomeCalibrationRollbackPlan {
  let stage: OutcomeCalibrationRollbackPlanStage = "collect_samples";
  let severity: OutcomeCalibrationRollbackPlan["severity"] = "low";
  let trigger = "样本仍在收集中，尚未进入策略版本回滚判断。";
  let nextStepText = "继续积累 outcome 样本和校准复盘，不进入权重讨论。";

  if (rollbackWatchVersions > 0) {
    stage = "freeze_weight_discussion";
    severity = "high";
    trigger = `${rollbackWatchVersions} 个确认版本触发回滚观察。`;
    nextStepText = "冻结加权讨论，人工复核失败路径、适用市场和版本边界。";
  } else if (manualReviewVersions > 0) {
    stage = "manual_review";
    severity = "medium";
    trigger = `${manualReviewVersions} 个确认版本表现分歧。`;
    nextStepText = "人工复核样本质量和市场环境，不升级也不回滚。";
  } else if (manualConfirmationEvents > 0 || retainedObservationVersions > 0) {
    stage = "observe_confirmed_version";
    severity = "low";
    trigger = `${manualConfirmationEvents} 个版本处于确认后观察。`;
    nextStepText = "保留观察，继续积累确认后样本，人工确认前不改权重。";
  } else if (sampleGateReady) {
    stage = "awaiting_manual_confirmation";
    severity = "medium";
    trigger = "样本已过准入门槛，但缺少人工确认版本。";
    nextStepText = "等待人工确认策略版本和适用边界。";
  }

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    checkpoints: [
      {
        detail: `${manualConfirmationEvents} 个人工确认版本。`,
        id: "confirm_version",
        label: "确认版本",
        nextStep: manualConfirmationEvents > 0 ? "进入确认后样本观察。" : "先人工确认策略版本。",
        status: manualConfirmationEvents > 0 ? "complete" : sampleGateReady ? "ready" : "waiting",
      },
      {
        detail: `${pendingCalibrationReviews} 个校准复盘仍待复查。`,
        id: "observe_followups",
        label: "观察样本",
        nextStep: pendingCalibrationReviews > 0 ? "等待样本关闭，不能提前判断。" : "用已关闭样本判断保留、复核或回滚。",
        status: pendingCalibrationReviews > 0 ? "collecting" : manualConfirmationEvents > 0 ? "complete" : "waiting",
      },
      {
        detail: `${rollbackWatchVersions} 回滚观察 / ${retainedObservationVersions} 保留观察。`,
        id: "freeze_or_retain",
        label: "冻结或保留",
        nextStep: nextStepText,
        status: rollbackWatchVersions > 0 ? "watch" : retainedObservationVersions > 0 ? "complete" : "waiting",
      },
    ],
    guardrail: "回滚计划只服务人工复核和版本边界，不自动写入策略权重。",
    mode: "manual_rollback_plan",
    nextStep: nextStepText,
    severity,
    stage,
    trigger,
  };
}

export function buildOutcomeCalibrationFlow(events: JournalEvent[]): OutcomeCalibrationFlow {
  const admission = buildOutcomeCalibrationAdmission(events);
  const calibrationReviews = events.filter(isCalibrationReview);
  const manualConfirmations = events.filter(isManualStrategyConfirmation);
  const pendingCalibrationReviews = calibrationReviews.filter((event) => calibrationBucket(event) === "pending").length;
  const performances = manualConfirmations.map((event) => buildConfirmationPerformance(event, calibrationReviews));
  const rollbackWatchVersions = performances.filter((item) => item.status === "rollback_watch").length;
  const manualReviewVersions = performances.filter((item) => item.status === "manual_review_required").length;
  const retainedObservationVersions = performances.filter((item) => item.status === "retain_observation").length;
  const status = flowStatus({
    admissionStatus: admission.status,
    manualConfirmationEvents: manualConfirmations.length,
    rollbackWatchVersions,
    sampleGateReady: admission.manualCalibrationReady,
  });
  const layers = thresholdLayers({
    admission,
    manualConfirmationEvents: manualConfirmations.length,
    manualReviewVersions,
    rollbackWatchVersions,
  });
  const manualRollbackPlan = rollbackPlan({
    manualConfirmationEvents: manualConfirmations.length,
    manualReviewVersions,
    pendingCalibrationReviews,
    retainedObservationVersions,
    rollbackWatchVersions,
    sampleGateReady: admission.manualCalibrationReady,
  });

  return {
    admissionStatus: admission.status,
    allowedUse: "research_only",
    autoWeightEligible: false,
    blockerDetails: admission.blockers.map(blockerDetail),
    calibrationReviewEvents: calibrationReviews.length,
    canAutoAdjustWeights: false,
    checkpoints: [
      sampleCheckpoint(admission.status, admission.manualCalibrationReady),
      manualCheckpoint({
        calibrationReviewEvents: calibrationReviews.length,
        manualConfirmationEvents: manualConfirmations.length,
        sampleGateReady: admission.manualCalibrationReady,
      }),
      rollbackCheckpoint({
        manualConfirmationEvents: manualConfirmations.length,
        rollbackWatchVersions,
      }),
    ],
    confirmedStrategyVersions: manualConfirmations.length,
    guardrail: "outcome 校准流只读展示样本准入、人工确认和回滚边界，不能自动改权重。",
    manualConfirmationEvents: manualConfirmations.length,
    manualReviewVersions,
    mode: "outcome_calibration_readonly_flow",
    nextStep: nextStep(status),
    pendingCalibrationReviews,
    retainedObservationVersions,
    rollbackWatchVersions,
    sampleBreakdown: sampleBreakdown(calibrationReviews),
    sampleDrilldown: sampleDrilldown(calibrationReviews),
    sampleGateReady: admission.manualCalibrationReady,
    status,
    thresholdLayers: layers,
    rollbackPlan: manualRollbackPlan,
  };
}
