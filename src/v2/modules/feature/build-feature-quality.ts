import type {
  FeatureQualitySnapshot,
  FeatureSetSnapshot,
  QualityAssessment,
} from "../../domain/contracts";
import type { DataQualityState } from "../../domain/states";
import {
  FeatureQualitySnapshotSchema,
  FeatureSetSnapshotSchema,
} from "../../runtime-schema/foundation-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function semanticHash(snapshot: FeatureSetSnapshot): string {
  return stableContentHash({
    featureEngineVersion: snapshot.computation.engineVersion,
    featureSetVersion: snapshot.featureSetVersion,
    features: [...snapshot.features].sort((left, right) =>
      left.featureId.localeCompare(right.featureId)),
    sourceCutoff: snapshot.sourceCutoff,
    universeSnapshotId: snapshot.universeSnapshotId,
  });
}

function aggregateOnlineQuality(input: {
  featureSet: FeatureSetSnapshot;
  independentlyBuilt: boolean;
  onlineOfflineParity: FeatureQualitySnapshot["onlineOfflineParity"];
  replayDeterministic: boolean;
}): QualityAssessment {
  const reasons = input.featureSet.features.flatMap((feature) => [
    ...feature.quality.reasonCodes.map(
      (reason) => `${feature.featureId}:${reason}`,
    ),
    ...(feature.value === null ? [`${feature.featureId}:feature_value_null`] : []),
  ]);
  if (!input.independentlyBuilt) {
    return {
      ageMs: null,
      reasonCodes: ["independent_online_replay_evidence_required"],
      status: "UNAVAILABLE",
    };
  }
  if (input.onlineOfflineParity === "FAIL" || !input.replayDeterministic) {
    if (input.onlineOfflineParity === "FAIL") {
      reasons.push("online_offline_semantic_mismatch");
    }
    if (!input.replayDeterministic) {
      reasons.push("replay_output_not_deterministic");
    }
    return {
      ageMs: maximumMeasuredAge(input.featureSet),
      reasonCodes: uniqueSorted(reasons),
      status: "INVALID",
    };
  }
  if (input.featureSet.features.length === 0) {
    return {
      ageMs: null,
      reasonCodes: ["feature_set_empty"],
      status: "UNAVAILABLE",
    };
  }
  if (
    input.featureSet.features.every(
      (feature) => feature.quality.status === "FRESH" && feature.value !== null,
    )
  ) {
    return {
      ageMs: maximumMeasuredAge(input.featureSet),
      reasonCodes: [],
      status: "FRESH",
    };
  }

  const statuses = new Set(
    input.featureSet.features.map((feature) => feature.quality.status),
  );
  let status: DataQualityState = "PARTIAL";
  if (statuses.size === 1 && !statuses.has("FRESH")) {
    status = input.featureSet.features[0]!.quality.status;
  }
  return {
    ageMs: status === "UNAVAILABLE" ? null : maximumMeasuredAge(input.featureSet),
    reasonCodes: uniqueSorted(
      reasons.length > 0 ? reasons : ["feature_set_not_fully_fresh"],
    ),
    status,
  };
}

function maximumMeasuredAge(snapshot: FeatureSetSnapshot): number | null {
  const ages = snapshot.features
    .map((feature) => feature.quality.ageMs)
    .filter((age): age is number => age !== null);
  return ages.length === 0 ? null : Math.max(...ages);
}

export function buildFeatureQualitySnapshot(input: {
  generatedAt: string;
  onlineFeatureSet: FeatureSetSnapshot;
  releaseId: string;
  replayFeatureSet: FeatureSetSnapshot;
  replayRepeatFeatureSet: FeatureSetSnapshot;
  sourceCutoff: string;
}): FeatureQualitySnapshot {
  const distinctObjects = new Set([
    input.onlineFeatureSet,
    input.replayFeatureSet,
    input.replayRepeatFeatureSet,
  ]).size === 3;
  const online = FeatureSetSnapshotSchema.parse(input.onlineFeatureSet);
  const replay = FeatureSetSnapshotSchema.parse(input.replayFeatureSet);
  const replayRepeat = FeatureSetSnapshotSchema.parse(input.replayRepeatFeatureSet);
  const runIds = [
    online.computation.runId,
    replay.computation.runId,
    replayRepeat.computation.runId,
  ];
  const independentlyBuilt =
    distinctObjects &&
    new Set(runIds).size === 3 &&
    online.computation.mode === "ONLINE" &&
    replay.computation.mode === "REPLAY" &&
    replayRepeat.computation.mode === "REPLAY" &&
    online.computation.engineVersion === replay.computation.engineVersion &&
    replay.computation.engineVersion === replayRepeat.computation.engineVersion;
  const generatedMs = Date.parse(input.generatedAt);
  const cutoffMs = Date.parse(input.sourceCutoff);
  const snapshots = [online, replay, replayRepeat];
  if (
    !Number.isFinite(generatedMs) ||
    !Number.isFinite(cutoffMs) ||
    cutoffMs > generatedMs ||
    snapshots.some(
      (snapshot) =>
        snapshot.sourceCutoff !== input.sourceCutoff ||
        Date.parse(snapshot.generatedAt) > generatedMs,
    )
  ) {
    throw new Error("invalid feature quality point-in-time lineage");
  }

  const onlineSemanticHash = semanticHash(online);
  const replaySemanticHash = semanticHash(replay);
  const replayRepeatSemanticHash = semanticHash(replayRepeat);
  const onlineOfflineParity = !independentlyBuilt
    ? "NOT_EVALUATED"
    : onlineSemanticHash === replaySemanticHash
      ? "PASS"
      : "FAIL";
  const replayDeterministic =
    independentlyBuilt && replaySemanticHash === replayRepeatSemanticHash;
  const featureCount = online.features.length;
  const nullCount = online.features.filter((feature) => feature.value === null).length;
  const nullRate = featureCount === 0 ? 1 : nullCount / featureCount;
  const parityEvidence = {
    independentlyBuilt,
    onlineFeatureSetSnapshotId: online.snapshotId,
    replayFeatureSetSnapshotId: replay.snapshotId,
    replayRepeatFeatureSetSnapshotId: replayRepeat.snapshotId,
    onlineSemanticHash,
    replaySemanticHash,
    replayRepeatSemanticHash,
    featureEngineVersion: online.computation.engineVersion,
    onlineComputationRunId: online.computation.runId,
    replayComputationRunId: replay.computation.runId,
    replayRepeatComputationRunId: replayRepeat.computation.runId,
  };
  const quality = aggregateOnlineQuality({
    featureSet: online,
    independentlyBuilt,
    onlineOfflineParity,
    replayDeterministic,
  });
  const content = {
    featureCount,
    featureSetSnapshotId: online.snapshotId,
    nullCount,
    nullRate,
    onlineOfflineParity,
    parityEvidence,
    quality,
    replayDeterministic,
    sourceCutoff: input.sourceCutoff,
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(FeatureQualitySnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.FeatureQualitySnapshot,
    releaseId: input.releaseId,
    producerModule: "point_in_time_feature_engine",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(content),
    snapshotId: `feature-quality:${digest.slice(0, 24)}`,
    featureSetSnapshotId: online.snapshotId,
    featureCount,
    nullCount,
    onlineOfflineParity,
    replayDeterministic,
    nullRate,
    parityEvidence,
    quality,
  }));
}
