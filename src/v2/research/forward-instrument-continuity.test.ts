import assert from "node:assert/strict";
import test from "node:test";
import {
  captureThreeVenueForwardCatalogs,
} from "../modules/universe/adapters/forward-catalog-capture-adapter";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
  type SyntheticForwardInstrumentState,
} from "../testing/forward-instrument-harness";
import {
  buildM2ForwardInstrumentRawEvidence,
  buildM2ForwardInstrumentSnapshot,
  type M2ForwardInstrumentSnapshot,
} from "./forward-instrument-capture";
import {
  buildM2ForwardInstrumentContinuity,
  type M2ForwardInstrumentContinuity,
} from "./forward-instrument-continuity";

async function captureBinanceSnapshot(
  state: SyntheticForwardInstrumentState,
  clock: MutableForwardInstrumentClock,
): Promise<M2ForwardInstrumentSnapshot> {
  const attempts = await captureThreeVenueForwardCatalogs({
    fetchImplementation: syntheticForwardInstrumentFetch(state),
    now: clock.now,
  });
  const attempt = attempts.find(
    (candidate) => candidate.providerId === "BINANCE_USDS_FUTURES",
  );
  assert.ok(attempt);
  return buildM2ForwardInstrumentSnapshot({
    attempt,
    generatedAt: clock.now().toISOString(),
    rawEvidence: attempt.pages.map(buildM2ForwardInstrumentRawEvidence),
  });
}

function checkpoint(
  snapshot: M2ForwardInstrumentSnapshot,
  clock: MutableForwardInstrumentClock,
  previous?: M2ForwardInstrumentContinuity,
): M2ForwardInstrumentContinuity {
  return buildM2ForwardInstrumentContinuity({
    generatedAt: clock.now().toISOString(),
    previous,
    snapshots: [snapshot],
  });
}

test("requires measured repeated snapshots before forward-only readiness", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T12:00:00.000Z");
  const first = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  assert.equal(first.continuityStatus, "RESEARCH_ONLY");
  assert.equal(first.observedSnapshotCount, 1);
  assert.equal(first.historicalBackfillAllowed, false);
  assert.equal(first.historicalSourceGateResolved, false);

  clock.advance(5 * 60 * 1_000);
  const second = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    first,
  );
  assert.equal(second.continuityStatus, "FORWARD_ONLY_READY");
  assert.equal(second.previousContinuityDigest, first.continuityDigest);
  assert.equal(second.observedSnapshotCount, 2);
  assert.equal(second.completeSnapshotCount, 2);
  assert.equal(second.segmentSnapshots.length, 1);
  assert.equal(second.gapCount, 0);
});

test("a failed snapshot records a gap and never increments absence", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T13:00:00.000Z");
  const first = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  clock.advance(5 * 60 * 1_000);
  state.failHosts.add("fapi.binance.com");
  const failed = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    first,
  );
  const record = failed.instruments.find(
    (item) => item.venueInstrumentId === "AAAUSDT",
  );
  assert.equal(failed.gapCount, 1);
  assert.equal(failed.activeCoverageGapCount, 1);
  assert.equal(failed.segmentGaps[0]?.gapKind, "FAILED_SNAPSHOT");
  assert.equal(record?.currentState, "PRESENT");
  assert.equal(record?.consecutiveCompleteMisses, 0);
  assert.equal(record?.lastCompleteSnapshotAt, first.lastCompleteSnapshotAt);
});

test("pre-capture failures remain audited but do not poison a later valid segment", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T13:30:00.000Z");
  state.failHosts.add("fapi.binance.com");
  const failed = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  assert.equal(failed.captureStartedAt, null);
  assert.equal(failed.preCaptureIncompleteSnapshotCount, 1);
  assert.equal(failed.activeCoverageGapCount, 0);

  state.failHosts.delete("fapi.binance.com");
  clock.advance(20 * 60 * 1_000);
  const recovered = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    failed,
  );
  assert.notEqual(recovered.captureStartedAt, null);
  assert.equal(recovered.activeCoverageGapCount, 0);
  assert.ok(recovered.gapCount > 0);

  clock.advance(5 * 60 * 1_000);
  const ready = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    recovered,
  );
  assert.equal(ready.continuityStatus, "FORWARD_ONLY_READY");
  assert.equal(ready.preCaptureIncompleteSnapshotCount, 1);
});

test("three complete misses confirm only catalog presence loss, never delisting", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T14:00:00.000Z");
  let continuity = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  state.binanceRows = [];
  for (let index = 0; index < 3; index += 1) {
    clock.advance(5 * 60 * 1_000);
    continuity = checkpoint(
      await captureBinanceSnapshot(state, clock),
      clock,
      continuity,
    );
  }
  const record = continuity.instruments.find(
    (item) => item.venueInstrumentId === "AAAUSDT",
  );
  assert.equal(record?.currentState, "MISSING_CONFIRMED");
  assert.equal(record?.consecutiveCompleteMisses, 3);
  assert.equal(record?.delistingInferredFromAbsence, false);
  assert.equal(JSON.stringify(continuity).includes('"DELISTED"'), false);
});

test("a provider symbol identity change becomes a blocking conflict", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T15:00:00.000Z");
  const first = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  state.binanceRows[0] = {
    ...state.binanceRows[0],
    baseAsset: "ZZZ",
  };
  clock.advance(5 * 60 * 1_000);
  const second = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    first,
  );
  const record = second.instruments.find(
    (item) => item.venueInstrumentId === "AAAUSDT",
  );
  assert.equal(record?.currentState, "IDENTITY_CONFLICT");
  assert.equal(record?.identityEpochs.length, 2);
  assert.equal(second.continuityStatus, "RESEARCH_ONLY");
  assert.ok(second.blockerReasonCodes.includes(
    "forward_continuity_contains_identity_conflict",
  ));
});

test("an incomplete identity observation cannot silently reuse the last identity", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T15:30:00.000Z");
  const first = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  state.binanceRows[0] = {
    ...state.binanceRows[0],
    baseAsset: "BAD-ASSET",
  };
  clock.advance(5 * 60 * 1_000);
  const second = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    first,
  );
  const record = second.instruments.find(
    (item) => item.venueInstrumentId === "AAAUSDT",
  );
  assert.equal(record?.currentState, "IDENTITY_EVIDENCE_GAP");
  assert.equal(record?.identityEpochs.length, 1);
  assert.equal(second.continuityStatus, "RESEARCH_ONLY");
  assert.ok(second.blockerReasonCodes.includes(
    "forward_continuity_contains_unresolved_identity",
  ));
});

test("a cadence breach remains visible across compact chained checkpoints", async () => {
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock("2026-07-20T16:00:00.000Z");
  const first = checkpoint(await captureBinanceSnapshot(state, clock), clock);
  clock.advance(16 * 60 * 1_000);
  const second = checkpoint(
    await captureBinanceSnapshot(state, clock),
    clock,
    first,
  );
  assert.equal(second.segmentSnapshots.length, 1);
  assert.equal(second.segmentGaps[0]?.gapKind, "CADENCE_GAP");
  assert.equal(second.gapCount, 1);
  assert.equal(second.continuityStatus, "RESEARCH_ONLY");
});
