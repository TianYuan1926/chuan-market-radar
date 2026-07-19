#!/usr/bin/env node

import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildPhaseRuntimeFromReadOnlySummary,
  validateReadOnlySummary,
} from "./runner.mjs";

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function json(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function childModule(packetRoot, relativePath) {
  const root = resolve(packetRoot);
  const path = resolve(root, relativePath);
  ensure(path.startsWith(`${root}/`), "child_module_path_invalid");
  const metadata = await lstat(path);
  ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 0,
    "child_module_invalid");
  return import(`${pathToFileURL(path).href}?identity=${metadata.size}`);
}

export function projectReadOnlyRuntime(runtime) {
  return {
    buildRecordPath: runtime.buildRecordPath,
    buildRecordSha256: runtime.buildRecordSha256,
    buildRecordWebImageId: runtime.buildRecordWebImageId,
    captureSpecification: runtime.captureSpecification,
    composeSha256: runtime.composeSha256,
    currentWebContainerId: runtime.currentWebContainerId,
    currentWebImageId: runtime.currentWebImageId,
    healthLevel: runtime.healthLevel,
    postgresAdminEnvPath: runtime.postgresAdminEnvPath,
    productionCommit: runtime.productionCommit,
    productionEnvSha256: runtime.productionEnvSha256,
    productionTree: runtime.productionTree,
    scanFreshness: runtime.scanFreshness,
  };
}

async function createReadOnly(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-readonly-superwindow/runner.mjs",
  );
  const [manifest, runtime] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
  ]);
  const request = childApi.createExecutionRequest({
    bundleSha256: options.bundle,
    manifest,
    runtime: projectReadOnlyRuntime(runtime),
    stagingDirectory: options.staging,
  });
  await childApi.validateExecutionRequest(request, manifest, options.bundle, {
    verifyEvidence: true,
  });
  return request;
}

async function createPhase(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-shadow-verify-phase/bundle.mjs",
  );
  const [manifest, outerRuntime, summary] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
    json(options.summary),
  ]);
  const runtime = await buildPhaseRuntimeFromReadOnlySummary({
    evidenceRoot: dirname(resolve(options.summary)),
    runtime: outerRuntime,
    summary,
  });
  runtime.reconciliationEvidence = await json(runtime.reconciliationEvidencePath);
  const request = childApi.createProductionExecutionRequest({
    bundleSha256: options.bundle,
    manifest,
    runtime,
  });
  await childApi.validateApprovalRequest({ manifest, request, productionPaths: true });
  return request;
}

async function validateSummary(options) {
  const summary = await json(options.summary);
  await validateReadOnlySummary(summary, dirname(resolve(options.summary)));
  ensure(summary.productionCommit === options.commit, "readonly_summary_commit_mismatch");
  return { status: "PASS_CURRENT_RUN_READ_ONLY_SUMMARY", secretsPrinted: false };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  ensure(["readonly", "phase", "validate-readonly"].includes(command), "command_invalid");
  if (command === "validate-readonly") {
    process.stdout.write(`${JSON.stringify(await validateSummary(options))}\n`);
    return;
  }
  const result = command === "readonly"
    ? await createReadOnly(options)
    : await createPhase(options);
  await writeFile(resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, {
    flag: "wx", mode: 0o600,
  });
  process.stdout.write(JSON.stringify({
    status: "pass",
    requestGenerated: true,
    child: command,
    secretsPrinted: false,
  }) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "fail", reason: error?.message ?? "unexpected_error", secretsPrinted: false,
    })}\n`);
    process.exitCode = 1;
  });
}
