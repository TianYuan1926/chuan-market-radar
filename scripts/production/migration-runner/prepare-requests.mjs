#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  AUTHORIZED_ARTIFACT_HASH,
  AUTHORIZED_MANIFEST_HASH,
  AUTHORIZED_SOURCE_COMMIT,
  AUTHORIZED_WORK_PACKAGE,
  ONLY_PENDING_MIGRATION,
  ONLY_PENDING_MIGRATION_CHECKSUM,
  RunnerPolicyError,
  assertOutsideProductionWorktree,
  sha256,
  validateRequest,
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
  if (
    command !== "identity"
    && command !== "migration-dry-run"
    && command !== "migration-schema-only"
  ) {
    throw new RunnerPolicyError("command_unsupported");
  }
  const outputDirectory = resolve(required(options, "output-dir"));
  await assertOutsideProductionWorktree({
    cwd: options.cwd ? resolve(options.cwd) : outputDirectory,
    productionWorktree: options.worktree,
  });
  await mkdir(outputDirectory, { mode: 0o700, recursive: true });
  const now = new Date();
  const approvalIssuedAt = command === "migration-schema-only"
    ? required(options, "approval-issued-at")
    : now.toISOString();
  const approvalExpiresAt = command === "migration-schema-only"
    ? required(options, "approval-expires-at")
    : new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const common = {
    applicationRelease: required(options, "application-release"),
    approvalExpiresAt,
    approvalIssuedAt,
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
    const execute = command === "migration-schema-only";
    const request = {
      ...common,
      artifactHash: AUTHORIZED_ARTIFACT_HASH,
      execute,
      lockTimeout: "5s",
      manifestHash: AUTHORIZED_MANIFEST_HASH,
      migrationReleaseId: required(options, "migration-release-id"),
      onlyMigrationChecksum: ONLY_PENDING_MIGRATION_CHECKSUM,
      onlyMigrationVersion: ONLY_PENDING_MIGRATION,
      roleBootstrapEnabled: false,
      schemaMigrationEnabled: execute,
      sourceCommit: AUTHORIZED_SOURCE_COMMIT,
      statementTimeout: "10min",
      workPackage: AUTHORIZED_WORK_PACKAGE,
    };
    let confirmation = null;
    if (execute) {
      confirmation = randomBytes(32).toString("base64url");
      request.confirmationDigest = sha256(confirmation);
      request.confirmationExpiresAt = new Date(Math.min(
        Date.parse(approvalExpiresAt),
        now.getTime() + 15 * 60 * 1000,
      )).toISOString();
    }
    validateRequest(request, { now });
    const requestName = execute
      ? "migration-schema-only-request.json"
      : "migration-dry-run-request.json";
    await writeSecure(
      join(outputDirectory, requestName),
      `${JSON.stringify(request)}\n`,
    );
    if (confirmation) {
      await writeSecure(join(outputDirectory, "migration-schema-only-confirmation"), confirmation);
    }
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
