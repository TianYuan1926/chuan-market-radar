import type {
  MarketSignal,
  Timeframe,
} from "../analysis/types";
import type {
  Candle,
} from "../market/ohlcv/types";
import {
  buildProfessionalBacktestAuditCase,
  summarizeProfessionalBacktestRound,
  type ProfessionalAuditFinding,
  type ProfessionalAuditRemediation,
  type ProfessionalBacktestAuditCase,
} from "./professional-audit";
import {
  buildReplayCandlesByTimeframe,
  buildReplayDerivativesInput,
  type ProfessionalDerivativePoint,
  type ProfessionalReplayLaneMetric,
  type ProfessionalReplayLaneName,
  type ProfessionalReplayReport,
} from "./professional-replay";

export type ProfessionalAuditRoundCoinType =
  | "ai_depin"
  | "defi"
  | "exchange_infra"
  | "gaming"
  | "large_liquid_alt"
  | "layer1_layer2"
  | "long_tail"
  | "meme"
  | "midcap_trend"
  | "new_hot_listing";

export type ProfessionalAuditRoundTimeframeBand = "large" | "medium" | "small";

export type ProfessionalAuditRoundNodeRole =
  | "breakout_edge"
  | "early_volume_expansion"
  | "fakeout_or_invalidation"
  | "large_context"
  | "late_extension"
  | "medium_swing"
  | "neutral_random"
  | "pre_move"
  | "pullback_retest"
  | "trend_acceleration";

export type ProfessionalAuditRoundSymbolPlan = {
  coinType: ProfessionalAuditRoundCoinType;
  coinTypeLabel: string;
  symbol: string;
};

export type ProfessionalAuditRoundNode = {
  capturedByRadar: boolean;
  coinType: ProfessionalAuditRoundCoinType;
  coinTypeLabel: string;
  confidence: number;
  direction: "long" | "short";
  findingCount: number;
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  maturity: string;
  mfePct: number;
  moveAtSelectionPct: number;
  nodeIndex: number;
  nodeRole: ProfessionalAuditRoundNodeRole;
  observedAt: string;
  radarRank: number | null;
  symbol: string;
  timeframeBand: ProfessionalAuditRoundTimeframeBand;
  topN: number;
  volumeRatio: number;
};

export type ProfessionalAuditRoundProgress = {
  candidateUniverseSize: number;
  completedAt: string | null;
  completedNodes: number;
  currentNodeRole: ProfessionalAuditRoundNodeRole | null;
  currentSymbol: string | null;
  generatedAt: string;
  guardrails: string[];
  nodes: ProfessionalAuditRoundNode[];
  nodesPerSymbol: number;
  phase:
    | "completed"
    | "evaluating_nodes"
    | "fetching_candles"
    | "fetching_derivatives"
    | "idle"
    | "planning"
    | "failed";
  plannedSymbols: ProfessionalAuditRoundSymbolPlan[];
  schemaVersion: "professional-backtest-audit-round-progress.v1";
  status: "completed" | "failed" | "running";
  summary: string;
  totalNodes: number;
  updatedAt: string;
};

export type ProfessionalAuditRoundOptions = {
  candidateUniverseSize?: number;
  generatedAt?: string;
  horizonBars?: number;
  moveThresholdPct?: number;
  nodesPerSymbol: number;
  onProgress?: (progress: ProfessionalAuditRoundProgress) => void;
  symbols: ProfessionalAuditRoundSymbolPlan[];
  topN: number;
};

type CandidateAtNode = {
  auditCase: ProfessionalBacktestAuditCase;
  direction: "long" | "short";
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  mfePct: number;
  movePct: number;
  randomScore: number;
  volumeRatio: number;
};

type NodeStats = {
  compressionPct: number;
  futureMovePct: number;
  futureVolatilityPct: number;
  index: number;
  priorMovePct: number;
  rangePositionPct: number;
  volumeRatio: number;
};

const defaultGuardrails = [
  "审计节点可以用未来结果做测试标签，但分析引擎在 observedAt 只能读取历史数据。",
  "每个样本必须输出捕获、迟到、命中、回撤和问题归因，不用命中率包装系统能力。",
  "回测只用于找扫描和推理缺陷，不自动下单，不自动改实时权重。",
];

