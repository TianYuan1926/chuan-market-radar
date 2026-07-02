import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubscriptionChunks,
  createLightScanAccumulator,
  discoverBinanceSymbols,
  discoverBybitSymbols,
  discoverOkxSymbols,
  filterTickerEventsByAllowedSymbols,
  parseBinanceAggTradeMessage,
  parseBinanceBookTickerMessage,
  parseBinanceTickerMessage,
  parseBybitPublicTradeMessage,
  parseBybitTickerMessage,
  parseOkxTradeMessage,
  parseOkxTickerMessage,
} from "./ws-light-scan-worker.mjs";

test("parseBinanceTickerMessage converts USD-M all ticker events into light scan events", () => {
  const events = parseBinanceTickerMessage(JSON.stringify([
    { E: 1_797_760_000_000, c: "7.42", q: "4200000", s: "TIAUSDT" },
    { E: 1_797_760_000_000, c: "66000", q: "12000000", s: "BTCUSD_260327" },
  ]));

  assert.deepEqual(events, [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "BINANCE",
    flowSource: "ticker",
    price: 7.42,
    quoteVolume24hUsd: 4_200_000,
    symbol: "TIAUSDT",
  }]);
});

test("parseBinanceTickerMessage accepts Buffer WebSocket payloads", () => {
  const events = parseBinanceTickerMessage(Buffer.from(JSON.stringify([
    { E: 1_797_760_000_000, c: "0.88", q: "980000", s: "SUIUSDT" },
  ])));

  assert.equal(events[0]?.symbol, "SUIUSDT");
  assert.equal(events[0]?.price, 0.88);
});

test("trade parsers convert public taker trades into CVD proxy events", () => {
  assert.deepEqual(parseBinanceAggTradeMessage(JSON.stringify({
    E: 1_797_760_000_000,
    T: 1_797_760_000_000,
    e: "aggTrade",
    m: false,
    p: "1.25",
    q: "1000",
    s: "ARBUSDT",
  })), [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "BINANCE",
    flowSource: "trade",
    price: 1.25,
    quoteVolumeDeltaUsd: 1250,
    symbol: "ARBUSDT",
    takerSide: "buy",
  }]);

  assert.deepEqual(parseOkxTradeMessage(JSON.stringify({
    arg: { channel: "trades", instId: "SUI-USDT-SWAP" },
    data: [
      { instId: "SUI-USDT-SWAP", px: "2.5", side: "sell", sz: "200", ts: "1797760000000" },
    ],
  })), [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "OKX",
    flowSource: "trade",
    price: 2.5,
    quoteVolumeDeltaUsd: 500,
    symbol: "SUIUSDT",
    takerSide: "sell",
  }]);

  assert.deepEqual(parseBybitPublicTradeMessage(JSON.stringify({
    data: [
      { S: "Buy", T: 1_797_760_000_000, p: "0.42", s: "ENAUSDT", v: "3000" },
    ],
    topic: "publicTrade.ENAUSDT",
  })), [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "BYBIT",
    flowSource: "trade",
    price: 0.42,
    quoteVolumeDeltaUsd: 1260,
    symbol: "ENAUSDT",
    takerSide: "buy",
  }]);
});

test("parseBinanceBookTickerMessage converts bookTicker rows into orderbook pressure events", () => {
  assert.deepEqual(parseBinanceBookTickerMessage(JSON.stringify({
    E: 1_797_760_000_000,
    a: "1.002",
    A: "100000",
    b: "1.000",
    B: "300000",
    s: "ARBUSDT",
  })), [{
    bestAskPrice: 1.002,
    bestAskQuantity: 100_000,
    bestBidPrice: 1,
    bestBidQuantity: 300_000,
    bookSource: "book_ticker",
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "BINANCE",
    flowSource: "book",
    price: 1.001,
    symbol: "ARBUSDT",
  }]);
});

