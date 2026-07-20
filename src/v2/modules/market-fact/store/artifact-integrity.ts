import { decodeRuntimeArtifact } from "../../../runtime-schema/decoder";
import { stableContentHash, stableSha256 } from "../../universe/stable-artifact";
import {
  type M1ArtifactByName,
  type M1ArtifactName,
  M1StoreError,
} from "./contracts";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function artifactId<Name extends M1ArtifactName>(
  artifactName: Name,
  artifact: Readonly<M1ArtifactByName[Name]>,
): string {
  const identity = artifact as unknown as Readonly<{
    factId?: string;
    snapshotId?: string;
  }>;
  return artifactName === "PointInTimeMarketFact"
    ? identity.factId!
    : identity.snapshotId!;
}

function expectedSelfContainedIdentity<Name extends M1ArtifactName>(
  artifactName: Name,
  artifact: Readonly<M1ArtifactByName[Name]>,
): Readonly<{ contentHash: string; artifactId: string }> | null {
  switch (artifactName) {
    case "EligibleInstrumentSnapshot": {
      const value = artifact as unknown as M1ArtifactByName["EligibleInstrumentSnapshot"];
      const content = {
        accounting: value.accounting,
        policyVersion: value.policyVersion,
        quality: value.quality,
        sourceCutoff: value.sourceCutoff,
      };
      return {
        contentHash: stableContentHash(content),
        artifactId: `universe:${stableSha256(content).slice(0, 24)}`,
      };
    }
    case "PointInTimeMarketFact": {
      const value = artifact as unknown as M1ArtifactByName["PointInTimeMarketFact"];
      const content = {
        canonicalInstrumentId: value.canonicalInstrumentId,
        eventTime: value.lineage.eventTime,
        factType: value.factType,
        quality: value.quality,
        sequence: value.sequence,
        sourceCapability: value.lineage.sourceCapability,
        sourceCutoff: value.sourceCutoff,
        sourceRecordIds: value.lineage.sourceRecordIds,
        value: value.value,
        venueInstrumentId: value.venueInstrumentId,
      };
      return {
        contentHash: stableContentHash(content),
        artifactId: `fact:mark-price:${stableSha256(content).slice(0, 24)}`,
      };
    }
    case "FactQualitySnapshot":
      return null;
    case "FeatureSetSnapshot": {
      const value = artifact as unknown as M1ArtifactByName["FeatureSetSnapshot"];
      const content = {
        computation: value.computation,
        featureSetVersion: value.featureSetVersion,
        features: value.features,
        sourceCutoff: value.sourceCutoff,
        universeSnapshotId: value.universeSnapshotId,
      };
      return {
        contentHash: stableContentHash(content),
        artifactId: `feature-set:${stableSha256(content).slice(0, 24)}`,
      };
    }
    case "FeatureQualitySnapshot": {
      const value = artifact as unknown as M1ArtifactByName["FeatureQualitySnapshot"];
      const content = {
        featureCount: value.featureCount,
        featureSetSnapshotId: value.featureSetSnapshotId,
        nullCount: value.nullCount,
        nullRate: value.nullRate,
        onlineOfflineParity: value.onlineOfflineParity,
        parityEvidence: value.parityEvidence,
        quality: value.quality,
        replayDeterministic: value.replayDeterministic,
        sourceCutoff: value.sourceCutoff,
      };
      return {
        contentHash: stableContentHash(content),
        artifactId: `feature-quality:${stableSha256(content).slice(0, 24)}`,
      };
    }
    case "MarketContextSnapshot": {
      const value = artifact as unknown as M1ArtifactByName["MarketContextSnapshot"];
      const content = {
        breadth: value.breadth,
        confidence: value.confidence,
        contextRuleVersion: value.contextRuleVersion,
        correlation: value.correlation,
        featureQualitySnapshotId: value.featureQualitySnapshotId,
        featureSetSnapshotId: value.featureSetSnapshotId,
        liquidity: value.liquidity,
        quality: value.quality,
        regime: value.regime,
        sourceCutoff: value.sourceCutoff,
        uncertainty: value.uncertainty,
        universeSnapshotId: value.universeSnapshotId,
        volatility: value.volatility,
      };
      return {
        contentHash: stableContentHash(content),
        artifactId: `market-context:${stableSha256(content).slice(0, 24)}`,
      };
    }
  }
}

