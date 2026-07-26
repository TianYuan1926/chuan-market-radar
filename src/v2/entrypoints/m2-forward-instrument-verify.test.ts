import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
} from "../research/forward-instrument-capture-runner";
import {
  runM2ForwardInstrumentVerifyEntrypoint,
} from "./m2-forward-instrument-verify";

const VERIFIER_RELEASE_ID = "89abcdef0123456789abcdef0123456789abcdef";

async function captureCycles(input: Readonly<{
  count: 1 | 2;
  root: string;
}>): Promise<string> {
  const evidenceRoot = join(input.root, "evidence");
  const clock = new MutableForwardInstrumentClock(
    "2026-07-20T22:00:00.000Z",
  );
  const state = syntheticForwardInstrumentState();
  for (let index = 0; index < input.count; index += 1) {
    if (index > 0) {
      clock.advance(5 * 60 * 1_000);
    }
    await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: clock.now,
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
  }
  return evidenceRoot;
}

function args(evidenceRoot: string): readonly string[] {
  return [
    "--evidence-root",
    evidenceRoot,
    "--repository-root",
    process.cwd(),
    "--expected-evidence-release-id",
    TEST_FORWARD_INSTRUMENT_RELEASE_ID,
  ];
}

test("emits a bounded release-bound audit for a ready evidence chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-verify-entrypoint-"));
  try {
    const evidenceRoot = await captureCycles({ count: 2, root });
    let verifiedCommit: string | null = null;
    const result = await runM2ForwardInstrumentVerifyEntrypoint({
      args: args(evidenceRoot),
      requireRepositoryCommit: (_repositoryRoot, releaseId) => {
        verifiedCommit = releaseId;
      },
      resolveRepositoryRelease: () => VERIFIER_RELEASE_ID,
    });
    const output = JSON.parse(result.output) as Record<string, unknown>;
    assert.equal(result.exitCode, 0);
    assert.equal(
      output.status,
      "PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT",
    );
    assert.equal(
      output.evidenceReleaseId,
      TEST_FORWARD_INSTRUMENT_RELEASE_ID,
    );
    assert.equal(output.verifierReleaseId, VERIFIER_RELEASE_ID);
    assert.equal(output.sameReleaseVerifier, false);
    assert.equal(output.operationalForwardOnlyReady, true);
    assert.equal(output.historicalSourceGateResolved, false);
    assert.equal(output.candidateEmissionAllowed, false);
    assert.equal("rawEvidence" in output, false);
    assert.equal(
      (output.latestDomainReplay as { status: string }).status,
      "PASS_LATEST_RAW_DOMAIN_REPLAY",
    );
    assert.equal(verifiedCommit, TEST_FORWARD_INSTRUMENT_RELEASE_ID);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns a nonzero readiness status without falsifying integrity", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-verify-not-ready-"));
  try {
    const evidenceRoot = await captureCycles({ count: 1, root });
    const result = await runM2ForwardInstrumentVerifyEntrypoint({
      args: args(evidenceRoot),
      requireRepositoryCommit: () => undefined,
      resolveRepositoryRelease: () => VERIFIER_RELEASE_ID,
    });
    const output = JSON.parse(result.output) as Record<string, unknown>;
    assert.equal(result.exitCode, 2);
    assert.equal(
      output.status,
      "PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT",
    );
    assert.equal(output.operationalForwardOnlyReady, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects ambiguous options, relative paths, and absent evidence commits", async () => {
  await assert.rejects(
    runM2ForwardInstrumentVerifyEntrypoint({ args: [] }),
    /usage/u,
  );
  await assert.rejects(
    runM2ForwardInstrumentVerifyEntrypoint({
      args: args("relative"),
      requireRepositoryCommit: () => undefined,
      resolveRepositoryRelease: () => VERIFIER_RELEASE_ID,
    }),
    /paths must be absolute/u,
  );
  await assert.rejects(
    runM2ForwardInstrumentVerifyEntrypoint({
      args: args(join(tmpdir(), "forward-verify-absent-commit")),
      requireRepositoryCommit: () => {
        throw new Error("expected evidence release is absent");
      },
      resolveRepositoryRelease: () => VERIFIER_RELEASE_ID,
    }),
    /expected evidence release is absent/u,
  );
});
