import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_MIGRATION_FAMILY,
  candidateValidationCycleId,
  nextCandidateValidationCycleId,
  parseCandidateValidationCycleId,
  resolveCandidateValidationCycleId,
} from "./candidate-validation-cycle";

test("validation cycle identity keeps cycle one backward compatible and advances explicitly", () => {
  assert.deepEqual(parseCandidateValidationCycleId(CANDIDATE_MIGRATION_FAMILY), {
    cycleNumber: 1,
    migrationId: CANDIDATE_MIGRATION_FAMILY,
  });
  assert.equal(nextCandidateValidationCycleId(CANDIDATE_MIGRATION_FAMILY),
    "candidate-episode-v1-cycle-2");
  assert.equal(nextCandidateValidationCycleId("candidate-episode-v1-cycle-12"),
    "candidate-episode-v1-cycle-13");
  assert.equal(candidateValidationCycleId(1), CANDIDATE_MIGRATION_FAMILY);
});

test("runtime cycle defaults to cycle one and rejects aliases or unrelated identities", () => {
  assert.equal(resolveCandidateValidationCycleId({}), CANDIDATE_MIGRATION_FAMILY);
  assert.equal(resolveCandidateValidationCycleId({
    CANDIDATE_RUNTIME_MIGRATION_ID: "candidate-episode-v1-cycle-2",
  }), "candidate-episode-v1-cycle-2");
  for (const value of [
    "candidate-episode-v1-cycle-1",
    "candidate-episode-v1-cycle-02",
    "candidate-episode-v2",
    "../candidate-episode-v1",
    "",
  ]) {
    assert.throws(
      () => resolveCandidateValidationCycleId({ CANDIDATE_RUNTIME_MIGRATION_ID: value }),
      /candidate_validation_cycle/,
    );
  }
});
