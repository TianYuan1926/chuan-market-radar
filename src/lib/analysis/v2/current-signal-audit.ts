import type {
  AnalysisLayer,
  EvidencePoint,
  MarketSignal,
  SignalDirection,
  StrategyV2Audit,
} from "../types";
import type {
  EvidenceDirection,
  EvidenceFamily,
  EvidenceItem,
  EvidenceSource,
} from "./evidence/evidence-types";
import {
  generateChineseStrategyReport,
} from "./report/report-generator";
import {
  calculateEnergyDecayScore,
} from "./scoring/energy-decay-score";
import {
  calculateEnergyScore,
} from "./scoring/energy-score";
import {
  calculatePreMoveScore,
} from "./scoring/pre-move-score";
import {
  calculateRiskScore,
} from "./scoring/risk-score";
import {
  calculateTrendHoldScore,
} from "./scoring/trend-hold-score";
import {
  decideStrategy,
} from "./strategy/decision-engine";
import type {
  StrategyScores,
} from "./strategy/market-state-machine";

const bannedExternalEvidencePattern = /清算热力图|liquidation\s*heat\s*map|liquidation\s*zone|heatmap\s*provider|潜在清算区/iu;

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 48);
}

function familyForLayer(layer: AnalysisLayer, point: EvidencePoint): EvidenceFamily {
  if (layer === "risk_reward") {
    return "LOCATION_RR";
  }

  if (layer === "structure_location" || /前高|前低|支撑|压力|阻力|突破|区间|结构/u.test(point.label)) {
    return "PRICE_STRUCTURE";
  }

  if (layer === "price_volume") {
    return "VOLUME_VOLATILITY";
  }

  if (layer === "derivatives") {
    return "DERIVATIVES";
  }

  if (layer === "indicators") {
    return "TECHNICAL_INDICATOR";
  }

  if (layer === "market_regime" || layer === "data_quality" || layer === "ai_review" || layer === "lifecycle_review") {
    return "MARKET_REGIME";
  }

  return "MARKET_REGIME";
}

function sourceFor(point: EvidencePoint, family: EvidenceFamily): EvidenceSource {
  const text = `${point.label} ${point.value}`;

  if (/OI|持仓|open interest/iu.test(text)) {
    return "oi_interpreter";
  }

  if (/资金|funding/iu.test(text)) {
    return "funding_interpreter";
  }

  if (/多空|long.?short/iu.test(text)) {
    return "long_short_interpreter";
  }

  if (/主动买|主动卖|taker|CVD/iu.test(text)) {
    return "taker_flow_interpreter";
  }

  if (/RSI|MACD|布林|Bollinger|ATR|EMA|VWAP|ADX/iu.test(text)) {
    return "indicator_interpreter";
  }

  if (/赔率|止损|盈亏比|位置/iu.test(text) || family === "LOCATION_RR") {
    return "location_rr";
  }

  if (/BTC|ETH|大盘|环境|相对强度/iu.test(text)) {
    return "market_context";
  }

  if (/压缩|收敛|squeeze|compression/iu.test(text)) {
    return "range_compression";
  }

  if (/突破失败|跌回|假突破|fakeout|失效/iu.test(text)) {
    return "fakeout_risk";
  }

  if (/突破|breakout/iu.test(text)) {
    return "breakout_quality";
  }

  if (/回踩|承接|pullback/iu.test(text)) {
    return "pullback_quality";
  }

  return family === "PRICE_STRUCTURE" ? "market_structure" : "market_context";
}

function directionFor(point: EvidencePoint, signalDirection: SignalDirection): EvidenceDirection {
  if (point.polarity === "blocking") {
    return "RISK";
  }

  if (point.polarity === "conflicting") {
    return "CONFLICT";
  }

  if (point.polarity === "neutral") {
    return "NEUTRAL";
  }

  if (signalDirection === "short") {
    return "BEARISH";
  }

  return signalDirection === "long" ? "BULLISH" : "NEUTRAL";
}

function normalizedLabel(point: EvidencePoint) {
  const text = `${point.label} ${point.value}`;

  if (/突破失败|跌回|假突破|失效/iu.test(text)) {
    return "invalidated_breakout_fell_back_inside_range";
  }

  if (/OI|持仓/iu.test(text) && /暴涨|激增|滞涨|拥挤/iu.test(text)) {
    return "oi_spike_price_stall";
  }

  if (/资金|funding/iu.test(text) && /高|极端|拥挤/iu.test(text)) {
    return "funding_crowding_risk";
  }

  if (/资金|funding/iu.test(text) && /中性|neutral|偏低/iu.test(text)) {
    return "funding_neutral_context";
  }

  if (/相对强度|抗跌|强于|BTC 横盘|BTC下跌/iu.test(text)) {
    return "relative_strength_altcoin";
  }

  if (/压缩|收敛|squeeze|compression/iu.test(text)) {
    return "range_compression";
  }

  if (/突破|breakout/iu.test(text)) {
    return "breakout_close_above_range";
  }

  if (/趋势|HH|HL|EMA|VWAP|承接|支撑/iu.test(text)) {
    return "trend_hh_hl_intact";
  }

  if (/前高|压力|阻力/iu.test(text)) {
    return "higher_timeframe_resistance_nearby";
  }

  return slug(point.label) || "legacy_signal_evidence";
}

