import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCoinGlassHeatCell,
  mapCoinGlassDerivativeSnapshot,
  mapCoinGlassInstrument,
  mapCoinGlassMarketInstrument,
  mapCoinGlassTicker,
  normalizeCoinGlassExchange,
} from "./coinglass-mapper";

const updatedAt = "2026-06-12T10:20:00.000Z";

test("normalizeCoinGlassExchange maps common futures venues into internal exchange ids", () => {
  assert.equal(normalizeCoinGlassExchange("Binance"), "BINANCE");
  assert.equal(normalizeCoinGlassExchange("OKX"), "OKX");
  assert.equal(normalizeCoinGlassExchange("Bybit"), "BYBIT");
  assert.equal(normalizeCoinGlassExchange("Gate.io"), "UNKNOWN");
});

test("mapCoinGlassInstrument accepts active USDT perpetual pairs", () => {
  const instrument = mapCoinGlassInstrument("Binance", {
    instrument_id: "ENAUSDT",
    base_asset: "ENA",
    quote_asset: "USDT",
    settlement_currency: "USDT",
    max_leverage: 50,
  }, updatedAt);

  assert.equal(instrument?.id, "BINANCE:ENAUSDT");
  assert.equal(instrument?.symbol, "ENAUSDT");
  assert.equal(instrument?.exchange, "BINANCE");
  assert.equal(instrument?.marketType, "perpetual");
  assert.equal(instrument?.isActive, true);
  assert.deepEqual(instrument?.tags, ["coinglass", "Binance", "lev:50"]);
});

test("mapCoinGlassInstrument rejects non-USDT and dated delivery contracts", () => {
  assert.equal(mapCoinGlassInstrument("Binance", {
    instrument_id: "BTCUSD_PERP",
    base_asset: "BTC",
    quote_asset: "USD",
  }, updatedAt), null);

  assert.equal(mapCoinGlassInstrument("Binance", {
    instrument_id: "BTCUSDT_250627",
    base_asset: "BTC",
    quote_asset: "USDT",
  }, updatedAt), null);
});

test("mapCoinGlass market instruments reject unknown venues and conflicting quote symbols", () => {
  assert.equal(mapCoinGlassMarketInstrument({
    instrument_id: "TIAUSDT",
    exchange_name: "Gate.io",
    symbol: "TIA/USDT",
    volume_usd: 120_000_000,
  }, updatedAt), null);

  assert.equal(mapCoinGlassMarketInstrument({
    instrument_id: "TIAUSDC",
    exchange_name: "Binance",
    symbol: "TIA/USDT",
    volume_usd: 120_000_000,
  }, updatedAt), null);

  assert.equal(mapCoinGlassMarketInstrument({
    instrument_id: "TIAUSDT",
    exchange_name: "Binance",
    symbol: "TIA/USD",
    volume_usd: 120_000_000,
  }, updatedAt), null);
});

test("mapCoinGlass market rows into ticker, derivative, and instrument records", () => {
  const row = {
    instrument_id: "SUIUSDT",
    exchange_name: "Binance",
    symbol: "SUI/USDT",
    current_price: 3.24,
    price_change_percent_24h: -1.8,
    volume_usd: 318_000_000,
    open_interest_usd: 120_000_000,
    open_interest_change_percent_24h: 7.1,
    funding_rate: 0.00024,
    long_liquidation_usd_24h: 1_100_000,
    short_liquidation_usd_24h: 800_000,
  };

  assert.deepEqual(mapCoinGlassTicker(row, updatedAt), {
    symbol: "SUIUSDT",
    exchange: "BINANCE",
    price: 3.24,
    changePercent24h: -1.8,
    volume24hUsd: 318_000_000,
    high24h: 3.24,
    low24h: 3.24,
    updatedAt,
  });

  assert.deepEqual(mapCoinGlassDerivativeSnapshot(row, updatedAt), {
    symbol: "SUIUSDT",
    exchange: "BINANCE",
    source: "coinglass",
    openInterestUsd: 120_000_000,
    openInterestChangePercent: 7.1,
    fundingRate: 0.00024,
    fundingRateZScore: 0.24,
    liquidationUsd24h: 1_900_000,
    updatedAt,
  });

  assert.equal(mapCoinGlassMarketInstrument(row, updatedAt)?.volume24hUsd, 318_000_000);
});

test("mapCoinGlassHeatCell does not treat liquidation amount as an anomaly-score input", () => {
  const quietRow = {
    instrument_id: "TIAUSDT",
    exchange_name: "Binance",
    symbol: "TIA/USDT",
    current_price: 7.2,
    price_change_percent_24h: 0.4,
    volume_usd: 80_000_000,
    open_interest_usd: 42_000_000,
    open_interest_change_percent_24h: 0.6,
    funding_rate: 0.0001,
    long_liquidation_usd_24h: 80_000_000,
    short_liquidation_usd_24h: 70_000_000,
  };

  const cell = mapCoinGlassHeatCell(quietRow);

  assert.equal(cell.symbol, "TIA");
  assert.ok(cell.anomalyScore < 45);
  assert.equal(cell.tone, "sleep");
});
