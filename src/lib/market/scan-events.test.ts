import assert from "node:assert/strict";
import test from "node:test";
import { buildScanEventFeed } from "./scan-events";
import type { SignalSetDelta } from "./live-refresh";
import type { ScanArchiveBundle, ScanArchiveSummary, ScanComparison } from "./types";

function entry(overrides: Partial<ScanArchiveSummary> = {}): ScanArchiveSummary {
  return {
    anomalyCount: 3,
    candidateCount: 2,
    generatedAt: "2026-06-13T12:30:00.000Z",
    id: "scan-now",
    notes: ["batch 2/3: ENA,SUI,ONDO", "requests 3/7, next batch 3"],
    scannedCount: 9,
    source: "coinglass",
    status: "ready",
    topSymbols: ["ENAUSDT", "SUIUSDT"],
    ...overrides,
  };
}

function comparison(overrides: Partial<ScanComparison> = {}): ScanComparison {
  return {
    anomalyDelta: 2,
    candidateDelta: 1,
    fromId: "scan-before",
    newSignalSymbols: ["SUIUSDT"],
    removedSignalSymbols: ["ONDOUSDT"],
    scannedDelta: 0,
    sourceChanged: false,
    statusChanged: false,
    toId: "scan-now",
    ...overrides,
  };
}

function archiveBundle(overrides: Partial<ScanArchiveBundle> = {}): ScanArchiveBundle {
  return {
    comparison: comparison(),
    entries: [
      entry(),
      entry({
        anomalyCount: 1,
        candidateCount: 1,
        generatedAt: "2026-06-13T12:15:00.000Z",
        id: "scan-before",
        topSymbols: ["ONDOUSDT"],
      }),
    ],
    latestReplay: undefined,
    retention: {
      durable: true,
      maxEntries: 24,
      storage: "database",
    },
    ...overrides,
  };
}

test("buildScanEventFeed prioritizes new and removed signal changes before scan heartbeats", () => {
  const events = buildScanEventFeed(archiveBundle());

  assert.equal(events[0].type, "new_signal");
  assert.equal(events[0].title, "新增异动候选");
  assert.deepEqual(events[0].symbols, ["SUIUSDT"]);
  assert.equal(events[0].severity, "hot");

  assert.equal(events[1].type, "signal_removed");
  assert.equal(events[1].title, "候选冷却");
  assert.deepEqual(events[1].symbols, ["ONDOUSDT"]);
  assert.equal(events[1].severity, "cooldown");

  assert.equal(events[2].type, "scan_delta");
  assert.equal(events[2].title, "扫描强度变化");
  assert.equal(events[3].type, "scan_heartbeat");
});

test("buildScanEventFeed promotes live delta events above archived scan events", () => {
  const liveDelta: SignalSetDelta = {
    changedSymbols: ["BTCUSDT"],
    hasActionableChange: true,
    isNewScan: true,
    newSymbols: ["ENAUSDT"],
    removedSymbols: ["SOLUSDT"],
  };
  const events = buildScanEventFeed(archiveBundle({
    comparison: null,
  }), {
    liveDelta,
    liveGeneratedAt: "2026-06-13T12:46:00.000Z",
    liveScanId: "scan-live",
  });

  assert.equal(events[0].id, "scan-live:live:new:ENAUSDT");
  assert.equal(events[0].title, "实时新增异动");
  assert.equal(events[0].type, "new_signal");
  assert.equal(events[0].severity, "hot");
  assert.deepEqual(events[0].symbols, ["ENAUSDT"]);

  assert.equal(events[1].id, "scan-live:live:shift:BTCUSDT");
  assert.equal(events[1].title, "实时信号变化");
  assert.equal(events[1].type, "signal_shift");
  assert.equal(events[1].severity, "watch");

  assert.equal(events[2].id, "scan-live:live:removed:SOLUSDT");
  assert.equal(events[2].title, "实时候选冷却");
  assert.equal(events[2].type, "signal_removed");
  assert.equal(events[3].type, "scan_heartbeat");
});

test("buildScanEventFeed reports status and source changes as system events", () => {
  const events = buildScanEventFeed(archiveBundle({
    comparison: comparison({
      newSignalSymbols: [],
      removedSignalSymbols: [],
      sourceChanged: true,
      statusChanged: true,
    }),
  }));

  assert.equal(events[0].type, "system_shift");
  assert.equal(events[0].severity, "system");
  assert.match(events[0].detail, /状态或数据源/);
});

test("buildScanEventFeed falls back to recent scan heartbeats without a comparison", () => {
  const events = buildScanEventFeed(archiveBundle({
    comparison: null,
    entries: [
      entry({ id: "scan-c", generatedAt: "2026-06-13T12:45:00.000Z" }),
      entry({ id: "scan-b", generatedAt: "2026-06-13T12:30:00.000Z" }),
      entry({ id: "scan-a", generatedAt: "2026-06-13T12:15:00.000Z" }),
    ],
  }), {
    limit: 2,
  });

  assert.deepEqual(events.map((event) => event.id), [
    "scan-c:heartbeat",
    "scan-b:heartbeat",
  ]);
  assert.equal(events.every((event) => event.type === "scan_heartbeat"), true);
});
