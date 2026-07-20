import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { canDetectorEmit } from "../../domain/states";
import {
  M2_DISCOVERY_GOLDEN_FIXTURES,
} from "../../testing/m2-discovery-golden-fixtures";
import {
  M2_DRAFT_DETECTORS,
  M2_DRAFT_REPLAY_INPUT_VERSION,
  M2_DRAFT_REPLAY_RULE_SET,
  M2_DRAFT_REPLAY_RULE_SET_DIGEST,
  M2DraftReplayEvaluationSchema,
  M2DraftReplayKernelInputSchema,
  type M2DraftReplayEvaluation,
  type M2DraftReplayKernelInput,
} from "./draft-replay-contract";
import {
  runBreakoutEdgeDraftReplay,
  runBreakoutRetestDraftReplayFamily,
  runPreMoveCompressionDraftReplay,
  runPreMoveDraftReplayFamily,
  runPreMoveFlowDivergenceDraftReplay,
  runPreMoveLiquidityShiftDraftReplay,
  runRoleFlipRetestDraftReplay,
} from "./draft-replay-kernels";
import { stableContentHash } from "../universe/stable-artifact";

type GoldenCase =
  (typeof M2_DISCOVERY_GOLDEN_FIXTURES.cases)[number];

const freshQuality = {
  status: "FRESH",
  ageMs: 0,
  reasonCodes: [],
} as const;

function kernelInputForCase(fixtureCase: GoldenCase): M2DraftReplayKernelInput {
  return M2DraftReplayKernelInputSchema.parse({
    schemaVersion: M2_DRAFT_REPLAY_INPUT_VERSION,
    executionMode: "REPLAY_ONLY_NO_AUTHORITY",
    detectorInput: fixtureCase.detectorInput,
    observations: fixtureCase.observations.map((observation) => ({
      observationId: observation.observationId,
      featureId: observation.sourceReferenceId,
      semanticKey: observation.semanticKey,
      value: observation.value,
      unit: observation.unit,
      observedAt: observation.observedAt,
      quality: observation.quality,
    })),
  });
}

type CustomObservation = Readonly<{
  semanticKey: string;
  value: string | number | boolean | null;
  unit?: string;
  quality?: typeof freshQuality | Readonly<{
    status: "UNAVAILABLE";
    ageMs: null;
    reasonCodes: readonly string[];
  }>;
}>;

function customKernelInput(
  observations: readonly CustomObservation[],
): M2DraftReplayKernelInput {
  const base = M2_DISCOVERY_GOLDEN_FIXTURES.cases[0]!;
  const featureIds = observations.map((observation, index) =>
    `feature:custom:${index + 1}:${observation.semanticKey}`);
  return M2DraftReplayKernelInputSchema.parse({
    schemaVersion: M2_DRAFT_REPLAY_INPUT_VERSION,
    executionMode: "REPLAY_ONLY_NO_AUTHORITY",
    detectorInput: {
      ...base.detectorInput,
      featureSet: {
        ...base.detectorInput.featureSet,
        featureIds,
      },
    },
    observations: observations.map((observation, index) => ({
      observationId: `observation:custom:${index + 1}`,
      featureId: featureIds[index],
      semanticKey: observation.semanticKey,
      value: observation.value,
      unit: observation.unit ?? "normalized",
      observedAt: "2026-01-15T00:00:50.000Z",
      quality: observation.quality ?? freshQuality,
    })),
  });
}

function matched(evaluations: readonly M2DraftReplayEvaluation[]) {
  return evaluations.filter((evaluation) =>
    evaluation.evaluationStatus === "MATCHED_DRAFT_HYPOTHESIS");
}

function rehashEvaluation(
  evaluation: M2DraftReplayEvaluation,
  patch: Partial<M2DraftReplayEvaluation>,
) {
  const raw: Record<string, unknown> = { ...evaluation, ...patch };
  delete raw.schemaVersion;
  delete raw.evaluationDigest;
  delete raw.evaluationId;
  const evaluationDigest = stableContentHash(raw);
  return {
    ...evaluation,
    ...patch,
    evaluationDigest,
    evaluationId: `draft-replay-evaluation:${evaluationDigest.slice("sha256:".length)}`,
  };
}

