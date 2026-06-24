import type {
  JournalEvent,
} from "../analysis/types";
import { buildMissedAltcoinReviews } from "../analysis/v3/missed-altcoin-review";
import type { TrendRadarReview, V3ForwardMapSnapshot } from "../analysis/v3/types";
import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
} from "../market/daily-movers";
import {
  buildDailyMoverSnapshotCorrelation,
  type DailyMoverCorrelationLink,
  type DailyMoverSnapshotCorrelation,
} from "../market/daily-mover-correlations";
import {
  buildDailyMoverKlineBacktestResults,
  buildDailyMoverKlineBacktestPlan,
  type DailyMoverKlineBacktestPlan,
  type DailyMoverKlineBacktestResults,
} from "../market/daily-mover-kline-backtest";
import type { ScanReplayFrame } from "../market/types";
import type { PersistenceMode, PersistenceRepository } from "../persistence/persistence-store";

export type DailyMoverReadLimitInput = string | number | null | undefined;

export type DailyMoverPreview = {
  id: string;
  symbol: string;
  exchange: DailyMover["exchange"];
  direction: DailyMover["direction"];
  rank: number;
  observedAt: string;
  priceChangePercent: number;
  volume24hUsd: number;
};

export type DailyMoverReviewCounts = Record<DailyMoverReview["radarReview"]["status"], number>;

export type DailyMoverAttributionCounts = Record<DailyMoverReview["attribution"]["learnability"], number>;

export type DailyMoverSnapshotSummary = {
  id: string;
  source: DailyMoverSnapshot["source"];
  observedAt: string;
  gainerCount: number;
  loserCount: number;
  reviewCount: number;
  topGainers: DailyMoverPreview[];
  topLosers: DailyMoverPreview[];
  attribution: DailyMoverAttributionCounts;
  radarReview: DailyMoverReviewCounts;
  allowedUse: "research_only";
};

export type DailyMoverSelectedDetail = {
  id: string;
  symbol: string;
  direction: DailyMoverReview["direction"];
  observedAt: string;
  radarStatus: DailyMoverReview["radarReview"]["status"];
  learnability: DailyMoverReview["attribution"]["learnability"];
  evidenceStrength: DailyMoverReview["attribution"]["evidenceStrength"];
  primaryDrivers: DailyMoverReview["attribution"]["primaryDrivers"];
  preMovePattern: DailyMoverReview["preMovePattern"] | null;
  improvementTags: string[];
  correlationStatus: DailyMoverCorrelationLink["status"];
  matchedScanIds: string[];
  matchedSignalIds: string[];
  journalEventIds: string[];
  linkedSignalCount: number;
  whyMissed: string;
  nextReviewAction: string;
  allowedUse: "research_only";
};

export type DailyMoverCalibrationSuggestion = {
  id: string;
  tag: string;
  label: string;
  sampleCount: number;
  symbols: string[];
  evidenceCount: number;
  recommendation: string;
  guardrail: string;
  allowedUse: "research_only";
};

