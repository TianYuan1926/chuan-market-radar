import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
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
  auditM2ForwardInstrumentEvidence,
} from "./forward-instrument-evidence-auditor";
import {
  runM2ForwardInstrumentCapture,
} from "./forward-instrument-capture-runner";

const VERIFIER_RELEASE_ID = "89abcdef0123456789abcdef0123456789abcdef";

async function captureTwoCompleteCycles(root: string): Promise<Readonly<{
  evidenceRoot: string;
  firstRawStorageKey: string;
}>> {
  const evidenceRoot = join(root, "evidence");
  const state = syntheticForwardInstrumentState();
  const clock = new MutableForwardInstrumentClock(
    "2026-07-20T18:00:00.000Z",
  );
  const first = await runM2ForwardInstrumentCapture({
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
  return Object.freeze({
    evidenceRoot,
    firstRawStorageKey: first.snapshots[0]!.rawEvidence[0]!.storageKey,
  });
}

test("audits every retained object and the full two-cycle journal chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-auditor-pass-"));
  try {
    const capture = await captureTwoCompleteCycles(root);
    const audit = await auditM2ForwardInstrumentEvidence({
      evidenceRoot: capture.evidenceRoot,
      expectedEvidenceReleaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
      verifierReleaseId: VERIFIER_RELEASE_ID,
    });
    assert.equal(audit.status, "PASS_FORWARD_EVIDENCE_INTEGRITY_AUDIT");
    assert.equal(audit.evidenceReleaseId, TEST_FORWARD_INSTRUMENT_RELEASE_ID);
    assert.equal(audit.verifierReleaseId, VERIFIER_RELEASE_ID);
    assert.equal(audit.sameReleaseVerifier, false);
    assert.equal(audit.journalEntryCount, 2);
    assert.deepEqual(audit.batchStatusCounts, {
      COMPLETE: 2,
      FAILED: 0,
      PARTIAL: 0,
    });
    assert.equal(audit.artifactReferenceCount, 14);
    assert.equal(audit.uniqueArtifactObjectCount, 14);
    assert.equal(audit.rawReferenceCount, 6);
    assert.equal(audit.uniqueRawObjectCount, 3);
    assert.equal(audit.retainedFileCount, 18);
    assert.equal(audit.exactFileSetVerified, true);
    assert.equal(audit.allReferencedObjectsVerified, true);
    assert.equal(
      audit.latestDomainReplay?.status,
      "PASS_LATEST_RAW_DOMAIN_REPLAY",
    );
    assert.equal(audit.latestDomainReplay?.candidateEmissionAllowed, false);
    assert.equal(audit.latestDomainReplay?.strategyAuthorityAllowed, false);
    assert.equal(audit.operationalForwardOnlyReady, true);
    assert.equal(audit.latestProviderContinuity.length, 3);
    assert.ok(audit.latestProviderContinuity.every((provider) =>
      provider.observedSnapshotCount === 2 &&
      provider.completeSnapshotCount === 2 &&
      provider.gapCount === 0 &&
      provider.activeCoverageGapCount === 0 &&
      provider.preCaptureIncompleteSnapshotCount === 0 &&
      provider.observationSpanMs !== null &&
      provider.observationSpanMs >= 5 * 60 * 1_000 &&
      provider.continuityStatus === "FORWARD_ONLY_READY" &&
      provider.blockerReasonCodes.length === 0));
    assert.equal(audit.historicalSourceGateResolved, false);
    assert.equal(audit.candidateEmissionAllowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects retained raw bytes changed after capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-auditor-raw-tamper-"));
  try {
    const capture = await captureTwoCompleteCycles(root);
    const rawPath = join(capture.evidenceRoot, capture.firstRawStorageKey);
    const original = await readFile(rawPath);
    await writeFile(rawPath, Uint8Array.from([
      ...original.subarray(0, original.length - 1),
      original.at(-1) === 0x0a ? 0x20 : 0x0a,
    ]));
    await assert.rejects(
      auditM2ForwardInstrumentEvidence({
        evidenceRoot: capture.evidenceRoot,
        expectedEvidenceReleaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
        repositoryRoot: process.cwd(),
        verifierReleaseId: VERIFIER_RELEASE_ID,
      }),
      /failed verification/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an unreferenced file even when its permissions are restrictive", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-auditor-pollution-"));
  try {
    const capture = await captureTwoCompleteCycles(root);
    const pollutionPath = join(
      capture.evidenceRoot,
      "artifacts",
      "sha256",
      `${"f".repeat(64)}.json`,
    );
    await writeFile(pollutionPath, "{}\n", { mode: 0o600 });
    await chmod(pollutionPath, 0o600);
    await assert.rejects(
      auditM2ForwardInstrumentEvidence({
        evidenceRoot: capture.evidenceRoot,
        expectedEvidenceReleaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
        repositoryRoot: process.cwd(),
        verifierReleaseId: VERIFIER_RELEASE_ID,
      }),
      /unreferenced or missing file/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
