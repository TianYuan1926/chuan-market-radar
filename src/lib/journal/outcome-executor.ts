import type {
  JournalEvent,
  MarketSignal,
  OutcomeExecutorRunSummary,
  ReviewCheckpoint,
  SignalDirection,
  StrategyPlan,
  Timeframe,
} from "@/lib/analysis/types";
import type {
  OhlcvFailureReason,
  OhlcvProvider,
} from "@/lib/market/ohlcv/types";
import type { PersistenceRepository } from "@/lib/persistence/persistence-store";
import { buildLifecycleJournalEvent, evaluateSignalOutcome } from "./outcome-tracker";

export type OutcomeExecutorFailure = {
  eventId: string;
  signalId?: string;
  symbol: string;
  reason: "missing_signal_context" | OhlcvFailureReason;
  error: string;
};

export type OutcomeExecutorResult = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  mode: "outcome_executor_mvp";
  scannedEvents: number;
  dueEvents: number;
  skippedEvents: number;
  fetchedCandles: number;
  writtenEvents: number;
  failedFetches: number;
  failures: OutcomeExecutorFailure[];
};

export type RunOutcomeExecutorOptions = {
  limit?: number;
  now?: string;
  ohlcvProvider: OhlcvProvider;
  repository: PersistenceRepository;
};

const defaultEventLimit = 120;
const defaultCandleLimit = 200;

function sortableTime(value?: string) {
  const time = value ? new Date(value).getTime() : Number.NaN;

  return Number.isNaN(time) ? 0 : time;
}

function isDueAt(value: string | undefined, nowTime: number) {
  const time = sortableTime(value);

  return time > 0 && time <= nowTime;
}

function hasDueCheckpoint(checkpoints: ReviewCheckpoint[] | undefined, nowTime: number) {
  return (checkpoints ?? []).some((checkpoint) => (
    checkpoint.status !== "complete" && isDueAt(checkpoint.reviewAt, nowTime)
  ));
}

function isTrackingCandidate(event: JournalEvent) {
  return Boolean(
    event.signalId &&
    event.reviewStatus === "tracking" &&
    event.outcomeStatus === "pending" &&
    event.action !== "calibration_review" &&
    event.action !== "strategy_confirmation",
  );
}

function isDueTrackingCandidate(event: JournalEvent, nowTime: number) {
  return isTrackingCandidate(event) && (
    hasDueCheckpoint(event.reviewCheckpoints, nowTime) ||
    isDueAt(event.plannedReviewAt, nowTime)
  );
}

function closedSignalIdsFromEvents(events: JournalEvent[]) {
  return new Set(
    events
      .filter((event) => (
        event.signalId &&
        event.reviewStatus === "closed" &&
        event.outcomeStatus &&
        event.outcomeStatus !== "pending"
      ))
      .map((event) => event.signalId),
  );
}

function latestDueEvents(events: JournalEvent[], nowTime: number) {
  const latestBySignalId = new Map<string, JournalEvent>();
  const closedSignalIds = closedSignalIdsFromEvents(events);

  for (const event of events) {
    if (
      !isDueTrackingCandidate(event, nowTime) ||
      !event.signalId ||
      closedSignalIds.has(event.signalId)
    ) {
      continue;
    }

    const existing = latestBySignalId.get(event.signalId);

    if (!existing || sortableTime(event.createdAt) > sortableTime(existing.createdAt)) {
      latestBySignalId.set(event.signalId, event);
    }
  }

  return [...latestBySignalId.values()].sort(
    (left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt),
  );
}

function hasRequiredSignalContext(event: JournalEvent): event is JournalEvent & {
  direction: SignalDirection;
  firstTarget: string;
  invalidation: string;
  riskReward: number;
  signalId: string;
  timeframe: Timeframe;
  trigger: string;
} {
  return Boolean(
    event.signalId &&
    event.timeframe &&
    event.direction &&
    typeof event.riskReward === "number" &&
    event.trigger?.trim() &&
    event.invalidation?.trim() &&
    event.firstTarget?.trim(),
  );
}

