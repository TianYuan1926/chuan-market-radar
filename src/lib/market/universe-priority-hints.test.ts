import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "../analysis/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverSnapshot } from "./daily-movers";
import type { ScanArchiveSummary, ScanAssetState, ScanReplayFrame } from "./types";
import {
  buildUniversePriorityHints,
  buildUniversePriorityHintsFromRepository,
} from "./universe-priority-hints";

function archive(
  id: string,
  topSymbols: string[],
  overrides: Partial<ScanArchiveSummary> = {},
): ScanArchiveSummary {
  return {
    id,
    source: "coinglass",
    status: "ready",
    generatedAt: "2026-06-15T00:00:00.000Z",
    scannedCount: 24,
    anomalyCount: topSymbols.length,
    candidateCount: topSymbols.length,
    topSymbols,
    notes: [],
    ...overrides,
  };
}

function replayFrame(id: string, generatedAt: string): ScanReplayFrame {
  return {
    id,
    source: "coinglass",
    status: "ready",
    generatedAt,
    nextScanAt: "2026-06-15T00:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 1,
    candidateCount: 1,
    signals: [],
  };
}

function journalEvent(
  symbol: string,
  overrides: Partial<JournalEvent> = {},
): JournalEvent {
  return {
    id: `journal-${symbol}-${overrides.outcomeStatus ?? "pending"}`,
    symbol,
    title: "复盘样本",
    result: "watching",
    note: "用于动态优先级测试。",
    rankDelta: 0,
    createdAt: "2026-06-15T01:00:00.000Z",
    action: "track",
    reviewStatus: "closed",
    outcomeStatus: "pending",
    ...overrides,
  };
}

function dailyMoverSnapshot(): DailyMoverSnapshot {
  return {
    id: "daily-movers-2026-06-15",
    source: "coinglass",
    observedAt: "2026-06-15T00:00:00.000Z",
    gainers: [
      {
        id: "mover-sol-2026-06-15",
        symbol: "SOL",
        exchange: "BINANCE",
        direction: "gainer",
        rank: 1,
        observedAt: "2026-06-15T00:00:00.000Z",
        priceChangePercent: 42,
        volume24hUsd: 850_000_000,
        openInterestChangePercent: 28,
      },
      {
        id: "mover-dust-2026-06-15",
        symbol: "DUST",
        exchange: "BYBIT",
        direction: "gainer",
        rank: 2,
        observedAt: "2026-06-15T00:00:00.000Z",
        priceChangePercent: 90,
        volume24hUsd: 900_000,
        eventTags: ["low_liquidity"],
      },
    ],
    losers: [],
    reviews: [
      {
        id: "mover-sol-2026-06-15",
        symbol: "SOL",
        direction: "gainer",
        observedAt: "2026-06-15T00:00:00.000Z",
        allowedUse: "research_only",
        guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
        attribution: {
          primaryDrivers: ["volume_expansion", "open_interest_expansion"],
          evidenceStrength: "strong",
          learnability: "learnable",
        },
        radarReview: {
          status: "missed",
          matchedSignalIds: [],
          improvementTags: ["review_volume_oi_weight"],
        },
        preMovePattern: {
          bestWindow: "6h",
          clues: ["6h 成交量提前放大", "OI 温和抬升"],
          earlyWarningScore: 82,
          missedBecause: ["候选池未提前晋级"],
          type: "volume_oi_build_up",
        },
      },
      {
        id: "mover-dust-2026-06-15",
        symbol: "DUST",
        direction: "gainer",
        observedAt: "2026-06-15T00:00:00.000Z",
        allowedUse: "research_only",
        guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
        attribution: {
          primaryDrivers: ["low_liquidity_or_one_off"],
          evidenceStrength: "weak",
          learnability: "not_learnable",
        },
        radarReview: {
          status: "not_learnable",
          matchedSignalIds: [],
          improvementTags: [],
        },
      },
    ],
  };
}

