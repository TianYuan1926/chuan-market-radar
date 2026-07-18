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

import {
  EVIDENCE_PASS,
  EVIDENCE_SCHEMA,
  PACKAGE_ID,
  PRODUCTION_COMMIT,
  PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  REFERENCE_COMMIT,
  sha256,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);

export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-canonical-compat-code-presence-current-cycle.v1.json";
export const PRODUCTION_ROOT = "/home/ubuntu/apps/chuan-market-radar";
export const BUILD_RECORD_PATH =
  "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-94b6d415573f-98459433/target-images-record.json";
export const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const HASH = /^[0-9a-f]{64}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const MIGRATION = /^candidate-episode-v1-cycle-[1-9][0-9]{0,5}$/u;
const RELEASE = /^candidate-shadow-[a-z0-9][a-z0-9._-]{7,100}$/u;
const STAGING =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-canonical-compat-code-presence-[a-z0-9][a-z0-9-]{15,48}$/u;
const EVIDENCE =
  /^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-canonical-compat-code-presence-[a-z0-9][a-z0-9-]{15,48}$/u;
const UNIT = /^market-radar-canonical-compat-code-presence-[a-z0-9][a-z0-9-]{15,48}$/u;

export const RUNNER_FILES = Object.freeze([
  "scripts/production/candidate-canonical-compat-code-presence/bundle.mjs",
  "scripts/production/candidate-canonical-compat-code-presence/production-entrypoint.sh",
  "scripts/production/candidate-canonical-compat-code-presence/production-runner.sh",
  "scripts/production/candidate-canonical-compat-code-presence/runner.mjs",
]);

export const TRANSPORT_FILES = Object.freeze([CONTRACT_PATH, ...RUNNER_FILES]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

async function git(root, args) {
  return (await execFileAsync("git", args, {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  })).stdout.trimEnd();
}

async function artifact(root, files) {
  const fileSha256 = {};
  ensure(new Set(files).size === files.length, "artifact_files_duplicate");
  for (const file of [...files].sort()) {
    const metadata = await lstat(resolve(root, file));
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      `artifact_not_regular:${file}`);
    fileSha256[file] = sha256(await readFile(resolve(root, file)));
  }
  return {
    fileCount: Object.keys(fileSha256).length,
    fileSha256,
    sha256: sha256(JSON.stringify(fileSha256)),
  };
}

export function validateContract(contract) {
  ensure(contract?.schemaVersion
      === "wp-g0.2-canonical-compat-code-presence-current-cycle.v1"
      && contract.packageId === PACKAGE_ID && contract.gate === "G0"
      && contract.actionClass === "read_only_production_preflight"
      && contract.riskTier === "R0_READ_ONLY",
  "contract_identity_invalid");
  ensure(contract.status === "local_preparation_production_verify_only_not_executed"
      && contract.productionAuthorization === false && contract.productionExecuted === false,
  "contract_production_truth_invalid");
  const identity = contract.identity ?? {};
  ensure(identity.referenceCommit === REFERENCE_COMMIT
      && identity.productionCommit === PRODUCTION_COMMIT
      && identity.productionTree === PRODUCTION_TREE
      && identity.cycleBuildRecordPath === BUILD_RECORD_PATH
      && identity.cycleBuildRecordSchema === "candidate-cycle-target-images.v1"
      && JSON.stringify(identity.referenceCodePaths) === JSON.stringify(REFERENCE_CODE_PATHS),
  "contract_code_identity_invalid");
  const execution = contract.execution ?? {};
  ensure(execution.productionRoot === PRODUCTION_ROOT
      && execution.runner === "transient_systemd_unit" && execution.restart === "no"
      && execution.maximumRequestWindowMinutes === 30 && execution.sessionIndependent === true
      && Array.isArray(execution.servicesAllowed) && execution.servicesAllowed.length === 0
      && execution.sourceSyncAllowed === false && execution.gitMutationAllowed === false
      && execution.imageBuildAllowed === false && execution.containerRecreateAllowed === false
      && execution.databaseMutationAllowed === false && execution.redisMutationAllowed === false
      && execution.workerMutationAllowed === false && execution.environmentMutationAllowed === false
      && execution.composeMutationAllowed === false && execution.phaseTransitionAllowed === false
      && execution.manifestMutationAllowed === false && execution.migrationAllowed === false
      && execution.featureFlagMutationAllowed === false,
  "contract_execution_boundary_invalid");
  const pass = contract.passBoundary ?? {};
  ensure(pass.evidenceSchema === EVIDENCE_SCHEMA && pass.passStatus === EVIDENCE_PASS
      && pass.productionGitCleanDetachedRequired === true
      && pass.allReferenceBlobsMustMatchProduction === true
      && pass.runningWebMustMatchCycleBuildRecord === true
      && pass.shadowVerifyManifestPresentRequired === true
      && pass.shadowVerifyReadFlagsExactRequired === true
      && pass.candidateLifecycleApiLegacyAuthorityRequired === true
      && pass.candidateLifecycleApiParityPassRequired === true
      && pass.productionHealthLevel === "ready" && pass.scanFreshness === "fresh"
      && pass.legacyResponseAuthority === true && pass.requiresWebReleaseOnAnyMismatch === true
      && pass.localBlobComparisonIsProductionPass === false
      && pass.codePresencePassIsPhaseTransitionPass === false,
  "contract_pass_boundary_invalid");
  ensure(JSON.stringify(contract.runnerArtifact?.files) === JSON.stringify(RUNNER_FILES)
      && contract.runnerArtifact?.fileCount === RUNNER_FILES.length
      && (contract.runnerArtifact?.sha256 === "bound_after_implementation"
        || HASH.test(contract.runnerArtifact?.sha256 ?? "")),
  "contract_runner_artifact_invalid");
  return contract;
}

