import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
  FeatureSetSnapshot,
  PointInTimeFeature,
  PointInTimeMarketFact,
  QualityAssessment,
} from "../../domain/contracts";
import { TARGET_VENUES } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";
import {
  EligibleInstrumentSnapshotSchema,
  FactQualitySnapshotSchema,
  FeatureSetSnapshotSchema,
  PointInTimeMarketFactSchema,
} from "../../runtime-schema/foundation-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import { computeThreeVenuePriceDispersion } from "./decimal-dispersion";

export const M1_FEATURE_SET_VERSION = "m1-foundation-feature-set.v1" as const;
export const M1_FEATURE_ENGINE_VERSION =
  "m1-point-in-time-feature-engine.v1" as const;
export const CROSS_VENUE_DISPERSION_VERSION =
  "cross-venue-last-price-dispersion.v1" as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function aggregateFeatureQuality(input: {
  coverageComplete: boolean;
  factQuality: FactQualitySnapshot;
  facts: readonly PointInTimeMarketFact[];
}): QualityAssessment {
  const reasons = input.facts.flatMap((fact) =>
    fact.quality.reasonCodes.map((reason) => `${fact.factId}:${reason}`));
  if (!input.coverageComplete) {
    reasons.push("cross_venue_coverage_incomplete");
  }
  if (input.factQuality.quality.status !== "FRESH") {
    reasons.push(
      `fact_quality_snapshot:${input.factQuality.quality.status.toLowerCase()}`,
    );
  }

  const statuses = new Set(input.facts.map((fact) => fact.quality.status));
  const allSourceFactsFresh =
    input.facts.length === TARGET_VENUES.length &&
    input.facts.every((fact) => fact.quality.status === "FRESH");
  let status: DataQualityState = "PARTIAL";
  if (
    input.coverageComplete &&
    allSourceFactsFresh &&
    input.factQuality.quality.status === "FRESH"
  ) {
    status = "FRESH";
  } else if (statuses.has("INVALID")) {
    status = "INVALID";
  } else if (statuses.has("STALE")) {
    status = "STALE";
  } else if (
    statuses.size === 1 &&
    input.facts.length > 0 &&
    input.facts[0]!.quality.status !== "FRESH"
  ) {
    status = input.facts[0]!.quality.status;
  }

  const ages = input.facts
    .map((fact) => fact.quality.ageMs)
    .filter((age): age is number => age !== null);
  return {
    ageMs: status === "UNAVAILABLE" || ages.length === 0
      ? null
      : Math.max(...ages),
    reasonCodes: status === "FRESH"
      ? []
      : uniqueSorted(reasons.length > 0 ? reasons : ["feature_source_not_fresh"]),
    status,
  };
}

function validateInput(input: {
  computedAt: string;
  factQuality: FactQualitySnapshot;
  facts: readonly PointInTimeMarketFact[];
  generatedAt: string;
  sourceCutoff: string;
  universe: EligibleInstrumentSnapshot;
}) {
  const universe = EligibleInstrumentSnapshotSchema.parse(input.universe);
  const factQuality = FactQualitySnapshotSchema.parse(input.factQuality);
  const facts = input.facts.map((fact) => PointInTimeMarketFactSchema.parse(fact));
  const cutoffMs = Date.parse(input.sourceCutoff);
  const computedMs = Date.parse(input.computedAt);
  const generatedMs = Date.parse(input.generatedAt);
  if (
    !Number.isFinite(cutoffMs) ||
    !Number.isFinite(computedMs) ||
    !Number.isFinite(generatedMs) ||
    cutoffMs > computedMs ||
    computedMs > generatedMs ||
    Date.parse(universe.sourceCutoff) > cutoffMs ||
    Date.parse(universe.generatedAt) > computedMs ||
    factQuality.sourceCutoff !== input.sourceCutoff ||
    Date.parse(factQuality.generatedAt) > computedMs ||
    factQuality.universeSnapshotId !== universe.snapshotId
  ) {
    throw new Error("invalid feature point-in-time lineage");
  }

  const expected = new Map(
    universe.accounting
      .filter((record) => record.eligible)
      .map((record) => [record.canonicalInstrumentId!, record]),
  );
  if (facts.length !== expected.size) {
    throw new Error("one fact is required for every eligible instrument");
  }
  const factByInstrument = new Map<string, PointInTimeMarketFact>();
  for (const fact of facts) {
    const instrument = expected.get(fact.canonicalInstrumentId);
    if (
      instrument === undefined ||
      factByInstrument.has(fact.canonicalInstrumentId) ||
      fact.factType !== "LAST_PRICE" ||
      fact.venueInstrumentId !== instrument.venueInstrumentId ||
      fact.unit !== instrument.settlementAsset ||
      fact.sourceCutoff !== input.sourceCutoff ||
      Date.parse(fact.generatedAt) > computedMs
    ) {
      throw new Error("market fact does not match the eligible universe");
    }
    factByInstrument.set(fact.canonicalInstrumentId, fact);
  }
  if ([...expected.keys()].some((id) => !factByInstrument.has(id))) {
    throw new Error("eligible universe fact coverage is incomplete");
  }
  return { factByInstrument, factQuality, universe };
}

