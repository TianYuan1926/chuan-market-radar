export const EXPANSION_EVENT_LABEL_VERSION =
  "significant-expansion-event.v1" as const;

export const EXPANSION_HORIZONS = ["60M", "4H", "24H"] as const;
export type ExpansionHorizon = (typeof EXPANSION_HORIZONS)[number];

export type ExpansionThresholdDefinition = {
  horizon: ExpansionHorizon;
  absoluteFloorPercent: number;
  trainingQuantile: 0.99;
  minimumLeadTimeSeconds: number;
};

export const EXPANSION_THRESHOLD_DEFINITIONS = [
  {
    absoluteFloorPercent: 5,
    horizon: "60M",
    minimumLeadTimeSeconds: 10 * 60,
    trainingQuantile: 0.99,
  },
  {
    absoluteFloorPercent: 8,
    horizon: "4H",
    minimumLeadTimeSeconds: 30 * 60,
    trainingQuantile: 0.99,
  },
  {
    absoluteFloorPercent: 15,
    horizon: "24H",
    minimumLeadTimeSeconds: 2 * 60 * 60,
    trainingQuantile: 0.99,
  },
] as const satisfies readonly ExpansionThresholdDefinition[];

export const EARLY_CAPTURE_CONTRACT = Object.freeze({
  candidateMoveConsumedMaximum: 0.25,
  eventMoveAlreadyConsumedMaximum: 0.5,
  evaluationOnly: true,
  liveModuleReadAllowed: false,
  publicBreakoutThresholdFraction: 0.25,
  requiredDenominators: [
    "candidate",
    "event",
    "matched_non_event",
  ] as const,
});

export type EarlyCaptureClass =
  | "EARLY_CAPTURE"
  | "NEAR_START"
  | "LATE"
  | "AMBIGUOUS"
  | "DATA_UNAVAILABLE";

export function thresholdDefinition(
  horizon: ExpansionHorizon,
): ExpansionThresholdDefinition {
  const definition = EXPANSION_THRESHOLD_DEFINITIONS.find(
    (candidate) => candidate.horizon === horizon,
  );

  if (!definition) {
    throw new Error(`Unknown expansion horizon: ${horizon}`);
  }

  return definition;
}

export function classifyCapture(input: {
  dataAvailable: boolean;
  horizon: ExpansionHorizon;
  leadTimeSeconds: number;
  moveConsumedFraction: number;
}): EarlyCaptureClass {
  if (!input.dataAvailable) {
    return "DATA_UNAVAILABLE";
  }

  const definition = thresholdDefinition(input.horizon);

  if (input.leadTimeSeconds <= 0 || input.moveConsumedFraction >= 0.5) {
    return "LATE";
  }

  if (
    input.leadTimeSeconds >= definition.minimumLeadTimeSeconds &&
    input.moveConsumedFraction <
      EARLY_CAPTURE_CONTRACT.candidateMoveConsumedMaximum
  ) {
    return "EARLY_CAPTURE";
  }

  if (input.leadTimeSeconds < definition.minimumLeadTimeSeconds) {
    return "NEAR_START";
  }

  return "AMBIGUOUS";
}
