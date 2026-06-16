import type {
  JournalEvent,
  MarketSignal,
  ReviewStatus,
  SignalJournalAction,
  StrategyWeightChangeApprovalStatus,
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
  firstTarget: string;
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

export type DailyMoverStrategyConfirmationJournalInput = {
  allowedUse: "research_only";
  draftId: string;
  evidenceSummary: string;
  label: string;
  limitation: string;
  nextStep: string;
  tag: string;
  validationVerdict: string;
  versionLabel: string;
};

export type DailyMoverStrategyConfirmationJournalEntry = JournalEvent & {
  action: "strategy_confirmation";
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  lessons: string[];
  reviewStatus: "closed";
  source: "strategy_version_confirmation";
  sourceId: string;
  strategyDraftId: string;
  strategyEvidenceSummary: string;
  strategyLabel: string;
  strategyLimitation: string;
  strategyTag: string;
  strategyValidationVerdict: string;
  strategyVersionLabel: string;
};

export type StrategyWeightChangeExecutionJournalInput = {
  approvalStatus: StrategyWeightChangeApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  direction: "decrease" | "increase" | "quarantine";
  label: string;
  rollbackTrigger: string;
  rollbackWindowDays: number;
  tag: string;
  versionLabel: string;
};

export type StrategyWeightChangeExecutionJournalEntry = JournalEvent & {
  action: "strategy_weight_change_execution";
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  lessons: string[];
  reviewStatus: "closed";
  source: "strategy_weight_change_execution";
  sourceId: string;
  strategyWeightChange: {
    approvalStatus: StrategyWeightChangeApprovalStatus;
    approvedAt?: string;
    approvedBy?: string;
    canExecuteWeightChange: false;
    direction: "decrease" | "increase" | "quarantine";
    rollbackTrigger: string;
    rollbackWindowDays: number;
    tag: string;
    versionLabel: string;
  };
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
    firstTarget: signal.strategy.targets[0] ?? "",
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
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
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

export function buildJournalEntryFromDailyMoverStrategyConfirmation(
  input: DailyMoverStrategyConfirmationJournalInput,
  options: { createdAt?: string } = {},
): DailyMoverStrategyConfirmationJournalEntry {
  const version = slugPart(input.versionLabel) || "strategy-draft";

  return {
    id: `journal-${version}-strategy-confirmation`,
    symbol: "STRATEGY",
    title: "策略版本人工确认",
    result: "watching",
    note: `已人工确认策略草案：${input.label} / ${input.versionLabel}。${input.nextStep}`,
    rankDelta: 0,
    createdAt: options.createdAt ?? new Date().toISOString(),
    action: "strategy_confirmation",
    reviewStatus: "closed",
    trigger: "人工确认样本边界和验证限制",
    invalidation: "确认记录不能自动改权重，后续表现不佳时必须回滚为观察",
    thesis: `${input.evidenceSummary}。${input.limitation}`,
    lessons: ["strategy_confirmation", input.tag, input.validationVerdict],
    source: "strategy_version_confirmation",
    sourceId: input.draftId,
    calibrationTag: input.tag,
    allowedUse: input.allowedUse,
    canAutoAdjustWeights: false,
    strategyDraftId: input.draftId,
    strategyEvidenceSummary: input.evidenceSummary,
    strategyLabel: input.label,
    strategyLimitation: input.limitation,
    strategyTag: input.tag,
    strategyValidationVerdict: input.validationVerdict,
    strategyVersionLabel: input.versionLabel,
  };
}

export function buildJournalEntryFromStrategyWeightChangeExecution(
  input: StrategyWeightChangeExecutionJournalInput,
  options: { createdAt?: string } = {},
): StrategyWeightChangeExecutionJournalEntry {
  const version = slugPart(input.versionLabel) || "manual-weight-change";
  const tag = input.tag.trim();
  const approver = input.approvedBy?.trim() || "未记录审批人";

  return {
    id: `journal-${version}-strategy-weight-execution`,
    symbol: "STRATEGY",
    title: "权重变更人工记录",
    result: "watching",
    note: `只记录审批账本：${input.label} / ${input.versionLabel} / ${input.approvalStatus} / ${approver}。不写入自动权重。`,
    rankDelta: 0,
    createdAt: options.createdAt ?? new Date().toISOString(),
    action: "strategy_weight_change_execution",
    reviewStatus: "closed",
    trigger: "人工记录策略权重变更审批状态和观察窗口",
    invalidation: "该记录不能自动写入规则权重，后续必须通过隔离观察和回滚验证。",
    thesis: `${input.label}：${input.direction}。回滚触发器：${input.rollbackTrigger}`,
    lessons: ["strategy_weight_change_execution", tag, input.approvalStatus, input.direction],
    source: "strategy_weight_change_execution",
    sourceId: tag,
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    strategyWeightChange: {
      approvalStatus: input.approvalStatus,
      approvedAt: input.approvedAt,
      approvedBy: input.approvedBy,
      canExecuteWeightChange: false,
      direction: input.direction,
      rollbackTrigger: input.rollbackTrigger,
      rollbackWindowDays: input.rollbackWindowDays,
      tag,
      versionLabel: input.versionLabel,
    },
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
