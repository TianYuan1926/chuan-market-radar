import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_PASS,
  EVIDENCE_SCHEMA,
  PRODUCTION_COMMIT,
  PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
  validateCodePresenceEvidence,
} from "./runner.mjs";

const image = `sha256:${"1".repeat(64)}`;
const container = "2".repeat(64);
const buildRecordSha256 = "3".repeat(64);
const cycle5ProductionCommit = "94b6d415573f5d8b2d0190c809a4b8e128a25aa8";
const cycle5ProductionTree = "3d362ceaad05f24f705efe2d871a5a46c3d8704e";

function runtime(overrides = {}) {
  return {
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    productionBlobs: Object.fromEntries(REFERENCE_CODE_PATHS.map((item) => [item.path, item.blob])),
    runningWebContainerId: container,
    runningWebImageId: image,
    buildRecordWebImageId: image,
    buildRecordSha256,
    productionGitClean: true,
    productionGitDetached: true,
    candidateReadManifestAbsent: true,
    candidateReadEndpointFailClosed: true,
    healthLevel: "ready",
    scanFreshness: "fresh",
    verifiedAt: "2026-07-19T01:50:00.000Z",
    ...overrides,
  };
}

test("builds only a complete zero-mutation code-presence PASS", () => {
  const evidence = buildCodePresenceEvidence(runtime());
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA);
  assert.equal(evidence.status, EVIDENCE_PASS);
  assert.deepEqual(evidence.servicesMutated, []);
  assert.equal(evidence.requiresWebRelease, false);
  assert.equal(validateCodePresenceEvidence(evidence), evidence);
});

test("rejects blob, production Git, build record, health, and mutation drift", () => {
  const firstPath = REFERENCE_CODE_PATHS[0].path;
  for (const changed of [
    { productionBlobs: { ...runtime().productionBlobs, [firstPath]: "4".repeat(40) } },
    { productionCommit: "5".repeat(40) },
    { productionTree: "6".repeat(40) },
    { productionGitClean: false },
    { productionGitDetached: false },
    { candidateReadManifestAbsent: false },
    { candidateReadEndpointFailClosed: false },
    { buildRecordWebImageId: `sha256:${"7".repeat(64)}` },
    { healthLevel: "degraded" },
    { scanFreshness: "aging" },
  ]) assert.throws(() => buildCodePresenceEvidence(runtime(changed)));

  const evidence = buildCodePresenceEvidence(runtime());
  assert.throws(() => validateCodePresenceEvidence({
    ...evidence,
    servicesMutated: ["web"],
  }), /code_presence_mutation_boundary_invalid/u);
});

test("rejects Cycle-5 production identity as current-cycle evidence", () => {
  assert.throws(() => buildCodePresenceEvidence(runtime({
    productionCommit: cycle5ProductionCommit,
    productionTree: cycle5ProductionTree,
  })), /code_presence_git_identity_invalid/u);

  const current = buildCodePresenceEvidence(runtime());
  assert.throws(() => validateCodePresenceEvidence({
    ...current,
    productionCommit: cycle5ProductionCommit,
    productionTree: cycle5ProductionTree,
    targetCommit: cycle5ProductionCommit,
  }), /code_presence_git_identity_invalid/u);
});
