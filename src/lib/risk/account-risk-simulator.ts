import type {
  AccountRiskChecks,
  AccountRiskDistanceResult,
  AccountRiskInput,
  AccountRiskLeverageResult,
  AccountRiskLevel,
  AccountRiskLiquidationResult,
  AccountRiskLossResult,
  AccountRiskPositionResult,
  AccountRiskRules,
  AccountRiskSimulation,
  AccountRiskSimulationStatus,
} from "./account-risk-types";

export const defaultAccountRiskRules: AccountRiskRules = {
  accountEquityUsdt: 1500,
  btcEthLeverage: 150,
  marginMode: "cross",
  maxInitialMarginFractionOfEquity: 0.03,
  maxStopLossFractionOfEquity: 0.03,
  minStructuralRewardRisk: 3,
  positionMarginFractionOfEquity: 0.03,
};

function safePositive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function baseAsset(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[-_/]/g, "").replace(/(USDT|USDC|USD)$/u, "");
}

function mergeRules(rules: Partial<AccountRiskRules> | undefined): AccountRiskRules {
  const merged = {
    ...defaultAccountRiskRules,
    ...rules,
    marginMode: "cross" as const,
  };

  return {
    accountEquityUsdt: safePositive(merged.accountEquityUsdt) ?? defaultAccountRiskRules.accountEquityUsdt,
    btcEthLeverage: safePositive(merged.btcEthLeverage) ?? defaultAccountRiskRules.btcEthLeverage,
    marginMode: "cross",
    maxInitialMarginFractionOfEquity:
      safePositive(merged.maxInitialMarginFractionOfEquity) ??
      defaultAccountRiskRules.maxInitialMarginFractionOfEquity,
    maxStopLossFractionOfEquity:
      safePositive(merged.maxStopLossFractionOfEquity) ?? defaultAccountRiskRules.maxStopLossFractionOfEquity,
    minStructuralRewardRisk:
      safePositive(merged.minStructuralRewardRisk) ?? defaultAccountRiskRules.minStructuralRewardRisk,
    positionMarginFractionOfEquity:
      safePositive(merged.positionMarginFractionOfEquity) ?? defaultAccountRiskRules.positionMarginFractionOfEquity,
  };
}

function resolveLeverage(symbol: string, exchangeMaxLeverage: number | null | undefined, rules: AccountRiskRules) {
  const asset = baseAsset(symbol);

  if (asset === "BTC" || asset === "ETH") {
    return {
      leverage: rules.btcEthLeverage,
      source: "btc_eth_fixed" as const,
      status: "available" as const,
    };
  }

  const altcoinMaxLeverage = safePositive(exchangeMaxLeverage);

  if (!altcoinMaxLeverage) {
    return {
      leverage: null,
      source: "not_available" as const,
      status: exchangeMaxLeverage === null ? ("not_available" as const) : ("unknown" as const),
    };
  }

  return {
    leverage: altcoinMaxLeverage,
    source: "exchange_max" as const,
    status: "available" as const,
  };
}

function buildDistances(input: AccountRiskInput): AccountRiskDistanceResult {
  const entry = safePositive(input.entryPrice);
  const stop = safePositive(input.stopPrice);
  const target = safePositive(input.targetPrice);

  if (!entry || !stop || !target) {
    return {
      rewardDistancePct: null,
      riskDistancePct: null,
      structuralRewardRisk: null,
    };
  }

  const riskDistancePct = input.side === "long" ? (entry - stop) / entry : (stop - entry) / entry;
  const rewardDistancePct = input.side === "long" ? (target - entry) / entry : (entry - target) / entry;

  if (riskDistancePct <= 0 || rewardDistancePct <= 0) {
    return {
      rewardDistancePct: round(rewardDistancePct * 100),
      riskDistancePct: round(riskDistancePct * 100),
      structuralRewardRisk: null,
    };
  }

  return {
    rewardDistancePct: round(rewardDistancePct * 100),
    riskDistancePct: round(riskDistancePct * 100),
    structuralRewardRisk: round(rewardDistancePct / riskDistancePct, 2),
  };
}

