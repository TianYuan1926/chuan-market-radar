#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  buildTransportBundle as buildCodePresenceBundle,
} from "../candidate-shadow-verify-code-presence/bundle.mjs";
import {
  buildTransportBundle as buildLineageBundle,
} from "../candidate-lineage/bundle.mjs";
import {
  buildTransportBundle as buildReconciliationBundle,
} from "../candidate-reconciliation/bundle.mjs";
import {
  PACKAGE_ID,
  createExecutionRequest,
  validateExecutionRequest,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-read-only-verification-superwindow.v2.json";
const POLICY_PATH = "scripts/governance/autonomy-policy.mjs";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const CHILD_ARCHIVES = Object.freeze({
  codePresence: "packets/shadow-verify-code-presence.tar.gz",
  lineage: "packets/current-cycle-lineage.tar.gz",
  reconciliation: "packets/current-cycle-reconciliation.tar.gz",
});
const CHILD_PACKAGE_IDS = Object.freeze({
  codePresence: "WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION",
  lineage: "WP-G0.2-CURRENT-CYCLE-UNIFIED-LINEAGE-CAPTURE-PRODUCTION-PACKET",
  reconciliation: "WP-G0.2-CURRENT-CYCLE-UNIFIED-RECONCILIATION-PRODUCTION-PACKET",
});
export const RUNNER_FILES = Object.freeze([
  "scripts/production/candidate-readonly-superwindow/bundle.mjs",
  "scripts/production/candidate-readonly-superwindow/request-generator.mjs",
  "scripts/production/candidate-readonly-superwindow/runner.mjs",
  "scripts/production/candidate-readonly-superwindow/production-launch.sh",
  "scripts/production/candidate-readonly-superwindow/production-entrypoint.sh",
  "scripts/production/candidate-readonly-superwindow/production-runner.sh",
]);
export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  POLICY_PATH,
  ...RUNNER_FILES,
  ...Object.values(CHILD_ARCHIVES),
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function artifact(root, files) {
  ensure(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length,
    "artifact_files_invalid");
  const checksums = {};
  for (const file of [...files].sort()) {
    ensure(typeof file === "string" && !file.startsWith("/") && !file.includes(".."),
      "artifact_path_invalid");
    const path = resolve(root, file);
    const metadata = await lstat(path);
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
        && metadata.size > 0 && metadata.size <= 16 * 1024 * 1024,
    `artifact_file_invalid:${file}`);
    checksums[file] = hash(await readFile(path));
  }
  return { checksums, sha256: hash(JSON.stringify(checksums)) };
}