test("keeps all five kernels DRAFT, uncalibrated and unable to emit candidates", () => {
  assert.equal(M2_DRAFT_REPLAY_RULE_SET.authority,
    "UNCALIBRATED_DRAFT_THRESHOLDS");
  assert.equal(M2_DRAFT_REPLAY_RULE_SET.candidateEmissionAllowed, false);
  assert.equal(M2_DRAFT_REPLAY_RULE_SET.runtimeReadAllowed, false);
  assert.match(M2_DRAFT_REPLAY_RULE_SET_DIGEST, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.keys(M2_DRAFT_DETECTORS).length, 5);
  assert.equal(canDetectorEmit("DRAFT", "REPLAY"), false);

  const evaluation = runPreMoveCompressionDraftReplay(
    kernelInputForCase(M2_DISCOVERY_GOLDEN_FIXTURES.cases[0]!),
  );
  assert.equal(evaluation.detectorLifecycle, "DRAFT");
  assert.equal(evaluation.candidateEmissionAllowed, false);
  assert.equal(evaluation.evaluationAuthority, "DRAFT_REPLAY_DIAGNOSTIC_ONLY");
  assert.equal("candidateId" in evaluation, false);
  assert.equal("priority" in evaluation, false);
  assert.equal("evidenceGrade" in evaluation, false);
  assert.equal("actionState" in evaluation, false);
});

test("reproduces every M2.0 Pre-Move and Breakout/Retest golden disposition", () => {
  const relevantCases = M2_DISCOVERY_GOLDEN_FIXTURES.cases.filter(
    (fixtureCase) => ["PRE_MOVE", "BREAKOUT_RETEST"].includes(
      fixtureCase.opportunityFamily,
    ),
  );
  assert.equal(relevantCases.length, 7);
  for (const fixtureCase of relevantCases) {
    const input = kernelInputForCase(fixtureCase);
    const evaluations = fixtureCase.opportunityFamily === "PRE_MOVE"
      ? runPreMoveDraftReplayFamily(input)
      : runBreakoutRetestDraftReplayFamily(input);
    const hypotheses = matched(evaluations);
    if (fixtureCase.expectedDisposition === "DISCOVER") {
      assert.equal(hypotheses.length, 1, fixtureCase.caseId);
      assert.deepEqual(hypotheses[0]!.hypothesis, {
        opportunityPattern: fixtureCase.opportunityPattern,
        directionHypothesis: fixtureCase.directionHypothesis,
      }, fixtureCase.caseId);
    } else {
      assert.equal(hypotheses.length, 0, fixtureCase.caseId);
      assert.ok(evaluations.every(
        (evaluation) => evaluation.evaluationStatus === "NO_MATCH",
      ), fixtureCase.caseId);
    }
  }
});

test("implements independent long and short Pre-Move rules without sign reversal", () => {
  const shortCompression = customKernelInput([
    { semanticKey: "volatility_compression_percentile", value: 0.1 },
    { semanticKey: "buy_volume_acceleration", value: 0.5 },
    { semanticKey: "sell_volume_acceleration", value: 1.45 },
    { semanticKey: "move_consumed_ratio", value: 0.2 },
  ]);
  assert.equal(
    runPreMoveCompressionDraftReplay(shortCompression)
      .hypothesis?.directionHypothesis,
    "SHORT",
  );

  const longFlow = customKernelInput([
    { semanticKey: "aggressive_buy_flow_ratio", value: 0.64 },
    { semanticKey: "aggressive_sell_flow_ratio", value: 0.4 },
    { semanticKey: "price_response_ratio", value: 0.002 },
    { semanticKey: "move_consumed_ratio", value: 0.1 },
  ]);
  assert.equal(
    runPreMoveFlowDivergenceDraftReplay(longFlow)
      .hypothesis?.directionHypothesis,
    "LONG",
  );

  for (const [balance, expected] of [
    [0.6, "LONG"],
    [0.4, "SHORT"],
    [0.5, "UNKNOWN"],
  ] as const) {
    const evaluation = runPreMoveLiquidityShiftDraftReplay(customKernelInput([
      { semanticKey: "spread_contraction_ratio", value: 0.5 },
      { semanticKey: "depth_expansion_ratio", value: 1.5 },
      { semanticKey: "directional_flow_balance", value: balance },
    ]));
    assert.equal(evaluation.hypothesis?.directionHypothesis, expected);
  }
});

