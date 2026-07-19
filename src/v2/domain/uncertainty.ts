export const UNCERTAINTY_DIMENSIONS = [
  "data",
  "model",
  "market",
  "execution",
] as const;

export type UncertaintyDimension = (typeof UNCERTAINTY_DIMENSIONS)[number];

export type UncertaintyStatus = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type UncertaintyAssessment = {
  dimension: UncertaintyDimension;
  status: UncertaintyStatus;
  reasonCodes: readonly string[];
  sampleSize: number | null;
  calibrationVersion: string | null;
  lastValidatedAt: string | null;
};

export type UncertaintyVector = Readonly<
  Record<UncertaintyDimension, UncertaintyAssessment>
>;
