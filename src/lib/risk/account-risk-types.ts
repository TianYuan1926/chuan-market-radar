export type AccountRiskSide = "long" | "short";

export type AccountRiskMarginMode = "cross";

export type AccountRiskLeverageStatus = "available" | "unknown" | "not_available";

export type AccountRiskLeverageSource = "btc_eth_fixed" | "exchange_max" | "not_available";

export type AccountRiskSimulationStatus = "ready" | "waiting_leverage" | "waiting_price" | "invalid_plan";

export type AccountRiskLevel = "ok" | "watch" | "high" | "critical" | "not_available";

export type AccountRiskRules = {
  accountEquityUsdt: number;
  btcEthLeverage: number;
  marginMode: AccountRiskMarginMode;
  maxInitialMarginFractionOfEquity: number;
  maxStopLossFractionOfEquity: number;
  minStructuralRewardRisk: number;
  positionMarginFractionOfEquity: number;
};

export type AccountRiskInput = {
  entryPrice: number | null | undefined;
  exchangeMaxLeverage?: number | null;
  rules?: Partial<AccountRiskRules>;
  side: AccountRiskSide;
  stopPrice: number | null | undefined;
  stopStructureReason?: string | null;
  stopHasStructuralMeaning: boolean;
  symbol: string;
  targetPrice: number | null | undefined;
};

export type AccountRiskLeverageResult = {
  leverage: number | null;
  source: AccountRiskLeverageSource;
  status: AccountRiskLeverageStatus;
};

export type AccountRiskDistanceResult = {
  rewardDistancePct: number | null;
  riskDistancePct: number | null;
  structuralRewardRisk: number | null;
};

export type AccountRiskPositionResult = {
  estimatedInitialMarginUsdt: number | null;
  estimatedNotionalUsdt: number | null;
  estimatedQuantity: number | null;
  positionMarginFractionOfEquity: number;
  positionMarginPctOfEquity: number;
};

export type AccountRiskLossResult = {
  maxStopLossFractionOfEquity: number;
  maxStopLossPctOfEquity: number;
  stopLossExceedsUserRule: boolean | null;
  stopLossPctOfEquity: number | null;
  stopLossUsdt: number | null;
  targetProfitPctOfEquity: number | null;
  targetProfitUsdt: number | null;
};

export type AccountRiskLiquidationResult = {
  distanceRiskLevel: AccountRiskLevel;
  estimatedInitialMarginWipeoutDistancePct: number | null;
  mode: "cross_margin_estimate_only";
  stopConsumesInitialMarginPct: number | null;
  summary: string;
};

export type AccountRiskChecks = {
  leverageRiskLevel: AccountRiskLevel;
  maxLossRulePass: boolean | null;
  rrPass: boolean | null;
  stopStructurePass: boolean;
};

export type AccountRiskSimulation = {
  checks: AccountRiskChecks;
  distance: AccountRiskDistanceResult;
  leverage: AccountRiskLeverageResult;
  liquidation: AccountRiskLiquidationResult;
  loss: AccountRiskLossResult;
  position: AccountRiskPositionResult;
  rules: AccountRiskRules;
  status: AccountRiskSimulationStatus;
  summary: string;
  symbol: string;
};