export async function validateContract(root = process.cwd()) {
  const contractBytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(contractBytes);
  ensure(contract.schemaVersion === "wp-g0.2-current-cycle-read-only-verification-superwindow.v2"
      && contract.packageId === PACKAGE_ID
      && contract.status === "PASS_LOCAL_CONTRACT_READY_FOR_COMMIT_BOUND_PACKET",
  "contract_identity_invalid");
  ensure(JSON.stringify(contract.sequence) === JSON.stringify([
    "shadow_verify_code_presence", "current_cycle_lineage", "current_cycle_reconciliation",
  ]), "contract_sequence_invalid");
  const production = contract.productionIdentity;
  ensure(production.commit === "72ee289388eea922d0aee58fd4ec7a3f18a91007"
      && production.tree === "bb1492d5a3c79a75c79dfa392dd9a7c2d185f70d"
      && production.migrationId === "candidate-episode-v1-cycle-6"
      && production.releaseId === "candidate-shadow-cycle-6-72ee2893"
      && production.buildRecordPath
        === "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-72ee289388ee-2b13c6e6/target-images-redacted.json"
      && production.buildRecordSchema === "candidate-cycle-target-images.v1",
  "contract_production_identity_invalid");
  const boundary = contract.executionBoundary;
  ensure(boundary.actionClass === "read_only_production_preflight"
      && boundary.riskTier === "R0_READ_ONLY"
      && boundary.productionMutationAllowed === false
      && Array.isArray(boundary.services) && boundary.services.length === 0,
  "contract_execution_boundary_invalid");
  for (const key of [
    "databaseMutationAllowed", "redisMutationAllowed", "workerMutationAllowed",
    "gitMutationAllowed", "environmentMutationAllowed", "composeMutationAllowed",
    "phaseTransitionAllowed", "manifestMutationAllowed", "featureFlagMutationAllowed",
    "migrationAllowed", "canonicalAuthorityChangeAllowed", "automaticG0CompletionAllowed",
  ]) ensure(boundary[key] === false, `contract_mutation_allowed:${key}`);
  const quality = contract.qualityBoundary;
  ensure(quality.currentCycleFinalPassRequired === true
      && quality.currentCycleMigrationId === "candidate-episode-v1-cycle-6"
      && quality.sourceReleaseWindowsExact === 6
      && quality.sourceReleaseWindowsDerivedFromMigrationId === true
      && quality.minimumComparedWrites === 10_000
      && quality.minimumActivationSamples === 289
      && quality.minimumActivationHours === 24
      && quality.maximumSampleGapSeconds === 600
      && quality.unresolvedOutboxExact === 0
      && quality.cycle5EvidenceAcceptedAsCurrentPass === false
      && quality.childContractsRemainIndependent === true
      && quality.childEvidenceRemainsIndependent === true
      && quality.childAuthorizationsRemainIndependent === true
      && quality.strictSequentialFailClosed === true
      && quality.reconciliationRequestDerivedFromExactLineageEvidence === true,
  "contract_quality_boundary_invalid");
  for (const key of [
    "thresholdChangeAllowed", "observationWindowShorteningAllowed",
    "productionRankingInputsAllowed", "futureOutcomeInputsAllowed", "formalBacktestAllowed",
  ]) ensure(quality[key] === false, `contract_quality_weakening_allowed:${key}`);
  const transport = contract.transportBoundary;
  ensure(transport.method === "approved_orcaterm_bundle_upload"
      && transport.singleUpload === true && transport.singleTransientUnit === true
      && transport.reproducibleArchive === true && transport.containsSecrets === false
      && transport.exactTemporaryCleanup === true && transport.evidencePreserved === true,
  "contract_transport_boundary_invalid");
  return {
    status: "PASS_LOCAL_READ_ONLY_SUPERWINDOW_CONTRACT",
    packageId: PACKAGE_ID,
    contractSha256: hash(contractBytes),
    productionMutationAllowed: false,
    services: [],
    formalBacktestAllowed: false,
  };
}

