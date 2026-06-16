import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import type { OhlcvProvider } from "@/lib/market/ohlcv/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildJournalEntryFromSignal } from "./journal-entry";
import { runOutcomeExecutor } from "./outcome-executor";

const baseSignal: MarketSignal = {
  id: "ena-breakout-plan",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 82,
  risk: "low",
  updatedAt: "2026-06-12T10:00:00.000Z",
  summary: "突破前高后回踩确认，观察是否先到目标而不是先失效。",
  evidence: [
    {
      label: "结构",
      value: "箱体突破",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "trigger 10.00",
    invalidation: "stop 9.40",
    targets: ["target 11.20"],
    riskReward: 3.5,
    status: "actionable",
    positionHint: "纸面验证，不追单。",
    confirmation: ["volume_expansion"],
  },
};

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    ...baseSignal,
    ...overrides,
    strategy: {
      ...baseSignal.strategy,
      ...overrides.strategy,
    },
  };
}

test("runOutcomeExecutor writes lifecycle outcomes for due tracking journal entries without automatic weight changes", async () => {
  const repository = createMemoryPersistenceRepository();
  const trackingEntry = buildJournalEntryFromSignal(baseSignal, "paper_trade", {
    createdAt: "2026-06-12T10:05:00.000Z",
  });

  await repository.addJournalEvent(trackingEntry);

  const ohlcvProvider: OhlcvProvider = {
    id: "fake-public-ohlcv",
    label: "Fake public OHLCV",
    async fetchCandles(request) {
      assert.equal(request.symbol, "ENAUSDT");
      assert.equal(request.interval, "15m");

      return {
        ok: true,
        source: "fake",
        symbol: request.symbol,
        interval: request.interval,
        candles: [
          {
            openTime: "2026-06-12T10:15:00.000Z",
            closeTime: "2026-06-12T10:15:00.000Z",
            open: 9.95,
            high: 10.1,
            low: 9.8,
            close: 10.05,
            volume: 1_000,
          },
          {
            openTime: "2026-06-12T11:05:00.000Z",
            closeTime: "2026-06-12T11:05:00.000Z",
            open: 10.2,
            high: 11.3,
            low: 10.2,
            close: 11.1,
            volume: 1_200,
          },
        ],
      };
    },
  };

  const result = await runOutcomeExecutor({
    now: "2026-06-12T12:00:00.000Z",
    ohlcvProvider,
    repository,
  });

  assert.equal(result.mode, "outcome_executor_mvp");
  assert.equal(result.allowedUse, "research_only");
  assert.equal(result.canAutoAdjustWeights, false);
  assert.equal(result.scannedEvents, 1);
  assert.equal(result.dueEvents, 1);
  assert.equal(result.fetchedCandles, 2);
  assert.equal(result.writtenEvents, 1);
  assert.equal(result.skippedEvents, 0);
  assert.equal(result.failedFetches, 0);

  const events = await repository.listJournalEvents();
  const lifecycleEvent = events.find((event) => event.id === "journal-ena-breakout-plan-lifecycle");
  const runEvent = events.find((event) => event.action === "outcome_executor_run");
  const runSummary = runEvent?.outcomeExecutorRun;

  assert.ok(lifecycleEvent);
  assert.equal(lifecycleEvent.outcomeStatus, "partial_win");
  assert.equal(lifecycleEvent.result, "win");
  assert.equal(lifecycleEvent.reviewStatus, "closed");
  assert.equal(lifecycleEvent.firstTargetHit, true);
  assert.equal(lifecycleEvent.rankDelta, 2);
  assert.equal(lifecycleEvent.firstTarget, "target 11.20");
  assert.equal(lifecycleEvent.canAutoAdjustWeights, false);
  assert.ok(runEvent);
  assert.equal(runEvent.symbol, "OUTCOME_EXECUTOR");
  assert.equal(runEvent.result, "watching");
  assert.equal(runEvent.rankDelta, 0);
  assert.equal(runEvent.reviewStatus, "closed");
  assert.equal(runEvent.source, "outcome_executor");
  assert.equal(runEvent.allowedUse, "research_only");
  assert.equal(runEvent.canAutoAdjustWeights, false);
  assert.match(runEvent.note, /写回 1/);
  assert.deepEqual(runSummary, {
    dueEvents: 1,
    failedFetches: 0,
    failures: [],
    fetchedCandles: 2,
    scannedEvents: 1,
    skippedReasons: [],
    skippedEvents: 0,
    writtenEvents: 1,
  });
});

