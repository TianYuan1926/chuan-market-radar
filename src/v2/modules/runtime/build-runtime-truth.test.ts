import assert from "node:assert/strict";
import test from "node:test";
import type { ReleaseRecord } from "../../domain/contracts";
import { RuntimeTruthSnapshotSchema } from "../../runtime-schema/learning-runtime-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import { buildFrozenM1FeatureContextSlice } from "../../testing/m1-slice-builders";
import {
  buildRuntimeTruthSnapshot,
  M1_RUNTIME_TRUTH_PROFILE,
} from "./build-runtime-truth";

const SOURCE_CUTOFF = "2026-01-15T00:00:00.000Z";
const CHECKED_AT = "2026-01-15T00:00:00.800Z";
const GENERATED_AT = "2026-01-15T00:00:00.900Z";

function releaseRecord(): ReleaseRecord {
  return {
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.ReleaseRecord,
    releaseId: "m1-test-release",
    producerModule: "runtime_security_release_control",
    generatedAt: CHECKED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    contentHash: "sha256:release-record-fixture",
    releaseRecordId: "release-record:m1-test-release",
    commit: "0123456789abcdef0123456789abcdef01234567",
    tree: "abcdef0123456789abcdef0123456789abcdef01",
    artifactDigest: "sha256:artifact-fixture",
    imageDigests: {},
    databaseSchemaVersion: "v2-m1-artifact-store.v1",
    featureVersions: ["m1-foundation-feature-set.v1"],
    ruleVersions: ["m1-cross-venue-fragmentation-context.v1"],
    rollbackReleaseId: "m1-test-release-previous",
    evidenceDigest: "sha256:release-evidence-fixture",
  };
}

const expectedRelease = {
  releaseId: "m1-test-release",
  commit: "0123456789abcdef0123456789abcdef01234567",
  tree: "abcdef0123456789abcdef0123456789abcdef01",
  databaseSchemaVersion: "v2-m1-artifact-store.v1",
  featureVersions: ["m1-foundation-feature-set.v1"],
} as const;

const ready = (checkId: string, evidenceId = `${checkId}:ready`) => ({
  checkId,
  status: "READY" as const,
  checkedAt: CHECKED_AT,
  evidenceIds: [evidenceId],
  reasonCodes: [],
});

const readyDependencies = () =>
  M1_RUNTIME_TRUTH_PROFILE.dependencyCheckIds.map((checkId) => ready(checkId));

const readyCapabilities = () =>
  M1_RUNTIME_TRUTH_PROFILE.businessCapabilityCheckIds.map((checkId) => ready(checkId));

test("keeps a fully passing local rehearsal below production business READY", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const truth = buildRuntimeTruthSnapshot({
    runtimeMode: "REHEARSAL",
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    releaseId: "m1-test-release",
    liveness: ready("process_liveness", "postgres-process:ready"),
    dependencies: readyDependencies(),
    businessCapabilities: readyCapabilities(),
    factQuality: slice.marketFacts.qualitySnapshot,
    featureQuality: slice.featureQuality,
    releaseRecord: releaseRecord(),
    expectedRelease,
  });

  assert.equal(truth.liveness, "READY");
  assert.equal(truth.dependencyReadiness, "READY");
  assert.equal(truth.dataFreshness, "FRESH");
  assert.equal(truth.releaseValidity, "VALID");
  assert.equal(truth.businessReadiness, "PARTIAL");
  assert.ok(truth.reasonCodes.includes("rehearsal_not_production_authority"));
});

test("allows READY only when production has all five evidence dimensions", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const truth = buildRuntimeTruthSnapshot({
    runtimeMode: "PRODUCTION",
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    releaseId: "m1-test-release",
    liveness: ready("process_liveness", "process:ready"),
    dependencies: readyDependencies(),
    businessCapabilities: readyCapabilities(),
    factQuality: slice.marketFacts.qualitySnapshot,
    featureQuality: slice.featureQuality,
    releaseRecord: releaseRecord(),
    expectedRelease,
  });

  assert.equal(truth.businessReadiness, "READY");
  assert.deepEqual(truth.reasonCodes, []);
  assert.equal(RuntimeTruthSnapshotSchema.safeParse(truth).success, true);
});

test("does not let liveness hide a dependency or release identity failure", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const truth = buildRuntimeTruthSnapshot({
    runtimeMode: "PRODUCTION",
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    releaseId: "m1-test-release",
    liveness: ready("process_liveness", "http:200"),
    dependencies: [{
      checkId: "postgres_artifact_ledger",
      status: "PARTIAL",
      checkedAt: CHECKED_AT,
      evidenceIds: ["postgres:unknown"],
      reasonCodes: ["postgres_write_path_unproven"],
    }, ready("replay_manifest_ledger")],
    businessCapabilities: readyCapabilities(),
    factQuality: slice.marketFacts.qualitySnapshot,
    featureQuality: slice.featureQuality,
    releaseRecord: { ...releaseRecord(), commit: "wrong-commit" },
    expectedRelease,
  });

  assert.equal(truth.liveness, "READY");
  assert.equal(truth.dependencyReadiness, "PARTIAL");
  assert.equal(truth.releaseValidity, "INVALID");
  assert.equal(truth.businessReadiness, "FAILED");
  assert.ok(truth.reasonCodes.includes("release_commit_mismatch"));
  assert.ok(truth.reasonCodes.includes("postgres_write_path_unproven"));
});

test("runtime schema rejects a forged rehearsal READY claim", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const truth = buildRuntimeTruthSnapshot({
    runtimeMode: "REHEARSAL",
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    releaseId: "m1-test-release",
    liveness: ready("process_liveness", "process:ready"),
    dependencies: readyDependencies(),
    businessCapabilities: readyCapabilities(),
    factQuality: slice.marketFacts.qualitySnapshot,
    featureQuality: slice.featureQuality,
    releaseRecord: releaseRecord(),
    expectedRelease,
  });
  const forged = {
    ...truth,
    runtimeMode: "REHEARSAL",
    businessReadiness: "READY",
  };

  assert.equal(RuntimeTruthSnapshotSchema.safeParse(forged).success, false);
});

test("keeps production partial when one required profile capability is absent", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const missingCapability = M1_RUNTIME_TRUTH_PROFILE
    .businessCapabilityCheckIds.at(-1)!;
  const truth = buildRuntimeTruthSnapshot({
    runtimeMode: "PRODUCTION",
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    releaseId: "m1-test-release",
    liveness: ready("process_liveness"),
    dependencies: readyDependencies(),
    businessCapabilities: readyCapabilities().filter(
      (observation) => observation.checkId !== missingCapability,
    ),
    factQuality: slice.marketFacts.qualitySnapshot,
    featureQuality: slice.featureQuality,
    releaseRecord: releaseRecord(),
    expectedRelease,
  });

  assert.equal(truth.businessReadiness, "PARTIAL");
  assert.ok(truth.reasonCodes.includes(
    `required_runtime_check_missing:${missingCapability}`,
  ));
});
