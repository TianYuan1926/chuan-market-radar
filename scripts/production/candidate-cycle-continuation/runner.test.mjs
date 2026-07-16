import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCycleContinuationInput,
} from "./runner.mjs";

const valid = {
  currentMigrationId: "candidate-episode-v1",
  nextMigrationId: "candidate-episode-v1-cycle-2",
  currentReleaseId: "candidate-shadow-cycle-current",
  nextReleaseId: "candidate-shadow-cycle-next",
  approvalDigest: `sha256:${"a".repeat(64)}`,
};

test("cycle continuation requires an adjacent immutable cycle identity", () => {
  assert.deepEqual(validateCycleContinuationInput(valid), valid);
  for (const nextMigrationId of [
    "candidate-episode-v1-cycle-1",
    "candidate-episode-v1-cycle-3",
    "candidate-episode-v2",
  ]) {
    assert.throws(
      () => validateCycleContinuationInput({ ...valid, nextMigrationId }),
      /candidate validation cycle continuation rejected|candidate_validation_cycle/,
    );
  }
});

test("cycle continuation rejects weak release and approval identities", () => {
  assert.throws(
    () => validateCycleContinuationInput({ ...valid, approvalDigest: "sha256:short" }),
    /approval_digest_invalid/,
  );
  assert.throws(
    () => validateCycleContinuationInput({ ...valid, nextReleaseId: "release" }),
    /next_release_invalid/,
  );
});
