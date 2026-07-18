import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EVIDENCE_PASS,
  PRODUCTION_COMMIT,
  PRODUCTION_TREE,
  REFERENCE_CODE_PATHS,
  buildCodePresenceEvidence,
  validateCodePresenceEvidence,
} from "./runner.mjs";

const image = `sha256:${"1".repeat(64)}`;

function runtime() {
  return {
    productionCommit: PRODUCTION_COMMIT,
    productionTree: PRODUCTION_TREE,
    productionBlobs: Object.fromEntries(REFERENCE_CODE_PATHS.map(({ path, blob }) => [path, blob])),
    runningWebImageId: image,
    buildRecordWebImageId: image,
    runningWebContainerId: "a".repeat(64),
    buildRecordSha256: "2".repeat(64),
    productionGitClean: true,
    productionGitDetached: true,
    manifestSha256: "3".repeat(64),
    manifestPhase: "shadow_verify",
    readFlags: { dualRead: true, canonicalRead: false, reviewRead: false },
    candidateLifecycleApi: {
      httpStatus: 200,
      ok: true,
      mode: "dual_read_legacy_authority",
      readSource: "legacy",
      authority: "legacy_projection_non_authoritative",
      parityStatus: "pass",
      differenceCount: 0,
      canAuthorizeCutover: false,
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      automaticPhaseAdvance: false,
    },
    healthLevel: "ready",
    scanFreshness: "fresh",
    verifiedAt: "2026-07-20T05:00:00.000Z",
  };
}

test("accepts exact current production Canonical code under Shadow Verify Legacy authority", () => {
  const evidence = buildCodePresenceEvidence(runtime());
  assert.equal(evidence.status, EVIDENCE_PASS);
  assert.equal(evidence.codePaths.length, 8);
  assert.equal(evidence.manifestPhase, "shadow_verify");
  assert.equal(evidence.candidateLifecycleApi.readSource, "legacy");
  assert.equal(validateCodePresenceEvidence(evidence), evidence);
});

test("rejects any Canonical blob drift", () => {
  const changed = runtime();
  changed.productionBlobs[REFERENCE_CODE_PATHS[4].path] = "f".repeat(40);
  assert.throws(() => buildCodePresenceEvidence(changed), /code_presence_blob_mismatch/u);
});

test("rejects Canonical authority or a missing Shadow Verify manifest", () => {
  assert.throws(() => buildCodePresenceEvidence({
    ...runtime(),
    manifestPhase: "canonical_compat",
  }), /code_presence_shadow_verify_boundary_invalid/u);
  assert.throws(() => buildCodePresenceEvidence({
    ...runtime(),
    readFlags: { dualRead: true, canonicalRead: true, reviewRead: true },
  }), /code_presence_shadow_verify_boundary_invalid/u);
  assert.throws(() => buildCodePresenceEvidence({
    ...runtime(),
    candidateLifecycleApi: {
      ...runtime().candidateLifecycleApi,
      readSource: "candidate",
    },
  }), /code_presence_api_boundary_invalid/u);
});

test("rejects runtime identity drift and every mutation claim", () => {
  assert.throws(() => buildCodePresenceEvidence({
    ...runtime(),
    productionTree: "f".repeat(40),
  }), /code_presence_git_identity_invalid/u);
  const evidence = buildCodePresenceEvidence(runtime());
  assert.throws(() => validateCodePresenceEvidence({
    ...evidence,
    servicesMutated: ["web"],
  }), /code_presence_mutation_boundary_invalid/u);
});