export async function validateLocalPreparation(root = process.cwd()) {
  const contract = validateContract(JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8")));
  const runnerArtifact = await artifact(root, RUNNER_FILES);
  for (const { path, blob } of REFERENCE_CODE_PATHS) {
    const [referenceBlob, productionBlob, currentBlob] = await Promise.all([
      git(root, ["rev-parse", `${REFERENCE_COMMIT}:${path}`]),
      git(root, ["rev-parse", `${PRODUCTION_COMMIT}:${path}`]),
      git(root, ["rev-parse", `HEAD:${path}`]),
    ]);
    ensure(referenceBlob === blob && productionBlob === blob && currentBlob === blob,
      `local_code_identity_mismatch:${path}`);
  }
  ensure(await git(root, ["rev-parse", `${PRODUCTION_COMMIT}^{tree}`]) === PRODUCTION_TREE,
    "production_tree_mismatch");
  if (contract.runnerArtifact.sha256 !== "bound_after_implementation") {
    ensure(contract.runnerArtifact.sha256 === runnerArtifact.sha256,
      "runner_artifact_hash_mismatch");
  }
  return {
    status: "PASS_LOCAL_CANONICAL_COMPAT_CODE_PRESENCE_PREPARATION",
    productionMutationAllowed: false,
    productionExecuted: false,
    referenceCommit: REFERENCE_COMMIT,
    productionCommit: PRODUCTION_COMMIT,
    codePathCount: REFERENCE_CODE_PATHS.length,
    runnerArtifactSha256: runnerArtifact.sha256,
    contractSha256: sha256(await readFile(resolve(root, CONTRACT_PATH))),
  };
}

export async function validateTransportManifest(manifest, root) {
  ensure(manifest?.schemaVersion === "wp-g0.2-canonical-compat-code-presence-transport.v1"
      && manifest.packageId === PACKAGE_ID
      && COMMIT.test(manifest.sourceCommit ?? "") && COMMIT.test(manifest.sourceTree ?? "")
      && COMMIT.test(manifest.sourceParentCommit ?? "")
      && manifest.referenceCommit === REFERENCE_COMMIT
      && manifest.productionCommit === PRODUCTION_COMMIT
      && manifest.productionTree === PRODUCTION_TREE
      && JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort())
      && manifest.sourceDateEpoch === SOURCE_DATE_EPOCH
      && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.reproducibleArchive === true && manifest.containsSecrets === false
      && Array.isArray(manifest.services) && manifest.services.length === 0
      && manifest.productionMutationAllowed === false,
  "transport_manifest_identity_invalid");
  const transport = await artifact(root, TRANSPORT_FILES);
  const runners = await artifact(root, RUNNER_FILES);
  ensure(JSON.stringify(manifest.fileSha256) === JSON.stringify(transport.fileSha256)
      && manifest.contractSha256 === transport.fileSha256[CONTRACT_PATH]
      && manifest.runnerArtifactSha256 === runners.sha256,
  "transport_manifest_file_hash_mismatch");
  return manifest;
}

