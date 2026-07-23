import type {
  Direction,
  StructuralLevel,
} from "../../domain/contracts";
import {
  CONSTITUTIONAL_INVARIANTS,
  type OpportunityFamily,
} from "../../domain/product-constitution";

export const M3_STRATEGY_CONSTRUCTION_POLICY_VERSION =
  "m3-strategy-construction-policy.v1-uncalibrated" as const;
export const M3_STRATEGY_BUFFER_POLICY_VERSION =
  "m3-structural-buffer-policy.v1-uncalibrated" as const;
export const M3_STRATEGY_COST_ASSUMPTION_SCHEMA_VERSION =
  "m3-strategy-cost-assumptions.v1" as const;
export const M3_STRATEGY_COST_ASSUMPTION_SET_ID =
  "m3-test-only-conservative-costs" as const;
export const M3_STRATEGY_COST_ASSUMPTION_VERSION =
  "m3-test-only-conservative-costs.v1" as const;

export const M3_STRATEGY_TEST_COST_ASSUMPTIONS = Object.freeze({
  schemaVersion: M3_STRATEGY_COST_ASSUMPTION_SCHEMA_VERSION,
  assumptionSetId: M3_STRATEGY_COST_ASSUMPTION_SET_ID,
  assumptionVersion: M3_STRATEGY_COST_ASSUMPTION_VERSION,
  authority: "TEST_ONLY_UNCALIBRATED" as const,
  feePerSideBps: 6,
  slippagePerSideBps: 8,
  fundingBps: 3,
  rewardRiskPrecision: 6,
  pricePrecision: 12,
  minimumGrossRewardRisk:
    CONSTITUTIONAL_INVARIANTS.minimumStructuralRewardRisk,
  minimumEstimatedNetRewardRisk:
    CONSTITUTIONAL_INVARIANTS.minimumNetRewardRisk,
});

type LevelKind = StructuralLevel["kind"];

export type M3StrategyFamilyTemplate = Readonly<{
  templateFamilyVersion: string;
  longEntryKinds: readonly LevelKind[];
  shortEntryKinds: readonly LevelKind[];
  longTargetKinds: readonly LevelKind[];
  shortTargetKinds: readonly LevelKind[];
  entryZoneBufferBps: number;
  structuralStopBufferBps: number;
  maximumAnchorDistanceBps: number;
  confirmationWindow: string;
  expiresAfterMinutes: number;
  entryTrigger: string;
  structuralInvalidation: string;
  noChaseCondition: string;
  partialTakeProfitPolicy: string;
}>;

const COMMON_LONG_TARGETS = [
  "RESISTANCE",
  "RANGE_EDGE",
  "LIQUIDITY",
  "FIB_ZONE",
] as const;
const COMMON_SHORT_TARGETS = [
  "SUPPORT",
  "RANGE_EDGE",
  "LIQUIDITY",
  "FIB_ZONE",
] as const;

