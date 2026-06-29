import type {
  Candle,
} from "../market/ohlcv/types";
import type {
  Timeframe,
} from "../analysis/types";
import {
  buildProfessionalBacktestAuditCase,
  summarizeProfessionalBacktestRound,
  type ProfessionalAuditDerivativesInput,
  type ProfessionalAuditFinding,
  type ProfessionalAuditRemediation,
  type ProfessionalBacktestAuditCase,
} from "./professional-audit";
import type {
  ProfessionalAuditRoundProgress,
} from "./professional-audit-round";

export type ProfessionalReplayOptions = {
  horizonBars?: number;
  maxCasesInReport?: number;
  moveThresholdPct?: number;
  stepBars?: number;
  topN?: number;
};

export type ProfessionalReplayInput = {
  baseInterval: Extract<Timeframe, "15m">;
  candlesBySymbol: Map<string, Candle[]>;
  derivativesBySymbol?: Map<string, ProfessionalDerivativePoint[]>;
  generatedAt?: string;
  options?: ProfessionalReplayOptions;
};

export type ProfessionalDerivativePoint = {
  fundingRate?: number;
  observedAt: string;
  openInterestUsd?: number;
  source: "coinglass" | "public_exchange";
};

export type ProfessionalReplayLaneName = "momentum" | "radar" | "random" | "volume";

export type ProfessionalAuditOpportunityLaneName =
  | "early_setup"
  | "higher_timeframe_context"
  | "pullback_retest"
  | "risk_review";

export type ProfessionalReplayLaneMetric = {
  avgConfidence: number;
  avgMaePct: number;
  avgMfePct: number;
  avgMoveAtSelectionPct: number;
  avgVolumeRatio: number;
  count: number;
  earlyHitCount: number;
  earlyHitRatePct: number;
  hitCount: number;
  hitRatePct: number;
  lane: ProfessionalReplayLaneName;
  lateCount: number;
  lateRatePct: number;
  qualityScore: number;
};

export type ProfessionalReplayTimingMetrics = {
  earlyCount: number;
  earlyRatePct: number;
  lateCount: number;
  lateRatePct: number;
  noPlanCount: number;
  planReadyCount: number;
};

export type ProfessionalAuditOpportunityLaneMetric = {
  avgRadarRank: number | null;
  avgRadarScore: number;
  captureRatePct: number;
  capturedCount: number;
  hitCount: number;
  hitRatePct: number;
  label: string;
  lane: ProfessionalAuditOpportunityLaneName;
  lateCount: number;
  lateRatePct: number;
  missedEarlyHitCount: number;
  missedEarlyQualityHitCount: number;
  planReadyCount: number;
  qualityHitCount: number;
  qualityHitRatePct: number;
  selectedCount: number;
  totalNodes: number;
};

export type ProfessionalAuditPlanBlockerMetric = {
  blocker: string;
  count: number;
  label: string;
  sampleSymbols: string[];
};

export type ProfessionalAuditWaitPlanEvaluationStatus =
  | "missing_plan_levels"
  | "not_triggered"
  | "not_wait_plan"
  | "triggered_sl_first"
  | "triggered_timeout"
  | "triggered_tp_first";

export type ProfessionalAuditWaitPlanEvaluation = {
  barsToTrigger: number | null;
  label: string;
  maxAdverseAfterTriggerPct: number | null;
  maxFavorableAfterTriggerPct: number | null;
  outcome: "bad_wait" | "inconclusive" | "no_trade" | "not_applicable" | "useful_wait";
  reason: string;
  status: ProfessionalAuditWaitPlanEvaluationStatus;
  stopHit: boolean;
  targetHit: boolean;
  triggerObservedAt: string | null;
  triggerPrice: number | null;
};

export type ProfessionalAuditWaitPlanMetric = {
  badWaitRatePct: number;
  label: string;
  missingLevelCount: number;
  noTradeRatePct: number;
  notTriggeredCount: number;
  stopFirstCount: number;
  targetFirstCount: number;
  timeoutCount: number;
  totalWaitPlans: number;
  triggeredCount: number;
  usefulWaitRatePct: number;
};

export type ProfessionalAuditPressureTestMetric = {
  captureRatePct: number;
  earlyCaptureRatePct: number;
  label: string;
  missedEarlyQualityHitCount: number;
  qualityHitRatePct: number;
  selectedCount: number;
  topN: number;
  universePressurePct: number;
};

export type ProfessionalAuditMarketRegimeMetric = {
  avgRadarRank: number | null;
  captureRatePct: number;
  label: string;
  lateRatePct: number;
  qualityHitRatePct: number;
  regime: string;
  sampleSymbols: string[];
  totalNodes: number;
};