async function sourceIdentity(root, requireGate) {
  const git = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trimEnd();
  const [sourceCommit, sourceTree, parentLine, status] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "HEAD^{tree}"]),
    git(["rev-list", "--parents", "-n", "1", "HEAD"]),
    git(["status", "--porcelain"]),
  ]);
  const parents = parentLine.split(" ").slice(1);
  ensure(parents.length === 1, "source_parent_count_invalid");
  const diff = `${await git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  let gateEvidenceSha256 = "0".repeat(64);
  if (requireGate) {
    ensure(status === "", "source_worktree_dirty");
    const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
    const gateBytes = await readFile(resolve(root, pointer.resultPath));
    ensure(hash(gateBytes) === pointer.resultSha256, "gate_pointer_hash_invalid");
    const gate = JSON.parse(gateBytes);
    ensure(gate.status === "pass" && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
      "gate_source_identity_invalid");
    gateEvidenceSha256 = pointer.resultSha256;
  }
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: hash(diff),
    sourcePathSetSha256: hash(paths),
    gateEvidenceSha256,
    policySha256: hash(await readFile(resolve(root, POLICY_PATH))),
  };
}

async function createChildBundles(root, directory, identity, approvalEligible) {
  const outputs = {
    codePresence: join(directory, CHILD_ARCHIVES.codePresence),
    lineage: join(directory, CHILD_ARCHIVES.lineage),
    reconciliation: join(directory, CHILD_ARCHIVES.reconciliation),
  };
  await mkdir(dirname(outputs.codePresence), { recursive: true, mode: 0o700 });
  const codePresence = await buildCodePresenceBundle({
    root,
    output: outputs.codePresence,
    sourceIdentity: identity,
  });
  const lineage = await buildLineageBundle({
    root,
    output: outputs.lineage,
    sourceIdentity: identity,
    approvalEligible,
  });
  const reconciliation = await buildReconciliationBundle({
    root,
    output: outputs.reconciliation,
    sourceIdentity: identity,
    approvalEligible,
  });
  return { codePresence, lineage, reconciliation };
}

function childManifest(result, name) {
  return {
    archivePath: CHILD_ARCHIVES[name],
    packageId: CHILD_PACKAGE_IDS[name],
    sha256: result.sha256,
  };
}

export async function buildTransportBundle({
  root = process.cwd(),
  output,
  sourceIdentity: suppliedIdentity = null,
  approvalEligible = true,
} = {}) {
  const contract = await validateContract(root);
  const identity = suppliedIdentity ?? await sourceIdentity(root, approvalEligible);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "candidate-readonly-superwindow-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    const children = await createChildBundles(root, payloadRoot, identity, approvalEligible);
    for (const file of [CONTRACT_PATH, POLICY_PATH, ...RUNNER_FILES]) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    for (const archive of Object.values(CHILD_ARCHIVES)) {
      await chmod(join(payloadRoot, archive), 0o600);
      await utimes(join(payloadRoot, archive), FIXED_TIME, FIXED_TIME);
    }
    const runnerArtifact = await artifact(payloadRoot, RUNNER_FILES);
    const transportArtifact = await artifact(payloadRoot, TRANSPORT_FILES);
    const manifest = {
      schemaVersion: "wp-g0.2-current-cycle-read-only-superwindow-transport.v2",
      packageId: PACKAGE_ID,
      approvalEligible,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      gateEvidenceSha256: identity.gateEvidenceSha256,
      policySha256: identity.policySha256,
      contractSha256: contract.contractSha256,
      runnerArtifactSha256: runnerArtifact.sha256,
      transportArtifactSha256: transportArtifact.sha256,
      transportBundleSha256: "bound_after_archive_creation",
      transportMethod: "approved_orcaterm_bundle_upload",
      bundleMarker: ".transport-bundle.sha256",
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      containsSecrets: false,
      services: [],
      productionMutationAllowed: false,
      sequence: [
        "shadow_verify_code_presence", "current_cycle_lineage", "current_cycle_reconciliation",
      ],
      children: {
        codePresence: childManifest(children.codePresence, "codePresence"),
        lineage: childManifest(children.lineage, "lineage"),
        reconciliation: childManifest(children.reconciliation, "reconciliation"),
      },
      files: [...TRANSPORT_FILES].sort(),
      fileSha256: transportArtifact.checksums,
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
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "bundle_not_binary");
    const outputPath = resolve(output ?? join(root,
      "reports/wp-g0-2-current-cycle-read-only-verification-superwindow",
      `current-cycle-readonly-superwindow-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_CURRENT_CYCLE_READ_ONLY_SUPERWINDOW_TRANSPORT"
        : "PASS_LOCAL_CURRENT_CYCLE_READ_ONLY_SUPERWINDOW_TEMPLATE",
      output: outputPath,
      sha256: hash(bytes),
      sizeBytes: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function verifyStagedTransport(root, manifest, { requireApproval = true } = {}) {
  const expectedKeys = [
    "approvalEligible", "archiveFormat", "bundleMarker", "children", "containsSecrets",
    "contractSha256", "fileSha256", "files", "gateEvidenceSha256", "packageId",
    "policySha256", "productionMutationAllowed", "reproducibleArchive", "runnerArtifactSha256",
    "schemaVersion", "sequence", "services", "sourceCommit", "sourceDateEpoch",
    "sourceDiffSha256", "sourceParentCommit", "sourcePathSetSha256", "sourceTree",
    "transportArtifactSha256", "transportBundleSha256", "transportMethod",
  ];
  ensure(exactKeys(manifest, expectedKeys), "transport_manifest_keys_mismatch");
  ensure(manifest.schemaVersion === "wp-g0.2-current-cycle-read-only-superwindow-transport.v2"
      && manifest.packageId === PACKAGE_ID && (!requireApproval || manifest.approvalEligible === true),
  "transport_manifest_identity_invalid");
  ensure(manifest.containsSecrets === false && manifest.productionMutationAllowed === false
      && Array.isArray(manifest.services) && manifest.services.length === 0
      && manifest.reproducibleArchive === true && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.transportMethod === "approved_orcaterm_bundle_upload"
      && manifest.transportBundleSha256 === "bound_after_archive_creation"
      && manifest.bundleMarker === ".transport-bundle.sha256",
  "transport_manifest_boundary_invalid");
  ensure(JSON.stringify(manifest.sequence) === JSON.stringify([
    "shadow_verify_code_presence", "current_cycle_lineage", "current_cycle_reconciliation",
  ]), "transport_sequence_invalid");
  ensure(JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort())
      && exactKeys(manifest.fileSha256, TRANSPORT_FILES),
  "transport_files_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    ensure(/^[0-9a-f]{40}$/u.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256",
    "contractSha256", "runnerArtifactSha256", "transportArtifactSha256",
  ]) ensure(/^[0-9a-f]{64}$/u.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  const contract = await validateContract(root);
  ensure(contract.contractSha256 === manifest.contractSha256, "transport_contract_mismatch");
  const runnerArtifact = await artifact(root, RUNNER_FILES);
  ensure(runnerArtifact.sha256 === manifest.runnerArtifactSha256, "transport_runner_mismatch");
  const transportArtifact = await artifact(root, TRANSPORT_FILES);
  ensure(transportArtifact.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transportArtifact.checksums[file] === manifest.fileSha256[file],
      `transport_file_mismatch:${file}`);
  }
  ensure(exactKeys(manifest.children, Object.keys(CHILD_ARCHIVES)), "transport_children_invalid");
  for (const name of Object.keys(CHILD_ARCHIVES)) {
    const child = manifest.children[name];
    ensure(exactKeys(child, ["archivePath", "packageId", "sha256"])
        && child.archivePath === CHILD_ARCHIVES[name]
        && child.packageId === CHILD_PACKAGE_IDS[name]
        && child.sha256 === hash(await readFile(resolve(root, child.archivePath))),
    `transport_child_binding_invalid:${name}`);
  }
  return manifest;
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
    process.stdout.write(`${JSON.stringify(await validateContract(root), null, 2)}\n`);
    return;
  }
  if (command === "bundle") {
    const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"]))
      .stdout.trim() === "";
    process.stdout.write(`${JSON.stringify(await buildTransportBundle({
      root,
      output: options.output,
      approvalEligible: clean,
    }), null, 2)}\n`);
    return;
  }
  if (command === "validate-staged") {
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    await verifyStagedTransport(root, manifest, { requireApproval: options.approval !== "false" });
    process.stdout.write("{\"status\":\"pass\",\"transportValid\":true,\"secretsPrinted\":false}\n");
    return;
  }
  if (command === "request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.runtime), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(root, manifest);
    const request = createExecutionRequest({
      bundleSha256: options.bundle,
      manifest,
      runtime,
      stagingDirectory: options.staging,
    });
    await validateExecutionRequest(request, manifest, options.bundle, { verifyEvidence: true });
    await writeFile(resolve(options.output), `${JSON.stringify(request, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write("{\"status\":\"pass\",\"requestGenerated\":true,\"secretsPrinted\":false}\n");
    return;
  }
  if (command === "validate-request") {
    const [manifest, request] = await Promise.all([
      readFile(resolve(options.manifest), "utf8").then(JSON.parse),
      readFile(resolve(options.request), "utf8").then(JSON.parse),
    ]);
    await verifyStagedTransport(root, manifest);
    await validateExecutionRequest(request, manifest, options.bundle, { verifyEvidence: true });
    process.stdout.write("{\"status\":\"pass\",\"requestValid\":true,\"secretsPrinted\":false}\n");
    return;
  }
  throw new Error(`unsupported_command:${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "fail", reason: error?.message ?? "unexpected_error", secretsPrinted: false,
    })}\n`);
    process.exitCode = 1;
  });
}