test("implements independent breakout edge and role-flip directions", () => {
  const shortEdge = runBreakoutEdgeDraftReplay(customKernelInput([
    { semanticKey: "close_above_resistance", value: false },
    { semanticKey: "breakout_volume_multiple", value: 0.5 },
    { semanticKey: "distance_above_level_bps", value: 0 },
    { semanticKey: "close_below_support", value: true },
    { semanticKey: "breakdown_volume_multiple", value: 1.4 },
    { semanticKey: "distance_below_level_bps", value: 40 },
  ]));
  assert.deepEqual(shortEdge.hypothesis, {
    opportunityPattern: "BREAKOUT_EDGE",
    directionHypothesis: "SHORT",
  });

  const longRetest = runRoleFlipRetestDraftReplay(customKernelInput([
    { semanticKey: "close_above_resistance", value: true },
    { semanticKey: "buy_participation_multiple", value: 1.3 },
    { semanticKey: "close_below_support", value: false },
    { semanticKey: "sell_participation_multiple", value: 0.5 },
    { semanticKey: "retest_rejection_strength", value: 0.65 },
  ]));
  assert.deepEqual(longRetest.hypothesis, {
    opportunityPattern: "ROLE_FLIP_RETEST",
    directionHypothesis: "LONG",
  });
});

test("treats two-sided Pre-Move as UNKNOWN and blocks conflicting breakouts", () => {
  const compressionConflict = runPreMoveCompressionDraftReplay(customKernelInput([
    { semanticKey: "volatility_compression_percentile", value: 0.05 },
    { semanticKey: "buy_volume_acceleration", value: 1.8 },
    { semanticKey: "sell_volume_acceleration", value: 1.8 },
    { semanticKey: "move_consumed_ratio", value: 0.1 },
  ]));
  assert.equal(compressionConflict.hypothesis?.directionHypothesis, "UNKNOWN");
  assert.ok(compressionConflict.counterHints.includes(
    "direction_confirmation_pending",
  ));

  const breakoutConflict = runBreakoutEdgeDraftReplay(customKernelInput([
    { semanticKey: "close_above_resistance", value: true },
    { semanticKey: "breakout_volume_multiple", value: 1.8 },
    { semanticKey: "distance_above_level_bps", value: 10 },
    { semanticKey: "close_below_support", value: true },
    { semanticKey: "breakdown_volume_multiple", value: 1.8 },
    { semanticKey: "distance_below_level_bps", value: 10 },
  ]));
  assert.equal(breakoutConflict.evaluationStatus, "NO_MATCH");
  assert.equal(breakoutConflict.hypothesis, null);
  assert.ok(breakoutConflict.counterHints.includes("direction_conflict"));
});

test("keeps thresholds inclusive while late and fakeout vetoes take precedence", () => {
  const boundary = customKernelInput([
    { semanticKey: "volatility_compression_percentile", value: 0.1 },
    { semanticKey: "buy_volume_acceleration", value: 1.5 },
    { semanticKey: "sell_volume_acceleration", value: 0 },
    { semanticKey: "move_consumed_ratio", value: 0.2 },
  ]);
  assert.equal(
    runPreMoveCompressionDraftReplay(boundary).evaluationStatus,
    "MATCHED_DRAFT_HYPOTHESIS",
  );
  const late = customKernelInput([
    { semanticKey: "volatility_compression_percentile", value: 0.05 },
    { semanticKey: "buy_volume_acceleration", value: 2 },
    { semanticKey: "sell_volume_acceleration", value: 0 },
    { semanticKey: "move_consumed_ratio", value: 0.4 },
  ]);
  assert.deepEqual(
    runPreMoveCompressionDraftReplay(late).reasonCodes,
    ["pre_move_already_consumed_veto"],
  );

  const fakeout = customKernelInput([
    { semanticKey: "closed_back_inside_range", value: true },
    { semanticKey: "close_above_resistance", value: true },
    { semanticKey: "breakout_volume_multiple", value: 3 },
    { semanticKey: "distance_above_level_bps", value: 5 },
  ]);
  assert.deepEqual(runBreakoutEdgeDraftReplay(fakeout).reasonCodes,
    ["breakout_structure_reentry_veto"]);
});

test("fails unavailable rather than turning missing opposite-direction data into no match", () => {
  const incomplete = customKernelInput([
    { semanticKey: "volatility_compression_percentile", value: 0.5 },
    { semanticKey: "buy_volume_acceleration", value: 0.5 },
    { semanticKey: "move_consumed_ratio", value: 0.1 },
  ]);
  const evaluation = runPreMoveCompressionDraftReplay(incomplete);
  assert.equal(evaluation.evaluationStatus, "DATA_UNAVAILABLE");
  assert.ok(evaluation.missingSemanticKeys.includes("sell_volume_acceleration"));

  const unavailable = customKernelInput([
    {
      semanticKey: "spread_contraction_ratio",
      value: null,
      quality: {
        status: "UNAVAILABLE",
        ageMs: null,
        reasonCodes: ["feature_unavailable"],
      },
    },
    { semanticKey: "depth_expansion_ratio", value: 2 },
    { semanticKey: "directional_flow_balance", value: 0.5 },
  ]);
  assert.equal(
    runPreMoveLiquidityShiftDraftReplay(unavailable).evaluationStatus,
    "DATA_UNAVAILABLE",
  );
});

