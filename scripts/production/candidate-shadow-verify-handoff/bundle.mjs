#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { buildTransportBundle as buildReadOnlyBundle } from "../candidate-readonly-superwindow/bundle.mjs";
import { buildTransportBundle as buildPhaseBundle } from "../candidate-shadow-verify-phase/bundle.mjs";
import {
  PACKAGE_ID,
  createExecutionRequest,
  sha256,
  validateExecutionRequest,
} from "./runner.mjs";

const execFileAsync = promisify(execFile);
export const CONTRACT_PATH =
  "docs/governance/wp-g0-2-current-cycle-to-shadow-verify-automatic-handoff-superwindow.v2.json";
export const SOURCE_DATE_EPOCH = 946684800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

export const CHILD_ARCHIVES = Object.freeze({
  readOnlySuperwindow: "packets/current-cycle-readonly-superwindow.tar.gz",
  shadowVerifyPhase: "packets/shadow-verify-phase.tar.gz",
});
export const CHILD_PACKAGES = Object.freeze({
  readOnlySuperwindow: "WP-G0.2-CURRENT-CYCLE-READ-ONLY-VERIFICATION-SUPERWINDOW",
  shadowVerifyPhase: "WP-G0.2-SHADOW-VERIFY-PHASE-TRANSITION-AND-DUAL-READ-OBSERVATION",
});
export const RUNNER_FILES = Object.freeze([
  "scripts/production/candidate-cycle-continuation/observation-runner.mjs",
  "scripts/production/candidate-readonly-superwindow/runner.mjs",
  "scripts/production/candidate-shadow-verify-handoff/production-entrypoint.sh",
  "scripts/production/candidate-shadow-verify-handoff/production-launch.sh",
  "scripts/production/candidate-shadow-verify-handoff/production-runner.sh",
  "scripts/production/candidate-shadow-verify-handoff/request-generator.mjs",
  "scripts/production/candidate-shadow-verify-handoff/runner.mjs",
]);
export const TRANSPORT_FILES = Object.freeze([
  CONTRACT_PATH,
  ...Object.values(CHILD_ARCHIVES),
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-shadow-verify-handoff/bundle.mjs",
  ...RUNNER_FILES,
]);

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

async function artifact(root, files) {
  const checksums = {};
  for (const file of [...files].sort()) {
    const path = resolve(root, file);
    const metadata = await lstat(path);
    ensure(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
        && metadata.size > 0 && metadata.size <= 32 * 1024 * 1024,
    `artifact_file_invalid:${file}`);
    checksums[file] = sha256(await readFile(path));
  }
  return { checksums, fileCount: files.length, sha256: sha256(JSON.stringify(checksums)) };
}

