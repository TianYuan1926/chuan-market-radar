import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubscriptionChunks,
  createLightScanAccumulator,
  discoverBinanceSymbols,
  discoverBybitSymbols,
  discoverOkxSymbols,
  filterTickerEventsByAllowedSymbols,
  parseBinanceTickerMessage,
  parseBybitTickerMessage,
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