function buildPosition(
  entryPrice: number | null | undefined,
  leverage: number | null,
  rules: AccountRiskRules,
): AccountRiskPositionResult {
  const entry = safePositive(entryPrice);
  const plannedMarginUsdt = rules.accountEquityUsdt * rules.positionMarginFractionOfEquity;

  if (!entry || !leverage) {
    return {
      estimatedInitialMarginUsdt: null,
      estimatedNotionalUsdt: null,
      estimatedQuantity: null,
      positionMarginFractionOfEquity: rules.positionMarginFractionOfEquity,
      positionMarginPctOfEquity: round(rules.positionMarginFractionOfEquity * 100, 3),
    };
  }

  const estimatedNotionalUsdt = plannedMarginUsdt * leverage;

  return {
    estimatedInitialMarginUsdt: round(plannedMarginUsdt, 2),
    estimatedNotionalUsdt: round(estimatedNotionalUsdt, 2),
    estimatedQuantity: round(estimatedNotionalUsdt / entry, 8),
    positionMarginFractionOfEquity: rules.positionMarginFractionOfEquity,
    positionMarginPctOfEquity: round(rules.positionMarginFractionOfEquity * 100, 3),
  };
}

function buildLoss(
  distance: AccountRiskDistanceResult,
  position: AccountRiskPositionResult,
  rules: AccountRiskRules,
): AccountRiskLossResult {
  const riskDistance = distance.riskDistancePct === null ? null : distance.riskDistancePct / 100;
  const rewardDistance = distance.rewardDistancePct === null ? null : distance.rewardDistancePct / 100;

  if (riskDistance === null || rewardDistance === null || !position.estimatedNotionalUsdt) {
    return {
      maxStopLossFractionOfEquity: rules.maxStopLossFractionOfEquity,
      maxStopLossPctOfEquity: round(rules.maxStopLossFractionOfEquity * 100, 3),
      stopLossExceedsUserRule: null,
      stopLossPctOfEquity: null,
      stopLossUsdt: null,
      targetProfitPctOfEquity: null,
      targetProfitUsdt: null,
    };
  }

  const stopLossUsdt = position.estimatedNotionalUsdt * riskDistance;
  const targetProfitUsdt = position.estimatedNotionalUsdt * rewardDistance;
  const stopLossFractionOfEquity = stopLossUsdt / rules.accountEquityUsdt;

  return {
    maxStopLossFractionOfEquity: rules.maxStopLossFractionOfEquity,
    maxStopLossPctOfEquity: round(rules.maxStopLossFractionOfEquity * 100, 3),
    stopLossExceedsUserRule: stopLossFractionOfEquity > rules.maxStopLossFractionOfEquity,
    stopLossPctOfEquity: round(stopLossFractionOfEquity * 100, 4),
    stopLossUsdt: round(stopLossUsdt, 2),
    targetProfitPctOfEquity: round((targetProfitUsdt / rules.accountEquityUsdt) * 100, 4),
    targetProfitUsdt: round(targetProfitUsdt, 2),
  };
}

function leverageRiskLevel(leverage: number | null): AccountRiskLevel {
  if (!leverage) return "not_available";
  if (leverage >= 125) return "critical";
  if (leverage >= 75) return "high";
  if (leverage >= 25) return "watch";
  return "ok";
}

function liquidationRiskLevel(stopConsumesInitialMarginPct: number | null): AccountRiskLevel {
  if (stopConsumesInitialMarginPct === null) return "not_available";
  if (stopConsumesInitialMarginPct >= 100) return "critical";
  if (stopConsumesInitialMarginPct >= 80) return "high";
  if (stopConsumesInitialMarginPct >= 50) return "watch";
  return "ok";
}

