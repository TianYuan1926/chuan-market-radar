import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidateReviewDenominator } from "./review-denominator";

test("review denominator separates Episode, Checkpoint, terminal and metric populations", () => {
  const result = buildCandidateReviewDenominator({
    checkpoints: [
      { dueAt: "2026-07-10T00:00:00.000Z", status: "pending" },
      { dueAt: "2026-07-10T00:00:00.000Z", status: "claimed" },
      { dueAt: "2026-07-10T00:00:00.000Z", status: "retry_wait" },
      { dueAt: "2026-07-11T00:00:00.000Z", status: "completed" },
    ],
    episodes: [
      { lifecycle: "discovered" },
      { lifecycle: "closed" },
    ],
    now: "2026-07-10T12:00:00.000Z",
    outcomes: [
      { evidenceGrade: true, mae: -0.02, mfe: 0.08, status: "recorded" },
      { evidenceGrade: false, mae: null, mfe: null, status: "recorded" },
      { evidenceGrade: false, mae: null, mfe: null, status: "missed" },
      { evidenceGrade: false, mae: null, mfe: null, status: "data_unavailable" },
    ],
  });

  assert.deepEqual(result.counts, {
    activeEpisodes: 1,
    claimedCheckpoints: 1,
    closedEpisodes: 1,
    completedCheckpoints: 1,
    dataUnavailableOutcomes: 1,
    dueCheckpoints: 3,
    evidenceGradeOutcomes: 1,
    metricSampleCount: 1,
    missedOutcomes: 1,
    pendingCheckpoints: 1,
    recordedOutcomes: 2,
    retryWaitingCheckpoints: 1,
    scheduledCheckpoints: 4,
    terminalOutcomes: 4,
    totalEpisodes: 2,
  });
  assert.deepEqual(result.metricAverages, { mae: -0.02, mfe: 0.08 });
  assert.deepEqual(result.metricAdmission, {
    denominator: 4,
    denominatorLabel: "terminalOutcomes",
    excludedReasons: {
      data_unavailable: 1,
      evidence_grade_false: 1,
      missed: 1,
    },
    numerator: 1,
    percentage: 25,
  });
});

test("zero denominator returns null percentage and null averages", () => {
  const result = buildCandidateReviewDenominator({
    checkpoints: [],
    episodes: [],
    now: "2026-07-10T12:00:00.000Z",
    outcomes: [],
  });

  assert.equal(result.metricAdmission.percentage, null);
  assert.deepEqual(result.metricAverages, { mae: null, mfe: null });
});