export async function currentSourceIdentity(root = process.cwd()) {
  const [sourceCommit, sourceTree, sourceParentCommit, status] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["rev-parse", "HEAD^{tree}"]),
    git(root, ["rev-parse", "HEAD^"]),
    git(root, ["status", "--porcelain"]),
  ]);
  ensure(status === "", "source_worktree_dirty");
  return { sourceCommit, sourceTree, sourceParentCommit };
}

export function createProductionVerificationRequest({
  bundleSha256, manifest, nonce = randomUUID(), now = new Date(), runtime,
}) {
  ensure(HASH.test(bundleSha256 ?? "") && COMMIT.test(manifest?.sourceCommit ?? "")
      && COMMIT.test(manifest?.sourceTree ?? "") && COMMIT.test(manifest?.sourceParentCommit ?? ""),
  "request_source_identity_invalid");
  ensure(exactKeys(runtime, [
    "authorityEpoch", "buildRecordSha256", "buildRecordWebImageId", "currentWebContainerId",
    "currentWebImageId", "healthLevel", "manifestSha256", "migrationId", "releaseId",
    "scanFreshness",
  ]), "request_runtime_shape_invalid");
  ensure(HASH.test(runtime.buildRecordSha256 ?? "")
      && IMAGE.test(runtime.buildRecordWebImageId ?? "")
      && CONTAINER.test(runtime.currentWebContainerId ?? "")
      && IMAGE.test(runtime.currentWebImageId ?? "")
      && runtime.buildRecordWebImageId === runtime.currentWebImageId
      && MIGRATION.test(runtime.migrationId ?? "") && RELEASE.test(runtime.releaseId ?? "")
      && Number.isSafeInteger(runtime.authorityEpoch) && runtime.authorityEpoch > 0
      && HASH.test(runtime.manifestSha256 ?? "")
      && runtime.healthLevel === "ready" && runtime.scanFreshness === "fresh",
  "request_runtime_identity_invalid");
  const issuedAt = new Date(now);
  ensure(Number.isFinite(issuedAt.getTime()), "request_time_invalid");
  const expiresAt = new Date(issuedAt.getTime() + 30 * 60_000);
  const suffix = `${manifest.sourceCommit.slice(0, 12)}-${nonce.replaceAll("-", "").slice(0, 8)}`;
  return {
    schemaVersion: "wp-g0.2-canonical-compat-code-presence-request.v1",
    packageId: PACKAGE_ID,
    productionRoot: PRODUCTION_ROOT,
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    referenceCommit: REFERENCE_COMMIT,
    referenceCodePaths: REFERENCE_CODE_PATHS,
    buildRecordPath: BUILD_RECORD_PATH,
    migrationId: runtime.migrationId,
    releaseId: runtime.releaseId,
    authorityEpoch: runtime.authorityEpoch,
    manifestSha256: runtime.manifestSha256,
    runnerSourceCommit: manifest.sourceCommit,
    runnerSourceTree: manifest.sourceTree,
    runnerSourceParentCommit: manifest.sourceParentCommit,
    runnerArtifactSha256: manifest.runnerArtifactSha256,
    contractSha256: manifest.contractSha256,
    transportBundleSha256: bundleSha256,
    stagingDirectory:
      `/home/ubuntu/.cache/market-radar-ops/wp-g0-2-canonical-compat-code-presence-${suffix}`,
    evidenceDirectory:
      `/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-canonical-compat-code-presence-${suffix}`,
    runnerUnitName:
      `market-radar-canonical-compat-code-presence-${manifest.sourceCommit.slice(0, 7)}-${nonce.replaceAll("-", "").slice(0, 8)}`,
    services: [],
    operator: "codex-primary",
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...runtime,
  };
}