test("runOutcomeExecutor skips tracking entries that already have a closed lifecycle event", async () => {
  const repository = createMemoryPersistenceRepository();
  const trackingEntry = buildJournalEntryFromSignal(baseSignal, "paper_trade", {
    createdAt: "2026-06-12T10:05:00.000Z",
  });
  let fetchCount = 0;
  const ohlcvProvider: OhlcvProvider = {
    id: "fake-public-ohlcv",
    label: "Fake public OHLCV",
    async fetchCandles(request) {
      fetchCount += 1;

      return {
        ok: true,
        source: "fake",
        symbol: request.symbol,
        interval: request.interval,
        candles: [
          {
            openTime: "2026-06-12T10:15:00.000Z",
            closeTime: "2026-06-12T10:15:00.000Z",
            open: 9.95,
            high: 10.1,
            low: 9.8,
            close: 10.05,
            volume: 1_000,
          },
          {
            openTime: "2026-06-12T11:05:00.000Z",
            closeTime: "2026-06-12T11:05:00.000Z",
            open: 10.2,
            high: 11.3,
            low: 10.2,
            close: 11.1,
            volume: 1_200,
          },
        ],
      };
    },
  };

  await repository.addJournalEvent(trackingEntry);

  const firstRun = await runOutcomeExecutor({
    now: "2026-06-12T12:00:00.000Z",
    ohlcvProvider,
    repository,
  });
  const secondRun = await runOutcomeExecutor({
    now: "2026-06-12T13:00:00.000Z",
    ohlcvProvider,
    repository,
  });

  assert.equal(firstRun.writtenEvents, 1);
  assert.equal(secondRun.dueEvents, 0);
  assert.equal(secondRun.fetchedCandles, 0);
  assert.equal(secondRun.writtenEvents, 0);
  assert.equal(fetchCount, 1);
});

test("runOutcomeExecutor segments skipped reasons before automatic calibration", async () => {
  const repository = createMemoryPersistenceRepository();
  const notDueSignal = signal({
    id: "btc-not-due-plan",
    symbol: "BTCUSDT",
    updatedAt: "2026-06-12T11:45:00.000Z",
  });
  const closedSignal = signal({ id: "sol-closed-plan", symbol: "SOLUSDT" });
  const pendingSignal = signal({ id: "ena-still-pending-plan", symbol: "ENAUSDT" });

  await repository.addJournalEvent(buildJournalEntryFromSignal(notDueSignal, "paper_trade", {
    createdAt: "2026-06-12T10:05:00.000Z",
  }));
  await repository.addJournalEvent(buildJournalEntryFromSignal(closedSignal, "paper_trade", {
    createdAt: "2026-06-12T10:05:00.000Z",
  }));
  await repository.addJournalEvent({
    id: "journal-sol-closed-plan-lifecycle",
    signalId: "sol-closed-plan",
    symbol: "SOLUSDT",
    title: "目标前置命中复盘",
    result: "win",
    note: "已经有关闭结果。",
    rankDelta: 2,
    createdAt: "2026-06-12T11:20:00.000Z",
    reviewStatus: "closed",
    outcomeStatus: "partial_win",
  });
  await repository.addJournalEvent({
    id: "journal-tia-missing-context",
    signalId: "tia-missing-context-plan",
    symbol: "TIAUSDT",
    title: "纸面跟踪计划",
    result: "watching",
    note: "缺少策略上下文。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000Z",
    outcomeStatus: "pending",
    plannedReviewAt: "2026-06-12T11:00:00.000Z",
    reviewStatus: "tracking",
  });
  await repository.addJournalEvent(buildJournalEntryFromSignal(pendingSignal, "paper_trade", {
    createdAt: "2026-06-12T10:05:00.000Z",
  }));

  const ohlcvProvider: OhlcvProvider = {
    id: "fake-public-ohlcv",
    label: "Fake public OHLCV",
    async fetchCandles(request) {
      assert.equal(request.symbol, "ENAUSDT");

      return {
        ok: true,
        source: "fake",
        symbol: request.symbol,
        interval: request.interval,
        candles: [
          {
            openTime: "2026-06-12T10:15:00.000Z",
            closeTime: "2026-06-12T10:15:00.000Z",
            open: 9.95,
            high: 10.05,
            low: 9.8,
            close: 9.92,
            volume: 1_000,
          },
        ],
      };
    },
  };

  const result = await runOutcomeExecutor({
    now: "2026-06-12T12:00:00.000Z",
    ohlcvProvider,
    repository,
  });

  assert.equal(result.dueEvents, 2);
  assert.equal(result.fetchedCandles, 1);
  assert.equal(result.skippedEvents, 4);
  assert.equal(result.writtenEvents, 0);
  assert.deepEqual(result.skippedReasons, [
    { code: "not_due", count: 1, label: "未到窗口", symbols: ["BTCUSDT"] },
    { code: "closed_duplicate", count: 1, label: "已关闭去重", symbols: ["SOLUSDT"] },
    { code: "missing_signal_context", count: 1, label: "缺少上下文", symbols: ["TIAUSDT"] },
    { code: "outcome_pending", count: 1, label: "结果待判定", symbols: ["ENAUSDT"] },
  ]);

  const runEvent = (await repository.listJournalEvents()).find((event) => event.action === "outcome_executor_run");

  assert.deepEqual(runEvent?.outcomeExecutorRun?.skippedReasons, result.skippedReasons);
  assert.match(runEvent?.note ?? "", /未到窗口 1/);
  assert.equal(runEvent?.canAutoAdjustWeights, false);
});
