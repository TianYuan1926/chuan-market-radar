#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_ID =
  "WP-G0.2-CANONICAL-COMPAT-PRODUCTION-CODE-PRESENCE-CURRENT-CYCLE";
export const EVIDENCE_SCHEMA = "candidate-canonical-compat-code-presence-evidence.v1";
export const EVIDENCE_PASS = "PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED";
export const REFERENCE_COMMIT = "3315b54dfcfcde63fcdf3a042ef92754da509feb";
export const PRODUCTION_COMMIT = REFERENCE_COMMIT;
export const PRODUCTION_TREE = "cccd5776a80ded39f712bee4909c23c8133db798";

export const REFERENCE_CODE_PATHS = Object.freeze([
  Object.freeze({
    path: "src/app/api/frontend/candidate-lifecycle/route.ts",
    blob: "cc61e446869e3b65a20ef4e0d32f52d9fde9a929",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-model.ts",
    blob: "18f37dc4016573d25d13a21033a48ff370dfd6ab",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-oracle.ts",
    blob: "bf2416a471423d541d7edb5514bec3ff2c0dd384",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-resource.ts",
    blob: "898d576c59a27176b9659e0e026f90b979c71716",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-route-adapter.ts",
    blob: "de87fce26a0701969f8b50c63d58e8481fe8b5b5",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-server.ts",
    blob: "56c70ee85ec448f27063246f4e5aa4b29b3a93da",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/canonical-read-trusted-context.ts",
    blob: "5fdeb5115a78d3bc8d89061ae80fbebbbe954fab",
  }),
  Object.freeze({
    path: "src/lib/candidate-episode/legacy-read-diagnostic.ts",
    blob: "4a4077ec3b8bc6d4a7bb901883aa0f2538d3a276",
  }),
]);

const HASH = /^[0-9a-f]{64}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{12,64}$/u;
const EVIDENCE_KEYS = Object.freeze([
  "allCodePathsIdentical", "buildRecordSha256", "candidateLifecycleApi", "codePaths",
  "composeMutation", "databaseMutation", "environmentMutation", "gitMutation",
  "healthLevel", "legacyResponseAuthority", "manifestMutation", "manifestPhase",
  "manifestSha256", "packageId", "phaseTransition", "productionCommit",
  "productionGitClean", "productionGitDetached", "productionTree", "readFlags",
  "redisMutation", "referenceCommit", "requiresWebRelease", "runningWebContainerId",
  "runningWebMatchesBuildRecord", "scanFreshness", "schemaVersion", "servicesMutated",
  "status", "targetCommit", "targetWebImageId", "verificationMode", "verifiedAt",
  "workerMutation",
]);
const API_KEYS = Object.freeze([
  "authority", "automaticPhaseAdvance", "canAuthorizeCutover", "canCreateTradePlan",
  "canMutateLiveRanking", "differenceCount", "httpStatus", "mode", "ok",
  "parityStatus", "readSource",
]);
const FLAG_KEYS = Object.freeze(["canonicalRead", "dualRead", "reviewRead"]);

export class CanonicalCompatCodePresenceError extends Error {}

function ensure(condition, reason) {
  if (!condition) throw new CanonicalCompatCodePresenceError(reason);
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

export function validateCandidateLifecycleApi(api) {
  ensure(exactKeys(api, API_KEYS), "code_presence_api_shape_invalid");
  ensure(api.httpStatus === 200 && api.ok === true
      && api.mode === "dual_read_legacy_authority"
      && api.readSource === "legacy"
      && api.authority === "legacy_projection_non_authoritative"
      && api.parityStatus === "pass" && api.differenceCount === 0
      && api.canAuthorizeCutover === false
      && api.canCreateTradePlan === false
      && api.canMutateLiveRanking === false
      && api.automaticPhaseAdvance === false,
  "code_presence_api_boundary_invalid");
  return api;
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
      && HASH.test(evidence.manifestSha256 ?? "")
      && Number.isFinite(Date.parse(evidence.verifiedAt)),
  "code_presence_runtime_identity_invalid");
  validateCodePaths(evidence.codePaths);
  ensure(exactKeys(evidence.readFlags, FLAG_KEYS)
      && evidence.readFlags.dualRead === true
      && evidence.readFlags.canonicalRead === false
      && evidence.readFlags.reviewRead === false
      && evidence.manifestPhase === "shadow_verify",
  "code_presence_shadow_verify_boundary_invalid");
  validateCandidateLifecycleApi(evidence.candidateLifecycleApi);
  ensure(evidence.verificationMode === "read_only_existing_canonical_code_identity"
      && evidence.allCodePathsIdentical === true
      && evidence.productionGitClean === true
      && evidence.productionGitDetached === true
      && evidence.runningWebMatchesBuildRecord === true
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
    manifestSha256: runtime.manifestSha256,
    manifestPhase: runtime.manifestPhase,
    readFlags: runtime.readFlags,
    candidateLifecycleApi: runtime.candidateLifecycleApi,
    healthLevel: runtime.healthLevel,
    scanFreshness: runtime.scanFreshness,
    verifiedAt: runtime.verifiedAt,
    verificationMode: "read_only_existing_canonical_code_identity",
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
  validateCodePresenceEvidence(JSON.parse(await readFile(resolve(file), "utf8")));
  process.stdout.write(`${JSON.stringify({ status: EVIDENCE_PASS })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
