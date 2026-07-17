#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REQUIRED_PACKAGE_APPROVAL_FIELDS } from "../../governance/autonomy-policy.mjs";
import {
  MIGRATION_CHECKSUM,
  MIGRATION_FILE,
  MIGRATION_VERSION,
  PACKAGE_ID,
  readLockedMigration,
  sha256,
  validateRequest,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-canonical-rollback-safety-production-add-schema.v1.json";
export const SOURCE_DATE_EPOCH = 946684800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

export const RUNNER_FILES = Object.freeze([
  "scripts/production/candidate-canonical-rollback-add-schema/production-entrypoint.sh",
  "scripts/production/candidate-canonical-rollback-add-schema/production-runner.sh",
  "scripts/production/candidate-canonical-rollback-add-schema/runner.mjs",
]);
export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  MIGRATION_FILE,
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-canonical-rollback-add-schema/bundle.mjs",
  ...RUNNER_FILES,
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function artifact(root, files) {
  const fileSha256 = {};
  ensure(files.length > 0 && new Set(files).size === files.length, "artifact_files_invalid");
  for (const file of [...files].sort()) {
    ensure(!file.startsWith("/") && !file.includes(".."), "artifact_path_invalid");
    const metadata = await lstat(resolve(root, file));
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
      && metadata.size > 0 && metadata.size <= 2 * 1024 * 1024,
    `artifact_file_invalid:${file}`);
    fileSha256[file] = sha256(await readFile(resolve(root, file)));
  }
  return { fileCount: files.length, fileSha256, sha256: sha256(canonicalJson(fileSha256)) };
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion
    === "wp-g0.2-canonical-rollback-safety-production-add-schema.v1"
    && contract.packageId === PACKAGE_ID && contract.gate === "G0"
    && contract.actionClass === "additive_schema_migration"
    && contract.riskTier === "R2_DATABASE_SCHEMA", "contract_identity_invalid");
  ensure(contract.status === "local_packet_prepared_production_not_executed"
    && contract.productionAuthorization === false && contract.productionExecuted === false
    && contract.canonicalCutoverAuthorized === false, "contract_truth_invalid");
  ensure(contract.migration?.file === MIGRATION_FILE
    && contract.migration?.version === MIGRATION_VERSION
    && contract.migration?.sha256 === MIGRATION_CHECKSUM
    && contract.migration?.onlyPendingMigration === MIGRATION_VERSION
    && contract.migration?.expectedBaselineCount === 9
    && contract.migration?.expectedCompletionCount === 10
    && contract.migration?.roleBootstrapAllowed === false,
  "contract_migration_invalid");
  ensure(contract.databaseBoundary?.migrationLoginRole === "market_radar_migration_login"
    && contract.databaseBoundary?.migrationOwnerRole === "candidate_migration_role"
    && contract.databaseBoundary?.transactionIsolation === "repeatable_read"
    && contract.databaseBoundary?.advisoryLockRequired === true
    && contract.databaseBoundary?.lockTimeout === "5s"
    && contract.databaseBoundary?.statementTimeout === "30s"
    && contract.databaseBoundary?.businessDataMutationAllowed === false
    && contract.databaseBoundary?.canonicalPhaseBeforeMigrationAllowed === false,
  "contract_database_boundary_invalid");
  ensure(contract.execution?.runner === "transient_systemd_unit"
    && contract.execution?.sessionIndependent === true
    && contract.execution?.maximumApprovalWindowMinutes === 90
    && contract.execution?.externalProductionLeaseRequired === true
    && contract.execution?.singleUseApprovalRequired === true
    && contract.execution?.serviceMutationAllowed === false
    && contract.execution?.sourceSyncAllowed === false
    && contract.execution?.environmentMutationAllowed === false,
  "contract_execution_invalid");
  ensure(contract.rollback?.preCommitFailure === "database_transaction_rollback"
    && contract.rollback?.postCommitSchemaRemovalAllowed === false
    && contract.rollback?.candidateDataPreserved === true,
  "contract_rollback_invalid");
  ensure(contract.runnerArtifact?.fileCount === RUNNER_FILES.length
    && JSON.stringify(contract.runnerArtifact.files) === JSON.stringify(RUNNER_FILES)
    && HASH.test(contract.runnerArtifact.sha256 ?? ""), "contract_runner_artifact_invalid");
  for (const forbidden of [
    "historical_migration_edit", "role_bootstrap", "business_data_mutation",
    "feature_flag_mutation", "service_recreate", "source_sync", "canonical_cutover",
    "formal_backtest", "secret_in_evidence",
  ]) ensure(contract.forbidden?.includes(forbidden), `contract_forbidden_missing:${forbidden}`);
  return contract;
}

