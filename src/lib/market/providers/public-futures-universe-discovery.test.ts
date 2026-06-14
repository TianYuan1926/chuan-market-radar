import assert from "node:assert/strict";
import test from "node:test";

import { createPublicFuturesUniverseDiscoveryProvider } from "./public-futures-universe-discovery";
import type { UniverseDiscoveryProvider } from "./binance-universe-discovery";
import type { ContractInstrument } from "../types";

function instrument(exchange: ContractInstrument["exchange"], baseAsset: string): ContractInstrument {
  return {
    id: `${exchange}:${baseAsset}USDT`,
    symbol: `${baseAsset}USDT`,
    baseAsset,
    quoteAsset: "USDT",
    exchange,
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: [`${exchange.toLowerCase()}-test`],
    lastSeenAt: "2026-06-15T00:00:00.000Z",
  };
}

test("createPublicFuturesUniverseDiscoveryProvider aggregates successful exchange discoveries", async () => {
  const providers: UniverseDiscoveryProvider[] = [
    {
      id: "binance-test",
      label: "Binance Test",
      async discoverInstruments() {
        return {
          ok: true,
          source: "binance-test",
          instruments: [instrument("BINANCE", "ARB")],
        };
      },
    },
    {
      id: "okx-test",
      label: "OKX Test",
      async discoverInstruments() {
        return {
          ok: true,
          source: "okx-test",
          instruments: [instrument("OKX", "ARB"), instrument("OKX", "SUI")],
        };
      },
    },
    {
      id: "bybit-test",
      label: "Bybit Test",
      async discoverInstruments() {
        return {
          ok: false,
          source: "bybit-test",
          reason: "upstream_error",
          error: "rate limited",
          status: 429,
        };
      },
    },
  ];

  const result = await createPublicFuturesUniverseDiscoveryProvider({ providers }).discoverInstruments();

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.source : "", "public-futures-multi-exchange");
  assert.deepEqual(result.ok ? result.instruments.map((item) => item.id) : [], [
    "BINANCE:ARBUSDT",
    "OKX:ARBUSDT",
    "OKX:SUIUSDT",
  ]);
  assert.match(result.ok ? (result.notes ?? []).join("\n") : "", /binance-test ok 1 instruments/);
  assert.match(result.ok ? (result.notes ?? []).join("\n") : "", /okx-test ok 2 instruments/);
  assert.match(result.ok ? (result.notes ?? []).join("\n") : "", /bybit-test upstream_error/);
});

test("createPublicFuturesUniverseDiscoveryProvider fails only when every exchange discovery fails", async () => {
  const provider = createPublicFuturesUniverseDiscoveryProvider({
    providers: [
      {
        id: "okx-test",
        label: "OKX Test",
        async discoverInstruments() {
          return {
            ok: false,
            source: "okx-test",
            reason: "network_error",
            error: "fetch failed",
          };
        },
      },
    ],
  });

  const result = await provider.discoverInstruments();

  assert.deepEqual(result, {
    ok: false,
    source: "public-futures-multi-exchange",
    reason: "upstream_error",
    error: "All universe discovery providers failed: okx-test network_error",
    notes: ["okx-test network_error"],
    requestCount: 0,
  });
});
