#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID =
  "WP-G0.2-SHADOW-VERIFY-PRODUCTION-CODE-PRESENCE-IDENTITY-REMEDIATION";
export const EVIDENCE_SCHEMA = "candidate-shadow-verify-code-presence-evidence.v1";
export const EVIDENCE_PASS = "PASS_PRODUCTION_SHADOW_VERIFY_CODE_PRESENCE_VERIFIED";
export const REFERENCE_COMMIT = "eb48827b8b403452328b65dc4b415c3fc0ecf765";
export const PRODUCTION_COMMIT = "94b6d415573f5d8b2d0190c809a4b8e128a25aa8";
export const PRODUCTION_TREE = "3d362ceaad05f24f705efe2d871a5a46c3d8704e";

export const REFERENCE_CODE_PATHS = Object.freeze([
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-model.test.ts",
    blob: "654fac4bf10cb31997c4cbb5beee283a3a54a724",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-model.ts",
    blob: "18f37dc4016573d25d13a21033a48ff370dfd6ab",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-route-adapter.test.ts",
    blob: "2d769242772c259bc6751e4b0c9475890f9eb8ed",
  }),
]);

const HASH = /^[0-9a-f]{64}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const EVIDENCE_KEYS = Object.freeze([
  "allCodePathsIdentical", "buildRecordSha256", "codePaths", "composeMutation",
  "candidateReadEndpointFailClosed", "candidateReadManifestAbsent", "databaseMutation",
  "environmentMutation", "gitMutation", "healthLevel", "legacyResponseAuthority",
  "manifestMutation", "packageId", "phaseTransition",
  "productionCommit", "productionGitClean", "productionGitDetached", "productionTree",
  "redisMutation", "referenceCommit", "requiresWebRelease", "runningWebContainerId",
  "runningWebMatchesBuildRecord", "scanFreshness", "schemaVersion", "servicesMutated",
  "status", "targetCommit", "targetWebImageId", "verificationMode", "verifiedAt",
  "workerMutation",
]);

export class CodePresenceError extends Error {}

function ensure(condition, reason) {
  if (!condition) throw new CodePresenceError(reason);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateCodePaths(codePaths) {
  ensure(Array.isArray(codePaths) && codePaths.length === REFERENCE_CODE_PATHS.length,
    "code_presence_path_count_invalid");
  for (let index = 0; index < REFERENCE_CODE_PATHS.length; index += 1) {
    const expected = REFERENCE_CODE_PATHS[index];
    const actual = codePaths[index];
    ensure(exactKeys(actual, ["path", "productionBlob", "referenceBlob"])
        && actual.path === expected.path
        && actual.referenceBlob === expected.blob
        && actual.productionBlob === expected.blob,
    `code_presence_blob_mismatch:${expected.path}`);
  }
  return codePaths;
}

export function validateCodePresenceEvidence(evidence) {
  ensure(exactKeys(evidence, EVIDENCE_KEYS), "code_presence_evidence_shape_invalid");
  ensure(evidence.schemaVersion === EVIDENCE_SCHEMA && evidence.status === EVIDENCE_PASS
      && evidence.packageId === PACKAGE_ID, "code_presence_evidence_identity_invalid");
  ensure(evidence.referenceCommit === REFERENCE_COMMIT
      && evidence.productionCommit === PRODUCTION_COMMIT
      && evidence.productionTree === PRODUCTION_TREE
      && evidence.targetCommit === PRODUCTION_COMMIT,
  "code_presence_git_identity_invalid");
  ensure(IMAGE.test(evidence.targetWebImageId ?? "")
      && CONTAINER.test(evidence.runningWebContainerId ?? "")
      && HASH.test(evidence.buildRecordSha256 ?? "")
      && Number.isFinite(Date.parse(evidence.verifiedAt)),
  "code_presence_runtime_identity_invalid");
  validateCodePaths(evidence.codePaths);
  ensure(evidence.verificationMode === "read_only_existing_code_identity"
      && evidence.allCodePathsIdentical === true
      && evidence.productionGitClean === true
      && evidence.productionGitDetached === true
      && evidence.runningWebMatchesBuildRecord === true
      && evidence.candidateReadManifestAbsent === true
      && evidence.candidateReadEndpointFailClosed === true
      && evidence.healthLevel === "ready"
      && evidence.scanFreshness === "fresh"
      && evidence.requiresWebRelease === false
      && evidence.legacyResponseAuthority === true,
  "code_presence_verification_incomplete");
  ensure(Array.isArray(evidence.servicesMutated) && evidence.servicesMutated.length === 0
      && evidence.databaseMutation === false && evidence.redisMutation === false
      && evidence.workerMutation === false && evidence.phaseTransition === false
      && evidence.manifestMutation === false && evidence.environmentMutation === false
      && evidence.composeMutation === false && evidence.gitMutation === false,
  "code_presence_mutation_boundary_invalid");
  return evidence;
}

export function buildCodePresenceEvidence(runtime) {
  const codePaths = REFERENCE_CODE_PATHS.map(({ path, blob }) => ({
    path,
    referenceBlob: blob,
    productionBlob: runtime.productionBlobs?.[path],
  }));
  return validateCodePresenceEvidence({
    schemaVersion: EVIDENCE_SCHEMA,
    status: EVIDENCE_PASS,
    packageId: PACKAGE_ID,
    referenceCommit: REFERENCE_COMMIT,
    productionCommit: runtime.productionCommit,
    productionTree: runtime.productionTree,
    targetCommit: runtime.productionCommit,
    targetWebImageId: runtime.runningWebImageId,
    runningWebContainerId: runtime.runningWebContainerId,
    buildRecordSha256: runtime.buildRecordSha256,
    codePaths,
    allCodePathsIdentical: codePaths.every((item) => item.referenceBlob === item.productionBlob),
    productionGitClean: runtime.productionGitClean,
    productionGitDetached: runtime.productionGitDetached,
    runningWebMatchesBuildRecord:
      runtime.runningWebImageId === runtime.buildRecordWebImageId,
    candidateReadManifestAbsent: runtime.candidateReadManifestAbsent,
    candidateReadEndpointFailClosed: runtime.candidateReadEndpointFailClosed,
    healthLevel: runtime.healthLevel,
    scanFreshness: runtime.scanFreshness,
    verifiedAt: runtime.verifiedAt,
    verificationMode: "read_only_existing_code_identity",
    requiresWebRelease: false,
    servicesMutated: [],
    databaseMutation: false,
    redisMutation: false,
    workerMutation: false,
    phaseTransition: false,
    manifestMutation: false,
    environmentMutation: false,
    composeMutation: false,
    gitMutation: false,
    legacyResponseAuthority: true,
  });
}

async function main() {
  const [command, file] = process.argv.slice(2);
  ensure(command === "validate" && file, "usage: runner.mjs validate FILE");
  const evidence = JSON.parse(await readFile(resolve(file), "utf8"));
  validateCodePresenceEvidence(evidence);
  process.stdout.write(`${JSON.stringify({ status: EVIDENCE_PASS })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
