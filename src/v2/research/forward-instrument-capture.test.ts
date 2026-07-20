import assert from "node:assert/strict";
import test from "node:test";
import {
  captureThreeVenueForwardCatalogs,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
  TEST_FORWARD_INSTRUMENT_PROVENANCE,
} from "../testing/forward-instrument-harness";
import {
  buildM2ForwardInstrumentBatch,
  buildM2ForwardInstrumentRawEvidence,
  buildM2ForwardInstrumentSnapshot,
  M2ForwardInstrumentSnapshotSchema,
} from "./forward-instrument-capture";

async function capturedAttempts() {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T10:00:00.000Z");
  const attempts = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  return { attempts, clock, state };
}

test("builds a complete three-venue forward-only batch from exact raw pages", async () => {
  const { attempts, clock } = await capturedAttempts();
  const snapshots = attempts.map((attempt) =>
    buildM2ForwardInstrumentSnapshot({
      attempt,
      generatedAt: clock.now().toISOString(),
      provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
      rawEvidence: attempt.pages.map((page) =>
        buildM2ForwardInstrumentRawEvidence(
          page,
          TEST_FORWARD_INSTRUMENT_PROVENANCE,
        )),
    }));
  const batch = buildM2ForwardInstrumentBatch({
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    snapshots,
  });

  assert.equal(batch.batchStatus, "COMPLETE");
  assert.equal(batch.historicalBackfillAllowed, false);
  assert.equal(batch.historicalSourceGateResolved, false);
  assert.equal(batch.bulkHistoricalAcquisitionAllowed, false);
  assert.equal(batch.candidateEmissionAllowed, false);
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.denominator.state),
    ["COMPLETE", "COMPLETE", "COMPLETE"],
  );
  assert.ok(snapshots.every((snapshot) =>
    snapshot.rawEvidence.length === snapshot.catalogPageCount));
});

test("retains unresolved rows in a complete denominator without inventing identity", async () => {
  const state = syntheticForwardInstrumentState();
  state.binanceRows = [{}];
  const clock = new MutableForwardInstrumentClock("2026-07-20T10:30:00.000Z");
  const [attempt] = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  assert.ok(attempt);
  const snapshot = buildM2ForwardInstrumentSnapshot({
    attempt,
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    rawEvidence: attempt.pages.map((page) =>
      buildM2ForwardInstrumentRawEvidence(
        page,
        TEST_FORWARD_INSTRUMENT_PROVENANCE,
      )),
  });

  assert.equal(snapshot.captureStatus, "COMPLETE");
  assert.equal(snapshot.denominator.providerRowCount, 1);
  assert.equal(snapshot.denominator.allProviderRowsAccounted, true);
  assert.equal(snapshot.accounting[0]?.identityFingerprint, null);
  assert.ok(snapshot.declaredLimitations.includes(
    "unresolved_identity_rows_retained_in_denominator",
  ));
});

test("retains provider-native out-of-scope rows without blocking identity truth", async () => {
  const state = syntheticForwardInstrumentState();
  state.binanceRows = [{
    baseAsset: "AAA",
    contractType: "CURRENT_QUARTER",
    marginAsset: "USDT",
    quoteAsset: "USDT",
    status: "TRADING",
    symbol: "AAAUSDT_260925",
  }];
  const clock = new MutableForwardInstrumentClock("2026-07-20T10:45:00.000Z");
  const [attempt] = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  assert.ok(attempt);
  const snapshot = buildM2ForwardInstrumentSnapshot({
    attempt,
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    rawEvidence: attempt.pages.map((page) =>
      buildM2ForwardInstrumentRawEvidence(
        page,
        TEST_FORWARD_INSTRUMENT_PROVENANCE,
      )),
  });

  assert.equal(snapshot.denominator.providerRowCount, 1);
  assert.equal(snapshot.accounting[0]?.accounting.status, "UNSUPPORTED");
  assert.equal(
    snapshot.accounting[0]?.identityEvidenceClass,
    "PROVIDER_NATIVE_OUT_OF_SCOPE",
  );
  assert.notEqual(snapshot.accounting[0]?.identityFingerprint, null);
  assert.equal(snapshot.declaredLimitations.includes(
    "unresolved_identity_rows_retained_in_denominator",
  ), false);
});

