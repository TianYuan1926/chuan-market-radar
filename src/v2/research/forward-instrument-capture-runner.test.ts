import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
} from "../testing/forward-instrument-harness";
import {
  runM2ForwardInstrumentCapture,
} from "./forward-instrument-capture-runner";

test("runs repeatable three-venue capture with a chained external journal", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-runner-chain-"));
  try {
    const state = syntheticForwardInstrumentState();
    state.bybitPages.push([{
      baseCoin: "DDD",
      contractType: "LinearPerpetual",
      quoteCoin: "USDT",
      settleCoin: "USDT",
      status: "Trading",
      symbol: "DDDUSDT",
    }]);
    const clock = new MutableForwardInstrumentClock("2026-07-20T18:00:00.000Z");
    const evidenceRoot = join(root, "evidence");
    const first = await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      repositoryRoot: process.cwd(),
    });
    assert.equal(first.batch.batchStatus, "COMPLETE");
    assert.equal(first.journalEntry.entrySequence, 0);
    assert.equal(first.journalEntry.previousEntryDigest, null);
    assert.ok(first.continuities.every((item) =>
      item.continuityStatus === "RESEARCH_ONLY"));
    assert.equal(
      first.snapshots.find((item) =>
        item.providerId === "BYBIT_LINEAR_PERPETUAL")?.rawEvidence.length,
      2,
    );

    clock.advance(5 * 60 * 1_000);
    const second = await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      repositoryRoot: process.cwd(),
    });
    assert.equal(second.journalEntry.entrySequence, 1);
    assert.equal(
      second.journalEntry.previousEntryDigest,
      first.journalEntry.journalEntryDigest,
    );
    assert.ok(second.continuities.every((item) =>
      item.continuityStatus === "FORWARD_ONLY_READY"));
    assert.ok(second.continuities.every((item) =>
      item.previousContinuityDigest !== null &&
      item.segmentSnapshots.length === 1 &&
      item.observedSnapshotCount === 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider outage is journaled as partial and cannot claim readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-runner-partial-"));
  try {
    const state = syntheticForwardInstrumentState();
    state.failHosts.add("www.okx.com");
    const clock = new MutableForwardInstrumentClock("2026-07-20T19:00:00.000Z");
    const result = await runM2ForwardInstrumentCapture({
      evidenceRoot: join(root, "evidence"),
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      repositoryRoot: process.cwd(),
    });
    assert.equal(result.batch.batchStatus, "PARTIAL");
    assert.equal(result.journalEntry.batchStatus, "PARTIAL");
    const okx = result.snapshots.find((item) => item.providerId === "OKX_SWAP");
    assert.equal(okx?.captureStatus, "FAILED");
    assert.equal(okx?.denominator.state, "UNAVAILABLE");
    assert.equal(result.journalEntry.historicalSourceGateResolved, false);
    assert.equal(result.journalEntry.candidateEmissionAllowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampered prior head artifact blocks the next capture before provider reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-runner-tamper-"));
  try {
    const state = syntheticForwardInstrumentState();
    const clock = new MutableForwardInstrumentClock("2026-07-20T20:00:00.000Z");
    const evidenceRoot = join(root, "evidence");
    const first = await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      repositoryRoot: process.cwd(),
    });
    await writeFile(
      join(evidenceRoot, first.batchArtifact.storageKey),
      `${JSON.stringify({ tampered: true })}\n`,
    );
    let providerCalled = false;
    await assert.rejects(
      runM2ForwardInstrumentCapture({
        evidenceRoot,
        fetchImplementation: (async () => {
          providerCalled = true;
          throw new Error("provider must not be called after head corruption");
        }) as typeof fetch,
        now: clock.now,
        repositoryRoot: process.cwd(),
      }),
      /failed content verification/u,
    );
    assert.equal(providerCalled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