export const M3_STRATEGY_FAMILY_TEMPLATES = Object.freeze({
  PRE_MOVE: {
    templateFamilyVersion: "pre-move-early-expansion.v1-uncalibrated",
    longEntryKinds: ["SUPPORT", "RANGE_EDGE", "LIQUIDITY"],
    shortEntryKinds: ["RESISTANCE", "RANGE_EDGE", "LIQUIDITY"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 8,
    structuralStopBufferBps: 25,
    maximumAnchorDistanceBps: 30,
    confirmationWindow: "PT5M",
    expiresAfterMinutes: 15,
    entryTrigger:
      "compression boundary holds while directional participation expands",
    structuralInvalidation:
      "price accepts beyond the adverse compression boundary",
    noChaseCondition:
      "do not enter after price leaves the early compression entry envelope",
    partialTakeProfitPolicy:
      "de-risk at the first structural objective and retain only confirmed expansion exposure",
  },
  BREAKOUT_RETEST: {
    templateFamilyVersion: "breakout-role-flip-retest.v1-uncalibrated",
    longEntryKinds: ["RESISTANCE", "RANGE_EDGE"],
    shortEntryKinds: ["SUPPORT", "RANGE_EDGE"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 12,
    structuralStopBufferBps: 30,
    maximumAnchorDistanceBps: 40,
    confirmationWindow: "PT15M",
    expiresAfterMinutes: 45,
    entryTrigger:
      "the broken boundary is retested, accepted and resumes in the break direction",
    structuralInvalidation:
      "price closes back through the reclaimed role-flip boundary",
    noChaseCondition:
      "do not enter after the retest has expanded beyond the role-flip envelope",
    partialTakeProfitPolicy:
      "take the first reduction at prior structure and trail only after boundary acceptance persists",
  },
  TREND_CONTINUATION: {
    templateFamilyVersion: "trend-structural-pullback.v1-uncalibrated",
    longEntryKinds: ["SUPPORT", "RANGE_EDGE"],
    shortEntryKinds: ["RESISTANCE", "RANGE_EDGE"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 15,
    structuralStopBufferBps: 35,
    maximumAnchorDistanceBps: 50,
    confirmationWindow: "PT15M",
    expiresAfterMinutes: 60,
    entryTrigger:
      "the structural pullback holds and participation resumes with the established trend",
    structuralInvalidation:
      "the pullback breaks the protected trend structure",
    noChaseCondition:
      "do not enter after continuation has already consumed the planned structural space",
    partialTakeProfitPolicy:
      "reduce at the prior trend extreme and trail the remainder behind confirmed continuation structure",
  },
  REVERSAL_RANGE: {
    templateFamilyVersion: "reversal-sweep-reclaim.v1-uncalibrated",
    longEntryKinds: ["SUPPORT", "LIQUIDITY", "RANGE_EDGE"],
    shortEntryKinds: ["RESISTANCE", "LIQUIDITY", "RANGE_EDGE"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 10,
    structuralStopBufferBps: 40,
    maximumAnchorDistanceBps: 35,
    confirmationWindow: "PT15M",
    expiresAfterMinutes: 45,
    entryTrigger:
      "the liquidity sweep is reclaimed or rejected with participation confirmation",
    structuralInvalidation:
      "price accepts beyond the sweep extreme and invalidates the reversal",
    noChaseCondition:
      "do not enter away from the reclaimed range edge or after the reversal impulse is consumed",
    partialTakeProfitPolicy:
      "reduce first near range mean or nearest structure and reserve the remainder for the opposite edge",
  },
  RELATIVE_STRENGTH: {
    templateFamilyVersion: "relative-edge-structure.v1-uncalibrated",
    longEntryKinds: ["SUPPORT", "RANGE_EDGE"],
    shortEntryKinds: ["RESISTANCE", "RANGE_EDGE"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 12,
    structuralStopBufferBps: 35,
    maximumAnchorDistanceBps: 45,
    confirmationWindow: "PT15M",
    expiresAfterMinutes: 45,
    entryTrigger:
      "benchmark-adjusted strength persists while local price structure confirms",
    structuralInvalidation:
      "local structure fails or the benchmark-adjusted edge decays",
    noChaseCondition:
      "do not trade relative strength without a nearby local structural anchor",
    partialTakeProfitPolicy:
      "reduce at local structure first; retain exposure only while relative persistence remains confirmed",
  },
  DERIVATIVES_FLOW: {
    templateFamilyVersion: "derivatives-flow-structure.v1-uncalibrated",
    longEntryKinds: ["SUPPORT", "RANGE_EDGE", "LIQUIDITY"],
    shortEntryKinds: ["RESISTANCE", "RANGE_EDGE", "LIQUIDITY"],
    longTargetKinds: COMMON_LONG_TARGETS,
    shortTargetKinds: COMMON_SHORT_TARGETS,
    entryZoneBufferBps: 10,
    structuralStopBufferBps: 35,
    maximumAnchorDistanceBps: 40,
    confirmationWindow: "PT5M",
    expiresAfterMinutes: 20,
    entryTrigger:
      "derivatives-flow dislocation persists and spot structure confirms the same direction",
    structuralInvalidation:
      "spot structure fails or the derivatives-flow dislocation reverses",
    noChaseCondition:
      "do not chase a positioning impulse after structural space has been consumed",
    partialTakeProfitPolicy:
      "reduce at the first liquidity objective and retain only while spot and derivatives confirmation agree",
  },
} as const satisfies Record<OpportunityFamily, M3StrategyFamilyTemplate>);

export function m3StrategyTemplate(
  family: OpportunityFamily,
): M3StrategyFamilyTemplate {
  return M3_STRATEGY_FAMILY_TEMPLATES[family];
}

export function m3StrategyTemplateVersion(
  family: OpportunityFamily,
  direction: Direction,
): string {
  return `${M3_STRATEGY_FAMILY_TEMPLATES[family].templateFamilyVersion}:${direction.toLowerCase()}`;
}

export function m3EntryKinds(
  template: M3StrategyFamilyTemplate,
  direction: Direction,
): readonly LevelKind[] {
  return direction === "LONG"
    ? template.longEntryKinds
    : template.shortEntryKinds;
}

export function m3TargetKinds(
  template: M3StrategyFamilyTemplate,
  direction: Direction,
): readonly LevelKind[] {
  return direction === "LONG"
    ? template.longTargetKinds
    : template.shortTargetKinds;
}
