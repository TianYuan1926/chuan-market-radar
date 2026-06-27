import {
  analyzeMarketAnomaly,
  type MarketAnomalyInput,
  type StructureLocation,
} from "../analysis/anomaly-engine";
import {
  buildTechnicalEvidence,
} from "../analysis/technical-indicators";
import {
  buildTimeframeProfile,
  type TimeframeAlignment,
} from "../analysis/timeframe-profile";
import type {
  MarketRegime,
  MarketSignal,
  SignalDirection,
  Timeframe,
} from "../analysis/types";
import {
  buildSignalTrendRadarV3Dossier,
} from "../analysis/v3/current-signal-dossier";
import type {
  Candle,
} from "../market/ohlcv/types";
import {
  applySignalMaturity,
} from "../market/signal-maturity";

export type ProfessionalAuditLayer =
  | "data"
  | "scan"
  | "timing"
  | "structure"
  | "indicator"
  | "timeframe"
  | "derivatives"
  | "rr"
  | "plan"
  | "review";

export type ProfessionalAuditStatus =
  | "failed"
  | "partial"
  | "tested"
  | "unavailable";

export type ProfessionalAuditSeverity = "high" | "low" | "medium";

export type ProfessionalAuditCapability = {
  detail: string;
  layer: ProfessionalAuditLayer;
  status: ProfessionalAuditStatus;
};

export type ProfessionalAuditFinding = {
  detail: string;
  id: string;
  layer: ProfessionalAuditLayer;
  nextAction: string;
  rootCause: string;
  severity: ProfessionalAuditSeverity;
  title: string;
};

export type ProfessionalAuditRemediation = {
  acceptanceCriteria: string;
  action: string;
  canAutoApply: false;
  layer: ProfessionalAuditLayer;
  priority: "P0" | "P1" | "P2";
  targetModule: string;
};

export type ProfessionalAuditDerivativesInput = {
  fundingRateZScore?: number;
  openInterestChangePercent?: number;
  source?: "coinglass" | "public_exchange" | "unavailable";
  status: "live" | "partial" | "unavailable";
};

export type ProfessionalBacktestOutcome = {
  endedAt: string | null;
  firstEvent: "SL" | "TP" | "TIMEOUT" | "UNAVAILABLE";
  hit: boolean;
  maePct: number;
  mfePct: number;
  moveThresholdPct: number;
  returnPct: number;
};

export type ProfessionalBacktestAuditInput = {
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  derivatives?: ProfessionalAuditDerivativesInput;
  exchange?: string;
  futureCandles?: Candle[];
  marketRegime?: MarketRegime;
  moveThresholdPct?: number;
  observedAt: string;
  primaryTimeframe?: Timeframe;
  symbol: string;
};

export type ProfessionalBacktestAuditCase = {
  capabilities: ProfessionalAuditCapability[];
  findingCount: number;
  findings: ProfessionalAuditFinding[];
  inputSummary: {
    exchange: string;
    observedAt: string;
    primaryTimeframe: Timeframe;
    symbol: string;
    timeframes: Timeframe[];
  };
  outcome: ProfessionalBacktestOutcome | null;
  remediationPlan: ProfessionalAuditRemediation[];
  schemaVersion: "professional-backtest-audit.v2";
  signal: MarketSignal;
  summary: string;
};

export type ProfessionalBacktestRoundSummary = {
  cases: number;
  findingCounts: Record<ProfessionalAuditLayer, number>;
  highSeverityFindings: number;
  planReadyCount: number;
  testedCapabilities: number;
};

const timeframeOrder: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function percentChange(from: number, to: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) {
    return 0;
  }

  return ((to - from) / from) * 100;
}

function latest(candles: Candle[]) {
  return candles.at(-1) ?? null;
}

function tail(candles: Candle[], count: number) {
  return candles.slice(Math.max(0, candles.length - count));
}

