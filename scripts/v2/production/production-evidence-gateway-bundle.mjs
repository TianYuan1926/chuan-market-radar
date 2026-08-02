#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createPublicKey } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { writeDeterministicUstar } from "../lib/deterministic-ustar.mjs";
import {
  DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY,
  PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE,
  PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT,
  PRODUCTION_EVIDENCE_GATEWAY_MANIFEST,
  PRODUCTION_EVIDENCE_GATEWAY_MANIFEST_SCHEMA,
  PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE,
  PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
  PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT,
  PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY,
  PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
  PRODUCTION_EVIDENCE_GATEWAY_REQUEST_SCHEMA,
  PRODUCTION_EVIDENCE_GATEWAY_RUNTIME_MAX_SECONDS,
  PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES,
  PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER,
  readBoundedProductionEvidenceGatewayFile,
  validateProductionEvidenceGatewayRecurrenceAuthority,
  validateProductionEvidenceGatewayRequest,
} from "./production-evidence-gateway.mjs";
import { canonicalJson, sha256 } from "./fixed-channel/production-dispatch.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const APPROVAL_KEYS = Object.freeze([
  "composeIdentityWrapperSha256",
  "dispatchId",
  "expiresAt",
  "expectedContainerIds",
  "expectedProductionHead",
  "issuedAt",
  "revocationEpoch",
  "runnerUnitName",
  "runtimeIdentityOverrideSha256",
  "sourceRef",
]);
function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected, reason) {
  ensure(value && typeof value === "object" && !Array.isArray(value), reason);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  ensure(
    actual.length === wanted.length
      && actual.every((key, index) => key === wanted[index]),
    reason,
  );
}

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

