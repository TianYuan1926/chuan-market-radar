import assert from "node:assert/strict";
import test from "node:test";
import {
  renderCycleContinuationEnvironment,
  renderDisabledCandidateEnvironment,
  validateCycleContinuationInput,
} from "./runner.mjs";

const valid = {
  currentAuthorityEpoch: 3,
  currentMigrationId: "candidate-episode-v1",
  currentPhase: "shadow_capture",
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
    () => validateCycleContinuationInput({ ...valid, currentAuthorityEpoch: 2 }),
    /current_phase_epoch_mismatch/,
  );
  assert.throws(
    () => validateCycleContinuationInput({ ...valid, currentPhase: "legacy" }),
    /current_phase_epoch_mismatch/,
  );
  assert.throws(
    () => validateCycleContinuationInput({ ...valid, nextReleaseId: "release" }),
    /next_release_invalid/,
  );
});

const activeEnvironment = `
CANDIDATE_EPISODE_CANONICAL_WRITE=false
CANDIDATE_EPISODE_SHADOW_WRITE=true
CANDIDATE_EPISODE_DUAL_READ=false
CANDIDATE_EPISODE_CANONICAL_READ=false
CANDIDATE_EPISODE_REVIEW_READ=false
CANDIDATE_SHADOW_WORKER_EXPECTED=true
CANDIDATE_RUNTIME_MIGRATION_ID=candidate-episode-v1
CANDIDATE_RUNTIME_RELEASE_ID=candidate-shadow-cycle-current
UNRELATED_VALUE=preserved
`;

test("continuation environment requires the exact active source identity", () => {
  const rendered = renderCycleContinuationEnvironment(activeEnvironment, valid);
  assert.match(rendered, /CANDIDATE_RUNTIME_MIGRATION_ID="candidate-episode-v1-cycle-2"/u);
  assert.match(rendered, /CANDIDATE_RUNTIME_RELEASE_ID="candidate-shadow-cycle-next"/u);
  assert.match(rendered, /UNRELATED_VALUE=preserved/u);
  assert.throws(() => renderCycleContinuationEnvironment(
    activeEnvironment.replace("CANDIDATE_EPISODE_SHADOW_WRITE=true", "CANDIDATE_EPISODE_SHADOW_WRITE=false"),
    valid,
  ), /candidate_environment_source_mismatch/u);
  assert.throws(() => renderCycleContinuationEnvironment(
    activeEnvironment.replace("candidate-shadow-cycle-current", "candidate-shadow-another-release"),
    valid,
  ), /current_environment_release_mismatch/u);
});

test("continuation can restart from an exactly frozen latest cycle without reviving it", () => {
  const disabled = renderDisabledCandidateEnvironment(activeEnvironment, valid.nextMigrationId);
  const retry = {
    ...valid,
    currentAuthorityEpoch: 4,
    currentMigrationId: valid.nextMigrationId,
    currentPhase: "legacy",
    currentReleaseId: valid.nextReleaseId,
    nextMigrationId: "candidate-episode-v1-cycle-3",
    nextReleaseId: "candidate-shadow-cycle-third",
  };
  const rendered = renderCycleContinuationEnvironment(disabled, retry);
  assert.match(rendered, /CANDIDATE_EPISODE_SHADOW_WRITE="true"/u);
  assert.match(rendered, /CANDIDATE_SHADOW_WORKER_EXPECTED="true"/u);
  assert.match(rendered, /CANDIDATE_RUNTIME_MIGRATION_ID="candidate-episode-v1-cycle-3"/u);
  assert.match(rendered, /CANDIDATE_RUNTIME_RELEASE_ID="candidate-shadow-cycle-third"/u);
});

test("rollback environment disables every Candidate authority flag", () => {
  const rendered = renderDisabledCandidateEnvironment(activeEnvironment, valid.nextMigrationId);
  for (const key of [
    "CANDIDATE_EPISODE_CANONICAL_WRITE",
    "CANDIDATE_EPISODE_SHADOW_WRITE",
    "CANDIDATE_EPISODE_DUAL_READ",
    "CANDIDATE_EPISODE_CANONICAL_READ",
    "CANDIDATE_EPISODE_REVIEW_READ",
    "CANDIDATE_SHADOW_WORKER_EXPECTED",
  ]) assert.match(rendered, new RegExp(`${key}="false"`, "u"));
  assert.match(rendered, /CANDIDATE_RUNTIME_RELEASE_ID="disabled"/u);
  assert.match(rendered, /CANDIDATE_RUNTIME_MIGRATION_ID="candidate-episode-v1-cycle-2"/u);
});
