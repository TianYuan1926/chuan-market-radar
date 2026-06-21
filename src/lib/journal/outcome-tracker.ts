import type {
  JournalEvent,
  MarketSignal,
  OutcomeMetrics,
  ReviewCheckpoint,
  SignalOutcomeStatus,
  Timeframe,
} from "@/lib/analysis/types";
import type { Candle } from "@/lib/market/ohlcv/types";

export type SignalOutcome = {
  signalId: string;
  symbol: string;
  status: SignalOutcomeStatus;
  result: JournalEvent["result"];
  rankDelta: number;
  triggerHit: boolean;
  invalidationHit: boolean;
  firstTargetHit: boolean;
  outcomeMetrics: OutcomeMetrics;
  reviewedAt: string;
  reviewCheckpoints: ReviewCheckpoint[];
  lessonTags: string[];
};

export type RuleAdjustment = {
  promote: string[];
  demote: string[];
  experiment: string[];
};

const checkpointMeta: Record<ReviewCheckpoint["id"], { label: string; hours: number }> = {
  "1h": { label: "1h 误报检查", hours: 1 },
  "4h": { label: "4h 触发/首目标检查", hours: 4 },
  "24h": { label: "24h 目标/失效检查", hours: 24 },
  "4d": { label: "4d 趋势验证检查", hours: 96 },
};

const validationWindows: Record<Timeframe, { checkpointIds: ReviewCheckpoint["id"][]; hours: number; label: string }> = {
  "1m": { checkpointIds: ["1h", "4h"], hours: 4, label: "4h" },
  "5m": { checkpointIds: ["1h", "4h"], hours: 4, label: "4h" },
  "15m": { checkpointIds: ["1h", "4h"], hours: 4, label: "4h" },
  "30m": { checkpointIds: ["1h", "4h"], hours: 4, label: "4h" },
  "1h": { checkpointIds: ["4h", "24h"], hours: 24, label: "24h" },
  "4h": { checkpointIds: ["24h", "4d"], hours: 96, label: "4d" },
  "1d": { checkpointIds: ["24h", "4d"], hours: 96, label: "4d" },
  "1w": { checkpointIds: ["24h", "4d"], hours: 96, label: "4d" },
};

function addHours(value: string, hours: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return value;
  }

  return new Date(time + hours * 60 * 60 * 1000).toISOString();
}

function candleTime(candle: Candle) {
  return candle.closeTime || candle.openTime;
}

function sortCandles(candles: Candle[]) {
  return [...candles].sort((left, right) => {
    const leftTime = new Date(candleTime(left)).getTime();
    const rightTime = new Date(candleTime(right)).getTime();

    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
  });
}

function validationWindowFor(signal: MarketSignal) {
  return validationWindows[signal.timeframe] ?? validationWindows["15m"];
}

function firstNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const match = value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : undefined;
}

