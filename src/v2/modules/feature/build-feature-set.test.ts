import assert from "node:assert/strict";
import test from "node:test";
import type {
  FactQualitySnapshot,
  PointInTimeMarketFact,
} from "../../domain/contracts";
import { buildFrozenM1IdentityFactSlice } from "../../testing/m1-slice-builders";
import {
  buildCrossVenueFeatureSet,
  CROSS_VENUE_DISPERSION_VERSION,
} from "./build-feature-set";

const COMPUTED_AT = "2026-01-15T00:00:00.400Z";
const GENERATED_AT = "2026-01-15T00:00:00.500Z";
const RELEASE_ID = "m1-feature-test-release";

async function fixture() {
  return buildFrozenM1IdentityFactSlice();
}

async function build(input: {
  computationMode?: "ONLINE" | "REPLAY";
  computationRunId?: string;
  factQuality?: FactQualitySnapshot;
  facts?: readonly PointInTimeMarketFact[];
} = {}) {
  const slice = await fixture();
  return buildCrossVenueFeatureSet({
    computationMode: input.computationMode ?? "ONLINE",
    computationRunId: input.computationRunId ?? "feature-set-test-run",
    computedAt: COMPUTED_AT,
    factQuality: input.factQuality ?? slice.marketFacts.qualitySnapshot,
    facts: input.facts ?? slice.marketFacts.facts,
    generatedAt: GENERATED_AT,
    releaseId: RELEASE_ID,
    sourceCutoff: slice.universe.sourceCutoff,
    universe: slice.universe,
  });
}

test("builds an immutable exact cross-venue feature with group identity", async () => {
  const slice = await fixture();
  const first = await build({ facts: slice.marketFacts.facts });
  const reordered = await build({ facts: [...slice.marketFacts.facts].reverse() });
  const feature = first.features[0]!;

  assert.equal(first.features.length, 1);
  assert.equal(feature.featureDefinitionVersion, CROSS_VENUE_DISPERSION_VERSION);
  assert.equal(feature.subjectType, "UNDERLYING_GROUP");
  assert.equal(feature.subjectId, slice.universe.accounting[0]!.underlyingGroupId);
  assert.equal(feature.value, "0.000035714286");
  assert.equal(feature.quality.status, "FRESH");
  assert.equal(feature.sourceFactIds.length, 3);
  assert.equal(first.snapshotId, reordered.snapshotId);
  assert.equal(first.contentHash, reordered.contentHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.features), true);
  assert.equal(Object.isFrozen(feature), true);
});

test("rejects missing, duplicate and future-produced source facts", async () => {
  const slice = await fixture();
  const [first, second] = slice.marketFacts.facts;

  await assert.rejects(
    async () => build({ facts: slice.marketFacts.facts.slice(1) }),
    /one fact is required/u,
  );
  await assert.rejects(
    async () => build({ facts: [first!, first!, second!] }),
    /market fact does not match/u,
  );
  const futureProduced = slice.marketFacts.facts.map((fact, index) =>
    index === 0
      ? {
        ...fact,
        contentHash: "sha256:future-produced-test-fact",
        generatedAt: "2026-01-15T00:00:00.450Z",
      }
      : fact);
  await assert.rejects(
    async () => build({ facts: futureProduced }),
    /market fact does not match/u,
  );
});

test("rejects facts from a later source cutoff", async () => {
  const slice = await fixture();
  const laterCutoff = slice.marketFacts.facts.map((fact, index) =>
    index === 0
      ? {
        ...fact,
        contentHash: "sha256:later-cutoff-test-fact",
        sourceCutoff: "2026-01-15T00:00:00.050Z",
      }
      : fact);

  await assert.rejects(
    async () => build({ facts: laterCutoff }),
    /market fact does not match/u,
  );
});

test("rejects non-canonical computation run identities before hashing", async () => {
  await assert.rejects(
    async () => build({ computationRunId: " replay-run-with-spaces " }),
    /feature computation run id is required/u,
  );
  await assert.rejects(
    async () => build({ computationRunId: "   " }),
    /feature computation run id is required/u,
  );
});

test("propagates stale source quality and emits null instead of a fallback value", async () => {
  const slice = await fixture();
  const staleFacts = slice.marketFacts.facts.map((fact, index) =>
    index === 0
      ? {
        ...fact,
        contentHash: "sha256:stale-test-fact",
        value: null,
        quality: {
          ageMs: 10_000,
          reasonCodes: ["mark_price_snapshot_stale_at_cutoff"],
          status: "STALE" as const,
        },
      }
      : fact);
  const partialFactQuality: FactQualitySnapshot = {
    ...slice.marketFacts.qualitySnapshot,
    completenessRatio: 2 / 3,
    contentHash: "sha256:partial-test-fact-quality",
    quality: {
      ageMs: 10_000,
      reasonCodes: ["mark_price_snapshot_stale_at_cutoff"],
      status: "PARTIAL",
    },
  };
  const featureSet = await build({
    factQuality: partialFactQuality,
    facts: staleFacts,
  });

  assert.equal(featureSet.features[0]?.value, null);
  assert.equal(featureSet.features[0]?.quality.status, "STALE");
  assert.ok(
    featureSet.features[0]?.quality.reasonCodes.some((reason) =>
      reason.includes("mark_price_snapshot_stale_at_cutoff")),
  );
});
