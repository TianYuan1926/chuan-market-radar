export type PersonalPositionSide = "long" | "short" | "neutral";

export type PersonalLeverageProfile = {
  altcoinLeverage?: number | null;
  btcEthLeverage: number;
  marginFraction: number;
};

export type PersonalPositionLensStatus =
  | "ready"
  | "waiting_leverage"
  | "waiting_equity"
  | "waiting_price";

export type PersonalPositionLens = {
  status: PersonalPositionLensStatus;
  marginFraction: number;
  marginFractionPercent: number;
  leverage: number | null;
  leverageSource: "btc_eth_fixed" | "exchange_max" | "unknown";
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  structuralRewardRisk: number | null;
  notionalPerEquity: number | null;
  stopLossPctOfEquity: number | null;
  targetProfitPctOfEquity: number | null;
  stopLossRoe: number | null;
  targetRoe: number | null;
  summary: string;
};

export const defaultPersonalLeverageProfile: PersonalLeverageProfile = {
  altcoinLeverage: null,
  btcEthLeverage: 150,
  marginFraction: 0.003,
};

function baseAsset(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[-_/]/g, "").replace(/(USDT|USDC|USD)$/u, "");
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safePositive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function sideMultiplier(side: PersonalPositionSide) {
  if (side === "long") return 1;
  if (side === "short") return -1;
  return 0;
}

function leverageForSymbol(symbol: string, profile: PersonalLeverageProfile) {
  const asset = baseAsset(symbol);

  if (asset === "BTC" || asset === "ETH") {
    return {
      leverage: profile.btcEthLeverage,
      leverageSource: "btc_eth_fixed" as const,
    };
  }

  const altcoinLeverage = safePositive(profile.altcoinLeverage);

  return {
    leverage: altcoinLeverage,
    leverageSource: altcoinLeverage ? "exchange_max" as const : "unknown" as const,
  };
}

export function buildPersonalPositionLens({
  entryPrice,
  profile = defaultPersonalLeverageProfile,
  side,
  stopPrice,
  symbol,
  targetPrice,
}: {
  entryPrice: number | null | undefined;
  profile?: PersonalLeverageProfile;
  side: PersonalPositionSide;
  stopPrice: number | null | undefined;
  symbol: string;
  targetPrice: number | null | undefined;
}): PersonalPositionLens {
  const marginFraction = safePositive(profile.marginFraction) ?? defaultPersonalLeverageProfile.marginFraction;
  const entry = safePositive(entryPrice);
  const stop = safePositive(stopPrice);
  const target = safePositive(targetPrice);
  const { leverage, leverageSource } = leverageForSymbol(symbol, profile);
  const base = {
    entryPrice: entry,
    leverage,
    leverageSource,
    marginFraction,
    marginFractionPercent: round(marginFraction * 100, 3),
    stopPrice: stop,
    structuralRewardRisk: null,
    targetPrice: target,
  };

  if (!entry || !stop || !target || side === "neutral") {
    return {
      ...base,
      notionalPerEquity: null,
      status: "waiting_price",
      stopLossPctOfEquity: null,
      stopLossRoe: null,
      summary: "个人仓位镜头：等待完整入场、止损、目标价格后再换算实盘结果。",
      targetProfitPctOfEquity: null,
      targetRoe: null,
    };
  }

  if (!leverage) {
    return {
      ...base,
      notionalPerEquity: null,
      status: "waiting_leverage",
      stopLossPctOfEquity: null,
      stopLossRoe: null,
      summary: "个人仓位镜头：山寨币需要交易所最高杠杆上限，未知时只展示结构 RR，不臆造实盘收益。",
      targetProfitPctOfEquity: null,
      targetRoe: null,
    };
  }

  const dir = sideMultiplier(side);
  const riskDistancePct = ((entry - stop) * dir) / entry;
  const rewardDistancePct = ((target - entry) * dir) / entry;
  const validDistances = riskDistancePct > 0 && rewardDistancePct > 0;
  const notionalPerEquity = marginFraction * leverage;

  if (!validDistances) {
    return {
      ...base,
      notionalPerEquity: round(notionalPerEquity * 100, 4),
      status: "waiting_price",
      stopLossPctOfEquity: null,
      stopLossRoe: null,
      structuralRewardRisk: null,
      summary: "个人仓位镜头：价格方向和止损/目标不匹配，不能换算实盘结果。",
      targetProfitPctOfEquity: null,
      targetRoe: null,
    };
  }

  const readyStructuralRewardRisk = rewardDistancePct / riskDistancePct;
  const readyStopLossPctOfEquity = notionalPerEquity * riskDistancePct * 100;
  const readyTargetProfitPctOfEquity = notionalPerEquity * rewardDistancePct * 100;
  const readyStopLossRoe = riskDistancePct * leverage * 100;
  const readyTargetRoe = rewardDistancePct * leverage * 100;

  return {
    ...base,
    notionalPerEquity: round(notionalPerEquity * 100, 4),
    status: "ready",
    stopLossPctOfEquity: round(readyStopLossPctOfEquity, 4),
    stopLossRoe: round(readyStopLossRoe, 2),
    structuralRewardRisk: round(readyStructuralRewardRisk, 2),
    summary: `个人仓位镜头：按总资金 ${round(marginFraction * 100, 3)}% 保证金、${leverage}x 杠杆换算；只换算结果，不改变结构 RR 和信号判断。`,
    targetProfitPctOfEquity: round(readyTargetProfitPctOfEquity, 4),
    targetRoe: round(readyTargetRoe, 2),
  };
}
