import assert from "node:assert/strict";
import test from "node:test";
import type { PointInTimeMarketFact } from "../../domain/contracts";
import { buildFrozenM1IdentityFactSlice } from "../../testing/m1-slice-builders";
import { buildCrossVenueFeatureSet } from "../feature/build-feature-set";
import { buildFeatureQualitySnapshot } from "../feature/build-feature-quality";
import { buildM1MarketContext } from "./build-market-context";

const SOURCE_CUTOFF = "2026-01-15T00:00:00.000Z";

async function featureSet(
  facts?: readonly PointInTimeMarketFact[],
  computationMode: "ONLINE" | "REPLAY" = "ONLINE",
  computationRunId = "context-default-run",
) {
  const slice = await buildFrozenM1IdentityFactSlice();
  return buildCrossVenueFeatureSet({
    computationMode,
    computationRunId,
    computedAt: "2026-01-15T00:00:00.400Z",
    factQuality: slice.marketFacts.qualitySnapshot,
    facts: facts ?? slice.marketFacts.facts,
    generatedAt: "2026-01-15T00:00:00.500Z",
    releaseId: "m1-context-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe: slice.universe,
  });
}

async function buildContext(input: {
  alteredReplay?: boolean;
  highDispersion?: boolean;
} = {}) {
  const slice = await buildFrozenM1IdentityFactSlice();
  const highFacts = slice.marketFacts.facts.map((fact, index) =>
    input.highDispersion && index === 0
      ? {
        ...fact,
        contentHash: "sha256:high-dispersion-test-fact",
        value: "43000",
      }
      : fact);
  const changedReplayFacts = slice.marketFacts.facts.map((fact, index) =>
    input.alteredReplay && index === 0
      ? {
        ...fact,
        contentHash: "sha256:altered-replay-test-fact",
        value: "44000",
      }
      : fact);
  const online = await featureSet(highFacts, "ONLINE", "context-online-run");
  const replay = await featureSet(
    input.alteredReplay ? changedReplayFacts : highFacts,
    "REPLAY",
    "context-replay-run-1",
  );
  const repeat = await featureSet(
    input.alteredReplay ? changedReplayFacts : highFacts,
    "REPLAY",
    "context-replay-run-2",
  );
  const featureQuality = buildFeatureQualitySnapshot({
    generatedAt: "2026-01-15T00:00:00.600Z",
    onlineFeatureSet: online,
    releaseId: "m1-context-test-release",
    replayFeatureSet: replay,
    replayRepeatFeatureSet: repeat,
    sourceCutoff: SOURCE_CUTOFF,
  });
  return {
    context: buildM1MarketContext({
      featureQuality,
      featureSet: online,
      generatedAt: "2026-01-15T00:00:00.700Z",
      releaseId: "m1-context-test-release",
      sourceCutoff: SOURCE_CUTOFF,
      universe: slice.universe,
    }),
    featureQuality,
    online,
    universe: slice.universe,
  };
}

test("keeps unsupported market dimensions unknown and never invents direction", async () => {
  const first = await buildContext();
  const second = await buildContext();
  const context = first.context;

  assert.equal(context.regime, "UNKNOWN");
  assert.equal(context.volatility, "UNKNOWN");
  assert.equal(context.breadth, null);
  assert.equal(context.correlation, null);
  assert.equal(context.liquidity, "UNKNOWN");
  assert.equal(context.confidence, "LOW");
  assert.equal(context.quality.status, "PARTIAL");
  assert.equal("direction" in context, false);
  assert.ok(
    context.quality.reasonCodes.includes(
      "cross_venue_price_alignment_not_liquidity_health_proof",
    ),
  );
  assert.equal(context.snapshotId, second.context.snapshotId);
  assert.equal(context.contentHash, second.context.contentHash);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.uncertainty), true);
});

test("reports fragmentation only when fresh parity-proven dispersion exceeds threshold", async () => {
  const result = await buildContext({ highDispersion: true });

  assert.equal(result.context.liquidity, "FRAGMENTED");
  assert.equal(result.context.confidence, "LOW");
  assert.equal(result.context.quality.status, "PARTIAL");
  assert.ok(
    result.context.quality.reasonCodes.includes(
      "cross_venue_price_fragmentation_observed",
    ),
  );
});

test("blocks context claims when online and replay semantics disagree", async () => {
  const result = await buildContext({ alteredReplay: true });

  assert.equal(result.featureQuality.onlineOfflineParity, "FAIL");
  assert.equal(result.context.liquidity, "UNKNOWN");
  assert.equal(result.context.confidence, "UNKNOWN");
  assert.equal(result.context.quality.status, "INVALID");
  assert.equal(result.context.uncertainty.data.status, "UNKNOWN");
});

test("preserves an upstream auth failure instead of flattening it to partial", async () => {
  const result = await buildContext();
  const authFailureQuality = {
    ...result.featureQuality,
    contentHash: "sha256:auth-failure-feature-quality",
    quality: {
      ageMs: null,
      reasonCodes: ["provider_auth_failed"],
      status: "AUTH_ERROR" as const,
    },
  };
  const context = buildM1MarketContext({
    featureQuality: authFailureQuality,
    featureSet: result.online,
    generatedAt: "2026-01-15T00:00:00.700Z",
    releaseId: "m1-context-test-release",
    sourceCutoff: SOURCE_CUTOFF,
    universe: result.universe,
  });

  assert.equal(context.quality.status, "AUTH_ERROR");
  assert.equal(context.liquidity, "UNKNOWN");
  assert.equal(context.confidence, "UNKNOWN");
});

test("rejects mismatched FeatureQuality lineage", async () => {
  const result = await buildContext();
  const mismatchedQuality = {
    ...result.featureQuality,
    featureSetSnapshotId: "feature-set:unrelated",
    parityEvidence: {
      ...result.featureQuality.parityEvidence,
      onlineFeatureSetSnapshotId: "feature-set:unrelated",
    },
  };

  assert.throws(
    () => buildM1MarketContext({
      featureQuality: mismatchedQuality,
      featureSet: result.online,
      generatedAt: "2026-01-15T00:00:00.700Z",
      releaseId: "m1-context-test-release",
      sourceCutoff: SOURCE_CUTOFF,
      universe: result.universe,
    }),
    /invalid market context point-in-time lineage/u,
  );
});
