#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  readDeterministicUstar,
  writeDeterministicUstar,
} from "../lib/deterministic-ustar.mjs";
import {
  DEFAULT_P0R_REBIND_POLICY,
  P0R_REBIND_CURRENT_RUNTIME_FILES,
  P0R_REBIND_DISPATCH_RUNTIME_MAX_SECONDS,
  P0R_REBIND_ENTRYPOINT,
  P0R_REBIND_FORBIDDEN_LISTENER_PORT,
  P0R_REBIND_FORBIDDEN_LISTENER_UNIT,
  P0R_REBIND_LEGACY_SUPERSESSION_FILES,
  P0R_REBIND_MANIFEST,
  P0R_REBIND_MANIFEST_SCHEMA,
  P0R_REBIND_METADATA_ENDPOINT,
  P0R_REBIND_PACKAGE_ID,
  P0R_REBIND_PACKAGE_SOURCE_FILES,
  P0R_REBIND_REQUEST_SCHEMA,
  P0R_REBIND_SUCCESS_MARKER,
  canonicalJson,
  sha256,
  validateP0RRebindRequest,
} from "./m1-p0r-rebind-preflight.mjs";

const execFileAsync = promisify(execFile);
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const MAXIMUM_LEGACY_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_LEGACY_ARCHIVE_BYTES = 128 * 1024 * 1024;

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  return typeof stdout === "string" ? stdout.trim() : stdout;
}

