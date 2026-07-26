import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import {
  auditM2ForwardInstrumentEvidence,
} from "../research/forward-instrument-evidence-auditor";
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
    throw new Error(
      "forward evidence verification requires a clean tracked verifier worktree",
    );
  }
  return M2ForwardInstrumentReleaseIdSchema.parse(releaseId);
}

function requireRepositoryCommit(
  repositoryRoot: string,
  releaseId: string,
): void {
  try {
    execFileSync(
      "git",
      ["-C", repositoryRoot, "cat-file", "-e", `${releaseId}^{commit}`],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (error) {
    throw new Error(
      "expected forward evidence release is not a commit in the repository",
      { cause: error },
    );
  }
}

export async function runM2ForwardInstrumentVerifyEntrypoint(
  input: Readonly<{
    args: readonly string[];
    requireRepositoryCommit?: (
      repositoryRoot: string,
      releaseId: string,
    ) => void;
    resolveRepositoryRelease?: (repositoryRoot: string) => string;
  }>,
): Promise<Readonly<{
  exitCode: 0 | 2;
  output: string;
}>> {
  const allowed = new Set([
    "--evidence-root",
    "--expected-evidence-release-id",
    "--repository-root",
  ]);
  const optionNames = input.args.filter((_, index) => index % 2 === 0);
  if (
    input.args.length !== 6 ||
    optionNames.some((value) => !allowed.has(value)) ||
    new Set(optionNames).size !== allowed.size
  ) {
    throw new Error(
      "usage: m2-forward-instrument-verify --evidence-root <absolute-path> --repository-root <absolute-path> --expected-evidence-release-id <40-hex-commit>",
    );
  }
  const evidenceRoot = option(input.args, "--evidence-root");
  const repositoryRoot = option(input.args, "--repository-root");
  const expectedEvidenceReleaseId = M2ForwardInstrumentReleaseIdSchema.parse(
    option(input.args, "--expected-evidence-release-id"),
  );
  if (!isAbsolute(evidenceRoot) || !isAbsolute(repositoryRoot)) {
    throw new Error("forward evidence verification paths must be absolute");
  }
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const verifierReleaseId = (
    input.resolveRepositoryRelease ?? resolveCleanRepositoryRelease
  )(resolvedRepositoryRoot);
  (input.requireRepositoryCommit ?? requireRepositoryCommit)(
    resolvedRepositoryRoot,
    expectedEvidenceReleaseId,
  );
  const audit = await auditM2ForwardInstrumentEvidence({
    evidenceRoot: resolve(evidenceRoot),
    expectedEvidenceReleaseId,
    repositoryRoot: resolvedRepositoryRoot,
    verifierReleaseId,
  });
  const output = {
    schemaVersion: "v2-m2-forward-instrument-verify-command-result.v1",
    status: audit.status,
    evidenceReleaseId: audit.evidenceReleaseId,
    verifierReleaseId: audit.verifierReleaseId,
    sameReleaseVerifier: audit.sameReleaseVerifier,
    captureConfigDigest: audit.captureConfigDigest,
    journalEntryCount: audit.journalEntryCount,
    journalHeadDigest: audit.journalHeadDigest,
    batchStatusCounts: audit.batchStatusCounts,
    artifactReferenceCount: audit.artifactReferenceCount,
    uniqueArtifactObjectCount: audit.uniqueArtifactObjectCount,
    rawReferenceCount: audit.rawReferenceCount,
    uniqueRawObjectCount: audit.uniqueRawObjectCount,
    retainedFileCount: audit.retainedFileCount,
    exactFileSetVerified: audit.exactFileSetVerified,
    allReferencedObjectsVerified: audit.allReferencedObjectsVerified,
    latestDomainReplay: audit.latestDomainReplay,
    operationalForwardOnlyReady: audit.operationalForwardOnlyReady,
    authorityMode: audit.authorityMode,
    captureDirection: audit.captureDirection,
    historicalBackfillAllowed: audit.historicalBackfillAllowed,
    historicalSourceGateResolved: audit.historicalSourceGateResolved,
    bulkHistoricalAcquisitionAllowed:
      audit.bulkHistoricalAcquisitionAllowed,
    candidateEmissionAllowed: audit.candidateEmissionAllowed,
    latestProviderContinuity: audit.latestProviderContinuity,
  };
  return Object.freeze({
    exitCode: audit.operationalForwardOnlyReady ? 0 : 2,
    output: JSON.stringify(output),
  });
}

if (require.main === module) {
  void runM2ForwardInstrumentVerifyEntrypoint({
    args: process.argv.slice(2),
  }).then((result) => {
    process.stdout.write(`${result.output}\n`);
    process.exitCode = result.exitCode;
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `m2 forward instrument verification failed: ${message}\n`,
    );
    process.exitCode = 1;
  });
}
