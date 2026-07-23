import assert from "node:assert/strict";
import test from "node:test";
import { stableContentHash } from "../universe/stable-artifact";
import {
  compareM3MultiAssetPrices,
} from "./m3-multi-asset-exact-price-math";
import {
  constructM3MultiAssetStrategy,
  sealM3MultiAssetCostSnapshot,
  sealM3MultiAssetReferencePrice,
  sealM3MultiAssetStrategyPolicy,
  verifyM3MultiAssetCostSnapshotHash,
  verifyM3MultiAssetReferencePriceHash,
  verifyM3MultiAssetStrategyDraftHash,
  verifyM3MultiAssetStrategyPolicyHash,
} from "./m3-multi-asset-strategy";
import {
  M3_MULTI_ASSET_LANE_FIXTURES,
  buildM3MultiAssetFullLaneFixture,
} from "./testing/m3-multi-asset-fixtures";

function withoutPolicyHash(
  policy: ReturnType<
    typeof buildM3MultiAssetFullLaneFixture
  >["policy"],
) {
  const { policyHash, ...body } = policy;
  void policyHash;
  return body;
}

function withoutCostHash(
  snapshot: ReturnType<
    typeof buildM3MultiAssetFullLaneFixture
  >["costSnapshot"],
) {
  const { costSnapshotHash, ...body } = snapshot;
  void costSnapshotHash;
  return body;
}

function withoutReferenceHash(
  reference: ReturnType<
    typeof buildM3MultiAssetFullLaneFixture
  >["referencePrice"],
) {
  const { referencePriceHash, ...body } = reference;
  void referencePriceHash;
  return body;
}

test("all four lanes construct deterministic research-only drafts", () => {
  for (const config of M3_MULTI_ASSET_LANE_FIXTURES) {
    const fixture = buildM3MultiAssetFullLaneFixture(config);
    const repeated = constructM3MultiAssetStrategy(fixture.strategyInput);
    assert.equal(
      fixture.strategyResult.status,
      "CONSTRUCTED_RESEARCH_ONLY",
    );
    assert.deepEqual(repeated, fixture.strategyResult);
    assert.ok(fixture.strategyResult.draft);
    const draft = fixture.strategyResult.draft;
    assert.equal(verifyM3MultiAssetStrategyDraftHash(draft), true);
    assert.equal(verifyM3MultiAssetStrategyPolicyHash(fixture.policy), true);
    assert.equal(
      verifyM3MultiAssetCostSnapshotHash(fixture.costSnapshot),
      true,
    );
    assert.equal(
      verifyM3MultiAssetReferencePriceHash(fixture.referencePrice),
      true,
    );
    assert.equal(draft.binding.decisionLane, config.decisionLane);
    assert.equal(draft.binding.venue, config.venue);
    assert.equal(draft.binding.assetDomain, config.assetDomain);
    assert.equal(draft.signalLevel, null);
    assert.equal(draft.strategyAuthority, false);
    assert.equal(draft.readyAuthority, false);
    assert.equal(draft.executionAuthority, false);
    assert.equal("evidenceGrade" in draft, false);
    assert.equal("setupGrade" in draft, false);
    assert.equal("estimatedProbability" in draft, false);
    assert.equal(Object.isFrozen(draft), true);
    assert.equal(Object.isFrozen(draft.targets), true);

    const stopComparedWithBase = compareM3MultiAssetPrices(
      draft.structuralStop,
      draft.structuralStopBase,
    );
    assert.equal(
      config.direction === "LONG"
        ? stopComparedWithBase <= 0
        : stopComparedWithBase >= 0,
      true,
      "stop buffer must move farther into invalidation, never closer",
    );
  }
});