test("ticker parsers reject tokenized stocks and commodities before light scan", () => {
  assert.deepEqual(parseBinanceTickerMessage(JSON.stringify([
    { E: 1_797_760_000_000, c: "85", q: "980000", s: "WDCUSDT" },
    { E: 1_797_760_000_000, c: "4.2", q: "980000", s: "NOKUSDT" },
  ])), []);
  assert.deepEqual(parseOkxTickerMessage(JSON.stringify({
    data: [
      { instCategory: "3", instId: "SAMSUNG-USDT-SWAP", last: "1200", ruleType: "normal", ts: "1797760000000", volCcy24h: "1000" },
      { instCategory: "3", instId: "NATGAS-USDT-SWAP", last: "3", ruleType: "normal", ts: "1797760000000", volCcy24h: "1000" },
      { instCategory: "3", instId: "OPENAI-USDT-SWAP", last: "700", ruleType: "pre_market", ts: "1797760000000", volCcy24h: "1000" },
      { instCategory: "3", instId: "COHR-USDT-SWAP", last: "85", ruleType: "normal", ts: "1797760000000", volCcy24h: "1000" },
      { instCategory: "1", instId: "龙虾-USDT-SWAP", last: "85", ruleType: "normal", ts: "1797760000000", volCcy24h: "1000" },
    ],
  })), []);
  assert.deepEqual(parseBybitTickerMessage(JSON.stringify({
    data: [
      { lastPrice: "220", symbol: "COINUSDT", turnover24h: "1000000" },
      { lastPrice: "15", symbol: "AAOIUSDT", turnover24h: "1000000" },
    ],
    ts: 1_797_760_000_000,
  })), []);
});

test("parseOkxTickerMessage converts USDT swap ticker events into light scan events", () => {
  const events = parseOkxTickerMessage(JSON.stringify({
    arg: { channel: "tickers", instId: "TIA-USDT-SWAP" },
    data: [
      { instCategory: "1", instId: "TIA-USDT-SWAP", last: "7.5", ruleType: "normal", ts: "1797760000000", volCcy24h: "100000" },
      { instCategory: "1", instId: "BTC-USD-SWAP", last: "66000", ruleType: "normal", ts: "1797760000000", volCcy24h: "500" },
      { instCategory: "3", instId: "ADBE-USDT-SWAP", last: "400", ruleType: "normal", ts: "1797760000000", volCcy24h: "500" },
    ],
  }));

  assert.deepEqual(events, [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "OKX",
    flowSource: "ticker",
    price: 7.5,
    quoteVolume24hUsd: 750_000,
    symbol: "TIAUSDT",
  }]);
});

test("discoverOkxSymbols keeps only OKX crypto swap instruments", async () => {
  const symbols = await discoverOkxSymbols({
    limit: 20,
    fetcher: async () => new Response(JSON.stringify({
      code: "0",
      data: [
        { instCategory: "1", instId: "ARB-USDT-SWAP", ruleType: "normal" },
        { instCategory: "3", instId: "COHR-USDT-SWAP", ruleType: "normal" },
        { instCategory: "3", instId: "OPENAI-USDT-SWAP", ruleType: "pre_market" },
        { instCategory: "1", instId: "SUI-USDT-SWAP", ruleType: "normal" },
        { instCategory: "1", instId: "BTC-USD-SWAP", ruleType: "normal" },
        { instCategory: "1", instId: "龙虾-USDT-SWAP", ruleType: "normal" },
      ],
    })),
  });

  assert.deepEqual(symbols, ["ARB-USDT-SWAP", "SUI-USDT-SWAP"]);
});

test("discoverBinanceSymbols keeps only Binance COIN perpetual instruments", async () => {
  const symbols = await discoverBinanceSymbols({
    limit: 20,
    fetcher: async () => new Response(JSON.stringify({
      symbols: [
        { baseAsset: "ARB", contractType: "PERPETUAL", quoteAsset: "USDT", status: "TRADING", symbol: "ARBUSDT", underlyingType: "COIN" },
        { baseAsset: "BB", contractType: "PERPETUAL", quoteAsset: "USDT", status: "TRADING", symbol: "BBUSDT", underlyingType: "COIN" },
        { baseAsset: "COHR", contractType: "TRADIFI_PERPETUAL", quoteAsset: "USDT", status: "TRADING", symbol: "COHRUSDT", underlyingType: "EQUITY" },
        { baseAsset: "CL", contractType: "TRADIFI_PERPETUAL", quoteAsset: "USDT", status: "TRADING", symbol: "CLUSDT", underlyingType: "COMMODITY" },
        { baseAsset: "OPENAI", contractType: "TRADIFI_PERPETUAL", quoteAsset: "USDT", status: "TRADING", symbol: "OPENAIUSDT", underlyingType: "PREMARKET" },
      ],
    })),
  });

  assert.deepEqual(symbols, ["ARBUSDT", "BBUSDT"]);
});

