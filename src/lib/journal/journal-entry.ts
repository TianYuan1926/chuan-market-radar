import type {
  JournalEvent,
  MarketSignal,
  ReviewStatus,
  SignalJournalAction,
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
  SignalJournalAction,
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
  action: SignalJournalAction;
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

export type DailyMoverCalibrationJournalInput = {
  guardrail: string;
  label: string;
  observedAt: string;
  recommendation: string;
  sampleCount: number;
  snapshotId: string;
  symbols: string[];
  tag: string;
};

export type DailyMoverCalibrationJournalEntry = JournalEvent & {
  action: "calibration_review";
  calibrationTag: string;
  invalidation: string;
  lessons: string[];
  outcomeStatus: "pending";
  plannedReviewAt: string;
  reviewStatus: "tracking";
  source: "daily_mover_calibration";
  sourceId: string;
  sampleSymbols: string[];
  thesis: string;
  trigger: string;
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

function plannedCalibrationReviewAt(observedAt: string) {
  const date = new Date(observedAt);

  if (Number.isNaN(date.getTime())) {
    return observedAt;
  }

  return formatShanghaiIso(new Date(date.getTime() + 24 * 60 * 60 * 1000));
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function compactCalibrationSymbols(symbols: string[]) {
  return symbols
    .map((symbol) => symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);
}

export function buildJournalEntryFromSignal(
  signal: MarketSignal,
  action: SignalJournalAction,
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

export function buildJournalEntryFromDailyMoverCalibration(
  input: DailyMoverCalibrationJournalInput,
  options: { createdAt?: string } = {},
): DailyMoverCalibrationJournalEntry {
  const normalizedSymbols = compactCalibrationSymbols(input.symbols);
  const primarySymbol = normalizedSymbols[0] ?? "DAILY_MOVER";
  const compactSymbols = normalizedSymbols
    .slice(0, 4)
    .map((symbol) => symbol.replace(/USDT$/u, ""))
    .join(" / ");
  const snapshotId = slugPart(input.snapshotId) || "daily-mover";
  const tag = slugPart(input.tag) || "rule-review";

  return {
    id: `journal-${snapshotId}-${tag}-calibration`,
    symbol: primarySymbol,
    title: "规则校准复盘",
    result: "watching",
    note: `规则校准候选：${input.label}。${input.sampleCount} 个样本：${compactSymbols || "待补样本"}。${input.guardrail}`,
    rankDelta: 0,
    createdAt: options.createdAt ?? new Date().toISOString(),
    action: "calibration_review",
    reviewStatus: "tracking",
    trigger: "复核样本是否支持规则调整",
    invalidation: "样本不足、不可学习或无法复现时不调整规则",
    thesis: input.recommendation,
    plannedReviewAt: plannedCalibrationReviewAt(input.observedAt),
    lessons: ["daily_mover_calibration", input.tag, `samples_${input.sampleCount}`],
    outcomeStatus: "pending",
    triggerHit: false,
    invalidationHit: false,
    firstTargetHit: false,
    source: "daily_mover_calibration",
    sourceId: input.snapshotId,
    calibrationTag: input.tag,
    sampleSymbols: normalizedSymbols,
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