test("Bitget cannot borrow Binance binding, cost, price or policy", () => {
  const bitget = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const binance = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[1],
  );
  const result = constructM3MultiAssetStrategy({
    ...bitget.strategyInput,
    policy: binance.policy,
    costSnapshot: binance.costSnapshot,
    referencePrice: binance.referencePrice,
  });
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.reasonCodes.includes("strategy_policy_segment_mismatch"));
  assert.ok(result.reasonCodes.includes(
    "strategy_costsnapshot_binding_mismatch",
  ));
  assert.ok(result.reasonCodes.includes(
    "strategy_referenceprice_binding_mismatch",
  ));
});

test("listing, single-name and index policies cannot cross decision lanes", () => {
  const listing = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[1],
  );
  const singleName = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  );
  const indexEtf = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[3],
  );
  for (const [target, foreignPolicy] of [
    [listing, singleName.policy],
    [singleName, indexEtf.policy],
    [indexEtf, listing.policy],
  ] as const) {
    const result = constructM3MultiAssetStrategy({
      ...target.strategyInput,
      policy: foreignPolicy,
    });
    assert.equal(result.status, "ABSTAINED_NO_DRAFT");
    assert.equal(result.draft, null);
    assert.ok(result.reasonCodes.includes("strategy_policy_segment_mismatch"));
  }
});

test("missing or unavailable equity costs force abstention without zero fill", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[2],
  );
  const costBody = withoutCostHash(fixture.costSnapshot);
  const missingFx = sealM3MultiAssetCostSnapshot({
    ...costBody,
    components: costBody.components.filter((component) =>
      component.component !== "FX"
    ),
  });
  const missingResult = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    costSnapshot: missingFx,
  });
  assert.equal(missingResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(missingResult.reasonCodes.includes(
    "strategy_cost_component_missing:fx",
  ));

  const unavailableBasis = sealM3MultiAssetCostSnapshot({
    ...costBody,
    components: costBody.components.map((component) =>
      component.component === "CLOSED_SESSION_BASIS"
        ? {
          ...component,
          status: "UNAVAILABLE" as const,
          conservativeBps: null,
          evidenceReferences: [],
          reasonCodes: ["fixture_closed_session_basis_unavailable"],
        }
        : component
    ),
  });
  const unavailableResult = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    costSnapshot: unavailableBasis,
  });
  assert.equal(unavailableResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(unavailableResult.reasonCodes.includes(
    "strategy_cost_component_unavailable:closed_session_basis",
  ));
});

test("stale or unbound reference price cannot create a draft", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const referenceBody = withoutReferenceHash(fixture.referencePrice);
  const stale = sealM3MultiAssetReferencePrice({
    ...referenceBody,
    status: "STALE",
    reasonCodes: ["fixture_reference_stale"],
  });
  const staleResult = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    referencePrice: stale,
  });
  assert.equal(staleResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(staleResult.reasonCodes.includes(
    "strategy_reference_price_not_fresh",
  ));

  const entryEvidenceId = fixture.analysis.structuralLevels.find((level) =>
    level.levelId.endsWith(":entry")
  )?.evidenceIds[0];
  assert.ok(entryEvidenceId);
  const unrelatedEvidence = fixture.input.observations.find((observation) =>
    observation.evidence.evidenceId !== entryEvidenceId &&
    observation.category === "POINT_IN_TIME_MARKET"
  );
  assert.ok(unrelatedEvidence);
  const unbound = sealM3MultiAssetReferencePrice({
    ...referenceBody,
    factIds: [...unrelatedEvidence.evidence.factIds],
    evidenceReferences: [unrelatedEvidence.evidence],
  });
  const unboundResult = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    referencePrice: unbound,
  });
  assert.equal(unboundResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(unboundResult.reasonCodes.includes(
    "strategy_reference_price_not_bound_to_entry_evidence",
  ));
});