test("discoverBybitSymbols rejects stock and commodity linear instruments", async () => {
  const symbols = await discoverBybitSymbols({
    limit: 20,
    fetcher: async () => new Response(JSON.stringify({
      retCode: 0,
      result: {
        list: [
          { baseCoin: "ENA", contractType: "LinearPerpetual", quoteCoin: "USDT", status: "Trading", symbol: "ENAUSDT", symbolType: "" },
          { baseCoin: "QNT", contractType: "LinearPerpetual", quoteCoin: "USDT", status: "Trading", symbol: "QNTUSDT", symbolType: "" },
          { baseCoin: "BE", contractType: "LinearPerpetual", quoteCoin: "USDT", status: "Trading", symbol: "BEUSDT", symbolType: "stock" },
          { baseCoin: "CL", contractType: "LinearPerpetual", quoteCoin: "USDT", status: "Trading", symbol: "CLUSDT", symbolType: "commodity" },
        ],
        nextPageCursor: "",
      },
    })),
  });

  assert.deepEqual(symbols, ["ENAUSDT", "QNTUSDT"]);
});

test("filterTickerEventsByAllowedSymbols applies discovery allowlists before ingestion", () => {
  const events = [
    { exchange: "BINANCE", symbol: "ARBUSDT" },
    { exchange: "BINANCE", symbol: "COHRUSDT" },
    { exchange: "BINANCE", symbol: "BBUSDT" },
  ];

  assert.deepEqual(filterTickerEventsByAllowedSymbols(events, new Set(["ARBUSDT", "BBUSDT"])), [
    { exchange: "BINANCE", symbol: "ARBUSDT" },
    { exchange: "BINANCE", symbol: "BBUSDT" },
  ]);
});

test("parseBybitTickerMessage converts linear ticker events into light scan events", () => {
  const events = parseBybitTickerMessage(JSON.stringify({
    data: {
      lastPrice: "0.42",
      symbol: "ENAUSDT",
      turnover24h: "910000",
    },
    ts: 1_797_760_000_000,
    topic: "tickers.ENAUSDT",
  }));

  assert.deepEqual(events, [{
    eventTime: "2026-12-20T09:46:40.000Z",
    exchange: "BYBIT",
    flowSource: "ticker",
    price: 0.42,
    quoteVolume24hUsd: 910_000,
    symbol: "ENAUSDT",
  }]);
});

test("createLightScanAccumulator promotes a 15m volume z-score spike into Redis snapshot shape", () => {
  const accumulator = createLightScanAccumulator({
    now: () => new Date("2026-06-21T00:45:00.000Z"),
    windowMs: 15 * 60 * 1000,
    zScoreThreshold: 1.2,
    minCandidateVolumeUsd: 50_000,
  });

  for (let index = 0; index < 4; index += 1) {
    accumulator.ingest({
      eventTime: new Date(Date.UTC(2026, 5, 21, 0, index * 15, 0)).toISOString(),
      exchange: "BINANCE",
      price: 1 + index * 0.01,
      quoteVolume24hUsd: 100_000 + index * 20_000,
      symbol: "ALTUSDT",
    });
  }

  accumulator.ingest({
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    price: 1.12,
    quoteVolume24hUsd: 1_000_000,
    symbol: "ALTUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:01:00.000Z",
    exchange: "BINANCE",
    price: 1.16,
    quoteVolume24hUsd: 1_080_000,
    symbol: "ALTUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:01:00.000Z",
    exchange: "BINANCE",
    price: 150,
    quoteVolume24hUsd: 10_000_000,
    symbol: "COINUSDT",
  });

  const snapshot = accumulator.snapshot();

  assert.equal(snapshot.mode, "websocket_sliding_window");
  assert.equal(snapshot.diagnostics.source, "websocket-light-scan");
  assert.equal(snapshot.priorityCandidates[0]?.symbol, "ALTUSDT");
  assert.equal(snapshot.priorityCandidates[0]?.price, 1.16);
  assert.equal(snapshot.priorityCandidates[0]?.volumeSource, "rolling_window");
  assert.equal(snapshot.priorityCandidates[0]?.volumeWindowMs, 15 * 60 * 1000);
  assert.equal(snapshot.priorityCandidates[0]?.volumeWindowUsd, 920_000);
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.proxyQuality, "rolling_price_volume_proxy");
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.pressureSide, "buy");
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.buyPressureUsd, 920_000);
  assert.equal(snapshot.priorityCandidates[0]?.microstructure?.cvdProxyUsd, 920_000);
  assert.equal(snapshot.instruments.some((item) => item.symbol === "COINUSDT"), false);
  assert.equal(snapshot.priorityCandidates[0]?.state, "HOT");
  assert.match(snapshot.priorityCandidates[0]?.reasons.join(","), /volume_zscore_spike/);
  assert.match(snapshot.priorityCandidates[0]?.reasons.join(","), /cvd_proxy_positive/);
  assert.ok(snapshot.priorityCandidates[0]?.earlyOpportunityScore >= 0);
  assert.ok(["breakout_watch", "early_setup", "late_move", "neutral_watch"].includes(snapshot.priorityCandidates[0]?.opportunityPhase));
});

