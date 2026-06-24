import type { JournalEvent, SignalOutcomeStatus } from "../analysis/types";

export type ReviewOutcomeBucket = {
  count: number;
  label: string;
  status: SignalOutcomeStatus;
  symbols: string[];
};

export type ReviewStatisticsReport = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  generatedAt: string;
  guardrail: string;
  mae: {
    averagePercent: number;
    maxPercent: number;
  };
  mfe: {
    averagePercent: number;
    maxPercent: number;
  };
  outcomeBuckets: ReviewOutcomeBucket[];
  sampleStatus: "empty" | "collecting" | "usable" | "statistically_thin";
  samples: {
    closed: number;
    evidenceLevel: number;
    pending: number;
    total: number;
    tradePlanReady: number;
    withMetrics: number;
  };
  summary: string;
  winRate: {
    expiredExcludedPercent: number | null;
    rawResolvedPercent: number | null;
  };
};

const labels: Record<SignalOutcomeStatus, string> = {
  expired: "超时",
  loss: "失败",
  partial_win: "首目标命中",
  pending: "待复查",
  saved: "纪律保护",
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  const valid = values.filter(Number.isFinite);

  if (valid.length === 0) {
    return 0;
  }

  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function uniqueSymbols(events: JournalEvent[]) {
  return [...new Set(events.map((event) => event.symbol.replace(/USDT$/u, "")))].slice(0, 12);
}

function isReviewSample(event: JournalEvent) {
  return Boolean(event.outcomeStatus || event.outcomeMetrics || event.reviewStatus);
}

function isEvidenceLevel(event: JournalEvent) {
  return event.signalMaturityStage === "EVIDENCE_SIGNAL" ||
    event.signalMaturityStage === "TRADE_PLAN_READY" ||
    Boolean(event.outcomeMetrics);
}

function isWinLike(event: JournalEvent) {
  return event.outcomeStatus === "partial_win" || event.outcomeStatus === "saved";
}

function isResolved(event: JournalEvent) {
  return event.outcomeStatus === "partial_win" ||
    event.outcomeStatus === "saved" ||
    event.outcomeStatus === "loss";
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }

  return round((numerator / denominator) * 100, 1);
}

function sampleStatus(total: number, closed: number, evidenceLevel: number): ReviewStatisticsReport["sampleStatus"] {
  if (total === 0) {
    return "empty";
  }

  if (closed < 10 || evidenceLevel < 10) {
    return "collecting";
  }

  if (closed < 30 || evidenceLevel < 30) {
    return "statistically_thin";
  }

  return "usable";
}

function statusSummary(status: ReviewStatisticsReport["sampleStatus"], closed: number, evidenceLevel: number) {
  if (status === "empty") {
    return "还没有可统计的复盘样本。";
  }

  if (status === "collecting") {
    return `已关闭样本 ${closed} 条，证据级样本 ${evidenceLevel} 条，仍处于收集阶段，不能据此调整权重。`;
  }

  if (status === "statistically_thin") {
    return `已关闭样本 ${closed} 条，证据级样本 ${evidenceLevel} 条，可用于人工观察，但样本仍偏薄。`;
  }

  return `已关闭样本 ${closed} 条，证据级样本 ${evidenceLevel} 条，可进入人工策略复核，不自动调权。`;
}

export function buildReviewStatisticsReport(
  events: JournalEvent[],
  now = new Date(),
): ReviewStatisticsReport {
  const reviewEvents = events.filter(isReviewSample);
  const withMetrics = reviewEvents.filter((event) => event.outcomeMetrics);
  const closed = reviewEvents.filter((event) => event.reviewStatus === "closed" && event.outcomeStatus !== "pending");
  const pending = reviewEvents.filter((event) => event.outcomeStatus === "pending" || event.reviewStatus === "tracking");
  const resolved = reviewEvents.filter(isResolved);
  const wins = resolved.filter(isWinLike);
  const expiredExcluded = resolved.length;
  const rawResolved = reviewEvents.filter((event) => event.outcomeStatus && event.outcomeStatus !== "pending");
  const evidenceLevel = reviewEvents.filter(isEvidenceLevel).length;
  const status = sampleStatus(reviewEvents.length, closed.length, evidenceLevel);
  const mfeValues = withMetrics.map((event) => event.outcomeMetrics?.mfePercent ?? 0);
  const maeValues = withMetrics.map((event) => event.outcomeMetrics?.maePercent ?? 0);
  const statuses: SignalOutcomeStatus[] = ["partial_win", "saved", "loss", "expired", "pending"];

  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    generatedAt: now.toISOString(),
    guardrail: "复盘统计只用于人工校准和回滚验证；不能自动改权重、不能改变实时排序。",
    mae: {
      averagePercent: round(average(maeValues), 2),
      maxPercent: round(Math.max(0, ...maeValues), 2),
    },
    mfe: {
      averagePercent: round(average(mfeValues), 2),
      maxPercent: round(Math.max(0, ...mfeValues), 2),
    },
    outcomeBuckets: statuses.map((bucketStatus) => {
      const bucketEvents = reviewEvents.filter((event) => event.outcomeStatus === bucketStatus);

      return {
        count: bucketEvents.length,
        label: labels[bucketStatus],
        status: bucketStatus,
        symbols: uniqueSymbols(bucketEvents),
      };
    }),
    sampleStatus: status,
    samples: {
      closed: closed.length,
      evidenceLevel,
      pending: pending.length,
      total: reviewEvents.length,
      tradePlanReady: reviewEvents.filter((event) => event.signalMaturityStage === "TRADE_PLAN_READY").length,
      withMetrics: withMetrics.length,
    },
    summary: statusSummary(status, closed.length, evidenceLevel),
    winRate: {
      expiredExcludedPercent: percent(wins.length, expiredExcluded),
      rawResolvedPercent: percent(wins.length, rawResolved.length),
    },
  };
}