function signalFromJournalEvent(event: JournalEvent): MarketSignal | null {
  if (!hasRequiredSignalContext(event)) {
    return null;
  }

  const strategyStatus: StrategyPlan["status"] = event.strategyStatus ?? "waiting";

  return {
    id: event.signalId,
    symbol: event.symbol,
    exchange: "JOURNAL",
    direction: event.direction,
    state: "near_trigger",
    timeframe: event.timeframe,
    regime: "unknown",
    confidence: 0,
    risk: "medium",
    updatedAt: event.createdAt,
    summary: event.thesis ?? event.note,
    evidence: [],
    strategy: {
      bias: event.direction,
      entry: event.trigger,
      invalidation: event.invalidation,
      targets: [event.firstTarget],
      riskReward: event.riskReward,
      positionHint: event.note,
      status: strategyStatus,
      confirmation: event.lessons ?? [],
    },
  };
}

function emptyResult(): OutcomeExecutorResult {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    mode: "outcome_executor_mvp",
    scannedEvents: 0,
    dueEvents: 0,
    skippedEvents: 0,
    fetchedCandles: 0,
    writtenEvents: 0,
    failedFetches: 0,
    failures: [],
  };
}

function runEventId(now: string) {
  return `journal-outcome-executor-${now
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function runSummary(result: OutcomeExecutorResult): OutcomeExecutorRunSummary {
  return {
    dueEvents: result.dueEvents,
    failedFetches: result.failedFetches,
    failures: result.failures,
    fetchedCandles: result.fetchedCandles,
    scannedEvents: result.scannedEvents,
    skippedEvents: result.skippedEvents,
    writtenEvents: result.writtenEvents,
  };
}

function runNote(summary: OutcomeExecutorRunSummary) {
  const failurePreview = summary.failures
    .slice(0, 3)
    .map((failure) => `${failure.symbol}:${failure.reason}`)
    .join(" / ");
  const failureText = summary.failedFetches > 0 || summary.failures.length > 0
    ? `，失败 ${summary.failedFetches}，原因 ${failurePreview || "待查看日志"}`
    : "";

  return `自动复盘执行：扫描 ${summary.scannedEvents}，到期 ${summary.dueEvents}，写回 ${summary.writtenEvents}，跳过 ${summary.skippedEvents}${failureText}。`;
}

function buildOutcomeExecutorRunEvent(result: OutcomeExecutorResult, now: string): JournalEvent {
  const summary = runSummary(result);

  return {
    id: runEventId(now),
    symbol: "OUTCOME_EXECUTOR",
    title: "自动复盘执行批次",
    result: "watching",
    note: runNote(summary),
    rankDelta: 0,
    createdAt: now,
    action: "outcome_executor_run",
    reviewStatus: "closed",
    lessons: [
      "outcome_executor_run",
      summary.failedFetches > 0 || summary.failures.length > 0 ? "executor_attention" : "executor_checked",
    ],
    source: "outcome_executor",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    outcomeExecutorRun: summary,
  };
}

export async function runOutcomeExecutor({
  limit = defaultEventLimit,
  now = new Date().toISOString(),
  ohlcvProvider,
  repository,
}: RunOutcomeExecutorOptions): Promise<OutcomeExecutorResult> {
  const result = emptyResult();
  const events = await repository.listJournalEvents(limit);
  const nowTime = sortableTime(now);
  const dueEvents = latestDueEvents(events, nowTime);

  result.scannedEvents = events.length;
  result.dueEvents = dueEvents.length;

  for (const event of dueEvents) {
    const signal = signalFromJournalEvent(event);

    if (!signal) {
      result.skippedEvents += 1;
      result.failures.push({
        eventId: event.id,
        signalId: event.signalId,
        symbol: event.symbol,
        reason: "missing_signal_context",
        error: "Journal event is missing timeframe, direction, trigger, invalidation, first target, or risk reward.",
      });
      continue;
    }

    const candleResult = await ohlcvProvider.fetchCandles({
      symbol: event.symbol,
      interval: signal.timeframe,
      limit: defaultCandleLimit,
    });

    if (!candleResult.ok) {
      result.failedFetches += 1;
      result.skippedEvents += 1;
      result.failures.push({
        eventId: event.id,
        signalId: event.signalId,
        symbol: event.symbol,
        reason: candleResult.reason,
        error: candleResult.error,
      });
      continue;
    }

    result.fetchedCandles += candleResult.candles.length;

    const outcome = evaluateSignalOutcome(
      signal,
      candleResult.candles,
      event.reviewCheckpoints ?? [],
    );

    if (outcome.status === "pending") {
      result.skippedEvents += 1;
      continue;
    }

    await repository.addJournalEvent({
      ...buildLifecycleJournalEvent(signal, outcome),
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
    });

    result.writtenEvents += 1;
  }

  await repository.addJournalEvent(buildOutcomeExecutorRunEvent(result, now));

  return result;
}
