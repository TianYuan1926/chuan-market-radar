import assert from "node:assert/strict";
import test from "node:test";
import {
  BINANCE_TICKERS,
  BYBIT_TICKERS,
  EVENT_TIME_MS,
  OKX_TICKERS,
  TICKER_RECEIVED_AT,
} from "../../testing/m1-provider-fixtures";
import type {
  PublicJsonResult,
  PublicJsonTransport,
} from "../universe/public-json-transport";
import { fetchBinanceTickers } from "./adapters/binance-ticker";
import { fetchBybitTickers } from "./adapters/bybit-ticker";
import { fetchOkxTickers } from "./adapters/okx-ticker";

function transport(result: PublicJsonResult): PublicJsonTransport {
  return async () => result;
}

function success(data: unknown): PublicJsonResult {
  return { data, ok: true, receivedAt: TICKER_RECEIVED_AT, status: 200 };
}

test("normalizes one positive timestamped LAST_PRICE observation per venue", async () => {
  const batches = await Promise.all([
    fetchBinanceTickers(transport(success(BINANCE_TICKERS))),
    fetchOkxTickers(transport(success(OKX_TICKERS))),
    fetchBybitTickers(transport(success(BYBIT_TICKERS))),
  ]);

  assert.deepEqual(
    batches.map((batch) => batch.observations[0]?.value),
    ["42000.00", "42001.00", "41999.50"],
  );
  assert.equal(
    batches.every(
      (batch) =>
        batch.ok &&
        batch.observations[0]?.qualityStatus === "FRESH" &&
        batch.observations[0]?.sequence === EVENT_TIME_MS,
    ),
    true,
  );
});

test("keeps zero, missing time and malformed rows invalid instead of filling defaults", async () => {
  const batch = await fetchBinanceTickers(transport(success([
    { price: "0", symbol: "BTCUSDT", time: EVENT_TIME_MS },
    { price: "1", symbol: "ETHUSDT" },
    "not-an-object",
  ])));

  assert.equal(batch.ok, true);
  assert.equal(
    batch.observations.every(
      (observation) => observation.qualityStatus === "INVALID",
    ),
    true,
  );
  assert.equal(batch.observations[0]?.value, null);
  assert.equal(batch.observations[1]?.eventTime, null);
  assert.equal(batch.observations[2]?.venueInstrumentId, null);
});

test("fails the entire provider batch on outer schema drift or 429", async () => {
  const drift = await fetchOkxTickers(transport(success({ code: "0", data: {} })));
  const rateLimited = await fetchBybitTickers(transport({
    failure: { kind: "RATE_LIMITED", reasonCode: "provider_http_429" },
    ok: false,
    receivedAt: TICKER_RECEIVED_AT,
    status: 429,
  }));

  assert.equal(drift.ok, false);
  assert.equal(drift.ok ? null : drift.failure.kind, "INVALID");
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
  assert.equal(rateLimited.observations.length, 0);
});

test("recognizes a Bybit body-level ticker rate limit", async () => {
  const rateLimited = await fetchBybitTickers(
    transport(success({ retCode: 10006, retMsg: "rate limit" })),
  );

  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
});

test("recognizes an OKX body-level ticker rate limit", async () => {
  const rateLimited = await fetchOkxTickers(
    transport(success({ code: "50011", data: [] })),
  );

  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
});
