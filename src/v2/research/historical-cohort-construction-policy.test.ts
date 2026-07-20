import assert from "node:assert/strict";
import test from "node:test";
import { stableContentHash } from "../modules/universe/stable-artifact";
import {
  M2_HISTORICAL_BACKGROUND_POLICY,
  M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY,
  M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST,
  M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY,
  M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY,
  M2_HISTORICAL_MATCHING_POLICY,
  M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY,
  M2_HISTORICAL_SPLIT_POLICY,
  M2_HISTORICAL_TRIAL_REGISTRY,
  M2HistoricalEventThresholdRegistrySchema,
  M2HistoricalTrialRegistrySchema,
  buildM2HistoricalEventThresholdRegistry,
  type M2TrainingExcursionDistribution,
} from "./historical-cohort-construction-policy";

const SOURCE_DIGEST =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function distributions(
  values: (horizon: "60M" | "4H" | "24H") => readonly number[],
): M2TrainingExcursionDistribution[] {
  return (["60M", "4H", "24H"] as const).flatMap((horizon) =>
    (["LONG", "SHORT"] as const).map((direction) => ({
      split: "TRAIN" as const,
      horizon,
      direction,
      excursionPercents: values(horizon),
      sourceDigest: SOURCE_DIGEST,
    })));
}

function buildRegistry(values: (horizon: "60M" | "4H" | "24H") => readonly number[]) {
  return buildM2HistoricalEventThresholdRegistry({
    registryName: "m2.2-construction-contract-test",
    frozenAt: "2026-01-07T00:00:00.000Z",
    distributions: distributions(values),
  });
}

test("freezes one non-authoritative construction policy with no Candidate path", () => {
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.authority,
    "PRE_REGISTERED_RESEARCH_CONSTRUCTION_ONLY",
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.candidateEmissionAllowed,
    false,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.lifecycleMutationAllowed,
    false,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY_DIGEST,
    stableContentHash(M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY),
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.matchingPolicyDigest,
    M2_HISTORICAL_MATCHING_POLICY.policyDigest,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.backgroundPolicyDigest,
    M2_HISTORICAL_BACKGROUND_POLICY.policyDigest,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.regimeAssignmentPolicyDigest,
    M2_HISTORICAL_REGIME_ASSIGNMENT_POLICY.policyDigest,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.liquidityAssignmentPolicyDigest,
    M2_HISTORICAL_LIQUIDITY_ASSIGNMENT_POLICY.policyDigest,
  );
  assert.equal(
    M2_HISTORICAL_COHORT_CONSTRUCTION_POLICY.splitPolicyDigest,
    M2_HISTORICAL_SPLIT_POLICY.policyDigest,
  );
});

test("fits all six event thresholds from TRAIN with nearest-rank p99", () => {
  const ascending = Array.from({ length: 1_000 }, (_, index) =>
    (index + 1) / 100);
  const registry = buildRegistry(() => ascending);

  assert.equal(registry.fitSplit, "TRAIN");
  assert.equal(registry.validationReadCount, 0);
  assert.equal(registry.holdoutReadCount, 0);
  assert.equal(registry.entries.length, 6);
  assert.equal(new Set(registry.entries.map((entry) =>
    `${entry.horizon}:${entry.direction}`)).size, 6);
  for (const entry of registry.entries) {
    assert.equal(entry.sampleCount, 1_000);
    assert.equal(entry.trainingQuantilePercent, 9.9);
    assert.equal(
      entry.effectiveThresholdPercent,
      Math.max(entry.absoluteFloorPercent, 9.9),
    );
  }
});

test("never lets a low TRAIN quantile weaken the absolute event floor", () => {
  const registry = buildRegistry(() => Array.from({ length: 1_000 }, () => 1));
  const expectedFloors = new Map([
    ["60M", 5],
    ["4H", 8],
    ["24H", 15],
  ]);
  for (const entry of registry.entries) {
    assert.equal(
      entry.effectiveThresholdPercent,
      expectedFloors.get(entry.horizon),
    );
  }
});

test("rejects incomplete, duplicated, non-TRAIN and undersized threshold fits", () => {
  const complete = distributions(() => Array.from({ length: 1_000 }, () => 1));
  assert.throws(
    () => buildM2HistoricalEventThresholdRegistry({
      registryName: "missing-dimension",
      frozenAt: "2026-01-07T00:00:00.000Z",
      distributions: complete.slice(0, 5),
    }),
    /six|length|cover|too small/iu,
  );
  assert.throws(
    () => buildM2HistoricalEventThresholdRegistry({
      registryName: "duplicate-dimension",
      frozenAt: "2026-01-07T00:00:00.000Z",
      distributions: [...complete.slice(0, 5), complete[0]!],
    }),
    /duplicated/u,
  );
  assert.throws(
    () => buildM2HistoricalEventThresholdRegistry({
      registryName: "validation-leak",
      frozenAt: "2026-01-07T00:00:00.000Z",
      distributions: [{ ...complete[0]!, split: "VALIDATION" } as never],
    }),
    /only from TRAIN/u,
  );
  assert.throws(
    () => buildM2HistoricalEventThresholdRegistry({
      registryName: "undersized",
      frozenAt: "2026-01-07T00:00:00.000Z",
      distributions: complete.map((distribution) => ({
        ...distribution,
        excursionPercents: distribution.excursionPercents.slice(0, 999),
      })),
    }),
    /insufficient/u,
  );
});

test("binds threshold and trial registries to immutable content", () => {
  const registry = buildRegistry(() => Array.from({ length: 1_000 }, () => 1));
  const thresholdTamper = structuredClone(registry);
  thresholdTamper.entries[0]!.effectiveThresholdPercent += 1;
  assert.equal(
    M2HistoricalEventThresholdRegistrySchema.safeParse(thresholdTamper).success,
    false,
  );

  assert.equal(M2_HISTORICAL_TRIAL_REGISTRY.trials.length, 5);
  assert.equal(M2_HISTORICAL_TRIAL_REGISTRY.trials.filter(
    (trialValue) => trialValue.role === "BASELINE").length, 1);
  const trialTamper = structuredClone(M2_HISTORICAL_TRIAL_REGISTRY);
  trialTamper.trials[0]!.parameterSetDigest = SOURCE_DIGEST;
  assert.equal(
    M2HistoricalTrialRegistrySchema.safeParse(trialTamper).success,
    false,
  );
  assert.equal(
    M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.validationReadAllowed,
    false,
  );
  assert.equal(
    M2_HISTORICAL_EVENT_THRESHOLD_FIT_POLICY.holdoutReadAllowed,
    false,
  );
});