test("createLightScanAccumulator ranks early compression ahead of late extensions", () => {
  const accumulator = createLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date("2026-06-21T01:01:00.000Z"),
    windowMs: 15 * 60 * 1000,
    zScoreThreshold: 1.5,
  });

  for (let index = 0; index < 4; index += 1) {
    const eventTime = new Date(Date.UTC(2026, 5, 21, 0, index * 15, 0)).toISOString();

    accumulator.ingest({
      eventTime,
      exchange: "BINANCE",
      price: 2,
      quoteVolume24hUsd: 100_000 + index * 70_000,
      symbol: "EARLYUSDT",
    });
    accumulator.ingest({
      eventTime,
      exchange: "BINANCE",
      price: 1,
      quoteVolume24hUsd: 100_000 + index * 70_000,
      symbol: "LATEUSDT",
    });
  }

  accumulator.ingest({
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    price: 2.01,
    quoteVolume24hUsd: 720_000,
    symbol: "EARLYUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:01:00.000Z",
    exchange: "BINANCE",
    price: 2.02,
    quoteVolume24hUsd: 870_000,
    symbol: "EARLYUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    price: 1,
    quoteVolume24hUsd: 900_000,
    symbol: "LATEUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:01:00.000Z",
    exchange: "BINANCE",
    price: 1.08,
    quoteVolume24hUsd: 1_400_000,
    symbol: "LATEUSDT",
  });

  const snapshot = accumulator.snapshot();
  const early = snapshot.priorityCandidates.find((candidate) => candidate.symbol === "EARLYUSDT");
  const late = snapshot.priorityCandidates.find((candidate) => candidate.symbol === "LATEUSDT");

  assert.equal(snapshot.priorityCandidates[0]?.symbol, "EARLYUSDT");
  assert.equal(early?.opportunityPhase, "early_setup");
  assert.equal(late?.opportunityPhase, "late_move");
  assert.ok(early.score > late.score);
  assert.ok(late.score <= 42);
});

test("createLightScanAccumulator marks intrawindow overextension for review instead of early opportunity", () => {
  const accumulator = createLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date("2026-06-21T01:01:00.000Z"),
    windowMs: 15 * 60 * 1000,
    zScoreThreshold: 1.5,
  });

  for (let index = 0; index < 4; index += 1) {
    accumulator.ingest({
      eventTime: new Date(Date.UTC(2026, 5, 21, 0, index * 15, 0)).toISOString(),
      exchange: "BINANCE",
      price: 1,
      quoteVolume24hUsd: 100_000 + index * 80_000,
      symbol: "LATEUSDT",
    });
  }

  accumulator.ingest({
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    price: 1,
    quoteVolume24hUsd: 800_000,
    symbol: "LATEUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:01:00.000Z",
    exchange: "BINANCE",
    price: 1.08,
    quoteVolume24hUsd: 1_200_000,
    symbol: "LATEUSDT",
  });

  const late = accumulator.snapshot().priorityCandidates.find((candidate) => candidate.symbol === "LATEUSDT");

  assert.equal(late?.opportunityPhase, "late_move");
  assert.equal(late?.overextensionRisk, "high");
  assert.match(late?.reasons.join(",") ?? "", /intrawindow_overextended_capped/);
});

