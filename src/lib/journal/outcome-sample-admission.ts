import type { JournalEvent } from "@/lib/analysis/types";

export type OutcomeCalibrationAdmissionStatus = "blocked" | "collecting" | "ready";

export type OutcomeCalibrationAdmission = {
  allowedUse: "research_only";
  autoWeightEligible: false;
  blockers: string[];
  canAutoAdjustWeights: false;
  closedEvents: number;
  counterEvidenceEvents: number;
  expiredEvents: number;
  failedEvents: number;
  guardrail: string;
  manualCalibrationReady: boolean;
  mode: "manual_calibration_gate";
  nextStep: string;
  pendingEvents: number;
  readinessScore: number;
  sampleCount: number;
  status: OutcomeCalibrationAdmissionStatus;
  validationRatePercent: number;
  validatedEvents: number;
};

const minimumClosedSamples = 12;
const minimumValidationRate = 50;

function isOutcomeSample(event: JournalEvent) {
  return Boolean(
    event.signalId &&
    event.outcomeStatus &&
    event.action !== "calibration_review" &&
    event.action !== "outcome_executor_run" &&
    event.action !== "strategy_confirmation",
  );
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function blockers({
  closedEvents,
  counterEvidenceEvents,
  failedEvents,
  validatedEvents,
  validationRatePercent,
}: {
  closedEvents: number;
  counterEvidenceEvents: number;
  failedEvents: number;
  validatedEvents: number;
  validationRatePercent: number;
}) {
  const items: string[] = [];

  if (closedEvents < minimumClosedSamples) {
    items.push("closed_samples_below_threshold");
  }

  if (counterEvidenceEvents > validatedEvents) {
    items.push("counterevidence_dominates");
  }

  if (failedEvents >= 3 && failedEvents >= validatedEvents) {
    items.push("loss_cluster");
  }

  if (closedEvents > 0 && validationRatePercent < minimumValidationRate) {
    items.push("validation_rate_below_threshold");
  }

  return items;
}

function statusFromBlockers({
  blockers: blockerItems,
  closedEvents,
}: {
  blockers: string[];
  closedEvents: number;
}): OutcomeCalibrationAdmissionStatus {
  if (
    blockerItems.includes("counterevidence_dominates") ||
    blockerItems.includes("loss_cluster")
  ) {
    return "blocked";
  }

  if (closedEvents >= minimumClosedSamples && blockerItems.length === 0) {
    return "ready";
  }

  return "collecting";
}

function readinessScore({
  closedEvents,
  counterEvidenceEvents,
  pendingEvents,
  status,
  validatedEvents,
  validationRatePercent,
}: {
  closedEvents: number;
  counterEvidenceEvents: number;
  pendingEvents: number;
  status: OutcomeCalibrationAdmissionStatus;
  validatedEvents: number;
  validationRatePercent: number;
}) {
  if (status === "ready") {
    return 100;
  }

  if (status === "blocked") {
    return Math.max(0, Math.min(45, validationRatePercent - counterEvidenceEvents * 8));
  }

  return Math.max(0, Math.min(85, (
    closedEvents * 5 +
    validatedEvents * 6 -
    counterEvidenceEvents * 8 -
    pendingEvents * 2
  )));
}

function nextStep(status: OutcomeCalibrationAdmissionStatus) {
  if (status === "ready") {
    return "样本达到人工校准准入门槛，可以进入人工校准和回滚边界复核，不能自动改权重。";
  }

  if (status === "blocked") {
    return "反证或亏损样本占优，先保留为反证库并复查规则假设，不能提高权重。";
  }

  return "继续积累 outcome 样本，只读观察有效、反证和过期比例。";
}

export function buildOutcomeCalibrationAdmission(
  events: JournalEvent[],
): OutcomeCalibrationAdmission {
  const outcomeEvents = events.filter(isOutcomeSample);
  const pendingEvents = outcomeEvents.filter((event) => event.outcomeStatus === "pending").length;
  const validatedEvents = outcomeEvents.filter((event) =>
    event.outcomeStatus === "partial_win" || event.outcomeStatus === "saved"
  ).length;
  const failedEvents = outcomeEvents.filter((event) => event.outcomeStatus === "loss").length;
  const expiredEvents = outcomeEvents.filter((event) => event.outcomeStatus === "expired").length;
  const closedEvents = validatedEvents + failedEvents + expiredEvents;
  const counterEvidenceEvents = failedEvents + expiredEvents;
  const validationRatePercent = percentage(validatedEvents, closedEvents);
  const blockerItems = blockers({
    closedEvents,
    counterEvidenceEvents,
    failedEvents,
    validatedEvents,
    validationRatePercent,
  });
  const status = statusFromBlockers({ blockers: blockerItems, closedEvents });

  return {
    allowedUse: "research_only",
    autoWeightEligible: false,
    blockers: blockerItems,
    canAutoAdjustWeights: false,
    closedEvents,
    counterEvidenceEvents,
    expiredEvents,
    failedEvents,
    guardrail: "outcome 样本准入只服务人工校准和回滚复核，不能自动改权重。",
    manualCalibrationReady: status === "ready",
    mode: "manual_calibration_gate",
    nextStep: nextStep(status),
    pendingEvents,
    readinessScore: readinessScore({
      closedEvents,
      counterEvidenceEvents,
      pendingEvents,
      status,
      validatedEvents,
      validationRatePercent,
    }),
    sampleCount: outcomeEvents.length,
    status,
    validationRatePercent,
    validatedEvents,
  };
}
