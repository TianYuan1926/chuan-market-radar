export const V2_DOMAIN_SCHEMA_VERSION = "market-radar-v2-domain.v2" as const;

export const TARGET_VENUES = [
  "BINANCE_FUTURES",
  "OKX_SWAP",
  "BYBIT_LINEAR_PERPETUAL",
] as const;

export type TargetVenue = (typeof TARGET_VENUES)[number];

export const SUPPORTED_CONTRACT_CLASS =
  "LINEAR_STABLECOIN_SETTLED_PERPETUAL" as const;

export const OPPORTUNITY_FAMILIES = [
  "PRE_MOVE",
  "BREAKOUT_RETEST",
  "TREND_CONTINUATION",
  "REVERSAL_RANGE",
  "RELATIVE_STRENGTH",
  "DERIVATIVES_FLOW",
] as const;

export type OpportunityFamily = (typeof OPPORTUNITY_FAMILIES)[number];

export const OPPORTUNITY_PATTERNS = [
  "PRE_MOVE_COMPRESSION",
  "PRE_MOVE_FLOW_DIVERGENCE",
  "PRE_MOVE_LIQUIDITY_SHIFT",
  "BREAKOUT_EDGE",
  "ROLE_FLIP_RETEST",
  "TREND_COMPRESSION",
  "STRUCTURAL_PULLBACK_RESUMPTION",
  "KEY_LEVEL_REVERSAL",
  "RANGE_EDGE",
  "RELATIVE_STRENGTH",
  "RELATIVE_WEAKNESS",
  "PRICE_OI_DIVERGENCE",
  "CROWDING_RELEASE",
  "FUNDING_BASIS_DISLOCATION",
] as const;

export type OpportunityPattern = (typeof OPPORTUNITY_PATTERNS)[number];

export const OPPORTUNITY_DIRECTIONS_BY_FAMILY = Object.freeze({
  PRE_MOVE: ["LONG", "SHORT", "UNKNOWN"],
  BREAKOUT_RETEST: ["LONG", "SHORT"],
  TREND_CONTINUATION: ["LONG", "SHORT"],
  REVERSAL_RANGE: ["LONG", "SHORT"],
  RELATIVE_STRENGTH: ["LONG", "SHORT"],
  DERIVATIVES_FLOW: ["LONG", "SHORT", "UNKNOWN"],
} as const satisfies Record<
  OpportunityFamily,
  readonly ("LONG" | "SHORT" | "UNKNOWN")[]
>);

export const OPPORTUNITY_PATTERNS_BY_FAMILY = Object.freeze({
  PRE_MOVE: [
    "PRE_MOVE_COMPRESSION",
    "PRE_MOVE_FLOW_DIVERGENCE",
    "PRE_MOVE_LIQUIDITY_SHIFT",
  ],
  BREAKOUT_RETEST: ["BREAKOUT_EDGE", "ROLE_FLIP_RETEST"],
  TREND_CONTINUATION: [
    "TREND_COMPRESSION",
    "STRUCTURAL_PULLBACK_RESUMPTION",
  ],
  REVERSAL_RANGE: ["KEY_LEVEL_REVERSAL", "RANGE_EDGE"],
  RELATIVE_STRENGTH: ["RELATIVE_STRENGTH", "RELATIVE_WEAKNESS"],
  DERIVATIVES_FLOW: [
    "PRICE_OI_DIVERGENCE",
    "CROWDING_RELEASE",
    "FUNDING_BASIS_DISLOCATION",
  ],
} as const satisfies Record<OpportunityFamily, readonly OpportunityPattern[]>);

export function isOpportunityPatternForFamily(
  family: OpportunityFamily,
  pattern: OpportunityPattern,
): boolean {
  return (OPPORTUNITY_PATTERNS_BY_FAMILY[family] as readonly OpportunityPattern[])
    .includes(pattern);
}

export const PRODUCT_MISSION =
  "Continuously cover every eligible target-CEX contract, detect pre-move opportunities as early as honestly provable, detect other structured long and short opportunities, produce strict human-execution plans, and improve through point-in-time outcomes without future leakage." as const;

export const CONSTITUTIONAL_INVARIANTS = Object.freeze({
  automaticRulePromotionAllowed: false,
  automaticTradingAllowed: false,
  candidateIsSignal: false,
  candidatePriorityMayRepresentEvidenceGrade: false,
  evidenceGradeMayRepresentSetupGrade: false,
  evidenceOrSetupGradeMayDirectlyImplyReady: false,
  frontendMayCreateTradingFacts: false,
  futureOutcomeMayAffectOriginalDecision: false,
  minimumNetRewardRisk: 3,
  minimumStructuralRewardRisk: 3,
  onlyFinalDecisionMayProduceReady: true,
  outcomeEvaluatorMayApprovePromotion: false,
  partialMayBecomeReady: false,
  personalOrPortfolioRiskMayUpgradeActionState: false,
  productionWriteAuthorityPerFact: 1,
  staleMayBecomeLive: false,
  strategyDraftMayDirectlyImplyReady: false,
  unknownMayBecomeZero: false,
});

export const PRODUCT_CONSTITUTION = Object.freeze({
  contractClass: SUPPORTED_CONTRACT_CLASS,
  invariants: CONSTITUTIONAL_INVARIANTS,
  mission: PRODUCT_MISSION,
  opportunityDirections: OPPORTUNITY_DIRECTIONS_BY_FAMILY,
  opportunityFamilies: OPPORTUNITY_FAMILIES,
  opportunityPatterns: OPPORTUNITY_PATTERNS_BY_FAMILY,
  schemaVersion: V2_DOMAIN_SCHEMA_VERSION,
  targetVenues: TARGET_VENUES,
});
