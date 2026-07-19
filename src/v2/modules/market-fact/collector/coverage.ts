import type {
  EligibleInstrumentSnapshot,
  PointInTimeMarketFact,
} from "../../../domain/contracts";
import { TARGET_VENUES, type TargetVenue } from "../../../domain/product-constitution";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import type { VenueCatalogResult } from "../../universe/catalog-types";
import type { VenueTickerResult } from "../ticker-types";
import type {
  CollectorCoverage,
  CollectorProviderFailureEvidence,
  CollectorRatioEvidence,
} from "./contracts";

function ratio(numerator: number, denominator: number): CollectorRatioEvidence {
  return {
    denominator,
    numerator,
    ratio: denominator === 0 ? null : numerator / denominator,
  };
}

function catalogFailures(
  catalogs: readonly VenueCatalogResult[] | null,
): CollectorProviderFailureEvidence[] {
  return catalogs === null
    ? []
    : catalogs.flatMap((catalog) => catalog.ok
      ? []
      : [{
        kind: catalog.failure.kind,
        operation: "CATALOG" as const,
        reasonCode: catalog.failure.reasonCode,
        venue: catalog.venue,
      }]);
}

function tickerFailures(
  batches: readonly VenueTickerResult[],
): CollectorProviderFailureEvidence[] {
  return batches.flatMap((batch) => batch.ok
    ? []
    : [{
      kind: batch.failure.kind,
      operation: "TICKER" as const,
      reasonCode: batch.failure.reasonCode,
      venue: batch.venue,
    }]);
}

export function collectorProviderFailures(input: {
  catalogs: readonly VenueCatalogResult[] | null;
  tickerBatches: readonly VenueTickerResult[];
}): readonly CollectorProviderFailureEvidence[] {
  return deepFreezeArtifact([
    ...catalogFailures(input.catalogs),
    ...tickerFailures(input.tickerBatches),
  ].sort((left, right) =>
    `${left.venue}:${left.operation}:${left.reasonCode}`.localeCompare(
      `${right.venue}:${right.operation}:${right.reasonCode}`,
    )));
}

export function buildCollectorCoverage(input: {
  carriedForwardByVenue: Readonly<Record<TargetVenue, number>>;
  catalogs: readonly VenueCatalogResult[] | null;
  facts: readonly PointInTimeMarketFact[];
  providerObservedByVenue: Readonly<Record<TargetVenue, number>> | null;
  tickerBatches: readonly VenueTickerResult[];
  universe: EligibleInstrumentSnapshot;
}): CollectorCoverage {
  if (input.facts.length !== input.universe.eligibleCount) {
    throw new Error("collector facts must exactly cover the eligible denominator");
  }
  const providerFailures = collectorProviderFailures(input);
  const factVenue = new Map<string, TargetVenue>();
  for (const record of input.universe.accounting) {
    if (record.eligible && record.canonicalInstrumentId !== null) {
      factVenue.set(record.canonicalInstrumentId, record.venue);
    }
  }

  const venues = TARGET_VENUES.map((venue) => {
    const accountedCount = input.universe.accounting.filter(
      (record) => record.venue === venue,
    ).length;
    const eligibleCount = input.universe.accounting.filter(
      (record) => record.venue === venue && record.eligible,
    ).length;
    const venueFacts = input.facts.filter(
      (fact) => factVenue.get(fact.canonicalInstrumentId) === venue,
    );
    const collectedCount = venueFacts.filter(
      (fact) => fact.lineage.sourceRecordIds.length > 0,
    ).length;
    const freshCount = venueFacts.filter(
      (fact) => fact.value !== null && fact.quality.status === "FRESH",
    ).length;
    const carriedForwardCount = input.carriedForwardByVenue[venue];
    if (
      freshCount > collectedCount ||
      collectedCount > eligibleCount ||
      eligibleCount > accountedCount ||
      carriedForwardCount > accountedCount
    ) {
      throw new Error("collector coverage denominator invariant failed");
    }
    return {
      accountedCount,
      carriedForwardCount,
      collectedCount,
      collectionCoverage: ratio(collectedCount, eligibleCount),
      eligibleCount,
      freshCount,
      freshCoverage: ratio(freshCount, eligibleCount),
      providerObservedCount: input.providerObservedByVenue?.[venue] ?? null,
      providerFailures: providerFailures.filter(
        (failure) => failure.venue === venue,
      ),
      venue,
    };
  });
  const accountedCount = venues.reduce((sum, venue) => sum + venue.accountedCount, 0);
  const eligibleCount = venues.reduce((sum, venue) => sum + venue.eligibleCount, 0);
  const collectedCount = venues.reduce((sum, venue) => sum + venue.collectedCount, 0);
  const freshCount = venues.reduce((sum, venue) => sum + venue.freshCount, 0);
  const carriedForwardCount = venues.reduce(
    (sum, venue) => sum + venue.carriedForwardCount,
    0,
  );
  const providerObservedCount = input.providerObservedByVenue === null
    ? null
    : venues.reduce(
      (sum, venue) => sum + (venue.providerObservedCount ?? 0),
      0,
    );

  return deepFreezeArtifact({
    accountedCount,
    carriedForwardCount,
    collectedCount,
    collectionCoverage: ratio(collectedCount, eligibleCount),
    eligibleCount,
    freshCount,
    freshCoverage: ratio(freshCount, eligibleCount),
    providerObservedCount,
    venues,
  });
}
