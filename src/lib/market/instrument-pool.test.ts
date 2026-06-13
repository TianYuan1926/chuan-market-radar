import assert from "node:assert/strict";
import test from "node:test";
import { buildContractInstrumentPool } from "./instrument-pool";
import type { ContractInstrument } from "./types";

const seenAt = "2026-06-12T10:20:00+08:00";

function instrument(
  overrides: Partial<ContractInstrument> & Pick<ContractInstrument, "symbol" | "volume24hUsd">,
): ContractInstrument {
  const baseAsset = overrides.symbol.replace(/USDT|USDC|USD$/u, "");
  const { symbol, ...rest } = overrides;

  return {
    id: `BINANCE:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    tags: [],
    lastSeenAt: seenAt,
    ...rest,
  };
}

test("buildContractInstrumentPool accepts active USDT perpetuals above the liquidity floor", () => {
  const result = buildContractInstrumentPool(
    [
      instrument({ symbol: "ENAUSDT", volume24hUsd: 48_000_000 }),
      instrument({ symbol: "SUIUSDT", volume24hUsd: 118_000_000 }),
      instrument({ symbol: "THINUSDT", volume24hUsd: 900_000 }),
      instrument({ symbol: "BTCUSD", quoteAsset: "USD", volume24hUsd: 510_000_000 }),
      instrument({ symbol: "OLDUSDT", isActive: false, volume24hUsd: 42_000_000 }),
      instrument({ symbol: "DELIVERYUSDT", marketType: "delivery", volume24hUsd: 55_000_000 }),
    ],
    { minVolume24hUsd: 5_000_000 },
  );

  assert.deepEqual(
    result.instruments.map((item: ContractInstrument) => item.symbol),
    ["SUIUSDT", "ENAUSDT"],
  );
  assert.equal(result.summary.total, 6);
  assert.equal(result.summary.accepted, 2);
  assert.equal(result.summary.rejected, 4);
});

test("buildContractInstrumentPool records explicit rejection reasons", () => {
  const result = buildContractInstrumentPool(
    [
      instrument({ symbol: "THINUSDT", volume24hUsd: 900_000 }),
      instrument({ symbol: "BTCUSD", quoteAsset: "USD", volume24hUsd: 510_000_000 }),
      instrument({ symbol: "OLDUSDT", isActive: false, volume24hUsd: 42_000_000 }),
      instrument({ symbol: "DELIVERYUSDT", marketType: "delivery", volume24hUsd: 55_000_000 }),
    ],
    { minVolume24hUsd: 5_000_000 },
  );

  assert.deepEqual(
    result.rejected.map(
      (item: { instrument: ContractInstrument; reason: string }) =>
        `${item.instrument.symbol}:${item.reason}`,
    ),
    [
      "THINUSDT:volume_below_floor",
      "BTCUSD:quote_not_supported",
      "OLDUSDT:inactive",
      "DELIVERYUSDT:market_type_not_supported",
    ],
  );
});

test("buildContractInstrumentPool deduplicates exchange-symbol pairs by keeping higher volume", () => {
  const result = buildContractInstrumentPool(
    [
      instrument({ symbol: "ENAUSDT", volume24hUsd: 9_000_000 }),
      instrument({ symbol: "ENAUSDT", volume24hUsd: 48_000_000 }),
      instrument({ symbol: "SUIUSDT", volume24hUsd: 118_000_000 }),
    ],
    { minVolume24hUsd: 5_000_000 },
  );

  assert.deepEqual(
    result.instruments.map(
      (item: ContractInstrument) => `${item.symbol}:${item.volume24hUsd}`,
    ),
    ["SUIUSDT:118000000", "ENAUSDT:48000000"],
  );
  assert.equal(result.summary.duplicatesRemoved, 1);
});
