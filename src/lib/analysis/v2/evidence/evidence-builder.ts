import type {
  EvidenceItem,
} from "./evidence-types";

export type EvidenceSourceResult = {
  evidence: EvidenceItem[];
};

export function collectEvidence(results: Array<EvidenceItem | EvidenceSourceResult>): EvidenceItem[] {
  return results.flatMap((result) => ("evidence" in result ? result.evidence : [result]));
}