function mean(values: number[]) {
  const clean = values.filter(Number.isFinite);

  if (clean.length === 0) {
    return 0;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function pickPrimaryTimeframe(
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
  preferred?: Timeframe,
): Timeframe {
  if (preferred && (candlesByTimeframe[preferred]?.length ?? 0) >= 20) {
    return preferred;
  }

  return timeframeOrder.find((timeframe) => (candlesByTimeframe[timeframe]?.length ?? 0) >= 20) ?? "15m";
}

function rangeStats(candles: Candle[]) {
  const high = candles.length > 0 ? Math.max(...candles.map((candle) => candle.high)) : 0;
  const low = candles.length > 0 ? Math.min(...candles.map((candle) => candle.low)) : 0;
  const current = latest(candles)?.close ?? 0;
  const widthPct = current > 0 ? percentChange(low, high) : 0;
  const closePosition = high > low && current > 0 ? ((current - low) / (high - low)) * 100 : 50;

  return {
    closePosition: round(closePosition),
    high,
    low,
    widthPct: round(widthPct),
  };
}

function directionFromCandles(candles: Candle[]): SignalDirection {
  const recent = tail(candles, Math.min(24, candles.length));

  if (recent.length < 2) {
    return "neutral";
  }

  const change = percentChange(recent[0].close, latest(recent)?.close ?? recent[0].close);
  const range = rangeStats(tail(candles, Math.min(96, candles.length)));
  const current = latest(recent);
  const upperWick = current ? Math.max(0, current.high - Math.max(current.open, current.close)) : 0;
  const lowerWick = current ? Math.max(0, Math.min(current.open, current.close) - current.low) : 0;
  const rejectionFromHigh = range.closePosition >= 82 && (change < 3 || upperWick > lowerWick * 1.35);
  const rejectionFromLow = range.closePosition <= 18 && (change > -3 || lowerWick > upperWick * 1.35);

  if (rejectionFromHigh) {
    return "short";
  }

  if (rejectionFromLow) {
    return "long";
  }

  if (change <= -1.2) {
    return "short";
  }

  if (change >= 1.2) {
    return "long";
  }

  if (range.closePosition <= 34) {
    return "long";
  }

  if (range.closePosition >= 66) {
    return "short";
  }

  return "neutral";
}

function structureLocationFor(direction: SignalDirection, closePosition: number): StructureLocation {
  if (direction === "neutral") {
    return "middle";
  }

  if (closePosition >= 78) {
    return direction === "long" ? "breakout_edge" : "resistance";
  }

  if (closePosition <= 22) {
    return direction === "short" ? "breakout_edge" : "support";
  }

  if (closePosition >= 62 || closePosition <= 38) {
    return "range_edge";
  }

  return "middle";
}

function volumeRatio(candles: Candle[]) {
  const recent = tail(candles, 4);
  const baseline = candles.slice(Math.max(0, candles.length - 100), Math.max(0, candles.length - 4));
  const baselineVolume = mean(baseline.map((candle) => candle.volume));

  if (baselineVolume <= 0) {
    return 1;
  }

  return mean(recent.map((candle) => candle.volume)) / baselineVolume;
}

function compressionPercentile(candles: Candle[]) {
  const recent = rangeStats(tail(candles, 32)).widthPct;
  const wider = rangeStats(tail(candles, 192)).widthPct;

  if (wider <= 0) {
    return 50;
  }

  return round(Math.max(0, Math.min(100, recent / wider * 100)));
}

function distanceModel({
  currentPrice,
  direction,
  range,
}: {
  currentPrice: number;
  direction: SignalDirection;
  range: ReturnType<typeof rangeStats>;
}) {
  if (direction === "short") {
    const invalidation = Math.max(0, range.high - currentPrice);
    const target = Math.max(0, currentPrice - range.low);

    return {
      distanceToInvalidationPercent: round(currentPrice > 0 ? invalidation / currentPrice * 100 : 0),
      projectedMovePercent: round(currentPrice > 0 ? target / currentPrice * 100 : 0),
    };
  }

  if (direction === "long") {
    const invalidation = Math.max(0, currentPrice - range.low);
    const target = Math.max(0, range.high - currentPrice);

    return {
      distanceToInvalidationPercent: round(currentPrice > 0 ? invalidation / currentPrice * 100 : 0),
      projectedMovePercent: round(currentPrice > 0 ? target / currentPrice * 100 : 0),
    };
  }

  return {
    distanceToInvalidationPercent: 0,
    projectedMovePercent: 0,
  };
}

function timeframeAlignment(direction: SignalDirection, changePct: number): TimeframeAlignment {
  if (Math.abs(changePct) < 0.6 || direction === "neutral") {
    return "neutral";
  }

  if ((direction === "long" && changePct > 0) || (direction === "short" && changePct < 0)) {
    return "support";
  }

  return "conflict";
}

function buildProfileFromCandles(
  direction: SignalDirection,
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
) {
  const frames = timeframeOrder.flatMap((timeframe) => {
    const candles = candlesByTimeframe[timeframe] ?? [];

    if (candles.length < 3) {
      return [];
    }

    const first = candles[0];
    const last = latest(candles);

    if (!first || !last) {
      return [];
    }

    const changePct = percentChange(first.close, last.close);

    return [{
      alignment: timeframeAlignment(direction, changePct),
      direction,
      note: `${timeframe} 历史回放窗口涨跌 ${round(changePct)}%。`,
      timeframe,
      weight: Math.min(100, Math.max(18, Math.abs(changePct) * 7)),
    }];
  });

  return buildTimeframeProfile(frames);
}

function buildAnomalyInput(input: ProfessionalBacktestAuditInput): MarketAnomalyInput {
  const primaryTimeframe = pickPrimaryTimeframe(input.candlesByTimeframe, input.primaryTimeframe);
  const primaryCandles = input.candlesByTimeframe[primaryTimeframe] ?? [];
  const current = latest(primaryCandles);

  if (!current) {
    throw new Error(`Professional audit requires candles for ${input.symbol}.`);
  }

  const direction = directionFromCandles(primaryCandles);
  const range = rangeStats(tail(primaryCandles, Math.min(96, primaryCandles.length)));
  const distance = distanceModel({
    currentPrice: current.close,
    direction,
    range,
  });

  return {
    dataQualityScore: primaryCandles.length >= 96 ? 0.92 : 0.7,
    directionBias: direction,
    distanceToInvalidationPercent: distance.distanceToInvalidationPercent,
    exchange: input.exchange ?? "historical-public",
    fundingRateZScore: input.derivatives?.fundingRateZScore ?? 0,
    id: `pba-${input.symbol}-${Date.parse(input.observedAt) || input.observedAt}`,
    indicatorEvidence: buildTechnicalEvidence(input.candlesByTimeframe),
    invalidationHint: direction === "short"
      ? `站回 ${range.high.toFixed(6)} 上方失效`
      : `跌破 ${range.low.toFixed(6)} 失效`,
    liquidationUsd24h: 0,
    marketContext: {
      anchor: "unknown",
      note: "专业回测 v2 首版未注入历史 BTC/ETH/TOTAL2/TOTAL3 宏观锚点。",
      regime: input.marketRegime ?? "unknown",
    },
    openInterestChangePercent: input.derivatives?.openInterestChangePercent ?? 0,
    priceChangePercent: round(percentChange(tail(primaryCandles, 96)[0]?.close ?? current.close, current.close)),
    projectedMovePercent: distance.projectedMovePercent,
    regime: input.marketRegime ?? "unknown",
    structureLocation: structureLocationFor(direction, range.closePosition),
    symbol: input.symbol,
    targetHints: direction === "short"
      ? [`第一目标 ${range.low.toFixed(6)}`]
      : [`第一目标 ${range.high.toFixed(6)}`],
    timeframe: primaryTimeframe,
    timeframeProfile: buildProfileFromCandles(direction, input.candlesByTimeframe),
    triggerHint: direction === "short"
      ? "等待跌破区间低点或反抽承压确认"
      : "等待突破区间高点或回踩承接确认",
    updatedAt: input.observedAt,
    volatilityCompressionPercentile: compressionPercentile(primaryCandles),
    volumeRatio: round(volumeRatio(primaryCandles), 2),
  };
}

function attachV3AndMaturity(
  signal: MarketSignal,
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>,
): MarketSignal {
  const dossier = buildSignalTrendRadarV3Dossier({
    candlesByTimeframe,
    signal,
  });
  const enriched = dossier
    ? {
      ...signal,
      strategyV3: dossier,
    }
    : signal;

  return applySignalMaturity(enriched);
}

function capability(
  layer: ProfessionalAuditLayer,
  status: ProfessionalAuditStatus,
  detail: string,
): ProfessionalAuditCapability {
  return {
    detail,
    layer,
    status,
  };
}

function finding({
  detail,
  id,
  layer,
  nextAction,
  rootCause,
  severity,
  title,
}: ProfessionalAuditFinding): ProfessionalAuditFinding {
  return {
    detail,
    id,
    layer,
    nextAction,
    rootCause,
    severity,
    title,
  };
}

function remediation(
  layer: ProfessionalAuditLayer,
  priority: "P0" | "P1" | "P2",
  targetModule: string,
  action: string,
  acceptanceCriteria: string,
): ProfessionalAuditRemediation {
  return {
    acceptanceCriteria,
    action,
    canAutoApply: false,
    layer,
    priority,
    targetModule,
  };
}

function buildCapabilities(
  input: ProfessionalBacktestAuditInput,
  signal: MarketSignal,
): ProfessionalAuditCapability[] {
  const timeframeCount = Object.values(input.candlesByTimeframe).filter((candles) => (candles?.length ?? 0) >= 3).length;
  const hasV3 = Boolean(signal.strategyV3);
  const rr = signal.strategyV3?.tradePlan?.rewardRisk ?? signal.strategy.riskReward ?? null;
  const derivativesStatus = input.derivatives?.status ?? "unavailable";
  const derivativesDetail = derivativesStatus === "live"
    ? "已注入历史 Funding 和 OI 字段。"
    : derivativesStatus === "partial"
      ? "已注入部分历史衍生品字段；只能辅助审计，不能当完整衍生品验证。"
      : "未注入历史 OI/Funding 数据。";

  return [
    capability("scan", "partial", "本轮审计输入来自历史样本，不等同于完整生产 universe 调度；只能审计单次回放点。"),
    capability("indicator", signal.evidence.some((item) => item.layer === "indicators") ? "tested" : "unavailable", "已通过生产 buildTechnicalEvidence 生成指标证据。"),
    capability("structure", hasV3 ? "tested" : "partial", hasV3 ? "已通过 v3 key levels / market reading 构建结构上下文。" : "v3 结构上下文不足。"),
    capability("timeframe", timeframeCount >= 3 ? "tested" : "partial", `本轮提供 ${timeframeCount} 个有效周期。`),
    capability("derivatives", derivativesStatus === "live" ? "tested" : derivativesStatus === "partial" ? "partial" : "unavailable", derivativesDetail),
    capability("rr", typeof rr === "number" ? "tested" : "partial", typeof rr === "number" ? `已生成结构 RR：${rr}:1。` : "未生成结构 RR。"),
    capability("plan", signal.maturity?.stage === "TRADE_PLAN_READY" ? "tested" : "partial", `当前成熟度：${signal.maturity?.label ?? "未分类"}。`),
  ];
}

function buildFindings(
  input: ProfessionalBacktestAuditInput,
  signal: MarketSignal,
  outcome: ProfessionalBacktestOutcome | null,
): ProfessionalAuditFinding[] {
  const findings: ProfessionalAuditFinding[] = [];
  const rr = signal.strategyV3?.tradePlan?.rewardRisk ?? signal.strategy.riskReward ?? null;

  if ((input.derivatives?.status ?? "unavailable") === "unavailable") {
    findings.push(finding({
      detail: "本轮无法验证 OI、Funding、多空拥挤是否提高了信号质量。",
      id: "PBA-DERIVATIVES-001",
      layer: "derivatives",
      nextAction: "接入 CoinGlass 或公开交易所历史 OI/Funding 后重新跑同一批样本。",
      rootCause: "历史衍生品数据未注入专业回测样本。",
      severity: "medium",
      title: "历史衍生品证据缺失",
    }));
  }

  if (!signal.strategyV3) {
    findings.push(finding({
      detail: "本轮没有生成 v3 关键位、结构上下文和交易计划，无法审计结构推理。",
      id: "PBA-STRUCTURE-001",
      layer: "structure",
      nextAction: "为回测样本提供至少 15m/1h/4h 多周期 OHLCV，并复用 v3 dossier。",
      rootCause: "多周期 K 线不足或关键位生成失败。",
      severity: "high",
      title: "结构审计上下文不足",
    }));
  }

  if (typeof rr !== "number" || rr < 3) {
    findings.push(finding({
      detail: typeof rr === "number"
        ? `当前结构 RR ${rr}:1 低于最低 3:1。`
        : "本轮无法得到结构 RR。",
      id: "PBA-RR-001",
      layer: "rr",
      nextAction: "把该样本归入等待更好位置或结构目标缺失，不允许进入交易计划就绪。",
      rootCause: "结构止损、目标距离或当前位置不支持高赔率。",
      severity: "high",
      title: "风险赔率未通过",
    }));
  }

  if (signal.maturity?.stage !== "TRADE_PLAN_READY") {
    findings.push(finding({
      detail: `当前成熟度为 ${signal.maturity?.label ?? "未分类"}，不能当作狙击榜交易计划。`,
      id: "PBA-PLAN-001",
      layer: "plan",
      nextAction: "前端和回测报告必须把候选、证据信号、交易计划分开展示。",
      rootCause: "证据链或风险门控尚未满足交易计划就绪。",
      severity: "medium",
      title: "信号未达到交易计划就绪",
    }));
  }

  if (outcome?.firstEvent === "SL") {
    findings.push(finding({
      detail: `未来窗口先触发结构止损，MFE ${outcome.mfePct}%，MAE ${outcome.maePct}%。`,
      id: "PBA-REVIEW-001",
      layer: "review",
      nextAction: "复查该类信号的入场触发、结构止损和反证门控。",
      rootCause: "信号放行后优先命中失效条件。",
      severity: "high",
      title: "历史结果先触发止损",
    }));
  }

  return findings;
}

function firstEvent(
  direction: SignalDirection,
  futureCandles: Candle[],
  stop: number | null | undefined,
  target: number | null | undefined,
): ProfessionalBacktestOutcome["firstEvent"] {
  if (futureCandles.length === 0) {
    return "UNAVAILABLE";
  }

  if (typeof stop !== "number" || typeof target !== "number" || stop <= 0 || target <= 0) {
    return "TIMEOUT";
  }

  for (const candle of futureCandles) {
    if (direction === "short") {
      if (candle.high >= stop) {
        return "SL";
      }

      if (candle.low <= target) {
        return "TP";
      }
    } else {
      if (candle.low <= stop) {
        return "SL";
      }

      if (candle.high >= target) {
        return "TP";
      }
    }
  }

  return "TIMEOUT";
}

export function evaluateProfessionalOutcome(
  signal: MarketSignal,
  futureCandles: Candle[],
  moveThresholdPct = 10,
): ProfessionalBacktestOutcome | null {
  const currentPrice = signal.strategyV3?.currentPrice;
  const tradePlan = signal.strategyV3?.tradePlan;

  if (!currentPrice || currentPrice <= 0 || futureCandles.length === 0 || signal.direction === "neutral" || !tradePlan) {
    return null;
  }

  const futureHigh = Math.max(...futureCandles.map((candle) => candle.high));
  const futureLow = Math.min(...futureCandles.map((candle) => candle.low));
  const futureClose = latest(futureCandles)?.close ?? currentPrice;
  const mfePct = signal.direction === "short"
    ? Math.max(0, (currentPrice - futureLow) / currentPrice * 100)
    : Math.max(0, (futureHigh - currentPrice) / currentPrice * 100);
  const maePct = signal.direction === "short"
    ? Math.max(0, (futureHigh - currentPrice) / currentPrice * 100)
    : Math.max(0, (currentPrice - futureLow) / currentPrice * 100);
  const returnPct = signal.direction === "short"
    ? (currentPrice - futureClose) / currentPrice * 100
    : (futureClose - currentPrice) / currentPrice * 100;
  const target = tradePlan.targets[0] ?? tradePlan.targets.at(-1) ?? null;

  return {
    endedAt: latest(futureCandles)?.openTime ?? null,
    firstEvent: firstEvent(
      signal.direction,
      futureCandles,
      tradePlan.structuralStop,
      target,
    ),
    hit: mfePct >= moveThresholdPct,
    maePct: round(maePct),
    mfePct: round(mfePct),
    moveThresholdPct,
    returnPct: round(returnPct),
  };
}

function buildRemediations(findings: ProfessionalAuditFinding[]) {
  const byLayer = new Set(findings.map((item) => item.layer));
  const actions: ProfessionalAuditRemediation[] = [];

  if (byLayer.has("derivatives")) {
    actions.push(remediation(
      "derivatives",
      "P0",
      "historical derivatives adapters",
      "补齐 CoinGlass/public futures 历史 OI、Funding 和多空拥挤数据，并在报告中区分 coinglass 与 public_exchange。",
      "同一批样本重新回测时，derivatives capability 不能再是 unavailable。",
    ));
  }

  if (byLayer.has("structure") || byLayer.has("timeframe")) {
    actions.push(remediation(
      "structure",
      "P0",
      "v3 dossier historical adapter",
      "为历史样本提供 15m/1h/4h/1d 多周期 OHLCV，强制调用 v3 key level、market reading、trend context。",
      "报告至少输出结构状态、关键位、冲突周期和结构阻断案例。",
    ));
  }

  if (byLayer.has("rr") || byLayer.has("plan")) {
    actions.push(remediation(
      "rr",
      "P0",
      "strategy v3 trade plan audit",
      "把低于 3:1、缺止损、缺目标、追涨追跌的样本全部归类，禁止进入计划就绪统计。",
      "TRADE_PLAN_READY 样本必须全部具有结构止损、目标、RR 和失效条件。",
    ));
  }

  if (byLayer.has("review")) {
    actions.push(remediation(
      "review",
      "P1",
      "outcome attribution",
      "对先触发止损、超时和迟到信号做归因统计，输出下一轮规则调整建议。",
      "每轮报告必须包含失败归因 Top 问题和整改验收指标。",
    ));
  }

  return actions;
}

export function buildProfessionalBacktestAuditCase(
  input: ProfessionalBacktestAuditInput,
): ProfessionalBacktestAuditCase {
  const anomalyInput = buildAnomalyInput(input);
  const signal = attachV3AndMaturity(
    analyzeMarketAnomaly(anomalyInput),
    input.candlesByTimeframe,
  );
  const outcome = input.futureCandles
    ? evaluateProfessionalOutcome(signal, input.futureCandles, input.moveThresholdPct)
    : null;
  const capabilities = buildCapabilities(input, signal);
  const findings = buildFindings(input, signal, outcome);

  return {
    capabilities,
    findingCount: findings.length,
    findings,
    inputSummary: {
      exchange: input.exchange ?? "historical-public",
      observedAt: input.observedAt,
      primaryTimeframe: anomalyInput.timeframe,
      symbol: input.symbol,
      timeframes: timeframeOrder.filter((timeframe) => (input.candlesByTimeframe[timeframe]?.length ?? 0) > 0),
    },
    outcome,
    remediationPlan: buildRemediations(findings),
    schemaVersion: "professional-backtest-audit.v2",
    signal,
    summary: `${input.symbol} 专业回测审计：成熟度 ${signal.maturity?.label ?? "未分类"}，发现 ${findings.length} 个问题。`,
  };
}

export function summarizeProfessionalBacktestRound(
  cases: ProfessionalBacktestAuditCase[],
): ProfessionalBacktestRoundSummary {
  const layers: ProfessionalAuditLayer[] = ["data", "scan", "timing", "structure", "indicator", "timeframe", "derivatives", "rr", "plan", "review"];
  const findingCounts = Object.fromEntries(layers.map((layer) => [layer, 0])) as Record<ProfessionalAuditLayer, number>;
  let highSeverityFindings = 0;

  for (const item of cases) {
    for (const current of item.findings) {
      findingCounts[current.layer] += 1;

      if (current.severity === "high") {
        highSeverityFindings += 1;
      }
    }
  }

  return {
    cases: cases.length,
    findingCounts,
    highSeverityFindings,
    planReadyCount: cases.filter((item) => item.signal.maturity?.stage === "TRADE_PLAN_READY").length,
    testedCapabilities: cases.reduce(
      (count, item) => count + item.capabilities.filter((cap) => cap.status === "tested").length,
      0,
    ),
  };
}
