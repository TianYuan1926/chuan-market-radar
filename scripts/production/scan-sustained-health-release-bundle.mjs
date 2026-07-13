#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadContract, validateLocalPreparation } from "./scan-sustained-health-release.mjs";

const execFileAsync = promisify(execFile);
const CONTRACT_PATH = "docs/governance/wp-g0-2-scan-sustained-health-production-release.v1.json";
const TRANSPORT_ARCHIVE_FORMAT = "ustar+gzip-n";
const TRANSPORT_SOURCE_DATE_EPOCH = 946_684_800;
const TRANSPORT_FIXED_TIME = new Date(TRANSPORT_SOURCE_DATE_EPOCH * 1000);
const TRANSPORT_FILES = [
  CONTRACT_PATH,
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/governance/autonomy-policy.mjs",
  "scripts/production/scan-sustained-health-release-entrypoint.sh",
  "scripts/production/scan-sustained-health-release.mjs",
  "scripts/production/scan-sustained-health-release.sh",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export async function buildTransportBundle({
  root = process.cwd(),
  output,
  sourceCommit,
  sourceIdentity,
  approvalEligible = true,
}) {
  const identity = sourceIdentity ?? (approvalEligible ? null : {
    sourceCommit: null,
    sourceTree: null,
    sourceParentCommit: null,
    sourceDiffSha256: null,
    sourcePathSetSha256: null,
    gateEvidenceSha256: null,
    policySha256: null,
  });
  ensure(approvalEligible
    ? identity?.sourceCommit === sourceCommit
      && [identity.sourceCommit, identity.sourceTree, identity.sourceParentCommit].every((value) => /^[0-9a-f]{40}$/.test(value))
      && [identity.sourceDiffSha256, identity.sourcePathSetSha256, identity.gateEvidenceSha256, identity.policySha256]
        .every((value) => /^[0-9a-f]{64}$/.test(value))
    : sourceCommit === null, "source_identity_invalid");
  await validateLocalPreparation(root);
  const contract = await loadContract(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scan-sustained-health-release-bundle-"));
  const payloadRoot = join(temporaryRoot, "payload");
  const outputPath = resolve(output);
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, TRANSPORT_FIXED_TIME, TRANSPORT_FIXED_TIME);
    }
    const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
    const manifest = {
      schemaVersion: "wp-g0.2-scan-sustained-health-production-release-transport.v1",
      packageId: contract.packageId,
      sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      gateEvidenceSha256: identity.gateEvidenceSha256,
      policySha256: identity.policySha256,
      approvalEligible,
      targetCommit: contract.release.targetCommit,
      baselineCommit: contract.release.baselineCommit,
      releaseDiffSha256: contract.release.releaseDiffSha256,
      releaseArtifactSha256: contract.artifact.sha256,
      contractSha256: sha256(contractBytes),
      transportMethod: "approved_orcaterm_bundle_upload",
      reproducibleArchive: true,
      archiveFormat: TRANSPORT_ARCHIVE_FORMAT,
      sourceDateEpoch: TRANSPORT_SOURCE_DATE_EPOCH,
      containsSecrets: false,
      productionRepositoryMutationAllowed: true,
      repositoryMutationBoundary: "clean-main-baseline-to-detached-exact-target-or-automatic-main-baseline-rollback",
      services: contract.scope.services,
      executionMode: contract.execution.mode,
      sessionIndependentExecutionRequired: contract.execution.sessionIndependent,
      runnerLogs: contract.execution.logs,
      rollbackImageRetentionRequired: contract.rollback.retainImagesBeforeMutation,
      rollbackRetentionRepository: contract.rollback.retentionRepository,
      rollbackCleanupRequiresSeparateApproval: contract.rollback.cleanupRequiresSeparateApproval,
      files: TRANSPORT_FILES,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, TRANSPORT_FIXED_TIME, TRANSPORT_FIXED_TIME);
    await mkdir(dirname(outputPath), { recursive: true });
    const archivePath = join(temporaryRoot, "payload.tar");
    const archiveFiles = [...TRANSPORT_FILES, "transport-manifest.json"].sort();
    await execFileAsync("tar", [
      "-cf", archivePath,
      "--format=ustar",
      "--uid=0",
      "--gid=0",
      "--numeric-owner",
      "-C", payloadRoot,
      ...archiveFiles,
    ], {
      env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" },
    });
    const { stdout: bundleBytes } = await execFileAsync("gzip", ["-n", "-9", "-c", archivePath], {
      encoding: null,
      maxBuffer: 4 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bundleBytes), "deterministic_bundle_not_binary");
    await writeFile(outputPath, bundleBytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_SCAN_SUSTAINED_HEALTH_RELEASE_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_SCAN_SUSTAINED_HEALTH_RELEASE_TRANSPORT_TEMPLATE",
      output: outputPath,
      sha256: sha256(bundleBytes),
      sizeBytes: bundleBytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(key?.startsWith("--") && value && !value.startsWith("--"), "argument_invalid");
    options[key.slice(2)] = value;
  }
  return options;
}

async function worktreeIsClean(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "status", "--porcelain"]);
  return stdout.trim().length === 0;
}

async function currentSourceIdentity(root) {
  const runGit = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trimEnd();
  const sourceCommit = await runGit(["rev-parse", "HEAD"]);
  const sourceTree = await runGit(["rev-parse", "HEAD^{tree}"]);
  const parentLine = await runGit(["rev-list", "--parents", "-n", "1", "HEAD"]);
  const parents = parentLine.split(" ").slice(1);
  ensure(parents.length === 1, "runner_source_must_have_one_parent");
  const diffOutput = `${await runGit(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const pathSetOutput = `${(await runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  ensure(pointer.schemaVersion === "market-radar-autonomous-gate-result-pointer.v1", "gate_evidence_pointer_invalid");
  const gateResultBytes = await readFile(resolve(root, pointer.resultPath));
  ensure(sha256(gateResultBytes) === pointer.resultSha256, "gate_evidence_pointer_hash_mismatch");
  const gateResult = JSON.parse(gateResultBytes);
  ensure(gateResult.status === "pass", "gate_evidence_not_pass");
  ensure(gateResult.gitHead === sourceCommit && gateResult.gitTree === sourceTree, "gate_evidence_source_identity_mismatch");
  const policyBytes = await readFile(resolve(root, "scripts/governance/autonomy-policy.mjs"));
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diffOutput),
    sourcePathSetSha256: sha256(pathSetOutput),
    gateEvidenceSha256: pointer.resultSha256,
    policySha256: sha256(policyBytes),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  ensure(options["source-commit"] === undefined, "source_commit_override_forbidden");
  const approvalEligible = await worktreeIsClean(root);
  const sourceIdentity = approvalEligible ? await currentSourceIdentity(root) : null;
  const sourceCommit = sourceIdentity?.sourceCommit ?? null;
  const bundleId = approvalEligible ? sourceIdentity.sourceCommit.slice(0, 12) : "precommit-template";
  const output = options.output ?? join(
    root,
    "reports/wp-g0-2-scan-sustained-health-production-release",
    `scan-sustained-health-release-${bundleId}.tar.gz`,
  );
  const result = await buildTransportBundle({
    root,
    output,
    sourceCommit,
    sourceIdentity,
    approvalEligible,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
