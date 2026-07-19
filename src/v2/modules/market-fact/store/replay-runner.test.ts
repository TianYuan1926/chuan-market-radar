import assert from "node:assert/strict";
import test from "node:test";
import { buildFrozenM1FeatureContextSlice } from "../../../testing/m1-slice-builders";
import {
  artifactId,
  storageDigest,
} from "./artifact-integrity";
import {
  type M1ArtifactByName,
  type M1ArtifactName,
  type M1StoredArtifactRecord,
  M1StoreError,
} from "./contracts";
import {
  buildM1ReplayManifest,
  validateM1ReplayManifest,
} from "./replay-manifest";
import { runM1Replay, type M1ReplaySourceStore } from "./replay-runner";

const PERSISTED_AT = "2026-01-15T00:00:00.800Z";
const RETAIN_UNTIL = "2028-01-15T00:00:00.000Z";

function stored<Name extends M1ArtifactName>(
  artifactName: Name,
  payload: M1ArtifactByName[Name],
  persistedAt = PERSISTED_AT,
): M1StoredArtifactRecord<Name> {
  const id = artifactId(artifactName, payload);
  return {
    artifactName,
    artifactId: id,
    idempotencyKey: `fixture:${artifactName}:${id}`,
    schemaVersion: payload.schemaVersion,
    releaseId: payload.releaseId,
    sourceCutoff: payload.sourceCutoff,
    generatedAt: payload.generatedAt,
    contentHash: payload.contentHash,
    storageDigest: storageDigest(payload),
    retentionPolicyVersion: "fixture-retention.v1",
    retainUntil: RETAIN_UNTIL,
    persistedAt,
    writerIdentity: "fixture-writer",
    payload,
  };
}

async function fixture() {
  const slice = await buildFrozenM1FeatureContextSlice();
  const universe = stored("EligibleInstrumentSnapshot", slice.universe);
  const facts = slice.marketFacts.facts.map((fact) =>
    stored("PointInTimeMarketFact", fact));
  const factQuality = stored(
    "FactQualitySnapshot",
    slice.marketFacts.qualitySnapshot,
  );
  const onlineFeatureSet = stored(
    "FeatureSetSnapshot",
    slice.onlineFeatureSet,
  );
  const manifest = buildM1ReplayManifest({
    createdAt: "2026-01-15T00:00:00.900Z",
    eventCutoff: "2026-01-15T00:00:00.000Z",
    knowledgeCutoff: "2026-01-15T00:00:00.850Z",
    universe,
    facts,
    factQuality,
    onlineFeatureSet,
  });
  const records = new Map(
    [universe, ...facts, factQuality, onlineFeatureSet].map((record) => [
      `${record.artifactName}:${record.artifactId}`,
      record,
    ]),
  );
  const store: M1ReplaySourceStore = {
    async readArtifact(artifactName, requestedId) {
      const record = records.get(`${artifactName}:${requestedId}`);
      if (record === undefined) {
        throw new M1StoreError("ARTIFACT_NOT_FOUND", "fixture record missing");
      }
      return record as M1StoredArtifactRecord<typeof artifactName>;
    },
  };
  return { manifest, store };
}

test("rebuilds online semantics twice from exact durable manifest sources", async () => {
  const { manifest, store } = await fixture();
  const result = await runM1Replay({
    store,
    manifest,
    replayRunId: "durable-replay-run-1",
    replayRepeatRunId: "durable-replay-run-2",
  });

  assert.equal(result.featureQuality.onlineOfflineParity, "PASS");
  assert.equal(result.featureQuality.replayDeterministic, true);
  assert.equal(result.featureQuality.parityEvidence.independentlyBuilt, true);
  assert.equal(result.marketContext.quality.status, "PARTIAL");
  assert.equal(result.marketContext.regime, "UNKNOWN");
});

test("rejects a tampered manifest digest and future knowledge", async () => {
  const { manifest } = await fixture();
  assert.throws(
    () => validateM1ReplayManifest({
      ...manifest,
      manifestDigest: `sha256:${"0".repeat(64)}`,
    }),
    (error: unknown) =>
      error instanceof M1StoreError && error.code === "REPLAY_MANIFEST_REJECTED",
  );

  const slice = await buildFrozenM1FeatureContextSlice();
  assert.throws(
    () => buildM1ReplayManifest({
      createdAt: "2026-01-15T00:00:00.900Z",
      eventCutoff: "2026-01-15T00:00:00.000Z",
      knowledgeCutoff: "2026-01-15T00:00:00.850Z",
      universe: stored(
        "EligibleInstrumentSnapshot",
        slice.universe,
        "2026-01-15T00:00:00.851Z",
      ),
      facts: slice.marketFacts.facts.map((fact) =>
        stored("PointInTimeMarketFact", fact)),
      factQuality: stored(
        "FactQualitySnapshot",
        slice.marketFacts.qualitySnapshot,
      ),
      onlineFeatureSet: stored("FeatureSetSnapshot", slice.onlineFeatureSet),
    }),
    (error: unknown) =>
      error instanceof M1StoreError && error.code === "REPLAY_CUTOFF_VIOLATION",
  );
});

test("does not accept one replay run identity as independent evidence", async () => {
  const { manifest, store } = await fixture();
  await assert.rejects(
    runM1Replay({
      store,
      manifest,
      replayRunId: "same-run",
      replayRepeatRunId: "same-run",
    }),
    (error: unknown) =>
      error instanceof M1StoreError && error.code === "REPLAY_MANIFEST_REJECTED",
  );
});
