import type {
  FactQualitySnapshot,
  FeatureQualitySnapshot,
  ReleaseRecord,
  RuntimeTruthCheckEvidence,
  RuntimeTruthSnapshot,
} from "../../domain/contracts";
import {
  FactQualitySnapshotSchema,
  FeatureQualitySnapshotSchema,
} from "../../runtime-schema/foundation-schemas";
import {
  ReleaseRecordSchema,
  RuntimeTruthSnapshotSchema,
} from "../../runtime-schema/learning-runtime-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

type ReadinessStatus = "READY" | "PARTIAL" | "FAILED" | "UNKNOWN";

export const M1_RUNTIME_TRUTH_PROFILE = Object.freeze({
  version: "m1-runtime-truth-profile.v1",
  livenessCheckId: "process_liveness",
  dependencyCheckIds: Object.freeze([
    "postgres_artifact_ledger",
    "replay_manifest_ledger",
  ]),
  businessCapabilityCheckIds: Object.freeze([
    "append_only_storage",
    "idempotent_ingestion",
    "cutoff_safe_replay",
    "online_offline_parity",
    "release_identity_binding",
  ]),
  dataCheckIds: Object.freeze(["fact_quality", "feature_quality"]),
  releaseCheckId: "release_binding",
} as const);

export type RuntimeReadinessObservation = Readonly<{
  checkId: string;
  status: ReadinessStatus;
  checkedAt: string;
  evidenceIds: readonly string[];
  reasonCodes: readonly string[];
}>;

export type ExpectedReleaseBinding = Readonly<{
  releaseId: string;
  commit: string;
  tree: string;
  databaseSchemaVersion: string;
  featureVersions: readonly string[];
}>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function evidence(
  checkedAt: string,
  checkIds: readonly string[],
  evidenceIds: readonly string[],
  reasonCodes: readonly string[],
): RuntimeTruthCheckEvidence {
  if (
    !Number.isFinite(Date.parse(checkedAt)) ||
    checkIds.length === 0 ||
    checkIds.some((id) => id.trim() === "") ||
    evidenceIds.length === 0 ||
    evidenceIds.some((id) => id.trim() === "")
  ) {
    throw new Error("runtime truth observations require timestamped evidence");
  }
  return {
    checkedAt,
    checkIds: uniqueSorted(checkIds),
    evidenceIds: uniqueSorted(evidenceIds),
    reasonCodes: uniqueSorted(reasonCodes),
  };
}

function aggregateReadiness(
  observations: readonly RuntimeReadinessObservation[],
  requiredCheckIds: readonly string[],
  fallbackCheckedAt: string,
): Readonly<{
  status: ReadinessStatus;
  evidence: RuntimeTruthCheckEvidence;
}> {
  if (requiredCheckIds.length === 0) {
    throw new Error("runtime truth profiles require explicit checks");
  }
  const observedIds = observations.map((observation) => observation.checkId);
  if (new Set(observedIds).size !== observedIds.length) {
    throw new Error("runtime truth observations cannot duplicate check ids");
  }
  const required = new Set(requiredCheckIds);
  const unexpected = observedIds.filter((id) => !required.has(id));
  if (unexpected.length > 0) {
    throw new Error("runtime truth observations contain checks outside the active profile");
  }
  const missing = requiredCheckIds.filter((id) => !observedIds.includes(id));
  let status: ReadinessStatus = "READY";
  if (observations.some((observation) => observation.status === "FAILED")) {
    status = "FAILED";
  } else if (
    observations.length === 0 ||
    observations.every((observation) => observation.status === "UNKNOWN")
  ) {
    status = "UNKNOWN";
  } else if (
    missing.length > 0 ||
    observations.some((observation) => observation.status !== "READY")
  ) {
    status = "PARTIAL";
  }
  const reasons = observations.flatMap((observation) => observation.reasonCodes);
  reasons.push(...missing.map((id) => `required_runtime_check_missing:${id}`));
  if (status !== "READY" && reasons.length === 0) {
    reasons.push(`${status.toLowerCase()}_runtime_observation_without_ready_proof`);
  }
  return {
    status,
    evidence: evidence(
      observations.reduce((latest, observation) =>
        Date.parse(observation.checkedAt) > Date.parse(latest)
          ? observation.checkedAt
          : latest, observations[0]?.checkedAt ?? fallbackCheckedAt),
      requiredCheckIds,
      [
        ...observations.flatMap((observation) => observation.evidenceIds),
        ...missing.map((id) => `missing-check:${id}`),
      ],
      reasons,
    ),
  };
}

