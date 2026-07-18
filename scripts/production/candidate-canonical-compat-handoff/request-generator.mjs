#!/usr/bin/env node

import { lstat, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildPhaseRuntimeFromCodePresence,
  sha256,
  validateCodePresenceSummary,
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

export function projectCodePresenceRuntime(runtime) {
  return {
    buildRecordSha256: runtime.buildRecordSha256,
    buildRecordWebImageId: runtime.buildRecordWebImageId,
    currentWebContainerId: runtime.currentWebContainerId,
    currentWebImageId: runtime.currentWebImageId,
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    authorityEpoch: runtime.currentAuthorityEpoch,
    manifestSha256: runtime.currentManifestSha256,
    healthLevel: runtime.healthLevel,
    scanFreshness: runtime.scanFreshness,
  };
}

async function createCodePresence(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-canonical-compat-code-presence/bundle.mjs",
  );
  const [manifest, runtime] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
  ]);
  const request = childApi.createProductionVerificationRequest({
    bundleSha256: options.bundle,
    manifest,
    runtime: projectCodePresenceRuntime(runtime),
    stagingDirectory: options.staging,
  });
  childApi.validateProductionVerificationRequest(request, manifest, {
    bundleSha256: options.bundle,
  });
  return request;
}

async function createPhase(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-canonical-compat-phase/bundle.mjs",
  );
  const summaryPath = resolve(options.summary);
  const [manifest, outerRuntime, codePresenceBytes] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
    readFile(summaryPath),
  ]);
  const codePresence = JSON.parse(codePresenceBytes);
  const runtime = buildPhaseRuntimeFromCodePresence({
    runtime: outerRuntime,
    codePresence,
    codePresenceEvidencePath: summaryPath,
    codePresenceEvidenceSha256: sha256(codePresenceBytes),
  });
  runtime.reconciliationEvidence = await json(runtime.reconciliationEvidencePath);
  runtime.dualReadEvidence = await json(runtime.dualReadEvidencePath);
  const request = childApi.createProductionExecutionRequest({
    bundleSha256: options.bundle,
    manifest,
    runtime,
  });
  await childApi.validateApprovalRequest({ manifest, request, productionPaths: true });
  return request;
}

async function validateSummary(options) {
  const [summary, runtime] = await Promise.all([
    json(options.summary),
    json(options.runtime),
  ]);
  validateCodePresenceSummary(summary, runtime);
  return { status: "PASS_CURRENT_RUN_CANONICAL_CODE_PRESENCE", secretsPrinted: false };
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
  ensure(["code-presence", "phase", "validate-code-presence"].includes(command),
    "command_invalid");
  if (command === "validate-code-presence") {
    process.stdout.write(`${JSON.stringify(await validateSummary(options))}\n`);
    return;
  }
  const result = command === "code-presence"
    ? await createCodePresence(options)
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
