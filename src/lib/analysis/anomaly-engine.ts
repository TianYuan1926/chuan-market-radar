import type {
  EvidencePoint,
  MarketRegime,
  MarketSignal,
  RiskGrade,
  SignalDirection,
  SignalState,
  Timeframe,
} from "./types";
import { generateStrategyPlan } from "./strategy-planner";

export type StructureLocation =
  | "support"
  | "resistance"
  | "breakout_edge"
  | "range_edge"
  | "middle"
  | "unknown";

export type MarketAnomalyInput = {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: Timeframe;
  regime: MarketRegime;
  directionBias: SignalDirection;
  dataQualityScore: number;
  priceChangePercent: number;
  volumeRatio: number;
  openInterestChangePercent: number;
  fundingRateZScore: number;
  volatilityCompressionPercentile: number;
  liquidationUsd24h: number;
  structureLocation: StructureLocation;
  distanceToInvalidationPercent: number;
  projectedMovePercent: number;
  triggerHint?: string;
  invalidationHint?: string;
  targetHints?: string[];
  updatedAt: string;
};

type ScoreBreakdown = {
  compression: number;
  volume: number;
  openInterest: number;
  structure: number;
  riskReward: number;
  fundingPenalty: number;
  regimePenalty: number;
};

const structureScores: Record<StructureLocation, number> = {
  support: 86,
  resistance: 82,
  breakout_edge: 90,
  range_edge: 78,
  middle: 18,
  unknown: 42,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function riskReward(input: MarketAnomalyInput) {
  if (input.distanceToInvalidationPercent <= 0) {
    return 0;
  }

  return rounded(input.projectedMovePercent / input.distanceToInvalidationPercent, 2);
}

function scoreBreakdown(input: MarketAnomalyInput): ScoreBreakdown {
  const rr = riskReward(input);
  const compression = clamp(100 - input.volatilityCompressionPercentile);
  const volume = clamp((input.volumeRatio - 1) * 62);
  const openInterest = clamp(input.openInterestChangePercent * 9);
  const structure = structureScores[input.structureLocation];
  const riskRewardScore = clamp((rr - 1.1) * 38);
  const fundingPenalty = Math.max(0, Math.abs(input.fundingRateZScore) - 1.1) * 10;
  const regimePenalty =
    (input.regime === "risk_off" && input.directionBias === "long") ||
    (input.regime === "risk_on" && input.directionBias === "short")
      ? 6
      : 0;

  return {
    compression,
    volume,
    openInterest,
    structure,
    riskReward: riskRewardScore,
    fundingPenalty,
    regimePenalty,
  };
}

function confidence(input: MarketAnomalyInput, scores: ScoreBreakdown) {
  const raw =
    scores.compression * 0.2 +
    scores.volume * 0.18 +
    scores.openInterest * 0.16 +
    scores.structure * 0.24 +
    scores.riskReward * 0.22 -
    scores.fundingPenalty -
    scores.regimePenalty;

  return Math.round(clamp(raw));
}

function stateFor(input: MarketAnomalyInput, score: number): SignalState {
  const rr = riskReward(input);

  if (input.dataQualityScore < 0.6) {
    return "insufficient_data";
  }

  if (input.structureLocation === "middle" && rr < 2.2) {
    return "abnormal_watch";
  }

  if (score >= 74 && rr >= 2.5 && input.structureLocation !== "middle") {
    return "near_trigger";
  }

  if (score >= 62) {
    return "waiting_confirmation";
  }

  if (score >= 45) {
    return "normal_watch";
  }

  return "no_trade";
}

function riskFor(input: MarketAnomalyInput, state: SignalState): RiskGrade {
  const rr = riskReward(input);

  if (state === "insufficient_data") {
    return "blocked";
  }

  if (input.structureLocation === "middle" || rr < 1.6 || Math.abs(input.fundingRateZScore) > 2) {
    return "high";
  }

  if (rr >= 3 && input.dataQualityScore >= 0.85) {
    return "low";
  }

  return "medium";
}

function directionFor(input: MarketAnomalyInput, state: SignalState): SignalDirection {
  if (state === "insufficient_data") {
    return "neutral";
  }

  if (input.structureLocation === "middle") {
    return "neutral";
  }

  return input.directionBias;
}

function evidenceFor(input: MarketAnomalyInput): EvidencePoint[] {
  const rr = riskReward(input);
  const evidence: EvidencePoint[] = [
    {
      label: `波动率分位 ${input.volatilityCompressionPercentile}`,
      value:
        input.volatilityCompressionPercentile <= 25
          ? "波动率处于压缩区，具备酝酿方向选择的条件。"
          : "波动率压缩不明显，不能单独视为爆发前信号。",
      layer: "indicators",
      polarity: input.volatilityCompressionPercentile <= 25 ? "supportive" : "neutral",
    },
    {
      label: `Volume Ratio ${rounded(input.volumeRatio, 2)}`,
      value:
        input.volumeRatio >= 1.5
          ? "成交量开始放大，说明主动资金有进入迹象。"
          : "成交量尚未形成确认，触发条件不能提前判定。",
      layer: "price_volume",
      polarity: input.volumeRatio >= 1.5 ? "supportive" : "neutral",
    },
    {
      label: `OI ${rounded(input.openInterestChangePercent, 1)}%`,
      value:
        input.openInterestChangePercent >= 5
          ? "持仓量明显增加，合约参与度提升，但仍需要价格位置配合。"
          : "持仓量变化有限，不能把它当作主要证据。",
      layer: "derivatives",
      polarity: input.openInterestChangePercent >= 5 ? "supportive" : "neutral",
    },
    {
      label: "结构位置",
      value:
        input.structureLocation === "middle"
          ? "价格处在区间中部，止损不够近，容易被双向扫。"
          : "价格靠近关键边界，具备观察触发和失效条件的基础。",
      layer: "structure_location",
      polarity: input.structureLocation === "middle" ? "blocking" : "supportive",
    },
    {
      label: `赔率 ${rr.toFixed(2)}R`,
      value:
        rr >= 2.5
          ? "潜在空间大于失效距离，符合低风险高回报筛选方向。"
          : "潜在空间不足或止损距离偏远，不适合给交易信号。",
      layer: "risk_reward",
      polarity: rr >= 2.5 ? "supportive" : "blocking",
    },
  ];

  if (input.dataQualityScore < 0.6) {
    evidence.unshift({
      label: "数据质量不足",
      value: "关键行情或衍生品字段不足，本轮只允许记录，不允许输出策略。",
      layer: "data_quality",
      polarity: "blocking",
    });
  }

  if (Math.abs(input.fundingRateZScore) >= 1.5) {
    evidence.push({
      label: `资金费率 Z ${rounded(input.fundingRateZScore, 2)}`,
      value: "资金费率偏离较大，可能存在拥挤风险，需要等待二次确认。",
      layer: "derivatives",
      polarity: "conflicting",
    });
  }

  if (
    (input.regime === "risk_off" && input.directionBias === "long") ||
    (input.regime === "risk_on" && input.directionBias === "short")
  ) {
    evidence.push({
      label: "市场环境反向",
      value: "大环境与方向倾向不完全一致，只降权，不直接一刀切否定。",
      layer: "market_regime",
      polarity: "conflicting",
    });
  }

  return evidence;
}

function summaryFor(input: MarketAnomalyInput, state: SignalState) {
  if (state === "insufficient_data") {
    return "关键数据不足，本轮只进入记录池，不给交易判断。";
  }

  if (input.structureLocation === "middle") {
    return "波动率和合约参与度有异动，但价格在区间中部，暂时只观察，不追。";
  }

  if (state === "near_trigger") {
    return "压缩、放量、OI 和关键位置同时出现，接近可执行候选，但仍需触发确认。";
  }

  if (state === "waiting_confirmation") {
    return "异动证据已经出现，但触发条件还不完整，需要等待价格确认。";
  }

  return "有观察价值，但证据强度或赔率还不够，不进入执行候选。";
}

export function analyzeMarketAnomaly(input: MarketAnomalyInput): MarketSignal {
  const scores = scoreBreakdown(input);
  const score = input.dataQualityScore < 0.6 ? 0 : confidence(input, scores);
  const state = stateFor(input, score);
  const risk = riskFor(input, state);
  const direction = directionFor(input, state);
  const evidence = evidenceFor(input);

  return {
    id: input.id,
    symbol: input.symbol,
    exchange: input.exchange,
    direction,
    state,
    timeframe: input.timeframe,
    regime: input.regime,
    confidence: score,
    risk,
    updatedAt: input.updatedAt,
    summary: summaryFor(input, state),
    evidence,
    strategy: generateStrategyPlan({
      symbol: input.symbol,
      direction,
      state,
      risk,
      riskReward: riskReward(input),
      triggerHint: input.triggerHint,
      invalidationHint: input.invalidationHint,
      targets: input.targetHints ?? [],
      distanceToInvalidationPercent: input.distanceToInvalidationPercent,
      projectedMovePercent: input.projectedMovePercent,
      evidence,
    }),
  };
}

export function analyzeMarketAnomalies(inputs: MarketAnomalyInput[]) {
  return inputs
    .map((input) => analyzeMarketAnomaly(input))
    .sort((left, right) => right.confidence - left.confidence);
}