export type ProfessionalAuditRuleStabilityMetric = {
  blocker: string;
  label: string;
  missedQualityHitCount: number;
  occurrenceCount: number;
  sampleSymbols: string[];
  selectedUsefulCount: number;
  stabilityScore: number;
  status: "stable" | "unstable" | "watch";
};

export type ProfessionalCoreCapabilityId = "analysis" | "scan" | "strategy";

export type ProfessionalAuditMode = "analysis" | "full" | "scan" | "strategy";

export type ProfessionalCoreCapabilityStatus = "fail" | "pass" | "watch";

export type ProfessionalJudgeSystemLaneId =
  | "analysis_audit"
  | "formal_audit"
  | "golden_cases"
  | "scan_audit"
  | "shadow_live"
  | "strategy_audit";

export type ProfessionalJudgeSystemLane = {
  id: ProfessionalJudgeSystemLaneId;
  label: string;
  source: string;
  status: "fail" | "pass" | "waiting" | "watch";
  summary: string;
  updatedAt?: string;
};

export type ProfessionalJudgeSystemSnapshot = {
  guardrails: string[];
  lanes: ProfessionalJudgeSystemLane[];
  schemaVersion: "core-judge-system.v1";
  statusLabel: "不能支撑实战" | "可运行但不完整" | "完整完成" | "等待外部条件" | "临时验证版";
  summary: string;
};

export type ProfessionalCoreCapabilityFailure = {
  code: string;
  count: number;
  detail: string;
  label: string;
  nextAction: string;
  sampleSymbols: string[];
};

export type ProfessionalCoreCapabilityMetric = {
  failedNodes: number;
  id: ProfessionalCoreCapabilityId;
  keyMetrics: Record<string, number | string | null>;
  label: string;
  mainFailures: ProfessionalCoreCapabilityFailure[];
  nextAction: string;
  passedNodes: number;
  passRatePct: number;
  score: number;
  status: ProfessionalCoreCapabilityStatus;
  summary: string;
  testedNodes: number;
};

export type ProfessionalReplayMissedOpportunity = {
  coinType?: string;
  coinTypeLabel?: string;
  confidence: number;
  direction: "long" | "short";
  maePct: number;
  mfePct: number;
  moveAtSelectionPct: number;
  nodeRole?: string;
  observedAt: string;
  opportunityLane?: ProfessionalAuditOpportunityLaneName;
  opportunityLaneLabel?: string;
  planBlockers?: string[];
  radarRank?: number | null;
  reason: string;
  rewardRisk?: number | null;
  symbol: string;
  timeframeBand?: string;
  tradePlanStatus?: string;
  validationWindowLabel?: string;
  volumeRatio: number;
};

export type ProfessionalReplayReport = {
  auditMode?: ProfessionalAuditMode;
  auditRound?: ProfessionalAuditRoundProgress;
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  cases: ProfessionalBacktestAuditCase[];
  findings: ProfessionalAuditFinding[];
  generatedAt: string;
  guardrails: string[];
  input: {
    baseInterval: Timeframe;
    derivativesSymbolsUsed: number;
    horizonBars: number;
    replayTimes: number;
    symbolsUsed: string[];
    topN: number;
  };
  judgeSystem?: ProfessionalJudgeSystemSnapshot;
  missedOpportunities: ProfessionalReplayMissedOpportunity[];
  coreCapabilityMetrics: ProfessionalCoreCapabilityMetric[];
  opportunityLaneMetrics: ProfessionalAuditOpportunityLaneMetric[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
  waitPlanMetrics: ProfessionalAuditWaitPlanMetric;
  pressureTestMetrics: ProfessionalAuditPressureTestMetric[];
  marketRegimeMetrics: ProfessionalAuditMarketRegimeMetric[];
  ruleStabilityMetrics: ProfessionalAuditRuleStabilityMetric[];
  remediationPlan: ProfessionalAuditRemediation[];
  roundSummary: ReturnType<typeof summarizeProfessionalBacktestRound>;
  schemaVersion: "professional-backtest-audit-report.v2";
  summary: string;
  timingMetrics: ProfessionalReplayTimingMetrics;
};

const defaultOptions = {
  horizonBars: 96,
  maxCasesInReport: 200,
  moveThresholdPct: 10,
  stepBars: 4,
  topN: 20,
};

function normalizeOptions(options?: ProfessionalReplayOptions) {
  return {
    horizonBars: Math.max(1, Math.round(options?.horizonBars ?? defaultOptions.horizonBars)),
    maxCasesInReport: Math.max(1, Math.round(options?.maxCasesInReport ?? defaultOptions.maxCasesInReport)),
    moveThresholdPct: Math.max(0.1, options?.moveThresholdPct ?? defaultOptions.moveThresholdPct),
    stepBars: Math.max(1, Math.round(options?.stepBars ?? defaultOptions.stepBars)),
    topN: Math.max(1, Math.round(options?.topN ?? defaultOptions.topN)),
  };
}

function aggregateCandles(candles: Candle[], groupSize: number): Candle[] {
  const aggregated: Candle[] = [];

  for (let index = 0; index + groupSize <= candles.length; index += groupSize) {
    const group = candles.slice(index, index + groupSize);
    const first = group[0];
    const last = group.at(-1);

    if (!first || !last) {
      continue;
    }

    aggregated.push({
      close: last.close,
      closeTime: last.closeTime,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      open: first.open,
      openTime: first.openTime,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0),
    });
  }

  return aggregated;
}

