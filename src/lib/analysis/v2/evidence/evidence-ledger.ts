import type {
  EvidenceFamily,
  EvidenceItem,
} from "./evidence-types";

export type {
  EvidenceDirection,
  EvidenceFamily,
  EvidenceFreshness,
  EvidenceItem,
  EvidenceSource,
  EvidenceTimeframe,
} from "./evidence-types";

export type EvidenceLedger = {
  all: () => EvidenceItem[];
  byFamily: (family: EvidenceFamily) => EvidenceItem[];
  getById: (id: string) => EvidenceItem | undefined;
  append: (item: EvidenceItem) => EvidenceLedger;
};

function dedupeKey(item: EvidenceItem): string {
  return [item.symbol, item.source, item.timeframe, item.label].join("|");
}

function dedupeEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const byDedupeKey = new Map<string, EvidenceItem>();

  for (const item of items) {
    const key = dedupeKey(item);

    byDedupeKey.delete(key);
    byDedupeKey.set(key, item);
  }

  return Array.from(byDedupeKey.values());
}

export function createEvidenceLedger(items: EvidenceItem[] = []): EvidenceLedger {
  const evidence = dedupeEvidence(items);
  const byId = new Map(evidence.map((item) => [item.id, item]));

  return {
    all: () => [...evidence],
    byFamily: (family) => evidence.filter((item) => item.family === family),
    getById: (id) => byId.get(id),
    append: (item) => createEvidenceLedger([...evidence, item]),
  };
}