export async function validateLocalPreparation(root = process.cwd()) {
  await readLockedMigration(root);
  const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = validateContract(JSON.parse(contractBytes));
  const runner = await artifact(root, RUNNER_FILES);
  ensure(runner.sha256 === contract.runnerArtifact.sha256, "runner_artifact_checksum_mismatch");
  return {
    status: "PASS_LOCAL_CANONICAL_ROLLBACK_SAFETY_PRODUCTION_ADD_SCHEMA_PACKET",
    packageId: PACKAGE_ID,
    migrationChecksum: MIGRATION_CHECKSUM,
    contractSha256: sha256(contractBytes),
    runnerArtifactSha256: runner.sha256,
    productionAuthorization: false,
    productionExecuted: false,
    canonicalCutoverAuthorized: false,
  };
}

async function git(root, args) {
  return (await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  })).stdout.trimEnd();
}

async function currentSourceIdentity(root) {
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  const sourceTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const parents = (await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"]))
    .split(" ").slice(1);
  ensure(parents.length === 1, "source_parent_count_invalid");
  const diff = `${await git(root, ["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  const gate = JSON.parse(gateBytes);
  ensure(sha256(gateBytes) === pointer.resultSha256 && gate.status === "pass"
    && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
  "gate_source_identity_invalid");
  return {
    sourceCommit, sourceTree, sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diff), sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
  };
}

export async function buildTransportBundle({ root = process.cwd(), output, sourceIdentity } = {}) {
  const local = await validateLocalPreparation(root);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-canonical-rollback-add-schema-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") || file.endsWith(".mjs") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const transport = await artifact(root, TRANSPORT_FILES);
    const manifest = {
      schemaVersion: "wp-g0.2-canonical-rollback-add-schema-transport.v1",
      packageId: PACKAGE_ID,
      ...identity,
      contractSha256: local.contractSha256,
      runnerArtifactSha256: local.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      policySha256: transport.fileSha256["scripts/governance/autonomy-policy.mjs"],
      migrationChecksum: MIGRATION_CHECKSUM,
      fileSha256: transport.fileSha256,
      files: [...TRANSPORT_FILES].sort(),
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      containsSecrets: false,
      services: [],
      databaseMigration: MIGRATION_VERSION,
      temporaryArtifactCleanupRequired: true,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const tarPath = join(temporaryRoot, "payload.tar");
    await execFileAsync("tar", [
      "-cf", tarPath, "--format=ustar", "--uid=0", "--gid=0", "--numeric-owner",
      "-C", payloadRoot, ...[...TRANSPORT_FILES, "transport-manifest.json"].sort(),
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: bytes } = await execFileAsync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null, maxBuffer: 16 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "transport_bundle_not_binary");
    const outputPath = resolve(output ?? join(root,
      "reports/wp-g0-2-canonical-rollback-safety-production-add-schema",
      `canonical-rollback-add-schema-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_TRANSPORT",
      output: outputPath, sha256: sha256(bytes), size: bytes.length, manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function verifyStagedTransport(root, manifest) {
  ensure(manifest?.schemaVersion === "wp-g0.2-canonical-rollback-add-schema-transport.v1"
    && manifest.packageId === PACKAGE_ID && manifest.containsSecrets === false
    && manifest.reproducibleArchive === true && manifest.databaseMigration === MIGRATION_VERSION
    && JSON.stringify(manifest.services) === "[]"
    && JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort()),
  "transport_manifest_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    ensure(COMMIT.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "contractSha256",
    "runnerArtifactSha256", "transportArtifactSha256", "policySha256", "migrationChecksum",
  ]) ensure(HASH.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  ensure(manifest.migrationChecksum === MIGRATION_CHECKSUM, "transport_migration_checksum_mismatch");
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_checksum_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.fileSha256[file] === manifest.fileSha256[file],
      `transport_file_checksum_mismatch:${file}`);
  }
  return manifest;
}

