#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
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

async function json(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function childModule(packetRoot, relativePath) {
  const modulePath = resolve(packetRoot, relativePath);
  return import(`${pathToFileURL(modulePath).href}?packet=${Date.now()}`);
}

async function writeRequest(output, request) {
  await writeFile(resolve(output), `${JSON.stringify(request, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return request;
}

async function createCodePresence(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-shadow-verify-code-presence/bundle.mjs",
  );
  const [manifest, runtime] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
  ]);
  const now = new Date(options.now ?? Date.now());
  const request = childApi.createProductionVerificationRequest({
    bundleSha256: options.bundle,
    manifest,
    runtime,
    now,
  });
  childApi.validateProductionVerificationRequest(request, manifest, {
    bundleSha256: options.bundle,
    now,
  });
  return writeRequest(options.output, request);
}

async function createLineage(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-lineage/bundle.mjs",
  );
  const [manifest, runtime, execution] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
    json(resolve(options["packet-root"], childApi.EXECUTION_CONTRACT_PATH)),
  ]);
  const now = new Date(options.now ?? Date.now());
  const request = childApi.createProductionExecutionRequest({
    manifest,
    execution,
    bundleSha256: options.bundle,
    runtime,
    now,
  });
  await childApi.validateProductionExecutionRequest(
    request,
    manifest,
    execution,
    options.bundle,
    { now, verifyEvidence: true },
  );
  return writeRequest(options.output, request);
}

async function createReconciliation(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-reconciliation/bundle.mjs",
  );
  const [manifest, runtime, execution, preparation] = await Promise.all([
    json(options.manifest),
    json(options.runtime),
    json(resolve(options["packet-root"], childApi.EXECUTION_CONTRACT_PATH)),
    json(resolve(options["packet-root"], childApi.PREPARATION_CONTRACT_PATH)),
  ]);
  const now = new Date(options.now ?? Date.now());
  const request = childApi.createProductionExecutionRequest({
    manifest,
    execution,
    preparation,
    bundleSha256: options.bundle,
    runtime,
    now,
  });
  await childApi.validateProductionExecutionRequest(
    request,
    manifest,
    preparation,
    execution,
    options.bundle,
    { now, verifyEvidence: true },
  );
  return writeRequest(options.output, request);
}

async function validateLineage(options) {
  const childApi = await childModule(
    options["packet-root"],
    "scripts/production/candidate-lineage/runner.mjs",
  );
  const evidence = await json(options.evidence);
  childApi.validateCandidateLineageEvidence(evidence);
  return evidence;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  ensure(["code-presence", "lineage", "reconciliation", "validate-lineage"].includes(command),
    "command_invalid");
  ensure(options["packet-root"], "packet_root_required");
  let result;
  if (command === "code-presence") result = await createCodePresence(options);
  if (command === "lineage") result = await createLineage(options);
  if (command === "reconciliation") result = await createReconciliation(options);
  if (command === "validate-lineage") result = await validateLineage(options);
  process.stdout.write(`${JSON.stringify({
    status: "pass",
    command,
    packageId: result.packageId ?? null,
    evidenceStatus: result.status ?? null,
    secretsPrinted: false,
  })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "fail",
      reason: error?.message ?? "unexpected_error",
      secretsPrinted: false,
    })}\n`);
    process.exitCode = 1;
  });
}
