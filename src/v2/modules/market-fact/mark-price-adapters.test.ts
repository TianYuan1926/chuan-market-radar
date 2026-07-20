import assert from "node:assert/strict";
import test from "node:test";
import {
  BINANCE_MARK_PRICES,
  BYBIT_MARK_PRICES,
  EVENT_TIME_MS,
  OKX_MARK_PRICES,
  PRICE_SNAPSHOT_RECEIVED_AT,
} from "../../testing/m1-provider-fixtures";
import type {
  PublicJsonRequest,
  PublicJsonResult,
  PublicJsonTransport,
} from "../universe/public-json-transport";
import { fetchBinanceMarkPrices } from "./adapters/binance-mark-price";
import { fetchBybitMarkPrices } from "./adapters/bybit-mark-price";
import { fetchOkxMarkPrices } from "./adapters/okx-mark-price";

function transport(result: PublicJsonResult): PublicJsonTransport {
  return async () => result;
}

function recordingTransport(
  requests: PublicJsonRequest[],
  result: PublicJsonResult,
): PublicJsonTransport {
  return async (request) => {
    requests.push(request);
    return result;
  };
}

function success(data: unknown): PublicJsonResult {
  return {
    data,
    ok: true,
    receivedAt: PRICE_SNAPSHOT_RECEIVED_AT,
    status: 200,
  };
}

test("normalizes one positive timestamped MARK_PRICE snapshot per venue", async () => {
  const batches = await Promise.all([
    fetchBinanceMarkPrices(transport(success(BINANCE_MARK_PRICES))),
    fetchOkxMarkPrices(transport(success(OKX_MARK_PRICES))),
    fetchBybitMarkPrices(transport(success(BYBIT_MARK_PRICES))),
  ]);

  assert.deepEqual(
    batches.map((batch) => batch.observations[0]?.value),
    ["42000.00", "42001.00", "41999.50"],
  );
  assert.equal(
    batches.every(
      (batch) =>
        batch.ok &&
        batch.observations[0]?.eventTimeBasis === "MARK_PRICE_SNAPSHOT" &&
        batch.observations[0]?.factType === "MARK_PRICE" &&
        batch.observations[0]?.qualityStatus === "FRESH" &&
        batch.observations[0]?.sequence === EVENT_TIME_MS,
    ),
    true,
  );
});

test("requests only the exact public mark-price endpoints", async () => {
  const requests: PublicJsonRequest[] = [];
  await Promise.all([
    fetchBinanceMarkPrices(
      recordingTransport(requests, success(BINANCE_MARK_PRICES)),
    ),
    fetchOkxMarkPrices(
      recordingTransport(requests, success(OKX_MARK_PRICES)),
    ),
    fetchBybitMarkPrices(
      recordingTransport(requests, success(BYBIT_MARK_PRICES)),
    ),
  ]);

  assert.deepEqual(
    requests.sort((left, right) => left.allowedHost.localeCompare(
      right.allowedHost,
    )),
    [
      {
        allowedHost: "api.bybit.com",
        url: "https://api.bybit.com/v5/market/tickers?category=linear",
      },
      {
        allowedHost: "fapi.binance.com",
        url: "https://fapi.binance.com/fapi/v1/premiumIndex",
      },
      {
        allowedHost: "www.okx.com",
        url: "https://www.okx.com/api/v5/public/mark-price?instType=SWAP",
      },
    ],
  );
});

test("keeps zero, missing time and malformed rows invalid instead of filling defaults", async () => {
  const batch = await fetchBinanceMarkPrices(transport(success([
    { markPrice: "0", symbol: "BTCUSDT", time: EVENT_TIME_MS },
    { markPrice: "1", symbol: "ETHUSDT" },
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
  const drift = await fetchOkxMarkPrices(
    transport(success({ code: "0", data: {} })),
  );
  const rateLimited = await fetchBybitMarkPrices(transport({
    failure: { kind: "RATE_LIMITED", reasonCode: "provider_http_429" },
    ok: false,
    receivedAt: PRICE_SNAPSHOT_RECEIVED_AT,
    status: 429,
  }));

  assert.equal(drift.ok, false);
  assert.equal(drift.ok ? null : drift.failure.kind, "INVALID");
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
  assert.equal(rateLimited.observations.length, 0);
});

test("recognizes a Bybit body-level mark-price rate limit", async () => {
  const rateLimited = await fetchBybitMarkPrices(
    transport(success({ retCode: 10006, retMsg: "rate limit" })),
  );

  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
});

test("recognizes an OKX body-level mark-price rate limit", async () => {
  const rateLimited = await fetchOkxMarkPrices(
    transport(success({ code: "50011", data: [] })),
  );

  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
});
