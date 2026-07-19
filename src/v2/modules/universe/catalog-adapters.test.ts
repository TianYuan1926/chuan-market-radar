import assert from "node:assert/strict";
import test from "node:test";
import {
  BINANCE_CATALOG,
  BYBIT_CATALOG,
  CATALOG_RECEIVED_AT,
  OKX_CATALOG,
} from "../../testing/m1-provider-fixtures";
import { fetchBinanceCatalog } from "./adapters/binance-catalog";
import { fetchBybitCatalog } from "./adapters/bybit-catalog";
import { fetchOkxCatalog } from "./adapters/okx-catalog";
import type {
  PublicJsonResult,
  PublicJsonTransport,
} from "./public-json-transport";

function success(data: unknown, receivedAt = CATALOG_RECEIVED_AT): PublicJsonResult {
  return { data, ok: true, receivedAt, status: 200 };
}

function queuedTransport(
  responses: readonly PublicJsonResult[],
  urls: string[] = [],
): PublicJsonTransport {
  const queue = [...responses];
  return async (request) => {
    urls.push(request.url);
    const response = queue.shift();
    assert.ok(response, "test transport queue exhausted");
    return response;
  };
}

test("normalizes one eligible linear USDT perpetual from every target venue", async () => {
  const [binance, okx, bybit] = await Promise.all([
    fetchBinanceCatalog(queuedTransport([success(BINANCE_CATALOG)])),
    fetchOkxCatalog(queuedTransport([success(OKX_CATALOG)])),
    fetchBybitCatalog(queuedTransport([success(BYBIT_CATALOG)])),
  ]);

  for (const catalog of [binance, okx, bybit]) {
    assert.equal(catalog.ok, true);
    assert.equal(catalog.accounting.length, 1);
    assert.equal(catalog.accounting[0]?.status, "ELIGIBLE");
    assert.equal(catalog.accounting[0]?.eligible, true);
    assert.ok(catalog.accounting[0]?.canonicalInstrumentId);
  }
  assert.equal(okx.accounting[0]?.contractSize, "0.01");
});

test("accounts unsupported, suspended, delisting and malformed Binance rows", async () => {
  const normal = BINANCE_CATALOG.symbols[0]!;
  const catalog = await fetchBinanceCatalog(queuedTransport([success({
    symbols: [
      normal,
      { ...normal, contractType: "CURRENT_QUARTER", symbol: "BTCUSDT_260327" },
      { ...normal, status: "PENDING_TRADING", symbol: "ETHUSDT", baseAsset: "ETH" },
      { ...normal, status: "DELIVERING", symbol: "SOLUSDT", baseAsset: "SOL" },
      { ...normal, marginAsset: null, symbol: "XRPUSDT", baseAsset: "XRP" },
    ],
  })]));

  assert.equal(catalog.accounting.length, 5);
  assert.deepEqual(
    catalog.accounting.map((record) => record.status),
    ["ELIGIBLE", "UNSUPPORTED", "SUSPENDED", "DELISTING", "UNRESOLVED"],
  );
  assert.equal(catalog.accounting[4]?.canonicalInstrumentId, null);
});

test("requires Bybit pagination to terminate explicitly", async () => {
  const urls: string[] = [];
  const firstPage = {
    ...BYBIT_CATALOG,
    result: { ...BYBIT_CATALOG.result, nextPageCursor: "cursor-2" },
  };
  const secondPage = {
    ...BYBIT_CATALOG,
    result: {
      ...BYBIT_CATALOG.result,
      list: [{
        ...BYBIT_CATALOG.result.list[0],
        baseCoin: "ETH",
        symbol: "ETHUSDT",
      }],
      nextPageCursor: "",
    },
  };
  const catalog = await fetchBybitCatalog(
    queuedTransport([success(firstPage), success(secondPage)], urls),
  );

  assert.equal(catalog.ok, true);
  assert.equal(catalog.pageCount, 2);
  assert.equal(catalog.accounting.length, 2);
  assert.equal(new URL(urls[1]!).searchParams.get("cursor"), "cursor-2");
});

test("fails closed on repeated or truncated Bybit cursors", async () => {
  const repeating = {
    ...BYBIT_CATALOG,
    result: { ...BYBIT_CATALOG.result, nextPageCursor: "same-cursor" },
  };
  const repeated = await fetchBybitCatalog(
    queuedTransport([success(repeating), success(repeating)]),
  );
  const truncated = await fetchBybitCatalog(
    queuedTransport([success(repeating)]),
    { maxPages: 1 },
  );

  assert.equal(repeated.ok, false);
  assert.equal(
    repeated.ok ? null : repeated.failure.reasonCode,
    "bybit_pagination_cursor_repeated",
  );
  assert.equal(repeated.accounting.every((record) => !record.eligible), true);
  assert.equal(truncated.ok, false);
  assert.equal(
    truncated.ok ? null : truncated.failure.reasonCode,
    "bybit_pagination_truncated",
  );
});

test("deactivates already observed Bybit rows when a later page fails", async () => {
  const firstPage = {
    ...BYBIT_CATALOG,
    result: { ...BYBIT_CATALOG.result, nextPageCursor: "cursor-2" },
  };
  const partial = await fetchBybitCatalog(queuedTransport([
    success(firstPage),
    {
      failure: { kind: "TRANSPORT_ERROR", reasonCode: "provider_request_failed" },
      ok: false,
      receivedAt: CATALOG_RECEIVED_AT,
      status: null,
    },
  ]));

  assert.equal(partial.ok, false);
  assert.equal(partial.accounting.length, 1);
  assert.equal(partial.accounting[0]?.status, "UNAVAILABLE");
  assert.equal(partial.accounting[0]?.eligible, false);
  assert.ok(
    partial.accounting[0]?.statusReasons.includes("bybit_pagination_incomplete"),
  );
});

test("reports provider schema drift and rate limiting without inventing rows", async () => {
  const schemaDrift = await fetchBinanceCatalog(
    queuedTransport([success({ symbols: "not-an-array" })]),
  );
  const rateLimited = await fetchOkxCatalog(queuedTransport([{
    failure: { kind: "RATE_LIMITED", reasonCode: "provider_http_429" },
    ok: false,
    receivedAt: CATALOG_RECEIVED_AT,
    status: 429,
  }]));

  assert.equal(schemaDrift.ok, false);
  assert.equal(schemaDrift.accounting.length, 0);
  assert.equal(
    schemaDrift.ok ? null : schemaDrift.failure.reasonCode,
    "binance_catalog_schema_drift",
  );
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.ok ? null : rateLimited.failure.kind, "RATE_LIMITED");
});

test("recognizes a Bybit body-level rate limit even when result is absent", async () => {
  const catalog = await fetchBybitCatalog(
    queuedTransport([success({ retCode: 10006, retMsg: "rate limit" })]),
  );

  assert.equal(catalog.ok, false);
  assert.equal(catalog.ok ? null : catalog.failure.kind, "RATE_LIMITED");
  assert.equal(catalog.accounting.length, 0);
});

test("recognizes an OKX body-level catalog rate limit", async () => {
  const catalog = await fetchOkxCatalog(
    queuedTransport([success({ code: "50011", data: [] })]),
  );

  assert.equal(catalog.ok, false);
  assert.equal(catalog.ok ? null : catalog.failure.kind, "RATE_LIMITED");
});