function dataFreshness(input: {
  checkedAt: string;
  factQuality: FactQualitySnapshot;
  featureQuality: FeatureQualitySnapshot;
  releaseId: string;
  sourceCutoff: string;
}): Readonly<{
  status: RuntimeTruthSnapshot["dataFreshness"];
  evidence: RuntimeTruthCheckEvidence;
}> {
  const factQuality = FactQualitySnapshotSchema.parse(input.factQuality);
  const featureQuality = FeatureQualitySnapshotSchema.parse(input.featureQuality);
  const reasons: string[] = [];
  if (
    factQuality.sourceCutoff !== input.sourceCutoff ||
    featureQuality.sourceCutoff !== input.sourceCutoff
  ) {
    reasons.push("runtime_data_cutoff_mismatch");
  }
  if (
    Date.parse(factQuality.generatedAt) > Date.parse(input.checkedAt) ||
    Date.parse(featureQuality.generatedAt) > Date.parse(input.checkedAt)
  ) {
    reasons.push("runtime_data_observed_after_truth_snapshot");
  }
  if (
    factQuality.releaseId !== input.releaseId ||
    featureQuality.releaseId !== input.releaseId
  ) {
    reasons.push("runtime_data_release_mismatch");
  }
  if (featureQuality.onlineOfflineParity !== "PASS") {
    reasons.push("online_replay_parity_not_proven");
  }
  if (!featureQuality.replayDeterministic) {
    reasons.push("replay_determinism_not_proven");
  }
  reasons.push(...factQuality.quality.reasonCodes, ...featureQuality.quality.reasonCodes);

  let status: RuntimeTruthSnapshot["dataFreshness"] = "PARTIAL";
  if (
    reasons.length === 0 &&
    factQuality.quality.status === "FRESH" &&
    featureQuality.quality.status === "FRESH" &&
    featureQuality.onlineOfflineParity === "PASS" &&
    featureQuality.replayDeterministic
  ) {
    status = "FRESH";
  } else if (
    factQuality.quality.status === "STALE" ||
    featureQuality.quality.status === "STALE"
  ) {
    status = "STALE";
  } else if (
    [factQuality.quality.status, featureQuality.quality.status].every(
      (quality) => quality === "UNAVAILABLE" || quality === "AUTH_ERROR",
    )
  ) {
    status = "UNKNOWN";
  }
  if (status !== "FRESH" && reasons.length === 0) {
    reasons.push("runtime_data_not_fully_fresh");
  }
  return {
    status,
    evidence: evidence(
      input.checkedAt,
      M1_RUNTIME_TRUTH_PROFILE.dataCheckIds,
      [factQuality.snapshotId, featureQuality.snapshotId],
      reasons,
    ),
  };
}

function releaseValidity(input: {
  checkedAt: string;
  expected: ExpectedReleaseBinding;
  releaseRecord: ReleaseRecord | null;
}): Readonly<{
  status: RuntimeTruthSnapshot["releaseValidity"];
  evidence: RuntimeTruthCheckEvidence;
}> {
  if (input.releaseRecord === null) {
    return {
      status: "UNKNOWN",
      evidence: evidence(
        input.checkedAt,
        [M1_RUNTIME_TRUTH_PROFILE.releaseCheckId],
        ["release-evidence:absent"],
        ["release_record_absent"],
      ),
    };
  }
  const record = ReleaseRecordSchema.parse(input.releaseRecord);
  const reasons: string[] = [];
  if (record.releaseId !== input.expected.releaseId) {
    reasons.push("release_id_mismatch");
  }
  if (Date.parse(record.generatedAt) > Date.parse(input.checkedAt)) {
    reasons.push("release_record_observed_after_runtime_snapshot");
  }
  if (record.commit !== input.expected.commit) {
    reasons.push("release_commit_mismatch");
  }
  if (record.tree !== input.expected.tree) {
    reasons.push("release_tree_mismatch");
  }
  if (record.databaseSchemaVersion !== input.expected.databaseSchemaVersion) {
    reasons.push("release_database_schema_mismatch");
  }
  const expectedFeatures = uniqueSorted(input.expected.featureVersions);
  const actualFeatures = uniqueSorted(record.featureVersions);
  if (JSON.stringify(expectedFeatures) !== JSON.stringify(actualFeatures)) {
    reasons.push("release_feature_version_mismatch");
  }
  return {
    status: reasons.length === 0 ? "VALID" : "INVALID",
    evidence: evidence(
      input.checkedAt,
      [M1_RUNTIME_TRUTH_PROFILE.releaseCheckId],
      [record.releaseRecordId, record.evidenceDigest],
      reasons,
    ),
  };
}

