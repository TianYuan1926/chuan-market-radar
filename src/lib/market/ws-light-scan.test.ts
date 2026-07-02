import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryWebSocketLightScanStore,
  createWebSocketLightScanAccumulator,
  createWebSocketLightScanProvider,
} from "./ws-light-scan";

const start = Date.parse("2026-06-21T00:00:00.000Z");

function event({
  flowSource,
  minutes,
  price,
  quoteVolumeDeltaUsd,
  symbol = "ARBUSDT",
  takerSide,
  book,
}: {
  book?: {
    askPrice: number;
    askQuantity: number;
    bidPrice: number;
    bidQuantity: number;
  };
  flowSource?: "book" | "ticker" | "trade";
  minutes: number;
  price: number;
  quoteVolumeDeltaUsd: number;
  symbol?: string;
  takerSide?: "buy" | "sell" | "unknown";
}) {
  return {
    eventTime: new Date(start + minutes * 60_000).toISOString(),
    exchange: "BINANCE" as const,
    bestAskPrice: book?.askPrice,
    bestAskQuantity: book?.askQuantity,
    bestBidPrice: book?.bidPrice,
    bestBidQuantity: book?.bidQuantity,
    bookSource: book ? "book_ticker" as const : undefined,
    flowSource,
    price,
    quoteVolumeDeltaUsd,
    symbol,
    takerSide,
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
  assert.equal(snapshot.priorityCandidates[0]?.volumeSource, "rolling_window");
  assert.equal(snapshot.priorityCandidates[0]?.volumeWindowMs, 15 * 60_000);
  assert.equal(snapshot.priorityCandidates[0]?.volumeWindowUsd, 1_250_000);
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.proxyQuality, "rolling_price_volume_proxy");
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.pressureSide, "buy");
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.buyPressureUsd, 350_000);
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.cvdProxyUsd, 350_000);
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("volume_zscore_spike"));
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("price_impulse"));
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("trade_flow_proxy_imbalance"));
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("cvd_proxy_positive"));
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
  assert.equal(snapshot.priorityCandidates[0]?.opportunityPhase, "early_setup");
  assert.ok((snapshot.priorityCandidates[0]?.earlyOpportunityScore ?? 0) >= 60);
  assert.equal(snapshot.priorityCandidates[0]?.overextensionRisk, "low");
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("compression_volume_accumulation"));
  assert.ok(snapshot.priorityCandidates[0]?.reasons.includes("early_opportunity_watch"));
});

test("createWebSocketLightScanAccumulator ranks early setups ahead of late extensions", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 1.5,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 2, quoteVolumeDeltaUsd: 80_000, symbol: "EARLYUSDT" }));
    accumulator.ingest(event({ minutes, price: 1, quoteVolumeDeltaUsd: 80_000, symbol: "LATEUSDT" }));
  }

  accumulator.ingest(event({ minutes: 60, price: 2.01, quoteVolumeDeltaUsd: 360_000, symbol: "EARLYUSDT" }));
  accumulator.ingest(event({ minutes: 61, price: 2.02, quoteVolumeDeltaUsd: 130_000, symbol: "EARLYUSDT" }));
  accumulator.ingest(event({ minutes: 60, price: 1, quoteVolumeDeltaUsd: 500_000, symbol: "LATEUSDT" }));
  accumulator.ingest(event({ minutes: 61, price: 1.08, quoteVolumeDeltaUsd: 500_000, symbol: "LATEUSDT" }));

  const snapshot = accumulator.snapshot();
  const early = snapshot.priorityCandidates.find((candidate) => candidate.symbol === "EARLYUSDT");
  const late = snapshot.priorityCandidates.find((candidate) => candidate.symbol === "LATEUSDT");

  assert.equal(snapshot.priorityCandidates[0]?.symbol, "EARLYUSDT");
  assert.equal(early?.opportunityPhase, "early_setup");
  assert.equal(late?.opportunityPhase, "late_move");
  assert.ok((early?.score ?? 0) > (late?.score ?? 0));
  assert.ok((late?.score ?? 0) <= 42);
});

