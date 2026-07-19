import assert from "node:assert/strict";
import test from "node:test";
import type { PointInTimeMarketFact } from "../../domain/contracts";
import { FeatureQualitySnapshotSchema } from "../../runtime-schema/foundation-schemas";
import { buildFrozenM1IdentityFactSlice } from "../../testing/m1-slice-builders";
import { buildCrossVenueFeatureSet } from "./build-feature-set";
import { buildFeatureQualitySnapshot } from "./build-feature-quality";

const SOURCE_CUTOFF = "2026-01-15T00:00:00.000Z";

async function featureSet(
  facts?: readonly PointInTimeMarketFact[],
  computationMode: "ONLINE" | "REPLAY" = "ONLINE",
  computationRunId = "feature-quality-default-run",
) {
  const slice = await buildFrozenM1IdentityFactSlice();
  return buildCrossVenueFeatureSet({
    computationMode,
    computationRunId,
    computedAt: "2026-01-15T00:00:00.400Z",
    factQuality: slice.marketFacts.qualitySnapshot,
    facts: facts ?? slice.marketFacts.facts,
    generatedAt: "2026-01-15T00:00:00.500Z",
    releaseId: "m1-feature-quality-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe: slice.universe,
  });
}

async function alteredFacts(): Promise<readonly PointInTimeMarketFact[]> {
  const slice = await buildFrozenM1IdentityFactSlice();
  return slice.marketFacts.facts.map((fact, index) =>
    index === 0
      ? {
        ...fact,
        contentHash: "sha256:altered-price-test-fact",
        value: "43000",
      }
      : fact);
}

function quality(
  onlineFeatureSet: Awaited<ReturnType<typeof featureSet>>,
  replayFeatureSet: Awaited<ReturnType<typeof featureSet>>,
  replayRepeatFeatureSet: Awaited<ReturnType<typeof featureSet>>,
) {
  return buildFeatureQualitySnapshot({
    generatedAt: "2026-01-15T00:00:00.600Z",
    onlineFeatureSet,
    releaseId: "m1-feature-quality-test-release",
    replayFeatureSet,
    replayRepeatFeatureSet,
    sourceCutoff: SOURCE_CUTOFF,
  });
}

test("proves parity only with three independently built equal semantic artifacts", async () => {
  const result = quality(
    await featureSet(undefined, "ONLINE", "online-run-1"),
    await featureSet(undefined, "REPLAY", "replay-run-1"),
    await featureSet(undefined, "REPLAY", "replay-run-2"),
  );

  assert.equal(result.onlineOfflineParity, "PASS");
  assert.equal(result.replayDeterministic, true);
  assert.equal(result.featureCount, 1);
  assert.equal(result.nullCount, 0);
  assert.equal(result.nullRate, 0);
  assert.equal(result.quality.status, "FRESH");
  assert.equal(result.parityEvidence.independentlyBuilt, true);
  assert.equal(
    new Set([
      result.parityEvidence.onlineSemanticHash,
      result.parityEvidence.replaySemanticHash,
      result.parityEvidence.replayRepeatSemanticHash,
    ]).size,
    1,
  );
  assert.equal(Object.isFrozen(result.parityEvidence), true);
});

test("does not let one reused object masquerade as independent replay evidence", async () => {
  const oneBuild = await featureSet();
  const result = quality(oneBuild, oneBuild, oneBuild);
  const shallowCloneAttempt = quality(
    oneBuild,
    {
      ...oneBuild,
      computation: { ...oneBuild.computation, mode: "REPLAY" as const },
    },
    {
      ...oneBuild,
      computation: { ...oneBuild.computation, mode: "REPLAY" as const },
    },
  );

  assert.equal(result.onlineOfflineParity, "NOT_EVALUATED");
  assert.equal(result.replayDeterministic, false);
  assert.equal(result.quality.status, "UNAVAILABLE");
  assert.ok(
    result.quality.reasonCodes.includes(
      "independent_online_replay_evidence_required",
    ),
  );
  assert.equal(shallowCloneAttempt.onlineOfflineParity, "NOT_EVALUATED");
  assert.equal(shallowCloneAttempt.parityEvidence.independentlyBuilt, false);
});

test("separately identifies online parity failure and replay nondeterminism", async () => {
  const changed = await alteredFacts();
  const parityFailure = quality(
    await featureSet(undefined, "ONLINE", "parity-online-run"),
    await featureSet(changed, "REPLAY", "parity-replay-run-1"),
    await featureSet(changed, "REPLAY", "parity-replay-run-2"),
  );
  const nondeterministicReplay = quality(
    await featureSet(undefined, "ONLINE", "determinism-online-run"),
    await featureSet(undefined, "REPLAY", "determinism-replay-run-1"),
    await featureSet(changed, "REPLAY", "determinism-replay-run-2"),
  );

  assert.equal(parityFailure.onlineOfflineParity, "FAIL");
  assert.equal(parityFailure.replayDeterministic, true);
  assert.equal(parityFailure.quality.status, "INVALID");
  assert.equal(nondeterministicReplay.onlineOfflineParity, "PASS");
  assert.equal(nondeterministicReplay.replayDeterministic, false);
  assert.equal(nondeterministicReplay.quality.status, "INVALID");
});

test("runtime schema blocks a forged fresh parity claim", async () => {
  const result = quality(
    await featureSet(undefined, "ONLINE", "schema-online-run"),
    await featureSet(undefined, "REPLAY", "schema-replay-run-1"),
    await featureSet(undefined, "REPLAY", "schema-replay-run-2"),
  );
  const forged = {
    ...result,
    onlineOfflineParity: "FAIL",
    quality: { ageMs: 0, reasonCodes: [], status: "FRESH" },
  };

  assert.equal(FeatureQualitySnapshotSchema.safeParse(forged).success, false);
});