async function committedFile(root, commit, path) {
  const { stdout } = await execFileAsync("git", [
    "-C", root, "show", `${commit}:${path}`,
  ], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function writePayloadFile(payloadRoot, path, bytes, mode) {
  const target = join(payloadRoot, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

function recipientKeySha256(bytes) {
  let key;
  try {
    key = createPublicKey(bytes);
  } catch {
    throw new Error("evidence_gateway_recipient_key_invalid");
  }
  ensure(key.asymmetricKeyType === "x25519", "evidence_gateway_recipient_key_invalid");
  return sha256(key.export({ format: "der", type: "spki" }));
}

export async function buildProductionEvidenceGatewayBundle({
  approval,
  outputDirectory,
  policy = DEFAULT_PRODUCTION_EVIDENCE_GATEWAY_POLICY,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
}) {
  exactKeys(approval, APPROVAL_KEYS, "evidence_gateway_approval_keys_invalid");
  const repository = resolve(root);
  const output = resolve(outputDirectory);
  ensure(output !== repository && !output.startsWith(`${repository}${sep}`),
    "evidence_gateway_output_inside_worktree");
  if (verifySourceBinding) {
    ensure(await git(repository, ["rev-parse", `${sourceCommit}^{commit}`]) === sourceCommit,
      "evidence_gateway_source_commit_invalid");
    ensure(await git(repository, ["rev-parse", `${sourceCommit}^{tree}`]) === sourceTree,
      "evidence_gateway_source_tree_invalid");
    ensure(await git(repository, ["rev-parse", `${approval.expectedProductionHead}^{commit}`])
      === approval.expectedProductionHead, "evidence_gateway_production_head_unavailable");
  }
  const sourceFiles = {};
  for (const path of PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES) {
    sourceFiles[path] = verifySourceBinding
      ? await committedFile(repository, sourceCommit, path)
      : await readFile(join(repository, path));
  }
  const baselineCaddyfile = verifySourceBinding
    ? await committedFile(repository, approval.expectedProductionHead, "deploy/caddy/Caddyfile")
    : await readFile(join(repository, ".test-production-baseline/deploy/caddy/Caddyfile"));
  const baselineCompose = verifySourceBinding
    ? await committedFile(repository, approval.expectedProductionHead, "docker-compose.yml")
    : await readFile(join(repository, ".test-production-baseline/docker-compose.yml"));
  const manifest = {
    archiveFormat: "ustar+gzip-n",
    containsSecrets: false,
    files: Object.fromEntries(
      Object.entries(sourceFiles).map(([path, bytes]) => [path, sha256(bytes)]),
    ),
    mutationScope: "caddy_container_and_evidence_gateway_state_only",
    packageId: PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
    schemaVersion: PRODUCTION_EVIDENCE_GATEWAY_MANIFEST_SCHEMA,
    sourceCommit,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
    sourceTree,
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  const temporary = await mkdtemp(join(tmpdir(), "production-evidence-gateway-bundle-"));
  const payload = join(temporary, "payload");
  try {
    await mkdir(payload, { recursive: true, mode: 0o700 });
    for (const path of PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES) {
      await writePayloadFile(
        payload,
        path,
        sourceFiles[path],
        path === PRODUCTION_EVIDENCE_GATEWAY_ENTRYPOINT ? 0o700 : 0o600,
      );
    }
    await writePayloadFile(
      payload,
      PRODUCTION_EVIDENCE_GATEWAY_MANIFEST,
      manifestBytes,
      0o600,
    );
    const archivePath = join(temporary, "payload.tar");
    await writeDeterministicUstar({
      archivePath,
      entries: [
        PRODUCTION_EVIDENCE_GATEWAY_MANIFEST,
        ...PRODUCTION_EVIDENCE_GATEWAY_SOURCE_FILES,
      ].sort(),
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    const { stdout: compressed } = await execFileAsync(
      "gzip",
      ["-n", "-9", "-c", archivePath],
      { encoding: null, maxBuffer: 32 * 1024 * 1024 },
    );
    ensure(Buffer.isBuffer(compressed), "evidence_gateway_archive_invalid");
    const transportBundleSha256 = sha256(compressed);
    const recipientBytes = sourceFiles[PRODUCTION_EVIDENCE_GATEWAY_RECIPIENT];
    const request = {
      approvalExpiresAt: approval.expiresAt,
      approvalIssuedAt: approval.issuedAt,
      artifactManifestSha256: sha256(manifestBytes),
      automaticRollbackRequired: true,
      caddyContainerName: policy.caddyContainerName,
      caddyMutationAllowed: true,
      composeIdentityWrapper: policy.composeIdentityWrapper,
      composeIdentityWrapperSha256: approval.composeIdentityWrapperSha256,
      composeProjectName: policy.composeProjectName,
      databaseMutationAllowed: false,
      dispatchId: approval.dispatchId,
      dispatchRuntimeMaxSeconds: PRODUCTION_EVIDENCE_GATEWAY_RUNTIME_MAX_SECONDS,
      dispatchStateRoot: policy.dispatchStateRoot,
      envMutationAllowed: false,
      evidenceOutboxRoot: policy.outboxRoot,
      evidenceRecipientFileSha256: sha256(recipientBytes),
      evidenceRecipientFingerprintSha256: recipientKeySha256(recipientBytes),
      evidenceSignerKeyPath: policy.evidenceSignerKeyPath,
      evidenceSignerPublicKeyFingerprint:
        policy.evidenceSignerPublicKeyFingerprint,
      expectedBaselineCaddyfileSha256: sha256(baselineCaddyfile),
      expectedBaselineComposeSha256: sha256(baselineCompose),
      expectedContainerCount: approval.expectedContainerIds.length,
      expectedContainerIds: [...approval.expectedContainerIds].sort(),
      expectedHealth: {
        level: "ready",
        persistenceDatabaseStatus: "ready",
        scanFreshness: "fresh",
        scanStatus: "ready",
      },
      expectedProductionHead: approval.expectedProductionHead,
      expectedTargetCaddyfileSha256:
        sha256(sourceFiles[PRODUCTION_EVIDENCE_GATEWAY_CADDYFILE]),
      expectedTargetComposeOverrideSha256:
        sha256(sourceFiles[PRODUCTION_EVIDENCE_GATEWAY_OVERRIDE]),
      featureFlagMutationAllowed: false,
      gatewayRoot: policy.gatewayRoot,
      launchSuccessMarker: PRODUCTION_EVIDENCE_GATEWAY_SUCCESS_MARKER,
      maxExecutions: 1,
      migrationAllowed: false,
      packageId: PRODUCTION_EVIDENCE_GATEWAY_PACKAGE_ID,
      productionMutationScope: "caddy_container_and_evidence_gateway_state_only",
      productionRepositoryMutationAllowed: false,
      productionWorktree: policy.productionWorktree,
      redisMutationAllowed: false,
      recurrenceRegistrySha256: sha256(
        sourceFiles[PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY],
      ),
      recurrenceRemediationOperation:
        PRODUCTION_EVIDENCE_GATEWAY_REMEDIATION_OPERATION,
      revocationEpoch: approval.revocationEpoch,
      runnerUnitName: approval.runnerUnitName,
      runtimeIdentityOverride: policy.runtimeIdentityOverride,
      runtimeIdentityOverrideSha256: approval.runtimeIdentityOverrideSha256,
      schemaVersion: PRODUCTION_EVIDENCE_GATEWAY_REQUEST_SCHEMA,
      sessionIndependentExecutionRequired: true,
      sourceCommit,
      sourceRef: approval.sourceRef,
      sourceTree,
      stagingDirectory: join(
        policy.stagingRoot,
        `${policy.stagingPrefix}${approval.dispatchId}`,
      ),
      temporaryStagingCleanupRequired: true,
      trafficMutationScope: "high_entropy_encrypted_evidence_get_head_route_only",
      transportBundleSha256,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
      workerMutationAllowed: false,
    };
    validateProductionEvidenceGatewayRequest(request, {
      now: new Date(approval.issuedAt),
      policy,
    });
    validateProductionEvidenceGatewayRecurrenceAuthority(
      request,
      sourceFiles[PRODUCTION_EVIDENCE_GATEWAY_RECURRENCE_REGISTRY],
    );
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "bundle.tar.gz"), compressed, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(join(output, "approval-request.json"), canonicalJson(request), {
      flag: "wx",
      mode: 0o600,
    });
    const result = {
      approvalRequestSha256: sha256(canonicalJson(request)),
      artifactManifestSha256: request.artifactManifestSha256,
      bundleBytes: compressed.length,
      bundleSha256: transportBundleSha256,
      containsSecrets: false,
      dispatchId: request.dispatchId,
      expectedProductionHead: request.expectedProductionHead,
      outputDirectory: output,
      packageId: request.packageId,
      sourceCommit,
      sourceTree,
      status: "PASS_PRODUCTION_EVIDENCE_GATEWAY_BUNDLE_BUILT",
    };
    await writeFile(join(output, "build-result.json"), canonicalJson(result), {
      flag: "wx",
      mode: 0o600,
    });
    return { request, result };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function readCanonicalApproval(path) {
  const bytes = await readBoundedProductionEvidenceGatewayFile(
    resolve(path),
    512 * 1024,
    "evidence_gateway_approval_file_invalid",
    0o600,
  );
  let approval;
  try {
    approval = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("evidence_gateway_approval_file_invalid");
  }
  ensure(canonicalJson(approval) === bytes.toString("utf8"),
    "evidence_gateway_approval_file_not_canonical");
  return approval;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  ensure(rest.length % 2 === 0, "evidence_gateway_bundle_arguments_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    ensure(
      /^--[a-z][a-z-]*$/u.test(key ?? "")
        && typeof value === "string"
        && !value.startsWith("--")
        && options[key.slice(2)] === undefined,
      "evidence_gateway_bundle_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requiredOption(options, key) {
  ensure(typeof options[key] === "string" && options[key].length > 0,
    `evidence_gateway_bundle_option_missing:${key}`);
  return options[key];
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  ensure(
    command === "build"
      && Object.keys(options).every((key) => [
        "approval", "output", "root", "source-commit", "source-tree",
      ].includes(key)),
    "evidence_gateway_bundle_command_invalid",
  );
  const built = await buildProductionEvidenceGatewayBundle({
    approval: await readCanonicalApproval(requiredOption(options, "approval")),
    outputDirectory: requiredOption(options, "output"),
    root: options.root ?? process.cwd(),
    sourceCommit: requiredOption(options, "source-commit"),
    sourceTree: requiredOption(options, "source-tree"),
  });
  process.stdout.write(canonicalJson(built.result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      reason: error instanceof Error ? error.message : "unexpected_error",
      status: "BLOCKED",
    }));
    process.exitCode = 1;
  });
}
