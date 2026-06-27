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
  type ProfessionalCoreCapabilityFailure,
  type ProfessionalCoreCapabilityMetric,
  type ProfessionalAuditOpportunityLaneMetric,
  type ProfessionalAuditOpportunityLaneName,
  type ProfessionalAuditPlanBlockerMetric,
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
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  opportunityLaneLabel: string;
  opportunityLaneScore: number;
  planBlockers: string[];
  radarRank: number | null;
  radarScore: number;
  rewardRisk: number | null;
  selectedAsOpportunity: boolean;
  selectedLane: ProfessionalAuditOpportunityLaneName | null;
  symbol: string;
  timeframeBand: ProfessionalAuditRoundTimeframeBand;
  tradePlanStatus: string;
  validationWindowBars: number;
  validationWindowHours: number;
  validationWindowLabel: string;
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
  horizonBarsByBand?: Partial<Record<ProfessionalAuditRoundTimeframeBand, number>>;
  moveThresholdPct?: number;
  nodesPerSymbol: number;
  onProgress?: (progress: ProfessionalAuditRoundProgress) => void;
  symbols: ProfessionalAuditRoundSymbolPlan[];
  topN: number;
};

type CandidateAtNode = {
  auditCase: ProfessionalBacktestAuditCase;
  compressionPct: number;
  direction: "long" | "short";
  hit: boolean;
  lateAtSelection: boolean;
  maePct: number;
  mfePct: number;
  movePct: number;
  nodeRole?: ProfessionalAuditRoundNodeRole;
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  opportunityLaneScore: number;
  planBlockers: string[];
  radarScore: number;
  randomScore: number;
  rangePositionPct: number;
  rewardRisk: number | null;
  tradePlanStatus: string;
  volumeRatio: number;
};

