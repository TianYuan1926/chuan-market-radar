import type {
  EvidenceItem,
} from "../evidence/evidence-types";

export type InvalidationCheck = {
  invalidated: boolean;
  evidenceIds: string[];
  reason: string | null;
};

export function checkInvalidation(evidence: EvidenceItem[], forcedInvalidated = false): InvalidationCheck {
  const invalidationEvidence = evidence.filter((item) => /invalidated|fell_back_inside|failed_breakout/i.test(item.label));

  return {
    invalidated: forcedInvalidated || invalidationEvidence.length > 0,
    evidenceIds: invalidationEvidence.map((item) => item.id),
    reason: invalidationEvidence[0]?.fact ?? (forcedInvalidated ? "Structure invalidated by caller boundary." : null),
  };
}
