import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import {
  buildRefreshPlan,
  compareSignalSets,
  shouldPlaySignalSound,
} from "./live-refresh";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    confidence: 72,
    direction: "long",
    evidence: [],
    exchange: "BINANCE",
    id: overrides.id ?? `${overrides.symbol ?? "BTCUSDT"}-15m`,
    regime: "mixed",
    risk: "medium",
    state: "near_trigger",
    strategy: {
      bias: "long",
      entry: "wait confirmation",
      invalidation: "lose trigger zone",
      positionHint: "small",
      riskReward: 2.1,
      status: "waiting",
      targets: ["first target"],
    },
    summary: "test signal",
    symbol: "BTCUSDT",
    timeframe: "15m",
    updatedAt: "2026-06-13T12:00:00.000Z",
    ...overrides,
  };
}

test("buildRefreshPlan aims at the next scan without burst polling", () => {
  const plan = buildRefreshPlan({
    now: new Date("2026-06-13T12:00:00.000Z"),
    nextScanAt: "2026-06-13T12:00:10.000Z",
  });

  assert.equal(plan.intervalMs, 45_000);
  assert.equal(plan.reason, "min_guard");
});

test("buildRefreshPlan caps long waits and falls back on invalid timestamps", () => {
  const capped = buildRefreshPlan({
    now: new Date("2026-06-13T12:00:00.000Z"),
    nextScanAt: "2026-06-13T12:20:00.000Z",
  });
  const fallback = buildRefreshPlan({
    now: new Date("2026-06-13T12:00:00.000Z"),
    nextScanAt: "not-a-date",
  });

  assert.equal(capped.intervalMs, 180_000);
  assert.equal(capped.reason, "max_guard");
  assert.equal(fallback.intervalMs, 60_000);
  assert.equal(fallback.reason, "fallback");
});

test("compareSignalSets identifies new, removed, and changed symbols per scan", () => {
  const delta = compareSignalSets({
    nextScanId: "scan-2",
    nextSignals: [
      signal({ symbol: "BTCUSDT", state: "triggered" }),
      signal({ symbol: "ENAUSDT" }),
    ],
    previousScanId: "scan-1",
    previousSignals: [
      signal({ symbol: "BTCUSDT", state: "near_trigger" }),
      signal({ symbol: "SOLUSDT" }),
    ],
  });

  assert.equal(delta.isNewScan, true);
  assert.deepEqual(delta.newSymbols, ["ENAUSDT"]);
  assert.deepEqual(delta.removedSymbols, ["SOLUSDT"]);
  assert.deepEqual(delta.changedSymbols, ["BTCUSDT"]);
  assert.equal(delta.hasActionableChange, true);
});

test("shouldPlaySignalSound requires armed sound, visibility, and a real scan delta", () => {
  const delta = compareSignalSets({
    nextScanId: "scan-2",
    nextSignals: [signal({ symbol: "BTCUSDT" }), signal({ symbol: "ENAUSDT" })],
    previousScanId: "scan-1",
    previousSignals: [signal({ symbol: "BTCUSDT" })],
  });

  assert.equal(shouldPlaySignalSound({
    delta,
    firstLoad: true,
    pageVisible: true,
    soundEnabled: true,
  }), false);
  assert.equal(shouldPlaySignalSound({
    delta,
    firstLoad: false,
    pageVisible: false,
    soundEnabled: true,
  }), false);
  assert.equal(shouldPlaySignalSound({
    delta,
    firstLoad: false,
    pageVisible: true,
    soundEnabled: false,
  }), false);
  assert.equal(shouldPlaySignalSound({
    delta,
    firstLoad: false,
    pageVisible: true,
    soundEnabled: true,
  }), true);
});
