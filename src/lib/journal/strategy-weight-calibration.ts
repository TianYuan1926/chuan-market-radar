import type { JournalEvent } from "@/lib/analysis/types";

export type StrategyWeightCalibrationStatus =
  | "blocked"
  | "collecting"
  | "manual_review_ready"
  | "rollback_watch";

export type StrategyWeightCalibrationRecommendation =
  | "decrease_candidate"
  | "hold_observation"
  | "increase_candidate"
  | "quarantine_candidate";

export type StrategyWeightManualAdjustmentBand =
  | "decrease_small"
  | "increase_small"
  | "no_change"
  | "quarantine";

export type StrategyWeightCalibrationCandidate = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  closedSamples: number;
  confidence: "high" | "low" | "medium";
  confirmedVersions: number;
  expiredSamples: number;
  latestConfirmationAt: string | null;
  latestVersionLabel: string | null;
  label: string;
  manualAdjustmentBand: StrategyWeightManualAdjustmentBand;
  nextStep: string;
  pendingSamples: number;
  reason: string;
  recommendation: StrategyWeightCalibrationRecommendation;
  rejectedSamples: number;
  rejectionRatePercent: number;
  sampleCount: number;
  tag: string;
  validatedSamples: number;
  validationRatePercent: number;
};

export type StrategyWeightCalibrationReport = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  candidateCount: number;
  candidates: StrategyWeightCalibrationCandidate[];
  closedSamples: number;
  decreaseCandidates: number;
  guardrail: string;
  increaseCandidates: number;
  mode: "strategy_weight_backtest_calibration_mvp";
  nextStep: string;
  pendingCandidates: number;
  quarantineCandidates: number;
  sampleCount: number;
  status: StrategyWeightCalibrationStatus;
};

type CalibrationBucket = "expired" | "pending" | "rejected" | "validated";

type StrategyConfirmation = {
  createdAt: string;
  tag: string;
  versionLabel: string;
};

const minimumClosedSamplesForIncrease = 5;
const minimumValidationRateForIncrease = 65;
const rollbackRejectedMinimum = 2;
const quarantineRejectedMinimum = 3;

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
  return event.action === "calibration_review" && Boolean(event.calibrationTag);
}

