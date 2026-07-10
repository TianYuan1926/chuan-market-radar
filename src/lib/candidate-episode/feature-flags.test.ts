import assert from "node:assert/strict";
import test from "node:test";
import * as featureFlags from "./feature-flags";

test("candidate feature flags fail closed except for explicit rehearsal enablement", () => {
  const subject = featureFlags;

  assert.equal(typeof subject.resolveCandidateFeatureFlags, "function");
  assert.deepEqual(subject.CANDIDATE_FEATURE_FLAG_NAMES, [
    "CANDIDATE_EPISODE_CANONICAL_WRITE",
    "CANDIDATE_EPISODE_SHADOW_WRITE",
    "CANDIDATE_EPISODE_DUAL_READ",
    "CANDIDATE_EPISODE_CANONICAL_READ",
    "CANDIDATE_EPISODE_REVIEW_READ",
  ]);

  const allEnabled = Object.fromEntries(
    subject.CANDIDATE_FEATURE_FLAG_NAMES!.map((name) => [name, true]),
  );
  const allDisabled = Object.fromEntries(
    subject.CANDIDATE_FEATURE_FLAG_NAMES!.map((name) => [name, false]),
  );

  assert.deepEqual(
    subject.resolveCandidateFeatureFlags!({ environment: "rehearsal" }),
    allDisabled,
  );
  assert.deepEqual(
    subject.resolveCandidateFeatureFlags!({
      environment: "rehearsal",
      explicitRehearsalEnablement: true,
      requested: allEnabled,
    }),
    allEnabled,
  );
  assert.deepEqual(
    subject.resolveCandidateFeatureFlags!({
      environment: "rehearsal",
      explicitRehearsalEnablement: true,
      requested: { ...allEnabled, CANDIDATE_EPISODE_REVIEW_READ: "true" },
    }),
    allDisabled,
  );
  assert.deepEqual(
    subject.resolveCandidateFeatureFlags!({
      environment: "rehearsal",
      explicitRehearsalEnablement: true,
      requested: { ...allEnabled, unknownCandidateFlag: true },
    }),
    allDisabled,
  );
  assert.deepEqual(
    subject.resolveCandidateFeatureFlags!({
      environment: "production",
      explicitRehearsalEnablement: true,
      requested: allEnabled,
    }),
    allDisabled,
  );
  assert.equal(subject.CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED, false);
});

test("authority phases are named and authority epochs fail closed unless current or monotonic", () => {
  const subject = featureFlags;

  assert.deepEqual(subject.CANDIDATE_AUTHORITY_PHASES, [
    "legacy",
    "shadow_capture",
    "shadow_verify",
    "canonical_compat",
    "canonical",
  ]);
  assert.equal(typeof subject.isCandidateAuthorityPhase, "function");
  assert.equal(subject.isCandidateAuthorityPhase!("shadow_verify"), true);
  assert.equal(subject.isCandidateAuthorityPhase!("SHADOW_VERIFY"), false);
  assert.equal(subject.isCandidateAuthorityPhase!(null), false);

  assert.equal(typeof subject.isMonotonicCandidateAuthorityEpoch, "function");
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, 5), true);
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, 9), true);
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, 4), false);
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, 3), false);
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, 4.5), false);
  assert.equal(subject.isMonotonicCandidateAuthorityEpoch!(4, "5"), false);

  assert.equal(typeof subject.isCurrentCandidateAuthorityEpoch, "function");
  assert.equal(subject.isCurrentCandidateAuthorityEpoch!(7, 7), true);
  assert.equal(subject.isCurrentCandidateAuthorityEpoch!(7, 6), false);
  assert.equal(subject.isCurrentCandidateAuthorityEpoch!(-1, -1), false);
});

test("cutover eligibility enforces the non-resettable 72h deadline and both clean gates", () => {
  const subject = featureFlags;
  const shadowStartedAt = "2026-07-10T00:00:00.000Z";
  const deadlineAt = "2026-07-13T00:00:00.000Z";
  const base = {
    shadowStartedAt,
    deadlineAt,
    evaluatedAt: "2026-07-11T00:00:00.000Z",
    cleanWindowStartedAt: shadowStartedAt,
    comparisonDiffCount: 0,
    writeAttempts: 10_000,
  };

  assert.equal(subject.CANDIDATE_DUAL_PROJECTION_DEADLINE_MS, 72 * 60 * 60 * 1_000);
  assert.equal(subject.CANDIDATE_CLEAN_WINDOW_MS, 24 * 60 * 60 * 1_000);
  assert.equal(subject.CANDIDATE_MINIMUM_WRITE_ATTEMPTS, 10_000);
  assert.equal(subject.calculateCandidateCutoverDeadline!(shadowStartedAt), deadlineAt);

  assert.deepEqual(subject.calculateCandidateCutoverEligibility!(base), {
    eligible: true,
    status: "eligible",
    expectedDeadlineAt: deadlineAt,
    cleanWindowMs: 24 * 60 * 60 * 1_000,
    reasons: [],
  });

  const shortCleanWindow = subject.calculateCandidateCutoverEligibility!({
    ...base,
    cleanWindowStartedAt: "2026-07-10T01:00:00.000Z",
  });
  assert.equal(shortCleanWindow.eligible, false);
  assert.equal(shortCleanWindow.status, "blocked");
  assert.deepEqual(shortCleanWindow.reasons, ["insufficient_clean_window"]);

  const insufficientWrites = subject.calculateCandidateCutoverEligibility!({
    ...base,
    writeAttempts: 9_999,
  });
  assert.deepEqual(insufficientWrites.reasons, ["insufficient_write_attempts"]);

  const dirtyComparison = subject.calculateCandidateCutoverEligibility!({
    ...base,
    comparisonDiffCount: 1,
  });
  assert.deepEqual(dirtyComparison.reasons, ["comparison_differences"]);

  const resetDeadline = subject.calculateCandidateCutoverEligibility!({
    ...base,
    deadlineAt: "2026-07-14T00:00:00.000Z",
  });
  assert.equal(resetDeadline.eligible, false);
  assert.equal(resetDeadline.status, "invalid");
  assert.deepEqual(resetDeadline.reasons, ["deadline_mismatch"]);

  const expired = subject.calculateCandidateCutoverEligibility!({
    ...base,
    evaluatedAt: "2026-07-13T00:00:00.001Z",
  });
  assert.equal(expired.eligible, false);
  assert.equal(expired.status, "expired");
  assert.deepEqual(expired.reasons, ["deadline_exceeded"]);

  const malformed = subject.calculateCandidateCutoverEligibility!({
    ...base,
    writeAttempts: "10000",
  });
  assert.equal(malformed.eligible, false);
  assert.equal(malformed.status, "invalid");
  assert.deepEqual(malformed.reasons, ["invalid_input"]);

  assert.deepEqual(subject.calculateCandidateCutoverEligibility!(undefined), {
    eligible: false,
    status: "invalid",
    expectedDeadlineAt: null,
    cleanWindowMs: null,
    reasons: ["invalid_input"],
  });
});