export function buildCrossVenueFeatureSet(input: {
  computationMode: "ONLINE" | "REPLAY";
  computationRunId: string;
  computedAt: string;
  factQuality: FactQualitySnapshot;
  facts: readonly PointInTimeMarketFact[];
  generatedAt: string;
  releaseId: string;
  sourceCutoff: string;
  universe: EligibleInstrumentSnapshot;
}): FeatureSetSnapshot {
  const computationRunId = input.computationRunId.trim();
  if (
    computationRunId === "" ||
    computationRunId !== input.computationRunId
  ) {
    throw new Error("feature computation run id is required");
  }
  const validated = validateInput(input);
  const grouped = new Map<string, typeof validated.universe.accounting>();
  for (const record of validated.universe.accounting) {
    if (record.underlyingGroupId === null || !record.eligible) {
      continue;
    }
    const current = grouped.get(record.underlyingGroupId) ?? [];
    grouped.set(record.underlyingGroupId, [...current, record]);
  }

  const features: PointInTimeFeature[] = [];
  for (const [underlyingGroupId, records] of [...grouped.entries()].sort(
    (left, right) => left[0].localeCompare(right[0]),
  )) {
    const venueCounts = new Map<string, number>();
    for (const record of records) {
      venueCounts.set(record.venue, (venueCounts.get(record.venue) ?? 0) + 1);
    }
    const coverageComplete =
      records.length === TARGET_VENUES.length &&
      TARGET_VENUES.every((venue) => venueCounts.get(venue) === 1);
    const facts = records
      .map((record) => validated.factByInstrument.get(record.canonicalInstrumentId!))
      .filter((fact): fact is PointInTimeMarketFact => fact !== undefined)
      .sort((left, right) =>
        left.canonicalInstrumentId.localeCompare(right.canonicalInstrumentId));
    const quality = aggregateFeatureQuality({
      coverageComplete,
      factQuality: validated.factQuality,
      facts,
    });
    const prices = facts.map((fact) =>
      typeof fact.value === "string" ? fact.value : "");
    const allFactsUsable =
      coverageComplete &&
      facts.every(
        (fact) => fact.quality.status === "FRESH" && typeof fact.value === "string",
      );
    const value = allFactsUsable
      ? computeThreeVenuePriceDispersion(prices)
      : null;
    const effectiveQuality: QualityAssessment = value === null && quality.status === "FRESH"
      ? {
        ageMs: quality.ageMs,
        reasonCodes: ["cross_venue_price_calculation_invalid"],
        status: "INVALID",
      }
      : quality;
    const sourceFactIds = facts.map((fact) => fact.factId).sort();
    const featureContent = {
      computedAt: input.computedAt,
      featureDefinitionVersion: CROSS_VENUE_DISPERSION_VERSION,
      featureSetVersion: M1_FEATURE_SET_VERSION,
      quality: effectiveQuality,
      sourceCutoff: input.sourceCutoff,
      sourceFactIds,
      subjectId: underlyingGroupId,
      subjectType: "UNDERLYING_GROUP",
      value,
    };
    features.push({
      featureId:
        `feature:cross-venue-dispersion:` +
        stableSha256(featureContent).slice(0, 24),
      featureDefinitionVersion: CROSS_VENUE_DISPERSION_VERSION,
      featureSetVersion: M1_FEATURE_SET_VERSION,
      subjectType: "UNDERLYING_GROUP",
      subjectId: underlyingGroupId,
      timeframe: "snapshot",
      window: "three_target_venues_same_cutoff",
      value,
      unit: "ratio",
      sourceFactIds,
      sourceCutoff: input.sourceCutoff,
      computedAt: input.computedAt,
      quality: effectiveQuality,
    });
  }

  const content = {
    computation: {
      engineVersion: M1_FEATURE_ENGINE_VERSION,
      mode: input.computationMode,
      runId: computationRunId,
    },
    featureSetVersion: M1_FEATURE_SET_VERSION,
    features,
    sourceCutoff: input.sourceCutoff,
    universeSnapshotId: validated.universe.snapshotId,
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(FeatureSetSnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.FeatureSetSnapshot,
    releaseId: input.releaseId,
    producerModule: "point_in_time_feature_engine",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(content),
    snapshotId: `feature-set:${digest.slice(0, 24)}`,
    universeSnapshotId: validated.universe.snapshotId,
    featureSetVersion: M1_FEATURE_SET_VERSION,
    computation: {
      engineVersion: M1_FEATURE_ENGINE_VERSION,
      mode: input.computationMode,
      runId: computationRunId,
    },
    features,
  }));
}
