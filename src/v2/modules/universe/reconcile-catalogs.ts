import type {
  EligibleInstrumentSnapshot,
  InstrumentAccountingRecord,
} from "../../domain/contracts";
import { TARGET_VENUES, type TargetVenue } from "../../domain/product-constitution";
import { unavailableAccounting, type VenueCatalogResult } from "./catalog-types";

export type CatalogReconciliationResult = Readonly<{
  carriedForwardByVenue: Readonly<Record<TargetVenue, number>>;
  catalogs: readonly VenueCatalogResult[];
  providerObservedByVenue: Readonly<Record<TargetVenue, number>>;
}>;

function recordKey(record: InstrumentAccountingRecord): string {
  return record.venueInstrumentId === null
    ? `observation:${record.observationId}`
    : `instrument:${record.venueInstrumentId}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function carryRecord(
  record: InstrumentAccountingRecord,
  reasons: readonly string[],
  status: "DELISTING" | "UNAVAILABLE",
): InstrumentAccountingRecord {
  return {
    ...record,
    eligible: false,
    status,
    statusReasons: uniqueSorted([...record.statusReasons, ...reasons]),
  };
}

function sortAccounting(
  accounting: readonly InstrumentAccountingRecord[],
): InstrumentAccountingRecord[] {
  return [...accounting].sort((left, right) => {
    const byVenueInstrument = (left.venueInstrumentId ?? "")
      .localeCompare(right.venueInstrumentId ?? "");
    return byVenueInstrument !== 0
      ? byVenueInstrument
      : left.observationId.localeCompare(right.observationId);
  });
}

export function reconcileCatalogs(input: {
  current: readonly VenueCatalogResult[];
  previous: EligibleInstrumentSnapshot | null;
}): CatalogReconciliationResult {
  const byVenue = new Map(input.current.map((catalog) => [catalog.venue, catalog]));
  if (
    input.current.length !== TARGET_VENUES.length ||
    byVenue.size !== TARGET_VENUES.length ||
    TARGET_VENUES.some((venue) => !byVenue.has(venue))
  ) {
    throw new Error("catalog reconciliation requires exactly one result per venue");
  }

  const providerObservedByVenue = {} as Record<TargetVenue, number>;
  const carriedForwardByVenue = {} as Record<TargetVenue, number>;
  const catalogs = TARGET_VENUES.map((venue): VenueCatalogResult => {
    const current = byVenue.get(venue)!;
    providerObservedByVenue[venue] = current.accounting.length;
    const currentAccounting = current.ok
      ? [...current.accounting]
      : [...unavailableAccounting(
        current.accounting,
        current.failure.reasonCode,
      )];
    const currentKeys = new Set(currentAccounting.map(recordKey));
    const prior = input.previous?.accounting.filter(
      (record) => record.venue === venue,
    ) ?? [];
    const carryReasons = current.ok
      ? ["collector_carried_missing_from_complete_catalog"]
      : [
        "collector_carried_after_catalog_failure",
        current.failure.reasonCode,
      ];
    const carried = prior
      .filter((record) => !currentKeys.has(recordKey(record)))
      .map((record) => carryRecord(
        record,
        carryReasons,
        current.ok ? "DELISTING" : "UNAVAILABLE",
      ));
    carriedForwardByVenue[venue] = carried.length;
    const accounting = sortAccounting([...currentAccounting, ...carried]);

    return current.ok
      ? { ...current, accounting }
      : { ...current, accounting };
  });

  return Object.freeze({
    carriedForwardByVenue: Object.freeze(carriedForwardByVenue),
    catalogs: Object.freeze(catalogs),
    providerObservedByVenue: Object.freeze(providerObservedByVenue),
  });
}

export function carriedForwardCounts(
  universe: EligibleInstrumentSnapshot,
): Readonly<Record<TargetVenue, number>> {
  const counts = {} as Record<TargetVenue, number>;
  for (const venue of TARGET_VENUES) {
    counts[venue] = universe.accounting.filter(
      (record) =>
        record.venue === venue &&
        record.statusReasons.some((reason) =>
          reason.startsWith("collector_carried_")),
    ).length;
  }
  return Object.freeze(counts);
}