type NodeStats = {
  compressionPct: number;
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

const opportunityLaneLabels: Record<ProfessionalAuditOpportunityLaneName, string> = {
  early_setup: "启动前机会",
  higher_timeframe_context: "大周期背景机会",
  pullback_retest: "回踩/反抽确认机会",
  risk_review: "风险复盘教材",
};

const planBlockerLabels: Record<string, string> = {
  bear_structure_broken: "空头结构已破坏",
  bull_structure_broken: "多头结构已破坏",
  chase_risk: "追涨/追空风险",
  high_weight_conflict: "高权重证据冲突",
  invalid_nearest_target: "最近目标无效",
  invalid_structural_stop: "结构止损无效",
  location_rr: "缺少位置/结构盈亏比",
  lower_wick_exhaustion: "下影线衰竭风险",
  missing_strategy_v3: "缺少 v3 策略上下文",
  missing_trade_plan: "缺少交易计划草案",
  neutral_direction: "方向不明确",
  no_nearest_target: "缺少最近目标",
  no_structural_stop: "缺少结构止损",
  reaction_not_confirmed: "回踩/反抽反应未确认",
  resistance_reclaimed: "价格重新站回压力位",
  reward_risk_below_minimum: "结构盈亏比低于 3:1",
  reward_risk_unknown: "结构盈亏比未知",
  risk_gate_blocked: "风控门禁拦截",
  risk_score_high: "风险评分过高",
  stale_data: "数据过期",
  stop_distance_too_wide: "止损距离过宽",
  structure_confirmation_pending: "结构确认仍在等待",
  structure_invalidated: "结构已经失效",
  support_lost: "支撑位失守",
  trade_plan_not_eligible: "交易计划未满足门禁",
  trade_plan_not_ready: "交易计划未就绪",
  trend_integrity_not_healthy: "趋势完整度不健康",
  upper_wick_exhaustion: "上影线衰竭风险",
};

export function professionalAuditOpportunityLaneLabel(lane: ProfessionalAuditOpportunityLaneName) {
  return opportunityLaneLabels[lane];
}

export function professionalAuditPlanBlockerLabel(blocker: string) {
  if (planBlockerLabels[blocker]) {
    return planBlockerLabels[blocker];
  }

  if (/reward[_ -]?risk|rr|赔率/iu.test(blocker)) {
    return "结构盈亏比不足或未知";
  }

  if (/reaction/iu.test(blocker)) {
    return "反应确认不足";
  }

  if (/risk[_ -]?gate|blocked/iu.test(blocker)) {
    return "风控门禁拦截";
  }

  return blocker
    .replaceAll("_", " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

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

export const defaultProfessionalAuditHorizonBarsByBand: Record<ProfessionalAuditRoundTimeframeBand, number> = {
  large: 384,
  medium: 96,
  small: 16,
};

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function normalizeHorizonBars(value: unknown, fallback: number) {
  const parsed = Math.round(Number(value));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveProfessionalAuditHorizonBarsByBand(
  input?: Partial<Record<ProfessionalAuditRoundTimeframeBand, number>>,
) {
  return {
    large: normalizeHorizonBars(input?.large, defaultProfessionalAuditHorizonBarsByBand.large),
    medium: normalizeHorizonBars(input?.medium, defaultProfessionalAuditHorizonBarsByBand.medium),
    small: normalizeHorizonBars(input?.small, defaultProfessionalAuditHorizonBarsByBand.small),
  } satisfies Record<ProfessionalAuditRoundTimeframeBand, number>;
}

function validationWindowLabel(horizonBars: number) {
  const hours = horizonBars / 4;

  if (hours >= 24 && Number.isInteger(hours / 24)) {
    return `${hours / 24}d`;
  }

  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }

  return `${round(hours, 2)}h`;
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

export type ProfessionalAuditRadarRankInput = {
  compressionPct: number;
  confidence: number;
  direction: "long" | "short";
  lateAtSelection: boolean;
  movePct: number;
  rangePositionPct: number;
  symbol: string;
  timeframeBand?: ProfessionalAuditRoundTimeframeBand;
  volumeRatio: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bandScore(value: number, low: number, ideal: number, high: number) {
  if (!Number.isFinite(value) || value < low || value > high) {
    return 0;
  }

  const spread = value <= ideal ? ideal - low : high - ideal;

  if (spread <= 0) {
    return 1;
  }

  return clamp(1 - Math.abs(value - ideal) / spread, 0, 1);
}

function isMemeLikeSymbol(symbol: string) {
  const base = symbol.replace(/USDT$/u, "").toUpperCase();

  return /^(1000|PEPE|BONK|SHIB|DOGE|WIF|FLOKI|MEME|BOME|POPCAT|TURBO|BRETT)/u.test(base);
}

export type ProfessionalAuditOpportunityClassifyInput = {
  compressionPct: number;
  direction: "long" | "short";
  lateAtSelection: boolean;
  movePct: number;
  nodeRole?: ProfessionalAuditRoundNodeRole;
  rangePositionPct: number;
  timeframeBand: ProfessionalAuditRoundTimeframeBand;
  volumeRatio: number;
};

export function classifyProfessionalAuditOpportunityLane(input: ProfessionalAuditOpportunityClassifyInput): ProfessionalAuditOpportunityLaneName {
  const absMove = Math.abs(input.movePct);
  const role = input.nodeRole;

  if (
    input.lateAtSelection ||
    role === "late_extension" ||
    role === "fakeout_or_invalidation" ||
    (input.direction === "long" && input.rangePositionPct >= 88) ||
    (input.direction === "short" && input.rangePositionPct <= 12) ||
    absMove >= 10
  ) {
    return "risk_review";
  }

  if (input.timeframeBand === "large" || role === "large_context") {
    return "higher_timeframe_context";
  }

  const pullbackZone = input.direction === "long"
    ? input.rangePositionPct >= 24 && input.rangePositionPct <= 62
    : input.rangePositionPct >= 38 && input.rangePositionPct <= 76;
  const controlledMove = absMove >= 2 && absMove <= 8.5;

  if (
    role === "pullback_retest" ||
    role === "trend_acceleration" ||
    (pullbackZone && controlledMove && input.volumeRatio >= 0.85)
  ) {
    return "pullback_retest";
  }

  return "early_setup";
}

export function opportunityLaneScore(input: ProfessionalAuditOpportunityClassifyInput & {
  radarScore: number;
  rewardRisk?: number | null;
  tradePlanStatus?: string;
}) {
  const absMove = Math.abs(input.movePct);
  const nonExtremeLocationScore = input.direction === "long"
    ? bandScore(input.rangePositionPct, 16, 38, 84)
    : bandScore(input.rangePositionPct, 16, 62, 84);
  const earlyRoleBonus = input.nodeRole === "pre_move" && absMove <= 4.5
    ? 22 + Math.max(0, 48 - input.compressionPct) * 0.35
    : input.nodeRole === "early_volume_expansion" && absMove <= 6 && input.volumeRatio >= 1.05
      ? 18 + bandScore(input.volumeRatio, 1.05, 1.45, 2.4) * 10
      : input.nodeRole === "breakout_edge" && absMove <= 6.5 && input.compressionPct <= 58
        ? 16 + nonExtremeLocationScore * 8
        : 0;
  const rrQualityBonus = typeof input.rewardRisk === "number" && Number.isFinite(input.rewardRisk) && input.rewardRisk >= 3
    ? Math.min(22, 10 + (Math.min(input.rewardRisk, 5) - 3) * 6)
    : 0;
  const conditionalPlanBonus = input.tradePlanStatus === "WAIT_RETEST" || input.tradePlanStatus === "WAIT_PULLBACK"
    ? 4
    : 0;

  if (input.lateAtSelection) {
    return round(input.radarScore - 100 - absMove * 2, 4);
  }

  const lane = classifyProfessionalAuditOpportunityLane(input);

  if (lane === "early_setup") {
    const lowVolumeCompressionBonus = input.compressionPct <= 42 && input.volumeRatio <= 1.05
      ? bandScore(input.volumeRatio, 0.35, 0.82, 1.15) * 16
      : 0;
    const controlledLocationBonus = nonExtremeLocationScore * 10;

    return round(input.radarScore + (100 - input.compressionPct) * 0.42 + bandScore(input.volumeRatio, 0.55, 1.25, 2.5) * 12 + lowVolumeCompressionBonus + controlledLocationBonus + earlyRoleBonus + rrQualityBonus + conditionalPlanBonus - absMove * 0.9, 4);
  }

  if (lane === "pullback_retest") {
    return round(input.radarScore + nonExtremeLocationScore * 16 + bandScore(absMove, 1.2, 4.2, 8.5) * 10 + bandScore(input.volumeRatio, 0.45, 0.95, 1.8) * 8 + rrQualityBonus + conditionalPlanBonus, 4);
  }

  if (lane === "higher_timeframe_context") {
    return round(input.radarScore + (100 - input.compressionPct) * 0.28 + nonExtremeLocationScore * 16 + bandScore(absMove, 0, 1.8, 6.5) * 8 + rrQualityBonus + conditionalPlanBonus, 4);
  }

  return round(input.radarScore - 80, 4);
}

export function professionalAuditOpportunityQuotas(topN: number): Record<ProfessionalAuditOpportunityLaneName, number> {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized === 1) {
    return {
      early_setup: 1,
      higher_timeframe_context: 0,
      pullback_retest: 0,
      risk_review: 0,
    };
  }

  const early = Math.max(1, Math.floor(normalized * 0.4));
  const pullback = Math.max(1, Math.floor(normalized * 0.3));
  const higher = Math.max(0, normalized - early - pullback);

  return {
    early_setup: early,
    higher_timeframe_context: higher,
    pullback_retest: pullback,
    risk_review: 0,
  };
}

type OpportunityRankable = {
  auditCase: {
    inputSummary: {
      symbol: string;
    };
    signal: {
      confidence: number;
    };
  };
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  opportunityLaneScore: number;
  radarScore: number;
};

function rankOpportunityCandidates<T extends OpportunityRankable>(items: T[]) {
  return [...items].sort((left, right) =>
    right.opportunityLaneScore - left.opportunityLaneScore ||
    right.radarScore - left.radarScore ||
    right.auditCase.signal.confidence - left.auditCase.signal.confidence ||
    left.auditCase.inputSummary.symbol.localeCompare(right.auditCase.inputSummary.symbol)
  );
}

export function selectProfessionalAuditOpportunityCandidates<T extends OpportunityRankable>(items: T[], topN: number) {
  const quotas = professionalAuditOpportunityQuotas(topN);
  const selected: T[] = [];
  const selectedSymbols = new Set<string>();
  const actionableLanes: ProfessionalAuditOpportunityLaneName[] = [
    "early_setup",
    "pullback_retest",
    "higher_timeframe_context",
  ];

  for (const lane of actionableLanes) {
    const laneItems = rankOpportunityCandidates(items.filter((item) => item.opportunityLane === lane));

    for (const item of laneItems.slice(0, quotas[lane])) {
      selected.push(item);
      selectedSymbols.add(item.auditCase.inputSummary.symbol);
    }
  }

  const remainingActionable = rankOpportunityCandidates(
    items.filter((item) =>
      item.opportunityLane !== "risk_review" &&
      !selectedSymbols.has(item.auditCase.inputSummary.symbol)
    ),
  );

  for (const item of remainingActionable) {
    if (selected.length >= topN) {
      break;
    }

    selected.push(item);
    selectedSymbols.add(item.auditCase.inputSummary.symbol);
  }

  const selectedSet = new Set(selected.map((item) => item.auditCase.inputSummary.symbol));
  const ranked = [
    ...selected,
    ...rankOpportunityCandidates(
      items.filter((item) =>
        item.opportunityLane !== "risk_review" &&
        !selectedSet.has(item.auditCase.inputSummary.symbol)
      ),
    ),
    ...rankOpportunityCandidates(items.filter((item) => item.opportunityLane === "risk_review")),
  ];

  return {
    ranked,
    selected,
  };
}

export function professionalAuditRadarScore(input: ProfessionalAuditRadarRankInput) {
  const absMove = Math.abs(input.movePct);
  const band = input.timeframeBand ?? "medium";
  const horizonWeights = {
    large: {
      compression: 1.1,
      controlledImpulse: 0.45,
      lowVolumeCompression: 1.35,
      quietAccumulation: 1.25,
    },
    medium: {
      compression: 1,
      controlledImpulse: 0.85,
      lowVolumeCompression: 0.8,
      quietAccumulation: 0.85,
    },
    small: {
      compression: 0.8,
      controlledImpulse: 1.05,
      lowVolumeCompression: 0.15,
      quietAccumulation: 0.35,
    },
  }[band];
  const pullbackPositionScore = input.direction === "long"
    ? bandScore(input.rangePositionPct, 18, 34, 54)
    : bandScore(input.rangePositionPct, 46, 66, 82);
  const moderateMoveScore = absMove <= 3
    ? 14
    : absMove <= 6
      ? 10
      : absMove <= 9
        ? 4
        : 0;
  const compressionScore = clamp((70 - input.compressionPct) / 70, 0, 1) * 14 * horizonWeights.compression;
  const earlyVolumeScore = input.volumeRatio >= 1.1
    ? clamp((input.volumeRatio - 1.1) * 8, 0, 12)
    : 0;
  const nonExtremeLocationScore = input.direction === "long"
    ? bandScore(input.rangePositionPct, 16, 38, 84)
    : bandScore(input.rangePositionPct, 16, 62, 84);
  const quietAccumulationScore = !input.lateAtSelection && absMove <= 2.5
    ? (nonExtremeLocationScore * 14 + bandScore(input.volumeRatio, 0.55, 1.25, 2.1) * 8) * horizonWeights.quietAccumulation
    : 0;
  const controlledImpulseScore = !input.lateAtSelection && absMove > 2 && absMove <= 6.5 && input.volumeRatio >= 1.2
    ? (nonExtremeLocationScore * 8 + clamp((input.volumeRatio - 1.2) * 3, 0, 10)) * horizonWeights.controlledImpulse
    : 0;
  const breakoutEdgePositionScore = input.direction === "long"
    ? bandScore(input.rangePositionPct, 58, 74, 86)
    : bandScore(input.rangePositionPct, 14, 26, 42);
  const controlledBreakoutEdgeScore = !input.lateAtSelection && absMove >= 1 && absMove <= 6.5 && input.compressionPct <= 55 && input.volumeRatio >= 1.05
    ? (
      breakoutEdgePositionScore * 18 +
      clamp((55 - input.compressionPct) / 55, 0, 1) * 6 +
      bandScore(input.volumeRatio, 1.05, 1.45, 2.4) * 8
    ) * horizonWeights.controlledImpulse
    : 0;
  const lowVolumeCompressionScore = !input.lateAtSelection && absMove <= 4 && input.volumeRatio < 1 && input.compressionPct <= 38
    ? nonExtremeLocationScore * 8 * horizonWeights.lowVolumeCompression
    : 0;
  const pullbackRetestBonus = pullbackPositionScore > 0
    ? pullbackPositionScore * 18 + moderateMoveScore
    : 0;
  const latePenalty = input.lateAtSelection ? 42 : 0;
  const chasePenalty = absMove >= 15
    ? 32
    : absMove >= 10
      ? 20
      : absMove >= 7
        ? 10
        : 0;
  const extremeLocationPenalty = input.direction === "long"
    ? input.rangePositionPct >= 88 ? 18 : 0
    : input.rangePositionPct <= 12 ? 18 : 0;
  const memePenalty = isMemeLikeSymbol(input.symbol) && (input.lateAtSelection || absMove >= 8)
    ? 14
    : 0;
  const memeEarlyBonus = isMemeLikeSymbol(input.symbol) && !input.lateAtSelection && absMove <= 6 && input.volumeRatio >= 1.25
    ? 6
    : 0;

  return round(
    input.confidence +
    pullbackRetestBonus +
    compressionScore +
    earlyVolumeScore +
    quietAccumulationScore +
    controlledImpulseScore +
    controlledBreakoutEdgeScore +
    lowVolumeCompressionScore +
    memeEarlyBonus -
    latePenalty -
    chasePenalty -
    extremeLocationPenalty -
    memePenalty,
    4,
  );
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

function nodeStats(candles: Candle[], index: number): NodeStats | null {
  const observed = candles[index];

  if (!observed) {
    return null;
  }

  const history = candles.slice(0, index + 1);

  if (history.length < 96) {
    return null;
  }

  return {
    compressionPct: round(compressionPct(history)),
    index,
    priorMovePct: round(priorMovePct(history)),
    rangePositionPct: round(rangePositionPct(history)),
    volumeRatio: round(volumeRatio(history)),
  };
}

function roleScore(role: ProfessionalAuditRoundNodeRole, stats: NodeStats) {
  const priorAbs = Math.abs(stats.priorMovePct);
  const edge = Math.abs(stats.rangePositionPct - 50);
  const compressionTightness = 100 - stats.compressionPct;
  const controlledMoveScore = bandScore(priorAbs, 0.5, 3.5, 8.5) * 20;
  const quietVolumeScore = bandScore(stats.volumeRatio, 0.55, 1.05, 1.8) * 18;
  const activeVolumeScore = bandScore(stats.volumeRatio, 1.05, 1.8, 4.5) * 18;
  const middleLocationScore = bandScore(stats.rangePositionPct, 22, 50, 78) * 18;

  switch (role) {
    case "pre_move":
      return compressionTightness * 0.55 + quietVolumeScore + middleLocationScore - priorAbs * 1.2;
    case "early_volume_expansion":
      return activeVolumeScore + compressionTightness * 0.35 + controlledMoveScore - Math.max(0, priorAbs - 7) * 2;
    case "breakout_edge":
      return edge * 1.5 + activeVolumeScore + compressionTightness * 0.18 - Math.max(0, priorAbs - 8) * 2;
    case "pullback_retest":
      return controlledMoveScore + quietVolumeScore * 0.6 - Math.abs(edge - 18) - Math.max(0, priorAbs - 10);
    case "trend_acceleration":
      return controlledMoveScore + activeVolumeScore + priorAbs * 0.6 - Math.max(0, priorAbs - 10) * 2;
    case "late_extension":
      return priorAbs * 3 + edge + Math.max(0, stats.volumeRatio - 1.4) * 8;
    case "fakeout_or_invalidation":
      return edge * 1.4 + Math.max(0, stats.compressionPct - 62) * 0.6 + Math.max(0, stats.volumeRatio - 2.5) * 8;
    case "neutral_random":
      return 30 - priorAbs - Math.abs(stats.volumeRatio - 1) * 3 - edge * 0.2;
    case "medium_swing":
      return controlledMoveScore + Math.abs(stats.rangePositionPct - 50) * 0.45 + compressionTightness * 0.12;
    case "large_context":
      return stats.index * 0.01 + compressionTightness * 0.22 + middleLocationScore * 0.7;
    default:
      return 0;
  }
}

export function selectProfessionalAuditNodeIndexes(
  candles: Candle[],
  nodesPerSymbol: number,
  horizonBarsByBand: Record<ProfessionalAuditRoundTimeframeBand, number>,
) {
  const minHistory = 96;
  const minHorizonBars = Math.min(...Object.values(horizonBarsByBand));
  const baseCandidates: NodeStats[] = [];

  for (let index = minHistory; index < candles.length - minHorizonBars; index += 4) {
    const stats = nodeStats(candles, index);

    if (stats) {
      baseCandidates.push(stats);
    }
  }

  const selected: Array<{
    band: ProfessionalAuditRoundTimeframeBand;
    horizonBars: number;
    index: number;
    role: ProfessionalAuditRoundNodeRole;
  }> = [];
  const used = new Set<number>();
  const roles = nodeRoles.slice(0, nodesPerSymbol);

  for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
    const role = roles[roleIndex];

    if (!role) {
      continue;
    }

    const horizonBars = horizonBarsByBand[role.band];
    const bucketStart = Math.floor((roleIndex / Math.max(1, roles.length)) * baseCandidates.length);
    const bucketEnd = Math.max(bucketStart + 1, Math.floor(((roleIndex + 1) / Math.max(1, roles.length)) * baseCandidates.length));
    const bucket = baseCandidates.slice(bucketStart, bucketEnd);
    const pool = bucket.length > 0 ? bucket : baseCandidates;
    const best = pool
      .filter((item) => !used.has(item.index))
      .filter((item) => item.index < candles.length - horizonBars)
      .map((item) => nodeStats(candles, item.index))
      .filter((item): item is NodeStats => Boolean(item))
      .sort((left, right) => roleScore(role.role, right) - roleScore(role.role, left))[0];

    if (!best) {
      continue;
    }

    selected.push({
      band: role.band,
      horizonBars,
      index: best.index,
      role: role.role,
    });
    used.add(best.index);
  }

  if (selected.length < nodesPerSymbol) {
    const fallback = [...baseCandidates]
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
        horizonBars: horizonBarsByBand.small,
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

const selectNodeIndexes = selectProfessionalAuditNodeIndexes;

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

function tradePlanStatus(signal: MarketSignal) {
  return signal.strategyV3?.tradePlan?.status ?? signal.maturity?.stage ?? "UNCLASSIFIED";
}

function tradePlanRewardRisk(signal: MarketSignal) {
  const rewardRisk = signal.strategyV3?.tradePlan?.rewardRisk ?? signal.strategy?.riskReward ?? null;

  return typeof rewardRisk === "number" && Number.isFinite(rewardRisk) ? round(rewardRisk, 2) : null;
}

export function tradePlanBlockers(signal: MarketSignal) {
  const blockers = new Set<string>();
  const tradePlan = signal.strategyV3?.tradePlan;
  const hasDirectionalPlan = signal.direction === "long" || signal.direction === "short";

  if (!signal.strategyV3) {
    blockers.add("missing_strategy_v3");
  }

  if (!tradePlan) {
    blockers.add("missing_trade_plan");
  } else {
    for (const blocker of tradePlan.blockedBy) {
      blockers.add(blocker);
    }

    const rewardRisk = tradePlan.rewardRisk;

    if (hasDirectionalPlan && (rewardRisk === null || !Number.isFinite(rewardRisk))) {
      blockers.add("reward_risk_unknown");
    } else if (hasDirectionalPlan && typeof rewardRisk === "number" && Number.isFinite(rewardRisk) && rewardRisk < 3) {
      blockers.add("reward_risk_below_minimum");
    }

    if (!tradePlan.isPlanEligible && tradePlan.blockedBy.length === 0) {
      blockers.add("trade_plan_not_eligible");
    }
  }

  if (signal.maturity?.stage !== "TRADE_PLAN_READY" && blockers.size === 0) {
    blockers.add("trade_plan_not_ready");
  }

  return [...blockers];
}

function buildCandidateAtNode({
  candles,
  derivatives,
  horizonBars,
  index,
  moveThresholdPct,
  nodeRole,
  symbol,
  timeframeBand,
}: {
  candles: Candle[];
  derivatives?: ProfessionalDerivativePoint[];
  horizonBars: number;
  index: number;
  moveThresholdPct: number;
  nodeRole?: ProfessionalAuditRoundNodeRole;
  symbol: string;
  timeframeBand: ProfessionalAuditRoundTimeframeBand;
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
  const currentCompressionPct = round(compressionPct(history));
  const currentRangePositionPct = round(rangePositionPct(history));
  const currentVolumeRatio = round(volumeRatio(history));
  const lateAtSelection = isLateAtSelection(movePct, currentRangePositionPct, direction, moveThresholdPct);
  const radarScore = professionalAuditRadarScore({
    compressionPct: currentCompressionPct,
    confidence: auditCase.signal.confidence,
    direction,
    lateAtSelection,
    movePct,
    rangePositionPct: currentRangePositionPct,
    symbol,
    timeframeBand,
    volumeRatio: currentVolumeRatio,
  });
  const opportunityLane = classifyProfessionalAuditOpportunityLane({
    compressionPct: currentCompressionPct,
    direction,
    lateAtSelection,
    movePct,
    nodeRole,
    rangePositionPct: currentRangePositionPct,
    timeframeBand,
    volumeRatio: currentVolumeRatio,
  });
  const outcome = replayOutcome({
    direction,
    entry: observed.close,
    future,
    moveThresholdPct,
  });

  return {
    auditCase,
    compressionPct: currentCompressionPct,
    direction,
    hit: outcome.hit,
    lateAtSelection,
    maePct: outcome.maePct,
    mfePct: outcome.mfePct,
    movePct,
    nodeRole,
    opportunityLane,
    opportunityLaneScore: opportunityLaneScore({
      compressionPct: currentCompressionPct,
      direction,
      lateAtSelection,
      movePct,
      radarScore,
      rangePositionPct: currentRangePositionPct,
      rewardRisk: tradePlanRewardRisk(auditCase.signal),
      timeframeBand,
      tradePlanStatus: tradePlanStatus(auditCase.signal),
      volumeRatio: currentVolumeRatio,
    }),
    planBlockers: tradePlanBlockers(auditCase.signal),
    radarScore,
    randomScore: deterministicRandomScore(symbol, observed.openTime),
    rangePositionPct: currentRangePositionPct,
    rewardRisk: tradePlanRewardRisk(auditCase.signal),
    tradePlanStatus: tradePlanStatus(auditCase.signal),
    volumeRatio: currentVolumeRatio,
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

function summarizeLane(lane: ProfessionalReplayLaneName, selections: CandidateAtNode[]): ProfessionalReplayLaneMetric {
  if (selections.length === 0) {
    return emptyLaneMetric(lane);
  }

  const hitCount = selections.filter((item) => item.hit).length;
  const lateCount = selections.filter((item) => item.lateAtSelection).length;
  const earlySelections = selections.filter((item) => !item.lateAtSelection);
  const earlyHitCount = earlySelections.filter((item) => item.hit).length;
  const hitRatePct = round((hitCount / selections.length) * 100);
  const lateRatePct = round((lateCount / selections.length) * 100);
  const earlyHitRatePct = earlySelections.length > 0 ? round((earlyHitCount / earlySelections.length) * 100) : 0;
  const avgMfePct = round(mean(selections.map((item) => item.mfePct)));
  const avgMaePct = round(mean(selections.map((item) => item.maePct)));
  const avgMoveAtSelectionPct = round(mean(selections.map((item) => Math.abs(item.movePct))));
  const qualityScore = round(
    hitRatePct +
    earlyHitRatePct * 0.7 +
    avgMfePct * 0.35 -
    avgMaePct * 0.45 -
    lateRatePct * 0.35 -
    avgMoveAtSelectionPct * 0.15,
  );

  return {
    avgConfidence: round(mean(selections.map((item) => item.auditCase.signal.confidence))),
    avgMaePct,
    avgMfePct,
    avgMoveAtSelectionPct,
    avgVolumeRatio: round(mean(selections.map((item) => item.volumeRatio))),
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

function summarizeOpportunityLane(
  lane: ProfessionalAuditOpportunityLaneName,
  nodes: ProfessionalAuditRoundNode[],
): ProfessionalAuditOpportunityLaneMetric {
  const laneNodes = nodes.filter((node) => node.opportunityLane === lane);
  const captured = laneNodes.filter((node) => node.capturedByRadar);
  const hitCount = laneNodes.filter((node) => node.hit).length;
  const lateCount = laneNodes.filter((node) => node.lateAtSelection).length;
  const ranks = laneNodes
    .map((node) => node.radarRank)
    .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));

  return {
    avgRadarRank: ranks.length > 0 ? round(mean(ranks)) : null,
    avgRadarScore: round(mean(laneNodes.map((node) => node.radarScore))),
    captureRatePct: laneNodes.length > 0 ? round((captured.length / laneNodes.length) * 100) : 0,
    capturedCount: captured.length,
    hitCount,
    hitRatePct: laneNodes.length > 0 ? round((hitCount / laneNodes.length) * 100) : 0,
    label: opportunityLaneLabels[lane],
    lane,
    lateCount,
    lateRatePct: laneNodes.length > 0 ? round((lateCount / laneNodes.length) * 100) : 0,
    missedEarlyHitCount: laneNodes.filter((node) => !node.capturedByRadar && node.hit && !node.lateAtSelection).length,
    planReadyCount: laneNodes.filter((node) => node.maturity === "TRADE_PLAN_READY").length,
    selectedCount: captured.length,
    totalNodes: laneNodes.length,
  };
}

function buildOpportunityLaneMetrics(nodes: ProfessionalAuditRoundNode[]) {
  return ([
    "early_setup",
    "pullback_retest",
    "higher_timeframe_context",
    "risk_review",
  ] as const).map((lane) => summarizeOpportunityLane(lane, nodes));
}

function buildPlanBlockerMetrics(nodes: ProfessionalAuditRoundNode[]): ProfessionalAuditPlanBlockerMetric[] {
  const grouped = new Map<string, { count: number; sampleSymbols: string[] }>();

  for (const node of nodes) {
    for (const blocker of node.planBlockers) {
      const current = grouped.get(blocker) ?? { count: 0, sampleSymbols: [] };

      current.count += 1;

      if (!current.sampleSymbols.includes(node.symbol) && current.sampleSymbols.length < 6) {
        current.sampleSymbols.push(node.symbol);
      }

      grouped.set(blocker, current);
    }
  }

  return [...grouped.entries()]
    .map(([blocker, value]) => ({
      blocker,
      count: value.count,
      label: professionalAuditPlanBlockerLabel(blocker),
      sampleSymbols: value.sampleSymbols,
    }))
    .sort((left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker));
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

    return right.radarScore - left.radarScore ||
      right.auditCase.signal.confidence - left.auditCase.signal.confidence;
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

function percent(count: number, total: number) {
  return total > 0 ? round(count / total * 100) : 0;
}

function capabilityStatus(
  score: number,
  hardFail: boolean,
): ProfessionalCoreCapabilityMetric["status"] {
  if (hardFail || score < 50) {
    return "fail";
  }

  if (score < 75) {
    return "watch";
  }

  return "pass";
}

function blockerCount(metrics: ProfessionalAuditPlanBlockerMetric[], blockers: string[]) {
  return metrics
    .filter((metric) => blockers.includes(metric.blocker))
    .reduce((sum, metric) => sum + metric.count, 0);
}

function blockerSamples(metrics: ProfessionalAuditPlanBlockerMetric[], blockers: string[]) {
  const symbols: string[] = [];

  for (const metric of metrics.filter((item) => blockers.includes(item.blocker))) {
    for (const symbol of metric.sampleSymbols) {
      if (!symbols.includes(symbol) && symbols.length < 6) {
        symbols.push(symbol);
      }
    }
  }

  return symbols;
}

function failure({
  code,
  count,
  detail,
  label,
  nextAction,
  sampleSymbols = [],
}: Omit<ProfessionalCoreCapabilityFailure, "sampleSymbols"> & { sampleSymbols?: string[] }): ProfessionalCoreCapabilityFailure {
  return {
    code,
    count,
    detail,
    label,
    nextAction,
    sampleSymbols,
  };
}

function buildScanCapabilityMetric({
  baselineMetrics,
  nodes,
  opportunityLaneMetrics,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  nodes: ProfessionalAuditRoundNode[];
  opportunityLaneMetrics: ProfessionalAuditOpportunityLaneMetric[];
}): ProfessionalCoreCapabilityMetric {
  const actionableNodes = nodes.filter((node) => node.opportunityLane !== "risk_review");
  const captured = actionableNodes.filter((node) => node.capturedByRadar);
  const earlyUsefulCaptured = actionableNodes.filter((node) => node.capturedByRadar && node.hit && !node.lateAtSelection);
  const missedEarlyHit = actionableNodes.filter((node) => !node.capturedByRadar && node.hit && !node.lateAtSelection);
  const earlyLane = opportunityLaneMetrics.find((item) => item.lane === "early_setup");
  const radar = baselineMetrics.radar;
  const random = baselineMetrics.random;
  const qualityAdvantage = radar.qualityScore - random.qualityScore;
  const captureRatePct = percent(captured.length, actionableNodes.length);
  const earlyCaptureRatePct = earlyLane?.captureRatePct ?? 0;
  const lateRatePct = radar.lateRatePct;
  const qualityComponent = clamp(50 + qualityAdvantage * 8, 0, 100);
  const score = round(
    captureRatePct * 0.34 +
    earlyCaptureRatePct * 0.30 +
    qualityComponent * 0.22 +
    (100 - lateRatePct) * 0.14,
  );
  const failures: ProfessionalCoreCapabilityFailure[] = [];

  if (captureRatePct < 45) {
    failures.push(failure({
      code: "scan_capture_low",
      count: actionableNodes.length - captured.length,
      detail: `可交易机会池 TopN 捕获率只有 ${captureRatePct}%，说明真正值得测的节点没有稳定进前排。`,
      label: "机会捕获率不足",
      nextAction: "先复查候选排序和深扫名额分配，不要继续叠加新功能。",
      sampleSymbols: actionableNodes.filter((node) => !node.capturedByRadar).slice(0, 6).map((node) => node.symbol),
    }));
  }

  if (earlyLane && earlyLane.totalNodes > 0 && earlyLane.captureRatePct < 30) {
    failures.push(failure({
      code: "scan_early_capture_low",
      count: earlyLane.totalNodes - earlyLane.capturedCount,
      detail: `启动前机会捕获率只有 ${earlyLane.captureRatePct}%，这直接违背“提前感知”的核心目标。`,
      label: "启动前机会捕获不足",
      nextAction: "提高压缩、早期放量、靠近关键位和相对强弱在扫描排序里的优先级。",
      sampleSymbols: actionableNodes.filter((node) => node.opportunityLane === "early_setup" && !node.capturedByRadar).slice(0, 6).map((node) => node.symbol),
    }));
  }

  if (radar.count > 0 && random.count > 0 && radar.qualityScore <= random.qualityScore) {
    failures.push(failure({
      code: "scan_not_better_than_random",
      count: radar.count,
      detail: `雷达质量分 ${radar.qualityScore} 没有跑赢随机 ${random.qualityScore}。`,
      label: "没有证明强于随机",
      nextAction: "冻结其它整改，先重构扫描排序目标函数。",
    }));
  }

  if (missedEarlyHit.length > 0) {
    failures.push(failure({
      code: "scan_missed_early_hit",
      count: missedEarlyHit.length,
      detail: `${missedEarlyHit.length} 个不晚到且事后命中的样本没有进 TopN。`,
      label: "漏掉早期有效机会",
      nextAction: "把这些样本作为下一轮扫描排序校准集。",
      sampleSymbols: missedEarlyHit.slice(0, 6).map((node) => node.symbol),
    }));
  }

  return {
    failedNodes: Math.max(0, actionableNodes.length - earlyUsefulCaptured.length),
    id: "scan",
    keyMetrics: {
      actionableNodes: actionableNodes.length,
      captureRatePct,
      earlyCaptureRatePct,
      lateRatePct,
      missedEarlyHitCount: missedEarlyHit.length,
      radarQualityScore: radar.qualityScore,
      randomQualityScore: random.qualityScore,
    },
    label: "扫描：提前发现能力",
    mainFailures: failures,
    nextAction: failures.length > 0
      ? "先重整候选排序和提前机会识别，不做 UI 或其它功能扩展。"
      : "继续扩大样本验证扫描稳定性。",
    passedNodes: earlyUsefulCaptured.length,
    passRatePct: percent(earlyUsefulCaptured.length, actionableNodes.length),
    score,
    status: capabilityStatus(score, failures.some((item) => item.code === "scan_not_better_than_random" || item.code === "scan_early_capture_low")),
    summary: failures.length > 0
      ? "扫描能力未达标：系统还不能稳定把启动前机会提前推到前排。"
      : "扫描能力本轮通过基础门槛，但仍需连续多轮验证。",
    testedNodes: actionableNodes.length,
  };
}

function buildAnalysisCapabilityMetric({
  nodes,
  planBlockerMetrics,
}: {
  nodes: ProfessionalAuditRoundNode[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
}): ProfessionalCoreCapabilityMetric {
  const selected = nodes.filter((node) => node.capturedByRadar);
  const useful = selected.filter((node) => node.hit && !node.lateAtSelection && node.opportunityLane !== "risk_review");
  const falsePositive = selected.filter((node) => !node.hit || node.lateAtSelection || node.opportunityLane === "risk_review");
  const unclearCount = blockerCount(planBlockerMetrics, ["neutral_direction"]);
  const structureBrokenCount = blockerCount(planBlockerMetrics, ["bear_structure_broken", "bull_structure_broken", "structure_invalidated"]);
  const exhaustionCount = blockerCount(planBlockerMetrics, ["lower_wick_exhaustion", "upper_wick_exhaustion"]);
  const usefulRatePct = percent(useful.length, selected.length);
  const falsePositiveRatePct = percent(falsePositive.length, selected.length);
  const selectedLateRatePct = percent(selected.filter((node) => node.lateAtSelection).length, selected.length);
  const score = round(
    usefulRatePct * 0.46 +
    (100 - falsePositiveRatePct) * 0.22 +
    (100 - selectedLateRatePct) * 0.18 +
    Math.max(0, 100 - percent(unclearCount + structureBrokenCount, Math.max(1, nodes.length))) * 0.14,
  );
  const failures: ProfessionalCoreCapabilityFailure[] = [];

  if (selected.length === 0) {
    failures.push(failure({
      code: "analysis_no_selected_nodes",
      count: nodes.length,
      detail: "扫描没有选出任何可审计节点，无法判断分析能力。",
      label: "没有可分析样本",
      nextAction: "先修扫描捕获，再评估分析。",
    }));
  }

  if (selected.length > 0 && usefulRatePct < 25) {
    failures.push(failure({
      code: "analysis_useful_rate_low",
      count: selected.length - useful.length,
      detail: `被雷达选中的节点里，真正不晚到且事后有效的比例只有 ${usefulRatePct}%。`,
      label: "分析有效率不足",
      nextAction: "复查方向判断、过热识别、结构状态和机会成熟度分类。",
      sampleSymbols: falsePositive.slice(0, 6).map((node) => node.symbol),
    }));
  }

  if (unclearCount > nodes.length * 0.2) {
    failures.push(failure({
      code: "analysis_direction_unclear",
      count: unclearCount,
      detail: `方向不明确出现 ${unclearCount} 次，说明分析层经常不能判断多空或不该看。`,
      label: "方向判断不清",
      nextAction: "把中性、冲突、等待突破、等待回踩拆开，不要都压成方向不明确。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["neutral_direction"]),
    }));
  }

  if (structureBrokenCount > nodes.length * 0.15) {
    failures.push(failure({
      code: "analysis_structure_gate_noise",
      count: structureBrokenCount,
      detail: `结构破坏类卡点出现 ${structureBrokenCount} 次，需要确认是合理拦截还是结构门控过粗。`,
      label: "结构判断噪声偏高",
      nextAction: "抽样复查多周期结构、关键位和趋势完整度，区分真失效与等待确认。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["bear_structure_broken", "bull_structure_broken", "structure_invalidated"]),
    }));
  }

  if (exhaustionCount > nodes.length * 0.1) {
    failures.push(failure({
      code: "analysis_exhaustion_noise",
      count: exhaustionCount,
      detail: `上/下影线衰竭类问题出现 ${exhaustionCount} 次，需要检查是否误杀启动前波动。`,
      label: "衰竭识别需复核",
      nextAction: "把衰竭信号和正常洗盘/回踩分开验证。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["lower_wick_exhaustion", "upper_wick_exhaustion"]),
    }));
  }

  return {
    failedNodes: Math.max(0, selected.length - useful.length),
    id: "analysis",
    keyMetrics: {
      directionUnclearCount: unclearCount,
      falsePositiveRatePct,
      selectedLateRatePct,
      selectedNodes: selected.length,
      structureBrokenCount,
      usefulRatePct,
    },
    label: "分析：判断机会质量",
    mainFailures: failures,
    nextAction: failures.length > 0
      ? "先抽样复核被选中节点的方向、结构、成熟度和反证，不急着改策略输出。"
      : "继续扩大样本验证分析判断稳定性。",
    passedNodes: useful.length,
    passRatePct: usefulRatePct,
    score,
    status: capabilityStatus(score, selected.length === 0 || usefulRatePct < 15),
    summary: failures.length > 0
      ? "分析能力未达标：系统还不能稳定判断被扫到的币到底值不值得看。"
      : "分析能力本轮通过基础门槛，但仍需连续多轮验证。",
    testedNodes: selected.length,
  };
}

function buildStrategyCapabilityMetric({
  nodes,
  planBlockerMetrics,
}: {
  nodes: ProfessionalAuditRoundNode[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
}): ProfessionalCoreCapabilityMetric {
  const planReady = nodes.filter((node) => node.maturity === "TRADE_PLAN_READY");
  const rrQualified = nodes.filter((node) => typeof node.rewardRisk === "number" && node.rewardRisk >= 3);
  const usablePlans = planReady.filter((node) => typeof node.rewardRisk === "number" && node.rewardRisk >= 3 && node.hit && !node.lateAtSelection);
  const rrBelowCount = blockerCount(planBlockerMetrics, ["reward_risk_below_minimum", "reward_risk_unknown", "location_rr"]);
  const stopTargetIssueCount = blockerCount(planBlockerMetrics, ["no_nearest_target", "no_structural_stop", "invalid_nearest_target", "invalid_structural_stop", "stop_distance_too_wide"]);
  const pendingCount = blockerCount(planBlockerMetrics, ["reaction_not_confirmed", "structure_confirmation_pending"]);
  const planReadyRatePct = percent(planReady.length, nodes.length);
  const rrQualifiedRatePct = percent(rrQualified.length, nodes.length);
  const usablePlanRatePct = percent(usablePlans.length, planReady.length);
  const score = planReady.length === 0
    ? 0
    : round(
      usablePlanRatePct * 0.45 +
      rrQualifiedRatePct * 0.25 +
      Math.max(0, 100 - percent(rrBelowCount + stopTargetIssueCount, Math.max(1, nodes.length))) * 0.30,
    );
  const failures: ProfessionalCoreCapabilityFailure[] = [];

  if (planReady.length === 0) {
    failures.push(failure({
      code: "strategy_no_ready_plan",
      count: nodes.length,
      detail: "本轮没有任何 TRADE_PLAN_READY，策略能力无法证明可执行。",
      label: "没有交易计划就绪样本",
      nextAction: "先判断是合理风控全部拦截，还是 RR/止损/目标/确认规则错杀。",
    }));
  }

  if (rrBelowCount > nodes.length * 0.25) {
    failures.push(failure({
      code: "strategy_rr_blocked",
      count: rrBelowCount,
      detail: `结构盈亏比不足或未知类卡点出现 ${rrBelowCount} 次。`,
      label: "结构盈亏比卡点过多",
      nextAction: "复查目标位生成、止损位选择和等待更好位置的表达，不降低 3:1 门槛。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["reward_risk_below_minimum", "reward_risk_unknown", "location_rr"]),
    }));
  }

  if (stopTargetIssueCount > nodes.length * 0.1) {
    failures.push(failure({
      code: "strategy_stop_target_issue",
      count: stopTargetIssueCount,
      detail: `止损/目标位质量问题出现 ${stopTargetIssueCount} 次。`,
      label: "止损目标质量不足",
      nextAction: "先修关键位、结构止损和目标位投射，再谈策略准确率。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["no_nearest_target", "no_structural_stop", "invalid_nearest_target", "invalid_structural_stop", "stop_distance_too_wide"]),
    }));
  }

  if (pendingCount > nodes.length * 0.1) {
    failures.push(failure({
      code: "strategy_confirmation_pending",
      count: pendingCount,
      detail: `等待确认类卡点出现 ${pendingCount} 次，需要把“不能做”和“等什么”讲清楚。`,
      label: "确认条件表达不足",
      nextAction: "把 WAIT_PULLBACK / WAIT_RETEST 的触发条件、失效条件和复查点输出清楚。",
      sampleSymbols: blockerSamples(planBlockerMetrics, ["reaction_not_confirmed", "structure_confirmation_pending"]),
    }));
  }

  return {
    failedNodes: Math.max(0, nodes.length - usablePlans.length),
    id: "strategy",
    keyMetrics: {
      planReadyCount: planReady.length,
      planReadyRatePct,
      rrBelowCount,
      rrQualifiedCount: rrQualified.length,
      rrQualifiedRatePct,
      stopTargetIssueCount,
      usablePlanRatePct,
    },
    label: "策略：计划可执行性",
    mainFailures: failures,
    nextAction: failures.length > 0
      ? "先重查 RR、止损、目标和等待条件，禁止为了提高计划数降低风控门槛。"
      : "继续用更多样本验证计划先到 TP/SL 的真实表现。",
    passedNodes: usablePlans.length,
    passRatePct: percent(usablePlans.length, nodes.length),
    score,
    status: capabilityStatus(score, planReady.length === 0),
    summary: failures.length > 0
      ? "策略能力未达标：系统还不能稳定给出可执行、可验证、可失效的交易计划。"
      : "策略能力本轮通过基础门槛，但仍需连续多轮验证。",
    testedNodes: nodes.length,
  };
}

function buildCoreCapabilityMetrics({
  baselineMetrics,
  nodes,
  opportunityLaneMetrics,
  planBlockerMetrics,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  nodes: ProfessionalAuditRoundNode[];
  opportunityLaneMetrics: ProfessionalAuditOpportunityLaneMetric[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
}): ProfessionalCoreCapabilityMetric[] {
  return [
    buildScanCapabilityMetric({
      baselineMetrics,
      nodes,
      opportunityLaneMetrics,
    }),
    buildAnalysisCapabilityMetric({
      nodes,
      planBlockerMetrics,
    }),
    buildStrategyCapabilityMetric({
      nodes,
      planBlockerMetrics,
    }),
  ];
}

function buildCoreCapabilityFindings(metrics: ProfessionalCoreCapabilityMetric[]): ProfessionalAuditFinding[] {
  return metrics.flatMap((metric): ProfessionalAuditFinding[] => {
    if (metric.status === "pass") {
      return [];
    }

    const firstFailure = metric.mainFailures[0];

    return [aggregateFinding({
      detail: `${metric.summary} 分数 ${metric.score}，通过率 ${metric.passRatePct}%。${firstFailure ? `主要问题：${firstFailure.label}，${firstFailure.detail}` : ""}`,
      id: `PBA-CORE-${metric.id.toUpperCase()}-001`,
      layer: metric.id === "scan" ? "scan" : metric.id === "analysis" ? "structure" : "plan",
      nextAction: metric.nextAction,
      rootCause: firstFailure?.detail ?? "三大核心能力没有达到本轮验收门槛。",
      severity: metric.status === "fail" ? "high" : "medium",
      title: `${metric.label}未达标`,
    })];
  });
}

function aggregateFindings({
  baselineMetrics,
  candidateUniverseSize,
  nodes,
  opportunityLaneMetrics,
  planBlockerMetrics,
  topN,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  candidateUniverseSize: number;
  nodes: ProfessionalAuditRoundNode[];
  opportunityLaneMetrics: ProfessionalAuditOpportunityLaneMetric[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
  topN: number;
}) {
  const findings: ProfessionalAuditFinding[] = [];
  const radar = baselineMetrics.radar;
  const random = baselineMetrics.random;
  const momentum = baselineMetrics.momentum;
  const actionableNodes = nodes.filter((item) => item.opportunityLane !== "risk_review");
  const selectedNodes = nodes.filter((item) => item.selectedAsOpportunity);
  const captureRate = actionableNodes.length > 0
    ? actionableNodes.filter((item) => item.capturedByRadar).length / actionableNodes.length * 100
    : 0;
  const lateRate = selectedNodes.length > 0
    ? selectedNodes.filter((item) => item.lateAtSelection).length / selectedNodes.length * 100
    : 0;
  const missedEarlyHits = actionableNodes.filter((item) => !item.capturedByRadar && item.hit && !item.lateAtSelection);
  const topPlanBlocker = planBlockerMetrics[0] ?? null;
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

  if (actionableNodes.length > 0 && captureRate < 45) {
    findings.push(aggregateFinding({
      detail: `可交易机会池 radar topN 捕获率 ${round(captureRate)}%。风险复盘样本已剔除，仍然偏低，说明系统可能漏掉真正有布局价值的节点。`,
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
      detail: `雷达实际选中样本迟到率 ${round(lateRate)}%，提示系统仍可能在涨完/跌完后才提示。所有节点最高迟到集中区：${dominantLateRole ? `${dominantLateRole.key} ${dominantLateRole.count}/${dominantLateRole.total} (${dominantLateRole.rate}%)` : "暂无可归因分组"}。`,
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

  const earlyLane = opportunityLaneMetrics.find((item) => item.lane === "early_setup");
  const pullbackLane = opportunityLaneMetrics.find((item) => item.lane === "pullback_retest");

  if (earlyLane && earlyLane.totalNodes > 0 && earlyLane.missedEarlyHitCount > 0) {
    findings.push(aggregateFinding({
      detail: `启动前机会池共有 ${earlyLane.totalNodes} 个节点，其中 ${earlyLane.missedEarlyHitCount} 个不晚到且事后命中但未被选中。`,
      id: "PBA-SCAN-LANE-EARLY-001",
      layer: "scan",
      nextAction: "继续强化压缩、早期量能、主动买卖压力和靠近关键位的优先级。",
      rootCause: "启动前机会分层仍没有稳定把早期样本推入 TopN。",
      severity: "high",
      title: "启动前机会池仍有漏判",
    }));
  }

  if (pullbackLane && pullbackLane.totalNodes > 0 && pullbackLane.captureRatePct < 40) {
    findings.push(aggregateFinding({
      detail: `回踩/反抽确认机会池捕获率 ${pullbackLane.captureRatePct}%，低于 40%。这会导致系统错过更接近可执行位置的二次机会。`,
      id: "PBA-SCAN-LANE-PULLBACK-001",
      layer: "scan",
      nextAction: "检查回踩区间、位置质量和缩量承接/反抽承压特征是否权重不足。",
      rootCause: "回踩确认类机会没有获得足够深扫/排序名额。",
      severity: "medium",
      title: "回踩确认机会捕获不足",
    }));
  }

  if (nodes.length > 0 && topPlanBlocker && nodes.every((node) => node.maturity !== "TRADE_PLAN_READY")) {
    findings.push(aggregateFinding({
      detail: `本轮没有交易计划就绪样本；最常见阻断是 ${topPlanBlocker.label}，出现 ${topPlanBlocker.count} 次，代表币种 ${topPlanBlocker.sampleSymbols.join(" / ") || "暂无"}。`,
      id: "PBA-PLAN-BLOCKER-ROUND-001",
      layer: "plan",
      nextAction: "不要强行生成交易计划；先判断阻断是合理风控，还是结构/RR/确认规则过严导致错杀。",
      rootCause: "证据链到交易计划之间的门禁没有形成可执行通过样本。",
      severity: "high",
      title: "交易计划未就绪原因需要专项处理",
    }));
  }

  if (radar.count > 0 && radar.hitRatePct < 8) {
    findings.push(aggregateFinding({
      detail: `radar 原始命中率 ${radar.hitRatePct}%，提前命中率 ${radar.earlyHitRatePct}%，质量分 ${radar.qualityScore}。这说明系统虽然可能更早、更少追涨，但绝对捕捉强度仍不足。`,
      id: "PBA-SCAN-ROUND-HIT-001",
      layer: "scan",
      nextAction: "继续强化量能刚启动、主动买卖压力、关键位靠近和相对强弱特征；下一轮重点看质量分和提前命中率是否同步提升。",
      rootCause: "当前雷达排序对后续可观波动的识别强度不足。",
      severity: "high",
      title: "10x10 审计雷达绝对命中率不足",
    }));
  }

  if (radar.count > 0 && random.count > 0 && radar.qualityScore <= random.qualityScore) {
    findings.push(aggregateFinding({
      detail: `radar 质量分=${radar.qualityScore}，random 质量分=${random.qualityScore}；radar 命中率=${radar.hitRatePct}%，提前命中率=${radar.earlyHitRatePct}%，迟到率=${radar.lateRatePct}%。系统没有证明比随机更强。`,
      id: "PBA-SCAN-ROUND-BASELINE-001",
      layer: "scan",
      nextAction: "先修候选排序和提前性特征，再扩大测试样本。",
      rootCause: "雷达排序在本轮 10x10 样本中没有形成优势。",
      severity: "high",
      title: "10x10 审计未跑赢随机基线",
    }));
  } else if (radar.count > 0 && random.count > 0 && radar.hitRatePct <= random.hitRatePct) {
    findings.push(aggregateFinding({
      detail: `radar 原始命中率 ${radar.hitRatePct}% 低于 random ${random.hitRatePct}%，但质量分 ${radar.qualityScore} 高于 random ${random.qualityScore}，说明雷达更早/更少追涨；仍需提高绝对命中率。`,
      id: "PBA-SCAN-ROUND-BASELINE-001A",
      layer: "scan",
      nextAction: "保留提前性优势，同时提高量能/结构确认强度，避免只做到“早但不够准”。",
      rootCause: "提前性约束降低了追涨命中，但有效波动捕捉还不够。",
      severity: "medium",
      title: "10x10 审计原始命中率低于随机但提前质量较好",
    }));
  }

  if (radar.count > 0 && momentum.count > 0 && radar.qualityScore <= momentum.qualityScore) {
    findings.push(aggregateFinding({
      detail: `radar 质量分=${radar.qualityScore}，momentum 质量分=${momentum.qualityScore}；momentum 迟到率=${momentum.lateRatePct}%。如果雷达质量分也输给动量，系统没有证明自己能提前过滤追涨噪声。`,
      id: "PBA-SCAN-ROUND-BASELINE-002",
      layer: "scan",
      nextAction: "复查波动压缩、相对强弱、启动前量能和关键位靠近程度的权重。",
      rootCause: "提前发现特征没有跑赢简单动量榜。",
      severity: "medium",
      title: "10x10 审计未跑赢动量基线",
    }));
  } else if (radar.count > 0 && momentum.count > 0 && radar.hitRatePct <= momentum.hitRatePct) {
    findings.push(aggregateFinding({
      detail: `momentum 原始命中率 ${momentum.hitRatePct}% 高于 radar ${radar.hitRatePct}%，但 momentum 迟到率 ${momentum.lateRatePct}%，radar 质量分 ${radar.qualityScore}。该结果说明动量更会追已发生行情，不能直接证明雷达失败。`,
      id: "PBA-SCAN-ROUND-BASELINE-002A",
      layer: "scan",
      nextAction: "继续把动量强但迟到的样本归为复盘教材，把雷达优化重点放在提前命中率和低回撤上。",
      rootCause: "动量基线包含大量晚到样本，原始命中率不等于可交易优势。",
      severity: "low",
      title: "10x10 审计原始命中率低于动量但需按提前质量解释",
    }));
  }

  return findings;
}

function aggregateRemediations(findings: ProfessionalAuditFinding[]): ProfessionalAuditRemediation[] {
  const remediations: ProfessionalAuditRemediation[] = [];

  if (findings.some((item) => item.id === "PBA-SCAN-ROUND-HIT-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮同样 10x10 样本 radar 质量分高于 random，且原始命中率、提前命中率至少有一项改善。",
      action: "强化量能刚启动、主动买卖代理、关键位靠近和相对强弱特征；继续保留追涨/追空拦截。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "professional audit radar quality scoring",
    });
  }

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

  if (findings.some((item) => item.id === "PBA-SCAN-ROUND-BASELINE-001" || item.id === "PBA-SCAN-ROUND-BASELINE-001A")) {
    remediations.push({
      acceptanceCriteria: "下一轮报告同时展示原始命中率、提前命中率、迟到率和质量分；radar 质量分必须高于 random。",
      action: "用质量分替代单一命中率做基线判断，避免把追涨随机样本误判为更优。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "professional audit baseline comparison",
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

  if (findings.some((item) => item.id === "PBA-SCAN-LANE-EARLY-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮启动前机会池 missedEarlyHitCount 下降，并且早期机会能进入固定配额。",
      action: "把启动前机会池独立配额写入 radar TopN，不再让已涨完/已跌深样本抢占全部名额。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "professional audit opportunity lane allocation",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-LANE-PULLBACK-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮回踩/反抽确认机会池捕获率高于 40%，并能解释未捕获样本。",
      action: "给回踩/反抽确认机会独立 TopN 配额，复查位置质量和缩量承接/反抽承压特征。",
      canAutoApply: false,
      layer: "scan",
      priority: "P1",
      targetModule: "professional audit pullback lane allocation",
    });
  }

  if (findings.some((item) => item.id === "PBA-PLAN-BLOCKER-ROUND-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮报告能按 blocker 说明计划未就绪原因，并区分合理风控与规则错杀。",
      action: "把 tradePlan.blockedBy 聚合到专业回测报告，逐项复核 RR、结构止损、目标位和反应确认。",
      canAutoApply: false,
      layer: "plan",
      priority: "P0",
      targetModule: "professional audit trade plan blocker diagnostics",
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
  const legacyHorizonBars = Math.max(1, Math.round(options.horizonBars ?? 96));
  const horizonBarsByBand = resolveProfessionalAuditHorizonBarsByBand(
    options.horizonBarsByBand ?? {
      large: options.horizonBars,
      medium: options.horizonBars,
      small: options.horizonBars,
    },
  );
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

    const selectedNodes = selectNodeIndexes(candles, nodesPerSymbol, horizonBarsByBand);

    for (const selected of selectedNodes) {
      const candidatesAtNode: CandidateAtNode[] = [];

      for (const [symbol, candidateCandles] of candlesBySymbol.entries()) {
        const candidate = buildCandidateAtNode({
          candles: candidateCandles,
          derivatives: derivativesBySymbol?.get(symbol),
          horizonBars: selected.horizonBars,
          index: selected.index,
          moveThresholdPct,
          nodeRole: symbol === symbolPlan.symbol ? selected.role : undefined,
          symbol,
          timeframeBand: selected.band,
        });

        if (candidate) {
          candidatesAtNode.push(candidate);
        }
      }

      const target = candidatesAtNode.find((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol);

      if (!target) {
        continue;
      }

      const radarSelection = selectProfessionalAuditOpportunityCandidates(candidatesAtNode, topN);
      const selectedTarget = radarSelection.selected.find((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol);
      const rankedTargetIndex = radarSelection.ranked.findIndex((candidate) => candidate.auditCase.inputSummary.symbol === symbolPlan.symbol);
      const radarRank = rankedTargetIndex >= 0 ? rankedTargetIndex + 1 : null;
      const capturedByRadar = Boolean(selectedTarget);

      laneSelections.radar.push(...radarSelection.selected);
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
        opportunityLane: target.opportunityLane,
        opportunityLaneLabel: opportunityLaneLabels[target.opportunityLane],
        opportunityLaneScore: target.opportunityLaneScore,
        planBlockers: target.planBlockers,
        radarRank,
        radarScore: target.radarScore,
        rewardRisk: target.rewardRisk,
        selectedAsOpportunity: capturedByRadar,
        selectedLane: selectedTarget?.opportunityLane ?? null,
        symbol: symbolPlan.symbol,
        timeframeBand: selected.band,
        tradePlanStatus: target.tradePlanStatus,
        validationWindowBars: selected.horizonBars,
        validationWindowHours: round(selected.horizonBars / 4, 2),
        validationWindowLabel: validationWindowLabel(selected.horizonBars),
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
  const opportunityLaneMetrics = buildOpportunityLaneMetrics(nodes);
  const planBlockerMetrics = buildPlanBlockerMetrics(nodes);
  const coreCapabilityMetrics = buildCoreCapabilityMetrics({
    baselineMetrics,
    nodes,
    opportunityLaneMetrics,
    planBlockerMetrics,
  });
  const timingMetrics = {
    earlyCount: nodes.filter((item) => item.selectedAsOpportunity && !item.lateAtSelection).length,
    earlyRatePct: nodes.filter((item) => item.selectedAsOpportunity).length > 0
      ? round(nodes.filter((item) => item.selectedAsOpportunity && !item.lateAtSelection).length / nodes.filter((item) => item.selectedAsOpportunity).length * 100)
      : 0,
    lateCount: nodes.filter((item) => item.selectedAsOpportunity && item.lateAtSelection).length,
    lateRatePct: nodes.filter((item) => item.selectedAsOpportunity).length > 0
      ? round(nodes.filter((item) => item.selectedAsOpportunity && item.lateAtSelection).length / nodes.filter((item) => item.selectedAsOpportunity).length * 100)
      : 0,
    noPlanCount: nodes.filter((item) => item.maturity !== "TRADE_PLAN_READY").length,
    planReadyCount: nodes.filter((item) => item.maturity === "TRADE_PLAN_READY").length,
  };
  const aggregate = aggregateFindings({
    baselineMetrics,
    candidateUniverseSize,
    nodes,
    opportunityLaneMetrics,
    planBlockerMetrics,
    topN,
  });
  const coreFindings = buildCoreCapabilityFindings(coreCapabilityMetrics);
  const findings = sortFindings([...cases.flatMap((item) => item.findings), ...aggregate, ...coreFindings]);
  const baseSummary = summarizeProfessionalBacktestRound(cases);
  const highSeverityFindings = findings.filter((item) => item.severity === "high").length;
  const roundSummary = {
    ...baseSummary,
    highSeverityFindings,
  };
  const missedOpportunities = nodes
    .filter((item) => !item.capturedByRadar && item.hit && !item.lateAtSelection)
    .map((item) => ({
      coinType: item.coinType,
      coinTypeLabel: item.coinTypeLabel,
      confidence: item.confidence,
      direction: item.direction,
      maePct: item.maePct,
      mfePct: item.mfePct,
      moveAtSelectionPct: item.moveAtSelectionPct,
      nodeRole: item.nodeRole,
      observedAt: item.observedAt,
      opportunityLane: item.opportunityLane,
      opportunityLaneLabel: item.opportunityLaneLabel,
      planBlockers: item.planBlockers,
      radarRank: item.radarRank,
      reason: `该目标节点事后达到波动阈值，但当时 radar 排名第 ${item.radarRank ?? "未知"}，未进入 Top${item.topN}；用于检查扫描覆盖、候选排序和深扫槽位。`,
      rewardRisk: item.rewardRisk,
      symbol: item.symbol,
      timeframeBand: item.timeframeBand,
      tradePlanStatus: item.tradePlanStatus,
      validationWindowLabel: item.validationWindowLabel,
      volumeRatio: item.volumeRatio,
    }));
  const remediationPlan = uniqueRemediations(cases, aggregateRemediations([...aggregate, ...coreFindings]));
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
      horizonBars: legacyHorizonBars,
      replayTimes: nodes.length,
      symbolsUsed: [...candlesBySymbol.keys()],
      topN,
    },
    missedOpportunities,
    coreCapabilityMetrics,
    opportunityLaneMetrics,
    planBlockerMetrics,
    remediationPlan,
    roundSummary,
    schemaVersion: "professional-backtest-audit-report.v2",
    summary: auditRound.summary,
    timingMetrics,
  };
}
