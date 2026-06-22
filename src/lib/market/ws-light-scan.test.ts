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
  accumulator.ingest(event({
    minutes: 61,
    price: 250,
    quoteVolumeDeltaUsd: 10_000_000,
    symbol: "COINUSDT",
  }));

  const snapshot = accumulator.snapshot();

  assert.equal(snapshot.diagnostics.status, "ready");
  assert.equal(snapshot.diagnostics.source, "websocket-light-scan");
  assert.equal(snapshot.priorityCandidates[0]?.symbol, "ARBUSDT");
  assert.equal(snapshot.priorityCandidates[0]?.price, 1.06);
  assert.equal(snapshot.instruments.some((item) => item.symbol === "COINUSDT"), false);
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

test("createWebSocketLightScanProvider sanitizes stale Redis snapshots before exposing them", async () => {
  const store = createMemoryWebSocketLightScanStore({
    diagnostics: {
      acceptedCount: 2,
      candidateCount: 2,
      generatedAt: new Date(start + 1_000).toISOString(),
      notes: ["stored before filter update"],
      requestCount: 0,
      source: "websocket-light-scan",
      status: "ready",
      topCandidates: [
        {
          baseAsset: "COIN",
          changePercent24h: 1,
          distanceFromHighPercent: 0,
          distanceFromLowPercent: 1,
          reasons: ["websocket_sliding_window"],
          score: 99,
          state: "HOT",
          symbol: "COINUSDT",
          volume24hUsd: 1_000_000,
          volatilityPercent: 1,
        },
        {
          baseAsset: "ARB",
          changePercent24h: 1,
          distanceFromHighPercent: 0,
          distanceFromLowPercent: 1,
          reasons: ["websocket_sliding_window"],
          score: 90,
          state: "HOT",
          symbol: "ARBUSDT",
          volume24hUsd: 1_000_000,
          volatilityPercent: 1,
        },
      ],
      universeCount: 2,
    },
    instruments: [
      {
        baseAsset: "COIN",
        exchange: "BINANCE",
        id: "BINANCE-WS-LIGHT:COINUSDT",
        isActive: true,
        lastSeenAt: new Date(start + 1_000).toISOString(),
        marketType: "perpetual",
        quoteAsset: "USDT",
        symbol: "COINUSDT",
        tags: [],
        volume24hUsd: 1_000_000,
      },
      {
        baseAsset: "ARB",
        exchange: "BINANCE",
        id: "BINANCE-WS-LIGHT:ARBUSDT",
        isActive: true,
        lastSeenAt: new Date(start + 1_000).toISOString(),
        marketType: "perpetual",
        quoteAsset: "USDT",
        symbol: "ARBUSDT",
        tags: [],
        volume24hUsd: 1_000_000,
      },
    ],
    mode: "websocket_sliding_window",
    priorityCandidates: [
      {
        baseAsset: "COIN",
        changePercent24h: 1,
        distanceFromHighPercent: 0,
        distanceFromLowPercent: 1,
        reasons: ["websocket_sliding_window"],
        score: 99,
        state: "HOT",
        symbol: "COINUSDT",
        volume24hUsd: 1_000_000,
        volatilityPercent: 1,
      },
      {
        baseAsset: "ARB",
        changePercent24h: 1,
        distanceFromHighPercent: 0,
        distanceFromLowPercent: 1,
        reasons: ["websocket_sliding_window"],
        score: 90,
        state: "HOT",
        symbol: "ARBUSDT",
        volume24hUsd: 1_000_000,
        volatilityPercent: 1,
      },
    ],
    tickers: [
      {
        changePercent24h: 1,
        exchange: "BINANCE",
        high24h: 1,
        low24h: 1,
        price: 1,
        symbol: "COINUSDT",
        updatedAt: new Date(start + 1_000).toISOString(),
        volume24hUsd: 1_000_000,
      },
      {
        changePercent24h: 1,
        exchange: "BINANCE",
        high24h: 1,
        low24h: 1,
        price: 1,
        symbol: "ARBUSDT",
        updatedAt: new Date(start + 1_000).toISOString(),
        volume24hUsd: 1_000_000,
      },
    ],
    windowMs: 15 * 60_000,
  });
  const provider = createWebSocketLightScanProvider({
    now: () => new Date(start + 2_000),
    store,
  });

  const result = await provider.scan();

  assert.deepEqual(result.priorityCandidates.map((candidate) => candidate.symbol), ["ARBUSDT"]);
  assert.deepEqual(result.diagnostics.topCandidates.map((candidate) => candidate.symbol), ["ARBUSDT"]);
  assert.equal(result.diagnostics.candidateCount, 1);
  assert.equal(result.diagnostics.universeCount, 1);
  assert.equal(result.instruments.some((item) => item.symbol === "COINUSDT"), false);
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

  const provider = createWebSocketLightScanProvider({
    now: () => new Date(start + 2_000),
    store,
  });
  const result = await provider.scan();

  assert.equal(provider.id, "websocket-light-scan");
  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.source, "websocket-light-scan");
  assert.equal(result.instruments.length, 1);
});
