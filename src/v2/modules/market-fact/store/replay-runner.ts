import type {
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  MarketContextSnapshot,
} from "../../../domain/contracts";
import { buildCrossVenueFeatureSet } from "../../feature/build-feature-set";
import { buildFeatureQualitySnapshot } from "../../feature/build-feature-quality";
import { buildM1MarketContext } from "../../market-context/build-market-context";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import {
  type M1ArtifactByName,
  type M1ArtifactName,
  type M1StoredArtifactRecord,
  M1StoreError,
} from "./contracts";
import {
  type M1ReplayArtifactReference,
  type M1ReplayManifest,
  validateM1ReplayManifest,
} from "./replay-manifest";

export type M1ReplaySourceStore = {
  readArtifact<Name extends M1ArtifactName>(
    artifactName: Name,
    artifactId: string,
  ): Promise<M1StoredArtifactRecord<Name>>;
};

export type M1ReplayResult = Readonly<{
  manifestId: string;
  replayFeatureSet: FeatureSetSnapshot;
  replayRepeatFeatureSet: FeatureSetSnapshot;
  featureQuality: FeatureQualitySnapshot;
  marketContext: MarketContextSnapshot;
}>;

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function assertReference(
  reference: M1ReplayArtifactReference,
  record: M1StoredArtifactRecord,
  manifest: M1ReplayManifest,
): void {
  if (
    record.artifactName !== reference.artifactName ||
    record.artifactId !== reference.artifactId ||
    record.storageDigest !== reference.storageDigest ||
    !sameInstant(record.sourceCutoff, reference.sourceCutoff) ||
    !sameInstant(record.persistedAt, reference.persistedAt)
  ) {
    throw new M1StoreError(
      "REPLAY_SOURCE_MISMATCH",
      "durable replay source does not match its immutable manifest reference",
    );
  }
  if (
    Date.parse(record.sourceCutoff) > Date.parse(manifest.eventCutoff) ||
    Date.parse(record.persistedAt) > Date.parse(manifest.knowledgeCutoff)
  ) {
    throw new M1StoreError(
      "REPLAY_CUTOFF_VIOLATION",
      "durable replay source crosses an event-time or knowledge-time cutoff",
    );
  }
}

async function loadReference(
  store: M1ReplaySourceStore,
  reference: M1ReplayArtifactReference,
  manifest: M1ReplayManifest,
): Promise<M1StoredArtifactRecord> {
  const record = await store.readArtifact(
    reference.artifactName,
    reference.artifactId,
  );
  assertReference(reference, record, manifest);
  return record;
}

export async function runM1Replay(input: {
  store: M1ReplaySourceStore;
  manifest: M1ReplayManifest;
  replayRunId: string;
  replayRepeatRunId: string;
}): Promise<M1ReplayResult> {
  const manifest = validateM1ReplayManifest(input.manifest);
  if (
    input.replayRunId === input.replayRepeatRunId ||
    input.replayRunId.trim() === "" ||
    input.replayRepeatRunId.trim() === ""
  ) {
    throw new M1StoreError(
      "REPLAY_MANIFEST_REJECTED",
      "replay verification requires two distinct non-empty run identities",
    );
  }

  const loaded = await Promise.all(manifest.sourceArtifacts.map(
    (reference) => loadReference(input.store, reference, manifest),
  ));
  const universeRecords = loaded.filter(
    (record) => record.artifactName === "EligibleInstrumentSnapshot",
  );
  const factRecords = loaded.filter(
    (record) => record.artifactName === "PointInTimeMarketFact",
  );
  const factQualityRecords = loaded.filter(
    (record) => record.artifactName === "FactQualitySnapshot",
  );
  if (
    universeRecords.length !== 1 ||
    factQualityRecords.length !== 1 ||
    factRecords.length === 0 ||
    loaded.some((record) => !sameInstant(record.sourceCutoff, manifest.eventCutoff))
  ) {
    throw new M1StoreError(
      "REPLAY_SOURCE_MISMATCH",
      "M1 replay requires one exact-cutoff universe, fact denominator and quality snapshot",
    );
  }

  const universe = universeRecords[0]!.payload as
    M1ArtifactByName["EligibleInstrumentSnapshot"];
  const facts = factRecords.map((record) =>
    record.payload as M1ArtifactByName["PointInTimeMarketFact"]);
  const factQuality = factQualityRecords[0]!.payload as
    M1ArtifactByName["FactQualitySnapshot"];
  const onlineRecord = await loadReference(
    input.store,
    manifest.expectedOnlineFeatureSet,
    manifest,
  );
  const onlineFeatureSet = onlineRecord.payload as
    M1ArtifactByName["FeatureSetSnapshot"];
  if (
    onlineFeatureSet.computation.mode !== "ONLINE" ||
    onlineFeatureSet.computation.runId === input.replayRunId ||
    onlineFeatureSet.computation.runId === input.replayRepeatRunId ||
    onlineFeatureSet.computation.engineVersion !==
      manifest.featureComputation.engineVersion ||
    onlineFeatureSet.featureSetVersion !==
      manifest.featureComputation.featureSetVersion ||
    onlineFeatureSet.releaseId !== manifest.featureComputation.releaseId
  ) {
    throw new M1StoreError(
      "REPLAY_SOURCE_MISMATCH",
      "online feature authority does not match the replay computation contract",
    );
  }

  const common = {
    computedAt: manifest.featureComputation.computedAt,
    factQuality,
    facts,
    generatedAt: manifest.createdAt,
    releaseId: manifest.featureComputation.releaseId,
    sourceCutoff: manifest.eventCutoff,
    universe,
  } as const;
  const replayFeatureSet = buildCrossVenueFeatureSet({
    ...common,
    computationMode: "REPLAY",
    computationRunId: input.replayRunId,
  });
  const replayRepeatFeatureSet = buildCrossVenueFeatureSet({
    ...common,
    computationMode: "REPLAY",
    computationRunId: input.replayRepeatRunId,
  });
  const featureQuality = buildFeatureQualitySnapshot({
    generatedAt: manifest.createdAt,
    onlineFeatureSet,
    releaseId: manifest.featureComputation.releaseId,
    replayFeatureSet,
    replayRepeatFeatureSet,
    sourceCutoff: manifest.eventCutoff,
  });
  if (
    featureQuality.onlineOfflineParity !== "PASS" ||
    !featureQuality.replayDeterministic ||
    !featureQuality.parityEvidence.independentlyBuilt
  ) {
    throw new M1StoreError(
      "REPLAY_PARITY_FAILED",
      "durable replay did not reproduce the online feature semantics",
    );
  }
  const marketContext = buildM1MarketContext({
    featureQuality,
    featureSet: onlineFeatureSet,
    generatedAt: manifest.createdAt,
    releaseId: manifest.featureComputation.releaseId,
    sourceCutoff: manifest.eventCutoff,
    universe,
  });
  return deepFreezeArtifact({
    manifestId: manifest.manifestId,
    replayFeatureSet,
    replayRepeatFeatureSet,
    featureQuality,
    marketContext,
  });
}
