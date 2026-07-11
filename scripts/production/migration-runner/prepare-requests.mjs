#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  AUTHORIZED_ARTIFACT_HASH,
  AUTHORIZED_MANIFEST_HASH,
  AUTHORIZED_SOURCE_COMMIT,
  RunnerPolicyError,
  assertOutsideProductionWorktree,
  sha256,
} from "./runner-core.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--") || !rest[index + 1]) {
      throw new RunnerPolicyError("argument_invalid");
    }
    options[value.slice(2)] = rest[index + 1];
    index += 1;
  }
  return { command, options };
}

function required(options, name) {
  if (!options[name]?.trim()) throw new RunnerPolicyError(`${name}_missing`);
  return options[name].trim();
}

async function writeSecure(filePath, value) {
  await writeFile(filePath, value, { mode: 0o600 });
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command !== "identity" && command !== "migration-dry-run") {
    throw new RunnerPolicyError("command_unsupported");
  }
  const outputDirectory = resolve(required(options, "output-dir"));
  await assertOutsideProductionWorktree({
    cwd: options.cwd ? resolve(options.cwd) : outputDirectory,
    productionWorktree: options.worktree,
  });
  await mkdir(outputDirectory, { mode: 0o700, recursive: true });
  const now = new Date();
  const common = {
    applicationRelease: required(options, "application-release"),
    approvalExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    approvalIssuedAt: now.toISOString(),
    approvalRef: required(options, "approval-ref"),
    operator: required(options, "operator"),
    targetClass: "production",
  };

  if (command === "identity") {
    const confirmation = randomBytes(32).toString("base64url");
    const request = {
      ...common,
      confirmationDigest: sha256(confirmation),
      confirmationExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      identityExecute: true,
      workPackage: "WP-G0.2-MIGRATION-PRODUCTION-IDENTITY-AND-RUNNER-REMEDIATION",
    };
    await writeSecure(join(outputDirectory, "identity-request.json"), `${JSON.stringify(request)}\n`);
    await writeSecure(join(outputDirectory, "identity-confirmation"), confirmation);
  } else {
    const request = {
      ...common,
      artifactHash: AUTHORIZED_ARTIFACT_HASH,
      execute: false,
      lockTimeout: "5s",
      manifestHash: AUTHORIZED_MANIFEST_HASH,
      migrationReleaseId: required(options, "migration-release-id"),
      roleBootstrapEnabled: false,
      schemaMigrationEnabled: false,
      sourceCommit: AUTHORIZED_SOURCE_COMMIT,
      statementTimeout: "10min",
    };
    await writeSecure(
      join(outputDirectory, "migration-dry-run-request.json"),
      `${JSON.stringify(request)}\n`,
    );
  }
  process.stdout.write(`${JSON.stringify({ command, status: "pass" })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    reason: error instanceof RunnerPolicyError ? error.reason : "request_generation_failed",
    status: "fail",
  })}\n`);
  process.exitCode = 1;
});
