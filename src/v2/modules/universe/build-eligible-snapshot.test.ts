import assert from "node:assert/strict";
import test from "node:test";
import {
  BINANCE_CATALOG,
  BYBIT_CATALOG,
  CATALOG_RECEIVED_AT,
  GENERATED_AT,
  OKX_CATALOG,
  SOURCE_CUTOFF,
} from "../../testing/m1-provider-fixtures";
import { InstrumentAccountingRecordSchema } from "../../runtime-schema/foundation-schemas";
import { fetchBinanceCatalog } from "./adapters/binance-catalog";
import { fetchBybitCatalog } from "./adapters/bybit-catalog";
import { fetchOkxCatalog } from "./adapters/okx-catalog";
import { buildEligibleInstrumentSnapshot } from "./build-eligible-snapshot";
import type { VenueCatalogResult } from "./catalog-types";
import { createInstrumentIdentity } from "./identity";
import type { PublicJsonTransport } from "./public-json-transport";

function transport(data: unknown): PublicJsonTransport {
  return async () => ({
    data,
    ok: true,
    receivedAt: CATALOG_RECEIVED_AT,
    status: 200,
  });
}

async function catalogs(): Promise<VenueCatalogResult[]> {
  return Promise.all([
    fetchBinanceCatalog(transport(BINANCE_CATALOG)),
    fetchOkxCatalog(transport(OKX_CATALOG)),
    fetchBybitCatalog(transport(BYBIT_CATALOG)),
  ]);
}

function build(catalogResults: readonly VenueCatalogResult[]) {
  return buildEligibleInstrumentSnapshot({
    catalogs: catalogResults,
    generatedAt: GENERATED_AT,
    policyVersion: "m1-linear-usdt-perpetual.v1",
    releaseId: "m1-test-release",
    sourceCutoff: SOURCE_CUTOFF,
  });
}

test("builds a deterministic, fully accounted three-venue universe", async () => {
  const catalogResults = await catalogs();
  const first = build(catalogResults);
  const second = build(catalogResults);

  assert.equal(first.observedCount, 3);
  assert.equal(first.eligibleCount, 3);
  assert.equal(first.quality.status, "FRESH");
  assert.equal(new Set(first.accounting.map((row) => row.observationId)).size, 3);
  assert.equal(
    new Set(first.accounting.map((row) => row.canonicalInstrumentId)).size,
    3,
  );
  assert.equal(
    new Set(first.accounting.map((row) => row.underlyingGroupId)).size,
    1,
  );
  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.accounting), true);
  assert.equal(Object.isFrozen(first.accounting[0]), true);
});

test("turns every duplicate canonical identity into unresolved accounting", async () => {
  const catalogResults = await catalogs();
  const binance = catalogResults[0]!;
  assert.equal(binance.ok, true);
  const duplicate = {
    ...binance.accounting[0]!,
    observationId: `${binance.accounting[0]!.observationId}:duplicate`,
  };
  const conflicted: VenueCatalogResult = {
    ...binance,
    accounting: [...binance.accounting, duplicate],
  };
  const snapshot = build([conflicted, catalogResults[1]!, catalogResults[2]!]);

  assert.equal(snapshot.observedCount, 4);
  assert.equal(snapshot.eligibleCount, 2);
  assert.equal(snapshot.quality.status, "PARTIAL");
  assert.equal(
    snapshot.accounting
      .filter((row) => row.venue === "BINANCE_FUTURES")
      .every(
        (row) =>
          row.status === "UNRESOLVED" &&
          row.canonicalInstrumentId === null &&
          row.statusReasons.includes("canonical_identity_conflict"),
      ),
    true,
  );
});

test("accepts unresolved rows in the denominator but rejects incomplete eligibility", () => {
  const unresolved = {
    observationId: "observation:unresolved",
    canonicalInstrumentId: null,
    underlyingGroupId: null,
    venue: "BINANCE_FUTURES",
    venueInstrumentId: null,
    baseAsset: null,
    quoteAsset: null,
    settlementAsset: null,
    contractType: null,
    contractSize: null,
    status: "UNRESOLVED",
    statusReasons: ["provider_row_schema_invalid"],
    observedAt: SOURCE_CUTOFF,
    eligible: false,
  } as const;

  assert.equal(InstrumentAccountingRecordSchema.safeParse(unresolved).success, true);
  assert.equal(
    InstrumentAccountingRecordSchema.safeParse({
      ...unresolved,
      status: "ELIGIBLE",
      statusReasons: [],
      eligible: true,
    }).success,
    false,
  );
});

test("canonical identity generation stays collision-free across a broad deterministic sample", () => {
  const ids = new Set<string>();
  for (let index = 0; index < 300; index += 1) {
    for (const venue of [
      "BINANCE_FUTURES",
      "OKX_SWAP",
      "BYBIT_LINEAR_PERPETUAL",
    ] as const) {
      const base = `ASSET${index}`;
      const identity = createInstrumentIdentity({
        baseAsset: base,
        contractSize: "1",
        quoteAsset: "USDT",
        settlementAsset: "USDT",
        venue,
        venueInstrumentId: `${base}${venue === "OKX_SWAP" ? "-USDT-SWAP" : "USDT"}`,
      });
      assert.ok(identity);
      assert.equal(ids.has(identity.canonicalInstrumentId), false);
      ids.add(identity.canonicalInstrumentId);
    }
  }
  assert.equal(ids.size, 900);
});
