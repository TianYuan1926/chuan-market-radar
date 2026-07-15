#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_ID = "WP-G0.2-SHADOW-CAPTURE-RUNTIME-IDENTITY-AND-PERMISSION";
const PRODUCTION_TARGET = "cec0b6572bb09ae91ff9e013f8bb160f73c045e2";
const GRANT_ID = "MR-G0-G8-USER-STANDING-GRANT-20260714-034826";
const TRUST_ROOT = "/home/ubuntu/.local/state/market-radar-autonomy";
const SOURCE_DATE_EPOCH = 946_684_800;
const FIXED_TIME = new Date(SOURCE_DATE_EPOCH * 1000);
const CONTRACT_PATH = "docs/governance/wp-g0-2-runtime-identity-production-execution.v1.json";
const TRANSPORT_FILES = [
  CONTRACT_PATH,
  "docs/governance/wp-g0-2-runtime-identity-runner-preparation.v1.json",
  "scripts/governance/autonomy-policy.mjs",
  "scripts/governance/autonomy-production-lease-cli.mjs",
  "scripts/governance/autonomy-production-lease.mjs",
  "scripts/production/candidate-dormant-deploy.mjs",
  "scripts/production/candidate-runtime-identity/bundle.mjs",
  "scripts/production/candidate-runtime-identity/production-entrypoint.sh",
  "scripts/production/candidate-runtime-identity/production-runner.sh",
  "scripts/production/candidate-runtime-identity/runner.mjs",
  "scripts/production/candidate-runtime-identity/runtime-access.sql",
  "scripts/verify/production-check.sh",
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function parseTimestamp(value, reason) {
  const timestamp = Date.parse(value);
  ensure(Number.isFinite(timestamp), reason);
  return timestamp;
}

function assertHash(value, reason, size = 64) {
  ensure(new RegExp(`^[0-9a-f]{${size}}$`).test(value ?? ""), reason);
}

function validateAuthorization(authorization, request, bindings) {
  const expectedKeys = [
    "schemaVersion", "mode", "approvedBy", "grantId", "approvalId", "nonce", "gate",
    "packageId", "scope", "actionClass", "riskTier", "builderAgentId", "baseCommit",
    "targetCommit", "targetTree", "diffSha256", "pathSetSha256", "contractSha256",
    "runnerSha256", "artifactSha256", "imageOrMigrationSha256", "composeSha256",
    "environmentFingerprintSha256", "productionIdentitySha256", "gateEvidenceSha256",
    "preflightSha256", "backupRestoreEvidenceSha256", "rollbackTarget",
    "observationContractSha256", "policySha256", "revocationEpoch", "issuedAt",
    "expiresAt", "maxExecutions", "packageAssertions",
  ];
  ensure(exactKeys(authorization, expectedKeys), "autonomy_authorization_keys_mismatch");
  ensure(authorization.schemaVersion === "market-radar-package-authorization.v1",
    "autonomy_authorization_schema_invalid");
  ensure(authorization.mode === "g0_g8_standing_user_grant", "autonomy_authorization_mode_invalid");
  ensure(authorization.approvedBy === "user_standing_grant", "autonomy_authorization_issuer_invalid");
  ensure(authorization.grantId === GRANT_ID, "autonomy_authorization_grant_invalid");
  ensure(authorization.packageId === PACKAGE_ID && authorization.scope === PACKAGE_ID,
    "autonomy_authorization_package_invalid");
  ensure(authorization.gate === "G0", "autonomy_authorization_gate_invalid");
  ensure(authorization.actionClass === "runtime_identity_provision",
    "autonomy_authorization_action_invalid");
  ensure(authorization.riskTier === "R2_PRIVILEGED_IDENTITY", "autonomy_authorization_risk_invalid");
  ensure(authorization.builderAgentId === "codex-primary", "autonomy_authorization_builder_invalid");
  ensure(authorization.maxExecutions === 1, "autonomy_authorization_execution_count_invalid");
  ensure(authorization.revocationEpoch === 2, "autonomy_authorization_revocation_invalid");
  ensure(authorization.issuedAt === request.approvalIssuedAt
    && authorization.expiresAt === request.approvalExpiresAt, "autonomy_authorization_time_binding_invalid");
  for (const key of ["baseCommit", "targetCommit", "targetTree"]) assertHash(authorization[key], `authorization_${key}_invalid`, 40);
  for (const key of [
    "diffSha256", "pathSetSha256", "contractSha256", "runnerSha256", "artifactSha256",
    "imageOrMigrationSha256", "composeSha256", "environmentFingerprintSha256",
    "productionIdentitySha256", "gateEvidenceSha256", "preflightSha256",
    "backupRestoreEvidenceSha256", "observationContractSha256", "policySha256",
  ]) assertHash(authorization[key], `authorization_${key}_invalid`);
  const bound = {
    artifactSha256: "artifactSha256",
    contractSha256: "contractSha256",
    gateEvidenceSha256: "gateEvidenceSha256",
    policySha256: "policySha256",
    runnerSha256: "runnerSha256",
    sourceCommit: "targetCommit",
    sourceDiffSha256: "diffSha256",
    sourceParentCommit: "baseCommit",
    sourcePathSetSha256: "pathSetSha256",
    sourceTree: "targetTree",
  };
  for (const [binding, approvalKey] of Object.entries(bound)) {
    ensure(authorization[approvalKey] === bindings[binding], `autonomy_${binding}_binding_mismatch`);
  }
  const runtime = request.runtimeIdentityApproval;
  ensure(authorization.imageOrMigrationSha256 === sha256(`${runtime.approvedWebImageId}\n`),
    "autonomy_web_image_binding_mismatch");
  ensure(authorization.composeSha256 === runtime.composeSha256, "autonomy_compose_binding_mismatch");
  ensure(authorization.environmentFingerprintSha256
    === sha256(`${runtime.baseEnvSha256}\n${runtime.productionEnvSha256}\n`),
  "autonomy_environment_binding_mismatch");
  ensure(authorization.productionIdentitySha256
    === sha256(`${runtime.identityOverrideSha256}\n${runtime.identityWrapperSha256}\n`),
  "autonomy_production_identity_binding_mismatch");
  ensure(authorization.preflightSha256 === sha256(canonicalJson({
    productionCommit: runtime.approvedProductionCommit,
    runtimeIdentityApprovalSha256: request.runtimeIdentityApprovalSha256,
    transportBundleSha256: request.transportBundleSha256,
    stagingDirectory: request.stagingDirectory,
    dormantDeployEvidenceSha256: runtime.dormantDeployEvidenceSha256,
  })), "autonomy_preflight_binding_mismatch");
  ensure(authorization.backupRestoreEvidenceSha256 === sha256(canonicalJson({
    automaticDatabaseRollbackAllowed: runtime.automaticDatabaseRollbackAllowed,
    automaticEnvironmentRollbackAllowed: runtime.automaticEnvironmentRollbackAllowed,
    automaticWebRollbackAllowed: runtime.automaticWebRollbackAllowed,
    rollbackWebImageRef: runtime.rollbackWebImageRef,
  })), "autonomy_rollback_binding_mismatch");
  ensure(authorization.rollbackTarget
    === `${PRODUCTION_TARGET}:web:${runtime.rollbackWebImageRef}`,
  "autonomy_rollback_target_mismatch");
  ensure(authorization.observationContractSha256 === sha256(canonicalJson({
    candidateDormant: true,
    candidateWorkerAbsent: true,
    finalStatus: "PASS_IMMEDIATE_RUNTIME_IDENTITY_AWAITING_OBSERVATION",
  })), "autonomy_observation_binding_mismatch");
  const assertions = {
    qualityThresholdChanged: false,
    scopeMatchesBlueprint: true,
    dynamicPreflightCurrent: true,
    requiredGatesPassed: true,
    rollbackVerified: true,
    productionWipAvailable: true,
    secretsPresentInEvidence: false,
    knownP0Open: false,
    pollutionCleanupManifestExact: true,
  };
  ensure(exactKeys(authorization.packageAssertions, Object.keys(assertions)),
    "autonomy_authorization_assertion_keys_invalid");
  for (const [key, expected] of Object.entries(assertions)) {
    ensure(authorization.packageAssertions[key] === expected, `autonomy_authorization_assertion_failed:${key}`);
  }
}

export function validateProductionExecutionRequest(request, bindings, { now = new Date() } = {}) {
  const expectedKeys = [
    "approvalExpiresAt", "approvalIssuedAt", "approvalRef", "autonomyAuthorization",
    "autonomyTrustRoot", "dormantEvidencePath", "evidenceDirectory", "execute", "operator",
    "opsRoot", "packageId", "runnerUnitName", "runtimeIdentityApproval", "secureRoot",
    "runtimeIdentityApprovalSha256", "services", "sessionIndependentExecutionRequired", "stagingDirectory",
    "temporaryArtifactCleanupRequired", "transportBundleSha256", "transportMethod",
  ];
  ensure(exactKeys(request, expectedKeys), "production_request_keys_mismatch");
  ensure(request.packageId === PACKAGE_ID, "production_request_package_invalid");
  ensure(request.execute === true, "production_request_execute_not_approved");
  ensure(JSON.stringify(request.services) === '["web"]', "production_request_service_scope_invalid");
  ensure(request.sessionIndependentExecutionRequired === true,
    "production_request_session_independent_required");
  ensure(request.temporaryArtifactCleanupRequired === true,
    "production_request_cleanup_required");
  ensure(request.transportMethod === "approved_orcaterm_bundle_upload",
    "production_request_transport_invalid");
  ensure(request.autonomyTrustRoot === TRUST_ROOT, "production_request_trust_root_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/wp-g0-2-runtime-identity-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.stagingDirectory ?? ""),
    "production_request_staging_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-runtime-identity-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.evidenceDirectory ?? ""),
    "production_request_evidence_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/runtime-identity-ops\/wp-g0-2-runtime-identity-[a-z0-9][a-z0-9._-]{7,80}$/.test(request.opsRoot ?? ""),
    "production_request_ops_root_invalid");
  ensure(/^\/home\/ubuntu\/\.local\/state\/market-radar-runtime-identity\/[a-z0-9][a-z0-9._-]{7,80}$/.test(request.secureRoot ?? ""),
    "production_request_secure_root_invalid");
  ensure(/^market-radar-runtime-identity-[a-z0-9][a-z0-9-]{7,56}$/.test(request.runnerUnitName ?? ""),
    "production_request_runner_unit_invalid");
  ensure(/^\/home\/ubuntu\/\.cache\/market-radar-ops\/evidence\/wp-g0-2-dormant-runtime-deploy-[a-z0-9][a-z0-9._-]{7,80}\/summary\.json$/.test(request.dormantEvidencePath ?? ""),
    "production_request_dormant_evidence_path_invalid");
  assertHash(request.transportBundleSha256, "production_request_bundle_hash_invalid");
  ensure(request.transportBundleSha256 === bindings.transportBundleSha256,
    "production_request_bundle_binding_mismatch");
  ensure(request.runtimeIdentityApproval?.approvedRunnerSourceCommit === bindings.sourceCommit,
    "production_request_runtime_approval_source_mismatch");
  assertHash(request.runtimeIdentityApprovalSha256, "production_request_runtime_approval_hash_invalid");
  ensure(request.runtimeIdentityApprovalSha256
    === sha256(`${canonicalJson(request.runtimeIdentityApproval)}\n`),
  "production_request_runtime_approval_hash_mismatch");
  ensure(typeof request.approvalRef === "string" && request.approvalRef.length >= 8,
    "production_request_approval_ref_invalid");
  ensure(typeof request.operator === "string" && request.operator.length >= 2,
    "production_request_operator_invalid");
  const issuedAt = parseTimestamp(request.approvalIssuedAt, "production_request_approval_issued_invalid");
  const expiresAt = parseTimestamp(request.approvalExpiresAt, "production_request_approval_expires_invalid");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  ensure(expiresAt > issuedAt && expiresAt - issuedAt <= 90 * 60_000,
    "production_request_approval_window_invalid");
  ensure(nowMs >= issuedAt && nowMs <= expiresAt, "production_request_approval_not_current");
  validateAuthorization(request.autonomyAuthorization, request, bindings);
  return request;
}

async function artifactIdentity(root) {
  const checksums = {};
  for (const file of [...TRANSPORT_FILES].sort()) checksums[file] = sha256(await readFile(resolve(root, file)));
  return { checksums, sha256: sha256(JSON.stringify(checksums)) };
}

export async function validateProductionExecutionContract(root = process.cwd()) {
  const contract = JSON.parse(await readFile(resolve(root, CONTRACT_PATH), "utf8"));
  const violations = [];
  if (contract.schemaVersion !== "wp-g0.2-runtime-identity-production-execution.v1") violations.push("schema_version");
  if (contract.packageId !== PACKAGE_ID) violations.push("package_id");
  if (contract.productionAuthorization !== false || contract.productionExecuted !== false) {
    violations.push("production_truth_claim");
  }
  if (contract.actionClass !== "runtime_identity_provision"
    || contract.riskTier !== "R2_PRIVILEGED_IDENTITY") violations.push("risk_boundary");
  if (contract.productionRoot !== "/home/ubuntu/apps/chuan-market-radar"
    || contract.productionTarget !== PRODUCTION_TARGET) violations.push("production_target");
  if (contract.transport?.containsSecrets !== false || contract.transport?.reproducible !== true
    || contract.transport?.temporaryArtifactCleanupRequired !== true) violations.push("transport_boundary");
  if (contract.execution?.runner !== "transient_systemd_unit"
    || contract.execution?.restart !== "no" || contract.execution?.runtimeMaxSeconds !== 5400
    || contract.execution?.maximumApprovalWindowMinutes !== 90
    || contract.execution?.maximumExecutions !== 1
    || contract.execution?.externalLeaseRequired !== true
    || contract.execution?.fencingRequired !== true
    || contract.execution?.hostNodeRequired !== false
    || contract.execution?.containerNodeFallback?.enabled !== true
    || contract.execution?.containerNodeFallback?.image !== "approved_current_web_image"
    || contract.execution?.containerNodeFallback?.network !== "none"
    || contract.execution?.containerNodeFallback?.rootFilesystem !== "read_only"
    || contract.execution?.containerNodeFallback?.capabilities !== "drop_all"
    || contract.execution?.containerNodeFallback?.noNewPrivileges !== true) {
    violations.push("execution_boundary");
  }
  if (contract.secureInputs?.transported !== false || contract.secureInputs?.printed !== false
    || contract.secureInputs?.deletedAtExit !== true
    || contract.secureInputs?.temporaryOpsRootDeletedAtExit !== true) violations.push("secret_boundary");
  if (contract.dynamicPreflight?.schemaLedgerApplied !== 9
    || contract.dynamicPreflight?.schemaControlRows !== 0
    || contract.dynamicPreflight?.runtimeLoginsBefore !== 0
    || contract.dynamicPreflight?.writerArchiveAccessBefore !== false) violations.push("preflight_boundary");
  if (contract.mutationAllowlist?.runtimeLoginsCreated !== 3
    || JSON.stringify(contract.mutationAllowlist?.servicesRecreated) !== '["web"]'
    || contract.mutationAllowlist?.webBuildAllowed !== false) violations.push("mutation_boundary");
  if (contract.rollback?.automatic !== true
    || contract.rollback?.independentVerificationRequired !== true) violations.push("rollback_boundary");
  const checksums = {};
  for (const file of [...(contract.artifact?.files ?? [])].sort()) {
    checksums[file] = sha256(await readFile(resolve(root, file)));
  }
  const artifactSha256 = sha256(JSON.stringify(checksums));
  if (contract.artifact?.sha256 !== artifactSha256) violations.push("artifact_checksum");
  for (const forbidden of [
    "credentials_in_transport", "approval_self_issuance", "approval_replay",
    "foreground_fallback", "candidate_worker_start", "schema_migration", "formal_backtest",
  ]) if (!contract.forbidden?.includes(forbidden)) violations.push(`forbidden_missing:${forbidden}`);
  return {
    status: violations.length === 0 ? "PASS_LOCAL_RUNTIME_IDENTITY_PRODUCTION_PACKET" : "FAIL",
    productionMutationAllowed: false,
    artifactSha256,
    artifactFiles: Object.keys(checksums).length,
    violations,
  };
}

export async function verifyStagedTransport(root, manifest) {
  ensure(manifest?.schemaVersion === "wp-g0.2-runtime-identity-transport.v1",
    "transport_manifest_schema_invalid");
  ensure(manifest.packageId === PACKAGE_ID, "transport_manifest_package_invalid");
  ensure(manifest.productionTarget === PRODUCTION_TARGET, "transport_manifest_target_invalid");
  ensure(manifest.approvalEligible === true, "transport_manifest_not_approval_eligible");
  ensure(manifest.containsSecrets === false, "transport_manifest_secret_boundary_invalid");
  ensure(manifest.sessionIndependentExecutionRequired === true,
    "transport_manifest_session_boundary_invalid");
  ensure(JSON.stringify(manifest.services) === '["web"]', "transport_manifest_services_invalid");
  for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) {
    assertHash(manifest[key], `transport_manifest_${key}_invalid`, 40);
  }
  for (const key of [
    "sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256",
    "contractSha256", "artifactSha256",
  ]) assertHash(manifest[key], `transport_manifest_${key}_invalid`);
  ensure(JSON.stringify(manifest.files) === JSON.stringify(TRANSPORT_FILES),
    "transport_manifest_file_set_invalid");
  ensure(exactKeys(manifest.fileSha256, TRANSPORT_FILES), "transport_manifest_checksum_set_invalid");
  const checksums = {};
  for (const file of TRANSPORT_FILES) {
    const path = resolve(root, file);
    const facts = await lstat(path);
    ensure(facts.isFile() && !facts.isSymbolicLink(), `transport_file_not_regular:${file}`);
    checksums[file] = sha256(await readFile(path));
    ensure(checksums[file] === manifest.fileSha256[file], `transport_file_checksum_mismatch:${file}`);
  }
  ensure(sha256(JSON.stringify(Object.fromEntries(Object.entries(checksums).sort())))
    === manifest.artifactSha256, "transport_artifact_checksum_mismatch");
  return { artifactSha256: manifest.artifactSha256, fileCount: TRANSPORT_FILES.length };
}

