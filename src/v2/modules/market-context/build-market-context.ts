import type {
  EligibleInstrumentSnapshot,
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  MarketContextSnapshot,
  QualityAssessment,
} from "../../domain/contracts";
import type { DataQualityState } from "../../domain/states";
import type { UncertaintyVector } from "../../domain/uncertainty";
import {
  EligibleInstrumentSnapshotSchema,
  FeatureQualitySnapshotSchema,
  FeatureSetSnapshotSchema,
  MarketContextSnapshotSchema,
} from "../../runtime-schema/foundation-schemas";
import {
  compareNonNegativeDecimalStrings,
  NonNegativeDecimalStringSchema,
} from "../../runtime-schema/primitives";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  CROSS_VENUE_DISPERSION_VERSION,
} from "../feature/build-feature-set";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

export const M1_CONTEXT_RULE_VERSION =
  "m1-cross-venue-fragmentation-context.v1" as const;
export const M1_FRAGMENTATION_THRESHOLD = "0.002" as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function unavailableContextQuality(
  featureQuality: FeatureQualitySnapshot,
  reason: string,
): QualityAssessment {
  let status: DataQualityState = featureQuality.quality.status;
  if (status === "FRESH") {
    status = reason === "required_dispersion_feature_invalid"
      ? "INVALID"
      : "UNAVAILABLE";
  }
  return {
    ageMs: status === "UNAVAILABLE" ? null : featureQuality.quality.ageMs,
    reasonCodes: uniqueSorted([
      `feature_quality:${featureQuality.quality.status.toLowerCase()}`,
      ...featureQuality.quality.reasonCodes,
      reason,
    ]),
    status,
  };
}

