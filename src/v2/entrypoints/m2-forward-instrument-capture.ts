import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import {
  runM2ForwardInstrumentCapture,
} from "../research/forward-instrument-capture-runner";
import {
  M2ForwardInstrumentReleaseIdSchema,
} from "../research/forward-instrument-provenance";

function option(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new Error(`missing required ${name} option`);
  }
  return value;
}

function resolveCleanRepositoryRelease(repositoryRoot: string): string {
  const releaseId = execFileSync(
    "git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const trackedChanges = execFileSync(
    "git",
    ["-C", repositoryRoot, "status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim();
  if (trackedChanges !== "") {
    throw new Error("forward capture requires a clean tracked release worktree");
  }
  return M2ForwardInstrumentReleaseIdSchema.parse(releaseId);
}

export async function runM2ForwardInstrumentCaptureEntrypoint(input: Readonly<{
  args: readonly string[];
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  resolveRepositoryRelease?: (repositoryRoot: string) => string;
}>): Promise<Readonly<{
  exitCode: 0 | 2;
  output: string;
}>> {
  const allowed = new Set([
    "--evidence-root",
    "--release-id",
    "--repository-root",
  ]);
  const optionNames = input.args.filter((_, index) => index % 2 === 0);
  if (
    input.args.length !== 6 ||
    optionNames.some((value) => !allowed.has(value)) ||
    new Set(optionNames).size !== allowed.size
  ) {
    throw new Error(
      "usage: m2-forward-instrument-capture --evidence-root <absolute-path> --repository-root <absolute-path> --release-id <40-hex-commit>",
    );
  }
  const evidenceRoot = option(input.args, "--evidence-root");
  const repositoryRoot = option(input.args, "--repository-root");
  const releaseId = M2ForwardInstrumentReleaseIdSchema.parse(
    option(input.args, "--release-id"),
  );
  if (!isAbsolute(evidenceRoot) || !isAbsolute(repositoryRoot)) {
    throw new Error("forward instrument capture paths must be absolute");
  }
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const actualReleaseId = (
    input.resolveRepositoryRelease ?? resolveCleanRepositoryRelease
  )(resolvedRepositoryRoot);
  if (actualReleaseId !== releaseId) {
    throw new Error("forward capture release-id does not match repository HEAD");
  }
  const result = await runM2ForwardInstrumentCapture({
    evidenceRoot: resolve(evidenceRoot),
    fetchImplementation: input.fetchImplementation,
    now: input.now,
    releaseId,
    repositoryRoot: resolvedRepositoryRoot,
  });
  const output = {
    schemaVersion: "v2-m2-forward-instrument-capture-command-result.v2",
    releaseId: result.journalEntry.releaseId,
    captureConfigDigest: result.journalEntry.captureConfigDigest,
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