function planPrices(signal: MarketSignal) {
  return {
    entry: firstNumber(signal.strategy.entry),
    invalidation: firstNumber(signal.strategy.invalidation),
    firstTarget: firstNumber(signal.strategy.targets[0]),
  };
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function outcomeMetrics({
  candles,
  prices,
  signal,
}: {
  candles: Candle[];
  prices: ReturnType<typeof planPrices>;
  signal: MarketSignal;
}): OutcomeMetrics {
  const window = validationWindowFor(signal);
  const entry = prices.entry;

  if (entry === undefined || entry === 0 || candles.length === 0) {
    return {
      entryPrice: entry,
      evaluatedCandles: candles.length,
      firstTargetPrice: prices.firstTarget,
      invalidationPrice: prices.invalidation,
      validationWindowHours: window.hours,
      validationWindowLabel: window.label,
    };
  }

  const high = Math.max(...candles.map((candle) => candle.high));
  const low = Math.min(...candles.map((candle) => candle.low));
  const short = isShort(signal);
  const maxFavorablePrice = short ? low : high;
  const maxAdversePrice = short ? high : low;
  const mfeRaw = short
    ? ((entry - maxFavorablePrice) / entry) * 100
    : ((maxFavorablePrice - entry) / entry) * 100;
  const maeRaw = short
    ? ((maxAdversePrice - entry) / entry) * 100
    : ((entry - maxAdversePrice) / entry) * 100;

  return {
    entryPrice: roundPrice(entry),
    evaluatedCandles: candles.length,
    firstTargetPrice: prices.firstTarget === undefined ? undefined : roundPrice(prices.firstTarget),
    invalidationPrice: prices.invalidation === undefined ? undefined : roundPrice(prices.invalidation),
    maePercent: roundPercent(Math.max(0, maeRaw)),
    maxAdversePrice: roundPrice(maxAdversePrice),
    maxFavorablePrice: roundPrice(maxFavorablePrice),
    mfePercent: roundPercent(Math.max(0, mfeRaw)),
    validationWindowHours: window.hours,
    validationWindowLabel: window.label,
  };
}

function isShort(signal: MarketSignal) {
  return signal.direction === "short" || signal.strategy.bias === "short";
}

function hitsTrigger(signal: MarketSignal, candle: Candle, entry: number) {
  return isShort(signal) ? candle.low <= entry : candle.high >= entry;
}

function hitsInvalidation(signal: MarketSignal, candle: Candle, invalidation: number) {
  return isShort(signal) ? candle.high >= invalidation : candle.low <= invalidation;
}

function hitsFirstTarget(signal: MarketSignal, candle: Candle, target: number) {
  return isShort(signal) ? candle.low <= target : candle.high >= target;
}

function checkpointStatus(checkpoint: ReviewCheckpoint, reviewedAt: string): ReviewCheckpoint["status"] {
  const reviewTime = new Date(checkpoint.reviewAt).getTime();
  const reviewedTime = new Date(reviewedAt).getTime();

  if (Number.isNaN(reviewTime) || Number.isNaN(reviewedTime)) {
    return checkpoint.status;
  }

  return reviewedTime >= reviewTime ? "complete" : "pending";
}

function applyCheckpointProgress(
  schedule: ReviewCheckpoint[],
  reviewedAt: string,
): ReviewCheckpoint[] {
  return schedule.map((checkpoint) => ({
    ...checkpoint,
    status: checkpointStatus(checkpoint, reviewedAt),
  }));
}

function lastReviewAt(schedule: ReviewCheckpoint[], fallback: string) {
  return schedule.at(-1)?.reviewAt ?? fallback;
}

function latestCandleTime(candles: Candle[], fallback: string) {
  return sortCandles(candles).at(-1)?.closeTime ?? sortCandles(candles).at(-1)?.openTime ?? fallback;
}

function hasReachedExpiry(candles: Candle[], schedule: ReviewCheckpoint[]) {
  const lastCandleAt = latestCandleTime(candles, "");
  const expiryAt = lastReviewAt(schedule, "");
  const lastTime = new Date(lastCandleAt).getTime();
  const expiryTime = new Date(expiryAt).getTime();

  return !Number.isNaN(lastTime) && !Number.isNaN(expiryTime) && lastTime >= expiryTime;
}

function outcome(
  signal: MarketSignal,
  schedule: ReviewCheckpoint[],
  fields: Omit<SignalOutcome, "signalId" | "symbol" | "reviewCheckpoints">,
): SignalOutcome {
  return {
    signalId: signal.id,
    symbol: signal.symbol,
    reviewCheckpoints: applyCheckpointProgress(schedule, fields.reviewedAt),
    ...fields,
  };
}

function failureRuleTags(signal: MarketSignal) {
  return (signal.strategy.confirmation ?? []).filter((tag) => (
    /late|weak|chase|missing|without|unconfirmed|failed/i.test(tag)
  ));
}

function actionForStatus(status: SignalOutcomeStatus): JournalEvent["action"] {
  if (status === "partial_win") {
    return "paper_trade";
  }

  if (status === "saved") {
    return "skip";
  }

  if (status === "loss") {
    return "invalidate";
  }

  return "track";
}

function titleForStatus(status: SignalOutcomeStatus) {
  const titles: Record<SignalOutcomeStatus, string> = {
    pending: "等待生命周期复盘",
    partial_win: "目标前置命中复盘",
    saved: "触发前失效，纪律避险",
    loss: "触发后失效复盘",
    expired: "未触发过期复盘",
  };

  return titles[status];
}

function noteForOutcome(signal: MarketSignal, outcomeValue: SignalOutcome) {
  const facts = [
    outcomeValue.triggerHit ? "触发已出现" : "未触发",
    outcomeValue.firstTargetHit ? "首目标已到" : "首目标未到",
    outcomeValue.invalidationHit ? "失效已出现" : "未失效",
  ].join(" / ");

  return `${facts}。原始逻辑：${signal.summary}`;
}

export function buildReviewSchedule(
  signal: MarketSignal,
  createdAt: string,
): ReviewCheckpoint[] {
  const window = validationWindowFor(signal);

  return window.checkpointIds.map((id) => ({
    id,
    label: checkpointMeta[id].label,
    reviewAt: addHours(createdAt, checkpointMeta[id].hours),
    status: "pending",
  }));
}

export function evaluateSignalOutcome(
  signal: MarketSignal,
  candles: Candle[],
  schedule: ReviewCheckpoint[],
): SignalOutcome {
  const prices = planPrices(signal);
  const sortedCandles = sortCandles(candles);
  const effectiveSchedule = schedule.length > 0 ? schedule : buildReviewSchedule(signal, signal.updatedAt);
  const reviewedFallback = latestCandleTime(sortedCandles, signal.updatedAt);
  const fallbackMetrics = outcomeMetrics({ candles: sortedCandles, prices, signal });

  if (prices.entry === undefined || prices.invalidation === undefined || prices.firstTarget === undefined) {
    return outcome(signal, effectiveSchedule, {
      status: "pending",
      result: "watching",
      rankDelta: 0,
      triggerHit: false,
      invalidationHit: false,
      firstTargetHit: false,
      outcomeMetrics: fallbackMetrics,
      reviewedAt: reviewedFallback,
      lessonTags: ["missing_numeric_lifecycle_plan"],
    });
  }

  let triggerHit = false;
  let triggerIndex = 0;

  for (const [index, candle] of sortedCandles.entries()) {
    const reviewedAt = candleTime(candle);
    const triggerThisCandle = hitsTrigger(signal, candle, prices.entry);
    const invalidationThisCandle = hitsInvalidation(signal, candle, prices.invalidation);
    const targetThisCandle = hitsFirstTarget(signal, candle, prices.firstTarget);
    const candlesThroughCurrent = sortedCandles.slice(0, index + 1);

    if (!triggerHit && invalidationThisCandle && !triggerThisCandle) {
      return outcome(signal, effectiveSchedule, {
        status: "saved",
        result: "saved",
        rankDelta: 2,
        triggerHit: false,
        invalidationHit: true,
        firstTargetHit: false,
        outcomeMetrics: outcomeMetrics({ candles: candlesThroughCurrent, prices, signal }),
        reviewedAt,
        lessonTags: ["waited_for_trigger", "invalidation_before_entry"],
      });
    }

    if (!triggerHit && triggerThisCandle) {
      triggerHit = true;
      triggerIndex = index;
    }

    if (!triggerHit) {
      continue;
    }

    const candlesSinceTrigger = sortedCandles.slice(triggerIndex, index + 1);

    if (invalidationThisCandle && !targetThisCandle) {
      return outcome(signal, effectiveSchedule, {
        status: "loss",
        result: "loss",
        rankDelta: -1,
        triggerHit: true,
        invalidationHit: true,
        firstTargetHit: false,
        outcomeMetrics: outcomeMetrics({ candles: candlesSinceTrigger, prices, signal }),
        reviewedAt,
        lessonTags: [...failureRuleTags(signal), "triggered_then_invalidated"],
      });
    }

    if (targetThisCandle && !invalidationThisCandle) {
      return outcome(signal, effectiveSchedule, {
        status: "partial_win",
        result: "win",
        rankDelta: 2,
        triggerHit: true,
        invalidationHit: false,
        firstTargetHit: true,
        outcomeMetrics: outcomeMetrics({ candles: candlesSinceTrigger, prices, signal }),
        reviewedAt,
        lessonTags: [...(signal.strategy.confirmation ?? []), "target_before_invalidation"],
      });
    }

    if (targetThisCandle && invalidationThisCandle) {
      return outcome(signal, effectiveSchedule, {
        status: "loss",
        result: "loss",
        rankDelta: -1,
        triggerHit: true,
        invalidationHit: true,
        firstTargetHit: true,
        outcomeMetrics: outcomeMetrics({ candles: candlesSinceTrigger, prices, signal }),
        reviewedAt,
        lessonTags: ["ambiguous_target_and_invalidation"],
      });
    }
  }

  if (hasReachedExpiry(sortedCandles, effectiveSchedule)) {
    return outcome(signal, effectiveSchedule, {
      status: "expired",
      result: "watching",
      rankDelta: 0,
      triggerHit: false,
      invalidationHit: false,
      firstTargetHit: false,
      outcomeMetrics: fallbackMetrics,
      reviewedAt: reviewedFallback,
      lessonTags: ["expired_without_trigger"],
    });
  }

  return outcome(signal, effectiveSchedule, {
    status: "pending",
    result: "watching",
    rankDelta: 0,
    triggerHit,
    invalidationHit: false,
    firstTargetHit: false,
    outcomeMetrics: fallbackMetrics,
    reviewedAt: reviewedFallback,
    lessonTags: ["still_tracking"],
  });
}

export function buildLifecycleJournalEvent(
  signal: MarketSignal,
  outcome: SignalOutcome,
): JournalEvent {
  return {
    id: `journal-${signal.id}-lifecycle`,
    signalId: signal.id,
    symbol: signal.symbol,
    title: titleForStatus(outcome.status),
    result: outcome.result,
    note: noteForOutcome(signal, outcome),
    rankDelta: outcome.rankDelta,
    createdAt: outcome.reviewedAt,
    action: actionForStatus(outcome.status),
    reviewStatus: outcome.status === "pending" ? "tracking" : "closed",
    timeframe: signal.timeframe,
    direction: signal.direction,
    strategyStatus: signal.strategy.status,
    riskReward: signal.strategy.riskReward,
    trigger: signal.strategy.entry,
    invalidation: signal.strategy.invalidation,
    firstTarget: signal.strategy.targets[0],
    thesis: signal.summary,
    plannedReviewAt: outcome.reviewCheckpoints.find((checkpoint) => checkpoint.status !== "complete")?.reviewAt ??
      outcome.reviewCheckpoints.at(-1)?.reviewAt,
    lessons: outcome.lessonTags,
    outcomeStatus: outcome.status,
    triggerHit: outcome.triggerHit,
    invalidationHit: outcome.invalidationHit,
    firstTargetHit: outcome.firstTargetHit,
    outcomeMetrics: outcome.outcomeMetrics,
    reviewCheckpoints: outcome.reviewCheckpoints,
    signalMaturityStage: signal.maturity?.stage,
  };
}

function pushCount(target: Map<string, number>, tag: string) {
  target.set(tag, (target.get(tag) ?? 0) + 1);
}

function tagsByThreshold(counts: Map<string, number>, threshold: (count: number) => boolean) {
  return [...counts.entries()]
    .filter(([, count]) => threshold(count))
    .map(([tag]) => tag);
}

export function deriveRuleAdjustment(outcomes: SignalOutcome[]): RuleAdjustment {
  const promote = new Map<string, number>();
  const demote = new Map<string, number>();
  const experiment = new Map<string, number>();

  for (const item of outcomes) {
    for (const tag of item.lessonTags) {
      if (item.status === "partial_win" || item.status === "saved") {
        pushCount(promote, tag);
      } else if (item.status === "loss" || item.status === "expired") {
        pushCount(demote, tag);
      } else {
        pushCount(experiment, tag);
      }
    }
  }

  return {
    promote: tagsByThreshold(promote, (count) => count >= 2),
    demote: tagsByThreshold(demote, (count) => count >= 2),
    experiment: tagsByThreshold(experiment, (count) => count > 0),
  };
}
