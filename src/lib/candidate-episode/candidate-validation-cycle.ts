export const CANDIDATE_MIGRATION_FAMILY = "candidate-episode-v1" as const;
export const CANDIDATE_RUNTIME_MIGRATION_ID_ENV = "CANDIDATE_RUNTIME_MIGRATION_ID" as const;

const cyclePattern = /^candidate-episode-v1(?:-cycle-([1-9][0-9]{0,5}))?$/;

export type CandidateValidationCycleIdentity = Readonly<{
  cycleNumber: number;
  migrationId: string;
}>;

export function parseCandidateValidationCycleId(
  value: unknown,
): CandidateValidationCycleIdentity {
  if (typeof value !== "string") {
    throw new Error("candidate_validation_cycle_id_invalid");
  }
  const match = cyclePattern.exec(value.trim());
  if (!match) throw new Error("candidate_validation_cycle_id_invalid");
  const cycleNumber = match[1] ? Number(match[1]) : 1;
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1) {
    throw new Error("candidate_validation_cycle_number_invalid");
  }
  if (cycleNumber === 1 && value.trim() !== CANDIDATE_MIGRATION_FAMILY) {
    throw new Error("candidate_validation_cycle_one_alias_forbidden");
  }
  return { cycleNumber, migrationId: value.trim() };
}

export function candidateValidationCycleId(cycleNumber: number) {
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > 999_999) {
    throw new Error("candidate_validation_cycle_number_invalid");
  }
  return cycleNumber === 1
    ? CANDIDATE_MIGRATION_FAMILY
    : `${CANDIDATE_MIGRATION_FAMILY}-cycle-${cycleNumber}`;
}

export function nextCandidateValidationCycleId(currentMigrationId: string) {
  const current = parseCandidateValidationCycleId(currentMigrationId);
  return candidateValidationCycleId(current.cycleNumber + 1);
}

export function resolveCandidateValidationCycleId(
  env: Record<string, string | undefined>,
) {
  const configured = env[CANDIDATE_RUNTIME_MIGRATION_ID_ENV];
  return parseCandidateValidationCycleId(
    configured === undefined ? CANDIDATE_MIGRATION_FAMILY : configured.trim(),
  ).migrationId;
}