function missedMoverSnapshot(symbol: string): DailyMoverSnapshot {
  return {
    id: `daily-movers-missed-${symbol}`,
    source: "coinglass",
    observedAt: "2026-06-16T00:00:00.000Z",
    gainers: [
      {
        id: `mover-${symbol.toLowerCase()}-2026-06-16`,
        symbol,
        exchange: "BINANCE",
        direction: "gainer",
        rank: 1,
        observedAt: "2026-06-16T00:00:00.000Z",
        priceChangePercent: 38,
        volume24hUsd: 48_000_000,
        openInterestChangePercent: 18,
      },
    ],
    losers: [],
    reviews: [
      {
        id: `mover-${symbol.toLowerCase()}-2026-06-16`,
        symbol,
        direction: "gainer",
        observedAt: "2026-06-16T00:00:00.000Z",
        allowedUse: "research_only",
        guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
        attribution: {
          primaryDrivers: ["volume_expansion", "open_interest_expansion"],
          evidenceStrength: "strong",
          learnability: "learnable",
        },
        radarReview: {
          status: "missed",
          matchedSignalIds: [],
          improvementTags: ["review_missed_altcoin_priority"],
        },
        preMovePattern: {
          bestWindow: "4h",
          clues: ["4h 成交量提前放大", "Funding 仍中性"],
          earlyWarningScore: 76,
          missedBecause: ["轻扫看到但深扫排序不足"],
          type: "quiet_accumulation_before_move",
        },
      },
    ],
  };
}

function trendRadarReviewEvent(
  symbol: string,
  verdict: NonNullable<JournalEvent["trendRadarReview"]>["verdict"],
): JournalEvent {
  return journalEvent(symbol, {
    id: `trend-review-${symbol}-${verdict}`,
    action: "trend_radar_review",
    source: "trend_radar_review_executor",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    trendRadarReview: {
      id: `review-${symbol}-${verdict}`,
      type: verdict === "missed" ? "missed_altcoin_review" : "key_level_reaction_review",
      symbol,
      sourceId: `source-${symbol}`,
      verdict,
      detail: `${symbol} ${verdict} review sample.`,
      observedAt: "2026-06-16T01:00:00.000Z",
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      evidenceIds: [`evidence-${symbol}`],
    },
  });
}

function scanAssetState(overrides: Partial<ScanAssetState> = {}): ScanAssetState {
  return {
    baseAsset: "ENA",
    consecutiveSkipped: 8,
    deepScanCount1h: 0,
    deepScanCount24h: 0,
    dynamicPriorityScore: 0,
    lastDeepScannedAt: null,
    lastLightScannedAt: "2026-06-20T09:00:00.000Z",
    lastSelectedReason: null,
    lastSkippedReason: "waiting_for_rotation",
    payload: {
      recentDeepScanTimes: [],
      source: "scan_rotation_state_v1",
    },
    rotationPriorityScore: 720000,
    statePool: "COLD",
    symbol: "ENAUSDT",
    tier: "long_tail",
    updatedAt: "2026-06-20T09:00:00.000Z",
    wasDisplacedByDynamicPriority: false,
    ...overrides,
  };
}

test("buildUniversePriorityHints merges archives journal outcomes and daily mover samples", () => {
  const report = buildUniversePriorityHints({
    archives: [
      archive("scan-new", ["ARBUSDT", "ENAUSDT"]),
      archive("scan-old", ["ARB"]),
    ],
    dailyMoverSnapshots: [dailyMoverSnapshot()],
    journalEvents: [
      journalEvent("ARB", { outcomeStatus: "partial_win", result: "win" }),
      journalEvent("ENA", { outcomeStatus: "loss", result: "loss" }),
      journalEvent("SUI", { outcomeStatus: "pending", result: "watching" }),
    ],
  });
  const hintsBySymbol = new Map(report.hints.map((hint) => [hint.symbol, hint]));

  assert.equal(report.summary.archivesRead, 2);
  assert.equal(report.summary.journalEventsRead, 3);
  assert.equal(report.summary.dailyMoverSnapshotsRead, 1);
  assert.equal(hintsBySymbol.has("DUSTUSDT"), false);
  assert.equal(hintsBySymbol.get("ARBUSDT")?.historicalSampleSize, 1);
  assert.equal(hintsBySymbol.get("ARBUSDT")?.historicalWinRate, 1);
  assert.ok(hintsBySymbol.get("ARBUSDT")?.recentSignalCount ?? 0 >= 2);
  assert.equal(hintsBySymbol.get("ENAUSDT")?.historicalWinRate, 0);
  assert.ok(hintsBySymbol.get("SOLUSDT")?.anomalyScore ?? 0 >= 70);
  assert.ok(hintsBySymbol.get("SOLUSDT")?.earlyOpportunityScore ?? 0 >= 80);
  assert.ok(hintsBySymbol.get("SOLUSDT")?.recentSignalCount ?? 0 >= 1);
});

