import type {
  Candle,
} from "@/lib/market/ohlcv/types";

export type MarketRegimeType =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "HIGH_VOLATILITY"
  | "LOW_LIQUIDITY"
  | "RISK_OFF"
  | "ALT_ROTATION"
  | "UNKNOWN";

export type MarketRegimeDataStatus =
  | "READY"
  | "PARTIAL"
  | "UNKNOWN";

export type MarketRegimeInput = {
  altBreadthPercent?: number | null;
  altVolumeChangePercent?: number | null;
  btcDominanceChangePercent?: number | null;
  candles?: Candle[] | null;
  liquidityScore?: number | null;
  minimumCandles?: number;
};

export type MarketRegimeAssessment = {
  allowedUse: "market_context_only";
  canCreateTradePlan: false;
  canMutateLiveRanking: false;
  dataStatus: MarketRegimeDataStatus;
  primary: MarketRegimeType;
  secondary: MarketRegimeType[];
  summary: string;
  warnings: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function classifyTrend(candles: Candle[]) {
  const first = candles[0]?.close;
  const latest = candles.at(-1)?.close;

  if (!isFiniteNumber(first) || !isFiniteNumber(latest) || first <= 0) {
    return null;
  }

  const highs = candles.map((candle) => candle.high).filter(isFiniteNumber);
  const lows = candles.map((candle) => candle.low).filter(isFiniteNumber);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const changePercent = ((latest - first) / first) * 100;
  const rangePercent = latest > 0 ? ((high - low) / latest) * 100 : 0;

  if (rangePercent >= 18) {
    return {
      changePercent: round(changePercent),
      regime: "HIGH_VOLATILITY" as const,
      rangePercent: round(rangePercent),
    };
  }

  if (changePercent >= 4) {
    return {
      changePercent: round(changePercent),
      regime: "TREND_UP" as const,
      rangePercent: round(rangePercent),
    };
  }

  if (changePercent <= -4) {
    return {
      changePercent: round(changePercent),
      regime: "TREND_DOWN" as const,
      rangePercent: round(rangePercent),
    };
  }

  return {
    changePercent: round(changePercent),
    regime: "RANGE" as const,
    rangePercent: round(rangePercent),
  };
}

export function assessMarketRegime(input: MarketRegimeInput): MarketRegimeAssessment {
  const minimumCandles = input.minimumCandles ?? 24;
  const candles = input.candles ?? [];
  const warnings: string[] = [];
  const secondary: MarketRegimeType[] = [];

  if (candles.length < minimumCandles) {
    warnings.push(`K线数量不足：需要至少 ${minimumCandles} 根，当前 ${candles.length} 根。`);
  }

  const trend = candles.length >= minimumCandles ? classifyTrend(candles) : null;

  if (!trend) {
    return {
      allowedUse: "market_context_only",
      canCreateTradePlan: false,
      canMutateLiveRanking: false,
      dataStatus: candles.length > 0 ? "PARTIAL" : "UNKNOWN",
      primary: "UNKNOWN",
      secondary: [],
      summary: "市场状态数据不足，只能标记 UNKNOWN/PARTIAL；不能生成交易计划或改变排序。",
      warnings: warnings.length > 0 ? warnings : ["缺少可用市场状态输入。"],
    };
  }

  let primary: MarketRegimeType = trend.regime;

  if (isFiniteNumber(input.liquidityScore) && input.liquidityScore < 35) {
    primary = "LOW_LIQUIDITY";
    secondary.push(trend.regime);
    warnings.push("流动性偏低，只能作为风险 context，不能直接阻断或生成 READY。");
  }

  if (
    trend.regime === "TREND_DOWN" &&
    isFiniteNumber(input.altBreadthPercent) &&
    input.altBreadthPercent < 35
  ) {
    primary = "RISK_OFF";
    secondary.push("TREND_DOWN");
    warnings.push("山寨广度偏弱，市场处于防守背景；仍不能替代个币结构和 RR。");
  }

  if (
    isFiniteNumber(input.altBreadthPercent) &&
    input.altBreadthPercent >= 60 &&
    isFiniteNumber(input.btcDominanceChangePercent) &&
    input.btcDominanceChangePercent <= -0.6 &&
    isFiniteNumber(input.altVolumeChangePercent) &&
    input.altVolumeChangePercent >= 8
  ) {
    primary = "ALT_ROTATION";
    secondary.push(trend.regime);
    warnings.push("山寨轮动只能提升背景解释，不能生成 READY 或污染 ranking。");
  }

  const optionalInputs = [
    input.altBreadthPercent,
    input.altVolumeChangePercent,
    input.btcDominanceChangePercent,
    input.liquidityScore,
  ];
  const missingOptionalInputs = optionalInputs.filter((value) => !isFiniteNumber(value)).length;
  const dataStatus: MarketRegimeDataStatus = missingOptionalInputs > 0 ? "PARTIAL" : "READY";

  return {
    allowedUse: "market_context_only",
    canCreateTradePlan: false,
    canMutateLiveRanking: false,
    dataStatus,
    primary,
    secondary: unique(secondary.filter((item) => item !== primary)),
    summary: `市场状态：${primary}；涨跌幅 ${trend.changePercent}%；区间宽度 ${trend.rangePercent}%。仅作为 context。`,
    warnings: warnings.length > 0
      ? warnings
      : ["market regime 只作为 context，不直接生成 READY，不改变扫描排序。"],
  };
}
