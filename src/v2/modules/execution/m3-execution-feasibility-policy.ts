import { CONSTITUTIONAL_INVARIANTS } from "../../domain/product-constitution";

export const M3_EXECUTION_FEASIBILITY_POLICY_VERSION =
  "m3-execution-feasibility-policy.v1" as const;

export const M3_EXECUTION_COST_MODEL_VERSION =
  "m3-execution-cost-model.test-only.v1" as const;

export const M3_EXECUTION_THRESHOLD_VERSION =
  "m3-execution-thresholds.test-only.v1" as const;

export const M3_EXECUTION_FEASIBILITY_MODE =
  "TEST_ONLY_UNCALIBRATED_NO_READY_AUTHORITY" as const;

export const M3_EXECUTION_TEST_THRESHOLDS = Object.freeze({
  maximumExecutionFactAgeMs: 5_000,
  maximumSpreadBps: 20,
  minimumDepthAtMaximumSlippageNotional: "10000",
  maximumSlippagePerSideBps: 15,
  maximumFeePerSideBps: 10,
  maximumConservativeFundingCostBps: 25,
  maximumAdversePriceDriftBps: 30,
  executableDepthParticipationBps: 1_000,
  minimumEstimatedNetRewardRisk:
    CONSTITUTIONAL_INVARIANTS.minimumNetRewardRisk,
  rewardRiskPrecision: 6,
} as const);

export const M3_EXECUTION_REQUIRED_CHECK_IDS = Object.freeze([
  "POINT_IN_TIME_FACTS",
  "VENUE_TRADING_STATUS",
  "SPREAD",
  "DEPTH",
  "SLIPPAGE",
  "FEE_SCHEDULE",
  "FUNDING_COST",
  "FILLABILITY",
  "PRICE_DRIFT",
  "GAP_RISK",
  "STOP_SWEEP_RISK",
  "MARKET_LIQUIDITY",
  "NET_REWARD_RISK",
] as const);