function uncertainty(input: {
  sourceFactCount: number;
  usable: boolean;
  validatedAt: string;
}): UncertaintyVector {
  return {
    data: {
      dimension: "data",
      status: input.usable ? "LOW" : "UNKNOWN",
      reasonCodes: [
        input.usable
          ? "point_in_time_feature_lineage_and_parity_verified"
          : "feature_evidence_not_usable",
      ],
      sampleSize: input.usable ? input.sourceFactCount : null,
      calibrationVersion: null,
      lastValidatedAt: input.usable ? input.validatedAt : null,
    },
    model: {
      dimension: "model",
      status: "HIGH",
      reasonCodes: ["m1_context_rule_covers_price_dispersion_only"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
    market: {
      dimension: "market",
      status: "UNKNOWN",
      reasonCodes: ["regime_volatility_breadth_correlation_not_evaluated"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
    execution: {
      dimension: "execution",
      status: "UNKNOWN",
      reasonCodes: ["order_book_and_executable_liquidity_not_evaluated"],
      sampleSize: null,
      calibrationVersion: null,
      lastValidatedAt: null,
    },
  };
}

export function buildM1MarketContext(input: {
  featureQuality: FeatureQualitySnapshot;
  featureSet: FeatureSetSnapshot;
  generatedAt: string;
  releaseId: string;
  sourceCutoff: string;
  universe: EligibleInstrumentSnapshot;
}): MarketContextSnapshot {
  const universe = EligibleInstrumentSnapshotSchema.parse(input.universe);
  const featureSet = FeatureSetSnapshotSchema.parse(input.featureSet);
  const featureQuality = FeatureQualitySnapshotSchema.parse(input.featureQuality);
  const generatedMs = Date.parse(input.generatedAt);
  const cutoffMs = Date.parse(input.sourceCutoff);
  if (
    !Number.isFinite(generatedMs) ||
    !Number.isFinite(cutoffMs) ||
    cutoffMs > generatedMs ||
    Date.parse(universe.sourceCutoff) > cutoffMs ||
    featureSet.sourceCutoff !== input.sourceCutoff ||
    featureQuality.sourceCutoff !== input.sourceCutoff ||
    Date.parse(universe.generatedAt) > generatedMs ||
    Date.parse(featureSet.generatedAt) > generatedMs ||
    Date.parse(featureQuality.generatedAt) > generatedMs ||
    featureSet.universeSnapshotId !== universe.snapshotId ||
    featureQuality.featureSetSnapshotId !== featureSet.snapshotId
  ) {
    throw new Error("invalid market context point-in-time lineage");
  }

  const dispersionFeatures = featureSet.features.filter(
    (feature) =>
      feature.featureDefinitionVersion === CROSS_VENUE_DISPERSION_VERSION,
  );
  const requiredFeatureInvalid = dispersionFeatures.some(
    (feature) =>
      feature.subjectType !== "UNDERLYING_GROUP" ||
      feature.unit !== "ratio" ||
      (feature.value !== null &&
        (
          typeof feature.value !== "string" ||
          !NonNegativeDecimalStringSchema.safeParse(feature.value).success
        )),
  );
  const featureEvidenceUsable =
    dispersionFeatures.length > 0 &&
    !requiredFeatureInvalid &&
    featureQuality.quality.status === "FRESH" &&
    featureQuality.onlineOfflineParity === "PASS" &&
    featureQuality.replayDeterministic &&
    dispersionFeatures.every(
      (feature) =>
        feature.quality.status === "FRESH" &&
        typeof feature.value === "string",
    );
  const fragmented = featureEvidenceUsable && dispersionFeatures.some(
    (feature) =>
      compareNonNegativeDecimalStrings(
        feature.value as string,
        M1_FRAGMENTATION_THRESHOLD,
      ) > 0,
  );
  const sourceFactCount = new Set(
    dispersionFeatures.flatMap((feature) => feature.sourceFactIds),
  ).size;
  const measuredAges = dispersionFeatures
    .map((feature) => feature.quality.ageMs)
    .filter((age): age is number => age !== null);
  const quality: QualityAssessment = featureEvidenceUsable
    ? {
      ageMs: measuredAges.length === 0 ? null : Math.max(...measuredAges),
      reasonCodes: uniqueSorted([
        "breadth_not_evaluated",
        "correlation_not_evaluated",
        fragmented
          ? "cross_venue_price_fragmentation_observed"
          : "cross_venue_price_alignment_not_liquidity_health_proof",
        "healthy_executable_liquidity_not_proven",
        "m1_context_scope_price_dispersion_only",
        "regime_not_evaluated",
        "volatility_not_evaluated",
      ]),
      status: "PARTIAL",
    }
    : unavailableContextQuality(
      featureQuality,
      requiredFeatureInvalid
        ? "required_dispersion_feature_invalid"
        : dispersionFeatures.length === 0
          ? "required_dispersion_feature_absent"
          : "required_dispersion_feature_not_fresh",
    );
  const contextUncertainty = uncertainty({
    sourceFactCount,
    usable: featureEvidenceUsable,
    validatedAt: input.generatedAt,
  });
  const content = {
    breadth: null,
    confidence: featureEvidenceUsable ? "LOW" : "UNKNOWN",
    contextRuleVersion: M1_CONTEXT_RULE_VERSION,
    correlation: null,
    featureQualitySnapshotId: featureQuality.snapshotId,
    featureSetSnapshotId: featureSet.snapshotId,
    liquidity: fragmented ? "FRAGMENTED" : "UNKNOWN",
    quality,
    regime: "UNKNOWN",
    sourceCutoff: input.sourceCutoff,
    uncertainty: contextUncertainty,
    universeSnapshotId: universe.snapshotId,
    volatility: "UNKNOWN",
  } as const;
  const digest = stableSha256(content);
  return deepFreezeArtifact(MarketContextSnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.MarketContextSnapshot,
    releaseId: input.releaseId,
    producerModule: "market_context",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(content),
    snapshotId: `market-context:${digest.slice(0, 24)}`,
    universeSnapshotId: universe.snapshotId,
    featureSetSnapshotId: featureSet.snapshotId,
    featureQualitySnapshotId: featureQuality.snapshotId,
    contextRuleVersion: M1_CONTEXT_RULE_VERSION,
    regime: "UNKNOWN",
    volatility: "UNKNOWN",
    breadth: null,
    correlation: null,
    liquidity: fragmented ? "FRAGMENTED" : "UNKNOWN",
    confidence: featureEvidenceUsable ? "LOW" : "UNKNOWN",
    quality,
    uncertainty: contextUncertainty,
  }));
}