test("createWebSocketLightScanAccumulator caps intrawindow overextension as late move", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 1.5,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 1, quoteVolumeDeltaUsd: 80_000, symbol: "LATEUSDT" }));
  }

  accumulator.ingest(event({ minutes: 60, price: 1.0, quoteVolumeDeltaUsd: 400_000, symbol: "LATEUSDT" }));
  accumulator.ingest(event({ minutes: 61, price: 1.08, quoteVolumeDeltaUsd: 400_000, symbol: "LATEUSDT" }));

  const snapshot = accumulator.snapshot();
  const late = snapshot.priorityCandidates.find((candidate) => candidate.symbol === "LATEUSDT");

  assert.equal(late?.opportunityPhase, "late_move");
  assert.equal(late?.overextensionRisk, "high");
  assert.ok(late?.reasons.includes("intrawindow_overextended_capped"));
});

test("createWebSocketLightScanAccumulator prefers taker trade flow for CVD proxy", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 1.2,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 1, quoteVolumeDeltaUsd: 100_000, symbol: "FLOWUSDT" }));
  }

  accumulator.ingest(event({ minutes: 60, price: 1.01, quoteVolumeDeltaUsd: 900_000, symbol: "FLOWUSDT" }));
  accumulator.ingest(event({
    flowSource: "trade",
    minutes: 60,
    price: 1.011,
    quoteVolumeDeltaUsd: 420_000,
    symbol: "FLOWUSDT",
    takerSide: "buy",
  }));
  accumulator.ingest(event({
    flowSource: "trade",
    minutes: 61,
    price: 1.012,
    quoteVolumeDeltaUsd: 120_000,
    symbol: "FLOWUSDT",
    takerSide: "sell",
  }));

  const flow = accumulator.snapshot().priorityCandidates.find((candidate) => candidate.symbol === "FLOWUSDT");

  assert.equal(flow?.microstructure?.proxyQuality, "taker_trade_proxy");
  assert.equal(flow?.microstructure?.buyPressureUsd, 420_000);
  assert.equal(flow?.microstructure?.sellPressureUsd, 120_000);
  assert.equal(flow?.microstructure?.cvdProxyUsd, 300_000);
  assert.equal(flow?.microstructure?.pressureSide, "buy");
  assert.ok(flow?.reasons.includes("cvd_proxy_positive"));
});

test("createWebSocketLightScanAccumulator carries orderbook pressure and large taker trade proxies", () => {
  const accumulator = createWebSocketLightScanAccumulator({
    largeTakerTradeUsd: 100_000,
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date(start + 61 * 60_000),
    windowMs: 15 * 60_000,
    zScoreThreshold: 1.2,
  });

  for (const minutes of [0, 15, 30, 45]) {
    accumulator.ingest(event({ minutes, price: 1, quoteVolumeDeltaUsd: 100_000, symbol: "BOOKUSDT" }));
  }

  accumulator.ingest(event({
    book: {
      askPrice: 1.002,
      askQuantity: 80_000,
      bidPrice: 1,
      bidQuantity: 260_000,
    },
    flowSource: "book",
    minutes: 60,
    price: 1.001,
    quoteVolumeDeltaUsd: 0,
    symbol: "BOOKUSDT",
  }));
  accumulator.ingest(event({
    flowSource: "trade",
    minutes: 60,
    price: 1.01,
    quoteVolumeDeltaUsd: 420_000,
    symbol: "BOOKUSDT",
    takerSide: "buy",
  }));

  const snapshot = accumulator.snapshot();
  const candidate = snapshot.priorityCandidates.find((item) => item.symbol === "BOOKUSDT");

  assert.equal(candidate?.microstructure?.bookProxyQuality, "book_ticker_proxy");
  assert.equal(candidate?.microstructure?.bookPressureSide, "buy");
  assert.ok((candidate?.microstructure?.bookImbalance ?? 0) > 0.2);
  assert.equal(candidate?.microstructure?.largeTakerTradeUsd, 420_000);
  assert.equal(candidate?.microstructure?.largeTakerTradeSide, "buy");
  assert.ok(candidate?.reasons.includes("orderbook_buy_pressure"));
  assert.ok(candidate?.reasons.includes("large_taker_buy_trade"));
  assert.equal(snapshot.anomalyFrames?.[0]?.symbol, "BOOKUSDT");
  assert.equal(snapshot.anomalyFrames?.[0]?.bookPressureSide, "buy");
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