export type DailyMoverCalibrationFeedback = {
  tag: string;
  label: string;
  total: number;
  pending: number;
  validated: number;
  rejected: number;
  expired: number;
  symbols: string[];
  lastReviewedAt?: string;
  nextStep: string;
  guardrail: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverBacktestReadiness = "blocked" | "collecting" | "ready";

export type DailyMoverBacktestCandidate = {
  tag: string;
  label: string;
  sampleCount: number;
  pending: number;
  validated: number;
  rejected: number;
  expired: number;
  symbols: string[];
  lastReviewedAt?: string;
  readiness: DailyMoverBacktestReadiness;
  readinessScore: number;
  evidenceSummary: string;
  nextStep: string;
  guardrail: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverBacktestValidationVerdict =
  | "blocked"
  | "insufficient_data"
  | "needs_more_samples"
  | "review_ready";

export type DailyMoverBacktestValidation = {
  tag: string;
  label: string;
  mode: "historical_sample_validation";
  candidateReadiness: DailyMoverBacktestReadiness;
  journalSampleCount: number;
  validatedJournalSamples: number;
  rejectedJournalSamples: number;
  pendingJournalSamples: number;
  historicalSampleCount: number;
  caughtSamples: number;
  missedSamples: number;
  notLearnableSamples: number;
  validationRatePercent: number;
  caughtRatePercent: number;
  verdict: DailyMoverBacktestValidationVerdict;
  evidenceSummary: string;
  limitation: string;
  nextStep: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverStrategyDraftStatus =
  | "blocked"
  | "confirmed"
  | "manual_review_required"
  | "needs_more_evidence";

export type DailyMoverStrategyConfirmation = {
  eventId: string;
  draftId: string;
  tag: string;
  label: string;
  versionLabel: string;
  confirmedAt: string;
  validationVerdict: string;
  evidenceSummary: string;
  limitation: string;
  manualConfirmation: "confirmed";
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverStrategyPerformanceStatus =
  | "awaiting_samples"
  | "downgrade_watch"
  | "needs_manual_review"
  | "retain_observation";

export type DailyMoverStrategyPerformanceFeedback = {
  confirmationEventId: string;
  draftId: string;
  tag: string;
  label: string;
  versionLabel: string;
  confirmedAt: string;
  followupSampleCount: number;
  pending: number;
  validated: number;
  rejected: number;
  expired: number;
  status: DailyMoverStrategyPerformanceStatus;
  evidenceSummary: string;
  nextStep: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverStrategyVersionPerformanceStatus =
  | "awaiting_samples"
  | "manual_review_required"
  | "retain_observation"
  | "rollback_watch";

export type DailyMoverStrategyVersionThresholdProfile = {
  maxRejectedForRetain: number;
  minimumVerifiedSamples: number;
  retainValidationMinimum: number;
  rollbackRejectionMinimum: number;
  statusReason: string;
};

export type DailyMoverStrategyVersionRollbackPlan = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  guardrail: string;
  mode: "strategy_version_manual_rollback_plan";
  nextStep: string;
  severity: "high" | "low" | "medium";
  stage: "freeze_weight_discussion" | "manual_review" | "retain_observation" | "wait_for_samples";
  trigger: string;
};

export type DailyMoverStrategyVersionPerformance = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  confirmationEventId: string;
  confirmedAt: string;
  draftId: string;
  evidenceSummary: string;
  expired: number;
  followupSampleCount: number;
  label: string;
  mode: "strategy_version_long_term_performance";
  nextStep: string;
  pending: number;
  rejected: number;
  rejectionRatePercent: number;
  rollbackBoundary: string;
  rollbackPlan: DailyMoverStrategyVersionRollbackPlan;
  sampleWindow: "post_confirmation_calibration_reviews";
  status: DailyMoverStrategyVersionPerformanceStatus;
  tag: string;
  thresholdProfile: DailyMoverStrategyVersionThresholdProfile;
  validated: number;
  validationRatePercent: number;
  verifiedSampleCount: number;
  versionLabel: string;
};

export type DailyMoverStrategyDraft = {
  id: string;
  tag: string;
  label: string;
  versionLabel: string;
  sourceMode: "historical_sample_validation";
  validationVerdict: DailyMoverBacktestValidationVerdict;
  status: DailyMoverStrategyDraftStatus;
  manualConfirmation: "confirmed" | "required";
  confirmationEventId?: string;
  confirmedAt?: string;
  evidenceSummary: string;
  limitation: string;
  nextStep: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
};

export type DailyMoverRetention = {
  storage: PersistenceMode;
  scope: string;
  limit: number;
  returned: number;
};

export type DailyMoverCorrelationRetention = {
  scanArchiveLimit: number;
  scanArchivesReturned: number;
  replayFramesReturned: number;
  journalLimit: number;
  journalEventsReturned: number;
};

export type DailyMoverReadArchiveBase = {
  allowedUse: "research_only";
  guardrail: string;
  backtestCandidates: DailyMoverBacktestCandidate[];
  backtestValidations: DailyMoverBacktestValidation[];
  calibrationFeedback: DailyMoverCalibrationFeedback[];
  klineBacktestPlan: DailyMoverKlineBacktestPlan;
  klineBacktestResults: DailyMoverKlineBacktestResults;
  strategyDrafts: DailyMoverStrategyDraft[];
  strategyConfirmations: DailyMoverStrategyConfirmation[];
  strategyPerformanceFeedback: DailyMoverStrategyPerformanceFeedback[];
  strategyVersionPerformance: DailyMoverStrategyVersionPerformance[];
  missedAltcoinReviews: TrendRadarReview[];
  latestSnapshot: DailyMoverSnapshot | null;
  calibrationSuggestions: DailyMoverCalibrationSuggestion[];
  selectedSnapshot: DailyMoverSnapshot | null;
  selectedCorrelation: DailyMoverSnapshotCorrelation | null;
  selectedDetails: DailyMoverSelectedDetail[];
  snapshots: DailyMoverSnapshotSummary[];
  correlationRetention: DailyMoverCorrelationRetention;
  retention: DailyMoverRetention;
};

export type DailyMoverReadArchiveSuccess = DailyMoverReadArchiveBase & {
  ok: true;
};

export type DailyMoverReadArchiveFailure = DailyMoverReadArchiveBase & {
  ok: false;
  error: "daily_mover_snapshot_not_found";
};

export type DailyMoverReadArchiveResult = {
  status: 200 | 404;
  body: DailyMoverReadArchiveSuccess | DailyMoverReadArchiveFailure;
};

export type GetDailyMoverReadArchiveOptions = {
  repository: PersistenceRepository;
  id?: string | null;
  limit?: DailyMoverReadLimitInput;
};

const defaultReadLimit = 14;
const maxReadLimit = 30;
const moverPreviewLimit = 5;
const correlationScanArchiveLimit = 12;
const correlationJournalLimit = 80;
const klineCacheReadLimit = 120;
const dailyMoverGuardrail = "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。";
const optionalDailyMoverTableNames = [
  "daily_mover_snapshots",
  "daily_mover_assets",
  "mover_attribution_reviews",
  "radar_miss_reviews",
  "ohlcv_candle_cache",
  "v3_forward_map_snapshots",
];

export function normalizeDailyMoverReadLimit(value: DailyMoverReadLimitInput) {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(value ?? "", 10);
  const fallback = Number.isFinite(parsed) ? parsed : defaultReadLimit;

  return Math.min(maxReadLimit, Math.max(1, Math.trunc(fallback)));
}

function previewMover(mover: DailyMover): DailyMoverPreview {
  return {
    id: mover.id,
    symbol: mover.symbol,
    exchange: mover.exchange,
    direction: mover.direction,
    rank: mover.rank,
    observedAt: mover.observedAt,
    priceChangePercent: mover.priceChangePercent,
    volume24hUsd: mover.volume24hUsd,
  };
}

function emptyAttributionCounts(): DailyMoverAttributionCounts {
  return {
    learnable: 0,
    watchlist: 0,
    not_learnable: 0,
  };
}

function emptyRadarReviewCounts(): DailyMoverReviewCounts {
  return {
    caught: 0,
    missed: 0,
    not_learnable: 0,
  };
}

function countAttribution(reviews: DailyMoverReview[]) {
  const counts = emptyAttributionCounts();

  for (const review of reviews) {
    counts[review.attribution.learnability] += 1;
  }

  return counts;
}

function countRadarReview(reviews: DailyMoverReview[]) {
  const counts = emptyRadarReviewCounts();

  for (const review of reviews) {
    counts[review.radarReview.status] += 1;
  }

  return counts;
}

function detailReason(status: DailyMoverCorrelationLink["status"]) {
  return {
    caught_unreviewed: "雷达提前留下匹配扫描，但还缺少复盘日记验证。",
    caught_with_journal: "雷达提前留下匹配扫描，且后续已有复盘日记。",
    missed_with_evidence: "雷达没有在选中样本窗口内留下匹配扫描，但样本存在可学习驱动。",
    not_learnable: "样本被标记为不可学习，不能用来调高规则权重。",
    unlinked: "样本还没有足够扫描或日记关联，先检查覆盖率和数据质量。",
  }[status];
}

function calibrationLabel(tag: string) {
  return {
    review_pre_move_window_weight: "启动前窗口权重复核",
    review_short_side_detection: "空头检测复核",
    review_universe_coverage: "扫描覆盖复核",
    review_volume_oi_weight: "成交量/OI 权重复核",
  }[tag] ?? "规则复核";
}

function calibrationRecommendation(tag: string) {
  return {
    review_pre_move_window_weight: "候选建议：复核启动前 1h/3h/6h/12h/24h/3d 窗口的晋级条件，先验证更多样本，再考虑调整轻扫到深扫权重。",
    review_short_side_detection: "候选建议：复核下跌样本的方向识别，不用单个样本直接提高下跌方向权重。",
    review_universe_coverage: "候选建议：复核币种池覆盖和轮询优先级，先确认是否漏扫再考虑规则调整。",
    review_volume_oi_weight: "候选建议：复核成交量/OI 权重是否低估了提前扩张，必须用更多样本验证后再调整。",
  }[tag] ?? "候选建议：进入人工复盘和后续回测，不自动修改当前策略权重。";
}

function sortableTime(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function calibrationOutcomeBucket(
  event: JournalEvent,
): "expired" | "pending" | "rejected" | "validated" {
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

function calibrationNextStep({
  pending,
  rejected,
  total,
  validated,
}: {
  pending: number;
  rejected: number;
  total: number;
  validated: number;
}) {
  if (total < 3 || pending > 0) {
    return "继续积累样本，只记录反馈趋势。";
  }

  if (validated >= 2 && rejected === 0) {
    return "进入回测候选，仍需人工确认。";
  }

  if (rejected > validated) {
    return "保留为反证样本，暂不提高权重。";
  }

  return "继续观察更多样本，再判断是否进入回测。";
}

export function buildDailyMoverCalibrationFeedback(
  journalEvents: JournalEvent[],
): DailyMoverCalibrationFeedback[] {
  const grouped = new Map<string, {
    expired: number;
    events: JournalEvent[];
    pending: number;
    rejected: number;
    symbolsByRecency: string[];
    validated: number;
  }>();

  for (const event of journalEvents) {
    if (event.action !== "calibration_review" || !event.calibrationTag) {
      continue;
    }

    const current = grouped.get(event.calibrationTag) ?? {
      expired: 0,
      events: [],
      pending: 0,
      rejected: 0,
      symbolsByRecency: [],
      validated: 0,
    };
    const bucket = calibrationOutcomeBucket(event);

    current[bucket] += 1;
    current.events = [...current.events, event];
    current.symbolsByRecency = [
      ...(event.sampleSymbols ?? [event.symbol]).filter(Boolean),
      ...current.symbolsByRecency,
    ];
    grouped.set(event.calibrationTag, current);
  }

  return [...grouped.entries()]
    .map(([tag, item]) => {
      const total = item.events.length;
      const symbols = [...new Set(item.symbolsByRecency)].slice(0, 6);
      const lastReviewedAt = item.events
        .map((event) => event.createdAt)
        .sort((left, right) => sortableTime(right) - sortableTime(left))[0];

      return {
        tag,
        label: calibrationLabel(tag),
        total,
        pending: item.pending,
        validated: item.validated,
        rejected: item.rejected,
        expired: item.expired,
        symbols,
        lastReviewedAt,
        nextStep: calibrationNextStep({
          pending: item.pending,
          rejected: item.rejected,
          total,
          validated: item.validated,
        }),
        guardrail: "校准反馈只能作为只读趋势和回测候选，不能自动改权重。",
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    })
    .sort((first, second) => (
      second.total - first.total ||
      sortableTime(second.lastReviewedAt) - sortableTime(first.lastReviewedAt) ||
      first.label.localeCompare(second.label, "zh-CN")
    ));
}

function backtestReadiness(feedback: DailyMoverCalibrationFeedback): DailyMoverBacktestReadiness {
  if (feedback.rejected > feedback.validated || feedback.rejected >= 2) {
    return "blocked";
  }

  if (feedback.total >= 3 && feedback.pending === 0 && feedback.validated >= 2 && feedback.rejected === 0) {
    return "ready";
  }

  return "collecting";
}

function backtestReadinessScore(
  feedback: DailyMoverCalibrationFeedback,
  readiness: DailyMoverBacktestReadiness,
) {
  if (readiness === "ready") {
    return 100;
  }

  if (readiness === "blocked") {
    return Math.max(0, Math.min(45, (feedback.validated * 12) - (feedback.rejected * 16)));
  }

  return Math.max(0, Math.min(85, (
    feedback.total * 12
    + feedback.validated * 18
    - feedback.pending * 10
    - feedback.rejected * 20
  )));
}

function backtestNextStep(readiness: DailyMoverBacktestReadiness) {
  if (readiness === "ready") {
    return "进入人工回测候选；验证历史样本命中率后再人工确认，不能自动改权重。";
  }

  if (readiness === "blocked") {
    return "反证样本占优，先保留为反证库观察，不能提高权重。";
  }

  return "继续积累样本，只记录候选趋势，不能自动改权重。";
}

export function buildDailyMoverBacktestCandidates(
  feedbackItems: DailyMoverCalibrationFeedback[],
): DailyMoverBacktestCandidate[] {
  const readinessOrder: Record<DailyMoverBacktestReadiness, number> = {
    ready: 0,
    collecting: 1,
    blocked: 2,
  };

  return feedbackItems
    .map((feedback) => {
      const readiness = backtestReadiness(feedback);

      return {
        tag: feedback.tag,
        label: feedback.label,
        sampleCount: feedback.total,
        pending: feedback.pending,
        validated: feedback.validated,
        rejected: feedback.rejected,
        expired: feedback.expired,
        symbols: feedback.symbols,
        lastReviewedAt: feedback.lastReviewedAt,
        readiness,
        readinessScore: backtestReadinessScore(feedback, readiness),
        evidenceSummary: `${feedback.total} 样本 / ${feedback.validated} 有效 / ${feedback.rejected} 反证 / ${feedback.pending} 待复查`,
        nextStep: backtestNextStep(readiness),
        guardrail: "回测候选只能进入人工验证和策略版本记录，不能自动改权重。",
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    })
    .sort((first, second) => (
      readinessOrder[first.readiness] - readinessOrder[second.readiness]
      || second.readinessScore - first.readinessScore
      || sortableTime(second.lastReviewedAt) - sortableTime(first.lastReviewedAt)
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function reviewMatchesBacktestCandidate(
  candidate: DailyMoverBacktestCandidate,
  review: DailyMoverReview,
) {
  return candidate.symbols.includes(review.symbol)
    || review.radarReview.improvementTags.includes(candidate.tag);
}

function backtestValidationVerdict({
  candidate,
  historicalSampleCount,
  validationRatePercent,
  verifiedJournalSamples,
}: {
  candidate: DailyMoverBacktestCandidate;
  historicalSampleCount: number;
  validationRatePercent: number;
  verifiedJournalSamples: number;
}): DailyMoverBacktestValidationVerdict {
  if (candidate.readiness === "blocked") {
    return "blocked";
  }

  if (verifiedJournalSamples === 0 && historicalSampleCount === 0) {
    return "insufficient_data";
  }

  if (candidate.readiness === "ready" && verifiedJournalSamples >= 3 && historicalSampleCount >= 2 && validationRatePercent >= 60) {
    return "review_ready";
  }

  return "needs_more_samples";
}

function backtestValidationNextStep(verdict: DailyMoverBacktestValidationVerdict) {
  if (verdict === "review_ready") {
    return "可以进入策略版本草案，但仍需人工复核样本边界，不能自动改权重。";
  }

  if (verdict === "blocked") {
    return "反证样本优先，先保留为反证验证结果，不能提高权重。";
  }

  if (verdict === "insufficient_data") {
    return "历史样本不足，继续积累快照和校准日记。";
  }

  return "继续补样本，等日记验证和历史样本都更充分后再复核。";
}

export function buildDailyMoverBacktestValidations(
  candidates: DailyMoverBacktestCandidate[],
  snapshots: DailyMoverSnapshot[],
): DailyMoverBacktestValidation[] {
  const reviews = snapshots.flatMap((snapshot) => snapshot.reviews);

  return candidates.map((candidate) => {
    const matchedReviews = reviews.filter((review) => reviewMatchesBacktestCandidate(candidate, review));
    const verifiedJournalSamples = candidate.validated + candidate.rejected;
    const validationRatePercent = percent(candidate.validated, verifiedJournalSamples);
    const caughtSamples = matchedReviews.filter((review) => review.radarReview.status === "caught").length;
    const missedSamples = matchedReviews.filter((review) => review.radarReview.status === "missed").length;
    const notLearnableSamples = matchedReviews.filter((review) => (
      review.radarReview.status === "not_learnable"
      || review.attribution.learnability === "not_learnable"
    )).length;
    const caughtRatePercent = percent(caughtSamples, matchedReviews.length);
    const verdict = backtestValidationVerdict({
      candidate,
      historicalSampleCount: matchedReviews.length,
      validationRatePercent,
      verifiedJournalSamples,
    });

    return {
      tag: candidate.tag,
      label: candidate.label,
      mode: "historical_sample_validation" as const,
      candidateReadiness: candidate.readiness,
      journalSampleCount: candidate.sampleCount,
      validatedJournalSamples: candidate.validated,
      rejectedJournalSamples: candidate.rejected,
      pendingJournalSamples: candidate.pending,
      historicalSampleCount: matchedReviews.length,
      caughtSamples,
      missedSamples,
      notLearnableSamples,
      validationRatePercent,
      caughtRatePercent,
      verdict,
      evidenceSummary: `历史样本 ${matchedReviews.length} / 日记验证 ${verifiedJournalSamples} / 抓到 ${caughtSamples} / 漏判 ${missedSamples}`,
      limitation: "只基于已存每日异动快照和校准日记，不是完整 K 线回测。",
      nextStep: backtestValidationNextStep(verdict),
      allowedUse: "research_only" as const,
      canAutoAdjustWeights: false as const,
    };
  });
}

function strategyDraftStatus(
  verdict: DailyMoverBacktestValidationVerdict,
): DailyMoverStrategyDraftStatus {
  if (verdict === "review_ready") {
    return "manual_review_required";
  }

  if (verdict === "blocked") {
    return "blocked";
  }

  return "needs_more_evidence";
}

function strategyDraftNextStep(status: DailyMoverStrategyDraftStatus) {
  if (status === "confirmed") {
    return "已完成人工确认，作为策略版本记录保留；仍不能自动改权重。";
  }

  if (status === "manual_review_required") {
    return "进入策略版本草案；必须人工确认样本边界后才能记录版本，不能自动改权重。";
  }

  if (status === "blocked") {
    return "反证优先，暂缓进入策略版本，保留为限制条件。";
  }

  return "继续补充日记验证和历史样本，暂不进入策略版本。";
}

function strategyDraftVersionLabel(tag: string) {
  return `draft-${tag.replace(/^review_/, "").replace(/_/g, "-")}-v1`;
}

function isResearchOnlyConfirmation(event: JournalEvent) {
  return event.action === "strategy_confirmation"
    && event.source === "strategy_version_confirmation"
    && event.allowedUse === "research_only"
    && event.canAutoAdjustWeights === false
    && typeof event.strategyDraftId === "string"
    && typeof event.strategyTag === "string"
    && typeof event.strategyVersionLabel === "string";
}

export function buildDailyMoverStrategyConfirmations(
  journalEvents: JournalEvent[],
): DailyMoverStrategyConfirmation[] {
  return journalEvents
    .filter(isResearchOnlyConfirmation)
    .map((event) => ({
      eventId: event.id,
      draftId: event.strategyDraftId as string,
      tag: event.strategyTag as string,
      label: event.strategyLabel ?? calibrationLabel(event.strategyTag as string),
      versionLabel: event.strategyVersionLabel as string,
      confirmedAt: event.createdAt,
      validationVerdict: event.strategyValidationVerdict ?? "unknown",
      evidenceSummary: event.strategyEvidenceSummary ?? event.thesis ?? "确认事件缺少样本摘要。",
      limitation: event.strategyLimitation ?? "确认事件缺少限制说明。",
      manualConfirmation: "confirmed" as const,
      allowedUse: "research_only" as const,
      canAutoAdjustWeights: false as const,
    }))
    .sort((first, second) => (
      sortableTime(second.confirmedAt) - sortableTime(first.confirmedAt)
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

function strategyPerformanceStatus({
  followupSampleCount,
  pending,
  rejected,
  validated,
}: {
  followupSampleCount: number;
  pending: number;
  rejected: number;
  validated: number;
}): DailyMoverStrategyPerformanceStatus {
  if (followupSampleCount === 0 || pending > 0) {
    return "awaiting_samples";
  }

  if (rejected >= 2 && rejected > validated) {
    return "downgrade_watch";
  }

  if (validated >= 2 && rejected === 0) {
    return "retain_observation";
  }

  return "needs_manual_review";
}

function strategyPerformanceNextStep(status: DailyMoverStrategyPerformanceStatus) {
  if (status === "awaiting_samples") {
    return "继续积累确认后样本，只记录表现，不自动改权重。";
  }

  if (status === "retain_observation") {
    return "保留为观察版本，后续仍需人工复核，不能自动改权重。";
  }

  if (status === "downgrade_watch") {
    return "确认后反证占优，降级为观察/限制条件，不能自动改权重。";
  }

  return "确认后表现分歧，人工复核样本边界和适用条件，不能自动改权重。";
}

export function buildDailyMoverStrategyPerformanceFeedback(
  confirmations: DailyMoverStrategyConfirmation[],
  journalEvents: JournalEvent[],
): DailyMoverStrategyPerformanceFeedback[] {
  const statusOrder: Record<DailyMoverStrategyPerformanceStatus, number> = {
    downgrade_watch: 0,
    needs_manual_review: 1,
    awaiting_samples: 2,
    retain_observation: 3,
  };

  return confirmations
    .map((confirmation) => {
      const confirmedAt = sortableTime(confirmation.confirmedAt);
      const followupEvents = journalEvents.filter((event) => (
        event.action === "calibration_review"
        && event.calibrationTag === confirmation.tag
        && sortableTime(event.createdAt) > confirmedAt
      ));
      const counts = followupEvents.reduce((current, event) => {
        const bucket = calibrationOutcomeBucket(event);

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
      const followupSampleCount = followupEvents.length;
      const status = strategyPerformanceStatus({
        followupSampleCount,
        pending: counts.pending,
        rejected: counts.rejected,
        validated: counts.validated,
      });

      return {
        confirmationEventId: confirmation.eventId,
        draftId: confirmation.draftId,
        tag: confirmation.tag,
        label: confirmation.label,
        versionLabel: confirmation.versionLabel,
        confirmedAt: confirmation.confirmedAt,
        followupSampleCount,
        pending: counts.pending,
        validated: counts.validated,
        rejected: counts.rejected,
        expired: counts.expired,
        status,
        evidenceSummary: `${followupSampleCount} 后续样本 / ${counts.validated} 有效 / ${counts.rejected} 反证 / ${counts.pending} 待复查 / ${counts.expired} 过期`,
        nextStep: strategyPerformanceNextStep(status),
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    })
    .sort((first, second) => (
      statusOrder[first.status] - statusOrder[second.status]
      || sortableTime(second.confirmedAt) - sortableTime(first.confirmedAt)
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

const strategyVersionThresholds = {
  maxRejectedForRetain: 1,
  minimumVerifiedSamples: 3,
  retainValidationMinimum: 3,
  rollbackRejectionMinimum: 2,
} as const;

function strategyVersionPerformanceStatus({
  pending,
  rejected,
  validated,
  verifiedSampleCount,
}: {
  pending: number;
  rejected: number;
  validated: number;
  verifiedSampleCount: number;
}): DailyMoverStrategyVersionPerformanceStatus {
  if (verifiedSampleCount < strategyVersionThresholds.minimumVerifiedSamples || pending > 0) {
    return "awaiting_samples";
  }

  if (rejected >= strategyVersionThresholds.rollbackRejectionMinimum && rejected > validated) {
    return "rollback_watch";
  }

  if (
    validated >= strategyVersionThresholds.retainValidationMinimum &&
    rejected <= strategyVersionThresholds.maxRejectedForRetain
  ) {
    return "retain_observation";
  }

  return "manual_review_required";
}

function strategyVersionRollbackBoundary(
  status: DailyMoverStrategyVersionPerformanceStatus,
) {
  if (status === "rollback_watch") {
    return "触发回滚观察：确认后反证样本超过有效样本，冻结加权讨论，先人工复核适用条件。";
  }

  if (status === "retain_observation") {
    return "保留观察：确认后有效样本占优，但仍需人工复核，不能自动升级权重。";
  }

  if (status === "manual_review_required") {
    return "表现分歧：不回滚也不升级，先人工复核样本边界和适用市场。";
  }

  return "样本不足或仍有待复查：暂不触发回滚或升级判断。";
}

function strategyVersionNextStep(
  status: DailyMoverStrategyVersionPerformanceStatus,
) {
  if (status === "rollback_watch") {
    return "进入人工复核和版本回滚观察；只冻结加权讨论，不自动改权重。";
  }

  if (status === "retain_observation") {
    return "保留为观察版本，继续积累后续样本；人工确认前不自动改权重。";
  }

  if (status === "manual_review_required") {
    return "确认后表现分歧，人工复核规则适用条件和失败路径。";
  }

  return "继续积累确认后样本，先不做版本回滚或升级判断。";
}

function strategyVersionStatusReason({
  pending,
  rejected,
  status,
  validated,
  verifiedSampleCount,
}: {
  pending: number;
  rejected: number;
  status: DailyMoverStrategyVersionPerformanceStatus;
  validated: number;
  verifiedSampleCount: number;
}) {
  if (status === "rollback_watch") {
    return `反证 ${rejected} 个超过有效 ${validated} 个，达到回滚观察阈值。`;
  }

  if (status === "retain_observation") {
    return `有效 ${validated} 个达到保留观察阈值，反证 ${rejected} 个未超过上限。`;
  }

  if (status === "manual_review_required") {
    return "有效和反证没有形成明确方向，需要人工复核样本边界。";
  }

  return `已验证 ${verifiedSampleCount} 个 / 待复查 ${pending} 个，样本不足或仍未关闭。`;
}

function buildStrategyVersionThresholdProfile({
  pending,
  rejected,
  status,
  validated,
  verifiedSampleCount,
}: {
  pending: number;
  rejected: number;
  status: DailyMoverStrategyVersionPerformanceStatus;
  validated: number;
  verifiedSampleCount: number;
}): DailyMoverStrategyVersionThresholdProfile {
  return {
    ...strategyVersionThresholds,
    statusReason: strategyVersionStatusReason({
      pending,
      rejected,
      status,
      validated,
      verifiedSampleCount,
    }),
  };
}

function buildStrategyVersionRollbackPlan(
  status: DailyMoverStrategyVersionPerformanceStatus,
): DailyMoverStrategyVersionRollbackPlan {
  if (status === "rollback_watch") {
    return {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      guardrail: "策略版本回滚计划只服务人工复核，不自动写入权重。",
      mode: "strategy_version_manual_rollback_plan",
      nextStep: "进入人工复核，冻结加权讨论，必要时将版本降级为观察或删除候选。",
      severity: "high",
      stage: "freeze_weight_discussion",
      trigger: "确认后反证样本达到回滚观察阈值。",
    };
  }

  if (status === "manual_review_required") {
    return {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      guardrail: "策略版本回滚计划只服务人工复核，不自动写入权重。",
      mode: "strategy_version_manual_rollback_plan",
      nextStep: "人工复核样本边界和市场适用条件，不升级也不回滚。",
      severity: "medium",
      stage: "manual_review",
      trigger: "确认后表现分歧，没有形成保留或回滚结论。",
    };
  }

  if (status === "retain_observation") {
    return {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      guardrail: "策略版本回滚计划只服务人工复核，不自动写入权重。",
      mode: "strategy_version_manual_rollback_plan",
      nextStep: "保留观察并继续积累样本，后续仍需人工确认。",
      severity: "low",
      stage: "retain_observation",
      trigger: "确认后有效样本达到保留观察阈值。",
    };
  }

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    guardrail: "策略版本回滚计划只服务人工复核，不自动写入权重。",
    mode: "strategy_version_manual_rollback_plan",
    nextStep: "继续等待确认后样本关闭，暂不判断回滚或保留。",
    severity: "low",
    stage: "wait_for_samples",
    trigger: "确认后样本不足或仍有待复查。",
  };
}

export function buildDailyMoverStrategyVersionPerformance(
  feedbackItems: DailyMoverStrategyPerformanceFeedback[],
): DailyMoverStrategyVersionPerformance[] {
  const statusOrder: Record<DailyMoverStrategyVersionPerformanceStatus, number> = {
    rollback_watch: 0,
    manual_review_required: 1,
    awaiting_samples: 2,
    retain_observation: 3,
  };

  return feedbackItems
    .map((item) => {
      const verifiedSampleCount = item.validated + item.rejected + item.expired;
      const status = strategyVersionPerformanceStatus({
        pending: item.pending,
        rejected: item.rejected,
        validated: item.validated,
        verifiedSampleCount,
      });
      const thresholdProfile = buildStrategyVersionThresholdProfile({
        pending: item.pending,
        rejected: item.rejected,
        status,
        validated: item.validated,
        verifiedSampleCount,
      });

      return {
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
        confirmationEventId: item.confirmationEventId,
        confirmedAt: item.confirmedAt,
        draftId: item.draftId,
        evidenceSummary: item.evidenceSummary,
        expired: item.expired,
        followupSampleCount: item.followupSampleCount,
        label: item.label,
        mode: "strategy_version_long_term_performance" as const,
        nextStep: strategyVersionNextStep(status),
        pending: item.pending,
        rejected: item.rejected,
        rejectionRatePercent: percent(item.rejected, verifiedSampleCount),
        rollbackBoundary: strategyVersionRollbackBoundary(status),
        rollbackPlan: buildStrategyVersionRollbackPlan(status),
        sampleWindow: "post_confirmation_calibration_reviews" as const,
        status,
        tag: item.tag,
        thresholdProfile,
        validated: item.validated,
        validationRatePercent: percent(item.validated, verifiedSampleCount),
        verifiedSampleCount,
        versionLabel: item.versionLabel,
      };
    })
    .sort((first, second) => (
      statusOrder[first.status] - statusOrder[second.status]
      || sortableTime(second.confirmedAt) - sortableTime(first.confirmedAt)
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

export function buildDailyMoverStrategyDrafts(
  validations: DailyMoverBacktestValidation[],
  confirmations: DailyMoverStrategyConfirmation[] = [],
): DailyMoverStrategyDraft[] {
  const statusOrder: Record<DailyMoverStrategyDraftStatus, number> = {
    confirmed: 0,
    manual_review_required: 1,
    needs_more_evidence: 2,
    blocked: 3,
  };
  const confirmationsByDraftId = new Map(confirmations.map((confirmation) => [confirmation.draftId, confirmation]));

  return validations
    .map((validation) => {
      const id = `strategy-${validation.tag}`;
      const confirmation = confirmationsByDraftId.get(id);
      const status = confirmation ? "confirmed" : strategyDraftStatus(validation.verdict);

      return {
        id,
        tag: validation.tag,
        label: validation.label,
        versionLabel: confirmation?.versionLabel ?? strategyDraftVersionLabel(validation.tag),
        sourceMode: validation.mode,
        validationVerdict: validation.verdict,
        status,
        manualConfirmation: confirmation ? "confirmed" as const : "required" as const,
        confirmationEventId: confirmation?.eventId,
        confirmedAt: confirmation?.confirmedAt,
        evidenceSummary: validation.evidenceSummary,
        limitation: validation.limitation,
        nextStep: strategyDraftNextStep(status),
        allowedUse: "research_only" as const,
        canAutoAdjustWeights: false as const,
      };
    })
    .sort((first, second) => (
      statusOrder[first.status] - statusOrder[second.status]
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

function buildSelectedDetails(
  snapshot: DailyMoverSnapshot | null,
  correlation: DailyMoverSnapshotCorrelation | null,
): DailyMoverSelectedDetail[] {
  if (!snapshot) {
    return [];
  }

  const linksById = new Map((correlation?.links ?? []).map((link) => [link.moverId, link]));

  return snapshot.reviews.map((review) => {
    const link = linksById.get(review.id);
    const correlationStatus = link?.status ?? "unlinked";

    return {
      id: review.id,
      symbol: review.symbol,
      direction: review.direction,
      observedAt: review.observedAt,
      radarStatus: review.radarReview.status,
      learnability: review.attribution.learnability,
      evidenceStrength: review.attribution.evidenceStrength,
      primaryDrivers: review.attribution.primaryDrivers,
      preMovePattern: review.preMovePattern ?? null,
      improvementTags: review.radarReview.improvementTags,
      correlationStatus,
      matchedScanIds: link?.matchedScanIds ?? [],
      matchedSignalIds: link?.matchedSignalIds ?? review.radarReview.matchedSignalIds,
      journalEventIds: link?.journalEventIds ?? [],
      linkedSignalCount: link?.linkedSignals.length ?? 0,
      whyMissed: detailReason(correlationStatus),
      nextReviewAction: link?.suggestedNextStep ?? "先检查扫描覆盖和样本质量。",
      allowedUse: "research_only",
    };
  });
}

function buildCalibrationSuggestions(
  correlation: DailyMoverSnapshotCorrelation | null,
): DailyMoverCalibrationSuggestion[] {
  if (!correlation) {
    return [];
  }

  const grouped = new Map<string, {
    evidenceCount: number;
    sampleCount: number;
    symbols: string[];
  }>();

  for (const link of correlation.links) {
    if (!link.calibrationCandidate) {
      continue;
    }

    const tags = link.improvementTags.length > 0
      ? link.improvementTags
      : ["review_universe_coverage"];

    for (const tag of tags) {
      const current = grouped.get(tag) ?? {
        evidenceCount: 0,
        sampleCount: 0,
        symbols: [],
      };

      current.evidenceCount += link.matchedScanIds.length + link.matchedSignalIds.length + link.journalEventIds.length;
      current.sampleCount += 1;
      current.symbols = [...new Set([...current.symbols, link.symbol])];
      grouped.set(tag, current);
    }
  }

  return [...grouped.entries()]
    .map(([tag, item]) => ({
      id: `calibration-${tag}`,
      tag,
      label: calibrationLabel(tag),
      sampleCount: item.sampleCount,
      symbols: item.symbols,
      evidenceCount: item.evidenceCount,
      recommendation: calibrationRecommendation(tag),
      guardrail: "候选建议不能自动改权重，只能进入人工复盘和后续回测。",
      allowedUse: "research_only" as const,
    }))
    .sort((first, second) => (
      second.sampleCount - first.sampleCount
      || first.label.localeCompare(second.label, "zh-CN")
    ));
}

export function summarizeDailyMoverSnapshot(snapshot: DailyMoverSnapshot): DailyMoverSnapshotSummary {
  return {
    id: snapshot.id,
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    gainerCount: snapshot.gainers.length,
    loserCount: snapshot.losers.length,
    reviewCount: snapshot.reviews.length,
    topGainers: snapshot.gainers.slice(0, moverPreviewLimit).map(previewMover),
    topLosers: snapshot.losers.slice(0, moverPreviewLimit).map(previewMover),
    attribution: countAttribution(snapshot.reviews),
    radarReview: countRadarReview(snapshot.reviews),
    allowedUse: "research_only",
  };
}

function isMissingOptionalDailyMoverTable(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message : "";

  return code === "42P01"
    && optionalDailyMoverTableNames.some((tableName) => message.includes(tableName));
}

async function listDailyMoverSnapshotsForPublicRead(
  repository: PersistenceRepository,
  limit: number,
) {
  try {
    return await repository.listDailyMoverSnapshots(limit);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return [];
    }

    throw error;
  }
}

async function getDailyMoverSnapshotForPublicRead(
  repository: PersistenceRepository,
  id?: string,
) {
  try {
    return await repository.getDailyMoverSnapshot(id);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return null;
    }

    throw error;
  }
}

async function listOhlcvCandleCachesForPublicRead(
  repository: PersistenceRepository,
) {
  try {
    return await repository.listOhlcvCandleCaches(klineCacheReadLimit);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return [];
    }

    throw error;
  }
}

async function listV3ForwardMapSnapshotsForPublicRead(
  repository: PersistenceRepository,
): Promise<V3ForwardMapSnapshot[]> {
  try {
    return await repository.listV3ForwardMapSnapshots(240);
  } catch (error) {
    if (isMissingOptionalDailyMoverTable(error)) {
      return [];
    }

    throw error;
  }
}

export async function getDailyMoverReadArchive({
  id,
  limit,
  repository,
}: GetDailyMoverReadArchiveOptions): Promise<DailyMoverReadArchiveResult> {
  const normalizedLimit = normalizeDailyMoverReadLimit(limit);
  const [snapshots, scanArchives, journalEvents, ohlcvCaches, v3ForwardMapSnapshots] = await Promise.all([
    listDailyMoverSnapshotsForPublicRead(repository, normalizedLimit),
    repository.listScanArchives(correlationScanArchiveLimit),
    repository.listJournalEvents(correlationJournalLimit),
    listOhlcvCandleCachesForPublicRead(repository),
    listV3ForwardMapSnapshotsForPublicRead(repository),
  ]);
  const latestSnapshot = snapshots[0] ?? await getDailyMoverSnapshotForPublicRead(repository);
  const selectedSnapshot = id
    ? await getDailyMoverSnapshotForPublicRead(repository, id)
    : latestSnapshot;
  const replayFrames = (await Promise.all(
    scanArchives.map((archive) => repository.getScanReplayFrame(archive.id)),
  )).filter((frame): frame is ScanReplayFrame => Boolean(frame));
  const retention = {
    storage: repository.mode,
    scope: repository.scope,
    limit: normalizedLimit,
    returned: snapshots.length,
  };
  const correlationRetention = {
    scanArchiveLimit: correlationScanArchiveLimit,
    scanArchivesReturned: scanArchives.length,
    replayFramesReturned: replayFrames.length,
    journalLimit: correlationJournalLimit,
    journalEventsReturned: journalEvents.length,
  };
  const selectedCorrelation = selectedSnapshot
    ? buildDailyMoverSnapshotCorrelation({
        journalEvents,
        replayFrames,
        scanArchives,
        snapshot: selectedSnapshot,
      })
    : null;
  const missedAltcoinReviews = buildMissedAltcoinReviews({
    correlation: selectedCorrelation,
    observedAt: selectedSnapshot?.observedAt ?? latestSnapshot?.observedAt ?? new Date(0).toISOString(),
    v3Snapshots: v3ForwardMapSnapshots,
  });
  const calibrationFeedback = buildDailyMoverCalibrationFeedback(journalEvents);
  const backtestCandidates = buildDailyMoverBacktestCandidates(calibrationFeedback);
  const klineBacktestPlan = buildDailyMoverKlineBacktestPlan({
    candidates: backtestCandidates,
    snapshots,
  });
  const klineBacktestResults = buildDailyMoverKlineBacktestResults({
    caches: ohlcvCaches,
    plan: klineBacktestPlan,
    snapshots,
  });
  const backtestValidations = buildDailyMoverBacktestValidations(backtestCandidates, snapshots);
  const strategyConfirmations = buildDailyMoverStrategyConfirmations(journalEvents);
  const strategyPerformanceFeedback = buildDailyMoverStrategyPerformanceFeedback(strategyConfirmations, journalEvents);
  const strategyVersionPerformance = buildDailyMoverStrategyVersionPerformance(strategyPerformanceFeedback);
  const base = {
    allowedUse: "research_only" as const,
    backtestCandidates,
    backtestValidations,
    calibrationFeedback,
    calibrationSuggestions: buildCalibrationSuggestions(selectedCorrelation),
    guardrail: dailyMoverGuardrail,
    klineBacktestPlan,
    klineBacktestResults,
    latestSnapshot,
    missedAltcoinReviews,
    selectedSnapshot,
    selectedCorrelation,
    selectedDetails: buildSelectedDetails(selectedSnapshot, selectedCorrelation),
    snapshots: snapshots.map(summarizeDailyMoverSnapshot),
    strategyConfirmations,
    strategyDrafts: buildDailyMoverStrategyDrafts(backtestValidations, strategyConfirmations),
    strategyPerformanceFeedback,
    strategyVersionPerformance,
    correlationRetention,
    retention,
  };

  if (id && !selectedSnapshot) {
    return {
      status: 404,
      body: {
        ...base,
        ok: false,
        error: "daily_mover_snapshot_not_found",
      },
    };
  }

  return {
    status: 200,
    body: {
      ...base,
      ok: true,
    },
  };
}
