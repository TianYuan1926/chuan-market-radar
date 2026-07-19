import assert from "node:assert/strict";
import test from "node:test";
import {
  BINANCE_CATALOG,
  BINANCE_TICKERS,
  BYBIT_CATALOG,
  BYBIT_TICKERS,
  CATALOG_RECEIVED_AT,
  EVENT_TIME_MS,
  GENERATED_AT,
  NORMALIZED_AT,
  OKX_CATALOG,
  OKX_TICKERS,
  SOURCE_CUTOFF,
  TICKER_RECEIVED_AT,
} from "../../testing/m1-provider-fixtures";
import type { EligibleInstrumentSnapshot } from "../../domain/contracts";
import type { TargetVenue } from "../../domain/product-constitution";
import { fetchBinanceCatalog } from "../universe/adapters/binance-catalog";
import { fetchBybitCatalog } from "../universe/adapters/bybit-catalog";
import { fetchOkxCatalog } from "../universe/adapters/okx-catalog";
import { buildEligibleInstrumentSnapshot } from "../universe/build-eligible-snapshot";
import type { PublicJsonTransport } from "../universe/public-json-transport";
import { fetchBinanceTickers } from "./adapters/binance-ticker";
import { fetchBybitTickers } from "./adapters/bybit-ticker";
import { fetchOkxTickers } from "./adapters/okx-ticker";
import { buildLastPriceFacts } from "./build-last-price-facts";
import type { VenueTickerResult } from "./ticker-types";

function transport(
  data: unknown,
  receivedAt: string,
): PublicJsonTransport {
  return async () => ({ data, ok: true, receivedAt, status: 200 });
}

async function universe(): Promise<EligibleInstrumentSnapshot> {
  const catalogs = await Promise.all([
    fetchBinanceCatalog(transport(BINANCE_CATALOG, CATALOG_RECEIVED_AT)),
    fetchOkxCatalog(transport(OKX_CATALOG, CATALOG_RECEIVED_AT)),
    fetchBybitCatalog(transport(BYBIT_CATALOG, CATALOG_RECEIVED_AT)),
  ]);
  return buildEligibleInstrumentSnapshot({
    catalogs,
    generatedAt: GENERATED_AT,
    policyVersion: "m1-linear-usdt-perpetual.v1",
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
  });
}

async function validBatches(input: {
  binance?: unknown;
  bybit?: unknown;
  okx?: unknown;
  receivedAt?: string;
} = {}): Promise<VenueTickerResult[]> {
  const receivedAt = input.receivedAt ?? TICKER_RECEIVED_AT;
  return Promise.all([
    fetchBinanceTickers(transport(input.binance ?? BINANCE_TICKERS, receivedAt)),
    fetchOkxTickers(transport(input.okx ?? OKX_TICKERS, receivedAt)),
    fetchBybitTickers(transport(input.bybit ?? BYBIT_TICKERS, receivedAt)),
  ]);
}

async function build(input: {
  batches?: readonly VenueTickerResult[];
  generatedAt?: string;
  maxAgeMs?: number;
  normalizedAt?: string;
  previousSequences?: Readonly<Record<string, string>>;
  sourceCutoff?: string;
} = {}) {
  return buildLastPriceFacts({
    batches: input.batches ?? await validBatches(),
    generatedAt: input.generatedAt ?? GENERATED_AT,
    maxAgeMs: input.maxAgeMs,
    normalizedAt: input.normalizedAt ?? NORMALIZED_AT,
    previousSequences: input.previousSequences,
    releaseId: "m1-test-release",
    sourceCutoff: input.sourceCutoff ?? SOURCE_CUTOFF,
    universe: await universe(),
  });
}

function failureBatch(
  venue: TargetVenue,
  kind: "RATE_LIMITED" | "TRANSPORT_ERROR" = "TRANSPORT_ERROR",
): VenueTickerResult {
  return {
    failure: {
      kind,
      reasonCode: kind === "RATE_LIMITED"
        ? "provider_http_429"
        : "provider_request_failed",
    },
    issues: [kind === "RATE_LIMITED" ? "provider_http_429" : "provider_request_failed"],
    observations: [],
    ok: false,
    receivedAt: TICKER_RECEIVED_AT,
    venue,
  };
}

test("builds deterministic immutable-value facts without claiming persistence", async () => {
  const batches = await validBatches();
  const first = await build({ batches });
  const second = await build({ batches });

  assert.equal(first.facts.length, 3);
  assert.equal(first.qualitySnapshot.completenessRatio, 1);
  assert.equal(first.qualitySnapshot.quality.status, "FRESH");
  assert.equal(first.facts.every((fact) => fact.value !== null), true);
  assert.equal(
    first.facts.every((fact) => fact.lineage.persistedAt === null),
    true,
  );
  assert.deepEqual(
    first.facts.map((fact) => [fact.factId, fact.contentHash]),
    second.facts.map((fact) => [fact.factId, fact.contentHash]),
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.facts), true);
  assert.equal(Object.isFrozen(first.facts[0]?.lineage), true);
  assert.equal(Object.isFrozen(first.qualitySnapshot), true);
});