export async function buildTransportBundle({
  root = process.cwd(), output, sourceCommit, sourceIdentity, approvalEligible = true,
}) {
  if (approvalEligible) {
    ensure(sourceIdentity?.sourceCommit === sourceCommit, "source_identity_invalid");
    for (const key of ["sourceCommit", "sourceTree", "sourceParentCommit"]) assertHash(sourceIdentity[key], `source_identity_${key}_invalid`, 40);
    for (const key of ["sourceDiffSha256", "sourcePathSetSha256", "gateEvidenceSha256", "policySha256"]) assertHash(sourceIdentity[key], `source_identity_${key}_invalid`);
  } else ensure(sourceCommit === null, "template_source_commit_must_be_null");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "runtime-identity-bundle-"));
  const payloadRoot = join(temporaryRoot, "payload");
  try {
    for (const file of TRANSPORT_FILES) {
      const target = join(payloadRoot, file);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await cp(resolve(root, file), target);
      await chmod(target, file.endsWith(".sh") ? 0o700 : 0o600);
      await utimes(target, FIXED_TIME, FIXED_TIME);
    }
    const artifact = await artifactIdentity(root);
    const contractSha256 = sha256(await readFile(resolve(root, CONTRACT_PATH)));
    const manifest = {
      schemaVersion: "wp-g0.2-runtime-identity-transport.v1",
      packageId: PACKAGE_ID,
      sourceCommit: sourceIdentity?.sourceCommit ?? null,
      sourceTree: sourceIdentity?.sourceTree ?? null,
      sourceParentCommit: sourceIdentity?.sourceParentCommit ?? null,
      sourceDiffSha256: sourceIdentity?.sourceDiffSha256 ?? null,
      sourcePathSetSha256: sourceIdentity?.sourcePathSetSha256 ?? null,
      gateEvidenceSha256: sourceIdentity?.gateEvidenceSha256 ?? null,
      policySha256: sourceIdentity?.policySha256 ?? null,
      approvalEligible,
      productionTarget: PRODUCTION_TARGET,
      contractSha256,
      artifactSha256: artifact.sha256,
      transportMethod: "approved_orcaterm_bundle_upload",
      transportBundleSha256: "bound_after_archive_creation",
      bundleMarker: ".transport-bundle.sha256",
      reproducibleArchive: true,
      archiveFormat: "ustar+gzip-n",
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      containsSecrets: false,
      sessionIndependentExecutionRequired: true,
      services: ["web"],
      files: TRANSPORT_FILES,
      fileSha256: artifact.checksums,
    };
    const manifestPath = join(payloadRoot, "transport-manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const outputPath = resolve(output);
    await mkdir(dirname(outputPath), { recursive: true });
    const tarPath = join(temporaryRoot, "payload.tar");
    await execFileAsync("tar", [
      "-cf", tarPath, "--format=ustar", "--uid=0", "--gid=0", "--numeric-owner",
      "-C", payloadRoot, ...[...TRANSPORT_FILES, "transport-manifest.json"].sort(),
    ], { env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C" } });
    const { stdout: bytes } = await execFileAsync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null,
      maxBuffer: 4 * 1024 * 1024,
    });
    ensure(Buffer.isBuffer(bytes), "transport_bundle_not_binary");
    await writeFile(outputPath, bytes, { mode: 0o600 });
    return {
      status: approvalEligible
        ? "PASS_FINAL_RUNTIME_IDENTITY_TRANSPORT_BUNDLE"
        : "PASS_LOCAL_RUNTIME_IDENTITY_TRANSPORT_TEMPLATE",
      output: outputPath,
      sha256: sha256(bytes),
      sizeBytes: bytes.length,
      manifest,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const [command = "bundle", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    ensure(rest[index]?.startsWith("--") && rest[index + 1], "argument_invalid");
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

async function currentSourceIdentity(root) {
  const git = async (args) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trimEnd();
  const sourceCommit = await git(["rev-parse", "HEAD"]);
  const sourceTree = await git(["rev-parse", "HEAD^{tree}"]);
  const parents = (await git(["rev-list", "--parents", "-n", "1", "HEAD"])).split(" ").slice(1);
  ensure(parents.length === 1, "source_parent_count_invalid");
  const diff = `${await git(["diff-tree", "--no-commit-id", "--name-status", "-r", "HEAD"])}\n`;
  const paths = `${(await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]))
    .split("\n").filter(Boolean).sort().join("\n")}\n`;
  const pointer = JSON.parse(await readFile(resolve(root, ".autonomy/latest-gate-result.json"), "utf8"));
  const gateBytes = await readFile(resolve(root, pointer.resultPath));
  ensure(sha256(gateBytes) === pointer.resultSha256, "gate_evidence_pointer_invalid");
  const gate = JSON.parse(gateBytes);
  ensure(gate.status === "pass" && gate.gitHead === sourceCommit && gate.gitTree === sourceTree,
    "gate_evidence_source_invalid");
  return {
    sourceCommit,
    sourceTree,
    sourceParentCommit: parents[0],
    sourceDiffSha256: sha256(diff),
    sourcePathSetSha256: sha256(paths),
    gateEvidenceSha256: pointer.resultSha256,
    policySha256: sha256(await readFile(resolve(root, "scripts/governance/autonomy-policy.mjs"))),
  };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "validate") {
    const result = await validateProductionExecutionContract(resolve(options.root ?? process.cwd()));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "PASS_LOCAL_RUNTIME_IDENTITY_PRODUCTION_PACKET") process.exitCode = 2;
    return;
  }
  if (command === "validate-request") {
    const request = JSON.parse(await readFile(resolve(options.request), "utf8"));
    const manifest = JSON.parse(await readFile(resolve(options.manifest), "utf8"));
    await verifyStagedTransport(resolve(options.root), manifest);
    const bindings = {
      ...manifest,
      transportBundleSha256: options["bundle-sha256"],
      runnerSha256: sha256(await readFile(resolve(options.runner))),
    };
    validateProductionExecutionRequest(request, bindings);
    process.stdout.write('{"status":"pass","requestValid":true,"secretsPrinted":false}\n');
    return;
  }
  const root = resolve(options.root ?? process.cwd());
  const clean = (await execFileAsync("git", ["-C", root, "status", "--porcelain"])).stdout.trim() === "";
  const sourceIdentity = clean ? await currentSourceIdentity(root) : null;
  const sourceCommit = sourceIdentity?.sourceCommit ?? null;
  const output = options.output ?? join(root, "reports/wp-g0-2-runtime-identity-production-packet",
    `runtime-identity-${sourceCommit?.slice(0, 12) ?? "precommit-template"}.tar.gz`);
  process.stdout.write(`${JSON.stringify(await buildTransportBundle({
    root, output, sourceCommit, sourceIdentity, approvalEligible: clean,
  }), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message ?? "unexpected_error" })}\n`);
    process.exitCode = 1;
  });
}