function isStrategyConfirmation(event: JournalEvent) {
  return event.action === "strategy_confirmation" &&
    event.allowedUse === "research_only" &&
    event.canAutoAdjustWeights === false &&
    Boolean(event.strategyTag ?? event.calibrationTag);
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

function calibrationLabel(tag: string) {
  const labels: Record<string, string> = {
    review_funding_pressure: "资金费率复核",
    review_short_side_detection: "空头识别复核",
    review_universe_coverage: "币池覆盖复核",
    review_volume_oi_weight: "成交量/OI 权重复核",
  };

  return labels[tag] ?? tag.replace(/^review_/, "").replace(/_/g, " ");
}

function recommendationFor({
  closedSamples,
  rejectedSamples,
  validatedSamples,
  validationRatePercent,
}: {
  closedSamples: number;
  rejectedSamples: number;
  validatedSamples: number;
  validationRatePercent: number;
}): StrategyWeightCalibrationRecommendation {
  if (rejectedSamples >= quarantineRejectedMinimum && rejectedSamples >= validatedSamples) {
    return "quarantine_candidate";
  }

  if (rejectedSamples >= rollbackRejectedMinimum && rejectedSamples > validatedSamples) {
    return "decrease_candidate";
  }

  if (
    closedSamples >= minimumClosedSamplesForIncrease &&
    validationRatePercent >= minimumValidationRateForIncrease &&
    rejectedSamples <= 1
  ) {
    return "increase_candidate";
  }

  return "hold_observation";
}

function confidenceFor({
  closedSamples,
  recommendation,
}: {
  closedSamples: number;
  recommendation: StrategyWeightCalibrationRecommendation;
}): StrategyWeightCalibrationCandidate["confidence"] {
  if (recommendation === "hold_observation") {
    return closedSamples >= 3 ? "medium" : "low";
  }

  return closedSamples >= 8 ? "high" : "medium";
}

function manualAdjustmentBand(
  recommendation: StrategyWeightCalibrationRecommendation,
): StrategyWeightManualAdjustmentBand {
  const bands: Record<StrategyWeightCalibrationRecommendation, StrategyWeightManualAdjustmentBand> = {
    decrease_candidate: "decrease_small",
    hold_observation: "no_change",
    increase_candidate: "increase_small",
    quarantine_candidate: "quarantine",
  };

  return bands[recommendation];
}

function candidateReason({
  recommendation,
  rejectedSamples,
  validatedSamples,
  validationRatePercent,
}: {
  recommendation: StrategyWeightCalibrationRecommendation;
  rejectedSamples: number;
  validatedSamples: number;
  validationRatePercent: number;
}) {
  if (recommendation === "quarantine_candidate") {
    return `反证 ${rejectedSamples} 个形成聚集，候选规则需要隔离观察。`;
  }

  if (recommendation === "decrease_candidate") {
    return `反证 ${rejectedSamples} 个超过有效 ${validatedSamples} 个，只能进入人工降权复核。`;
  }

  if (recommendation === "increase_candidate") {
    return `有效率 ${validationRatePercent}% 达到人工升权候选线，但仍需人工复核。`;
  }

  return "样本不足或表现分歧，继续观察，不进入权重变更讨论。";
}

function candidateNextStep(recommendation: StrategyWeightCalibrationRecommendation) {
  if (recommendation === "quarantine_candidate") {
    return "人工复核失败路径，必要时从决策逻辑隔离或删除该候选。";
  }

  if (recommendation === "decrease_candidate") {
    return "人工复核反证样本和适用市场，只能形成降权候选，不自动改权重。";
  }

  if (recommendation === "increase_candidate") {
    return "人工复核样本边界、确认版本和回滚计划，确认前不自动升权。";
  }

  return "继续积累已关闭样本，暂不形成权重变更候选。";
}

function confirmationTag(event: JournalEvent) {
  return event.strategyTag ?? event.calibrationTag ?? "";
}

function strategyConfirmations(events: JournalEvent[]) {
  return events
    .filter(isStrategyConfirmation)
    .map<StrategyConfirmation>((event) => ({
      createdAt: event.createdAt,
      tag: confirmationTag(event),
      versionLabel: event.strategyVersionLabel ?? "manual-strategy-version",
    }));
}

function buildCandidate(
  tag: string,
  reviews: JournalEvent[],
  confirmations: StrategyConfirmation[],
): StrategyWeightCalibrationCandidate {
  const counts = reviews.reduce<Record<CalibrationBucket, number>>((current, event) => {
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
  const closedSamples = counts.expired + counts.rejected + counts.validated;
  const validationRatePercent = percent(counts.validated, closedSamples);
  const rejectionRatePercent = percent(counts.rejected, closedSamples);
  const recommendation = recommendationFor({
    closedSamples,
    rejectedSamples: counts.rejected,
    validatedSamples: counts.validated,
    validationRatePercent,
  });
  const matchingConfirmations = confirmations
    .filter((confirmation) => confirmation.tag === tag)
    .sort((left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt));

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    closedSamples,
    confidence: confidenceFor({ closedSamples, recommendation }),
    confirmedVersions: matchingConfirmations.length,
    expiredSamples: counts.expired,
    latestConfirmationAt: matchingConfirmations[0]?.createdAt ?? null,
    latestVersionLabel: matchingConfirmations[0]?.versionLabel ?? null,
    label: calibrationLabel(tag),
    manualAdjustmentBand: manualAdjustmentBand(recommendation),
    nextStep: candidateNextStep(recommendation),
    pendingSamples: counts.pending,
    reason: candidateReason({
      recommendation,
      rejectedSamples: counts.rejected,
      validatedSamples: counts.validated,
      validationRatePercent,
    }),
    recommendation,
    rejectedSamples: counts.rejected,
    rejectionRatePercent,
    sampleCount: reviews.length,
    tag,
    validatedSamples: counts.validated,
    validationRatePercent,
  };
}

function reportStatus({
  decreaseCandidates,
  increaseCandidates,
  quarantineCandidates,
}: {
  decreaseCandidates: number;
  increaseCandidates: number;
  quarantineCandidates: number;
}): StrategyWeightCalibrationStatus {
  if (quarantineCandidates > 0) {
    return "blocked";
  }

  if (decreaseCandidates > 0) {
    return "rollback_watch";
  }

  if (increaseCandidates > 0) {
    return "manual_review_ready";
  }

  return "collecting";
}

function reportNextStep(status: StrategyWeightCalibrationStatus) {
  if (status === "blocked") {
    return "存在隔离候选，先人工复核失败路径，不能进入权重变更。";
  }

  if (status === "rollback_watch") {
    return "存在人工降权候选，先复核反证样本和回滚边界。";
  }

  if (status === "manual_review_ready") {
    return "存在人工复核候选，可进入权重校准讨论，但不能自动写入权重。";
  }

  return "继续积累校准样本，暂不进入权重校准讨论。";
}

export function buildStrategyWeightCalibrationReport(
  events: JournalEvent[],
): StrategyWeightCalibrationReport {
  const reviewsByTag = events
    .filter(isCalibrationReview)
    .reduce<Map<string, JournalEvent[]>>((current, event) => {
      const tag = event.calibrationTag as string;
      const items = current.get(tag) ?? [];

      current.set(tag, [...items, event]);

      return current;
    }, new Map());
  const confirmations = strategyConfirmations(events);
  const severityOrder: Record<StrategyWeightCalibrationRecommendation, number> = {
    quarantine_candidate: 0,
    decrease_candidate: 1,
    increase_candidate: 2,
    hold_observation: 3,
  };
  const candidates = [...reviewsByTag.entries()]
    .map(([tag, reviews]) => buildCandidate(tag, reviews, confirmations))
    .sort((left, right) => (
      severityOrder[left.recommendation] - severityOrder[right.recommendation] ||
      right.closedSamples - left.closedSamples ||
      left.label.localeCompare(right.label, "zh-CN")
    ));
  const sampleCount = candidates.reduce((sum, item) => sum + item.sampleCount, 0);
  const closedSamples = candidates.reduce((sum, item) => sum + item.closedSamples, 0);
  const increaseCandidates = candidates.filter((item) => item.recommendation === "increase_candidate").length;
  const decreaseCandidates = candidates.filter((item) => item.recommendation === "decrease_candidate").length;
  const quarantineCandidates = candidates.filter((item) => item.recommendation === "quarantine_candidate").length;
  const pendingCandidates = candidates.filter((item) => item.pendingSamples > 0).length;
  const status = reportStatus({ decreaseCandidates, increaseCandidates, quarantineCandidates });

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    candidateCount: candidates.length,
    candidates,
    closedSamples,
    decreaseCandidates,
    guardrail: "策略权重回测校准 MVP 只输出人工候选和审计边界，不自动写入策略权重。",
    increaseCandidates,
    mode: "strategy_weight_backtest_calibration_mvp",
    nextStep: reportNextStep(status),
    pendingCandidates,
    quarantineCandidates,
    sampleCount,
    status,
  };
}