test("turns provider failure into explicit null facts rather than zero or stale fallback", async () => {
  const batches = await validBatches();
  batches[0] = failureBatch("BINANCE_FUTURES");
  const result = await build({ batches });
  const binance = result.facts.find(
    (fact) => fact.canonicalInstrumentId.startsWith("BINANCE_FUTURES:"),
  )!;

  assert.equal(binance.value, null);
  assert.equal(binance.lineage.eventTime, null);
  assert.equal(binance.quality.status, "TRANSPORT_ERROR");
  assert.equal(result.qualitySnapshot.quality.status, "PARTIAL");
  assert.equal(result.qualitySnapshot.completenessRatio, 2 / 3);
});

test("rejects duplicate, out-of-order and duplicate-provider observations", async () => {
  const targetUniverse = await universe();
  const binanceId = targetUniverse.accounting.find(
    (record) => record.venue === "BINANCE_FUTURES",
  )!.canonicalInstrumentId!;

  const duplicate = await build({
    previousSequences: { [binanceId]: EVENT_TIME_MS },
  });
  const olderTime = String(BigInt(EVENT_TIME_MS) - BigInt(1_000));
  const outOfOrder = await build({
    batches: await validBatches({
      binance: [{ price: "42000", symbol: "BTCUSDT", time: olderTime }],
    }),
    previousSequences: { [binanceId]: EVENT_TIME_MS },
  });
  const duplicatedRows = await build({
    batches: await validBatches({
      binance: [BINANCE_TICKERS[0], BINANCE_TICKERS[0]],
    }),
  });

  assert.equal(duplicate.facts[0]?.value, null);
  assert.ok(duplicate.facts[0]?.quality.reasonCodes.includes("duplicate_ticker_sequence"));
  assert.equal(outOfOrder.facts[0]?.value, null);
  assert.ok(
    outOfOrder.facts[0]?.quality.reasonCodes.includes(
      "out_of_order_ticker_sequence",
    ),
  );
  assert.equal(duplicatedRows.facts[0]?.value, null);
  assert.equal(duplicatedRows.qualitySnapshot.duplicateRate, 1 / 3);
});

test("marks large sequence gaps partial and old events stale while retaining provenance", async () => {
  const targetUniverse = await universe();
  const binanceId = targetUniverse.accounting.find(
    (record) => record.venue === "BINANCE_FUTURES",
  )!.canonicalInstrumentId!;
  const oldSequence = String(BigInt(EVENT_TIME_MS) - BigInt(120_000));
  const gap = await build({ previousSequences: { [binanceId]: oldSequence } });
  const stale = await build({
    generatedAt: "2026-01-15T00:00:10.300Z",
    maxAgeMs: 5_000,
    normalizedAt: "2026-01-15T00:00:10.200Z",
    sourceCutoff: "2026-01-15T00:00:10.000Z",
  });

  assert.equal(gap.facts[0]?.quality.status, "PARTIAL");
  assert.equal(gap.facts[0]?.value, "42000.00");
  assert.equal(gap.qualitySnapshot.gapRate, 1 / 3);
  assert.equal(stale.facts.every((fact) => fact.quality.status === "STALE"), true);
  assert.equal(stale.qualitySnapshot.lateEventRate, 1);
});

test("recovers to fresh only after a genuinely newer successful provider batch", async () => {
  const targetUniverse = await universe();
  const previousSequences = Object.fromEntries(
    targetUniverse.accounting
      .filter((record) => record.canonicalInstrumentId !== null)
      .map((record) => [
        record.canonicalInstrumentId!,
        String(BigInt(EVENT_TIME_MS) - BigInt(1_000)),
      ]),
  );
  const failedBatches = [
    failureBatch("BINANCE_FUTURES"),
    failureBatch("OKX_SWAP"),
    failureBatch("BYBIT_LINEAR_PERPETUAL"),
  ];
  const failed = await build({ batches: failedBatches, previousSequences });
  const recovered = await build({
    batches: await validBatches(),
    previousSequences: failed.nextSequences,
  });

  assert.equal(failed.qualitySnapshot.quality.status, "TRANSPORT_ERROR");
  assert.equal(failed.qualitySnapshot.completenessRatio, 0);
  assert.equal(recovered.qualitySnapshot.quality.status, "FRESH");
  assert.equal(recovered.qualitySnapshot.completenessRatio, 1);
});

test("blocks provider events that occur after the declared point-in-time cutoff", async () => {
  const futureMs = String(BigInt(EVENT_TIME_MS) + BigInt(1_000));
  const result = await build({
    batches: await validBatches({
      binance: [{ price: "42000", symbol: "BTCUSDT", time: futureMs }],
      receivedAt: "2026-01-15T00:00:02.000Z",
    }),
    generatedAt: "2026-01-15T00:00:02.200Z",
    normalizedAt: "2026-01-15T00:00:02.100Z",
  });

  assert.equal(result.facts[0]?.value, null);
  assert.equal(result.facts[0]?.lineage.eventTime, null);
  assert.ok(
    result.facts[0]?.quality.reasonCodes.includes(
      "ticker_event_after_source_cutoff",
    ),
  );
});