const nodeRoles: Array<{
  band: ProfessionalAuditRoundTimeframeBand;
  role: ProfessionalAuditRoundNodeRole;
}> = [
  { band: "small", role: "pre_move" },
  { band: "small", role: "early_volume_expansion" },
  { band: "small", role: "breakout_edge" },
  { band: "medium", role: "pullback_retest" },
  { band: "medium", role: "trend_acceleration" },
  { band: "small", role: "late_extension" },
  { band: "medium", role: "fakeout_or_invalidation" },
  { band: "small", role: "neutral_random" },
  { band: "medium", role: "medium_swing" },
  { band: "large", role: "large_context" },
];

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

function mean(values: number[]) {
  const clean = values.filter(Number.isFinite);

  if (clean.length === 0) {
    return 0;
  }

  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function tail<T>(items: T[], count: number) {
  return items.slice(Math.max(0, items.length - count));
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

function volumeRatio(history: Candle[]) {
  const recent = tail(history, 4);
  const baseline = history.slice(Math.max(0, history.length - 100), Math.max(0, history.length - 4));
  const baselineVolume = mean(baseline.map((candle) => candle.volume));

  if (baselineVolume <= 0) {
    return 1;
  }

  return mean(recent.map((candle) => candle.volume)) / baselineVolume;
}

function rangePositionPct(history: Candle[]) {
  const window = tail(history, 96);
  const current = window.at(-1);

  if (!current || window.length < 3) {
    return 50;
  }

  const high = Math.max(...window.map((candle) => candle.high));
  const low = Math.min(...window.map((candle) => candle.low));

  if (high <= low) {
    return 50;
  }

  return ((current.close - low) / (high - low)) * 100;
}

function compressionPct(history: Candle[]) {
  const shortWindow = tail(history, 32);
  const longWindow = tail(history, 192);
  const current = history.at(-1)?.close ?? 0;

  if (shortWindow.length < 3 || longWindow.length < 3 || current <= 0) {
    return 50;
  }

  const shortRange = Math.max(...shortWindow.map((item) => item.high)) - Math.min(...shortWindow.map((item) => item.low));
  const longRange = Math.max(...longWindow.map((item) => item.high)) - Math.min(...longWindow.map((item) => item.low));

  if (longRange <= 0) {
    return 50;
  }

  return Math.max(0, Math.min(100, (shortRange / longRange) * 100));
}

function priorMovePct(history: Candle[]) {
  const current = history.at(-1);
  const past = history.at(Math.max(0, history.length - 97));

  if (!current || !past) {
    return 0;
  }

  return percentChange(past.close, current.close);
}

function futureStats(entry: number, future: Candle[]) {
  if (entry <= 0 || future.length === 0) {
    return {
      futureMovePct: 0,
      futureVolatilityPct: 0,
      maxDownPct: 0,
      maxUpPct: 0,
    };
  }

  const futureHigh = Math.max(...future.map((candle) => candle.high));
  const futureLow = Math.min(...future.map((candle) => candle.low));
  const maxUpPct = percentChange(entry, futureHigh);
  const maxDownPct = percentChange(futureLow, entry);

  return {
    futureMovePct: Math.max(maxUpPct, maxDownPct),
    futureVolatilityPct: maxUpPct + maxDownPct,
    maxDownPct,
    maxUpPct,
  };
}

function nodeStats(candles: Candle[], index: number, horizonBars: number): NodeStats | null {
  const observed = candles[index];

  if (!observed) {
    return null;
  }

  const history = candles.slice(0, index + 1);
  const futureCandles = candles.slice(index + 1, index + 1 + horizonBars);

  if (history.length < 96 || futureCandles.length === 0) {
    return null;
  }

  const future = futureStats(observed.close, futureCandles);

  return {
    compressionPct: round(compressionPct(history)),
    futureMovePct: round(future.futureMovePct),
    futureVolatilityPct: round(future.futureVolatilityPct),
    index,
    priorMovePct: round(priorMovePct(history)),
    rangePositionPct: round(rangePositionPct(history)),
    volumeRatio: round(volumeRatio(history)),
  };
}

function roleScore(role: ProfessionalAuditRoundNodeRole, stats: NodeStats) {
  const priorAbs = Math.abs(stats.priorMovePct);
  const future = stats.futureMovePct;
  const edge = Math.abs(stats.rangePositionPct - 50);

  switch (role) {
    case "pre_move":
      return future * 4 - priorAbs * 3 + (100 - stats.compressionPct) * 0.4;
    case "early_volume_expansion":
      return future * 3 + stats.volumeRatio * 8 - priorAbs * 2;
    case "breakout_edge":
      return edge * 1.5 + future * 2 - Math.max(0, priorAbs - 8) * 2;
    case "pullback_retest":
      return future * 2 - Math.abs(edge - 20) - Math.max(0, priorAbs - 12);
    case "trend_acceleration":
      return future * 2 + priorAbs + stats.volumeRatio * 4;
    case "late_extension":
      return priorAbs * 3 + edge - future;
    case "fakeout_or_invalidation":
      return stats.futureVolatilityPct * 2 + edge - Math.min(future, 20);
    case "neutral_random":
      return 30 - future - priorAbs - stats.volumeRatio;
    case "medium_swing":
      return future * 2 + Math.abs(stats.rangePositionPct - 50) * 0.5;
    case "large_context":
      return stats.index * 0.01 + future + (100 - stats.compressionPct) * 0.1;
    default:
      return 0;
  }
}

function selectNodeIndexes(candles: Candle[], nodesPerSymbol: number, horizonBars: number) {
  const minHistory = 96;
  const candidates: NodeStats[] = [];

  for (let index = minHistory; index < candles.length - horizonBars; index += 4) {
    const stats = nodeStats(candles, index, horizonBars);

    if (stats) {
      candidates.push(stats);
    }
  }

  const selected: Array<{
    band: ProfessionalAuditRoundTimeframeBand;
    index: number;
    role: ProfessionalAuditRoundNodeRole;
  }> = [];
  const used = new Set<number>();
  const roles = nodeRoles.slice(0, nodesPerSymbol);

  for (const role of roles) {
    const best = [...candidates]
      .filter((item) => !used.has(item.index))
      .sort((left, right) => roleScore(role.role, right) - roleScore(role.role, left))[0];

    if (!best) {
      continue;
    }

    selected.push({
      band: role.band,
      index: best.index,
      role: role.role,
    });
    used.add(best.index);
  }

  if (selected.length < nodesPerSymbol) {
    const fallback = [...candidates]
      .filter((item) => !used.has(item.index))
      .sort((left, right) => left.index - right.index);
    const needed = nodesPerSymbol - selected.length;
    const step = Math.max(1, Math.floor(fallback.length / Math.max(1, needed)));

    for (let cursor = 0; selected.length < nodesPerSymbol && cursor < fallback.length; cursor += step) {
      const item = fallback[cursor];

      if (!item || used.has(item.index)) {
        continue;
      }

      selected.push({
        band: "small",
        index: item.index,
        role: "neutral_random",
      });
      used.add(item.index);
    }
  }

  return selected
    .sort((left, right) => left.index - right.index)
    .slice(0, nodesPerSymbol);
}

function directionFor(signal: MarketSignal, movePct: number): "long" | "short" {
  if (signal.direction === "short") {
    return "short";
  }

  if (signal.direction === "long") {
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
    maePct: round(maePct),
    mfePct: round(mfePct),
  };
}

function isLateAtSelection(movePct: number, positionPct: number, direction: "long" | "short", moveThresholdPct: number) {
  const extendedMove = Math.abs(movePct) >= Math.max(6, moveThresholdPct * 0.7);
  const extendedLocation = direction === "long" ? positionPct >= 88 : positionPct <= 12;

  return extendedMove || extendedLocation;
}

function buildCandidateAtNode({
  candles,
  derivatives,
  horizonBars,
  index,
  moveThresholdPct,
  symbol,
}: {
  candles: Candle[];
  derivatives?: ProfessionalDerivativePoint[];
  horizonBars: number;
  index: number;
  moveThresholdPct: number;
  symbol: string;
}): CandidateAtNode | null {
  const observed = candles[index];

  if (!observed) {
    return null;
  }

  const history = candles.slice(0, index + 1);
  const future = candles.slice(index + 1, index + 1 + horizonBars);

  if (history.length < 96 || future.length === 0) {
    return null;
  }

  const auditCase = buildProfessionalBacktestAuditCase({
    candlesByTimeframe: buildReplayCandlesByTimeframe(history),
    derivatives: buildReplayDerivativesInput(derivatives, observed.openTime),
    exchange: "binance-public-futures",
    futureCandles: future,
    moveThresholdPct,
    observedAt: observed.openTime,
    primaryTimeframe: "15m" as Extract<Timeframe, "15m">,
    symbol,
  });
  const movePct = priorMovePct(history);
  const direction = directionFor(auditCase.signal, movePct);
  const outcome = replayOutcome({
    direction,
    entry: observed.close,
    future,
    moveThresholdPct,
  });

  return {
    auditCase,
    direction,
    hit: outcome.hit,
    lateAtSelection: isLateAtSelection(movePct, rangePositionPct(history), direction, moveThresholdPct),
    maePct: outcome.maePct,
    mfePct: outcome.mfePct,
    movePct,
    randomScore: deterministicRandomScore(symbol, observed.openTime),
    volumeRatio: round(volumeRatio(history)),
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
    hitCount: 0,
    hitRatePct: 0,
    lane,
    lateCount: 0,
    lateRatePct: 0,
  };
}

function summarizeLane(lane: ProfessionalReplayLaneName, selections: CandidateAtNode[]): ProfessionalReplayLaneMetric {
  if (selections.length === 0) {
    return emptyLaneMetric(lane);
  }

  const hitCount = selections.filter((item) => item.hit).length;
  const lateCount = selections.filter((item) => item.lateAtSelection).length;

  return {
    avgConfidence: round(mean(selections.map((item) => item.auditCase.signal.confidence))),
    avgMaePct: round(mean(selections.map((item) => item.maePct))),
    avgMfePct: round(mean(selections.map((item) => item.mfePct))),
    avgMoveAtSelectionPct: round(mean(selections.map((item) => Math.abs(item.movePct)))),
    avgVolumeRatio: round(mean(selections.map((item) => item.volumeRatio))),
    count: selections.length,
    hitCount,
    hitRatePct: round((hitCount / selections.length) * 100),
    lane,
    lateCount,
    lateRatePct: round((lateCount / selections.length) * 100),
  };
}

function laneTop(candidates: CandidateAtNode[], lane: ProfessionalReplayLaneName, topN: number) {
  const sorted = [...candidates].sort((left, right) => {
    if (lane === "momentum") {
      return Math.abs(right.movePct) - Math.abs(left.movePct);
    }

    if (lane === "volume") {
      return right.volumeRatio - left.volumeRatio;
    }

    if (lane === "random") {
      return right.randomScore - left.randomScore;
    }

    return right.auditCase.signal.confidence - left.auditCase.signal.confidence;
  });

  return sorted.slice(0, topN);
}

function sortFindings(findings: ProfessionalAuditFinding[]) {
  const weight = { high: 3, low: 1, medium: 2 };
  const aggregateWeight = (finding: ProfessionalAuditFinding) =>
    finding.id.includes("-ROUND-") || finding.id === "PBA-DATA-ROUND-000" ? 1 : 0;

  return findings
    .sort((left, right) =>
      weight[right.severity] - weight[left.severity] ||
      aggregateWeight(right) - aggregateWeight(left) ||
      left.id.localeCompare(right.id)
    );
}

function uniqueRemediations(cases: ProfessionalBacktestAuditCase[], extra: ProfessionalAuditRemediation[]) {
  const seen = new Set<string>();
  const items: ProfessionalAuditRemediation[] = [];

  for (const remediation of [...cases.flatMap((item) => item.remediationPlan), ...extra]) {
    const key = `${remediation.priority}:${remediation.layer}:${remediation.targetModule}:${remediation.action}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(remediation);
  }

  return items.sort((left, right) => left.priority.localeCompare(right.priority));
}

function aggregateFinding(input: ProfessionalAuditFinding): ProfessionalAuditFinding {
  return input;
}

function dominantGroup<T extends string>({
  keyFor,
  nodes,
  predicate,
}: {
  keyFor: (node: ProfessionalAuditRoundNode) => T;
  nodes: ProfessionalAuditRoundNode[];
  predicate: (node: ProfessionalAuditRoundNode) => boolean;
}) {
  const groups = new Map<T, { count: number; total: number }>();

  for (const node of nodes) {
    const key = keyFor(node);
    const current = groups.get(key) ?? { count: 0, total: 0 };

    current.total += 1;

    if (predicate(node)) {
      current.count += 1;
    }

    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([key, value]) => ({
      count: value.count,
      key,
      rate: value.total > 0 ? round(value.count / value.total * 100) : 0,
      total: value.total,
    }))
    .sort((left, right) => right.rate - left.rate || right.count - left.count)[0] ?? null;
}

function averageRadarRank(nodes: ProfessionalAuditRoundNode[]) {
  const ranks = nodes
    .map((node) => node.radarRank)
    .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));

  return ranks.length > 0 ? round(mean(ranks)) : null;
}

function aggregateFindings({
  baselineMetrics,
  candidateUniverseSize,
  nodes,
  topN,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  candidateUniverseSize: number;
  nodes: ProfessionalAuditRoundNode[];
  topN: number;
}) {
  const findings: ProfessionalAuditFinding[] = [];
  const radar = baselineMetrics.radar;
  const random = baselineMetrics.random;
  const momentum = baselineMetrics.momentum;
  const captureRate = nodes.length > 0
    ? nodes.filter((item) => item.capturedByRadar).length / nodes.length * 100
    : 0;
  const lateRate = nodes.length > 0
    ? nodes.filter((item) => item.lateAtSelection).length / nodes.length * 100
    : 0;
  const missedEarlyHits = nodes.filter((item) => !item.capturedByRadar && item.hit && !item.lateAtSelection);
  const dominantLateRole = dominantGroup({
    keyFor: (node) => node.nodeRole,
    nodes,
    predicate: (node) => node.lateAtSelection,
  });
  const dominantMissedRole = dominantGroup({
    keyFor: (node) => node.nodeRole,
    nodes,
    predicate: (node) => !node.capturedByRadar && node.hit && !node.lateAtSelection,
  });
  const dominantMissedCoinType = dominantGroup({
    keyFor: (node) => node.coinType,
    nodes,
    predicate: (node) => !node.capturedByRadar && node.hit && !node.lateAtSelection,
  });

  if (nodes.length === 0) {
    findings.push(aggregateFinding({
      detail: "10x10 专业审计没有形成任何有效节点，无法测试网站核心能力。",
      id: "PBA-DATA-ROUND-000",
      layer: "data",
      nextAction: "扩大历史天数、降低节点要求，或检查交易所历史数据拉取。",
      rootCause: "历史 K 线不足以生成每币 10 个大中小节点。",
      severity: "high",
      title: "专业审计轮次没有有效样本",
    }));
  }

  if (candidateUniverseSize <= topN) {
    findings.push(aggregateFinding({
      detail: `候选池 ${candidateUniverseSize} 个，每轮 TopN=${topN}。候选池不大于入选名额时，捕获率和基线对比会失真，不能证明全市场筛选能力。`,
      id: "PBA-SCAN-ROUND-DESIGN-001",
      layer: "data",
      nextAction: "把专业审计拆成 10 个目标币 + 至少 60 个候选币的大池回测，确保 TopN 小于候选池。",
      rootCause: "审计样本设计把目标币池和候选排序池混在一起。",
      severity: "high",
      title: "专业审计候选池过小",
    }));
  }

  if (nodes.length > 0 && captureRate < 45) {
    findings.push(aggregateFinding({
      detail: `10x10 目标节点 radar topN 捕获率 ${round(captureRate)}%，说明系统可能漏掉大量可学习机会。`,
      id: "PBA-SCAN-ROUND-001",
      layer: "scan",
      nextAction: "检查候选排序、轻扫优先级、深扫槽位轮换和已涨已跌 cap。",
      rootCause: "目标山寨样本在历史节点没有稳定进入 radar topN。",
      severity: "high",
      title: "10x10 审计捕获率不足",
    }));
  }

  if (lateRate >= 35) {
    findings.push(aggregateFinding({
      detail: `10x10 目标节点迟到率 ${round(lateRate)}%，提示系统仍可能在涨完/跌完后才提示。最高迟到集中区：${dominantLateRole ? `${dominantLateRole.key} ${dominantLateRole.count}/${dominantLateRole.total} (${dominantLateRole.rate}%)` : "暂无可归因分组"}。`,
      id: "PBA-TIMING-ROUND-001",
      layer: "timing",
      nextAction: "强化启动前压缩、早期量能、主动买卖压力和低位关键位特征，降低 late move 权重。",
      rootCause: "候选晋级时价格已经偏离启动区间。",
      severity: lateRate >= 50 ? "high" : "medium",
      title: "10x10 审计迟到率偏高",
    }));
  }

  if (missedEarlyHits.length > 0) {
    const avgRank = averageRadarRank(missedEarlyHits);

    findings.push(aggregateFinding({
      detail: `发现 ${missedEarlyHits.length} 个事后命中且不晚到、但未进入 radar topN 的机会样本。平均排序名次 ${avgRank ?? "无"}；主要节点 ${dominantMissedRole ? `${dominantMissedRole.key} ${dominantMissedRole.count}/${dominantMissedRole.total}` : "暂无"}；主要币种类型 ${dominantMissedCoinType ? `${dominantMissedCoinType.key} ${dominantMissedCoinType.count}/${dominantMissedCoinType.total}` : "暂无"}。`,
      id: "PBA-SCAN-ROUND-MISSED-001",
      layer: "scan",
      nextAction: "把未捕获但不晚到的样本优先送入复盘进化，用于修正候选排序、深扫槽位和结构门控。",
      rootCause: "部分事前仍有布局价值的样本没有被 radar 排序推上来。",
      severity: "high",
      title: "10x10 审计存在未捕获的早期机会",
    }));
  }

  if (radar.count > 0 && random.count > 0 && radar.hitRatePct <= random.hitRatePct) {
    findings.push(aggregateFinding({
      detail: `radar=${radar.hitRatePct}% random=${random.hitRatePct}%。系统没有证明比随机更强。`,
      id: "PBA-SCAN-ROUND-BASELINE-001",
      layer: "scan",
      nextAction: "先修候选排序和提前性特征，再扩大测试样本。",
      rootCause: "雷达排序在本轮 10x10 样本中没有形成优势。",
      severity: "high",
      title: "10x10 审计未跑赢随机基线",
    }));
  }

  if (radar.count > 0 && momentum.count > 0 && radar.hitRatePct <= momentum.hitRatePct) {
    findings.push(aggregateFinding({
      detail: `radar=${radar.hitRatePct}% momentum=${momentum.hitRatePct}%。系统更像追涨过滤器，而不是提前发现雷达。`,
      id: "PBA-SCAN-ROUND-BASELINE-002",
      layer: "scan",
      nextAction: "复查波动压缩、相对强弱、启动前量能和关键位靠近程度的权重。",
      rootCause: "提前发现特征没有跑赢简单动量榜。",
      severity: "medium",
      title: "10x10 审计未跑赢动量基线",
    }));
  }

  return findings;
}

function aggregateRemediations(findings: ProfessionalAuditFinding[]): ProfessionalAuditRemediation[] {
  const remediations: ProfessionalAuditRemediation[] = [];

  if (findings.some((item) => item.id === "PBA-SCAN-ROUND-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮同样 10x10 样本 radar topN 捕获率达到 45% 以上，并能解释未捕获节点原因。",
      action: "把每个未捕获节点归因到覆盖、排序、深扫槽位或结构门控，并修正对应候选晋级逻辑。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "scan candidate ranking and deep-scan allocation",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-ROUND-DESIGN-001")) {
    remediations.push({
      acceptanceCriteria: "专业审计报告显示候选池大于 TopN 至少 5 倍，且目标币捕获率不再是天然 100%。",
      action: "固定采用目标币池和候选排序池分离的回测协议，禁止用 10 个币选 Top10 证明扫描有效。",
      canAutoApply: false,
      layer: "data",
      priority: "P0",
      targetModule: "professional audit round candidate universe",
    });
  }

  if (findings.some((item) => item.id === "PBA-TIMING-ROUND-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮 10x10 迟到率低于 35%，late move 样本不进入 TRADE_PLAN_READY。",
      action: "把已大幅涨跌样本降级为只复盘/等回踩，强化启动前特征。",
      canAutoApply: false,
      layer: "timing",
      priority: "P0",
      targetModule: "early opportunity and anti-chase gate",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-ROUND-MISSED-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮报告能列出未捕获早期机会的排序名次、节点类型和币种类型，并让其中一部分进入 radar topN。",
      action: "把不晚到且事后命中的漏判样本转成候选排序校准集，增加压缩、早期量能和低位关键位权重。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "professional audit missed opportunity calibration",
    });
  }

  return remediations;
}

function buildProgress({
  completedAt = null,
  candidateUniverseSize,
  completedNodes,
  currentNodeRole,
  currentSymbol,
  generatedAt,
  nodes,
  nodesPerSymbol,
  phase,
  plannedSymbols,
  status,
  summary,
}: {
  completedAt?: string | null;
  candidateUniverseSize: number;
  completedNodes: number;
  currentNodeRole: ProfessionalAuditRoundNodeRole | null;
  currentSymbol: string | null;
  generatedAt: string;
  nodes: ProfessionalAuditRoundNode[];
  nodesPerSymbol: number;
  phase: ProfessionalAuditRoundProgress["phase"];
  plannedSymbols: ProfessionalAuditRoundSymbolPlan[];
  status: ProfessionalAuditRoundProgress["status"];
  summary: string;
}): ProfessionalAuditRoundProgress {
  return {
    candidateUniverseSize,
    completedAt,
    completedNodes,
    currentNodeRole,
    currentSymbol,
    generatedAt,
    guardrails: defaultGuardrails,
    nodes,
    nodesPerSymbol,
    phase,
    plannedSymbols,
    schemaVersion: "professional-backtest-audit-round-progress.v1",
    status,
    summary,
    totalNodes: plannedSymbols.length * nodesPerSymbol,
    updatedAt: new Date().toISOString(),
  };
}

export function runProfessionalAuditRound({
  candlesBySymbol,
  derivativesBySymbol,
  options,
}: {
  candlesBySymbol: Map<string, Candle[]>;
  derivativesBySymbol?: Map<string, ProfessionalDerivativePoint[]>;
  options: ProfessionalAuditRoundOptions;
}): ProfessionalReplayReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const horizonBars = Math.max(1, Math.round(options.horizonBars ?? 96));
  const moveThresholdPct = Math.max(0.1, options.moveThresholdPct ?? 10);
  const nodesPerSymbol = Math.max(1, Math.min(10, Math.round(options.nodesPerSymbol)));
  const topN = Math.max(1, Math.round(options.topN));
  const candidateUniverseSize = Math.max(candlesBySymbol.size, Math.round(options.candidateUniverseSize ?? candlesBySymbol.size));
  const nodes: ProfessionalAuditRoundNode[] = [];
  const cases: ProfessionalBacktestAuditCase[] = [];
  const laneSelections: Record<ProfessionalReplayLaneName, CandidateAtNode[]> = {
    momentum: [],
    radar: [],
    random: [],
    volume: [],
  };

  options.onProgress?.(buildProgress({
    completedNodes: 0,
    candidateUniverseSize,
    currentNodeRole: null,
    currentSymbol: null,
    generatedAt,
    nodes,
    nodesPerSymbol,
    phase: "evaluating_nodes",
    plannedSymbols: options.symbols,
    status: "running",
    summary: `正在执行 10x10 专业回测审计；目标币 ${options.symbols.length} 个，候选池 ${candidateUniverseSize} 个。`,
  }));

  for (const symbolPlan of options.symbols) {
    const candles = candlesBySymbol.get(symbolPlan.symbol);

    if (!candles) {
      continue;
    }

    const selectedNodes = selectNodeIndexes(candles, nodesPerSymbol, horizonBars);

    for (const selected of selectedNodes) {
      const candidatesAtNode: CandidateAtNode[] = [];

      for (const [symbol, candidateCandles] of candlesBySymbol.entries()) {
        const candidate = buildCandidateAtNode({
          candles: candidateCandles,
          derivatives: derivativesBySymbol?.get(symbol),
          horizonBars,
          index: selected.index,
          moveThresholdPct,
          symbol,
        });

        if (candidate) {
          candidatesAtNode.push(candidate);
        }
      }

      const target = candidatesAtNode.find((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol);

      if (!target) {
        continue;
      }

      const topRadar = laneTop(candidatesAtNode, "radar", topN);
      const radarRank = [...candidatesAtNode]
        .sort((left, right) => right.auditCase.signal.confidence - left.auditCase.signal.confidence)
        .findIndex((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol) + 1;
      const capturedByRadar = topRadar.some((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol);

      laneSelections.radar.push(...topRadar);
      laneSelections.momentum.push(...laneTop(candidatesAtNode, "momentum", topN));
      laneSelections.volume.push(...laneTop(candidatesAtNode, "volume", topN));
      laneSelections.random.push(...laneTop(candidatesAtNode, "random", topN));
      cases.push(target.auditCase);

      nodes.push({
        capturedByRadar,
        coinType: symbolPlan.coinType,
        coinTypeLabel: symbolPlan.coinTypeLabel,
        confidence: target.auditCase.signal.confidence,
        direction: target.direction,
        findingCount: target.auditCase.findings.length,
        hit: target.hit,
        lateAtSelection: target.lateAtSelection,
        maePct: target.maePct,
        maturity: target.auditCase.signal.maturity?.stage ?? "UNCLASSIFIED",
        mfePct: target.mfePct,
        moveAtSelectionPct: round(Math.abs(target.movePct)),
        nodeIndex: selected.index,
        nodeRole: selected.role,
        observedAt: target.auditCase.inputSummary.observedAt,
        radarRank: radarRank > 0 ? radarRank : null,
        symbol: symbolPlan.symbol,
        timeframeBand: selected.band,
        topN,
        volumeRatio: target.volumeRatio,
      });

      options.onProgress?.(buildProgress({
        candidateUniverseSize,
        completedNodes: nodes.length,
        currentNodeRole: selected.role,
        currentSymbol: symbolPlan.symbol,
        generatedAt,
        nodes,
        nodesPerSymbol,
        phase: "evaluating_nodes",
        plannedSymbols: options.symbols,
        status: "running",
        summary: `正在审计 ${symbolPlan.symbol} ${nodes.length}/${options.symbols.length * nodesPerSymbol}；候选池 ${candidateUniverseSize} 个。`,
      }));
    }
  }

  const baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric> = {
    momentum: summarizeLane("momentum", laneSelections.momentum),
    radar: summarizeLane("radar", laneSelections.radar),
    random: summarizeLane("random", laneSelections.random),
    volume: summarizeLane("volume", laneSelections.volume),
  };
  const aggregate = aggregateFindings({ baselineMetrics, candidateUniverseSize, nodes, topN });
  const findings = sortFindings([...cases.flatMap((item) => item.findings), ...aggregate]);
  const baseSummary = summarizeProfessionalBacktestRound(cases);
  const highSeverityFindings = findings.filter((item) => item.severity === "high").length;
  const roundSummary = {
    ...baseSummary,
    highSeverityFindings,
  };
  const timingMetrics = {
    earlyCount: nodes.filter((item) => !item.lateAtSelection).length,
    earlyRatePct: nodes.length > 0
      ? round(nodes.filter((item) => !item.lateAtSelection).length / nodes.length * 100)
      : 0,
    lateCount: nodes.filter((item) => item.lateAtSelection).length,
    lateRatePct: nodes.length > 0
      ? round(nodes.filter((item) => item.lateAtSelection).length / nodes.length * 100)
      : 0,
    noPlanCount: nodes.filter((item) => item.maturity !== "TRADE_PLAN_READY").length,
    planReadyCount: nodes.filter((item) => item.maturity === "TRADE_PLAN_READY").length,
  };
  const missedOpportunities = nodes
    .filter((item) => !item.capturedByRadar && item.hit && !item.lateAtSelection)
    .map((item) => ({
      confidence: item.confidence,
      direction: item.direction,
      maePct: item.maePct,
      mfePct: item.mfePct,
      moveAtSelectionPct: item.moveAtSelectionPct,
      observedAt: item.observedAt,
      reason: "该目标节点事后达到波动阈值，但没有进入 radar topN；用于检查扫描覆盖、候选排序和深扫槽位。",
      symbol: item.symbol,
      volumeRatio: item.volumeRatio,
    }));
  const remediationPlan = uniqueRemediations(cases, aggregateRemediations(aggregate));
  const completedAt = new Date().toISOString();
  const auditRound = buildProgress({
    candidateUniverseSize,
    completedAt,
    completedNodes: nodes.length,
    currentNodeRole: null,
    currentSymbol: null,
    generatedAt,
    nodes,
    nodesPerSymbol,
    phase: "completed",
    plannedSymbols: options.symbols,
    status: "completed",
    summary: highSeverityFindings > 0
      ? `10x10 专业审计完成，发现 ${highSeverityFindings} 个高优先级问题。`
      : "10x10 专业审计完成，未发现高优先级问题，仍需扩大样本。",
  });

  options.onProgress?.(auditRound);

  return {
    auditRound,
    baselineMetrics,
    cases,
    findings,
    generatedAt,
    guardrails: defaultGuardrails,
    input: {
      baseInterval: "15m",
      derivativesSymbolsUsed: derivativesBySymbol?.size ?? 0,
      horizonBars,
      replayTimes: nodes.length,
      symbolsUsed: [...candlesBySymbol.keys()],
      topN,
    },
    missedOpportunities,
    remediationPlan,
    roundSummary,
    schemaVersion: "professional-backtest-audit-report.v2",
    summary: auditRound.summary,
    timingMetrics,
  };
}
