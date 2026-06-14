import type {
  JournalAction,
  JournalEvent,
  MarketSignal,
  ReviewStatus,
  Timeframe,
} from "@/lib/analysis/types";
import { buildReviewSchedule } from "./outcome-tracker";

const reviewDelayMinutes: Record<Timeframe, number> = {
  "1m": 30,
  "5m": 60,
  "15m": 90,
  "30m": 180,
  "1h": 240,
  "4h": 720,
  "1d": 1440,
  "1w": 10080,
};

const actionMeta: Record<
  JournalAction,
  {
    title: string;
    result: JournalEvent["result"];
    rankDelta: number;
    reviewStatus: ReviewStatus;
    notePrefix: string;
  }
> = {
  track: {
    title: "加入跟踪队列",
    result: "watching",
    rankDelta: 0,
    reviewStatus: "tracking",
    notePrefix: "记录观察，不提前交易。",
  },
  paper_trade: {
    title: "纸面跟踪计划",
    result: "watching",
    rankDelta: 0,
    reviewStatus: "tracking",
    notePrefix: "只做纸面追踪，用结果验证策略质量。",
  },
  skip: {
    title: "拒绝追单",
    result: "saved",
    rankDelta: 1,
    reviewStatus: "closed",
    notePrefix: "纪律通过，没有低风险位置就不参与。",
  },
  invalidate: {
    title: "触发失效复盘",
    result: "loss",
    rankDelta: -1,
    reviewStatus: "closed",
    notePrefix: "失效条件出现，记录反证并回收假设。",
  },
};

export type SignalJournalEntry = JournalEvent & {
  signalId: string;
  action: JournalAction;
  reviewStatus: ReviewStatus;
  timeframe: Timeframe;
  direction: MarketSignal["direction"];
  strategyStatus: NonNullable<MarketSignal["strategy"]["status"]>;
  riskReward: number;
  trigger: string;
  invalidation: string;
  thesis: string;
  plannedReviewAt: string;
  lessons: string[];
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatShanghaiIso(value: Date) {
  const shanghai = new Date(value.getTime() + 8 * 60 * 60 * 1000);

  return [
    `${shanghai.getUTCFullYear()}-${pad(shanghai.getUTCMonth() + 1)}-${pad(shanghai.getUTCDate())}`,
    `T${pad(shanghai.getUTCHours())}:${pad(shanghai.getUTCMinutes())}:${pad(shanghai.getUTCSeconds())}`,
    `.${shanghai.getUTCMilliseconds().toString().padStart(3, "0")}+08:00`,
  ].join("");
}

export function plannedReviewAt(updatedAt: string, timeframe: Timeframe) {
  const date = new Date(updatedAt);

  if (Number.isNaN(date.getTime())) {
    return updatedAt;
  }

  const delay = reviewDelayMinutes[timeframe] * 60 * 1000;

  return formatShanghaiIso(new Date(date.getTime() + delay));
}

export function buildJournalEntryFromSignal(
  signal: MarketSignal,
  action: JournalAction,
  options: { createdAt?: string } = {},
): SignalJournalEntry {
  const meta = actionMeta[action];
  const strategyStatus = signal.strategy.status ?? "waiting";
  const reviewCheckpoints = meta.reviewStatus === "tracking"
    ? buildReviewSchedule(signal, signal.updatedAt)
    : undefined;
  const lifecycleDefaults = meta.reviewStatus === "tracking"
    ? {
        outcomeStatus: "pending" as const,
        triggerHit: false,
        invalidationHit: false,
        firstTargetHit: false,
        reviewCheckpoints,
        lessons: ["still_tracking"],
      }
    : action === "skip"
      ? {
          outcomeStatus: "saved" as const,
          triggerHit: false,
          invalidationHit: false,
          firstTargetHit: false,
          reviewCheckpoints: undefined,
          lessons: ["manual_skip"],
        }
      : {
          outcomeStatus: "loss" as const,
          triggerHit: false,
          invalidationHit: true,
          firstTargetHit: false,
          reviewCheckpoints: undefined,
          lessons: ["manual_invalidation"],
        };

  return {
    id: `journal-${signal.id}-${action}`,
    signalId: signal.id,
    symbol: signal.symbol,
    title: meta.title,
    result: meta.result,
    note: `${meta.notePrefix} ${signal.strategy.positionHint ?? signal.summary}`,
    rankDelta: meta.rankDelta,
    createdAt: options.createdAt ?? new Date().toISOString(),
    action,
    reviewStatus: meta.reviewStatus,
    timeframe: signal.timeframe,
    direction: signal.direction,
    strategyStatus,
    riskReward: signal.strategy.riskReward,
    trigger: signal.strategy.entry,
    invalidation: signal.strategy.invalidation,
    thesis: signal.summary,
    plannedReviewAt: plannedReviewAt(signal.updatedAt, signal.timeframe),
    ...lifecycleDefaults,
  };
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function mergeJournalEntry(entries: JournalEvent[], entry: JournalEvent) {
  return [entry, ...entries.filter((item) => item.id !== entry.id)].sort(
    (left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt),
  );
}