export async function validateContract(root = process.cwd()) {
  const bytes = await readFile(resolve(root, CONTRACT_PATH));
  const contract = JSON.parse(bytes);
  ensure(contract.schemaVersion
      === "wp-g0.2-current-cycle-to-shadow-verify-automatic-handoff-superwindow.v2"
      && contract.packageId === PACKAGE_ID && contract.gate === "G0"
      && contract.actionClass === "shadow_verify_activation"
      && contract.riskTier === "R2_AUTHORITY_TRANSITION"
      && contract.status === "local_cycle6_ready_for_gate_production_blocked_by_cycle6_final",
  "contract_identity_invalid");
  const identity = contract.requiredProductionIdentity ?? {};
  ensure(identity.commit === "72ee289388eea922d0aee58fd4ec7a3f18a91007"
      && identity.tree === "bb1492d5a3c79a75c79dfa392dd9a7c2d185f70d"
      && identity.migrationId === "candidate-episode-v1-cycle-6"
      && identity.releaseId === "candidate-shadow-cycle-6-72ee2893"
      && identity.buildRecordPath
        === "/home/ubuntu/.cache/market-radar-ops/evidence/wp-g0-2-cycle-continuation-72ee289388ee-2b13c6e6/target-images-redacted.json"
      && identity.buildRecordSchema === "candidate-cycle-target-images.v1"
      && identity.buildRecordWebImageField === "webImageId",
  "contract_production_identity_invalid");
  ensure(JSON.stringify(contract.sequence)
      === '["current_cycle_readonly_superwindow","shadow_verify_phase"]'
      && contract.children?.readOnlySuperwindow?.actionClass
        === "read_only_production_preflight"
      && contract.children?.readOnlySuperwindow?.productionMutationAllowed === false
      && contract.children?.shadowVerifyPhase?.actionClass === "shadow_verify_activation"
      && contract.children?.shadowVerifyPhase?.productionMutationAllowed === true
      && contract.children?.shadowVerifyPhase?.independentLeaseRequired === true,
  "contract_child_boundary_invalid");
  const entry = contract.entryBoundary ?? {};
  ensure(entry.currentCycleStatus === "PASS_FRESH_ACTIVATION_AND_ACCUMULATION_READY_FOR_LINEAGE"
      && entry.currentCycleMigrationId === "candidate-episode-v1-cycle-6"
      && entry.minimumCompletedWrites === 10000 && entry.minimumSamples === 289
      && entry.minimumHours === 24 && entry.minimumCompletionAdvances === 2
      && entry.maximumSampleGapSeconds === 600 && entry.unresolvedOutboxExact === 0
      && entry.thresholdsChanged === false && entry.shadowVerifyStarted === false
      && entry.canonicalAuthorityChanged === false && entry.g0Completed === false,
  "contract_entry_boundary_invalid");
  const handoff = contract.handoffBoundary ?? {};
  ensure(handoff.readOnlyPassRequiredBeforePhaseRequest === true
      && handoff.currentCycleFinalRederivedFromRawSamples === true
      && handoff.readOnlySummaryBytesRevalidatedBeforePhaseRequest === true
      && handoff.phaseRequestGeneratedFromCurrentRunEvidenceOnly === true
      && handoff.codePresenceExactPathAndShaRequired === true
      && handoff.lineageExactPathAndShaRequired === true
      && handoff.reconciliationExactPathAndShaRequired === true
      && handoff.productionIdentityRevalidatedBeforePhase === true
      && handoff.strictSequentialFailClosed === true
      && handoff.automaticPhaseAdvanceWithoutIndependentRequest === false,
  "contract_handoff_boundary_invalid");
  const shadow = contract.shadowVerifyBoundary ?? {};
  ensure(JSON.stringify(shadow.serviceAllowlist) === '["web"]'
      && shadow.targetPhase === "shadow_verify" && shadow.legacyResponseAuthority === true
      && shadow.fullCursorChainRequired === true
      && shadow.transactionIsolation === "serializable_read_only_deferrable"
      && shadow.forcedRole === "candidate_audit_role" && shadow.maximumDifferences === 0
      && shadow.exactSamples === 289 && shadow.minimumHours === 24
      && shadow.sampleIntervalSeconds === 300 && shadow.maximumSampleGapSeconds === 600
      && shadow.automaticRollbackRequired === true && shadow.g0Completed === false,
  "contract_shadow_boundary_invalid");
  const execution = contract.executionBoundary ?? {};
  ensure(execution.singleUpload === true && execution.singleOuterTransientUnit === true
      && execution.productionWipExact === 1 && execution.outerRuntimeMaxSeconds === 7200
      && execution.outerMutationAllowed === false
      && execution.phaseMutationDelegatedToExactChildOnly === true
      && execution.gitMutationAllowed === false && execution.imageBuildAllowed === false
      && execution.sourceSyncAllowed === false && execution.migrationAllowed === false
      && execution.candidateBusinessDataMutationAllowed === false
      && execution.redisMutationAllowed === false && execution.workerMutationAllowed === false
      && execution.otherServiceMutationAllowed === false
      && execution.formalBacktestAllowed === false,
  "contract_execution_boundary_invalid");
  ensure(contract.runnerArtifact?.fileCount === RUNNER_FILES.length
      && JSON.stringify(contract.runnerArtifact.files) === JSON.stringify(RUNNER_FILES)
      && HASH.test(contract.runnerArtifact.sha256 ?? ""),
  "contract_runner_artifact_invalid");
  for (const forbidden of [
    "current_cycle_threshold_shortening", "shadow_verify_observation_shortening",
    "child_authorization_merging", "child_lease_merging",
    "phase_request_before_readonly_pass", "readonly_summary_hash_bypass",
    "historical_web_release_reuse",
    "candidate_response_authority", "canonical_cutover", "production_ranking_change",
    "future_outcome_input", "formal_backtest",
  ]) ensure(contract.forbidden?.includes(forbidden), `contract_forbidden_missing:${forbidden}`);
  const runner = await artifact(root, RUNNER_FILES);
  ensure(runner.sha256 === contract.runnerArtifact.sha256, "runner_artifact_checksum_mismatch");
  return {
    status: "PASS_LOCAL_SHADOW_VERIFY_HANDOFF_CONTRACT",
    contract,
    contractSha256: sha256(bytes),
    runnerArtifactSha256: runner.sha256,
    productionExecuted: false,
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
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json")));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  const gate = JSON.parse(gateBytes);
  ensure(sha256(gateBytes) === pointer.resultSha256 && gate.status === "pass"
      && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
  "gate_source_identity_invalid");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diff),
    sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
  };
}