export function createProductionRequest({ bundleSha256, manifest, nonce = randomUUID(), now, runtime }) {
  ensure(HASH.test(bundleSha256 ?? ""), "bundle_sha256_invalid");
  ensure(runtime?.productionRoot === "/home/ubuntu/apps/chuan-market-radar"
    && COMMIT.test(runtime.productionCommit ?? "") && COMMIT.test(runtime.productionTree ?? "")
    && HASH.test(runtime.composeSha256 ?? "") && /^sha256:[0-9a-f]{64}$/u.test(runtime.webImageId ?? "")
    && runtime.migrationUrlFile?.startsWith("/var/lib/market-radar-ops/")
    && runtime.opsRoot?.startsWith("/home/ubuntu/.cache/market-radar-ops/canonical-rollback-add-schema-ops/")
    && runtime.evidenceDirectory?.startsWith(
      "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-rollback-add-schema-")
    && runtime.autonomyTrustRoot === "/home/ubuntu/.local/state/market-radar-autonomy",
  "runtime_identity_invalid");
  const issuedAt = now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + 90 * 60 * 1000);
  const emptyDiff = sha256("");
  const preflight = {
    expectedAppliedBaselineCount: 9,
    onlyPendingMigration: MIGRATION_VERSION,
    canonicalPhaseBeforeMigrationAllowed: false,
    productionCommit: runtime.productionCommit,
    productionTree: runtime.productionTree,
    webImageId: runtime.webImageId,
    composeSha256: runtime.composeSha256,
  };
  const request = {
    schemaVersion: "candidate-canonical-rollback-add-schema-request.v1",
    packageId: PACKAGE_ID,
    actionClass: "additive_schema_migration",
    riskTier: "R2_DATABASE_SCHEMA",
    sourceCommit: manifest.sourceCommit,
    sourceTree: manifest.sourceTree,
    contractSha256: manifest.contractSha256,
    runnerArtifactSha256: manifest.runnerArtifactSha256,
    transportArtifactSha256: manifest.transportArtifactSha256,
    bundleSha256,
    migrationFile: MIGRATION_FILE,
    migrationVersion: MIGRATION_VERSION,
    migrationChecksum: MIGRATION_CHECKSUM,
    onlyPendingMigration: MIGRATION_VERSION,
    expectedAppliedBaselineCount: 9,
    expectedAppliedCompletionCount: 10,
    migrationReleaseId: `wp-g0-2-canonical-rollback-safety-${manifest.sourceCommit.slice(0, 12)}`,
    approvalRef: `MR-G0-CANONICAL-ROLLBACK-SAFETY-${manifest.sourceCommit.slice(0, 12).toUpperCase()}-${nonce.toUpperCase()}`,
    approvalIssuedAt: issuedAt.toISOString(),
    approvalExpiresAt: expiresAt.toISOString(),
    lockTimeout: "5s",
    statementTimeout: "30s",
    idleTransactionTimeout: "60s",
    roleBootstrapAllowed: false,
    destructiveSqlAllowed: false,
    businessDataMutationAllowed: false,
    featureFlagMutationAllowed: false,
    serviceMutationAllowed: false,
    sourceSyncAllowed: false,
    ...runtime,
  };
  request.autonomyAuthorization = {
    schemaVersion: "market-radar-package-authorization.v1",
    mode: "g0_g8_standing_user_grant",
    approvedBy: "user_standing_grant",
    grantId: "MR-G0-G8-USER-STANDING-GRANT-20260714-034826",
    approvalId: `MR-G0-CANONICAL-ROLLBACK-SAFETY-${manifest.sourceCommit.slice(0, 12)}-${nonce}`,
    nonce, gate: "G0", packageId: PACKAGE_ID, scope: PACKAGE_ID,
    actionClass: "additive_schema_migration", riskTier: "R2_DATABASE_SCHEMA",
    builderAgentId: "codex-primary", baseCommit: runtime.productionCommit,
    targetCommit: manifest.sourceCommit, targetTree: manifest.sourceTree,
    diffSha256: emptyDiff, pathSetSha256: emptyDiff,
    contractSha256: manifest.contractSha256, runnerSha256: manifest.runnerArtifactSha256,
    artifactSha256: manifest.transportArtifactSha256,
    imageOrMigrationSha256: MIGRATION_CHECKSUM, composeSha256: runtime.composeSha256,
    environmentFingerprintSha256: sha256(canonicalJson({ composeSha256: runtime.composeSha256 })),
    productionIdentitySha256: sha256(canonicalJson({
      productionCommit: runtime.productionCommit, productionTree: runtime.productionTree,
      webImageId: runtime.webImageId,
    })),
    gateEvidenceSha256: manifest.gateEvidenceSha256,
    preflightSha256: sha256(canonicalJson(preflight)),
    backupRestoreEvidenceSha256: sha256(canonicalJson({
      transactionRollback: true, postCommitSchemaRemovalAllowed: false,
    })),
    rollbackTarget: "transaction_rollback_before_commit_only",
    observationContractSha256: sha256(canonicalJson({
      immediateVerification: true, sustainedObservationRequired: false,
    })),
    policySha256: manifest.policySha256, revocationEpoch: 2,
    issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), maxExecutions: 1,
    packageAssertions: {
      additiveSchemaOnly: true, automaticRollback: true, candidateBusinessDataMutation: false,
      databaseMigration: true, environmentMutation: false, phaseTransition: false,
      qualityThresholdChanged: false, secretsPresentInEvidence: false, serviceMutation: false,
    },
  };
  return request;
}

