import assert from "node:assert/strict";
import test from "node:test";
import { getConfiguredMarketProvider, parseBaseAssets } from "./provider-registry";

test("parseBaseAssets normalizes configured symbols and removes empty values", () => {
  assert.deepEqual(parseBaseAssets(" btc, ETHUSDT, sui/usdt, , ondo "), [
    "BTC",
    "ETH",
    "SUI",
    "ONDO",
  ]);
});

test("getConfiguredMarketProvider stays on mock unless CoinGlass is explicitly enabled with a key", () => {
  assert.equal(getConfiguredMarketProvider({}).id, "mock");
  assert.equal(getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
  }).id, "mock");
});

test("getConfiguredMarketProvider returns CoinGlass provider when enabled", () => {
  const provider = getConfiguredMarketProvider({
    MARKET_DATA_PROVIDER: "coinglass",
    COINGLASS_API_KEY: "test-key",
    COINGLASS_BASE_ASSETS: "BTC,ENA",
  });

  assert.equal(provider.id, "coinglass");
  assert.equal(provider.label, "CoinGlass Futures Provider");
});
