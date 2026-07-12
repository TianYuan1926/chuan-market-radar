#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadContract, validateLocalPreparation } from "./web-identity-recovery.mjs";

const execFileAsync = promisify(execFile);
const CONTRACT_PATH = "docs/governance/wp-g0-2-production-web-identity-recovery.v1.json";
const TRANSPORT_FILES = [
  CONTRACT_PATH,
  "scripts/production/web-identity-recovery-entrypoint.sh",
  "scripts/production/web-identity-recovery.mjs",
  "scripts/production/web-identity-recovery.sh",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

export async function buildTransportBundle({ root = process.cwd(), output, sourceCommit, approvalEligible = true }) {
  ensure(approvalEligible ? /^[0-9a-f]{40}$/.test(sourceCommit ?? "") : sourceCommit === null, "source_commit_invalid");
  await validateLocalPreparation(root);
  const contract = await loadContract(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "web-identity-recovery-bundle-"));
  const payloadRoot = join(temporaryRoot, "payload");
  const outputPath = resolve(output);
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
    }
    const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
    const manifest = {
      schemaVersion: "wp-g0.2-web-identity-recovery-transport.v1",
      packageId: contract.packageId,
      sourceCommit,
      approvalEligible,
      recoveryArtifactSha256: contract.artifact.sha256,
      contractSha256: sha256(contractBytes),
      transportMethod: "approved_orcaterm_bundle_upload",
      containsSecrets: false,
      productionRepositoryMutationAllowed: false,
      files: TRANSPORT_FILES,
    };
    await writeFile(join(payloadRoot, "transport-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await mkdir(dirname(outputPath), { recursive: true });
    await execFileAsync("tar", ["-czf", outputPath, "-C", payloadRoot, "."], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const bundleBytes = await readFile(outputPath);
    return {
      status: approvalEligible
        ? "PASS_FINAL_RECOVERY_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_RECOVERY_TRANSPORT_BUNDLE_TEMPLATE",
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

async function currentCommit(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
  return stdout.trim();
}

async function worktreeIsClean(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "status", "--porcelain"]);
  return stdout.trim().length === 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  ensure(options["source-commit"] === undefined, "source_commit_override_forbidden");
  const head = await currentCommit(root);
  const approvalEligible = await worktreeIsClean(root);
  const sourceCommit = approvalEligible ? head : null;
  const bundleId = approvalEligible ? head.slice(0, 12) : "precommit-template";
  const output = options.output ?? join(root, "reports/wp-g0-2-production-web-identity-recovery", `web-identity-recovery-${bundleId}.tar.gz`);
  const result = await buildTransportBundle({ root, output, sourceCommit, approvalEligible });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