test("tampered content-addressed inputs are explicit integrity abstentions", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[3],
  );
  const tamperedReference = {
    ...fixture.referencePrice,
    referencePriceHash: stableContentHash("tampered-reference"),
  };
  const result = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    referencePrice: tamperedReference,
  });
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.issues.some((issue) =>
    issue.code === "strategy_reference_price_hash_mismatch"
  ));
  assert.ok(result.reasonCodes.includes(
    "multi_asset_strategy_integrity_failed",
  ));
});

test("future policy evidence is rejected at composition time", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[1],
  );
  const futurePolicy = sealM3MultiAssetStrategyPolicy({
    ...withoutPolicyHash(fixture.policy),
    sourceCutoff: "2026-07-01T00:01:10.000Z",
    evaluatedAt: "2026-07-01T00:01:20.000Z",
  });
  const result = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    policy: futurePolicy,
  });
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.ok(result.issues.some((issue) =>
    issue.code === "strategy_input_not_available_at_cutoff"
  ));
});

test("Fib targets require a content-addressed validated extension policy", () => {
  const prohibited = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
    { targetKind: "FIB_ZONE" },
  );
  assert.equal(prohibited.strategyResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(prohibited.strategyResult.reasonCodes.includes(
    "strategy_fib_target_not_validated",
  ));

  const validated = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
    {
      targetKind: "FIB_ZONE",
      validatedFibPolicy: true,
    },
  );
  assert.equal(validated.strategyResult.status, "CONSTRUCTED_RESEARCH_ONLY");
  assert.ok(validated.strategyResult.draft);
  assert.equal(
    validated.strategyResult.draft.targets[0]?.sourceKind,
    "FIB_ZONE",
  );
  assert.notEqual(
    validated.strategyResult.draft.validatedFibExtensionDigest,
    null,
  );
});

test("reward-risk floor abstains and never moves the structural stop inward", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const strictPolicy = sealM3MultiAssetStrategyPolicy({
    ...withoutPolicyHash(fixture.policy),
    minimumGrossRewardRisk: 100,
    minimumEstimatedNetRewardRisk: 100,
  });
  const result = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    policy: strictPolicy,
  });
  assert.equal(result.status, "ABSTAINED_NO_DRAFT");
  assert.equal(result.draft, null);
  assert.ok(result.reasonCodes.includes(
    "strategy_reward_risk_below_calibrated_floor",
  ));
});

test("public strategy construction never throws on malformed or extreme input", () => {
  for (const value of [
    null,
    undefined,
    {},
    [],
    { schemaVersion: "unknown" },
  ]) {
    assert.doesNotThrow(() => constructM3MultiAssetStrategy(value));
    assert.equal(
      constructM3MultiAssetStrategy(value).status,
      "BLOCKED_INVALID_INPUT",
    );
  }

  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  const extremeReference = sealM3MultiAssetReferencePrice({
    ...withoutReferenceHash(fixture.referencePrice),
    price: "9".repeat(128),
  });
  assert.doesNotThrow(() =>
    constructM3MultiAssetStrategy({
      ...fixture.strategyInput,
      referencePrice: extremeReference,
    })
  );
  const extremeResult = constructM3MultiAssetStrategy({
    ...fixture.strategyInput,
    referencePrice: extremeReference,
  });
  assert.equal(extremeResult.status, "ABSTAINED_NO_DRAFT");
  assert.ok(extremeResult.reasonCodes.includes(
    "strategy_entry_too_far_from_reference",
  ));
});

test("draft hash verification detects post-construction tampering", () => {
  const fixture = buildM3MultiAssetFullLaneFixture(
    M3_MULTI_ASSET_LANE_FIXTURES[0],
  );
  assert.ok(fixture.strategyResult.draft);
  assert.equal(
    verifyM3MultiAssetStrategyDraftHash(fixture.strategyResult.draft),
    true,
  );
  const tampered = {
    ...fixture.strategyResult.draft,
    grossRewardRisk: fixture.strategyResult.draft.grossRewardRisk + 1,
  };
  assert.equal(verifyM3MultiAssetStrategyDraftHash(tampered), false);
});