export function buildReplayCandlesByTimeframe(baseCandles: Candle[]): Partial<Record<Timeframe, Candle[]>> {
  return {
    "15m": baseCandles,
    "1h": aggregateCandles(baseCandles, 4),
    "4h": aggregateCandles(baseCandles, 16),
    "1d": aggregateCandles(baseCandles, 96),
  };
}

function commonReplayIndexes(candlesBySymbol: Map<string, Candle[]>, options: ReturnType<typeof normalizeOptions>) {
  const maxLength = Math.max(...[...candlesBySymbol.values()].map((candles) => candles.length), 0);
  const minHistory = 96;
  const indexes: number[] = [];

  for (let index = minHistory; index < maxLength - options.horizonBars; index += options.stepBars) {
    const available = [...candlesBySymbol.values()].filter((candles) => candles[index]?.openTime).length;

    if (available >= Math.max(2, Math.floor(candlesBySymbol.size * 0.4))) {
      indexes.push(index);
    }
  }

  return indexes;
}

function uniqueRemediations(cases: ProfessionalBacktestAuditCase[]) {
  const seen = new Set<string>();
  const remediations: ProfessionalAuditRemediation[] = [];

  for (const item of cases) {
    for (const remediation of item.remediationPlan) {
      const key = `${remediation.layer}:${remediation.targetModule}:${remediation.action}`;

      if (!seen.has(key)) {
        seen.add(key);
        remediations.push(remediation);
      }
    }
  }

  return remediations.sort((left, right) => left.priority.localeCompare(right.priority));
}

function sortFindings(findings: ProfessionalAuditFinding[]) {
  const severityWeight = { high: 3, medium: 2, low: 1 };
  const aggregateWeight = (finding: ProfessionalAuditFinding) =>
    finding.id.startsWith("PBA-SCAN-BASELINE") ||
    finding.id.startsWith("PBA-TIMING-LATE") ||
    finding.id.startsWith("PBA-SCAN-MISSED")
      ? 1
      : 0;

  return findings
    .sort((left, right) =>
      severityWeight[right.severity] - severityWeight[left.severity] ||
      aggregateWeight(right) - aggregateWeight(left) ||
      left.id.localeCompare(right.id)
    );
}