export function validateProductionVerificationRequest(request, manifest, {
  now = new Date(), bundleSha256,
} = {}) {
  ensure(request?.schemaVersion === "wp-g0.2-canonical-compat-code-presence-request.v1"
      && request.packageId === PACKAGE_ID && request.productionRoot === PRODUCTION_ROOT
      && request.productionCommit === PRODUCTION_COMMIT
      && request.productionTree === PRODUCTION_TREE && request.referenceCommit === REFERENCE_COMMIT
      && JSON.stringify(request.referenceCodePaths) === JSON.stringify(REFERENCE_CODE_PATHS)
      && request.buildRecordPath === BUILD_RECORD_PATH,
  "request_identity_invalid");
  ensure(request.runnerSourceCommit === manifest.sourceCommit
      && request.runnerSourceTree === manifest.sourceTree
      && request.runnerSourceParentCommit === manifest.sourceParentCommit
      && request.runnerArtifactSha256 === manifest.runnerArtifactSha256
      && request.contractSha256 === manifest.contractSha256
      && request.transportBundleSha256 === bundleSha256,
  "request_transport_binding_invalid");
  ensure(STAGING.test(request.stagingDirectory ?? "")
      && EVIDENCE.test(request.evidenceDirectory ?? "")
      && UNIT.test(request.runnerUnitName ?? "")
      && Array.isArray(request.services) && request.services.length === 0,
  "request_execution_boundary_invalid");
  ensure(HASH.test(request.buildRecordSha256 ?? "")
      && IMAGE.test(request.buildRecordWebImageId ?? "")
      && CONTAINER.test(request.currentWebContainerId ?? "")
      && IMAGE.test(request.currentWebImageId ?? "")
      && request.buildRecordWebImageId === request.currentWebImageId
      && MIGRATION.test(request.migrationId ?? "") && RELEASE.test(request.releaseId ?? "")
      && Number.isSafeInteger(request.authorityEpoch) && request.authorityEpoch > 0
      && HASH.test(request.manifestSha256 ?? "")
      && request.healthLevel === "ready" && request.scanFreshness === "fresh",
  "request_runtime_invalid");
  const issued = Date.parse(request.issuedAt);
  const expires = Date.parse(request.expiresAt);
  const current = now instanceof Date ? now.getTime() : Number(now);
  ensure(Number.isFinite(issued) && Number.isFinite(expires) && current >= issued && current < expires
      && expires - issued === 30 * 60_000, "request_window_invalid");
  return { status: "PASS_CANONICAL_COMPAT_CODE_PRESENCE_REQUEST", productionMutationAllowed: false };
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity,
} = {}) {
  const local = await validateLocalPreparation(root);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-canonical-compat-code-presence-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const transport = await artifact(root, TRANSPORT_FILES);
    const manifest = {
      schemaVersion: "wp-g0.2-canonical-compat-code-presence-transport.v1",
      packageId: PACKAGE_ID,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      referenceCommit: REFERENCE_COMMIT,
      productionCommit: PRODUCTION_COMMIT,
      productionTree: PRODUCTION_TREE,
      contractSha256: local.contractSha256,
      runnerArtifactSha256: local.runnerArtifactSha256,
      fileSha256: transport.fileSha256,
      files: [...TRANSPORT_FILES].sort(),
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      containsSecrets: false,
      services: [],
      productionMutationAllowed: false,
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
      "reports/wp-g0-2-current-cycle-canonical-compat-dependency-refresh-and-automatic-handoff",
      `canonical-compat-code-presence-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: "PASS_CANONICAL_COMPAT_CODE_PRESENCE_TRANSPORT",
      output: outputPath,
      sha256: sha256(bytes),
      size: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const [command = "validate", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
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
  if (command === "validate-request") {
    const manifestPath = resolve(options.manifest);
    const [manifest, request] = await Promise.all([
      readFile(manifestPath, "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
    ]);
    await validateTransportManifest(manifest, dirname(manifestPath));
    process.stdout.write(`${JSON.stringify(validateProductionVerificationRequest(
      request, manifest, { bundleSha256: options.bundle, now: new Date(options.now ?? Date.now()) },
    ), null, 2)}\n`);
    return;
  }
  throw new Error(`unsupported_command:${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
