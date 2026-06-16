import type {
  JournalEvent,
  MarketSignal,
  ReviewCheckpoint,
  SignalOutcomeStatus,
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
  reviewedAt: string;
  reviewCheckpoints: ReviewCheckpoint[];
  lessonTags: string[];
};

export type RuleAdjustment = {
  promote: string[];
  demote: string[];
  experiment: string[];
};

const reviewOffsets: { id: ReviewCheckpoint["id"]; label: string; hours: number }[] = [
  { id: "1h", label: "1h 误报检查", hours: 1 },
  { id: "4h", label: "4h 触发检查", hours: 4 },
  { id: "24h", label: "24h 目标/失效检查", hours: 24 },
];

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
  _signal: MarketSignal,
  createdAt: string,
): ReviewCheckpoint[] {
  return reviewOffsets.map((checkpoint) => ({
    id: checkpoint.id,
    label: checkpoint.label,
    reviewAt: addHours(createdAt, checkpoint.hours),
    status: "pending",
  }));
}

export function evaluateSignalOutcome(
  signal: MarketSignal,
  candles: Candle[],
  schedule: ReviewCheckpoint[],
): SignalOutcome {
  const prices = planPrices(signal);
  const reviewedFallback = latestCandleTime(candles, signal.updatedAt);

  if (prices.entry === undefined || prices.invalidation === undefined || prices.firstTarget === undefined) {
    return outcome(signal, schedule, {
      status: "pending",
      result: "watching",
      rankDelta: 0,
      triggerHit: false,
      invalidationHit: false,
      firstTargetHit: false,
      reviewedAt: reviewedFallback,
      lessonTags: ["missing_numeric_lifecycle_plan"],
    });
  }

  let triggerHit = false;

  for (const candle of sortCandles(candles)) {
    const reviewedAt = candleTime(candle);
    const triggerThisCandle = hitsTrigger(signal, candle, prices.entry);
    const invalidationThisCandle = hitsInvalidation(signal, candle, prices.invalidation);
    const targetThisCandle = hitsFirstTarget(signal, candle, prices.firstTarget);

    if (!triggerHit && invalidationThisCandle && !triggerThisCandle) {
      return outcome(signal, schedule, {
        status: "saved",
        result: "saved",
        rankDelta: 2,
        triggerHit: false,
        invalidationHit: true,
        firstTargetHit: false,
        reviewedAt,
        lessonTags: ["waited_for_trigger", "invalidation_before_entry"],
      });
    }

    if (!triggerHit && triggerThisCandle) {
      triggerHit = true;
    }

    if (!triggerHit) {
      continue;
    }

    if (invalidationThisCandle && !targetThisCandle) {
      return outcome(signal, schedule, {
        status: "loss",
        result: "loss",
        rankDelta: -1,
        triggerHit: true,
        invalidationHit: true,
        firstTargetHit: false,
        reviewedAt,
        lessonTags: [...failureRuleTags(signal), "triggered_then_invalidated"],
      });
    }

    if (targetThisCandle && !invalidationThisCandle) {
      return outcome(signal, schedule, {
        status: "partial_win",
        result: "win",
        rankDelta: 2,
        triggerHit: true,
        invalidationHit: false,
        firstTargetHit: true,
        reviewedAt,
        lessonTags: [...(signal.strategy.confirmation ?? []), "target_before_invalidation"],
      });
    }

    if (targetThisCandle && invalidationThisCandle) {
      return outcome(signal, schedule, {
        status: "loss",
        result: "loss",
        rankDelta: -1,
        triggerHit: true,
        invalidationHit: true,
        firstTargetHit: true,
        reviewedAt,
        lessonTags: ["ambiguous_target_and_invalidation"],
      });
    }
  }

  if (hasReachedExpiry(candles, schedule)) {
    return outcome(signal, schedule, {
      status: "expired",
      result: "watching",
      rankDelta: 0,
      triggerHit: false,
      invalidationHit: false,
      firstTargetHit: false,
      reviewedAt: reviewedFallback,
      lessonTags: ["expired_without_trigger"],
    });
  }

  return outcome(signal, schedule, {
    status: "pending",
    result: "watching",
    rankDelta: 0,
    triggerHit,
    invalidationHit: false,
    firstTargetHit: false,
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
    reviewCheckpoints: outcome.reviewCheckpoints,
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