export function buildRuntimeTruthSnapshot(input: {
  runtimeMode: RuntimeTruthSnapshot["runtimeMode"];
  generatedAt: string;
  sourceCutoff: string;
  releaseId: string;
  liveness: RuntimeReadinessObservation;
  dependencies: readonly RuntimeReadinessObservation[];
  businessCapabilities: readonly RuntimeReadinessObservation[];
  factQuality: FactQualitySnapshot;
  featureQuality: FeatureQualitySnapshot;
  releaseRecord: ReleaseRecord | null;
  expectedRelease: ExpectedReleaseBinding;
}): RuntimeTruthSnapshot {
  const generatedMs = Date.parse(input.generatedAt);
  const sourceCutoffMs = Date.parse(input.sourceCutoff);
  const observations = [
    input.liveness,
    ...input.dependencies,
    ...input.businessCapabilities,
  ];
  if (
    !Number.isFinite(generatedMs) ||
    !Number.isFinite(sourceCutoffMs) ||
    sourceCutoffMs > generatedMs ||
    observations.some((observation) =>
      Date.parse(observation.checkedAt) < sourceCutoffMs ||
      Date.parse(observation.checkedAt) > generatedMs)
  ) {
    throw new Error("runtime truth chronology is invalid");
  }
  if (input.liveness.checkId !== M1_RUNTIME_TRUTH_PROFILE.livenessCheckId) {
    throw new Error("runtime liveness observation does not match the active profile");
  }

  const liveness = input.liveness.status === "PARTIAL"
    ? "UNKNOWN"
    : input.liveness.status;
  const livenessReasons = [...input.liveness.reasonCodes];
  if (liveness !== "READY" && livenessReasons.length === 0) {
    livenessReasons.push("process_liveness_not_proven");
  }
  const dependency = aggregateReadiness(
    input.dependencies,
    M1_RUNTIME_TRUTH_PROFILE.dependencyCheckIds,
    input.generatedAt,
  );
  const capabilities = aggregateReadiness(
    input.businessCapabilities,
    M1_RUNTIME_TRUTH_PROFILE.businessCapabilityCheckIds,
    input.generatedAt,
  );
  const data = dataFreshness({
    checkedAt: input.generatedAt,
    factQuality: input.factQuality,
    featureQuality: input.featureQuality,
    releaseId: input.releaseId,
    sourceCutoff: input.sourceCutoff,
  });
  const release = releaseValidity({
    checkedAt: input.generatedAt,
    expected: input.expectedRelease,
    releaseRecord: input.releaseRecord,
  });

  let businessReadiness: RuntimeTruthSnapshot["businessReadiness"] = "PARTIAL";
  const businessReasons = [...capabilities.evidence.reasonCodes];
  if (
    liveness === "FAILED" ||
    dependency.status === "FAILED" ||
    data.status === "STALE" ||
    release.status === "INVALID" ||
    capabilities.status === "FAILED"
  ) {
    businessReadiness = "FAILED";
  } else if (
    input.runtimeMode === "PRODUCTION" &&
    liveness === "READY" &&
    dependency.status === "READY" &&
    data.status === "FRESH" &&
    release.status === "VALID" &&
    capabilities.status === "READY"
  ) {
    businessReadiness = "READY";
  } else if (
    liveness === "UNKNOWN" &&
    dependency.status === "UNKNOWN" &&
    data.status === "UNKNOWN" &&
    release.status === "UNKNOWN" &&
    capabilities.status === "UNKNOWN"
  ) {
    businessReadiness = "UNKNOWN";
  }
  if (input.runtimeMode === "REHEARSAL") {
    businessReasons.push("rehearsal_not_production_authority");
  }
  if (businessReadiness !== "READY" && businessReasons.length === 0) {
    businessReasons.push("business_readiness_not_fully_proven");
  }

  const checks = {
    liveness: evidence(
      input.liveness.checkedAt,
      [M1_RUNTIME_TRUTH_PROFILE.livenessCheckId],
      input.liveness.evidenceIds,
      livenessReasons,
    ),
    dependencyReadiness: dependency.evidence,
    businessReadiness: evidence(
      capabilities.evidence.checkedAt,
      M1_RUNTIME_TRUTH_PROFILE.businessCapabilityCheckIds,
      capabilities.evidence.evidenceIds,
      businessReasons,
    ),
    dataFreshness: data.evidence,
    releaseValidity: release.evidence,
  };
  const reasonCodes = uniqueSorted(Object.values(checks).flatMap(
    (check) => check.reasonCodes,
  ));
  const content = {
    businessReadiness,
    checks,
    dataFreshness: data.status,
    dependencyReadiness: dependency.status,
    liveness,
    reasonCodes,
    releaseValidity: release.status,
    runtimeMode: input.runtimeMode,
    runtimeProfileVersion: M1_RUNTIME_TRUTH_PROFILE.version,
    sourceCutoff: input.sourceCutoff,
  };
  const digest = stableSha256(content);
  return deepFreezeArtifact(RuntimeTruthSnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.RuntimeTruthSnapshot,
    releaseId: input.releaseId,
    producerModule: "runtime_security_release_control",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(content),
    runtimeTruthId: `runtime-truth:${digest.slice(0, 24)}`,
    runtimeMode: input.runtimeMode,
    runtimeProfileVersion: M1_RUNTIME_TRUTH_PROFILE.version,
    liveness,
    dependencyReadiness: dependency.status,
    businessReadiness,
    dataFreshness: data.status,
    releaseValidity: release.status,
    checks,
    reasonCodes,
  }));
}
