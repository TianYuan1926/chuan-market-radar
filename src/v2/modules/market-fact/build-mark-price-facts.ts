import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
  PointInTimeMarketFact,
  QualityAssessment,
} from "../../domain/contracts";
import { TARGET_VENUES, type TargetVenue } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";
import {
  FactQualitySnapshotSchema,
  PointInTimeMarketFactSchema,
} from "../../runtime-schema/foundation-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";
import type {
  PriceSnapshotObservation,
  VenuePriceSnapshotResult,
} from "./price-snapshot-types";

const SOURCE_IDS: Record<TargetVenue, string> = {
  BINANCE_FUTURES: "binance-public-rest",
  OKX_SWAP: "okx-public-rest",
  BYBIT_LINEAR_PERPETUAL: "bybit-public-rest",
};
const FACT_TYPE = "MARK_PRICE" as const;
const SOURCE_CAPABILITY = "public_mark_price_snapshot" as const;

export type MarketFactBuildResult = {
  facts: readonly PointInTimeMarketFact[];
  nextSequences: Readonly<Record<string, string>>;
  qualitySnapshot: FactQualitySnapshot;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function compareSequence(left: string, right: string): -1 | 0 | 1 | null {
  if (!/^\d+$/u.test(left) || !/^\d+$/u.test(right)) {
    return null;
  }
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue < rightValue ? -1 : 1;
}

function sequenceGap(left: string, right: string): bigint | null {
  if (!/^\d+$/u.test(left) || !/^\d+$/u.test(right)) {
    return null;
  }
  return BigInt(left) - BigInt(right);
}

function factQuality(input: {
  batch: VenuePriceSnapshotResult;
  cutoffMs: number;
  matches: readonly PriceSnapshotObservation[];
  maxAgeMs: number;
  maxSequenceGapMs: number;
  previousSequence: string | undefined;
}): {
  ageMs: number | null;
  eventTime: string | null;
  nextSequence: string | null;
  quality: QualityAssessment;
  sequence: string | null;
  sourceRecordIds: readonly string[];
  value: string | null;
} {
  if (!input.batch.ok) {
    return {
      ageMs: null,
      eventTime: null,
      nextSequence: null,
      quality: {
        status: input.batch.failure.kind,
        ageMs: null,
        reasonCodes: [input.batch.failure.reasonCode],
      },
      sequence: null,
      sourceRecordIds: [],
      value: null,
    };
  }
  if (input.matches.length === 0) {
    return {
      ageMs: null,
      eventTime: null,
      nextSequence: null,
      quality: {
        status: "UNAVAILABLE",
        ageMs: null,
        reasonCodes: ["mark_price_missing_for_eligible_instrument"],
      },
      sequence: null,
      sourceRecordIds: [],
      value: null,
    };
  }
  if (input.matches.length > 1) {
    return {
      ageMs: null,
      eventTime: null,
      nextSequence: null,
      quality: {
        status: "INVALID",
        ageMs: null,
        reasonCodes: ["duplicate_provider_mark_price_record"],
      },
      sequence: null,
      sourceRecordIds: input.matches.map((match) => match.sourceRecordId),
      value: null,
    };
  }

  const observation = input.matches[0]!;
  const eventMs = observation.eventTime === null
    ? null
    : Date.parse(observation.eventTime);
  const receivedMs = Date.parse(input.batch.receivedAt);
  const reasons = [...observation.reasonCodes];
  let eventTime = observation.eventTime;
  let sequence = observation.sequence;
  let value = observation.value;
  let status: DataQualityState = observation.qualityStatus;
  let ageMs = eventMs === null ? null : Math.max(0, input.cutoffMs - eventMs);
  let nextSequence: string | null = null;

  if (
    observation.factType !== "MARK_PRICE" ||
    observation.eventTimeBasis !== "MARK_PRICE_SNAPSHOT"
  ) {
    reasons.push("mark_price_semantics_invalid");
    eventTime = null;
    sequence = null;
    value = null;
    ageMs = null;
    status = "INVALID";
  } else if (
    eventMs === null ||
    !Number.isFinite(receivedMs) ||
    eventMs > receivedMs
  ) {
    reasons.push("mark_price_event_time_after_receive_or_invalid");
    eventTime = null;
    sequence = null;
    value = null;
    ageMs = null;
    status = "INVALID";
  } else if (eventMs > input.cutoffMs) {
    reasons.push("mark_price_event_after_source_cutoff");
    eventTime = null;
    sequence = null;
    value = null;
    ageMs = null;
    status = "INVALID";
  } else if (value === null || sequence === null || status === "INVALID") {
    value = null;
    status = "INVALID";
  } else if (input.previousSequence !== undefined) {
    const comparison = compareSequence(sequence, input.previousSequence);
    if (comparison === null) {
      reasons.push("mark_price_snapshot_sequence_invalid");
      value = null;
      status = "INVALID";
    } else if (comparison === 0) {
      reasons.push("duplicate_mark_price_snapshot_sequence");
      value = null;
      status = "INVALID";
    } else if (comparison < 0) {
      reasons.push("out_of_order_mark_price_snapshot_sequence");
      value = null;
      status = "INVALID";
    } else {
      const gap = sequenceGap(sequence, input.previousSequence);
      if (gap !== null && gap > BigInt(input.maxSequenceGapMs)) {
        reasons.push("mark_price_snapshot_sequence_gap");
        status = "PARTIAL";
      }
    }
  }

  if (value !== null && ageMs !== null && ageMs > input.maxAgeMs) {
    reasons.push("mark_price_snapshot_stale_at_cutoff");
    status = "STALE";
  }
  if (value !== null && sequence !== null) {
    nextSequence = sequence;
  }
  if (status !== "FRESH" && reasons.length === 0) {
    reasons.push("mark_price_snapshot_not_fresh");
  }

  return {
    ageMs,
    eventTime,
    nextSequence,
    quality: {
      status,
      ageMs,
      reasonCodes: status === "FRESH" ? [] : uniqueSorted(reasons),
    },
    sequence,
    sourceRecordIds: [observation.sourceRecordId],
    value,
  };
}

function aggregateQuality(input: {
  batches: readonly VenuePriceSnapshotResult[];
  facts: readonly PointInTimeMarketFact[];
}): QualityAssessment {
  const batchIssues = input.batches.flatMap((batch) => batch.issues);
  const factReasons = input.facts.flatMap((fact) => fact.quality.reasonCodes);
  const allFresh =
    input.facts.length > 0 &&
    input.facts.every((fact) => fact.quality.status === "FRESH") &&
    batchIssues.length === 0;
  if (allFresh) {
    return {
      ageMs: Math.max(...input.facts.map((fact) => fact.quality.ageMs ?? 0)),
      reasonCodes: [],
      status: "FRESH",
    };
  }

  const statuses = new Set(input.facts.map((fact) => fact.quality.status));
  let status: DataQualityState = "PARTIAL";
  if (input.facts.length === 0) {
    status = "UNAVAILABLE";
  } else if (
    statuses.size === 1 &&
    input.facts[0]!.quality.status !== "FRESH"
  ) {
    status = input.facts[0]!.quality.status;
  }
  const measuredAges = input.facts
    .map((fact) => fact.quality.ageMs)
    .filter((age): age is number => age !== null);
  return {
    ageMs: status === "UNAVAILABLE" || measuredAges.length === 0
      ? null
      : Math.max(...measuredAges),
    reasonCodes: uniqueSorted(
      [...batchIssues, ...factReasons].length > 0
        ? [...batchIssues, ...factReasons]
        : ["fact_batch_not_fresh"],
    ),
    status,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function buildMarkPriceFacts(input: {
  batches: readonly VenuePriceSnapshotResult[];
  generatedAt: string;
  maxAgeMs?: number;
  maxSequenceGapMs?: number;
  normalizedAt: string;
  previousSequences?: Readonly<Record<string, string>>;
  releaseId: string;
  sourceCutoff: string;
  universe: EligibleInstrumentSnapshot;
}): MarketFactBuildResult {
  const maxAgeMs = input.maxAgeMs ?? 5_000;
  const maxSequenceGapMs = input.maxSequenceGapMs ?? 60_000;
  if (
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs < 0 ||
    !Number.isSafeInteger(maxSequenceGapMs) ||
    maxSequenceGapMs <= 0
  ) {
    throw new RangeError("fact time limits must be safe non-negative integers");
  }

  const cutoffMs = Date.parse(input.sourceCutoff);
  const generatedMs = Date.parse(input.generatedAt);
  const normalizedMs = Date.parse(input.normalizedAt);
  if (
    !Number.isFinite(cutoffMs) ||
    !Number.isFinite(generatedMs) ||
    !Number.isFinite(normalizedMs) ||
    cutoffMs > generatedMs ||
    cutoffMs > normalizedMs ||
    normalizedMs > generatedMs
  ) {
    throw new Error("invalid market fact chronology");
  }

  const byVenue = new Map(input.batches.map((batch) => [batch.venue, batch]));
  if (
    input.batches.length !== TARGET_VENUES.length ||
    byVenue.size !== TARGET_VENUES.length ||
    TARGET_VENUES.some((venue) => !byVenue.has(venue))
  ) {
    throw new Error(
      "one and only one mark-price batch is required per target venue",
    );
  }
  if (Date.parse(input.universe.sourceCutoff) > cutoffMs) {
    throw new Error("market facts cannot read a universe from a later cutoff");
  }
  const batches = TARGET_VENUES.map((venue) => byVenue.get(venue)!);
  if (batches.some((batch) => Date.parse(batch.receivedAt) > normalizedMs)) {
    throw new Error("mark-price normalization cannot precede receipt");
  }

  const nextSequences: Record<string, string> = {
    ...(input.previousSequences ?? {}),
  };
  const facts = input.universe.accounting
    .filter((record) => record.eligible)
    .map((record) => {
      if (
        record.canonicalInstrumentId === null ||
        record.venueInstrumentId === null ||
        record.settlementAsset === null
      ) {
        throw new Error("eligible universe record lacks complete identity");
      }
      const batch = byVenue.get(record.venue)!;
      const matches = batch.ok
        ? batch.observations.filter(
          (observation) =>
            observation.venueInstrumentId === record.venueInstrumentId,
        )
        : [];
      const evaluated = factQuality({
        batch,
        cutoffMs,
        matches,
        maxAgeMs,
        maxSequenceGapMs,
        previousSequence:
          input.previousSequences?.[record.canonicalInstrumentId],
      });
      if (evaluated.nextSequence !== null) {
        nextSequences[record.canonicalInstrumentId] = evaluated.nextSequence;
      }

      const content = {
        canonicalInstrumentId: record.canonicalInstrumentId,
        eventTime: evaluated.eventTime,
        factType: FACT_TYPE,
        quality: evaluated.quality,
        sequence: evaluated.sequence,
        sourceCapability: SOURCE_CAPABILITY,
        sourceCutoff: input.sourceCutoff,
        sourceRecordIds: evaluated.sourceRecordIds,
        value: evaluated.value,
        venueInstrumentId: record.venueInstrumentId,
      };
      const digest = stableSha256(content);
      return PointInTimeMarketFactSchema.parse({
        schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.PointInTimeMarketFact,
        releaseId: input.releaseId,
        producerModule: "market_fact_quality",
        generatedAt: input.generatedAt,
        sourceCutoff: input.sourceCutoff,
        contentHash: stableContentHash(content),
        factId: `fact:mark-price:${digest.slice(0, 24)}`,
        canonicalInstrumentId: record.canonicalInstrumentId,
        venueInstrumentId: record.venueInstrumentId,
        factType: FACT_TYPE,
        value: evaluated.value,
        unit: record.settlementAsset,
        sequence: evaluated.sequence,
        lineage: {
          sourceId: SOURCE_IDS[record.venue],
          sourceCapability: SOURCE_CAPABILITY,
          sourceRecordIds: evaluated.sourceRecordIds,
          eventTime: evaluated.eventTime,
          receivedAt: batch.receivedAt,
          normalizedAt: input.normalizedAt,
          persistedAt: null,
        },
        quality: evaluated.quality,
      });
    });

  const quality = aggregateQuality({ batches, facts });
  const qualityContent = {
    facts: facts.map((fact) => ({
      factId: fact.factId,
      quality: fact.quality,
    })),
    sourceCutoff: input.sourceCutoff,
    universeSnapshotId: input.universe.snapshotId,
  };
  const qualityDigest = stableSha256(qualityContent);
  const qualitySnapshot = FactQualitySnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.FactQualitySnapshot,
    releaseId: input.releaseId,
    producerModule: "market_fact_quality",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(qualityContent),
    snapshotId: `fact-quality:${qualityDigest.slice(0, 24)}`,
    universeSnapshotId: input.universe.snapshotId,
    completenessRatio: ratio(
      facts.filter(
        (fact) => fact.value !== null && fact.quality.status === "FRESH",
      ).length,
      facts.length,
    ),
    gapRate: ratio(
      facts.filter((fact) =>
        fact.quality.reasonCodes.includes(
          "mark_price_snapshot_sequence_gap",
        )).length,
      facts.length,
    ),
    duplicateRate: ratio(
      facts.filter((fact) =>
        fact.quality.reasonCodes.some((reason) =>
          reason.includes("duplicate"))).length,
      facts.length,
    ),
    lateEventRate: ratio(
      facts.filter(
        (fact) =>
          fact.quality.status === "STALE" ||
          fact.quality.reasonCodes.includes(
            "out_of_order_mark_price_snapshot_sequence",
          ),
      ).length,
      facts.length,
    ),
    quality,
  });

  return deepFreezeArtifact({ facts, nextSequences, qualitySnapshot });
}