test("buildUniversePriorityHints promotes learnable misses and cools repeated failed reviews", () => {
  const report = buildUniversePriorityHints({
    archives: [
      archive("scan-old-1", ["OLDUSDT", "LOSSYUSDT"]),
      archive("scan-old-2", ["OLDUSDT", "LOSSYUSDT"]),
      archive("scan-old-3", ["OLDUSDT", "LOSSYUSDT"]),
      archive("scan-old-4", ["OLDUSDT", "LOSSYUSDT"]),
    ],
    dailyMoverSnapshots: [missedMoverSnapshot("PONKE")],
    journalEvents: [
      trendRadarReviewEvent("PONKE", "missed"),
      journalEvent("LOSSY", { id: "lossy-loss-1", outcomeStatus: "loss", result: "loss" }),
      journalEvent("LOSSY", { id: "lossy-loss-2", outcomeStatus: "expired", result: "loss" }),
      trendRadarReviewEvent("LOSSY", "invalidated"),
    ],
    maxHints: 8,
  });
  const symbols = report.hints.map((hint) => hint.symbol);
  const hintsBySymbol = new Map(report.hints.map((hint) => [hint.symbol, hint]));

  assert.equal(symbols[0], "PONKEUSDT");
  assert.equal(hintsBySymbol.get("PONKEUSDT")?.missedOpportunityCount, 2);
  assert.ok(hintsBySymbol.get("PONKEUSDT")?.earlyOpportunityScore ?? 0 >= 70);
  assert.equal(hintsBySymbol.get("LOSSYUSDT")?.cooldownReviewCount, 3);
  assert.ok(symbols.indexOf("LOSSYUSDT") > symbols.indexOf("PONKEUSDT"));
});

test("buildUniversePriorityHintsFromRepository reads bounded durable samples", async () => {
  const repository = createMemoryPersistenceRepository();

  await repository.addScanArchive(
    archive("scan-repo", ["TIAUSDT"], { generatedAt: "2026-06-15T00:00:00.000Z" }),
    replayFrame("scan-repo", "2026-06-15T00:00:00.000Z"),
  );
  await repository.addJournalEvent(journalEvent("TIAUSDT", {
    outcomeStatus: "saved",
    result: "saved",
  }));
  await repository.addDailyMoverSnapshot(dailyMoverSnapshot());

  const report = await buildUniversePriorityHintsFromRepository(repository, {
    archiveLimit: 4,
    dailyMoverSnapshotLimit: 4,
    journalLimit: 20,
  });
  const tia = report.hints.find((hint) => hint.symbol === "TIAUSDT");

  assert.ok(tia);
  assert.equal(tia.historicalSampleSize, 1);
  assert.equal(tia.historicalWinRate, 1);
  assert.equal(report.summary.archivesRead, 1);
  assert.equal(report.summary.repositoryMode, "memory");
});

test("buildUniversePriorityHintsFromRepository turns durable rotation state into fair rotation hints", async () => {
  const repository = createMemoryPersistenceRepository();

  await repository.upsertScanAssetStates([
    scanAssetState(),
    scanAssetState({
      baseAsset: "TIA",
      consecutiveSkipped: 0,
      deepScanCount1h: 2,
      deepScanCount24h: 5,
      lastDeepScannedAt: "2026-06-20T09:10:00.000Z",
      lastSelectedReason: "dynamic_priority",
      lastSkippedReason: null,
      rotationPriorityScore: 0,
      statePool: "BATTLE_WATCH",
      symbol: "TIAUSDT",
      tier: "active",
      wasDisplacedByDynamicPriority: false,
    }),
  ]);

  const report = await buildUniversePriorityHintsFromRepository(repository, {
    assetStateLimit: 10,
    maxHints: 10,
  });
  const hintsBySymbol = new Map(report.hints.map((hint) => [hint.symbol, hint]));

  assert.equal(report.summary.assetStatesRead, 2);
  assert.equal(report.summary.sourceCounts.assetStates, 2);
  assert.equal(hintsBySymbol.get("ENAUSDT")?.consecutiveSkipped, 8);
  assert.equal(hintsBySymbol.get("ENAUSDT")?.rotationPriorityScore, 720000);
  assert.ok(hintsBySymbol.get("ENAUSDT")?.rotationAgeBoost ?? 0 > 0);
  assert.equal(hintsBySymbol.get("TIAUSDT")?.deepScanCount1h, 2);
  assert.ok(hintsBySymbol.get("TIAUSDT")?.recentDeepScanPenalty ?? 0 > 0);
});
