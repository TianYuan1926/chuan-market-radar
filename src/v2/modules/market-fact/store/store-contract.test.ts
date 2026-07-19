import assert from "node:assert/strict";
import test from "node:test";
import type { M1SqlPool } from "./contracts";
import { M1StoreError } from "./contracts";
import { validateM1Artifact } from "./artifact-integrity";
import { M1PostgresArtifactStore } from "./postgres-artifact-store";
import { buildFrozenM1FeatureContextSlice } from "../../../testing/m1-slice-builders";

test("requires an explicitly injected durable PostgreSQL pool", () => {
  assert.throws(
    () => new M1PostgresArtifactStore(null as unknown as M1SqlPool),
    (error: unknown) =>
      error instanceof M1StoreError && error.code === "DURABLE_STORE_REQUIRED",
  );
});

test("rejects a schema-valid artifact whose semantic hash was not rebuilt", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  const forged = {
    ...slice.universe,
    policyVersion: "forged-policy.v1",
  };

  assert.throws(
    () => validateM1Artifact("EligibleInstrumentSnapshot", forged),
    (error: unknown) =>
      error instanceof M1StoreError &&
      error.code === "ARTIFACT_CONTENT_HASH_INVALID",
  );
});

test("rejects a forged fact-quality denominator before opening a transaction", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  let connected = false;
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => {
      connected = true;
      throw new Error("must not connect");
    },
  } as M1SqlPool;
  const store = new M1PostgresArtifactStore(pool);
  const retainUntil = "2028-01-15T00:00:00.000Z";

  await assert.rejects(
    store.appendArtifacts([
      { artifactName: "EligibleInstrumentSnapshot", artifact: slice.universe, retainUntil },
      ...slice.marketFacts.facts.map((artifact) => ({
        artifactName: "PointInTimeMarketFact" as const,
        artifact,
        retainUntil,
      })),
      {
        artifactName: "FactQualitySnapshot",
        artifact: {
          ...slice.marketFacts.qualitySnapshot,
          completenessRatio: 0.5,
        },
        retainUntil,
      },
    ]),
    (error: unknown) =>
      error instanceof M1StoreError &&
      error.code === "ARTIFACT_METADATA_MISMATCH",
  );
  assert.equal(connected, false);
});

test("does not allow an orphan market fact to bypass its universe denominator", async () => {
  const slice = await buildFrozenM1FeatureContextSlice();
  let connected = false;
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => {
      connected = true;
      throw new Error("must not connect");
    },
  } as M1SqlPool;
  const store = new M1PostgresArtifactStore(pool);

  await assert.rejects(
    store.appendArtifacts([{
      artifactName: "PointInTimeMarketFact",
      artifact: slice.marketFacts.facts[0]!,
      retainUntil: "2028-01-15T00:00:00.000Z",
    }]),
    (error: unknown) =>
      error instanceof M1StoreError &&
      error.code === "ARTIFACT_METADATA_MISMATCH",
  );
  assert.equal(connected, false);
});
