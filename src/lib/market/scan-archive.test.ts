import assert from "node:assert/strict";
import test from "node:test";
import {
  compareScanReplayFrames,
  compareScanSnapshots,
  createReplayFrame,
  createScanArchiveStore,
  summarizeScanSnapshot,
} from "./scan-archive";
import type { MarketSignal } from "../analysis/types";
import type { MarketRadarSnapshot } from "./types";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "ena-long",
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "near_trigger",
    timeframe: "15m",
    regime: "mixed",
    confidence: 78,
    risk: "medium",
    updatedAt: "2026-06-12T02:00:00.000Z",
    summary: "test signal",
    evidence: [],
    strategy: {
      bias: "long",
      entry: "wait for pullback",
      invalidation: "lose structure",
      targets: ["liquidity high"],
      riskReward: 3.2,
      positionHint: "10U only after confirmation",
      status: "waiting",
    },
    ...overrides,
  };
}

function snapshot(
  metadata: Partial<MarketRadarSnapshot["metadata"]> = {},
  signals: MarketSignal[] = [signal()],
): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-a",
      mode: "scheduled",
      status: "ready",
      source: "mock",
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 2,
      candidateCount: signals.length,
      riskGate: "on",
      generatedAt: "2026-06-12T02:00:00.000Z",
      nextScanAt: "2026-06-12T02:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["archive test"],
      ...metadata,
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 24,
        accepted: 24,
        rejected: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals,
    journalEvents: [],
  };
}

test("summarizeScanSnapshot keeps the archive payload compact", () => {
  const summary = summarizeScanSnapshot(snapshot({}, [
    signal({ symbol: "ENAUSDT", confidence: 78 }),
    signal({ id: "sui-short", symbol: "SUIUSDT", confidence: 69 }),
  ]));

  assert.deepEqual(summary, {
    id: "scan-a",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T02:00:00.000Z",
    scannedCount: 24,
    anomalyCount: 2,
    candidateCount: 2,
    topSymbols: ["ENAUSDT", "SUIUSDT"],
    notes: ["archive test"],
  });
});

test("createReplayFrame converts a snapshot into a stable review frame", () => {
  const frame = createReplayFrame(snapshot({ id: "scan-review" }, [
    signal({
      id: "ena-long",
      symbol: "ENAUSDT",
      confidence: 78,
      timeframeGate: {
        action: "WAIT_HIGH_TIMEFRAME_BREAK",
        allowed: false,
        blockedBy: ["structure_timeframe_conflict"],
        conflictTimeframes: ["4h"],
        guardrail: "低周期不能推翻高周期。",
        mode: "multi_timeframe_hard_gate_v1",
        summary: "4h 结构仍有压力。",
      },
    }),
  ]));

  assert.equal(frame.id, "scan-review");
  assert.equal(frame.cadenceMinutes, 15);
  assert.equal(frame.signals.length, 1);
  assert.deepEqual(frame.signals[0], {
    id: "ena-long",
    symbol: "ENAUSDT",
    direction: "long",
    state: "near_trigger",
    timeframe: "15m",
    confidence: 78,
    risk: "medium",
    riskReward: 3.2,
    timeframeGate: {
      action: "WAIT_HIGH_TIMEFRAME_BREAK",
      allowed: false,
      blockedBy: ["structure_timeframe_conflict"],
      conflictTimeframes: ["4h"],
      guardrail: "低周期不能推翻高周期。",
      mode: "multi_timeframe_hard_gate_v1",
      summary: "4h 结构仍有压力。",
    },
    strategyStatus: "waiting",
    updatedAt: "2026-06-12T02:00:00.000Z",
    summary: "test signal",
  });
});

test("createScanArchiveStore stores newest snapshots first, dedupes ids, and caps history", () => {
  const store = createScanArchiveStore({ maxEntries: 2 });

  store.add(snapshot({ id: "scan-a", generatedAt: "2026-06-12T02:00:00.000Z" }));
  store.add(snapshot({ id: "scan-b", generatedAt: "2026-06-12T02:15:00.000Z" }));
  store.add(snapshot({ id: "scan-a", generatedAt: "2026-06-12T02:30:00.000Z" }));
  store.add(snapshot({ id: "scan-c", generatedAt: "2026-06-12T02:45:00.000Z" }));

  assert.deepEqual(store.list().map((entry) => entry.id), ["scan-c", "scan-a"]);
  assert.equal(store.get("scan-b"), null);
  assert.equal(store.latest()?.id, "scan-c");
});

test("compareScanSnapshots reports useful deltas for replay review", () => {
  const previous = snapshot({ id: "scan-before", anomalyCount: 1, scannedCount: 20 }, [
    signal({ id: "ena-long", symbol: "ENAUSDT" }),
    signal({ id: "ondo-long", symbol: "ONDOUSDT" }),
  ]);
  const current = snapshot({ id: "scan-now", anomalyCount: 3, scannedCount: 24 }, [
    signal({ id: "ena-long", symbol: "ENAUSDT" }),
    signal({ id: "sui-short", symbol: "SUIUSDT", direction: "short" }),
  ]);

  assert.deepEqual(compareScanSnapshots(previous, current), {
    fromId: "scan-before",
    toId: "scan-now",
    scannedDelta: 4,
    anomalyDelta: 2,
    candidateDelta: 0,
    newSignalSymbols: ["SUIUSDT"],
    removedSignalSymbols: ["ONDOUSDT"],
    statusChanged: false,
    sourceChanged: false,
  });
});

test("compareScanReplayFrames compares durable replay payloads without full snapshots", () => {
  const previous = createReplayFrame(snapshot({
    id: "scan-before",
    anomalyCount: 1,
    scannedCount: 20,
  }, [
    signal({ id: "ena-long", symbol: "ENAUSDT" }),
    signal({ id: "ondo-long", symbol: "ONDOUSDT" }),
  ]));
  const current = createReplayFrame(snapshot({
    id: "scan-now",
    anomalyCount: 3,
    scannedCount: 24,
  }, [
    signal({ id: "ena-long", symbol: "ENAUSDT" }),
    signal({ id: "sui-short", symbol: "SUIUSDT", direction: "short" }),
  ]));

  assert.deepEqual(compareScanReplayFrames(previous, current), {
    fromId: "scan-before",
    toId: "scan-now",
    scannedDelta: 4,
    anomalyDelta: 2,
    candidateDelta: 0,
    newSignalSymbols: ["SUIUSDT"],
    removedSignalSymbols: ["ONDOUSDT"],
    statusChanged: false,
    sourceChanged: false,
  });
});