test("createLightScanAccumulator uses public taker trades for CVD proxy when available", () => {
  const accumulator = createLightScanAccumulator({
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date("2026-06-21T01:01:00.000Z"),
    windowMs: 15 * 60 * 1000,
    zScoreThreshold: 1.2,
  });

  for (let index = 0; index < 4; index += 1) {
    accumulator.ingest({
      eventTime: new Date(Date.UTC(2026, 5, 21, 0, index * 15, 0)).toISOString(),
      exchange: "BINANCE",
      price: 1,
      quoteVolume24hUsd: 100_000 + index * 50_000,
      symbol: "FLOWUSDT",
    });
  }

  accumulator.ingest({
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    price: 1.01,
    quoteVolume24hUsd: 1_000_000,
    symbol: "FLOWUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:00:10.000Z",
    exchange: "BINANCE",
    flowSource: "trade",
    price: 1.011,
    quoteVolumeDeltaUsd: 520_000,
    symbol: "FLOWUSDT",
    takerSide: "buy",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:00:20.000Z",
    exchange: "BINANCE",
    flowSource: "trade",
    price: 1.012,
    quoteVolumeDeltaUsd: 80_000,
    symbol: "FLOWUSDT",
    takerSide: "sell",
  });

  const flow = accumulator.snapshot().priorityCandidates.find((candidate) => candidate.symbol === "FLOWUSDT");

  assert.equal(flow?.microstructure?.proxyQuality, "taker_trade_proxy");
  assert.equal(flow?.microstructure?.buyPressureUsd, 520_000);
  assert.equal(flow?.microstructure?.sellPressureUsd, 80_000);
  assert.equal(flow?.microstructure?.cvdProxyUsd, 440_000);
  assert.equal(flow?.microstructure?.pressureSide, "buy");
  assert.match(flow?.reasons.join(",") ?? "", /cvd_proxy_positive/);
});

test("createLightScanAccumulator exposes orderbook pressure and large taker trade proxies", () => {
  const accumulator = createLightScanAccumulator({
    largeTakerTradeUsd: 100_000,
    maxBaselineWindows: 4,
    minCandidateVolumeUsd: 50_000,
    now: () => new Date("2026-06-21T01:01:00.000Z"),
    windowMs: 15 * 60 * 1000,
    zScoreThreshold: 1.2,
  });

  for (let index = 0; index < 4; index += 1) {
    accumulator.ingest({
      eventTime: new Date(Date.UTC(2026, 5, 21, 0, index * 15, 0)).toISOString(),
      exchange: "BINANCE",
      price: 1,
      quoteVolume24hUsd: 100_000 + index * 50_000,
      symbol: "BOOKUSDT",
    });
  }

  accumulator.ingest({
    bestAskPrice: 1.002,
    bestAskQuantity: 80_000,
    bestBidPrice: 1,
    bestBidQuantity: 260_000,
    bookSource: "book_ticker",
    eventTime: "2026-06-21T01:00:00.000Z",
    exchange: "BINANCE",
    flowSource: "book",
    price: 1.001,
    symbol: "BOOKUSDT",
  });
  accumulator.ingest({
    eventTime: "2026-06-21T01:00:10.000Z",
    exchange: "BINANCE",
    flowSource: "trade",
    price: 1.01,
    quoteVolumeDeltaUsd: 420_000,
    symbol: "BOOKUSDT",
    takerSide: "buy",
  });

  const snapshot = accumulator.snapshot();
  const candidate = snapshot.priorityCandidates.find((item) => item.symbol === "BOOKUSDT");

  assert.equal(candidate?.microstructure?.bookProxyQuality, "book_ticker_proxy");
  assert.equal(candidate?.microstructure?.bookPressureSide, "buy");
  assert.ok((candidate?.microstructure?.bookImbalance ?? 0) > 0.2);
  assert.equal(candidate?.microstructure?.largeTakerTradeUsd, 420_000);
  assert.equal(candidate?.microstructure?.largeTakerTradeSide, "buy");
  assert.match(candidate?.reasons.join(",") ?? "", /orderbook_buy_pressure/);
  assert.match(candidate?.reasons.join(",") ?? "", /large_taker_buy_trade/);
  assert.equal(snapshot.anomalyFrames?.[0]?.symbol, "BOOKUSDT");
  assert.equal(snapshot.anomalyFrames?.[0]?.bookPressureSide, "buy");
});

test("buildSubscriptionChunks caps WebSocket subscription payload size", () => {
  const chunks = buildSubscriptionChunks(
    ["AUSDT", "BUSDT", "CUSDT", "DUSDT"].map((symbol) => `tickers.${symbol}`),
    2,
  );

  assert.deepEqual(chunks, [
    ["tickers.AUSDT", "tickers.BUSDT"],
    ["tickers.CUSDT", "tickers.DUSDT"],
  ]);
});