export function validateM1Artifact<Name extends M1ArtifactName>(
  artifactName: Name,
  input: unknown,
): Readonly<M1ArtifactByName[Name]> {
  const decoded = decodeRuntimeArtifact(artifactName, input, "STORAGE");
  if (!decoded.ok) {
    throw new M1StoreError(
      "ARTIFACT_SCHEMA_REJECTED",
      `${artifactName} failed the STORAGE runtime schema`,
    );
  }
  const value = decoded.value as Readonly<M1ArtifactByName[Name]>;
  if (!SHA256_PATTERN.test(value.contentHash)) {
    throw new M1StoreError(
      "ARTIFACT_CONTENT_HASH_INVALID",
      `${artifactName} content hash is not a canonical sha256 digest`,
    );
  }
  const expected = expectedSelfContainedIdentity(artifactName, value);
  if (expected !== null && expected.contentHash !== value.contentHash) {
    throw new M1StoreError(
      "ARTIFACT_CONTENT_HASH_INVALID",
      `${artifactName} content hash does not match its semantic payload`,
    );
  }
  if (expected !== null && expected.artifactId !== artifactId(artifactName, value)) {
    throw new M1StoreError(
      "ARTIFACT_ID_INVALID",
      `${artifactName} id does not match its semantic payload`,
    );
  }
  return value;
}

export function storageDigest(value: unknown): string {
  return stableContentHash(value);
}

export function validateFactQualityLineage(input: {
  factQuality: M1ArtifactByName["FactQualitySnapshot"];
  facts: readonly M1ArtifactByName["PointInTimeMarketFact"][];
}): void {
  const facts = [...input.facts];
  const content = {
    facts: facts.map((fact) => ({ factId: fact.factId, quality: fact.quality })),
    sourceCutoff: input.factQuality.sourceCutoff,
    universeSnapshotId: input.factQuality.universeSnapshotId,
  };
  const expectedHash = stableContentHash(content);
  const expectedId = `fact-quality:${stableSha256(content).slice(0, 24)}`;
  if (
    input.factQuality.contentHash !== expectedHash ||
    input.factQuality.snapshotId !== expectedId
  ) {
    throw new M1StoreError(
      "ARTIFACT_CONTENT_HASH_INVALID",
      "FactQualitySnapshot does not match the exact persisted fact denominator",
    );
  }

  const denominator = facts.length;
  const ratio = (count: number) => denominator === 0 ? 0 : count / denominator;
  const expectedRatios = {
    completenessRatio: ratio(facts.filter(
      (fact) => fact.value !== null && fact.quality.status === "FRESH",
    ).length),
    gapRate: ratio(facts.filter((fact) =>
      fact.quality.reasonCodes.includes(
        "mark_price_snapshot_sequence_gap",
      )).length),
    duplicateRate: ratio(facts.filter((fact) =>
      fact.quality.reasonCodes.some((reason) => reason.includes("duplicate"))).length),
    lateEventRate: ratio(facts.filter((fact) =>
      fact.quality.status === "STALE" ||
      fact.quality.reasonCodes.includes(
        "out_of_order_mark_price_snapshot_sequence",
      )).length),
  };
  if (
    input.factQuality.completenessRatio !== expectedRatios.completenessRatio ||
    input.factQuality.gapRate !== expectedRatios.gapRate ||
    input.factQuality.duplicateRate !== expectedRatios.duplicateRate ||
    input.factQuality.lateEventRate !== expectedRatios.lateEventRate
  ) {
    throw new M1StoreError(
      "ARTIFACT_METADATA_MISMATCH",
      "FactQualitySnapshot ratios do not match the exact persisted fact denominator",
    );
  }
}
