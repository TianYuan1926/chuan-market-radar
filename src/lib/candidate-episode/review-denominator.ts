export type CandidateReviewEpisode = {
  lifecycle: "analyzed" | "closed" | "discovered" | "queued" | "validated";
};

export type CandidateReviewCheckpoint = {
  dueAt: string;
  status: "claimed" | "completed" | "pending" | "retry_wait";
};

export type CandidateReviewOutcome = {
  evidenceGrade: boolean;
  mae: number | null;
  mfe: number | null;
  status: "data_unavailable" | "missed" | "recorded";
};

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildCandidateReviewDenominator({
  checkpoints,
  episodes,
  now,
  outcomes,
}: {
  checkpoints: CandidateReviewCheckpoint[];
  episodes: CandidateReviewEpisode[];
  now: string;
  outcomes: CandidateReviewOutcome[];
}) {
  const nowMs = Date.parse(now);
  const evidenceOutcomes = outcomes.filter((outcome) => outcome.evidenceGrade);
  const recordedOutcomes = outcomes.filter((outcome) => outcome.status === "recorded");
  const missedOutcomes = outcomes.filter((outcome) => outcome.status === "missed");
  const dataUnavailableOutcomes = outcomes.filter(
    (outcome) => outcome.status === "data_unavailable",
  );
  const terminalOutcomes =
    recordedOutcomes.length + missedOutcomes.length + dataUnavailableOutcomes.length;
  const excludedReasons: Record<string, number> = {};

  for (const outcome of outcomes) {
    if (outcome.evidenceGrade) {
      continue;
    }
    const reason =
      outcome.status === "missed"
        ? "missed"
        : outcome.status === "data_unavailable"
          ? "data_unavailable"
          : "evidence_grade_false";
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
  }

  return {
    counts: {
      activeEpisodes: episodes.filter((episode) => episode.lifecycle !== "closed").length,
      claimedCheckpoints: checkpoints.filter((checkpoint) => checkpoint.status === "claimed").length,
      closedEpisodes: episodes.filter((episode) => episode.lifecycle === "closed").length,
      completedCheckpoints: checkpoints.filter((checkpoint) => checkpoint.status === "completed")
        .length,
      dataUnavailableOutcomes: dataUnavailableOutcomes.length,
      dueCheckpoints: checkpoints.filter((checkpoint) => Date.parse(checkpoint.dueAt) <= nowMs)
        .length,
      evidenceGradeOutcomes: evidenceOutcomes.length,
      metricSampleCount: evidenceOutcomes.length,
      missedOutcomes: missedOutcomes.length,
      pendingCheckpoints: checkpoints.filter((checkpoint) => checkpoint.status === "pending").length,
      recordedOutcomes: recordedOutcomes.length,
      retryWaitingCheckpoints: checkpoints.filter(
        (checkpoint) => checkpoint.status === "retry_wait",
      ).length,
      scheduledCheckpoints: checkpoints.length,
      terminalOutcomes,
      totalEpisodes: episodes.length,
    },
    metricAverages: {
      mae: average(
        evidenceOutcomes.flatMap((outcome) => (outcome.mae === null ? [] : [outcome.mae])),
      ),
      mfe: average(
        evidenceOutcomes.flatMap((outcome) => (outcome.mfe === null ? [] : [outcome.mfe])),
      ),
    },
    metricAdmission: {
      denominator: terminalOutcomes,
      denominatorLabel: "terminalOutcomes",
      excludedReasons,
      numerator: evidenceOutcomes.length,
      percentage:
        terminalOutcomes === 0 ? null : (evidenceOutcomes.length / terminalOutcomes) * 100,
    },
  };
}