async function committedFile(root, sourceCommit, path) {
  const { stdout } = await execFileAsync("git", [
    "-C",
    root,
    "show",
    `${sourceCommit}:${path}`,
  ], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

async function writePayloadFile(payloadRoot, path, bytes, mode) {
  const target = join(payloadRoot, path);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { flag: "wx", mode });
  await chmod(target, mode);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

async function readRestrictedLegacyBundle(
  path,
  expectedBundleSha256,
) {
  const target = resolve(path);
  let handle;
  try {
    handle = await open(
      target,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const facts = await handle.stat();
    ensure(
      facts.isFile() &&
        (facts.mode & 0o077) === 0 &&
        facts.size > 0 &&
        facts.size <= MAXIMUM_LEGACY_BUNDLE_BYTES,
      "p0r_rebind_legacy_bundle_unsafe",
    );
    const bundleBytes = await handle.readFile();
    ensure(
      bundleBytes.length <= MAXIMUM_LEGACY_BUNDLE_BYTES &&
        sha256(bundleBytes) === expectedBundleSha256,
      "p0r_rebind_legacy_bundle_sha256_mismatch",
    );
    let archiveBytes;
    try {
      archiveBytes = gunzipSync(bundleBytes, {
        maxOutputLength: MAXIMUM_LEGACY_ARCHIVE_BYTES,
      });
    } catch {
      throw new Error("p0r_rebind_legacy_bundle_gzip_invalid");
    }
    const temporary = await mkdtemp(join(tmpdir(), "p0r-rebind-legacy-"));
    try {
      const archivePath = join(temporary, "legacy.tar");
      await writeFile(archivePath, archiveBytes, {
        flag: "wx",
        mode: 0o600,
      });
      const parsed = await readDeterministicUstar({
        archivePath,
        maxArchiveBytes: MAXIMUM_LEGACY_ARCHIVE_BYTES,
        maxEntries: 32,
      });
      const entries = Object.fromEntries(
        parsed.entries.map((entry) => [entry.entry, entry.bytes]),
      );
      const expectedNames = [
        "AGE-LICENSE",
        "age",
        "age-recipient.txt",
        "cos-provisioning-plan.json",
        "m1-production-storage-backup-capture.mjs",
        "m1-production-storage-database-fingerprint.mjs",
        "m1-production-storage-p0r-cos-provisioning.mjs",
        "m1-production-storage-p0r-runner.sh",
        "m1-production-storage-read-only-preflight.mjs",
        "m1-production-storage-recovery-evidence.mjs",
        "p0r-bindings.env",
        "p0r-cos-archive",
        "transport-manifest.json",
      ].sort();
      ensure(
        JSON.stringify(Object.keys(entries).sort()) ===
          JSON.stringify(expectedNames),
        "p0r_rebind_legacy_bundle_file_set_invalid",
      );
      let manifest;
      let plan;
      try {
        manifest = JSON.parse(entries["transport-manifest.json"].toString("utf8"));
        plan = JSON.parse(entries["cos-provisioning-plan.json"].toString("utf8"));
      } catch {
        throw new Error("p0r_rebind_legacy_bundle_json_invalid");
      }
      ensure(
        manifest.schemaVersion ===
          "v2-m1-production-storage-p0r-transport.v1" &&
          manifest.reproducibleArchive === true &&
          manifest.containsSecrets === false &&
          manifest.containsPersistentCredentials === false &&
          manifest.containsPrivateKey === false &&
          manifest.productionDatabaseMutationAllowed === false &&
          manifest.productionRepositoryMutationAllowed === false &&
          manifest.productionServiceMutationAllowed === false,
        "p0r_rebind_legacy_bundle_manifest_boundary_invalid",
      );
      ensure(
        Array.isArray(manifest.files) &&
          manifest.files.length === expectedNames.length - 1,
        "p0r_rebind_legacy_bundle_manifest_files_invalid",
      );
      const observedManifestNames = [];
      for (const item of manifest.files) {
        ensure(
          item &&
            typeof item === "object" &&
            typeof item.name === "string" &&
            item.name !== "transport-manifest.json" &&
            entries[item.name] !== undefined &&
            typeof item.sha256 === "string" &&
            typeof item.sizeBytes === "number" &&
            item.sha256 === sha256(entries[item.name]) &&
            item.sizeBytes === entries[item.name].length,
          "p0r_rebind_legacy_bundle_manifest_file_mismatch",
        );
        observedManifestNames.push(item.name);
      }
      ensure(
        JSON.stringify(observedManifestNames.sort()) ===
          JSON.stringify(
            expectedNames.filter((name) => name !== "transport-manifest.json"),
          ),
        "p0r_rebind_legacy_bundle_manifest_file_set_mismatch",
      );
      ensure(
        plan.schemaVersion ===
          "v2-m1-production-storage-cos-provisioning-plan.v2" &&
          plan.sourceCommit === manifest.sourceCommit &&
          typeof plan.credentialGrant?.runId === "string" &&
          typeof plan.credentialGrant?.sourceIpCidr === "string" &&
          typeof plan.planDigest === "string",
        "p0r_rebind_legacy_bundle_plan_binding_invalid",
      );
      return {
        bindingsSha256: sha256(entries["p0r-bindings.env"]),
        bundleSha256: expectedBundleSha256,
        manifestSha256: sha256(entries["transport-manifest.json"]),
        planDigest: plan.planDigest,
        planSha256: sha256(entries["cos-provisioning-plan.json"]),
        runId: plan.credentialGrant.runId,
        sourceCommit: manifest.sourceCommit,
        sourceIpCidrSha256: sha256(plan.credentialGrant.sourceIpCidr),
      };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } finally {
    await handle?.close();
  }
}

export async function buildP0RRebindBundle({
  approval,
  expectedLegacyBundleSha256,
  legacyBundlePath,
  outputDirectory,
  root = process.cwd(),
  sourceCommit,
  sourceTree,
  verifySourceBinding = true,
}) {
  const repository = resolve(root);
  const output = resolve(outputDirectory);
  ensure(
    output !== repository && !output.startsWith(`${repository}${sep}`),
    "p0r_rebind_output_inside_worktree",
  );
  if (verifySourceBinding) {
    await execFileAsync(
      "git",
      ["-C", repository, "cat-file", "-e", `${sourceCommit}^{commit}`],
    );
  }
  const legacy = await readRestrictedLegacyBundle(
    legacyBundlePath,
    expectedLegacyBundleSha256,
  );
  const sourceFiles = {};
  for (const path of P0R_REBIND_PACKAGE_SOURCE_FILES) {
    sourceFiles[path] = verifySourceBinding
      ? await committedFile(repository, sourceCommit, path)
      : await readFile(join(repository, path));
  }
  const currentLegacySupersessionFileDigests = {};
  for (const name of P0R_REBIND_LEGACY_SUPERSESSION_FILES) {
    const path = `scripts/v2/production/${name}`;
    currentLegacySupersessionFileDigests[name] = sha256(
      verifySourceBinding
        ? await committedFile(repository, sourceCommit, path)
        : await readFile(join(repository, path)),
    );
  }
  const currentP0RRuntimeFileDigests = {};
  for (const name of P0R_REBIND_CURRENT_RUNTIME_FILES) {
    const path = `scripts/v2/production/${name}`;
    currentP0RRuntimeFileDigests[name] = sha256(
      verifySourceBinding
        ? await committedFile(repository, sourceCommit, path)
        : await readFile(join(repository, path)),
    );
  }
  const manifest = {
    archiveFormat: "ustar+gzip-n",
    containsSecrets: false,
    files: Object.fromEntries(
      Object.entries(sourceFiles).map(([path, bytes]) => [path, sha256(bytes)]),
    ),
    mutationScope: "dispatch_staging_and_sanitized_evidence_only",
    packageId: P0R_REBIND_PACKAGE_ID,
    schemaVersion: P0R_REBIND_MANIFEST_SCHEMA,
    sourceCommit,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
    sourceTree,
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest));
  const temporary = await mkdtemp(join(tmpdir(), "p0r-rebind-bundle-"));
  const payload = join(temporary, "payload");
  try {
    await mkdir(payload, { recursive: true, mode: 0o700 });
    for (const path of P0R_REBIND_PACKAGE_SOURCE_FILES) {
      await writePayloadFile(
        payload,
        path,
        sourceFiles[path],
        path === P0R_REBIND_ENTRYPOINT ? 0o700 : 0o600,
      );
    }
    await writePayloadFile(
      payload,
      P0R_REBIND_MANIFEST,
      manifestBytes,
      0o600,
    );
    const archivePath = join(temporary, "payload.tar");
    await writeDeterministicUstar({
      archivePath,
      entries: [P0R_REBIND_MANIFEST, ...P0R_REBIND_PACKAGE_SOURCE_FILES].sort(),
      root: payload,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
    });
    const { stdout: compressed } = await execFileAsync(
      "gzip",
      ["-n", "-9", "-c", archivePath],
      {
        encoding: null,
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    ensure(Buffer.isBuffer(compressed), "p0r_rebind_archive_not_binary");
    const transportBundleSha256 = sha256(compressed);
    const stagingDirectory = join(
      DEFAULT_P0R_REBIND_POLICY.stagingRoot,
      `${DEFAULT_P0R_REBIND_POLICY.stagingPrefix}${approval.dispatchId}`,
    );
    const request = {
      applicationMutationAllowed: false,
      approvalExpiresAt: approval.expiresAt,
      approvalIssuedAt: approval.issuedAt,
      artifactManifestSha256: sha256(manifestBytes),
      automaticRollbackRequired: true,
      currentLegacySupersessionFileDigests,
      currentP0RRuntimeFileDigests,
      databaseMutationAllowed: false,
      dispatchId: approval.dispatchId,
      dispatchRuntimeMaxSeconds:
        P0R_REBIND_DISPATCH_RUNTIME_MAX_SECONDS,
      dispatchStateRoot: DEFAULT_P0R_REBIND_POLICY.dispatchStateRoot,
      expectedContainerCount: approval.expectedContainerIds.length,
      expectedContainerIds: [...approval.expectedContainerIds].sort(),
      expectedHealth: {
        level: "ready",
        persistenceDatabaseStatus: "ready",
        scanFreshness: "fresh",
        scanStatus: "ready",
      },
      expectedLegacyBindingsSha256: legacy.bindingsSha256,
      expectedLegacyBundleSha256: legacy.bundleSha256,
      expectedLegacyPlanDigest: legacy.planDigest,
      expectedLegacyPlanSha256: legacy.planSha256,
      expectedLegacyRunId: legacy.runId,
      expectedLegacySourceCommit: legacy.sourceCommit,
      expectedLegacyTransportManifestSha256: legacy.manifestSha256,
      expectedProductionHead: approval.expectedProductionHead,
      expectedSourceIpCidrSha256: legacy.sourceIpCidrSha256,
      expectedTimerUnit: DEFAULT_P0R_REBIND_POLICY.expectedTimerUnit,
      forbiddenListenerPort: P0R_REBIND_FORBIDDEN_LISTENER_PORT,
      forbiddenListenerUnit: P0R_REBIND_FORBIDDEN_LISTENER_UNIT,
      launchSuccessMarker: P0R_REBIND_SUCCESS_MARKER,
      legacyStagingDirectory: join(
        DEFAULT_P0R_REBIND_POLICY.p0rStagingRoot,
        legacy.runId,
      ),
      maxExecutions: 1,
      metadataEndpoint: P0R_REBIND_METADATA_ENDPOINT,
      packageId: P0R_REBIND_PACKAGE_ID,
      productionMutationScope:
        "dispatch_staging_and_sanitized_evidence_only",
      productionWorktree: DEFAULT_P0R_REBIND_POLICY.productionWorktree,
      redisMutationAllowed: false,
      resultPath: join(
        DEFAULT_P0R_REBIND_POLICY.evidenceRoot,
        `${approval.dispatchId}.result.json`,
      ),
      revocationEpoch: approval.revocationEpoch,
      runnerUnitName: approval.runnerUnitName,
      schemaVersion: P0R_REBIND_REQUEST_SCHEMA,
      sessionIndependentExecutionRequired: true,
      sourceCommit,
      sourceRef: approval.sourceRef,
      sourceTree,
      stagingDirectory,
      temporaryStagingCleanupRequired: true,
      transportBundleSha256,
      transportContainsSecrets: false,
      transportMethod: "signed_git_bundle",
      workerMutationAllowed: false,
    };
    validateP0RRebindRequest(request, {
      now: new Date(approval.issuedAt),
    });
    await mkdir(output, { mode: 0o700 });
    await writeFile(join(output, "bundle.tar.gz"), compressed, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      join(output, "approval-request.json"),
      canonicalJson(request),
      { flag: "wx", mode: 0o600 },
    );
    const result = {
      approvalRequestSha256: sha256(canonicalJson(request)),
      artifactManifestSha256: request.artifactManifestSha256,
      bundleBytes: compressed.length,
      bundleSha256: transportBundleSha256,
      containsRestrictedDestinationMetadata: false,
      containsSecrets: false,
      dispatchId: approval.dispatchId,
      expectedLegacyBundleSha256: legacy.bundleSha256,
      expectedLegacyRunId: legacy.runId,
      expectedLegacySourceCommit: legacy.sourceCommit,
      expectedSourceIpCidrSha256: legacy.sourceIpCidrSha256,
      outputDirectory: output,
      packageId: P0R_REBIND_PACKAGE_ID,
      sourceCommit,
      sourceTree,
      status: "PASS_P0R_READ_ONLY_REBIND_BUNDLE_BUILT",
    };
    await writeFile(
      join(output, "build-result.json"),
      canonicalJson(result),
      { flag: "wx", mode: 0o600 },
    );
    return { request, result };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function parseP0RRebindBundleArguments(argv) {
  ensure(argv.length % 2 === 0, "p0r_rebind_bundle_arguments_invalid");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    ensure(
      /^--[a-z][a-z0-9-]*$/u.test(key ?? "") &&
        typeof value === "string" &&
        !value.startsWith("--") &&
        options[key.slice(2)] === undefined,
      "p0r_rebind_bundle_arguments_invalid",
    );
    options[key.slice(2)] = value;
  }
  return options;
}

async function main() {
  const options = parseP0RRebindBundleArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const sourceCommit = await git(root, ["rev-parse", "HEAD"]);
  const sourceTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  ensure(
    (await git(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])).length === 0,
    "p0r_rebind_source_worktree_not_clean",
  );
  const remote = await git(root, [
    "ls-remote",
    "origin",
    options["source-ref"],
  ]);
  ensure(
    remote.split(/\s+/u)[0] === sourceCommit,
    "p0r_rebind_source_commit_not_pushed",
  );
  const expectedContainerIds =
    options["expected-container-ids"]?.split(",").filter(Boolean) ?? [];
  const { result } = await buildP0RRebindBundle({
    approval: {
      dispatchId: options["dispatch-id"],
      expectedContainerIds,
      expectedProductionHead: options["expected-production-head"],
      expiresAt: options["expires-at"],
      issuedAt: options["issued-at"],
      revocationEpoch: Number(options["revocation-epoch"]),
      runnerUnitName: options["runner-unit-name"],
      sourceRef: options["source-ref"],
    },
    expectedLegacyBundleSha256:
      options["expected-legacy-bundle-sha256"],
    legacyBundlePath: options["legacy-bundle"],
    outputDirectory: options["output-directory"],
    root,
    sourceCommit,
    sourceTree,
  });
  process.stdout.write(canonicalJson(result));
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
