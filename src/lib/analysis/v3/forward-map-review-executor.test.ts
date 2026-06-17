import assert from "node:assert/strict";
import test from "node:test";
import type { StrategyV3Dossier } from "./types";
import type { Candle, OhlcvProvider } from "../../market/ohlcv/types";
import type { ScanArchiveSummary, ScanReplayFrame } from "../../market/types";
import { createMemoryPersistenceRepository } from "../../persistence/persistence-store";
import { runForwardMapReviewExecutor } from "./forward-map-review-executor";

function candle(index: number, high: number, low: number, close: number, baseHour = 9): Candle {
  const minute = String(index).padStart(2, "0");

  return {
    openTime: `2026-06-17T${String(baseHour).padStart(2, "0")}:${minute}:00.000Z`,
    closeTime: `2026-06-17T${String(baseHour).padStart(2, "0")}:${minute}:59.999Z`,
    open: close,
    high,
    low,
    close,
    volume: 100,
  };
}

function strategyV3Dossier(): StrategyV3Dossier {
  return {
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canMutateLiveRanking: false,
    currentPrice: 100,
    forwardLevels: [
      {
        id: "TESTUSDT-current-defense-s1",
        symbol: "TESTUSDT",
        side: "SUPPORT",
        role: "CURRENT_DEFENSE",
        zoneLow: 94,
        zoneHigh: 96,
        timeframeWeight: 4,
        keyScore: 82,
        status: "AHEAD",
        reasons: ["4h swing low"],
        confirmationRules: ["15m reclaim zoneHigh"],
        invalidationRules: ["1h close below zoneLow"],
        sourceLevelIds: ["TESTUSDT-4h-swing-low"],
      },
    ],
    guardrails: ["manual review only"],
    keyLevels: [
      {
        id: "TESTUSDT-4h-swing-low",
        symbol: "TESTUSDT",
        timeframe: "4h",
        type: "SWING_LOW",
        zoneLow: 94,
        zoneHigh: 96,
        midPrice: 95,
        direction: "SUPPORT",
        keyScore: 80,
        reactionScore: 40,
        confluenceScore: 72,
        status: "POTENTIAL",
        reasons: ["4h swing low"],
        confirmationRules: ["reclaim 96"],
        invalidationRule: "close below 94",
      },
    ],
    primaryTimeframe: "4h",
    source: "existing_ohlcv_key_level_mvp",
    sourceTimeframes: ["15m", "1h", "4h"],
    summary: "Readonly v3 map.",
    symbol: "TESTUSDT",
  };
}

function scanSummary(): ScanArchiveSummary {
  return {
    id: "scan-v3-review",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-17T08:00:00.000Z",
    scannedCount: 1,
    anomalyCount: 1,
    candidateCount: 1,
    topSymbols: ["TESTUSDT"],
    notes: ["v3 review test"],
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    id: "scan-v3-review",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-17T08:00:00.000Z",
    nextScanAt: "2026-06-17T08:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 1,
    anomalyCount: 1,
    candidateCount: 1,
    signals: [
      {
        id: "test-v3-signal",
        symbol: "TESTUSDT",
        direction: "long",
        state: "near_trigger",
        timeframe: "15m",
        confidence: 80,
        risk: "medium",
        riskReward: 3.2,
        strategyStatus: "waiting",
        strategyV3: strategyV3Dossier(),
        updatedAt: "2026-06-17T08:00:00.000Z",
        summary: "v3 test signal",
      },
    ],
  };
}

function provider(candles: Candle[]): OhlcvProvider & { requests: Array<{ symbol: string; interval: string; limit?: number }> } {
  const requests: Array<{ symbol: string; interval: string; limit?: number }> = [];

  return {
    id: "test-ohlcv",
    label: "Test OHLCV",
    requests,
    async fetchCandles(request) {
      requests.push(request);

      return {
        ok: true,
        source: "test-ohlcv",
        symbol: request.symbol,
        interval: request.interval,
        candles,
      };
    },
  };
}

test("runForwardMapReviewExecutor writes readonly forward map and key level review events", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addScanArchive(scanSummary(), replayFrame());
  const ohlcvProvider = provider([
    candle(0, 100, 97, 98),
    candle(1, 98, 94.5, 95),
    candle(2, 101, 95.5, 99),
  ]);

  const result = await runForwardMapReviewExecutor({
    limit: 5,
    now: "2026-06-17T10:00:00.000Z",
    ohlcvProvider,
    repository,
  });
  const events = await repository.listJournalEvents();
  const rank = await repository.getRankProfile();
  const reviewEvents = events.filter((event) => event.action === "trend_radar_review");
  const runEvent = events.find((event) => event.action === "trend_radar_review_run");

  assert.equal(result.allowedUse, "research_only");
  assert.equal(result.canAutoAdjustWeights, false);
  assert.equal(result.scannedSnapshots, 1);
  assert.equal(result.reviewedSnapshots, 1);
  assert.equal(result.fetchedCandles, 3);
  assert.equal(result.writtenEvents, 2);
  assert.deepEqual(ohlcvProvider.requests, [
    { symbol: "TESTUSDT", interval: "4h", limit: 200 },
  ]);
  assert.deepEqual(reviewEvents.map((event) => event.trendRadarReview?.type).sort(), [
    "forward_map_review",
    "key_level_reaction_review",
  ]);
  assert.equal(reviewEvents[0]?.allowedUse, "research_only");
  assert.equal(reviewEvents[0]?.canAutoAdjustWeights, false);
  assert.equal(runEvent?.trendRadarReviewRun?.writtenEvents, 2);
  assert.equal(rank.totalXp, 0);
});

test("runForwardMapReviewExecutor skips saved maps when no future candles exist", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addScanArchive(scanSummary(), replayFrame());
  const ohlcvProvider = provider([
    candle(0, 100, 97, 98, 7),
  ]);

  const result = await runForwardMapReviewExecutor({
    now: "2026-06-17T10:00:00.000Z",
    ohlcvProvider,
    repository,
  });
  const events = await repository.listJournalEvents();

  assert.equal(result.scannedSnapshots, 1);
  assert.equal(result.reviewedSnapshots, 0);
  assert.equal(result.skippedSnapshots, 1);
  assert.equal(result.writtenEvents, 0);
  assert.deepEqual(result.skippedReasons, [
    {
      code: "no_future_candles",
      count: 1,
      label: "缺少后续K线",
      symbols: ["TESTUSDT"],
    },
  ]);
  assert.equal(events.some((event) => event.action === "trend_radar_review"), false);
  assert.ok(events.some((event) => event.action === "trend_radar_review_run"));
});