function buildLiquidation(
  distance: AccountRiskDistanceResult,
  leverageResult: AccountRiskLeverageResult,
): AccountRiskLiquidationResult {
  if (!leverageResult.leverage || distance.riskDistancePct === null) {
    return {
      distanceRiskLevel: "not_available",
      estimatedInitialMarginWipeoutDistancePct: null,
      mode: "cross_margin_estimate_only",
      stopConsumesInitialMarginPct: null,
      summary: "全仓爆仓距离需要账户余额、维持保证金和交易所规则；杠杆未知或价格不完整时只显示 unavailable。",
    };
  }

  const estimatedInitialMarginWipeoutDistancePct = (1 / leverageResult.leverage) * 100;
  const stopConsumesInitialMarginPct = (distance.riskDistancePct / estimatedInitialMarginWipeoutDistancePct) * 100;
  const distanceRiskLevel = liquidationRiskLevel(stopConsumesInitialMarginPct);

  return {
    distanceRiskLevel,
    estimatedInitialMarginWipeoutDistancePct: round(estimatedInitialMarginWipeoutDistancePct, 4),
    mode: "cross_margin_estimate_only",
    stopConsumesInitialMarginPct: round(stopConsumesInitialMarginPct, 2),
    summary:
      "全仓强平不是 isolated 精确公式；这里用价格反向波动吃掉初始保证金的距离，提示止损是否过度接近高杠杆危险区。",
  };
}

function buildChecks(
  distance: AccountRiskDistanceResult,
  leverage: AccountRiskLeverageResult,
  loss: AccountRiskLossResult,
  input: AccountRiskInput,
  rules: AccountRiskRules,
): AccountRiskChecks {
  return {
    leverageRiskLevel: leverageRiskLevel(leverage.leverage),
    maxLossRulePass: loss.stopLossExceedsUserRule === null ? null : !loss.stopLossExceedsUserRule,
    rrPass: distance.structuralRewardRisk === null ? null : distance.structuralRewardRisk >= rules.minStructuralRewardRisk,
    stopStructurePass: input.stopHasStructuralMeaning,
  };
}

function statusForSimulation(
  distance: AccountRiskDistanceResult,
  leverage: AccountRiskLeverageResult,
  position: AccountRiskPositionResult,
): AccountRiskSimulationStatus {
  if (distance.riskDistancePct !== null && distance.riskDistancePct <= 0) return "invalid_plan";
  if (distance.rewardDistancePct !== null && distance.rewardDistancePct <= 0) return "invalid_plan";
  if (distance.riskDistancePct === null || distance.rewardDistancePct === null) return "waiting_price";
  if (leverage.status !== "available" || !position.estimatedNotionalUsdt) return "waiting_leverage";
  return "ready";
}

function buildSummary(status: AccountRiskSimulationStatus, checks: AccountRiskChecks) {
  if (status === "waiting_leverage") {
    return "账户风险模拟：山寨币最高杠杆 unknown/not_available，已拒绝伪造名义仓位、保证金和止损亏损。";
  }

  if (status === "waiting_price") {
    return "账户风险模拟：等待完整入场、结构止损和目标后再计算账户级风险。";
  }

  if (status === "invalid_plan") {
    return "账户风险模拟：入场、止损、目标方向不匹配，不能作为有效结构计划换算。";
  }

  const warnings = [];
  if (checks.rrPass === false) warnings.push("结构盈亏比低于 3:1");
  if (!checks.stopStructurePass) warnings.push("止损缺少结构意义");
  if (checks.maxLossRulePass === false) warnings.push("止损亏损超过用户规则");

  if (warnings.length > 0) {
    return `账户风险模拟：只读辅助，发现风险项：${warnings.join("、")}。`;
  }

  return "账户风险模拟：只读辅助，未改变结构计划、扫描排序或交易门禁。";
}

export function simulateAccountRisk(input: AccountRiskInput): AccountRiskSimulation {
  const rules = mergeRules(input.rules);
  const leverage = resolveLeverage(input.symbol, input.exchangeMaxLeverage, rules);
  const distance = buildDistances(input);
  const position = buildPosition(input.entryPrice, leverage.leverage, rules);
  const loss = buildLoss(distance, position, rules);
  const liquidation = buildLiquidation(distance, leverage);
  const checks = buildChecks(distance, leverage, loss, input, rules);
  const status = statusForSimulation(distance, leverage, position);

  return {
    checks,
    distance,
    leverage,
    liquidation,
    loss,
    position,
    rules,
    status,
    summary: buildSummary(status, checks),
    symbol: input.symbol.trim().toUpperCase(),
  };
}
