import { isAbsolute, resolve } from "node:path";
import {
  runM2ForwardInstrumentCapture,
} from "../research/forward-instrument-capture-runner";

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new Error(`missing required ${name} option`);
  }
  return value;
}

export async function runM2ForwardInstrumentCaptureEntrypoint(input: Readonly<{
  args: readonly string[];
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}>): Promise<Readonly<{
  exitCode: 0 | 2;
  output: string;
}>> {
  const allowed = new Set(["--evidence-root", "--repository-root"]);
  if (
    input.args.length !== 4 ||
    input.args.some((value, index) => index % 2 === 0 && !allowed.has(value))
  ) {
    throw new Error(
      "usage: m2-forward-instrument-capture --evidence-root <absolute-path> --repository-root <absolute-path>",
    );
  }
  const evidenceRoot = option(input.args, "--evidence-root");
  const repositoryRoot = option(input.args, "--repository-root");
  if (!isAbsolute(evidenceRoot) || !isAbsolute(repositoryRoot)) {
    throw new Error("forward instrument capture paths must be absolute");
  }
  const result = await runM2ForwardInstrumentCapture({
    evidenceRoot: resolve(evidenceRoot),
    fetchImplementation: input.fetchImplementation,
    now: input.now,
    repositoryRoot: resolve(repositoryRoot),
  });
  const output = {
    schemaVersion: "v2-m2-forward-instrument-capture-command-result.v1",
    authorityMode: "NO_AUTHORITY_RESEARCH_CAPTURE",
    captureDirection: "FORWARD_ONLY_FROM_MEASURED_CAPTURE_START",
    historicalBackfillAllowed: false,
    historicalSourceGateResolved: false,
    candidateEmissionAllowed: false,
    batchStatus: result.batch.batchStatus,
    batchDigest: result.batch.batchDigest,
    journalEntrySequence: result.journalEntry.entrySequence,
    journalEntryDigest: result.journalEntry.journalEntryDigest,
    evidenceRoot: result.evidenceRoot,
    snapshots: result.snapshots.map((snapshot) => ({
      providerId: snapshot.providerId,
      captureStatus: snapshot.captureStatus,
      denominatorState: snapshot.denominator.state,
      accountingCount: snapshot.accounting.length,
      rawPageEvidenceCount: snapshot.rawEvidence.length,
      blockerReasonCodes: snapshot.blockerReasonCodes,
    })),
    continuities: result.continuities.map((continuity) => ({
      providerId: continuity.providerId,
      continuityStatus: continuity.continuityStatus,
      observedSnapshotCount: continuity.observedSnapshotCount,
      completeSnapshotCount: continuity.completeSnapshotCount,
      gapCount: continuity.gapCount,
      activeCoverageGapCount: continuity.activeCoverageGapCount,
      preCaptureIncompleteSnapshotCount:
        continuity.preCaptureIncompleteSnapshotCount,
      blockerReasonCodes: continuity.blockerReasonCodes,
    })),
  };
  return Object.freeze({
    exitCode: result.batch.batchStatus === "COMPLETE" ? 0 : 2,
    output: JSON.stringify(output),
  });
}

if (require.main === module) {
  void runM2ForwardInstrumentCaptureEntrypoint({ args: process.argv.slice(2) })
    .then((result) => {
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`m2 forward instrument capture failed: ${message}\n`);
      process.exitCode = 1;
    });
}
