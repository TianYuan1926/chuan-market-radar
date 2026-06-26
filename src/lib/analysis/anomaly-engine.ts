import type {
  EvidencePoint,
  MarketRegime,
  MarketSignal,
  RiskGrade,
  SignalDirection,
  SignalState,
  Timeframe,
  TimeframeHardGate,
} from "./types";
import { generateStrategyPlan } from "./strategy-planner";
import {
  summarizeTimeframeAgreement,
  timeframeRoleMap,
  type TimeframeProfile,
} from "./timeframe-profile";
import {
  buildSignalStrategyV2Audit,
} from "./v2/current-signal-audit";

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
  marketContext?: MarketAnchorContext;
  timeframeProfile?: TimeframeProfile;
  dataWarnings?: EvidencePoint[];
  indicatorEvidence?: EvidencePoint[];
};

export type MarketAnchorContext = {
  anchor: "btc_eth" | "btc" | "eth" | "unknown";
  btcChangePercent?: number;
  ethChangePercent?: number;
  note: string;
  regime: MarketRegime;
};

type ScoreBreakdown = {
  compression: number;
  earlyOpportunity: number;
  volume: number;
  openInterest: number;
  structure: number;
  riskReward: number;
  lateMovePenalty: number;
  fundingPenalty: number;
  regimePenalty: number;
  marketContextPenalty: number;
  indicatorBonus: number;
  indicatorPenalty: number;
  timeframeBonus: number;
  timeframePenalty: number;
};