export async function validateApprovalRequest({ bundleSha256, manifest, request, production }) {
  await verifyStagedTransport(process.cwd(), manifest);
  validateRequest(request, { production });
  ensure(request.bundleSha256 === bundleSha256 && request.sourceCommit === manifest.sourceCommit
    && request.sourceTree === manifest.sourceTree
    && request.contractSha256 === manifest.contractSha256
    && request.runnerArtifactSha256 === manifest.runnerArtifactSha256
    && request.transportArtifactSha256 === manifest.transportArtifactSha256,
  "request_transport_binding_invalid");
  for (const key of REQUIRED_PACKAGE_APPROVAL_FIELDS) {
    ensure(request.autonomyAuthorization?.[key] !== undefined
      && request.autonomyAuthorization[key] !== null
      && request.autonomyAuthorization[key] !== "", `authorization_required_field_missing:${key}`);
  }
  return { status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_REQUEST", packageId: PACKAGE_ID };
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1] !== undefined, "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify(await validateLocalPreparation(root), null, 2)}\n`);
    return;
  }
  if (command === "bundle") {
    process.stdout.write(`${JSON.stringify(await buildTransportBundle({ root, output: options.output }), null, 2)}\n`);
    return;
  }
  if (command === "prepare-request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
    ]);
    const request = createProductionRequest({
      bundleSha256: options["bundle-sha256"], manifest,
      nonce: options.nonce ?? randomUUID(), now: options.now ? new Date(options.now) : new Date(), runtime,
    });
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      status: "PASS_CANONICAL_ROLLBACK_ADD_SCHEMA_REQUEST_PREPARED",
      output: resolve(options.output), requestSha256: sha256(`${JSON.stringify(request, null, 2)}\n`),
    })}\n`);
    return;
  }
  if (command === "validate-request") {
    const manifestPath = resolve(options.manifest);
    const [manifest, request] = await Promise.all([
      readFile(manifestPath, "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
    ]);
    const previous = process.cwd();
    process.chdir(dirname(manifestPath));
    try {
      process.stdout.write(`${JSON.stringify(await validateApprovalRequest({
        bundleSha256: options["bundle-sha256"], manifest, request,
        production: options.production === "true",
      }))}\n`);
    } finally {
      process.chdir(previous);
    }
    return;
  }
  throw new Error("command_invalid");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAIL", reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
