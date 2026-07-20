import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_DISCOVERY_GOLDEN_FIXTURES,
} from "../../testing/m2-discovery-golden-fixtures";
import {
  M2_DRAFT_DETECTORS,
  M2_DRAFT_REPLAY_INPUT_VERSION,
  M2DraftReplayKernelInputSchema,
  type M2DraftReplayKernelInput,
} from "./draft-replay-contract";
import {
  runPreMoveCompressionDraftReplay,
  runPreMoveFlowDivergenceDraftReplay,
} from "./draft-replay-kernels";
import {
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY,
  M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
  M2DraftDiagnosticRankingReportSchema,
  rankM2DraftReplayDiagnostics,
} from "./draft-diagnostic-ranking";

type ObservationInput = Readonly<{
  semanticKey: string;
  value: number | boolean;
}>;

function replayInput(
  identity: string,
  observations: readonly ObservationInput[],
  eventCutoff = "2026-01-15T00:01:00.000Z",
): M2DraftReplayKernelInput {
  const base = M2_DISCOVERY_GOLDEN_FIXTURES.cases[0]!.detectorInput;
  const featureIds = observations.map((observation, index) =>
    `feature:${identity}:${index}:${observation.semanticKey}`);
  return M2DraftReplayKernelInputSchema.parse({
    schemaVersion: M2_DRAFT_REPLAY_INPUT_VERSION,
    executionMode: "REPLAY_ONLY_NO_AUTHORITY",
    detectorInput: {
      ...base,
      canonicalInstrumentId: `BINANCE:LINEAR_PERPETUAL:${identity}:USDT`,
      underlyingGroupId: `UNDERLYING:${identity}`,
      eventCutoff,
      knowledgeCutoff: eventCutoff,
      universe: {
        ...base.universe,
        sourceCutoff: eventCutoff,
        availableAt: eventCutoff,
      },
      featureSet: {
        ...base.featureSet,
        sourceCutoff: eventCutoff,
        availableAt: eventCutoff,
        featureIds,
      },
      featureQuality: {
        ...base.featureQuality,
        sourceCutoff: eventCutoff,
        availableAt: eventCutoff,
      },
      marketContext: {
        ...base.marketContext,
        sourceCutoff: eventCutoff,
        availableAt: eventCutoff,
      },
      observedPrice: {
        ...base.observedPrice,
        sourceCutoff: eventCutoff,
        availableAt: eventCutoff,
      },
    },
    observations: observations.map((observation, index) => ({
      observationId: `observation:${identity}:${index}`,
      featureId: featureIds[index],
      semanticKey: observation.semanticKey,
      value: observation.value,
      unit: "normalized",
      observedAt: new Date(Date.parse(eventCutoff) - 10_000).toISOString(),
      quality: { status: "FRESH", ageMs: 0, reasonCodes: [] },
    })),
  });
}

function compressionInput(
  identity: string,
  values: Readonly<{
    compression: number;
    buyAcceleration: number;
    consumed: number;
  }>,
): M2DraftReplayKernelInput {
  return replayInput(identity, [
    {
      semanticKey: "volatility_compression_percentile",
      value: values.compression,
    },
    {
      semanticKey: "buy_volume_acceleration",
      value: values.buyAcceleration,
    },
    { semanticKey: "sell_volume_acceleration", value: 0 },
    { semanticKey: "move_consumed_ratio", value: values.consumed },
  ]);
}

const COMPRESSION_ID = M2_DRAFT_DETECTORS.PRE_MOVE_COMPRESSION.detectorId;
const FLOW_ID = M2_DRAFT_DETECTORS.PRE_MOVE_FLOW_DIVERGENCE.detectorId;

test("ranking is target-blind, diagnostic-only and has no Candidate authority", () => {
  assert.equal(
    M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.authority,
    "DRAFT_REPLAY_DIAGNOSTIC_ONLY",
  );
  assert.equal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.candidateEmissionAllowed,
    false);
  assert.equal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.runtimeReadAllowed, false);
  assert.equal(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY.futureOutcomeReadAllowed,
    false);
  assert.match(M2_DRAFT_DIAGNOSTIC_RANKING_POLICY_DIGEST,
    /^sha256:[0-9a-f]{64}$/u);
});

test("stronger relative rule margin ranks before a boundary match", () => {
  const boundaryInput = compressionInput("BOUNDARY", {
    compression: 0.1,
    buyAcceleration: 1.5,
    consumed: 0.2,
  });
  const strongInput = compressionInput("STRONG", {
    compression: 0.01,
    buyAcceleration: 2.9,
    consumed: 0.01,
  });
  const report = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:test",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [
      {
        input: boundaryInput,
        evaluations: [runPreMoveCompressionDraftReplay(boundaryInput)],
      },
      {
        input: strongInput,
        evaluations: [runPreMoveCompressionDraftReplay(strongInput)],
      },
    ],
  });
  assert.equal(report.evaluationCount, 2);
  assert.equal(report.rankableEvaluationCount, 2);
  assert.equal(report.excludedEvaluationCount, 0);
  assert.equal(report.rankedItems.length, 2);
  assert.match(
    report.rankedItems[0]!.item.canonicalInstrumentId,
    /STRONG/u,
  );
  assert.ok(
    report.rankedItems[0]!.item.rankingScore >
      report.rankedItems[1]!.item.rankingScore,
  );
  assert.equal(report.candidateEmissionAllowed, false);
});

