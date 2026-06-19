import assert from "node:assert/strict";
import test from "node:test";

import {
  createBinancePublicLightScanProvider,
  disabledPublicLightScanProvider,
} from "./public-light-scan";

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  } as Response;
}

test("createBinancePublicLightScanProvider converts public futures tickers into light scan candidates", async () => {
  const provider = createBinancePublicLightScanProvider({
    now: () => new Date("2026-06-19T00:00:00.000Z"),
    fetcher: async () => response([
      {
        symbol: "ARBUSDT",
        lastPrice: "1.2",
        highPrice: "1.22",
        lowPrice: "1.01",
        priceChangePercent: "6.5",
        quoteVolume: "42000000",
      },
      {
        symbol: "SUIUSDT",
        lastPrice: "2.1",
        highPrice: "2.14",
        lowPrice: "2.05",
        priceChangePercent: "0.4",
        quoteVolume: "22000000",
      },
      {
        symbol: "BTCUSDC",
        lastPrice: "100",
        highPrice: "101",
        lowPrice: "99",
        priceChangePercent: "1",
        quoteVolume: "1000000",
      },
    ]),
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "ready");
  assert.equal(result.diagnostics.universeCount, 3);
  assert.equal(result.diagnostics.acceptedCount, 2);
  assert.equal(result.instruments.length, 2);
  assert.deepEqual(result.instruments.map((item) => item.symbol), ["ARBUSDT", "SUIUSDT"]);
  assert.deepEqual(result.priorityCandidates.map((item) => item.symbol), ["ARBUSDT", "SUIUSDT"]);
  assert.equal(result.priorityCandidates[0]?.state, "HOT");
  assert.equal(result.priorityCandidates[1]?.state, "PRE_TREND");
  assert.equal(result.tickers[0]?.exchange, "BINANCE");
});

test("createBinancePublicLightScanProvider returns a typed failure without throwing", async () => {
  const provider = createBinancePublicLightScanProvider({
    fetcher: async () => response({ error: "blocked" }, false, 451),
  });

  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "failed");
  assert.equal(result.diagnostics.requestCount, 1);
  assert.match(result.diagnostics.notes.join(" "), /451/);
  assert.equal(result.priorityCandidates.length, 0);
});

test("disabledPublicLightScanProvider keeps tests and previews offline", async () => {
  const provider = disabledPublicLightScanProvider(() => new Date("2026-06-19T00:00:00.000Z"));
  const result = await provider.scan();

  assert.equal(result.diagnostics.status, "disabled");
  assert.equal(result.diagnostics.requestCount, 0);
  assert.equal(result.instruments.length, 0);
});