async function buildChildren(root, payloadRoot, identity, approvalEligible) {
  const readOnly = await buildReadOnlyBundle({
    root,
    output: join(payloadRoot, CHILD_ARCHIVES.readOnlySuperwindow),
    sourceIdentity: identity,
    approvalEligible,
  });
  const phase = await buildPhaseBundle({
    root,
    output: join(payloadRoot, CHILD_ARCHIVES.shadowVerifyPhase),
    sourceIdentity: identity,
  });
  ensure(readOnly.manifest.packageId === CHILD_PACKAGES.readOnlySuperwindow
      && phase.manifest.packageId === CHILD_PACKAGES.shadowVerifyPhase,
  "child_package_identity_invalid");
  return { readOnlySuperwindow: readOnly, shadowVerifyPhase: phase };
}

function childRecord(result, key) {
  return {
    archivePath: CHILD_ARCHIVES[key],
    packageId: CHILD_PACKAGES[key],
    sha256: result.sha256,
  };
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceIdentity, approvalEligible = true,
} = {}) {
  const local = await validateContract(root);
  const identity = sourceIdentity ?? await currentSourceIdentity(root);
  const temporary = await mkdtemp(join(tmpdir(), "candidate-shadow-verify-handoff-"));
  const payloadRoot = join(temporary, "payload");
  try {
    await mkdir(payloadRoot, { recursive: true, mode: 0o700 });
    const children = await buildChildren(root, payloadRoot, identity, approvalEligible);
    for (const file of TRANSPORT_FILES.filter((value) => !Object.values(CHILD_ARCHIVES).includes(value))) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, /\.(?:mjs|sh|cjs)$/u.test(file) ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    for (const child of Object.values(CHILD_ARCHIVES)) {
      await chmod(join(payloadRoot, child), 0o600);
      await utimes(join(payloadRoot, child), FIXED_TIME, FIXED_TIME);
    }
    const transport = await artifact(payloadRoot, TRANSPORT_FILES);
    const policySha256 = sha256(await readFile(resolve(root,
      "scripts/governance/autonomy-policy.mjs")));
    const manifest = {
      schemaVersion: "wp-g0.2-current-cycle-to-shadow-verify-handoff-transport.v2",
      packageId: PACKAGE_ID,
      approvalEligible,
      sourceCommit: identity.sourceCommit,
      sourceTree: identity.sourceTree,
      sourceParentCommit: identity.sourceParentCommit,
      sourceDiffSha256: identity.sourceDiffSha256,
      sourcePathSetSha256: identity.sourcePathSetSha256,
      gateEvidenceSha256: identity.gateEvidenceSha256,
      policySha256,
      contractSha256: local.contractSha256,
      runnerArtifactSha256: local.runnerArtifactSha256,
      transportArtifactSha256: transport.sha256,
      transportBundleSha256: "bound_after_archive_creation",
      transportMethod: "approved_orcaterm_bundle_upload",
      bundleMarker: ".transport-bundle.sha256",
      archiveFormat: "ustar+gzip-n",
      reproducibleArchive: true,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      containsSecrets: false,
      productionMutationAllowed: true,
      services: ["web"],
      sequence: ["current_cycle_readonly_superwindow", "shadow_verify_phase"],
      children: {
        readOnlySuperwindow: childRecord(children.readOnlySuperwindow, "readOnlySuperwindow"),
        shadowVerifyPhase: childRecord(children.shadowVerifyPhase, "shadowVerifyPhase"),
      },
      files: [...TRANSPORT_FILES].sort(),
      fileSha256: transport.checksums,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const tarPath = join(temporary, "payload.tar");
    await execFileAsync("tar", [
      "-cf", tarPath, "--format=ustar", "--uid=0", "--gid=0", "--numeric-owner",
      "-C", payloadRoot, ...[...TRANSPORT_FILES, "transport-manifest.json"].sort(),
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: bytes } = await execFileAsync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null, maxBuffer: 128 * 1024 * 1024,
    });
    const outputPath = resolve(output ?? join(root,
      "reports/wp-g0-2-current-cycle-to-shadow-verify-automatic-handoff-superwindow",
      `current-cycle-to-shadow-verify-handoff-${identity.sourceCommit.slice(0, 12)}.tar.gz`));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_SHADOW_VERIFY_HANDOFF_TRANSPORT"
        : "PASS_LOCAL_SHADOW_VERIFY_HANDOFF_TEMPLATE",
      output: outputPath,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyStagedTransport(root, manifest, { requireApproval = true } = {}) {
  ensure(manifest?.schemaVersion
      === "wp-g0.2-current-cycle-to-shadow-verify-handoff-transport.v2"
      && manifest.packageId === PACKAGE_ID && (!requireApproval || manifest.approvalEligible === true)
      && manifest.containsSecrets === false && manifest.productionMutationAllowed === true
      && JSON.stringify(manifest.services) === '["web"]'
      && JSON.stringify(manifest.sequence)
        === '["current_cycle_readonly_superwindow","shadow_verify_phase"]'
      && manifest.reproducibleArchive === true && manifest.archiveFormat === "ustar+gzip-n"
      && manifest.transportMethod === "approved_orcaterm_bundle_upload"
      && manifest.bundleMarker === ".transport-bundle.sha256"
      && manifest.transportBundleSha256 === "bound_after_archive_creation",
  "transport_manifest_boundary_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    ensure(COMMIT.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256",
    "contractSha256", "runnerArtifactSha256", "transportArtifactSha256",
  ]) ensure(HASH.test(manifest[key] ?? ""), `transport_${key}_invalid`);
  ensure(JSON.stringify(manifest.files) === JSON.stringify([...TRANSPORT_FILES].sort())
      && exactKeys(manifest.fileSha256, TRANSPORT_FILES)
      && exactKeys(manifest.children, Object.keys(CHILD_ARCHIVES)),
  "transport_file_set_invalid");
  const local = await validateContract(root);
  ensure(local.contractSha256 === manifest.contractSha256
      && local.runnerArtifactSha256 === manifest.runnerArtifactSha256,
  "transport_local_identity_mismatch");
  const transport = await artifact(root, TRANSPORT_FILES);
  ensure(transport.sha256 === manifest.transportArtifactSha256,
    "transport_artifact_mismatch");
  for (const file of TRANSPORT_FILES) {
    ensure(transport.checksums[file] === manifest.fileSha256[file],
      `transport_file_mismatch:${file}`);
  }
  for (const key of Object.keys(CHILD_ARCHIVES)) {
    const child = manifest.children[key];
    ensure(exactKeys(child, ["archivePath", "packageId", "sha256"])
        && child.archivePath === CHILD_ARCHIVES[key]
        && child.packageId === CHILD_PACKAGES[key]
        && child.sha256 === sha256(await readFile(resolve(root, child.archivePath))),
    `transport_child_binding_invalid:${key}`);
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
    const clean = (await git(root, ["status", "--porcelain"])) === "";
    process.stdout.write(`${JSON.stringify(await buildTransportBundle({
      root, output: options.output, approvalEligible: clean,
    }), null, 2)}\n`);
    return;
  }
  if (command === "validate-staged") {
    const manifest = JSON.parse(await readFile(resolve(options.manifest)));
    await verifyStagedTransport(root, manifest, { requireApproval: options.approval !== "false" });
    process.stdout.write('{"status":"pass","transportValid":true,"secretsPrinted":false}\n');
    return;
  }
  if (command === "request") {
    const [manifest, runtime] = await Promise.all([
      readFile(resolve(options.manifest)).then(JSON.parse),
      readFile(resolve(options.runtime)).then(JSON.parse),
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
      flag: "wx", mode: 0o600,
    });
    process.stdout.write('{"status":"pass","requestGenerated":true,"secretsPrinted":false}\n');
    return;
  }
  if (command === "validate-request") {
    const [manifest, request] = await Promise.all([
      readFile(resolve(options.manifest)).then(JSON.parse),
      readFile(resolve(options.request)).then(JSON.parse),
    ]);
    await verifyStagedTransport(root, manifest);
    await validateExecutionRequest(request, manifest, options.bundle, { verifyEvidence: true });
    process.stdout.write('{"status":"pass","requestValid":true,"secretsPrinted":false}\n');
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