test("same-direction detector agreement receives only the frozen bounded bonus", () => {
  const input = replayInput("CONSENSUS", [
    { semanticKey: "volatility_compression_percentile", value: 0.05 },
    { semanticKey: "buy_volume_acceleration", value: 2 },
    { semanticKey: "sell_volume_acceleration", value: 0 },
    { semanticKey: "aggressive_buy_flow_ratio", value: 0.8 },
    { semanticKey: "aggressive_sell_flow_ratio", value: 0.2 },
    { semanticKey: "price_response_ratio", value: 0.001 },
    { semanticKey: "move_consumed_ratio", value: 0.1 },
  ]);
  const report = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:consensus",
    requiredDetectorIds: [COMPRESSION_ID, FLOW_ID],
    sources: [{
      input,
      evaluations: [
        runPreMoveCompressionDraftReplay(input),
        runPreMoveFlowDivergenceDraftReplay(input),
      ],
    }],
  });
  assert.equal(report.eligibleItemCount, 1);
  const item = report.rankedItems[0]!.item;
  assert.equal(item.evaluationStrengths.length, 2);
  assert.equal(item.consensusBonus, 0.025);
  assert.equal(item.rankingScore,
    Number(Math.min(1, item.baseStrength + 0.025).toFixed(6)));
});

test("fixed detector denominator cannot omit a poor or unavailable evaluation", () => {
  const input = compressionInput("DENOMINATOR", {
    compression: 0.05,
    buyAcceleration: 2,
    consumed: 0.1,
  });
  assert.throws(() => rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:denominator",
    requiredDetectorIds: [COMPRESSION_ID, FLOW_ID],
    sources: [{
      input,
      evaluations: [runPreMoveCompressionDraftReplay(input)],
    }],
  }), /omitted its fixed detector denominator/u);
});

test("no-match evaluations stay in denominator but never enter Top-K", () => {
  const input = compressionInput("NO_MATCH", {
    compression: 0.8,
    buyAcceleration: 0.2,
    consumed: 0.1,
  });
  const report = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:no-match",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [{
      input,
      evaluations: [runPreMoveCompressionDraftReplay(input)],
    }],
  });
  assert.equal(report.evaluationCount, 1);
  assert.equal(report.rankableEvaluationCount, 0);
  assert.equal(report.excludedEvaluationCount, 1);
  assert.equal(report.eligibleItemCount, 0);
  assert.deepEqual(report.rankedItems, []);
});

test("ranking is deterministic across source ordering and caps exactly at Top20", () => {
  const sources = Array.from({ length: 25 }, (_, index) => {
    const input = compressionInput(`TOP_${String(index).padStart(2, "0")}`, {
      compression: 0.05,
      buyAcceleration: 2,
      consumed: 0.1,
    });
    return {
      input,
      evaluations: [runPreMoveCompressionDraftReplay(input)],
    };
  });
  const forward = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:top20",
    requiredDetectorIds: [COMPRESSION_ID],
    sources,
  });
  const reverse = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:top20",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [...sources].reverse(),
  });
  assert.deepEqual(reverse, forward);
  assert.equal(forward.eligibleItemCount, 25);
  assert.equal(forward.rankedItems.length, 20);
  assert.deepEqual(forward.rankedItems.map((ranked) => ranked.rank),
    Array.from({ length: 20 }, (_, index) => index + 1));
});

test("ranking rejects source duplication, time drift and extra future material", () => {
  const input = compressionInput("STRICT", {
    compression: 0.05,
    buyAcceleration: 2,
    consumed: 0.1,
  });
  const source = {
    input,
    evaluations: [runPreMoveCompressionDraftReplay(input)],
  };
  assert.throws(() => rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:duplicate",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [source, source],
  }), /source identity is duplicated/u);

  const drifted = compressionInput("DRIFTED", {
    compression: 0.05,
    buyAcceleration: 2,
    consumed: 0.1,
  });
  const forgedInput = {
    ...drifted,
    evaluationTarget: { futureMove: 100 },
  } as unknown as M2DraftReplayKernelInput;
  assert.throws(() => rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:future",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [{
      input: forgedInput,
      evaluations: [runPreMoveCompressionDraftReplay(drifted)],
    }],
  }));

  const nextCutoff = replayInput("LATER", [
    { semanticKey: "volatility_compression_percentile", value: 0.05 },
    { semanticKey: "buy_volume_acceleration", value: 2 },
    { semanticKey: "sell_volume_acceleration", value: 0 },
    { semanticKey: "move_consumed_ratio", value: 0.1 },
  ], "2026-01-15T00:02:00.000Z");
  assert.throws(() => rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:cutoff",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [
      source,
      {
        input: nextCutoff,
        evaluations: [runPreMoveCompressionDraftReplay(nextCutoff)],
      },
    ],
  }), /must share one event cutoff/u);
});

test("ranking reports are content-addressed and reject order or score tampering", () => {
  const input = compressionInput("TAMPER", {
    compression: 0.05,
    buyAcceleration: 2,
    consumed: 0.1,
  });
  const report = rankM2DraftReplayDiagnostics({
    rankingWindowId: "ranking-window:tamper",
    requiredDetectorIds: [COMPRESSION_ID],
    sources: [{
      input,
      evaluations: [runPreMoveCompressionDraftReplay(input)],
    }],
  });
  assert.equal(Object.isFrozen(report), true);
  assert.equal(M2DraftDiagnosticRankingReportSchema.safeParse({
    ...report,
    eligibleItemCount: 2,
  }).success, false);
  assert.equal(M2DraftDiagnosticRankingReportSchema.safeParse({
    ...report,
    sourceCount: report.sourceCount + 1,
  }).success, false);
});
