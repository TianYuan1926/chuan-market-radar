export const V2_DOMAIN_SCHEMA_VERSION = "market-radar-v2-domain.v1" as const;

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
  opportunityFamilies: OPPORTUNITY_FAMILIES,
  schemaVersion: V2_DOMAIN_SCHEMA_VERSION,
  targetVenues: TARGET_VENUES,
});
