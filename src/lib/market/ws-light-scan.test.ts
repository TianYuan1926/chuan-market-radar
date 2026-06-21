import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryWebSocketLightScanStore,
  createWebSocketLightScanAccumulator,
  createWebSocketLightScanProvider,
} from "./ws-light-scan";

const start = Date.parse("2026-06-21T00:00:00.000Z");

function event({
  minutes,
  price,
  quoteVolumeDeltaUsd,
  symbol = "ARBUSDT",
}: {
  minutes: number;
  price: number;
  quoteVolumeDeltaUsd: number;
  symbol?: string;
}) {
  return {
    eventTime: new Date(start + minutes * 60_000).toISOString(),
    exchange: "BINANCE" as const,
    price,
    quoteVolumeDeltaUsd,
    symbol,
  };
}

test("createWebSocketLightScanAccumulator promotes volume z-score spikes without relying on 24h movers", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 100_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 2,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 1, quoteVolumeDeltaUsd: 100_000 }));
    accumulator.ingest(event({ minutes: minutes + 1, price: 1.01, quoteVolumeDeltaUsd: 20_000 }));
  }

  accumulator.ingest(event({ minutes: 60, price: 1.01, quoteVolumeDeltaUsd: 900_000 }));
  accumulator.ingest(event({ minutes: 61, price: 1.06, quoteVolumeDeltaUsd: 350_000 }));

  const snapshot = accumulator.snapshot();

  assert.equal(snapshot.diagnostics.status, "ready");
  assert.equal(snapshot.diagnostics.source, "websocket-light-scan");
  assert.equal(snapshot.priorityCandidates[0]?.symbol, "ARBUSDT");
  assert.equal(snapshot.priorityCandidates[0]?.state, "HOT");
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("volume_zscore_spike"));
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("price_impulse"));
  assert.equal(snapshot.instruments[0]?.exchange, "BINANCE");
  assert.equal(snapshot.tickers[0]?.changePercent24h, 4.95);
});

test("createWebSocketLightScanAccumulator detects pre-trend compression with rising volume", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 1.5,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 2, quoteVolumeDeltaUsd: 80_000, symbol: "SUIUSDT" }));
  }

  accumulator.ingest(event({ minutes: 60, price: 2.01, quoteVolumeDeltaUsd: 350_000, symbol: "SUIUSDT" }));
  accumulator.ingest(event({ minutes: 61, price: 2.02, quoteVolumeDeltaUsd: 120_000, symbol: "SUIUSDT" }));

  const snapshot = accumulator.snapshot();

  assert.equal(snapshot.priorityCandidates[0]?.symbol, "SUIUSDT");
  assert.equal(snapshot.priorityCandidates[0]?.state, "PRE_TREND");
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("compression_volume_accumulation"));
});

test("createWebSocketLightScanStore persists snapshots for a future Redis-backed worker", async () => {
  const store = createMemoryWebSocketLightScanStore();
  const accumulator = createWebSocketLightScanAccumulator({
    now: () => new Date(start + 1_000),
  });

  accumulator.ingest(event({ minutes: 0, price: 1, quoteVolumeDeltaUsd: 120_000 }));
  await store.writeSnapshot(accumulator.snapshot());

  const snapshot = await store.readSnapshot();

  assert.equal(snapshot?.diagnostics.source, "websocket-light-scan");
  assert.equal(snapshot?.diagnostics.universeCount, 1);
});

test("createWebSocketLightScanProvider exposes stored snapshots as a public light scan provider", async () => {
  const store = createMemoryWebSocketLightScanStore();
  const accumulator = createWebSocketLightScanAccumulator({
    now: () => new Date(start + 1_000),
  });

  accumulator.ingest(event({ minutes: 0, price: 1, quoteVolumeDeltaUsd: 120_000 }));
  await store.writeSnapshot(accumulator.snapshot());

  const provider = createWebSocketLightScanProvider({ store });
  const result = await provider.scan();

  assert.equal(provider.id, "websocket-light-scan");
  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.source, "websocket-light-scan");
  assert.equal(result.instruments.length, 1);
});
