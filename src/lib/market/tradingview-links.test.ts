import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTradingViewUrl,
  toTradingViewInterval,
  toTradingViewSymbol,
} from "./tradingview-links";

test("toTradingViewSymbol formats perpetual symbols for TradingView", () => {
  assert.equal(toTradingViewSymbol({ exchange: "BINANCE", symbol: "ENAUSDT" }), "BINANCE:ENAUSDT.P");
  assert.equal(toTradingViewSymbol({ exchange: "OKX", symbol: "SUIUSDT" }), "OKX:SUIUSDT.P");
});

test("toTradingViewInterval maps app timeframes to TradingView intervals", () => {
  assert.equal(toTradingViewInterval("15m"), "15");
  assert.equal(toTradingViewInterval("1h"), "60");
  assert.equal(toTradingViewInterval("4h"), "240");
  assert.equal(toTradingViewInterval("1d"), "D");
  assert.equal(toTradingViewInterval("1w"), "W");
});

test("buildTradingViewUrl includes selected symbol and active timeframe", () => {
  const url = buildTradingViewUrl({
    baseUrl: "https://www.tradingview.com/chart/",
    exchange: "BINANCE",
    symbol: "ENAUSDT",
    timeframe: "15m",
  });

  assert.equal(
    url,
    "https://www.tradingview.com/chart/?symbol=BINANCE%3AENAUSDT.P&interval=15",
  );
});
