import type {
  JournalEvent,
  MarketSignal,
  ReviewCheckpoint,
  SignalMaturityStage,
} from "../analysis/types";

export type ShadowLiveSignalTrackerOptions = {
  maxSignals?: number;
  now?: Date;
  signals: MarketSignal[];
};

export type ShadowLiveSignalTrackerReport = {
  canAutoAdjustWeights: false;
  canPromoteSignals: false;
  entries: JournalEvent[];
  guardrails: string[];
  mode: "shadow_live_signal_tracker.v1";
  planReadyCandidates: number;
  skippedLightScanMarks: number;
  summary: string;
  trackedCandidates: number;
  updatedAt: string;
};

const trackableStages = new Set<SignalMaturityStage>([
  "DEEP_SCAN_CANDIDATE",
  "EVIDENCE_SIGNAL",
  "REVIEW_ONLY",
  "TRADE_PLAN_READY",
]);

const stagePriority: Record<SignalMaturityStage, number> = {
  DEEP_SCAN_CANDIDATE: 2,
  EVIDENCE_SIGNAL: 3,
  LIGHT_SCAN_MARK: 0,
  REVIEW_ONLY: 1,
  TRADE_PLAN_READY: 4,
};

function maturityStage(signal: MarketSignal): SignalMaturityStage {
  return signal.maturity?.stage ?? "LIGHT_SCAN_MARK";
}

function checkpoint(now: Date, id: ReviewCheckpoint["id"], hours: number): ReviewCheckpoint {
  return {
    id,
    label: `${hours}h 影子验证`,
    reviewAt: new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString(),
    status: "pending",
  };
}

function shadowLiveEvent(signal: MarketSignal, now: Date): JournalEvent {
  const stage = maturityStage(signal);
  const strategyStatus = signal.strategy.status ?? "observe_only";
  const sourceId = `shadow-live:${signal.id}:${stage}`;
  const signalSummary = signal.summary || "生产候选进入影子实盘观察。";

  return {
    action: "trend_radar_review",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    createdAt: now.toISOString(),
    direction: signal.direction,
    firstTarget: signal.strategy.targets[0] ?? signal.strategy.takeProfitPlan,
    id: sourceId,
    invalidation: signal.strategy.invalidation,
    lessons: [
      "shadow_live_tracking",
      stage === "TRADE_PLAN_READY" ? "plan_ready_paper_tracking" : "candidate_tracking_only",
      "no_auto_trade",
      "no_auto_weight_change",
    ],
    note: `影子实盘只做纸面验证：${signalSummary}`,
    outcomeStatus: "pending",
    plannedReviewAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    rankDelta: 0,
    result: "watching",
    reviewCheckpoints: [
      checkpoint(now, "4h", 4),
      checkpoint(now, "24h", 24),
      checkpoint(now, "4d", 96),
    ],
    reviewStatus: "tracking",
    riskReward: signal.strategy.riskReward,
    signalId: signal.id,
    signalMaturityStage: stage,
    source: "trend_radar_review_executor",
    sourceId,
    strategyStatus,
    symbol: signal.symbol,
    thesis: signalSummary,
    timeframe: signal.timeframe,
    title: `${signal.symbol} 影子实盘跟踪`,
    trigger: signal.strategy.entry,
  };
}

export function buildShadowLiveSignalTrackerReport({
  maxSignals = 30,
  now = new Date(),
  signals,
}: ShadowLiveSignalTrackerOptions): ShadowLiveSignalTrackerReport {
  const sorted = [...signals]
    .filter((signal) => trackableStages.has(maturityStage(signal)))
    .sort((left, right) => {
      const leftPriority = stagePriority[maturityStage(left)];
      const rightPriority = stagePriority[maturityStage(right)];

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return (right.confidence ?? 0) - (left.confidence ?? 0);
    })
    .slice(0, maxSignals);
  const entries = sorted.map((signal) => shadowLiveEvent(signal, now));
  const planReadyCandidates = sorted.filter((signal) => maturityStage(signal) === "TRADE_PLAN_READY").length;
  const skippedLightScanMarks = signals.filter((signal) => maturityStage(signal) === "LIGHT_SCAN_MARK").length;

  return {
    canAutoAdjustWeights: false,
    canPromoteSignals: false,
    entries,
    guardrails: [
      "影子实盘只做纸面结果跟踪，不自动下单。",
      "DEEP_SCAN_CANDIDATE 或 EVIDENCE_SIGNAL 不允许被影子跟踪升级成 TRADE_PLAN_READY。",
      "影子实盘样本进入复盘统计前必须等 outcome executor 后验。",
    ],
    mode: "shadow_live_signal_tracker.v1",
    planReadyCandidates,
    skippedLightScanMarks,
    summary: entries.length === 0
      ? "当前没有可写入影子实盘的成熟候选。"
      : `已准备 ${entries.length} 个影子实盘纸面跟踪样本，其中交易计划就绪 ${planReadyCandidates} 个。`,
    trackedCandidates: entries.length,
    updatedAt: now.toISOString(),
  };
}