test("rejects cutoff drift, undeclared lineage, ambiguity and value-quality lies", () => {
  const valid = customKernelInput([
    { semanticKey: "spread_contraction_ratio", value: 0.4 },
    { semanticKey: "depth_expansion_ratio", value: 2 },
    { semanticKey: "directional_flow_balance", value: 0.5 },
  ]);
  assert.equal(M2DraftReplayKernelInputSchema.safeParse({
    ...valid,
    observations: valid.observations.map((observation, index) => index === 0
      ? { ...observation, observedAt: "2026-01-15T00:01:00.001Z" }
      : observation),
  }).success, false);
  assert.equal(M2DraftReplayKernelInputSchema.safeParse({
    ...valid,
    observations: valid.observations.map((observation, index) => index === 0
      ? { ...observation, featureId: "undeclared-feature" }
      : observation),
  }).success, false);
  assert.equal(M2DraftReplayKernelInputSchema.safeParse({
    ...valid,
    observations: valid.observations.map((observation, index) => index === 1
      ? { ...observation, semanticKey: valid.observations[0]!.semanticKey }
      : observation),
  }).success, false);
  assert.equal(M2DraftReplayKernelInputSchema.safeParse({
    ...valid,
    observations: valid.observations.map((observation, index) => index === 0
      ? {
        ...observation,
        value: null,
        quality: freshQuality,
      }
      : observation),
  }).success, false);
});

test("is deterministic across observation ordering and returns frozen diagnostics", () => {
  const input = customKernelInput([
    { semanticKey: "close_above_resistance", value: true },
    { semanticKey: "breakout_volume_multiple", value: 1.8 },
    { semanticKey: "distance_above_level_bps", value: 10 },
  ]);
  const forward = runBreakoutEdgeDraftReplay(input);
  const reverse = runBreakoutEdgeDraftReplay({
    ...input,
    observations: [...input.observations].reverse(),
  });
  assert.deepEqual(reverse, forward);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.reasonCodes), true);
  assert.match(forward.evaluationDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(
    forward.evaluationId,
    `draft-replay-evaluation:${forward.evaluationDigest.slice("sha256:".length)}`,
  );
});

test("keeps strict diagnostics out of Candidate and downstream decision authority", () => {
  const evaluation = runBreakoutEdgeDraftReplay(customKernelInput([
    { semanticKey: "close_above_resistance", value: true },
    { semanticKey: "breakout_volume_multiple", value: 1.8 },
    { semanticKey: "distance_above_level_bps", value: 10 },
  ]));
  assert.equal(M2DraftReplayEvaluationSchema.safeParse({
    ...evaluation,
    candidateId: "forbidden-candidate",
    evidenceGrade: "A",
    actionState: "TRADE_PLAN_READY",
    entry: "100",
  }).success, false);
  assert.equal(M2DraftReplayEvaluationSchema.safeParse({
    ...evaluation,
    reasonCodes: ["tampered_draft_reason"],
  }).success, false);
  assert.equal(M2DraftReplayEvaluationSchema.safeParse({
    ...evaluation,
    evaluationId: "draft-replay-evaluation:tampered",
  }).success, false);
  assert.equal(M2DraftReplayEvaluationSchema.safeParse({
    ...rehashEvaluation(evaluation, {
      detectorId: "v2.pre-move.compression",
    }),
  }).success, false);

  for (const path of [
    "src/v2/modules/detection/draft-replay-contract.ts",
    "src/v2/modules/detection/draft-replay-kernels.ts",
  ]) {
    const source = readFileSync(join(process.cwd(), path), "utf8").toLowerCase();
    for (const forbidden of [
      "testing/m2-discovery-golden-fixtures",
      "market-fact/store",
      "outcomeevaluation",
      "strategydecision",
      "evidencegrade",
    ]) {
      assert.equal(source.includes(forbidden.toLowerCase()), false, `${path}:${forbidden}`);
    }
  }
});
