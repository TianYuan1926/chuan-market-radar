import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
  TEST_FORWARD_INSTRUMENT_RELEASE_ID,
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
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
    assert.equal(first.batch.batchStatus, "COMPLETE");
    assert.equal(first.journalEntry.entrySequence, 0);
    assert.equal(first.journalEntry.previousEntryDigest, null);
    assert.equal(
      first.journalEntry.releaseId,
      TEST_FORWARD_INSTRUMENT_RELEASE_ID,
    );
    assert.equal(
      first.batchArtifact.releaseId,
      TEST_FORWARD_INSTRUMENT_RELEASE_ID,
    );
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
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
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
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
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
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
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
        releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
        repositoryRoot: process.cwd(),
      }),
      /failed content verification/u,
    );
    assert.equal(providerCalled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a different release cannot append to an existing evidence chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-runner-release-"));
  try {
    const state = syntheticForwardInstrumentState();
    const clock = new MutableForwardInstrumentClock("2026-07-20T20:30:00.000Z");
    const evidenceRoot = join(root, "evidence");
    await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
    let providerCalled = false;
    await assert.rejects(
      runM2ForwardInstrumentCapture({
        evidenceRoot,
        fetchImplementation: (async () => {
          providerCalled = true;
          throw new Error("provider must not be called for a mixed release");
        }) as typeof fetch,
        now: clock.now,
        releaseId: "89abcdef0123456789abcdef0123456789abcdef",
        repositoryRoot: process.cwd(),
      }),
      /journal chain, release, or config is invalid/u,
    );
    assert.equal(providerCalled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampering with an older journal entry blocks the next provider read", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-runner-journal-tamper-"));
  try {
    const state = syntheticForwardInstrumentState();
    const clock = new MutableForwardInstrumentClock("2026-07-20T21:00:00.000Z");
    const evidenceRoot = join(root, "evidence");
    await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
    clock.advance(5 * 60 * 1_000);
    await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
    const journalPath = join(
      evidenceRoot,
      "journal",
      "forward-instrument-captures.v2.jsonl",
    );
    const records = (await readFile(journalPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    records[0] = { ...records[0], recordedAt: "2026-07-20T00:00:00.000Z" };
    await writeFile(
      journalPath,
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    let providerCalled = false;
    await assert.rejects(
      runM2ForwardInstrumentCapture({
        evidenceRoot,
        fetchImplementation: (async () => {
          providerCalled = true;
          throw new Error("provider must not be called after journal tampering");
        }) as typeof fetch,
        now: clock.now,
        releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
        repositoryRoot: process.cwd(),
      }),
      /journal entry digest mismatch/u,
    );
    assert.equal(providerCalled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
