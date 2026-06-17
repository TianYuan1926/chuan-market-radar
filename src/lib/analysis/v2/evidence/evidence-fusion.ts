import {
  createEvidenceLedger,
} from "./evidence-ledger";
import type {
  EvidenceFamily,
  EvidenceItem,
} from "./evidence-types";

export const evidenceFamilyCaps: Record<EvidenceFamily, number> = {
  PRICE_STRUCTURE: 0.35,
  LOCATION_RR: 0.2,
  VOLUME_VOLATILITY: 0.2,
  DERIVATIVES: 0.2,
  RELATIVE_STRENGTH: 0.15,
  MARKET_REGIME: 0.15,
  TECHNICAL_INDICATOR: 0.15,
};

const familyPriority: EvidenceFamily[] = [
  "PRICE_STRUCTURE",
  "LOCATION_RR",
  "VOLUME_VOLATILITY",
  "DERIVATIVES",
  "RELATIVE_STRENGTH",
  "MARKET_REGIME",
  "TECHNICAL_INDICATOR",
];

export type WeightedEvidenceItem = EvidenceItem & {
  appliedWeight: number;
};

export type FusedEvidenceSummary = {
  weightedEvidence: WeightedEvidenceItem[];
  familyWeights: Record<EvidenceFamily, number>;
  cappedFamilies: EvidenceFamily[];
  dominantFamily: EvidenceFamily | null;
  dedupedCount: number;
};

function emptyFamilyWeights(): Record<EvidenceFamily, number> {
  return {
    PRICE_STRUCTURE: 0,
    LOCATION_RR: 0,
    VOLUME_VOLATILITY: 0,
    DERIVATIVES: 0,
    RELATIVE_STRENGTH: 0,
    MARKET_REGIME: 0,
    TECHNICAL_INDICATOR: 0,
  };
}

function rounded(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function rawWeight(item: EvidenceItem) {
  const confidenceScale = Math.max(0, Math.min(1, item.confidence / 100));

  return Math.max(0, item.weightHint * confidenceScale);
}

export function fuseEvidence(items: EvidenceItem[]): FusedEvidenceSummary {
  const deduped = createEvidenceLedger(items).all();
  const rawByFamily = new Map<EvidenceFamily, Array<{ item: EvidenceItem; raw: number }>>();

  for (const item of deduped) {
    const bucket = rawByFamily.get(item.family) ?? [];

    bucket.push({ item, raw: rawWeight(item) });
    rawByFamily.set(item.family, bucket);
  }

  const familyWeights = emptyFamilyWeights();
  const cappedFamilies: EvidenceFamily[] = [];
  const weightedEvidence: WeightedEvidenceItem[] = [];

  for (const family of familyPriority) {
    const bucket = rawByFamily.get(family) ?? [];
    const rawTotal = bucket.reduce((total, entry) => total + entry.raw, 0);
    const cap = evidenceFamilyCaps[family];
    const scale = rawTotal > cap && rawTotal > 0 ? cap / rawTotal : 1;

    if (rawTotal > cap) {
      cappedFamilies.push(family);
    }

    for (const entry of bucket) {
      const appliedWeight = rounded(entry.raw * scale);

      familyWeights[family] = rounded(familyWeights[family] + appliedWeight);
      weightedEvidence.push({
        ...entry.item,
        appliedWeight,
      });
    }
  }

  const dominantFamily = familyPriority
    .filter((family) => familyWeights[family] > 0)
    .sort((left, right) => {
      const weightDelta = familyWeights[right] - familyWeights[left];

      return weightDelta !== 0 ? weightDelta : familyPriority.indexOf(left) - familyPriority.indexOf(right);
    })[0] ?? null;

  return {
    weightedEvidence,
    familyWeights,
    cappedFamilies,
    dominantFamily,
    dedupedCount: items.length - deduped.length,
  };
}
