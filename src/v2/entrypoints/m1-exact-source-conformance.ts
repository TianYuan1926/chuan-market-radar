import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../modules/source-capability/adapters/four-venue-capability-registry";
import {
  runM1ExactSourceConformance,
} from "../modules/source-conformance/adapters/exact-source-conformance-runner";
import type {
  M1SourceConformanceArtifact,
} from "../modules/source-conformance/source-conformance-contract";

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
    ["-C", repositoryRoot, "status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim();
  if (trackedChanges !== "") {
    throw new Error("source conformance requires a completely clean release");
  }
  if (!/^[0-9a-f]{40}$/u.test(releaseId)) {
    throw new Error("repository HEAD is not a full Git commit id");
  }
  return releaseId;
}

function networkEnvironment(
  value: string,
): M1SourceConformanceArtifact["networkEnvironment"] {
  if (
    value !== "LOCAL_WORKSTATION" &&
    value !== "TENCENT_ISOLATED_READ_ONLY"
  ) {
    throw new Error(
      "network environment must be LOCAL_WORKSTATION or TENCENT_ISOLATED_READ_ONLY",
    );
  }
  return value;
}

export async function runM1ExactSourceConformanceEntrypoint(input: Readonly<{
  args: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  resolveRepositoryRelease?: (repositoryRoot: string) => string;
}>): Promise<Readonly<{
  exitCode: 0 | 2;
  output: string;
}>> {
  const allowed = new Set([
    "--network-environment",
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
      "usage: m1-exact-source-conformance --repository-root <absolute-path> --release-id <40-hex-commit> --network-environment <LOCAL_WORKSTATION|TENCENT_ISOLATED_READ_ONLY>",
    );
  }
  const repositoryRoot = option(input.args, "--repository-root");
  const releaseId = option(input.args, "--release-id");
  if (!isAbsolute(repositoryRoot)) {
    throw new Error("repository root must be absolute");
  }
  if (!/^[0-9a-f]{40}$/u.test(releaseId)) {
    throw new Error("release-id must be a full 40-hex Git commit id");
  }
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const actualReleaseId = (
    input.resolveRepositoryRelease ?? resolveCleanRepositoryRelease
  )(resolvedRepositoryRoot);
  if (actualReleaseId !== releaseId) {
    throw new Error("source conformance release-id does not match repository HEAD");
  }

  const artifact = await runM1ExactSourceConformance({
    releaseId,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    networkEnvironment: networkEnvironment(
      option(input.args, "--network-environment"),
    ),
    coinGlassApiKey: (input.env ?? process.env).COINGLASS_API_KEY ?? null,
    fetchImplementation: input.fetchImplementation,
    now: input.now,
  });
  const passed =
    artifact.identityGateStatus === "PASS" &&
    artifact.listingGateStatus === "PASS" &&
    artifact.coinGlassGateStatus === "PASS";
  return Object.freeze({
    exitCode: passed ? 0 : 2,
    output: JSON.stringify(artifact),
  });
}

if (require.main === module) {
  void runM1ExactSourceConformanceEntrypoint({
    args: process.argv.slice(2),
  }).then((result) => {
    process.stdout.write(`${result.output}\n`);
    process.exitCode = result.exitCode;
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`m1 exact source conformance failed: ${message}\n`);
    process.exitCode = 1;
  });
}