type IndicatorTimeframeCalibration = {
  bonus: number;
  evidence: EvidencePoint | null;
  penalty: number;
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

function regimeConflict(regime: MarketRegime, direction: SignalDirection) {
  return (regime === "risk_off" && direction === "long") ||
    (regime === "risk_on" && direction === "short");
}

function marketContextConflict(input: MarketAnomalyInput) {
  return input.marketContext
    ? regimeConflict(input.marketContext.regime, input.directionBias)
    : false;
}

function structureTimeframeConflict(input: MarketAnomalyInput) {
  return input.timeframeProfile?.conflictTimeframes.some((timeframe) => timeframe === "1h" || timeframe === "4h") ??
    false;
}

function structureConflictTimeframes(input: MarketAnomalyInput): Timeframe[] {
  return input.timeframeProfile?.conflictTimeframes.filter(
    (timeframe) => timeframe === "1h" || timeframe === "4h",
  ) ?? [];
}

function regimeConflictTimeframes(input: MarketAnomalyInput): Timeframe[] {
  return input.timeframeProfile?.conflictTimeframes.filter(
    (timeframe) => timeframe === "1d" || timeframe === "1w",
  ) ?? [];
}

function evaluateTimeframeHardGate(input: MarketAnomalyInput): TimeframeHardGate {
  const structureConflicts = structureConflictTimeframes(input);
  const regimeConflicts = regimeConflictTimeframes(input);
  const doubleRegimeConflict = regimeConflicts.includes("1d") && regimeConflicts.includes("1w");

  if (doubleRegimeConflict) {
    return {
      action: "WATCH_ONLY",
      allowed: false,
      blockedBy: ["regime_timeframe_double_conflict"],
      conflictTimeframes: regimeConflicts,
      guardrail: "日线和周线同时冲突时，低周期信号只能观察，不能输出交易计划。",
      mode: "multi_timeframe_hard_gate_v1",
      summary: `${regimeConflicts.join("/")} 同时与当前方向冲突；日线和周线没有转向前，只能观察。`,
    };
  }

  if (structureConflicts.length > 0) {
    return {
      action: "WAIT_HIGH_TIMEFRAME_BREAK",
      allowed: false,
      blockedBy: ["structure_timeframe_conflict"],
      conflictTimeframes: structureConflicts,
      guardrail: "低周期不能推翻高周期；1h/4h 压力未突破时只能等待确认。",
      mode: "multi_timeframe_hard_gate_v1",
      summary: `${structureConflicts.join("/")} 结构仍冲突；短周期信号只能等待高周期突破或回踩确认。`,
    };
  }

  return {
    action: "ALLOW",
    allowed: true,
    blockedBy: [],
    conflictTimeframes: [],
    guardrail: "高周期未发现硬阻断，仍需 Evidence、赔率和 Risk Gate 继续确认。",
    mode: "multi_timeframe_hard_gate_v1",
    summary: "多周期硬门控通过。",
  };
}

function structureTimeframeSupport(input: MarketAnomalyInput) {
  return input.timeframeProfile?.frames.some(
    (frame) => timeframeRoleMap[frame.timeframe] === "structure" && frame.alignment === "support",
  ) ?? false;
}

function indicatorSupportsDirection(value: string, direction: SignalDirection) {
  return (direction === "long" && value === "bullish") ||
    (direction === "short" && value === "bearish");
}

function indicatorConflictsWithDirection(value: string, direction: SignalDirection) {
  return (direction === "long" && value === "bearish") ||
    (direction === "short" && value === "bullish");
}

function indicatorMatrixCounts(input: MarketAnomalyInput) {
  const matrixEvidence = input.indicatorEvidence?.find((item) => item.label === "多周期指标矩阵");
  let supportive = 0;
  let conflicting = 0;

  if (matrixEvidence) {
    const segments = matrixEvidence.value.split("。")[0].split("；");

    for (const segment of segments) {
      const match = segment.match(/EMA\s+(\w+)\/MACD\s+(\w+)\/RSI\s+(\w+)/);

      if (!match) {
        continue;
      }

      const [, ema, macd, rsi] = match;

      for (const value of [ema, macd]) {
        if (indicatorSupportsDirection(value, input.directionBias)) {
          supportive += 1;
        }

        if (indicatorConflictsWithDirection(value, input.directionBias)) {
          conflicting += 1;
        }
      }

      if ((input.directionBias === "long" && rsi === "overheated") ||
        (input.directionBias === "short" && rsi === "oversold")) {
        conflicting += 1;
      }
    }

    return { supportive, conflicting };
  }

  for (const item of input.indicatorEvidence ?? []) {
    if (item.polarity === "supportive") {
      supportive += 1;
    }

    if (item.polarity === "conflicting") {
      conflicting += 1;
    }
  }

  return { supportive, conflicting };
}

function indicatorTimeframeCalibration(input: MarketAnomalyInput): IndicatorTimeframeCalibration {
  const hasIndicators = Boolean(input.indicatorEvidence?.length);
  const hasTimeframeProfile = Boolean(input.timeframeProfile);

  if (!hasIndicators || !hasTimeframeProfile || input.directionBias === "neutral") {
    return {
      bonus: 0,
      evidence: null,
      penalty: 0,
    };
  }

  const counts = indicatorMatrixCounts(input);
  const structureSupport = structureTimeframeSupport(input);
  const structureConflict = structureTimeframeConflict(input);

  if (counts.conflicting >= Math.max(2, counts.supportive) && structureConflict) {
    return {
      bonus: 0,
      penalty: 8,
      evidence: {
        label: "指标/周期反证",
        value:
          `指标矩阵有 ${counts.conflicting} 个方向冲突项，且 1h/4h 结构未确认；本轮只做额外降权，不能直接反向交易。`,
        layer: "indicators",
        polarity: "conflicting",
      },
    };
  }

  if (counts.supportive > counts.conflicting && structureSupport && !structureConflict) {
    return {
      bonus: Math.min(5, 2 + counts.supportive),
      penalty: 0,
      evidence: {
        label: "指标/周期同向校验",
        value:
          `指标矩阵有 ${counts.supportive} 个顺向项，且 1h/4h 结构没有明显冲突；只做小幅加权，仍需触发和失效条件兑现。`,
        layer: "indicators",
        polarity: "supportive",
      },
    };
  }

  return {
    bonus: 0,
    evidence: null,
    penalty: counts.conflicting > counts.supportive ? 4 : 0,
  };
}

function earlyOpportunityBonus(input: MarketAnomalyInput) {
  if (
    input.directionBias === "neutral" ||
    input.structureLocation === "middle" ||
    structureTimeframeConflict(input) ||
    input.volumeRatio < 1.25
  ) {
    return 0;
  }

  const absMove = Math.abs(input.priceChangePercent);
  const compression = input.volatilityCompressionPercentile <= 28
    ? 7
    : input.volatilityCompressionPercentile <= 42
      ? 4
      : 0;
  const volume = input.volumeRatio >= 1.25
    ? Math.min(5, (input.volumeRatio - 1.15) * 4)
    : 0;
  const lowDisplacement = absMove <= 3
    ? 5
    : absMove <= 5
      ? 2
      : 0;
  const position = input.structureLocation === "support" ||
    input.structureLocation === "resistance" ||
    input.structureLocation === "range_edge" ||
    input.structureLocation === "breakout_edge"
    ? 3
    : 0;

  return clamp(compression + volume + lowDisplacement + position, 0, 16);
}

function lateMovePenalty(input: MarketAnomalyInput) {
  if (input.directionBias === "neutral") {
    return 0;
  }

  const absMove = Math.abs(input.priceChangePercent);
  const directionalEdge = input.structureLocation === "breakout_edge";
  const hotAndExpanded = input.volatilityCompressionPercentile >= 70 && absMove >= 6;
  let penalty = 0;

  if (absMove >= 12) {
    penalty += 24;
  } else if (absMove >= 8) {
    penalty += 17;
  } else if (absMove >= 6) {
    penalty += 10;
  }

  if (directionalEdge && absMove >= 6) {
    penalty += 6;
  }

  if (hotAndExpanded) {
    penalty += 5;
  }

  return clamp(penalty, 0, 32);
}

function scoreBreakdown(input: MarketAnomalyInput): ScoreBreakdown {
  const rr = riskReward(input);
  const indicatorCalibration = indicatorTimeframeCalibration(input);
  const compression = clamp(100 - input.volatilityCompressionPercentile);
  const earlyOpportunity = earlyOpportunityBonus(input);
  const volume = clamp((input.volumeRatio - 1) * 62);
  const openInterest = clamp(input.openInterestChangePercent * 9);
  const structure = structureScores[input.structureLocation];
  const riskRewardScore = clamp((rr - 1.1) * 38);
  const latePenalty = lateMovePenalty(input);
  const fundingPenalty = Math.max(0, Math.abs(input.fundingRateZScore) - 1.1) * 10;
  const regimePenalty = regimeConflict(input.regime, input.directionBias) ? 6 : 0;
  const marketContextPenalty = marketContextConflict(input) ? 14 : 0;
  const timeframeBonus = input.timeframeProfile?.supportScore ?? 0;
  const timeframePenalty = (input.timeframeProfile?.conflictScore ?? 0) +
    (input.timeframeProfile?.missingDataPenalty ?? 0);

  return {
    compression,
    earlyOpportunity,
    volume,
    openInterest,
    structure,
    riskReward: riskRewardScore,
    lateMovePenalty: latePenalty,
    fundingPenalty,
    regimePenalty,
    marketContextPenalty,
    indicatorBonus: indicatorCalibration.bonus,
    indicatorPenalty: indicatorCalibration.penalty,
    timeframeBonus,
    timeframePenalty,
  };
}

function confidence(input: MarketAnomalyInput, scores: ScoreBreakdown) {
  const raw =
    scores.compression * 0.2 +
    scores.earlyOpportunity * 0.85 +
    scores.volume * 0.18 +
    scores.openInterest * 0.16 +
    scores.structure * 0.24 +
    scores.riskReward * 0.22 -
    scores.lateMovePenalty -
    scores.fundingPenalty -
    scores.regimePenalty -
    scores.marketContextPenalty +
    scores.indicatorBonus -
    scores.indicatorPenalty +
    scores.timeframeBonus -
    scores.timeframePenalty;
  const capped = marketContextConflict(input) || structureTimeframeConflict(input)
    ? Math.min(raw, 73)
    : raw;

  return Math.round(clamp(capped));
}

function stateFor(input: MarketAnomalyInput, score: number, timeframeGate: TimeframeHardGate): SignalState {
  const rr = riskReward(input);
  const latePenalty = lateMovePenalty(input);

  if (input.dataQualityScore < 0.6) {
    return "insufficient_data";
  }

  if (latePenalty >= 17) {
    return score >= 45 ? "normal_watch" : "no_trade";
  }

  if (input.structureLocation === "middle" && rr < 2.2) {
    return "abnormal_watch";
  }

  if (score >= 74 && rr >= 2.5 && input.structureLocation !== "middle") {
    if (timeframeGate.action === "WATCH_ONLY") {
      return "normal_watch";
    }

    if (timeframeGate.action === "WAIT_HIGH_TIMEFRAME_BREAK" || marketContextConflict(input)) {
      return "waiting_confirmation";
    }

    return "near_trigger";
  }

  if (timeframeGate.action === "WATCH_ONLY" && score >= 45) {
    return "normal_watch";
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
  const latePenalty = lateMovePenalty(input);

  if (state === "insufficient_data") {
    return "blocked";
  }

  if (latePenalty >= 17) {
    return "high";
  }

  if (input.structureLocation === "middle" || rr < 1.6 || Math.abs(input.fundingRateZScore) > 2) {
    return "high";
  }

  if (marketContextConflict(input)) {
    return "medium";
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

function evidenceFor(input: MarketAnomalyInput, timeframeGate: TimeframeHardGate): EvidencePoint[] {
  const rr = riskReward(input);
  const earlyScore = earlyOpportunityBonus(input);
  const latePenalty = lateMovePenalty(input);
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

  if (earlyScore >= 10) {
    evidence.push({
      label: "提前性校验",
      value: `价格尚未大幅偏离启动区，压缩/量能/结构位置组合得到 ${rounded(earlyScore, 1)} 分；优先作为启动前候选观察。`,
      layer: "structure_location",
      polarity: "supportive",
    });
  }

  if (latePenalty >= 10) {
    evidence.push({
      label: "晚到风险",
      value: `价格已经明显偏离启动区，晚到惩罚 ${rounded(latePenalty, 1)} 分；方向可以记录，但默认不追，只等回踩/反抽或进入复盘。`,
      layer: "risk_reward",
      polarity: "blocking",
    });
  }

  if (input.dataQualityScore < 0.6) {
    evidence.unshift({
      label: "数据质量不足",
      value: "关键行情或衍生品字段不足，本轮只允许记录，不允许输出策略。",
      layer: "data_quality",
      polarity: "blocking",
    });
  }

  if (input.dataWarnings?.length) {
    evidence.unshift(...input.dataWarnings);
  }

  if (input.indicatorEvidence?.length) {
    evidence.push(...input.indicatorEvidence);
  }

  if (!timeframeGate.allowed) {
    evidence.push({
      label: "多周期硬门控",
      value: `${timeframeGate.summary} ${timeframeGate.guardrail}`,
      layer: timeframeGate.action === "WATCH_ONLY" ? "market_regime" : "structure_location",
      polarity: timeframeGate.action === "WATCH_ONLY" ? "blocking" : "conflicting",
    });
  }

  const calibration = indicatorTimeframeCalibration(input);

  if (calibration.evidence) {
    evidence.push(calibration.evidence);
  }

  if (Math.abs(input.fundingRateZScore) >= 1.5) {
    evidence.push({
      label: `资金费率 Z ${rounded(input.fundingRateZScore, 2)}`,
      value: "资金费率偏离较大，可能存在拥挤风险，需要等待二次确认。",
      layer: "derivatives",
      polarity: "conflicting",
    });
  }

  if (input.marketContext) {
    const contextConflicts = marketContextConflict(input);

    evidence.push({
      label: contextConflicts ? "BTC/ETH 环境逆风" : "BTC/ETH 环境校验",
      value: contextConflicts
        ? "BTC/ETH 锚点与当前方向不一致，本轮降权为等待确认，但不一刀切否定。"
        : "BTC/ETH 锚点没有明显逆风，当前信号仍按自身结构继续评估。",
      layer: "market_regime",
      polarity: contextConflicts ? "conflicting" : "neutral",
    });
  }

  if (input.timeframeProfile) {
    const hasConflicts = input.timeframeProfile.conflictTimeframes.length > 0;
    const hasStructureConflicts = structureTimeframeConflict(input);
    const hasMissingRoles = input.timeframeProfile.missingRoles.length > 0;

    evidence.push({
      label: hasStructureConflicts ? "多周期结构冲突" : "多周期结构校验",
      value: hasConflicts
        ? `${summarizeTimeframeAgreement(input.timeframeProfile)} 冲突周期只降权并等待确认，不直接一刀切否定。`
        : `${summarizeTimeframeAgreement(input.timeframeProfile)} 多周期证据允许继续评估，但仍需要触发条件。`,
      layer: hasMissingRoles ? "data_quality" : "structure_location",
      polarity: hasConflicts ? "conflicting" : hasMissingRoles ? "neutral" : "supportive",
    });
  }

  if (regimeConflict(input.regime, input.directionBias)) {
    evidence.push({
      label: "市场环境反向",
      value: "大环境与方向倾向不完全一致，只降权，不直接一刀切否定。",
      layer: "market_regime",
      polarity: "conflicting",
    });
  }

  return evidence;
}

function summaryFor(input: MarketAnomalyInput, state: SignalState, timeframeGate: TimeframeHardGate) {
  if (lateMovePenalty(input) >= 17) {
    return "方向异动已经发生，但价格明显偏离启动区，当前只做观察或复盘，不追多也不追空。";
  }

  if (state === "insufficient_data") {
    return "关键数据不足，本轮只进入记录池，不给交易判断。";
  }

  if (timeframeGate.action === "WATCH_ONLY") {
    return "日线和周线同时冲突，本轮只观察，不给交易计划。";
  }

  if (timeframeGate.action === "WAIT_HIGH_TIMEFRAME_BREAK") {
    return "低周期异动存在，但 1h/4h 高周期结构未确认，只能等待突破或回踩确认。";
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

function applyTimeframeGateToPlan(
  plan: ReturnType<typeof generateStrategyPlan>,
  timeframeGate: TimeframeHardGate,
): ReturnType<typeof generateStrategyPlan> {
  if (timeframeGate.allowed) {
    return plan;
  }

  const counterEvidence = [
    `多周期硬门控: ${timeframeGate.summary}`,
    ...(plan.counterEvidence ?? []),
  ];

  if (timeframeGate.action === "WATCH_ONLY") {
    return {
      ...plan,
      bias: "neutral",
      entry: "不参与，等待日线和周线至少解除一个方向冲突后再评估。",
      invalidation: "日线和周线继续同向压制时，多头计划保持失效。",
      positionHint: "日线和周线同时冲突，只观察，不给交易计划。",
      status: "observe_only",
      entryZone: "无入场区",
      stopLoss: "无执行计划",
      takeProfitPlan: "无执行计划",
      noChase: true,
      confirmation: [
        "日线或周线冲突解除",
        "1h/4h 重新形成同向结构",
        ...(plan.confirmation ?? []),
      ],
      counterEvidence,
      riskControls: [
        "禁止用低周期强势覆盖日线/周线冲突",
        ...(plan.riskControls ?? []),
      ],
    };
  }

  return {
    ...plan,
    entry: "等待 1h/4h 关键压力突破并回踩确认后再评估。",
    positionHint: "等待高周期确认；低周期不能推翻高周期，当前不允许提前执行。",
    status: "waiting",
    noChase: true,
    confirmation: [
      "1h/4h 冲突周期突破或转为支撑",
      "回踩不破高周期关键位",
      ...(plan.confirmation ?? []),
    ],
    counterEvidence,
    riskControls: [
      "高周期压力未解除前禁止追单",
      ...(plan.riskControls ?? []),
    ],
  };
}

export function analyzeMarketAnomaly(input: MarketAnomalyInput): MarketSignal {
  const timeframeGate = evaluateTimeframeHardGate(input);
  const scores = scoreBreakdown(input);
  const score = input.dataQualityScore < 0.6 ? 0 : confidence(input, scores);
  const state = stateFor(input, score, timeframeGate);
  const risk = riskFor(input, state);
  const direction = directionFor(input, state);
  const evidence = evidenceFor(input, timeframeGate);
  const timeframeAgreement = input.timeframeProfile
    ? summarizeTimeframeAgreement(input.timeframeProfile)
    : undefined;
  const strategy = applyTimeframeGateToPlan(generateStrategyPlan({
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
  }), timeframeGate);

  const signal: MarketSignal = {
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
    summary: summaryFor(input, state, timeframeGate),
    evidence,
    strategy,
    timeframeProfile: input.timeframeProfile,
    timeframeAgreement,
    timeframeConflicts: input.timeframeProfile?.conflictTimeframes,
    timeframeGate,
  };

  return {
    ...signal,
    strategyV2: buildSignalStrategyV2Audit(signal),
  };
}

export function analyzeMarketAnomalies(inputs: MarketAnomalyInput[]) {
  return inputs
    .map((input) => analyzeMarketAnomaly(input))
    .sort((left, right) => right.confidence - left.confidence);
}
