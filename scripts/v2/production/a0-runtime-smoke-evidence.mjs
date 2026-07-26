#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCommit,
  canonicalJson,
  stableDigest,
} from "./a0-release-qualification-contract.mjs";

export const A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA =
  "market-radar-v2-a0-container-runtime-smoke-evidence.v1";

export function buildA0RuntimeSmokeEvidence({
  entrypointExitCode,
  entrypointStderr,
  nodeVersion,
  sourceCommit,
}) {
  assertCommit(sourceCommit);
  assert.equal(nodeVersion.trim(), "v22.23.1");
  assert.equal(entrypointExitCode, 1);
  const lines = entrypointStderr
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line !== "");
  assert.equal(lines.length, 1, "runtime smoke must emit one failure record");
  const failure = JSON.parse(lines[0]);
  assert.deepEqual(failure, {
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    contractVersion: "v2-m1-collector-process.v1",
    errorCode: "COLLECTOR_PROCESS_FAILED",
    status: "FAILED",
  });
  const evidenceCore = {
    schemaVersion: A0_RUNTIME_SMOKE_EVIDENCE_SCHEMA,
    status: "PASS_RUNTIME_LOADS_AND_FAILS_CLOSED_BEFORE_NETWORK_OR_DATABASE",
    sourceCommit,
    nodeVersion: "22.23.1",
    execution: {
      networkMode: "NONE",
      rootFilesystem: "READ_ONLY",
      authorityProbe: "INTENTIONALLY_INVALID_BEFORE_POOL_CREATION",
      entrypointExitCode,
      failure,
    },
    productionRead: false,
    productionMutation: false,
    productionCredentials: false,
    automaticTradingAllowed: false,
  };
  return Object.freeze({
    ...evidenceCore,
    evidenceHash: stableDigest(evidenceCore),
  });
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    assert.ok(separator > 2 && argument.startsWith("--"), "invalid argument");
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  return values;
}

const entryPath = process.argv[1] === undefined
  ? ""
  : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const values = parseArguments(process.argv.slice(2));
  const nodeVersionPath = values.get("node-version");
  const stderrPath = values.get("entrypoint-stderr");
  const outputPath = values.get("output");
  const sourceCommit = values.get("source-commit");
  const exitCode = Number(values.get("entrypoint-exit-code"));
  assert.ok(nodeVersionPath && stderrPath && outputPath);
  const evidence = buildA0RuntimeSmokeEvidence({
    entrypointExitCode: exitCode,
    entrypointStderr: await readFile(stderrPath, "utf8"),
    nodeVersion: await readFile(nodeVersionPath, "utf8"),
    sourceCommit,
  });
  await writeFile(outputPath, canonicalJson(evidence), {
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({
    evidenceHash: evidence.evidenceHash,
    status: evidence.status,
  })}\n`);
}
