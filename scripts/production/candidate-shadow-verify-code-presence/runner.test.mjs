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
