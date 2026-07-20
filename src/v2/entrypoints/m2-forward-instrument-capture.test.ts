import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
} from "../testing/forward-instrument-harness";
import {
  runM2ForwardInstrumentCaptureEntrypoint,
} from "./m2-forward-instrument-capture";

test("entrypoint emits a bounded truth summary for a complete capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-entrypoint-"));
  try {
    const state = syntheticForwardInstrumentState();
    const result = await runM2ForwardInstrumentCaptureEntrypoint({
      args: [
        "--evidence-root",
        join(root, "evidence"),
        "--repository-root",
        process.cwd(),
      ],
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: new MutableForwardInstrumentClock(
        "2026-07-20T21:00:00.000Z",
      ).now,
    });
    const output = JSON.parse(result.output) as Record<string, unknown>;
    assert.equal(result.exitCode, 0);
    assert.equal(output.batchStatus, "COMPLETE");
    assert.equal(output.historicalBackfillAllowed, false);
    assert.equal(output.historicalSourceGateResolved, false);
    assert.equal(output.candidateEmissionAllowed, false);
    assert.equal("rawEvidence" in output, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entrypoint returns a nonzero truth status for partial coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-entrypoint-partial-"));
  try {
    const state = syntheticForwardInstrumentState();
    state.failHosts.add("api.bybit.com");
    const result = await runM2ForwardInstrumentCaptureEntrypoint({
      args: [
        "--repository-root",
        process.cwd(),
        "--evidence-root",
        join(root, "evidence"),
      ],
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: new MutableForwardInstrumentClock(
        "2026-07-20T21:30:00.000Z",
      ).now,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(
      (JSON.parse(result.output) as { batchStatus: string }).batchStatus,
      "PARTIAL",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entrypoint rejects ambiguous or relative storage options", async () => {
  await assert.rejects(
    runM2ForwardInstrumentCaptureEntrypoint({
      args: ["--evidence-root", "relative", "--repository-root", process.cwd()],
    }),
    /paths must be absolute/u,
  );
  await assert.rejects(
    runM2ForwardInstrumentCaptureEntrypoint({ args: [] }),
    /usage/u,
  );
});