test("preserves a Unicode provider identity as an eligible target contract", async () => {
  const state = syntheticForwardInstrumentState();
  const baseAsset = "\u4e2d\u6587";
  state.binanceRows = [{
    baseAsset,
    contractType: "PERPETUAL",
    marginAsset: "USDT",
    quoteAsset: "USDT",
    status: "TRADING",
    symbol: `${baseAsset}USDT`,
  }];
  const clock = new MutableForwardInstrumentClock("2026-07-20T10:50:00.000Z");
  const [attempt] = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  assert.ok(attempt);
  const snapshot = buildM2ForwardInstrumentSnapshot({
    attempt,
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    rawEvidence: attempt.pages.map((page) =>
      buildM2ForwardInstrumentRawEvidence(
        page,
        TEST_FORWARD_INSTRUMENT_PROVENANCE,
      )),
  });

  assert.equal(snapshot.accounting[0]?.accounting.status, "ELIGIBLE");
  assert.equal(
    snapshot.accounting[0]?.identityEvidenceClass,
    "CANONICAL_TARGET",
  );
  assert.equal(snapshot.accounting[0]?.accounting.baseAsset, baseAsset);
  assert.notEqual(snapshot.accounting[0]?.identityFingerprint, null);
});

test("a failed provider request cannot become a complete snapshot or batch", async () => {
  const state = syntheticForwardInstrumentState();
  state.failHosts.add("www.okx.com");
  const clock = new MutableForwardInstrumentClock("2026-07-20T11:00:00.000Z");
  const attempts = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  const snapshots = attempts.map((attempt) =>
    buildM2ForwardInstrumentSnapshot({
      attempt,
      generatedAt: clock.now().toISOString(),
      provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
      rawEvidence: attempt.pages.map((page) =>
        buildM2ForwardInstrumentRawEvidence(
          page,
          TEST_FORWARD_INSTRUMENT_PROVENANCE,
        )),
    }));
  const failed = snapshots.find((snapshot) => snapshot.providerId === "OKX_SWAP");
  assert.equal(failed?.captureStatus, "FAILED");
  assert.equal(failed?.denominator.state, "UNAVAILABLE");
  assert.equal(failed?.rawEvidence.length, 0);
  const batch = buildM2ForwardInstrumentBatch({
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    snapshots,
  });
  assert.equal(batch.batchStatus, "PARTIAL");
});

test("captures every Bybit pagination page and rejects raw-byte substitution", async () => {
  const state = syntheticForwardInstrumentState();
  state.bybitPages.push([{
    baseCoin: "DDD",
    contractType: "LinearPerpetual",
    quoteCoin: "USDT",
    settleCoin: "USDT",
    status: "Trading",
    symbol: "DDDUSDT",
  }]);
  const clock = new MutableForwardInstrumentClock("2026-07-20T11:30:00.000Z");
  const attempts = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  const bybit = attempts.find(
    (attempt) => attempt.providerId === "BYBIT_LINEAR_PERPETUAL",
  );
  assert.ok(bybit);
  assert.equal(bybit.pages.length, 2);
  assert.equal(bybit.catalog.pageCount, 2);
  assert.equal(bybit.catalog.accounting.length, 2);

  const altered = Uint8Array.from(bybit.pages[0]!.rawBody);
  altered[0] = altered[0] === 123 ? 91 : 123;
  assert.throws(
    () => buildM2ForwardInstrumentRawEvidence({
      ...bybit.pages[0]!,
      rawBody: altered,
    }, TEST_FORWARD_INSTRUMENT_PROVENANCE),
    /do not match transport evidence/u,
  );
});

test("snapshot schema rejects any attempt to claim pre-capture history", async () => {
  const { attempts, clock } = await capturedAttempts();
  const attempt = attempts[0]!;
  const snapshot = buildM2ForwardInstrumentSnapshot({
    attempt,
    generatedAt: clock.now().toISOString(),
    provenance: TEST_FORWARD_INSTRUMENT_PROVENANCE,
    rawEvidence: attempt.pages.map((page) =>
      buildM2ForwardInstrumentRawEvidence(
        page,
        TEST_FORWARD_INSTRUMENT_PROVENANCE,
      )),
  });
  assert.equal(M2ForwardInstrumentSnapshotSchema.safeParse({
    ...snapshot,
    historicalBackfillAllowed: true,
  }).success, false);
});