function strengthFor(point: EvidencePoint, signal: MarketSignal) {
  if (point.polarity === "blocking") {
    return Math.max(76, signal.confidence);
  }

  if (point.polarity === "conflicting") {
    return Math.max(62, Math.round(signal.confidence * 0.9));
  }

  if (point.polarity === "neutral") {
    return Math.max(44, Math.round(signal.confidence * 0.72));
  }

  return Math.max(52, signal.confidence);
}

function toEvidenceItem(signal: MarketSignal, point: EvidencePoint, index: number): EvidenceItem {
  const family = familyForLayer(point.layer, point);
  const source = sourceFor(point, family);
  const label = normalizedLabel(point);

  return {
    id: `${signal.symbol}:${signal.timeframe}:${label}:${index}`,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    family,
    source,
    label,
    direction: directionFor(point, signal.direction),
    strength: strengthFor(point, signal),
    confidence: Math.max(40, Math.min(100, signal.confidence)),
    weightHint: family === "TECHNICAL_INDICATOR" ? 0.08 : 0.2,
    dataFreshness: signal.state === "insufficient_data" ? "partial" : "fresh",
    fact: `${point.label}: ${point.value}`,
    reasoning: "从当前 MarketSignal 证据映射为 Strategy Engine v2 EvidenceItem；适配器只做审计，不改 live ranking。",
    createdAt: signal.updatedAt,
  };
}

function syntheticEvidence(signal: MarketSignal): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const base = {
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    confidence: Math.max(40, Math.min(100, signal.confidence)),
    createdAt: signal.updatedAt,
  };

  if (signal.strategy.riskReward < 3) {
    items.push({
      ...base,
      id: `${signal.symbol}:${signal.timeframe}:reward_risk_below_minimum`,
      family: "LOCATION_RR",
      source: "location_rr",
      label: "reward_risk_below_minimum",
      direction: "RISK",
      strength: 82,
      weightHint: 0.24,
      dataFreshness: "fresh",
      fact: `当前赔率 ${signal.strategy.riskReward.toFixed(2)}R，低于 3:1 硬门槛。`,
      reasoning: "Risk gate 只允许低风险高回报机会；赔率不足不能输出交易计划。",
    });
  }

  if (signal.strategy.noChase || signal.risk === "high") {
    items.push({
      ...base,
      id: `${signal.symbol}:${signal.timeframe}:no_chase_location_risk`,
      family: "LOCATION_RR",
      source: "location_rr",
      label: "no_chase_location_risk",
      direction: "RISK",
      strength: 76,
      weightHint: 0.22,
      dataFreshness: "fresh",
      fact: signal.strategy.noChase ? "现有策略已标记禁止追单。" : "当前风险等级为高风险。",
      reasoning: "v2 只读审计继承现有禁止追单边界，不把过热位置改写为机会。",
    });
  }

  if (signal.state === "near_trigger") {
    items.push({
      ...base,
      id: `${signal.symbol}:${signal.timeframe}:pre_breakout_range_edge`,
      family: "PRICE_STRUCTURE",
      source: "market_structure",
      label: "pre_breakout_range_edge",
      direction: "NEUTRAL",
      strength: Math.max(64, signal.confidence),
      weightHint: 0.22,
      dataFreshness: "fresh",
      fact: "当前旧引擎状态为接近触发。",
      reasoning: "接近触发只能进入等待突破或确认状态，不能直接追入。",
    });
  }

  return items;
}

function scoresFor(evidence: EvidenceItem[]): StrategyScores {
  return {
    preMove: calculatePreMoveScore(evidence).score,
    energy: calculateEnergyScore(evidence).score,
    risk: calculateRiskScore(evidence).score,
    trendHold: calculateTrendHoldScore(evidence).score,
    energyDecay: calculateEnergyDecayScore(evidence).score,
  };
}

export function buildSignalStrategyV2Audit(signal: MarketSignal): StrategyV2Audit {
  const ignoredExternalInputs = signal.evidence.filter((point) =>
    bannedExternalEvidencePattern.test(`${point.label} ${point.value}`),
  );
  const evidence = [
    ...signal.evidence
      .filter((point) => !bannedExternalEvidencePattern.test(`${point.label} ${point.value}`))
      .map((point, index) => toEvidenceItem(signal, point, index)),
    ...syntheticEvidence(signal),
  ];
  const scores = scoresFor(evidence);
  const result = decideStrategy({
    evidence,
    scores,
    rewardRisk: signal.strategy.riskReward,
    structureInvalidated: signal.state === "invalidated",
    staleData: signal.state === "insufficient_data",
    hasHighTimeframeConflict: (signal.timeframeConflicts?.length ?? 0) > 0,
    ignoredExternalInputs: ignoredExternalInputs.map((point) => `${point.label}: ${point.value}`),
  });
  const report = generateChineseStrategyReport(result);

  return {
    canMutateLiveRanking: false,
    counterEvidenceIds: result.counterEvidenceIds,
    decision: result.decision,
    ignoredExternalInputs: result.ignoredExternalInputs,
    report,
    riskGate: result.riskGate,
    scores,
    stage: result.stage,
    supportEvidenceIds: result.supportEvidenceIds,
  };
}