function topFindings(cases: ProfessionalBacktestAuditCase[]) {
  return sortFindings(cases.flatMap((item) => item.findings));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundNumber(value: number, digits = 2) {
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

function mean(values: number[]) {
  const clean = values.filter(Number.isFinite);

  if (clean.length === 0) {
    return 0;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function replayVolumeRatio(history: Candle[]) {
  const recent = history.slice(Math.max(0, history.length - 4));
  const baseline = history.slice(Math.max(0, history.length - 100), Math.max(0, history.length - 4));
  const baselineVolume = mean(baseline.map((candle) => candle.volume));

  if (baselineVolume <= 0) {
    return 1;
  }

  return mean(recent.map((candle) => candle.volume)) / baselineVolume;
}

function moveAtSelectionPct(history: Candle[]) {
  const current = history.at(-1);
  const past = history.at(Math.max(0, history.length - 97));

  if (!current || !past) {
    return 0;
  }

  return percentChange(past.close, current.close);
}

function rangePositionPct(history: Candle[]) {
  const window = history.slice(Math.max(0, history.length - 96));
  const current = window.at(-1);

  if (!current || window.length === 0) {
    return 50;
  }

  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));

  if (high <= low) {
    return 50;
  }

  return ((current.close - low) / (high - low)) * 100;
}

function deterministicRandomScore(symbol: string, observedAt: string) {
  const source = `${symbol}:${observedAt}`;
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0xffffffff;
}

function replayDirection(item: ProfessionalBacktestAuditCase, movePct: number): "long" | "short" {
  if (item.signal.direction === "short") {
    return "short";
  }

  if (item.signal.direction === "long") {
    return "long";
  }

  return movePct < 0 ? "short" : "long";
}

function replayOutcome({
  direction,
  entry,
  future,
  moveThresholdPct,
}: {
  direction: "long" | "short";
  entry: number;
  future: Candle[];
  moveThresholdPct: number;
}) {
  let mfePct = 0;
  let maePct = 0;
  let firstEvent: "ADVERSE" | "MOVE" | "TIMEOUT" = "TIMEOUT";

  for (const candle of future) {
    const favorable = direction === "long"
      ? percentChange(entry, candle.high)
      : percentChange(candle.low, entry);
    const adverse = direction === "long"
      ? percentChange(candle.low, entry)
      : percentChange(entry, candle.high);

    mfePct = Math.max(mfePct, favorable);
    maePct = Math.max(maePct, adverse);

    if (firstEvent === "TIMEOUT" && favorable >= moveThresholdPct) {
      firstEvent = "MOVE";
    }

    if (firstEvent === "TIMEOUT" && adverse >= moveThresholdPct / 2) {
      firstEvent = "ADVERSE";
    }
  }

  return {
    firstEvent,
    hit: mfePct >= moveThresholdPct,
    maePct: roundNumber(maePct),
    mfePct: roundNumber(mfePct),
  };
}

function isLateAtSelection(movePct: number, positionPct: number, direction: "long" | "short", moveThresholdPct: number) {
  const extendedMove = Math.abs(movePct) >= Math.max(6, moveThresholdPct * 0.7);
  const extendedLocation = direction === "long" ? positionPct >= 88 : positionPct <= 12;

  return extendedMove || extendedLocation;
}

type ProfessionalReplayCandidate = {
  case: ProfessionalBacktestAuditCase;
  direction: "long" | "short";
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  mfePct: number;
  movePct: number;
  observedAt: string;
  randomScore: number;
  volumeRatio: number;
};

type ProfessionalReplaySelection = {
  confidence: number;
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  mfePct: number;
  movePct: number;
  symbol: string;
  volumeRatio: number;
};

function laneSelection(candidate: ProfessionalReplayCandidate): ProfessionalReplaySelection {
  return {
    confidence: candidate.case.signal.confidence,
    hit: candidate.hit,
    lateAtSelection: candidate.lateAtSelection,
    maePct: candidate.maePct,
    mfePct: candidate.mfePct,
    movePct: Math.abs(candidate.movePct),
    symbol: candidate.case.inputSummary.symbol,
    volumeRatio: candidate.volumeRatio,
  };
}

function emptyLaneMetric(lane: ProfessionalReplayLaneName): ProfessionalReplayLaneMetric {
  return {
    avgConfidence: 0,
    avgMaePct: 0,
    avgMfePct: 0,
    avgMoveAtSelectionPct: 0,
    avgVolumeRatio: 0,
    count: 0,
    earlyHitCount: 0,
    earlyHitRatePct: 0,
    hitCount: 0,
    hitRatePct: 0,
    lane,
    lateCount: 0,
    lateRatePct: 0,
    qualityScore: 0,
  };
}

function summarizeLane(lane: ProfessionalReplayLaneName, selections: ProfessionalReplaySelection[]): ProfessionalReplayLaneMetric {
  if (selections.length === 0) {
    return emptyLaneMetric(lane);
  }

  const hitCount = selections.filter((item) => item.hit).length;
  const lateCount = selections.filter((item) => item.lateAtSelection).length;
  const earlySelections = selections.filter((item) => !item.lateAtSelection);
  const earlyHitCount = earlySelections.filter((item) => item.hit).length;
  const hitRatePct = roundNumber((hitCount / selections.length) * 100);
  const lateRatePct = roundNumber((lateCount / selections.length) * 100);
  const earlyHitRatePct = earlySelections.length > 0 ? roundNumber((earlyHitCount / earlySelections.length) * 100) : 0;
  const avgMfePct = roundNumber(mean(selections.map((item) => item.mfePct)));
  const avgMaePct = roundNumber(mean(selections.map((item) => item.maePct)));
  const avgMoveAtSelectionPct = roundNumber(mean(selections.map((item) => item.movePct)));
  const qualityScore = roundNumber(
    hitRatePct +
    earlyHitRatePct * 0.7 +
    avgMfePct * 0.35 -
    avgMaePct * 0.45 -
    lateRatePct * 0.35 -
    avgMoveAtSelectionPct * 0.15,
  );

  return {
    avgConfidence: roundNumber(mean(selections.map((item) => item.confidence))),
    avgMaePct,
    avgMfePct,
    avgMoveAtSelectionPct,
    avgVolumeRatio: roundNumber(mean(selections.map((item) => item.volumeRatio))),
    count: selections.length,
    earlyHitCount,
    earlyHitRatePct,
    hitCount,
    hitRatePct,
    lane,
    lateCount,
    lateRatePct,
    qualityScore,
  };
}

function aggregateRoundSummary(
  base: ReturnType<typeof summarizeProfessionalBacktestRound>,
  aggregateFindings: ProfessionalAuditFinding[],
) {
  const findingCounts = { ...base.findingCounts };

  for (const finding of aggregateFindings) {
    findingCounts[finding.layer] += 1;
  }

  return {
    ...base,
    findingCounts,
    highSeverityFindings: base.highSeverityFindings + aggregateFindings.filter((item) => item.severity === "high").length,
  };
}

function aggregateFinding({
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

function buildAggregateFindings({
  baselineMetrics,
  missedOpportunities,
  timingMetrics,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  missedOpportunities: ProfessionalReplayMissedOpportunity[];
  timingMetrics: ProfessionalReplayTimingMetrics;
}) {
  const findings: ProfessionalAuditFinding[] = [];
  const radar = baselineMetrics.radar;
  const momentum = baselineMetrics.momentum;
  const random = baselineMetrics.random;

  if (radar.count === 0) {
    findings.push(aggregateFinding({
      detail: "专业回测 v2 没有形成 radar lane 样本，无法判断系统是否具备筛选优势。",
      id: "PBA-SCAN-BASELINE-000",
      layer: "data",
      nextAction: "扩大 days、max-symbols 或降低 minHistoryBars，先让 v2 形成足够样本。",
      rootCause: "历史 K 线覆盖或回放参数不足。",
      severity: "high",
      title: "专业回测样本不足",
    }));
  }

  if (radar.count > 0 && radar.hitRatePct < 8) {
    findings.push(aggregateFinding({
      detail: `radar 原始命中率 ${radar.hitRatePct}%，提前命中率 ${radar.earlyHitRatePct}%，质量分 ${radar.qualityScore}。这说明系统虽然可能更早、更少追涨，但绝对捕捉强度仍不足。`,
      id: "PBA-SCAN-HIT-001",
      layer: "scan",
      nextAction: "强化量能刚启动、主动买卖压力、关键位靠近和相对强弱特征。",
      rootCause: "当前雷达排序对后续可观波动的识别强度不足。",
      severity: "high",
      title: "雷达绝对命中率不足",
    }));
  }

  if (radar.count > 0 && random.count > 0 && radar.qualityScore <= random.qualityScore) {
    findings.push(aggregateFinding({
      detail: `radar 质量分=${radar.qualityScore}，random 质量分=${random.qualityScore}。这说明当前雷达暂时没有证明自己比随机选币更强。`,
      id: "PBA-SCAN-BASELINE-001",
      layer: "scan",
      nextAction: "优先检查候选排序、提前性特征、过度追涨拦截和深扫晋级规则。",
      rootCause: "扫描排序没有形成可验证优势，或样本太少导致优势不可证明。",
      severity: "high",
      title: "雷达没有跑赢随机基线",
    }));
  }

  if (radar.count > 0 && momentum.count > 0 && radar.qualityScore <= momentum.qualityScore) {
    findings.push(aggregateFinding({
      detail: `radar 质量分=${radar.qualityScore}，momentum 质量分=${momentum.qualityScore}。如果长期如此，系统更像追涨榜过滤器，不是提前发现雷达。`,
      id: "PBA-SCAN-BASELINE-002",
      layer: "scan",
      nextAction: "提高压缩、量能启动、相对强弱和低位关键位权重，降低已大涨大跌样本排序权重。",
      rootCause: "提前发现特征没有稳定跑赢简单动量榜。",
      severity: "medium",
      title: "雷达没有跑赢动量基线",
    }));
  }

  if (timingMetrics.lateRatePct >= 35) {
    findings.push(aggregateFinding({
      detail: `迟到率 ${timingMetrics.lateRatePct}%。这类信号即使方向对，也可能已经错过好位置。`,
      id: "PBA-TIMING-LATE-001",
      layer: "timing",
      nextAction: "把已涨/已跌过大的样本降级为 REVIEW_ONLY，强化启动前压缩和成交量累积样本。",
      rootCause: "信号生成时价格已经偏离启动区间。",
      severity: timingMetrics.lateRatePct >= 50 ? "high" : "medium",
      title: "雷达选中样本偏晚",
    }));
  }

  if (missedOpportunities.length > 0) {
    findings.push(aggregateFinding({
      detail: `本轮发现 ${missedOpportunities.length} 个未被 radar topN 选中的可学习机会样本。`,
      id: "PBA-SCAN-MISSED-001",
      layer: "review",
      nextAction: "把漏判样本接入复盘进化，逐个归因是覆盖率、排序、深扫槽位还是结构门控问题。",
      rootCause: "候选池排序或槽位轮换没有覆盖部分事前可学习机会。",
      severity: "medium",
      title: "存在漏判机会样本",
    }));
  }

  return findings;
}

function aggregateRemediations(findings: ProfessionalAuditFinding[]) {
  const remediations: ProfessionalAuditRemediation[] = [];

  if (findings.some((item) => item.id.startsWith("PBA-SCAN-BASELINE"))) {
    remediations.push({
      acceptanceCriteria: "同一批样本重跑时，radar lane 的质量分必须高于 random，并持续追踪原始命中率、提前命中率和是否高于 momentum。",
      action: "重整候选排序和提前性特征，把压缩、量能累积、相对强弱、低位关键位加入优先级审计。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "professional replay baseline comparison",
    });
  }

  if (findings.some((item) => item.id === "PBA-TIMING-LATE-001")) {
    remediations.push({
      acceptanceCriteria: "专业回测 v2 lateRatePct 连续样本低于 35%，且过度追涨样本不进入 TRADE_PLAN_READY。",
      action: "强化 late move gate，已明显涨跌后的样本只做复盘观察，不输出计划就绪。",
      canAutoApply: false,
      layer: "timing",
      priority: "P0",
      targetModule: "timing gate and maturity downgrade",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-MISSED-001")) {
    remediations.push({
      acceptanceCriteria: "漏判样本在复盘页可见，并能归因到覆盖率、排序、深扫槽位或结构门控。",
      action: "把 v2 missed opportunities 写入报告合同，作为下一轮扫描规则校准样本。",
      canAutoApply: false,
      layer: "review",
      priority: "P1",
      targetModule: "missed opportunity calibration",
    });
  }

  return remediations;
}

function sortDerivativePoints(points: ProfessionalDerivativePoint[] = []) {
  return [...points]
    .filter((point) => Number.isFinite(Date.parse(point.observedAt)))
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

function latestDerivativePointAt(points: ProfessionalDerivativePoint[], observedMs: number, field: "fundingRate" | "openInterestUsd") {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];

    if (!point) {
      continue;
    }

    const timestamp = Date.parse(point.observedAt);

    if (timestamp <= observedMs && isFiniteNumber(point[field])) {
      return point;
    }
  }

  return null;
}

function previousOpenInterestPoint(points: ProfessionalDerivativePoint[], observedMs: number, currentMs: number) {
  const preferredCutoff = observedMs - 24 * 60 * 60_000;
  let fallback: ProfessionalDerivativePoint | null = null;

  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];

    if (!point || !isFiniteNumber(point.openInterestUsd)) {
      continue;
    }

    const timestamp = Date.parse(point.observedAt);

    if (timestamp >= currentMs || timestamp > observedMs) {
      continue;
    }

    if (!fallback) {
      fallback = point;
    }

    if (timestamp <= preferredCutoff) {
      return point;
    }
  }

  return fallback;
}

function fundingZScore(points: ProfessionalDerivativePoint[], current: ProfessionalDerivativePoint, observedMs: number) {
  if (!isFiniteNumber(current.fundingRate)) {
    return undefined;
  }

  const currentMs = Date.parse(current.observedAt);
  const samples = points
    .filter((point) => {
      const timestamp = Date.parse(point.observedAt);

      return timestamp <= observedMs &&
        timestamp < currentMs &&
        isFiniteNumber(point.fundingRate);
    })
    .slice(-30)
    .map((point) => point.fundingRate as number);

  if (samples.length < 3) {
    return Number((current.fundingRate * 10_000).toFixed(2));
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const deviation = Math.sqrt(variance);

  if (deviation <= 0) {
    return 0;
  }

  return Number(((current.fundingRate - mean) / deviation).toFixed(2));
}

export function buildReplayDerivativesInput(
  points: ProfessionalDerivativePoint[] | undefined,
  observedAt: string,
): ProfessionalAuditDerivativesInput {
  const observedMs = Date.parse(observedAt);

  if (!Number.isFinite(observedMs)) {
    return {
      source: "unavailable",
      status: "unavailable",
    };
  }

  const sorted = sortDerivativePoints(points);
  const currentFunding = latestDerivativePointAt(sorted, observedMs, "fundingRate");
  const currentOpenInterest = latestDerivativePointAt(sorted, observedMs, "openInterestUsd");
  const source = currentFunding?.source ?? currentOpenInterest?.source;
  const input: ProfessionalAuditDerivativesInput = {
    source: source ?? "unavailable",
    status: "unavailable",
  };

  if (currentFunding) {
    const zScore = fundingZScore(sorted, currentFunding, observedMs);

    if (isFiniteNumber(zScore)) {
      input.fundingRateZScore = zScore;
    }
  }

  if (currentOpenInterest && isFiniteNumber(currentOpenInterest.openInterestUsd)) {
    const currentMs = Date.parse(currentOpenInterest.observedAt);
    const previous = previousOpenInterestPoint(sorted, observedMs, currentMs);

    if (previous && isFiniteNumber(previous.openInterestUsd) && previous.openInterestUsd > 0) {
      input.openInterestChangePercent = Number((((currentOpenInterest.openInterestUsd - previous.openInterestUsd) / previous.openInterestUsd) * 100).toFixed(2));
    }
  }

  const hasFunding = isFiniteNumber(input.fundingRateZScore);
  const hasOpenInterest = isFiniteNumber(input.openInterestChangePercent);

  if (hasFunding && hasOpenInterest) {
    input.status = "live";
  } else if (hasFunding || hasOpenInterest) {
    input.status = "partial";
  }

  return input;
}

export function runProfessionalReplay(input: ProfessionalReplayInput): ProfessionalReplayReport {
  const options = normalizeOptions(input.options);
  const replayIndexes = commonReplayIndexes(input.candlesBySymbol, options);
  const selectedCases: ProfessionalBacktestAuditCase[] = [];
  const laneSelections: Record<ProfessionalReplayLaneName, ProfessionalReplaySelection[]> = {
    momentum: [],
    radar: [],
    random: [],
    volume: [],
  };
  const missedOpportunities: ProfessionalReplayMissedOpportunity[] = [];

  for (const index of replayIndexes) {
    const candidatesAtTime: ProfessionalReplayCandidate[] = [];

    for (const [symbol, candles] of input.candlesBySymbol.entries()) {
      const observed = candles[index];

      if (!observed) {
        continue;
      }

      const history = candles.slice(0, index + 1);
      const future = candles.slice(index + 1, index + 1 + options.horizonBars);

      if (history.length < 96 || future.length === 0) {
        continue;
      }

      const auditCase = buildProfessionalBacktestAuditCase({
        candlesByTimeframe: buildReplayCandlesByTimeframe(history),
        derivatives: buildReplayDerivativesInput(input.derivativesBySymbol?.get(symbol), observed.openTime),
        exchange: "binance-public-futures",
        futureCandles: future,
        moveThresholdPct: options.moveThresholdPct,
        observedAt: observed.openTime,
        primaryTimeframe: "15m",
        symbol,
      });
      const movePct = moveAtSelectionPct(history);
      const direction = replayDirection(auditCase, movePct);
      const positionPct = rangePositionPct(history);
      const outcome = replayOutcome({
        direction,
        entry: observed.close,
        future,
        moveThresholdPct: options.moveThresholdPct,
      });

      candidatesAtTime.push({
        case: auditCase,
        direction,
        hit: outcome.hit,
        lateAtSelection: isLateAtSelection(movePct, positionPct, direction, options.moveThresholdPct),
        maePct: outcome.maePct,
        mfePct: outcome.mfePct,
        movePct,
        observedAt: observed.openTime,
        randomScore: deterministicRandomScore(symbol, observed.openTime),
        volumeRatio: roundNumber(replayVolumeRatio(history)),
      });
    }

    if (candidatesAtTime.length === 0) {
      continue;
    }

    const topRadar = [...candidatesAtTime]
      .sort((left, right) => right.case.signal.confidence - left.case.signal.confidence)
      .slice(0, options.topN);
    const topMomentum = [...candidatesAtTime]
      .sort((left, right) => Math.abs(right.movePct) - Math.abs(left.movePct))
      .slice(0, options.topN);
    const topVolume = [...candidatesAtTime]
      .sort((left, right) => right.volumeRatio - left.volumeRatio)
      .slice(0, options.topN);
    const topRandom = [...candidatesAtTime]
      .sort((left, right) => right.randomScore - left.randomScore)
      .slice(0, options.topN);
    const radarSymbols = new Set(topRadar.map((candidate) => candidate.case.inputSummary.symbol));

    const lanes: Array<[ProfessionalReplayLaneName, ProfessionalReplayCandidate[]]> = [
      ["radar", topRadar],
      ["momentum", topMomentum],
      ["volume", topVolume],
      ["random", topRandom],
    ];

    for (const [lane, candidates] of lanes) {
      laneSelections[lane].push(...candidates.map(laneSelection));
    }

    selectedCases.push(
      ...topRadar.map((candidate) => candidate.case),
    );

    for (const candidate of candidatesAtTime) {
      if (radarSymbols.has(candidate.case.inputSummary.symbol)) {
        continue;
      }

      if (candidate.hit && !candidate.lateAtSelection) {
        missedOpportunities.push({
          confidence: candidate.case.signal.confidence,
          direction: candidate.direction,
          maePct: candidate.maePct,
          mfePct: candidate.mfePct,
          moveAtSelectionPct: roundNumber(Math.abs(candidate.movePct)),
          observedAt: candidate.observedAt,
          reason: "该币在事后达到波动阈值，但没有进入 radar topN；用于检查覆盖率、排序和深扫槽位。",
          symbol: candidate.case.inputSummary.symbol,
          volumeRatio: candidate.volumeRatio,
        });
      }
    }

    if (selectedCases.length >= options.maxCasesInReport) {
      break;
    }
  }

  const cases = selectedCases.slice(0, options.maxCasesInReport);
  const baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric> = {
    momentum: summarizeLane("momentum", laneSelections.momentum),
    radar: summarizeLane("radar", laneSelections.radar),
    random: summarizeLane("random", laneSelections.random),
    volume: summarizeLane("volume", laneSelections.volume),
  };
  const timingMetrics: ProfessionalReplayTimingMetrics = {
    earlyCount: laneSelections.radar.filter((item) => !item.lateAtSelection).length,
    earlyRatePct: laneSelections.radar.length > 0
      ? roundNumber((laneSelections.radar.filter((item) => !item.lateAtSelection).length / laneSelections.radar.length) * 100)
      : 0,
    lateCount: baselineMetrics.radar.lateCount,
    lateRatePct: baselineMetrics.radar.lateRatePct,
    noPlanCount: cases.filter((item) => item.signal.maturity?.stage !== "TRADE_PLAN_READY").length,
    planReadyCount: cases.filter((item) => item.signal.maturity?.stage === "TRADE_PLAN_READY").length,
  };
  const topMissedOpportunities = missedOpportunities
    .sort((left, right) => right.mfePct - left.mfePct)
    .slice(0, 50);
  const aggregateFindings = buildAggregateFindings({
    baselineMetrics,
    missedOpportunities: topMissedOpportunities,
    timingMetrics,
  });
  const findings = sortFindings([...topFindings(cases), ...aggregateFindings]);
  const roundSummary = aggregateRoundSummary(summarizeProfessionalBacktestRound(cases), aggregateFindings);
  const remediationPlan = [
    ...uniqueRemediations(cases),
    ...aggregateRemediations(aggregateFindings),
  ];
  const high = roundSummary.highSeverityFindings;
  const radar = baselineMetrics.radar;
  const random = baselineMetrics.random;

  return {
    baselineMetrics,
    cases,
    findings,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    guardrails: [
      "专业回测 v2 只读审计，不自动下单。",
      "本报告用于发现扫描、分析、推理和交易计划问题，不是收益承诺。",
      "缺失的数据必须显示 unavailable，不能用 mock 或当前值冒充历史数据。",
    ],
    input: {
      baseInterval: input.baseInterval,
      derivativesSymbolsUsed: input.derivativesBySymbol?.size ?? 0,
      horizonBars: options.horizonBars,
      replayTimes: replayIndexes.length,
      symbolsUsed: [...input.candlesBySymbol.keys()],
      topN: options.topN,
    },
    missedOpportunities: topMissedOpportunities,
    coreCapabilityMetrics: [],
    opportunityLaneMetrics: [],
    planBlockerMetrics: [],
    waitPlanMetrics: {
      badWaitRatePct: 0,
      label: "等待型计划后验",
      missingLevelCount: 0,
      noTradeRatePct: 0,
      notTriggeredCount: 0,
      stopFirstCount: 0,
      targetFirstCount: 0,
      timeoutCount: 0,
      totalWaitPlans: 0,
      triggeredCount: 0,
      usefulWaitRatePct: 0,
    },
    pressureTestMetrics: [],
    marketRegimeMetrics: [],
    ruleStabilityMetrics: [],
    remediationPlan,
    roundSummary,
    schemaVersion: "professional-backtest-audit-report.v2",
    summary: high > 0
      ? `专业回测 v2 发现 ${high} 个高优先级问题，必须先整改再谈实战参考。`
      : `专业回测 v2 未发现高优先级问题；radar 命中率 ${radar.hitRatePct}%，random 命中率 ${random.hitRatePct}%，仍需扩大样本继续验证。`,
    timingMetrics,
  };
}
