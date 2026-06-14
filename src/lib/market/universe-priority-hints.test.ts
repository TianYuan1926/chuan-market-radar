import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "../analysis/types";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import type { DailyMoverSnapshot } from "./daily-movers";
import type { ScanArchiveSummary, ScanReplayFrame } from "./types";
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
  assert.ok(hintsBySymbol.get("SOLUSDT")?.recentSignalCount ?? 0 >= 1);
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
