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
  type ProfessionalAuditMarketRegimeMetric,
  type ProfessionalCoreCapabilityFailure,
  type ProfessionalCoreCapabilityMetric,
  type ProfessionalAuditLevelQualityMetric,
  type ProfessionalAuditLevelQualityReason,
  type ProfessionalAuditOpportunityLaneMetric,
  type ProfessionalAuditOpportunityLaneName,
  type ProfessionalAuditPlanBlockerMetric,
  type ProfessionalAuditPressureTestMetric,
  type ProfessionalAuditOpportunityQualityId,
  type ProfessionalAuditOpportunityQualityMetric,
  type ProfessionalAuditRuleStabilityMetric,
  type ProfessionalAuditWaitPlanEvaluation,
  type ProfessionalAuditWaitPlanMetric,
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
  opportunityQuality: ProfessionalAuditOpportunityQualityId;
  opportunityQualityLabel: string;
  planBlockers: string[];
  qualityHit: boolean;
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
  waitPlanEvaluation: ProfessionalAuditWaitPlanEvaluation;
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
  opportunityQuality: ProfessionalAuditOpportunityQualityId;
  opportunityQualityLabel: string;
  planBlockers: string[];
  qualityHit: boolean;
  radarScore: number;
  randomScore: number;
  rangePositionPct: number;
  rewardRisk: number | null;
  tradePlanStatus: string;
  volumeRatio: number;
  waitPlanEvaluation: ProfessionalAuditWaitPlanEvaluation;
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

const opportunityQualityLabels: Record<ProfessionalAuditOpportunityQualityId, string> = {
  fakeout_risk: "假突破风险",
  late_move: "已经晚了",
  noise: "噪音",
  premium_early_setup: "优质启动前",
  trade_plan_ready: "可生成交易计划",
  watch_only: "值得观察但不能做",
};

const opportunityQualityNextActions: Record<ProfessionalAuditOpportunityQualityId, string> = {
  fakeout_risk: "只做风险提示和等待确认，不能把未确认突破/跌破包装成交易计划。",
  late_move: "降级为等待回踩/反抽或复盘教材，不允许进入狙击榜。",
  noise: "过滤低质量波动，要求至少形成结构、量能、位置或相对强弱共振再进入候选。",
  premium_early_setup: "优先检查是否进入 TopN、是否得到深扫验证，以及是否清楚写出下一步确认条件。",
  trade_plan_ready: "继续后验 TP/SL、MFE/MAE 和失效条件，验证计划不是纸面可行。",
  watch_only: "保留观察价值，但必须说清缺什么、等什么、什么情况升级或失效。",
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
  direction_pending_quiet_setup: "方向待确认的安静早期机会",
  neutral_direction: "方向不明确",
  no_nearest_target: "缺少最近目标",
  no_recent_touch: "近期没有触碰关键位",
  no_relevant_level: "缺少可验证关键位",
  no_structural_stop: "缺少结构止损",
  reaction_not_confirmed: "回踩/反抽反应未确认",
  resistance_reclaimed: "价格重新站回压力位",
  reward_risk_below_minimum: "结构盈亏比低于 3:1",
  reward_risk_unknown: "结构盈亏比未知",
  risk_gate_blocked: "风控门禁拦截",
  risk_score_high: "风险评分过高",
  stale_data: "数据过期",
  stop_distance_too_tight: "止损距离过近",
  stop_distance_too_wide: "止损距离过宽",
  structure_confirmation_pending: "结构确认仍在等待",
  structure_invalidated: "结构已经失效",
  support_lost: "支撑位失守",
  trade_plan_not_eligible: "交易计划未满足门禁",
  trade_plan_not_ready: "交易计划未就绪",
  trend_integrity_not_healthy: "趋势完整度不健康",
  upper_wick_exhaustion: "上影线衰竭风险",
  "位置/RR": "结构盈亏比不足或未知",
  "反抽质量": "反抽承压质量不足",
  "周期冲突": "多周期结构冲突",
  "回踩质量": "回踩承接质量不足",
};

export function professionalAuditOpportunityLaneLabel(lane: ProfessionalAuditOpportunityLaneName) {
  return opportunityLaneLabels[lane];
}

export function professionalAuditOpportunityQualityLabel(id: ProfessionalAuditOpportunityQualityId) {
  return opportunityQualityLabels[id];
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

  if (/recent[_ -]?touch|touch|关键位/iu.test(blocker)) {
    return "近期没有触碰关键位";
  }

  if (/level/iu.test(blocker)) {
    return "缺少可验证关键位";
  }

  if (/risk[_ -]?gate|blocked/iu.test(blocker)) {
    return "风控门禁拦截";
  }

  return blocker
    .replaceAll("_", " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

type PlanBlockerCategory = ProfessionalAuditPlanBlockerMetric["category"];
type PlanBlockerDiagnosis = ProfessionalAuditPlanBlockerMetric["diagnosis"];

const planBlockerCategoryMap: Record<PlanBlockerCategory, string[]> = {
  confirmation: [
    "direction_pending_quiet_setup",
    "no_recent_touch",
    "reaction_not_confirmed",
    "structure_confirmation_pending",
  ],
  data: [
    "missing_strategy_v3",
    "missing_trade_plan",
    "stale_data",
  ],
  direction: [
    "neutral_direction",
  ],
  plan_state: [
    "trade_plan_not_eligible",
    "trade_plan_not_ready",
  ],
  risk: [
    "chase_risk",
    "high_weight_conflict",
    "lower_wick_exhaustion",
    "risk_gate_blocked",
    "risk_score_high",
    "upper_wick_exhaustion",
  ],
  rr: [
    "location_rr",
    "reward_risk_below_minimum",
    "reward_risk_unknown",
    "位置/RR",
  ],
  stop_target: [
    "invalid_nearest_target",
    "invalid_structural_stop",
    "no_nearest_target",
    "no_structural_stop",
    "stop_distance_too_tight",
    "stop_distance_too_wide",
  ],
  structure: [
    "bear_structure_broken",
    "bull_structure_broken",
    "no_relevant_level",
    "resistance_reclaimed",
    "structure_invalidated",
    "support_lost",
    "trend_integrity_not_healthy",
    "反抽质量",
    "周期冲突",
    "回踩质量",
  ],
  unknown: [],
};

export function professionalAuditPlanBlockerCategory(blocker: string): PlanBlockerCategory {
  for (const [category, blockers] of Object.entries(planBlockerCategoryMap) as Array<[PlanBlockerCategory, string[]]>) {
    if (blockers.includes(blocker)) {
      return category;
    }
  }

  if (/reward[_ -]?risk|rr|赔率/iu.test(blocker)) {
    return "rr";
  }

  if (/target|stop|止损|目标/iu.test(blocker)) {
    return "stop_target";
  }

  if (/reaction|confirm|touch|确认|触碰/iu.test(blocker)) {
    return "confirmation";
  }

  if (/risk|wick|chase|风控|追/iu.test(blocker)) {
    return "risk";
  }

  if (/structure|support|resistance|结构|支撑|压力/iu.test(blocker)) {
    return "structure";
  }

  return "unknown";
}

const planBlockerCategoryLabels: Record<PlanBlockerCategory, string> = {
  confirmation: "确认条件",
  data: "数据缺口",
  direction: "方向判断",
  plan_state: "计划状态",
  risk: "风险门禁",
  rr: "结构盈亏比",
  stop_target: "止损/目标位",
  structure: "盘面结构",
  unknown: "未归类",
};

const planBlockerDiagnosisLabels: Record<PlanBlockerDiagnosis, string> = {
  needs_data_audit: "需要补数据，不可当成策略结论",
  needs_level_audit: "疑似关键位/RR 规则错杀，优先复查",
  needs_strategy_audit: "需要策略规则专项复查",
  needs_wait_audit: "需要等待计划触发质量专项复查",
  possible_false_kill: "疑似规则错杀，必须复核样本",
  reasonable_guardrail: "更像合理风控拦截，暂不强行放行",
};

export function professionalAuditPlanBlockerCategoryLabel(category: PlanBlockerCategory) {
  return planBlockerCategoryLabels[category];
}

export function professionalAuditPlanBlockerDiagnosisLabel(diagnosis: PlanBlockerDiagnosis) {
  return planBlockerDiagnosisLabels[diagnosis];
}

function professionalAuditPlanBlockerDiagnosis({
  category,
  capturedCount,
  conditionalWaitCount,
  count,
  lateCount,
  qualityHitCount,
  riskReviewCount,
}: {
  category: PlanBlockerCategory;
  capturedCount: number;
  conditionalWaitCount: number;
  count: number;
  lateCount: number;
  qualityHitCount: number;
  riskReviewCount: number;
}): PlanBlockerDiagnosis {
  const qualityRate = count > 0 ? qualityHitCount / count : 0;
  const capturedRate = count > 0 ? capturedCount / count : 0;
  const lateRate = count > 0 ? lateCount / count : 0;
  const riskReviewRate = count > 0 ? riskReviewCount / count : 0;

  if (category === "data") {
    return "needs_data_audit";
  }

  if (category === "confirmation") {
    return qualityHitCount > 0 || conditionalWaitCount > 0
      ? "needs_wait_audit"
      : "needs_strategy_audit";
  }

  if (category === "rr" || category === "stop_target") {
    if (qualityHitCount > 0 || capturedRate >= 0.25) {
      return "needs_level_audit";
    }
    return "reasonable_guardrail";
  }

  if (category === "direction" || category === "plan_state" || category === "unknown") {
    return qualityRate >= 0.2 ? "possible_false_kill" : "needs_strategy_audit";
  }

  if (category === "structure") {
    return qualityRate >= 0.2 && lateRate < 0.5 ? "possible_false_kill" : "reasonable_guardrail";
  }

  if (category === "risk") {
    return riskReviewRate >= 0.3 || lateRate >= 0.35 ? "reasonable_guardrail" : "needs_strategy_audit";
  }

  return "needs_strategy_audit";
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
  nodeRole?: ProfessionalAuditRoundNodeRole;
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

function discoveryRadarComponent(score: number) {
  const normalized = clamp(score, 0, 140);

  if (normalized <= 55) {
    return normalized;
  }

  if (normalized <= 85) {
    return 55 + (normalized - 55) * 0.48;
  }

  return Math.min(78, 69.4 + (normalized - 85) * 0.16);
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

export type ProfessionalAuditOpportunityQualityInput = ProfessionalAuditOpportunityClassifyInput & {
  maturity?: string;
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  planBlockers?: string[];
  rewardRisk?: number | null;
  tradePlanStatus?: string;
};

const qualityHardStructureBlockers = new Set([
  "bear_structure_broken",
  "bull_structure_broken",
  "resistance_reclaimed",
  "support_lost",
  "structure_invalidated",
]);

const qualitySoftWaitBlockers = new Set([
  "direction_pending_quiet_setup",
  "reaction_not_confirmed",
  "structure_confirmation_pending",
  "trade_plan_not_ready",
]);

const qualityOverheatBlockers = new Set([
  "chase_risk",
  "risk_score_high",
  "upper_wick_exhaustion",
  "lower_wick_exhaustion",
]);

function qualityBlockers(input: Pick<ProfessionalAuditOpportunityQualityInput, "planBlockers">) {
  return input.planBlockers ?? [];
}

function hasQualityHardStructureBlocker(input: Pick<ProfessionalAuditOpportunityQualityInput, "planBlockers">) {
  return qualityBlockers(input).some((blocker) => qualityHardStructureBlockers.has(blocker));
}

function hasQualitySoftWaitBlocker(input: Pick<ProfessionalAuditOpportunityQualityInput, "planBlockers">) {
  return qualityBlockers(input).some((blocker) => qualitySoftWaitBlockers.has(blocker));
}

function hasQualityFakeoutRisk(input: ProfessionalAuditOpportunityQualityInput) {
  const blockers = qualityBlockers(input);
  const absMove = Math.abs(input.movePct);
  const extremeForDirection = input.direction === "long"
    ? input.rangePositionPct >= 86
    : input.rangePositionPct <= 14;

  return (
    input.nodeRole === "fakeout_or_invalidation" ||
    blockers.includes("structure_invalidated") ||
    blockers.includes("support_lost") ||
    blockers.includes("resistance_reclaimed") ||
    (extremeForDirection && blockers.some((blocker) => qualityOverheatBlockers.has(blocker))) ||
    (absMove >= 8.5 && blockers.some((blocker) => blocker === "chase_risk" || blocker === "risk_score_high"))
  );
}

function qualityEvidenceCount(input: ProfessionalAuditOpportunityQualityInput) {
  const absMove = Math.abs(input.movePct);
  const rrQualified = typeof input.rewardRisk === "number" && Number.isFinite(input.rewardRisk) && input.rewardRisk >= 3;
  const nonExtremeLocation = input.direction === "long"
    ? input.rangePositionPct >= 16 && input.rangePositionPct <= 82
    : input.rangePositionPct >= 18 && input.rangePositionPct <= 84;
  const controlledVolume = input.volumeRatio >= 0.45 && input.volumeRatio <= 2.6;
  const constructiveRole =
    input.nodeRole === "pre_move" ||
    input.nodeRole === "early_volume_expansion" ||
    input.nodeRole === "breakout_edge" ||
    input.nodeRole === "medium_swing" ||
    input.nodeRole === "pullback_retest" ||
    input.nodeRole === "trend_acceleration";

  let count = 0;

  if (input.compressionPct <= 62) {
    count += 1;
  }

  if (controlledVolume) {
    count += 1;
  }

  if (nonExtremeLocation) {
    count += 1;
  }

  if (constructiveRole) {
    count += 1;
  }

  if (input.opportunityLane === "early_setup" || input.opportunityLane === "pullback_retest") {
    count += 1;
  }

  if (rrQualified || input.tradePlanStatus === "WAIT_PULLBACK" || input.tradePlanStatus === "WAIT_RETEST") {
    count += 1;
  }

  if (absMove <= 5.8 && !input.lateAtSelection) {
    count += 1;
  }

  return count;
}

export function classifyProfessionalAuditOpportunityQuality(
  input: ProfessionalAuditOpportunityQualityInput,
): ProfessionalAuditOpportunityQualityId {
  const absMove = Math.abs(input.movePct);
  const rrQualified = typeof input.rewardRisk === "number" && Number.isFinite(input.rewardRisk) && input.rewardRisk >= 3;
  const planReady =
    input.maturity === "TRADE_PLAN_READY" ||
    input.tradePlanStatus === "TRADE_PLAN_READY" ||
    input.tradePlanStatus === "PLAN_READY";
  const hardStructureBlocker = hasQualityHardStructureBlocker(input);
  const fakeoutRisk = hasQualityFakeoutRisk(input);
  const evidenceCount = qualityEvidenceCount(input);

  if (planReady && rrQualified && !input.lateAtSelection && !fakeoutRisk && !hardStructureBlocker) {
    return "trade_plan_ready";
  }

  if (fakeoutRisk) {
    return "fakeout_risk";
  }

  if (
    input.lateAtSelection ||
    input.opportunityLane === "risk_review" ||
    input.nodeRole === "late_extension" ||
    absMove >= 10
  ) {
    return "late_move";
  }

  if (
    evidenceCount >= 5 &&
    !hardStructureBlocker &&
    absMove <= 6.2
  ) {
    return "premium_early_setup";
  }

  if (
    !hardStructureBlocker &&
    (hasQualitySoftWaitBlocker(input) || evidenceCount >= 3)
  ) {
    return "watch_only";
  }

  return "noise";
}

export function opportunityLaneScore(input: ProfessionalAuditOpportunityClassifyInput & {
  planBlockers?: string[];
  radarScore: number;
  rewardRisk?: number | null;
  tradePlanStatus?: string;
}) {
  const absMove = Math.abs(input.movePct);
  const nonExtremeLocationScore = input.direction === "long"
    ? bandScore(input.rangePositionPct, 16, 38, 84)
    : bandScore(input.rangePositionPct, 16, 62, 84);
  const lane = classifyProfessionalAuditOpportunityLane(input);
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
      ? 8
      : 0;
  const blockers = input.planBlockers ?? [];
  const structuralBlockerCount = blockers.filter((blocker) =>
      blocker === "bear_structure_broken" ||
      blocker === "bull_structure_broken" ||
      blocker === "resistance_reclaimed" ||
      blocker === "support_lost"
  ).length;
  const structuralBlockerPenalty = lane === "early_setup"
    ? Math.min(4, structuralBlockerCount * 1.5)
    : Math.min(12, structuralBlockerCount * 4);
  const softWaitBonus = blockers.some((blocker) =>
    blocker === "direction_pending_quiet_setup" ||
    blocker === "reaction_not_confirmed" ||
    blocker === "structure_confirmation_pending"
  )
    ? 6
    : 0;
  const quietDirectionPendingBonus = blockers.includes("direction_pending_quiet_setup") &&
      absMove <= 3.5 &&
      input.compressionPct <= 62 &&
      input.volumeRatio <= 1.18
    ? 10 + nonExtremeLocationScore * 8
    : 0;
  const genericNeutralPenalty = input.nodeRole === "neutral_random" && absMove <= 2 && input.volumeRatio <= 1.05
    ? input.compressionPct <= 55 && nonExtremeLocationScore >= 0.45 && input.volumeRatio >= 0.58 && input.volumeRatio <= 0.98
      ? 2
      : 16
    : 0;
  const quietNeutralCompressionBonus = input.nodeRole === "neutral_random" &&
      !input.lateAtSelection &&
      absMove <= 2.4 &&
      input.compressionPct <= 56 &&
      input.volumeRatio >= 0.58 &&
      input.volumeRatio <= 1.02 &&
      nonExtremeLocationScore >= 0.42
    ? 12 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.58, 0.82, 1.02) * 8
    : 0;
  const dryUpCompressionSetupBonus = !input.lateAtSelection &&
      lane === "early_setup" &&
      absMove <= 3.4 &&
      input.compressionPct <= 62 &&
      input.volumeRatio >= 0.42 &&
      input.volumeRatio <= 0.9 &&
      nonExtremeLocationScore >= 0.35
    ? 10 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.42, 0.68, 0.9) * 10
    : 0;
  const controlledEarlyVolumeBonus = input.nodeRole === "early_volume_expansion" &&
      !input.lateAtSelection &&
      absMove >= 1.1 &&
      absMove <= 5.8 &&
      input.volumeRatio >= 1.1 &&
      input.volumeRatio <= 2.8 &&
      input.compressionPct <= 68
    ? 12 + bandScore(input.volumeRatio, 1.1, 1.55, 2.8) * 12 + nonExtremeLocationScore * 6
    : 0;
  const quietEarlyVolumeSetupBonus = input.nodeRole === "early_volume_expansion" &&
      !input.lateAtSelection &&
      absMove <= 4.2 &&
      input.volumeRatio >= 0.55 &&
      input.volumeRatio <= 1.25 &&
      input.compressionPct <= 70 &&
      blockers.some((blocker) =>
        blocker === "direction_pending_quiet_setup" ||
        blocker === "structure_confirmation_pending"
      )
    ? 14 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.55, 0.95, 1.25) * 10
    : 0;
  const earlyVolumeTransitionBonus = input.nodeRole === "early_volume_expansion" &&
      !input.lateAtSelection &&
      absMove >= 0.8 &&
      absMove <= 5.2 &&
      input.volumeRatio >= 0.62 &&
      input.volumeRatio <= 1.12 &&
      input.compressionPct <= 72 &&
      nonExtremeLocationScore >= 0.25
    ? 16 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.62, 0.92, 1.12) * 10
    : 0;
  const breakoutEdgeReadinessBonus = input.nodeRole === "breakout_edge" &&
      !input.lateAtSelection &&
      absMove >= 0.8 &&
      absMove <= 5.8 &&
      input.volumeRatio >= 1.02 &&
      input.volumeRatio <= 2.5 &&
      input.compressionPct <= 62
    ? 10 + bandScore(input.volumeRatio, 1.02, 1.35, 2.5) * 8 + nonExtremeLocationScore * 8
    : 0;
  const quietBreakoutEdgeSetupBonus = input.nodeRole === "breakout_edge" &&
      !input.lateAtSelection &&
      absMove <= 4.8 &&
      input.volumeRatio >= 0.55 &&
      input.volumeRatio <= 1.22 &&
      input.compressionPct <= 68 &&
      nonExtremeLocationScore >= 0.35 &&
      blockers.some((blocker) =>
        blocker === "reaction_not_confirmed" ||
        blocker === "structure_confirmation_pending"
      )
    ? 12 + nonExtremeLocationScore * 10 + bandScore(input.volumeRatio, 0.55, 0.9, 1.22) * 8
    : 0;
  const mediumSwingSetupBonus = input.nodeRole === "medium_swing" &&
      input.timeframeBand === "medium" &&
      !input.lateAtSelection &&
      absMove <= 5.8 &&
      input.volumeRatio >= 0.55 &&
      input.volumeRatio <= 2.6 &&
      input.compressionPct <= 72
    ? 14 + nonExtremeLocationScore * 10 + bandScore(absMove, 0.2, 2.6, 5.8) * 8
    : 0;
  const trendAccelerationSetupBonus = input.nodeRole === "trend_acceleration" &&
      input.timeframeBand === "medium" &&
      !input.lateAtSelection &&
      absMove >= 1.2 &&
      absMove <= 7.2 &&
      input.volumeRatio >= 0.8 &&
      input.volumeRatio <= 3.2 &&
      input.compressionPct <= 78 &&
      nonExtremeLocationScore >= 0.28
    ? 12 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.8, 1.45, 3.2) * 10 + bandScore(absMove, 1.2, 4.4, 7.2) * 6
    : 0;
  const quietCompressionPriorityBonus = !input.lateAtSelection &&
      lane === "early_setup" &&
      absMove <= 3.4 &&
      input.compressionPct <= 58 &&
      input.volumeRatio >= 0.42 &&
      input.volumeRatio <= 1.18 &&
      nonExtremeLocationScore >= 0.35 &&
      (
        input.nodeRole === "pre_move" ||
        input.nodeRole === "neutral_random" ||
        input.nodeRole === "medium_swing" ||
        input.nodeRole === undefined
      )
    ? 12 + nonExtremeLocationScore * 8 + bandScore(input.volumeRatio, 0.42, 0.82, 1.18) * 10
    : 0;
  const planViabilityAdjustment = rrQualityBonus + conditionalPlanBonus + softWaitBonus + quietDirectionPendingBonus - structuralBlockerPenalty;

  if (input.lateAtSelection) {
    return round(input.radarScore - 100 - absMove * 2, 4);
  }

  if (lane === "early_setup") {
    const lowVolumeCompressionBonus = input.compressionPct <= 42 && input.volumeRatio <= 1.05
      ? bandScore(input.volumeRatio, 0.35, 0.82, 1.15) * 16
      : 0;
    const quietPreIgnitionBonus = input.nodeRole !== "neutral_random" &&
        absMove <= 2.8 &&
        input.compressionPct <= 55 &&
        input.volumeRatio <= 1.12
      ? 14 + nonExtremeLocationScore * 6 + bandScore(input.volumeRatio, 0.45, 0.82, 1.12) * 8
      : 0;
    const controlledLocationBonus = nonExtremeLocationScore * 10;
    const radarComponent = discoveryRadarComponent(input.radarScore);

    return round(radarComponent + (100 - input.compressionPct) * 0.42 + bandScore(input.volumeRatio, 0.55, 1.25, 2.5) * 12 + lowVolumeCompressionBonus + quietPreIgnitionBonus + quietNeutralCompressionBonus + dryUpCompressionSetupBonus + quietCompressionPriorityBonus + controlledLocationBonus + earlyRoleBonus + controlledEarlyVolumeBonus + quietEarlyVolumeSetupBonus + earlyVolumeTransitionBonus + breakoutEdgeReadinessBonus + quietBreakoutEdgeSetupBonus + mediumSwingSetupBonus + trendAccelerationSetupBonus + planViabilityAdjustment - absMove * 0.9 - genericNeutralPenalty, 4);
  }

  if (lane === "pullback_retest") {
    return round(input.radarScore + nonExtremeLocationScore * 16 + bandScore(absMove, 1.2, 4.2, 8.5) * 10 + bandScore(input.volumeRatio, 0.45, 0.95, 1.8) * 8 + mediumSwingSetupBonus * 0.8 + trendAccelerationSetupBonus * 0.9 + planViabilityAdjustment, 4);
  }

  if (lane === "higher_timeframe_context") {
    return round(input.radarScore + (100 - input.compressionPct) * 0.28 + nonExtremeLocationScore * 16 + bandScore(absMove, 0, 1.8, 6.5) * 8 + planViabilityAdjustment, 4);
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

  const early = Math.max(1, Math.floor(normalized * 0.6));
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
  compressionPct?: number;
  lateAtSelection?: boolean;
  movePct?: number;
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  opportunityLaneScore: number;
  nodeRole?: ProfessionalAuditRoundNodeRole;
  rangePositionPct?: number;
  radarScore: number;
  planBlockers?: string[];
  rewardRisk?: number | null;
  timeframeBand?: ProfessionalAuditRoundTimeframeBand;
  tradePlanStatus?: string;
  volumeRatio?: number;
};

function isEarlyVolumeOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;

  return (
    item.opportunityLane === "early_setup" &&
    item.lateAtSelection !== true &&
    item.nodeRole === "early_volume_expansion" &&
    (absMove === null || absMove <= 6.2) &&
    volumeRatio !== null &&
    volumeRatio > 1.2 &&
    volumeRatio <= 2.8
  );
}

function isQuietCompressionOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;
  const compressionPct = typeof item.compressionPct === "number" && Number.isFinite(item.compressionPct)
    ? item.compressionPct
    : null;
  const rangePositionPct = typeof item.rangePositionPct === "number" && Number.isFinite(item.rangePositionPct)
    ? item.rangePositionPct
    : null;
  const quietRole =
    item.nodeRole === "pre_move" ||
    item.nodeRole === "neutral_random" ||
    item.nodeRole === "medium_swing" ||
    item.nodeRole === undefined;

  return (
    item.opportunityLane === "early_setup" &&
    item.lateAtSelection !== true &&
    quietRole &&
    (absMove === null || absMove <= 3.4) &&
    (volumeRatio === null || (volumeRatio >= 0.42 && volumeRatio <= 1.18)) &&
    (compressionPct === null || compressionPct <= 58) &&
    (rangePositionPct === null || (rangePositionPct >= 18 && rangePositionPct <= 82))
  );
}

function isMediumSwingOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;

  return (
    item.opportunityLane !== "risk_review" &&
    item.lateAtSelection !== true &&
    item.nodeRole === "medium_swing" &&
    (absMove === null || absMove <= 5.8) &&
    (volumeRatio === null || (volumeRatio >= 0.55 && volumeRatio <= 2.6))
  );
}

function isTrendAccelerationOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;

  return (
    item.opportunityLane !== "risk_review" &&
    item.lateAtSelection !== true &&
    item.nodeRole === "trend_acceleration" &&
    (absMove === null || (absMove >= 1.2 && absMove <= 7.2)) &&
    (volumeRatio === null || (volumeRatio >= 0.8 && volumeRatio <= 3.2))
  );
}

function isQuietPendingOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;
  const blockers = item.planBlockers ?? [];

  return (
    item.opportunityLane === "early_setup" &&
    item.lateAtSelection !== true &&
    blockers.includes("direction_pending_quiet_setup") &&
    blockers.includes("structure_confirmation_pending") &&
    (absMove === null || absMove <= 2.2) &&
    (volumeRatio === null || (volumeRatio >= 0.48 && volumeRatio <= 1.18))
  );
}

function isConditionalWaitOpportunity(item: OpportunityRankable) {
  const absMove = typeof item.movePct === "number" && Number.isFinite(item.movePct)
    ? Math.abs(item.movePct)
    : null;
  const volumeRatio = typeof item.volumeRatio === "number" && Number.isFinite(item.volumeRatio)
    ? item.volumeRatio
    : null;
  const rewardRisk = typeof item.rewardRisk === "number" && Number.isFinite(item.rewardRisk)
    ? item.rewardRisk
    : null;
  const blockers = item.planBlockers ?? [];

  return (
    item.opportunityLane !== "risk_review" &&
    item.lateAtSelection !== true &&
    (item.tradePlanStatus === "WAIT_PULLBACK" || item.tradePlanStatus === "WAIT_RETEST") &&
    rewardRisk !== null &&
    rewardRisk >= 3 &&
    !blockers.includes("bull_structure_broken") &&
    !blockers.includes("bear_structure_broken") &&
    !blockers.includes("support_lost") &&
    !blockers.includes("resistance_reclaimed") &&
    (absMove === null || absMove <= 5.2) &&
    (volumeRatio === null || (volumeRatio >= 0.45 && volumeRatio <= 2.4))
  );
}

const hardStructureBlockers = new Set([
  "bear_structure_broken",
  "bull_structure_broken",
  "resistance_reclaimed",
  "support_lost",
]);

const strategyOnlyScanVisibleBlockers = new Set([
  "chase_risk",
  "reward_risk_below_minimum",
  "stop_distance_too_tight",
  "stop_distance_too_wide",
]);

const severeStrategyBlockerCompanions = new Set([
  "reward_risk_below_minimum",
  "stop_distance_too_tight",
  "stop_distance_too_wide",
  "位置/RR",
]);

function hasHardStructureBlocker(item: Pick<OpportunityRankable, "planBlockers">) {
  return (item.planBlockers ?? []).some((blocker) => hardStructureBlockers.has(blocker));
}

function hasScanDisqualifyingBlocker(item: Pick<OpportunityRankable, "planBlockers">) {
  return hasHardStructureBlocker(item);
}

function hasStrategyOnlyScanVisibleBlocker(item: Pick<OpportunityRankable, "planBlockers">) {
  return (item.planBlockers ?? []).some((blocker) => strategyOnlyScanVisibleBlockers.has(blocker));
}

function hasSevereStrategyBlockerCluster(item: Pick<OpportunityRankable, "planBlockers">) {
  const blockers = item.planBlockers ?? [];

  return blockers.includes("chase_risk") && blockers.some((blocker) => severeStrategyBlockerCompanions.has(blocker));
}

function isStrategyBlockedDiscoveryCandidate(item: OpportunityRankable) {
  if (hasSevereStrategyBlockerCluster(item) && !isQuietCompressionOpportunity(item)) {
    return false;
  }

  const hasMeasuredQuietCompression =
    typeof item.compressionPct === "number" &&
    Number.isFinite(item.compressionPct) &&
    typeof item.rangePositionPct === "number" &&
    Number.isFinite(item.rangePositionPct) &&
    typeof item.volumeRatio === "number" &&
    Number.isFinite(item.volumeRatio) &&
    isQuietCompressionOpportunity(item);

  return (
    hasStrategyOnlyScanVisibleBlocker(item) &&
    (
      hasMeasuredQuietCompression ||
      isEarlyVolumeOpportunity(item) ||
      isQuietPendingOpportunity(item) ||
      isConditionalWaitOpportunity(item) ||
      isMediumSwingOpportunity(item) ||
      isTrendAccelerationOpportunity(item)
    )
  );
}

function isScanSelectionEligible(item: OpportunityRankable) {
  if (hasScanDisqualifyingBlocker(item)) {
    return false;
  }

  if (!hasStrategyOnlyScanVisibleBlocker(item)) {
    return true;
  }

  return isStrategyBlockedDiscoveryCandidate(item);
}

export function isScanActionableOpportunityNode(node: Pick<ProfessionalAuditRoundNode, "opportunityLane" | "planBlockers">) {
  if (node.opportunityLane === "risk_review") {
    return false;
  }

  return !hasScanDisqualifyingBlocker(node);
}

function professionalAuditEarlyVolumeQuota(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized <= 2) {
    return 1;
  }

  return Math.max(1, Math.floor(normalized * 0.3));
}

function professionalAuditQuietCompressionQuota(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized <= 4) {
    return 1;
  }

  return Math.max(2, Math.floor(normalized * 0.25));
}

function professionalAuditPrioritySliceQuota(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized <= 3) {
    return 1;
  }

  return Math.max(1, Math.floor(normalized * 0.15));
}

function professionalAuditQuietPendingQuota(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized <= 4) {
    return 1;
  }

  return Math.max(1, Math.floor(normalized * 0.2));
}

function professionalAuditConditionalWaitQuota(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized <= 5) {
    return 1;
  }

  return Math.max(1, Math.floor(normalized * 0.18));
}

function professionalAuditPriorityBudget(topN: number) {
  const normalized = Math.max(1, Math.round(topN));

  if (normalized < 8) {
    return normalized;
  }

  return Math.max(1, normalized - Math.max(2, Math.floor(normalized * 0.3)));
}

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
  const conditionalWaitQuota = professionalAuditConditionalWaitQuota(topN);
  const earlyVolumeQuota = professionalAuditEarlyVolumeQuota(topN);
  const prioritySliceQuota = professionalAuditPrioritySliceQuota(topN);
  const quietCompressionQuota = professionalAuditQuietCompressionQuota(topN);
  const quietPendingQuota = professionalAuditQuietPendingQuota(topN);
  const priorityBudget = professionalAuditPriorityBudget(topN);
  const selected: T[] = [];
  const selectedSymbols = new Set<string>();
  const selectedLaneCounts: Record<ProfessionalAuditOpportunityLaneName, number> = {
    early_setup: 0,
    higher_timeframe_context: 0,
    pullback_retest: 0,
    risk_review: 0,
  };
  const pushSelected = (item: T) => {
    if (selected.length >= topN || selectedSymbols.has(item.auditCase.inputSummary.symbol)) {
      return false;
    }

    selected.push(item);
    selectedSymbols.add(item.auditCase.inputSummary.symbol);
    selectedLaneCounts[item.opportunityLane] += 1;

    return true;
  };
  const actionableLanes: ProfessionalAuditOpportunityLaneName[] = [
    "early_setup",
    "pullback_retest",
    "higher_timeframe_context",
  ];

  const pushPrioritySlice = (predicate: (item: T) => boolean, quota: number) => {
    let pushed = 0;

    for (const item of rankOpportunityCandidates(items.filter((entry) =>
      predicate(entry) &&
      isScanSelectionEligible(entry)
    ))) {
      if (selected.length >= topN || selected.length >= priorityBudget || pushed >= quota) {
        break;
      }

      if (pushSelected(item)) {
        pushed += 1;
      }
    }
  };

  pushPrioritySlice(isQuietCompressionOpportunity, quietCompressionQuota);
  pushPrioritySlice(isEarlyVolumeOpportunity, earlyVolumeQuota);
  pushPrioritySlice(isQuietPendingOpportunity, quietPendingQuota);
  pushPrioritySlice(isConditionalWaitOpportunity, conditionalWaitQuota);
  pushPrioritySlice(isMediumSwingOpportunity, prioritySliceQuota);
  pushPrioritySlice(isTrendAccelerationOpportunity, prioritySliceQuota);

  for (const lane of actionableLanes) {
    const laneItems = rankOpportunityCandidates(items.filter((item) =>
      item.opportunityLane === lane &&
      isScanSelectionEligible(item)
    ));

    for (const item of laneItems) {
      if (selected.length >= topN || selectedLaneCounts[lane] >= quotas[lane]) {
        break;
      }

      pushSelected(item);
    }
  }

  const remainingActionable = rankOpportunityCandidates(
    items.filter((item) =>
      item.opportunityLane !== "risk_review" &&
      isScanSelectionEligible(item) &&
      !selectedSymbols.has(item.auditCase.inputSummary.symbol)
    ),
  );

  for (const item of remainingActionable) {
    if (selected.length >= topN) {
      break;
    }

    selected.push(item);
    selectedSymbols.add(item.auditCase.inputSummary.symbol);
    selectedLaneCounts[item.opportunityLane] += 1;
  }

  const selectedSet = new Set(selected.map((item) => item.auditCase.inputSummary.symbol));
  const ranked = [
    ...selected,
    ...rankOpportunityCandidates(
      items.filter((item) =>
        item.opportunityLane !== "risk_review" &&
        isScanSelectionEligible(item) &&
        !selectedSet.has(item.auditCase.inputSummary.symbol)
      ),
    ),
    ...rankOpportunityCandidates(
      items.filter((item) =>
        item.opportunityLane !== "risk_review" &&
        !isScanSelectionEligible(item) &&
        !hasHardStructureBlocker(item) &&
        !selectedSet.has(item.auditCase.inputSummary.symbol)
      ),
    ),
    ...rankOpportunityCandidates(
      items.filter((item) =>
        item.opportunityLane !== "risk_review" &&
        hasHardStructureBlocker(item) &&
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
  const quietPreSignalScore = !input.lateAtSelection &&
    absMove <= 1.35 &&
    input.volumeRatio >= 0.55 &&
    input.volumeRatio <= 1.08 &&
    input.compressionPct <= 68
    ? (
      nonExtremeLocationScore * 22 +
      bandScore(input.volumeRatio, 0.62, 0.86, 1.08) * 14 +
      clamp((68 - input.compressionPct) / 68, 0, 1) * 10
    ) * horizonWeights.quietAccumulation
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
  const roleScoreBonus = !input.lateAtSelection
    ? input.nodeRole === "pre_move"
      ? 18 + clamp((48 - input.compressionPct) / 48, 0, 1) * 10 + bandScore(input.volumeRatio, 0.45, 0.95, 1.45) * 8
      : input.nodeRole === "early_volume_expansion"
        ? 16 + controlledImpulseScore * 0.18
          : input.nodeRole === "breakout_edge"
            ? 14 + controlledBreakoutEdgeScore * 0.16
            : input.nodeRole === "pullback_retest"
              ? 10 + pullbackPositionScore * 10
              : input.nodeRole === "medium_swing"
                ? 10 + moderateMoveScore + nonExtremeLocationScore * 8
                : input.nodeRole === "trend_acceleration"
                  ? 8 + moderateMoveScore + controlledImpulseScore * 0.14
                  : 0
    : 0;
  const roleRiskPenalty = input.nodeRole === "late_extension" || input.nodeRole === "fakeout_or_invalidation"
    ? 18
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
    quietPreSignalScore +
    controlledImpulseScore +
    controlledBreakoutEdgeScore +
    lowVolumeCompressionScore +
    roleScoreBonus +
    memeEarlyBonus -
    latePenalty -
    chasePenalty -
    extremeLocationPenalty -
    memePenalty -
    roleRiskPenalty,
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

function inferProfessionalAuditNodeRole(stats: NodeStats): ProfessionalAuditRoundNodeRole {
  const best = nodeRoles
    .map((item) => item.role)
    .filter((role) => role !== "large_context")
    .map((role) => ({
      role,
      score: roleScore(role, stats),
    }))
    .sort((left, right) => right.score - left.score)[0];

  return best?.role ?? "neutral_random";
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
    qualityHit: isQualityHit({
      maePct,
      mfePct,
      moveThresholdPct,
    }),
  };
}

function isQualityHit({
  maePct,
  mfePct,
  moveThresholdPct,
}: {
  maePct: number;
  mfePct: number;
  moveThresholdPct: number;
}) {
  const minimumQualityMovePct = Math.max(2, Math.min(4, moveThresholdPct * 0.3));

  return (
    mfePct >= minimumQualityMovePct &&
    mfePct >= Math.max(maePct * 1.35, minimumQualityMovePct) &&
    maePct <= Math.max(4.5, minimumQualityMovePct * 1.5)
  );
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

function notWaitPlanEvaluation(): ProfessionalAuditWaitPlanEvaluation {
  return {
    barsToTrigger: null,
    diagnosticFlags: [],
    label: "不是等待型计划",
    maxAdverseAfterTriggerPct: null,
    maxFavorableAfterTriggerPct: null,
    outcome: "not_applicable",
    postTriggerRewardRisk: null,
    reason: "该节点不是 WAIT_PULLBACK / WAIT_RETEST 条件计划，不进入等待触发后验。",
    status: "not_wait_plan",
    stopHit: false,
    targetHit: false,
    triggerObservedAt: null,
    triggerPrice: null,
    triggerQualityScore: null,
  };
}

function missingWaitPlanLevelsEvaluation(): ProfessionalAuditWaitPlanEvaluation {
  return {
    barsToTrigger: null,
    diagnosticFlags: ["missing_plan_levels"],
    label: "等待计划缺少结构位",
    maxAdverseAfterTriggerPct: null,
    maxFavorableAfterTriggerPct: null,
    outcome: "inconclusive",
    postTriggerRewardRisk: null,
    reason: "等待计划缺少结构止损或第一目标，无法做 TP/SL 先后验证。",
    status: "missing_plan_levels",
    stopHit: false,
    targetHit: false,
    triggerObservedAt: null,
    triggerPrice: null,
    triggerQualityScore: null,
  };
}

const minimumWaitTriggerReactionRatio = 0.28;
const minimumWaitTriggerCloseFromExtremeRatio = 0.68;
const waitTriggerStructuralReactionRatio = 0.78;
const waitTriggerFollowThroughWindowBars = 4;
const minimumWaitFollowThroughReactionRatio = 0.16;
const minimumWaitFollowThroughCloseFromExtremeRatio = 0.58;

export function waitPlanTriggerObserved({
  candle,
  direction,
  stopDistance,
  triggerPrice,
}: {
  candle: Candle;
  direction: "long" | "short";
  stopDistance: number;
  triggerPrice: number;
}) {
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const minReaction = stopDistance * minimumWaitTriggerReactionRatio;

  if (direction === "long") {
    return candle.low <= triggerPrice &&
      candle.close >= triggerPrice + minReaction &&
      candle.close >= candle.open &&
      (candle.close - candle.low) / range >= minimumWaitTriggerCloseFromExtremeRatio;
  }

  return candle.high >= triggerPrice &&
    candle.close <= triggerPrice - minReaction &&
    candle.close <= candle.open &&
    (candle.high - candle.close) / range >= minimumWaitTriggerCloseFromExtremeRatio;
}

export function waitPlanTriggerPrice({
  direction,
  entry,
  plannedEntryPrice,
  structuralStop,
}: {
  direction: "long" | "short";
  entry: number;
  plannedEntryPrice?: number | null;
  structuralStop: number;
}) {
  if (
    typeof plannedEntryPrice === "number" &&
    Number.isFinite(plannedEntryPrice) &&
    (
      direction === "long"
        ? plannedEntryPrice > structuralStop && plannedEntryPrice <= entry
        : plannedEntryPrice < structuralStop && plannedEntryPrice >= entry
    )
  ) {
    return plannedEntryPrice;
  }

  const stopDistance = Math.abs(entry - structuralStop);

  return direction === "long"
    ? entry - stopDistance * waitTriggerStructuralReactionRatio
    : entry + stopDistance * waitTriggerStructuralReactionRatio;
}

function waitPlanTriggerPreservesStructuralStop({
  candle,
  direction,
  structuralStop,
}: {
  candle: Candle;
  direction: "long" | "short";
  structuralStop: number;
}) {
  return direction === "long"
    ? candle.low > structuralStop
    : candle.high < structuralStop;
}

export function waitPlanFollowThroughConfirmed({
  direction,
  future,
  initialTriggerIndex,
  stopDistance,
  structuralStop,
  triggerPrice,
}: {
  direction: "long" | "short";
  future: Candle[];
  initialTriggerIndex: number;
  stopDistance: number;
  structuralStop: number;
  triggerPrice: number;
}) {
  const maxIndex = Math.min(future.length - 1, initialTriggerIndex + waitTriggerFollowThroughWindowBars);
  const minReaction = stopDistance * minimumWaitFollowThroughReactionRatio;

  for (let index = initialTriggerIndex + 1; index <= maxIndex; index += 1) {
    const candle = future[index];

    if (!candle) {
      continue;
    }

    if (!waitPlanTriggerPreservesStructuralStop({ candle, direction, structuralStop })) {
      return null;
    }

    const range = Math.max(candle.high - candle.low, Number.EPSILON);

    if (direction === "long") {
      const closeFromLow = (candle.close - candle.low) / range;
      const holdsTrigger = candle.close >= triggerPrice + minReaction;
      const bodyAligned = candle.close >= candle.open;

      if (holdsTrigger && bodyAligned && closeFromLow >= minimumWaitFollowThroughCloseFromExtremeRatio) {
        return index;
      }
    } else {
      const closeFromHigh = (candle.high - candle.close) / range;
      const holdsTrigger = candle.close <= triggerPrice - minReaction;
      const bodyAligned = candle.close <= candle.open;

      if (holdsTrigger && bodyAligned && closeFromHigh >= minimumWaitFollowThroughCloseFromExtremeRatio) {
        return index;
      }
    }
  }

  return null;
}

function postTriggerRewardRisk({
  direction,
  structuralStop,
  target,
  triggerPrice,
}: {
  direction: "long" | "short";
  structuralStop: number;
  target: number;
  triggerPrice: number;
}) {
  const stopDistance = Math.abs(triggerPrice - structuralStop);
  const targetDistance = direction === "long" ? target - triggerPrice : triggerPrice - target;

  return stopDistance > 0 && targetDistance > 0 ? round(targetDistance / stopDistance, 2) : null;
}

function waitTriggerQualityScore({
  direction,
  candle,
  stopDistance,
  triggerPrice,
}: {
  direction: "long" | "short";
  candle: Candle;
  stopDistance: number;
  triggerPrice: number;
}) {
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const reactionRatio = direction === "long"
    ? (candle.close - triggerPrice) / Math.max(stopDistance, Number.EPSILON)
    : (triggerPrice - candle.close) / Math.max(stopDistance, Number.EPSILON);
  const closeFromExtremeRatio = direction === "long"
    ? (candle.close - candle.low) / range
    : (candle.high - candle.close) / range;
  const bodyAligned = direction === "long" ? candle.close >= candle.open : candle.close <= candle.open;
  const score = reactionRatio * 55 + closeFromExtremeRatio * 35 + (bodyAligned ? 10 : 0);

  return round(Math.max(0, Math.min(100, score)), 2);
}

function waitPlanDiagnosticFlags({
  followThroughMissing = false,
  maxAdverseAfterTriggerPct,
  maxFavorableAfterTriggerPct,
  postTriggerRr,
  status,
  triggerQualityScore,
}: {
  followThroughMissing?: boolean;
  maxAdverseAfterTriggerPct: number | null;
  maxFavorableAfterTriggerPct: number | null;
  postTriggerRr: number | null;
  status: ProfessionalAuditWaitPlanEvaluation["status"];
  triggerQualityScore: number | null;
}) {
  const flags: string[] = [];

  if (status === "missing_plan_levels") {
    flags.push("missing_plan_levels");
  }

  if (status === "not_triggered") {
    flags.push("no_valid_reaction");
  }

  if (followThroughMissing) {
    flags.push("trigger_followthrough_missing");
  }

  if (status === "triggered_sl_first") {
    flags.push("stop_first_after_trigger");
  }

  if (status === "triggered_timeout") {
    flags.push("triggered_but_no_resolution");
  }

  if (postTriggerRr !== null && postTriggerRr < 3) {
    flags.push("post_trigger_rr_below_minimum");
  }

  if (triggerQualityScore !== null && triggerQualityScore < 72) {
    flags.push("trigger_reaction_not_strong_enough");
  }

  if (
    maxAdverseAfterTriggerPct !== null &&
    maxFavorableAfterTriggerPct !== null &&
    maxAdverseAfterTriggerPct > maxFavorableAfterTriggerPct
  ) {
    flags.push("adverse_pressure_dominates_after_trigger");
  }

  if (
    status === "triggered_sl_first" &&
    maxFavorableAfterTriggerPct !== null &&
    maxFavorableAfterTriggerPct < 1
  ) {
    flags.push("no_follow_through_after_trigger");
  }

  return [...new Set(flags)];
}

function evaluateWaitPlan({
  direction,
  entry,
  future,
  signal,
}: {
  direction: "long" | "short";
  entry: number;
  future: Candle[];
  signal: MarketSignal;
}): ProfessionalAuditWaitPlanEvaluation {
  const tradePlan = signal.strategyV3?.tradePlan;
  const status = tradePlan?.status;

  if (status !== "WAIT_PULLBACK" && status !== "WAIT_RETEST") {
    return notWaitPlanEvaluation();
  }

  if (!tradePlan) {
    return notWaitPlanEvaluation();
  }

  const structuralStop = tradePlan.structuralStop;
  const target = tradePlan.targets[0] ?? null;

  if (
    structuralStop === null ||
    target === null ||
    !Number.isFinite(structuralStop) ||
    !Number.isFinite(target)
  ) {
    return missingWaitPlanLevelsEvaluation();
  }

  const validLongMap = direction === "long" && structuralStop < entry && target > entry;
  const validShortMap = direction === "short" && structuralStop > entry && target < entry;

  if (!validLongMap && !validShortMap) {
    return missingWaitPlanLevelsEvaluation();
  }

  const stopDistance = Math.abs(entry - structuralStop);
  const triggerPrice = waitPlanTriggerPrice({
    direction,
    entry,
    plannedEntryPrice: tradePlan.plannedEntryPrice,
    structuralStop,
  });
  const initialTriggerIndex = future.findIndex((candle) =>
    waitPlanTriggerPreservesStructuralStop({
      candle,
      direction,
      structuralStop,
    }) &&
    waitPlanTriggerObserved({
      candle,
      direction,
      stopDistance,
      triggerPrice,
    })
  );

  if (initialTriggerIndex < 0) {
    const postTriggerRr = postTriggerRewardRisk({
      direction,
      structuralStop,
      target,
      triggerPrice,
    });
    return {
      barsToTrigger: null,
      diagnosticFlags: waitPlanDiagnosticFlags({
        maxAdverseAfterTriggerPct: null,
        maxFavorableAfterTriggerPct: null,
        postTriggerRr,
        status: "not_triggered",
        triggerQualityScore: null,
      }),
      label: "等待未触发",
      maxAdverseAfterTriggerPct: null,
      maxFavorableAfterTriggerPct: null,
      outcome: "no_trade",
      postTriggerRewardRisk: postTriggerRr,
      reason: "验证窗口内没有靠近结构位、未刺破结构止损且出现方向反应的回踩/反抽，等待计划避免了追单，但不能证明策略已命中。",
      status: "not_triggered",
      stopHit: false,
      targetHit: false,
      triggerObservedAt: null,
      triggerPrice: round(triggerPrice, 8),
      triggerQualityScore: null,
    };
  }

  const confirmationIndex = waitPlanFollowThroughConfirmed({
    direction,
    future,
    initialTriggerIndex,
    stopDistance,
    structuralStop,
    triggerPrice,
  });

  if (confirmationIndex === null) {
    const initialTrigger = future[initialTriggerIndex];
    const initialQuality = initialTrigger
      ? waitTriggerQualityScore({
        candle: initialTrigger,
        direction,
        stopDistance,
        triggerPrice,
      })
      : null;
    const postTriggerRr = postTriggerRewardRisk({
      direction,
      structuralStop,
      target,
      triggerPrice,
    });

    return {
      barsToTrigger: null,
      diagnosticFlags: waitPlanDiagnosticFlags({
        followThroughMissing: true,
        maxAdverseAfterTriggerPct: null,
        maxFavorableAfterTriggerPct: null,
        postTriggerRr,
        status: "not_triggered",
        triggerQualityScore: initialQuality,
      }),
      label: "等待未完成二次确认",
      maxAdverseAfterTriggerPct: null,
      maxFavorableAfterTriggerPct: null,
      outcome: "no_trade",
      postTriggerRewardRisk: postTriggerRr,
      reason: "验证窗口内出现初步触发反应，但后续 1h 内没有二次确认；等待计划避免提前入场，不能算作已触发交易。",
      status: "not_triggered",
      stopHit: false,
      targetHit: false,
      triggerObservedAt: initialTrigger?.openTime ?? null,
      triggerPrice: round(triggerPrice, 8),
      triggerQualityScore: initialQuality,
    };
  }

  const triggered = future[confirmationIndex];
  const afterTrigger = future.slice(confirmationIndex + 1);
  const triggerQuality = waitTriggerQualityScore({
    candle: triggered,
    direction,
    stopDistance,
    triggerPrice,
  });
  const postTriggerRr = postTriggerRewardRisk({
    direction,
    structuralStop,
    target,
    triggerPrice,
  });
  let firstEvent: "sl" | "timeout" | "tp" = "timeout";
  let maxFavorableAfterTriggerPct = 0;
  let maxAdverseAfterTriggerPct = 0;

  for (const candle of afterTrigger) {
    const favorable = direction === "long"
      ? percentChange(triggerPrice, candle.high)
      : percentChange(candle.low, triggerPrice);
    const adverse = direction === "long"
      ? percentChange(candle.low, triggerPrice)
      : percentChange(triggerPrice, candle.high);

    maxFavorableAfterTriggerPct = Math.max(maxFavorableAfterTriggerPct, favorable);
    maxAdverseAfterTriggerPct = Math.max(maxAdverseAfterTriggerPct, adverse);

    const stopHit = direction === "long" ? candle.low <= structuralStop : candle.high >= structuralStop;
    const targetHit = direction === "long" ? candle.high >= target : candle.low <= target;

    if (firstEvent === "timeout" && stopHit && targetHit) {
      firstEvent = "sl";
      break;
    }

    if (firstEvent === "timeout" && stopHit) {
      firstEvent = "sl";
      break;
    }

    if (firstEvent === "timeout" && targetHit) {
      firstEvent = "tp";
      break;
    }
  }

  if (firstEvent === "tp") {
    return {
      barsToTrigger: confirmationIndex + 1,
      diagnosticFlags: waitPlanDiagnosticFlags({
        maxAdverseAfterTriggerPct,
        maxFavorableAfterTriggerPct,
        postTriggerRr,
        status: "triggered_tp_first",
        triggerQualityScore: triggerQuality,
      }),
      label: "等待触发后先到目标",
      maxAdverseAfterTriggerPct: round(maxAdverseAfterTriggerPct),
      maxFavorableAfterTriggerPct: round(maxFavorableAfterTriggerPct),
      outcome: "useful_wait",
      postTriggerRewardRisk: postTriggerRr,
      reason: "等待计划触发后先到第一目标，说明该 WAIT 条件在本样本里有交易价值。",
      status: "triggered_tp_first",
      stopHit: false,
      targetHit: true,
      triggerObservedAt: triggered?.openTime ?? null,
      triggerPrice: round(triggerPrice, 8),
      triggerQualityScore: triggerQuality,
    };
  }

  if (firstEvent === "sl") {
    return {
      barsToTrigger: confirmationIndex + 1,
      diagnosticFlags: waitPlanDiagnosticFlags({
        maxAdverseAfterTriggerPct,
        maxFavorableAfterTriggerPct,
        postTriggerRr,
        status: "triggered_sl_first",
        triggerQualityScore: triggerQuality,
      }),
      label: "等待触发后先到止损",
      maxAdverseAfterTriggerPct: round(maxAdverseAfterTriggerPct),
      maxFavorableAfterTriggerPct: round(maxFavorableAfterTriggerPct),
      outcome: "bad_wait",
      postTriggerRewardRisk: postTriggerRr,
      reason: "等待计划触发后先打结构止损，说明该等待条件、结构位质量或触发反应强度需要复查。",
      status: "triggered_sl_first",
      stopHit: true,
      targetHit: false,
      triggerObservedAt: triggered?.openTime ?? null,
      triggerPrice: round(triggerPrice, 8),
      triggerQualityScore: triggerQuality,
    };
  }

  return {
    barsToTrigger: confirmationIndex + 1,
    diagnosticFlags: waitPlanDiagnosticFlags({
      maxAdverseAfterTriggerPct,
      maxFavorableAfterTriggerPct,
      postTriggerRr,
      status: "triggered_timeout",
      triggerQualityScore: triggerQuality,
    }),
    label: "等待触发后超时",
    maxAdverseAfterTriggerPct: round(maxAdverseAfterTriggerPct),
    maxFavorableAfterTriggerPct: round(maxFavorableAfterTriggerPct),
    outcome: "inconclusive",
    postTriggerRewardRisk: postTriggerRr,
    reason: "等待计划触发后在验证窗口内未先到目标或止损，需要更长窗口或人工复核。",
    status: "triggered_timeout",
    stopHit: false,
    targetHit: false,
    triggerObservedAt: triggered?.openTime ?? null,
    triggerPrice: round(triggerPrice, 8),
    triggerQualityScore: triggerQuality,
  };
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

type ProfessionalAuditTradePlanBlockerContext = {
  compressionPct: number;
  lateAtSelection: boolean;
  movePct: number;
  nodeRole?: ProfessionalAuditRoundNodeRole;
  opportunityLane: ProfessionalAuditOpportunityLaneName;
  rangePositionPct: number;
  volumeRatio: number;
};

function isQuietDirectionPendingSetup(context: ProfessionalAuditTradePlanBlockerContext) {
  const absMove = Math.abs(context.movePct);
  const nonExtremeLocation = context.rangePositionPct >= 18 && context.rangePositionPct <= 82;
  const quietVolume = context.volumeRatio >= 0.5 && context.volumeRatio <= 1.15;
  const quietRole =
    context.nodeRole === "pre_move" ||
    context.nodeRole === "neutral_random" ||
    context.nodeRole === "medium_swing" ||
    context.nodeRole === undefined;

  return (
    context.opportunityLane === "early_setup" &&
    !context.lateAtSelection &&
    absMove <= 1.6 &&
    context.compressionPct <= 70 &&
    quietVolume &&
    nonExtremeLocation &&
    quietRole
  );
}

function isEarlyUntouchedWaitingSetup(context: ProfessionalAuditTradePlanBlockerContext) {
  const absMove = Math.abs(context.movePct);
  const nonExtremeLocation = context.rangePositionPct >= 18 && context.rangePositionPct <= 82;
  const relevantRole =
    context.nodeRole === "pre_move" ||
    context.nodeRole === "early_volume_expansion" ||
    context.nodeRole === "breakout_edge" ||
    context.nodeRole === "medium_swing";

  return (
    context.opportunityLane === "early_setup" &&
    !context.lateAtSelection &&
    absMove <= 4.8 &&
    context.compressionPct <= 72 &&
    context.volumeRatio >= 0.45 &&
    context.volumeRatio <= 1.45 &&
    nonExtremeLocation &&
    relevantRole
  );
}

export function professionalAuditContextualPlanBlockers(
  signal: MarketSignal,
  context: ProfessionalAuditTradePlanBlockerContext,
) {
  const blockers = tradePlanBlockers(signal);

  if (
    signal.direction === "neutral" &&
    blockers.includes("neutral_direction") &&
    isQuietDirectionPendingSetup(context)
  ) {
    return [
      ...blockers.filter((blocker) => blocker !== "neutral_direction"),
      "direction_pending_quiet_setup",
      "structure_confirmation_pending",
    ].filter((blocker, index, list) => list.indexOf(blocker) === index);
  }

  if (blockers.includes("no_recent_touch") && isEarlyUntouchedWaitingSetup(context)) {
    return [
      ...blockers.filter((blocker) => blocker !== "no_recent_touch"),
      "reaction_not_confirmed",
      "structure_confirmation_pending",
    ].filter((blocker, index, list) => list.indexOf(blocker) === index);
  }

  return blockers;
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
  const currentStats = nodeStats(candles, index);
  const currentNodeRole = nodeRole ?? (currentStats ? inferProfessionalAuditNodeRole(currentStats) : undefined);
  const lateAtSelection = isLateAtSelection(movePct, currentRangePositionPct, direction, moveThresholdPct);
  const radarScore = professionalAuditRadarScore({
    compressionPct: currentCompressionPct,
    confidence: auditCase.signal.confidence,
    direction,
    lateAtSelection,
    movePct,
    nodeRole: currentNodeRole,
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
    nodeRole: currentNodeRole,
    rangePositionPct: currentRangePositionPct,
    timeframeBand,
    volumeRatio: currentVolumeRatio,
  });
  const planBlockers = professionalAuditContextualPlanBlockers(auditCase.signal, {
    compressionPct: currentCompressionPct,
    lateAtSelection,
    movePct,
    nodeRole: currentNodeRole,
    opportunityLane,
    rangePositionPct: currentRangePositionPct,
    volumeRatio: currentVolumeRatio,
  });
  const rewardRisk = tradePlanRewardRisk(auditCase.signal);
  const tradePlanStatusValue = tradePlanStatus(auditCase.signal);
  const opportunityQuality = classifyProfessionalAuditOpportunityQuality({
    compressionPct: currentCompressionPct,
    direction,
    lateAtSelection,
    maturity: auditCase.signal.maturity?.stage,
    movePct,
    nodeRole: currentNodeRole,
    opportunityLane,
    planBlockers,
    rangePositionPct: currentRangePositionPct,
    rewardRisk,
    timeframeBand,
    tradePlanStatus: tradePlanStatusValue,
    volumeRatio: currentVolumeRatio,
  });
  const outcome = replayOutcome({
    direction,
    entry: observed.close,
    future,
    moveThresholdPct,
  });
  const waitPlanEvaluation = evaluateWaitPlan({
    direction,
    entry: observed.close,
    future,
    signal: auditCase.signal,
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
    nodeRole: currentNodeRole,
    opportunityLane,
    opportunityLaneScore: opportunityLaneScore({
      compressionPct: currentCompressionPct,
      direction,
      lateAtSelection,
      movePct,
      nodeRole: currentNodeRole,
      planBlockers,
      radarScore,
      rangePositionPct: currentRangePositionPct,
      rewardRisk,
      timeframeBand,
      tradePlanStatus: tradePlanStatusValue,
      volumeRatio: currentVolumeRatio,
    }),
    opportunityQuality,
    opportunityQualityLabel: opportunityQualityLabels[opportunityQuality],
    planBlockers,
    qualityHit: outcome.qualityHit,
    radarScore,
    randomScore: deterministicRandomScore(symbol, observed.openTime),
    rangePositionPct: currentRangePositionPct,
    rewardRisk,
    tradePlanStatus: tradePlanStatusValue,
    volumeRatio: currentVolumeRatio,
    waitPlanEvaluation,
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
  const laneNodes = nodes.filter((node) =>
    node.opportunityLane === lane &&
    (lane === "risk_review" || isScanActionableOpportunityNode(node))
  );
  const captured = laneNodes.filter((node) => node.capturedByRadar);
  const hitCount = laneNodes.filter((node) => node.hit).length;
  const qualityHitCount = laneNodes.filter((node) => node.qualityHit).length;
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
    missedEarlyQualityHitCount: laneNodes.filter((node) => !node.capturedByRadar && node.qualityHit && !node.lateAtSelection).length,
    planReadyCount: laneNodes.filter((node) => node.maturity === "TRADE_PLAN_READY").length,
    qualityHitCount,
    qualityHitRatePct: laneNodes.length > 0 ? round((qualityHitCount / laneNodes.length) * 100) : 0,
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

function summarizeOpportunityQuality(
  id: ProfessionalAuditOpportunityQualityId,
  nodes: ProfessionalAuditRoundNode[],
): ProfessionalAuditOpportunityQualityMetric {
  const qualityNodes = nodes.filter((node) => node.opportunityQuality === id);
  const captured = qualityNodes.filter((node) => node.capturedByRadar);
  const hitCount = qualityNodes.filter((node) => node.hit).length;
  const qualityHitCount = qualityNodes.filter((node) => node.qualityHit).length;
  const lateCount = qualityNodes.filter((node) => node.lateAtSelection).length;
  const planReadyCount = qualityNodes.filter((node) => node.maturity === "TRADE_PLAN_READY").length;
  const conditionalWaitCount = qualityNodes.filter((node) =>
    node.tradePlanStatus === "WAIT_PULLBACK" || node.tradePlanStatus === "WAIT_RETEST"
  ).length;
  const falsePositive = captured.filter((node) =>
    id === "noise" ||
    id === "late_move" ||
    id === "fakeout_risk" ||
    !(node.hit || node.qualityHit) ||
    node.lateAtSelection
  );
  const missedQualityHit = qualityNodes.filter((node) =>
    !node.capturedByRadar &&
    (node.hit || node.qualityHit) &&
    !node.lateAtSelection
  );
  const ranks = qualityNodes
    .map((node) => node.radarRank)
    .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));

  return {
    avgRadarRank: ranks.length > 0 ? round(mean(ranks)) : null,
    capturedCount: captured.length,
    captureRatePct: percent(captured.length, qualityNodes.length),
    conditionalWaitCount,
    falsePositiveCount: falsePositive.length,
    falsePositiveRatePct: percent(falsePositive.length, captured.length),
    hitCount,
    id,
    label: opportunityQualityLabels[id],
    lateCount,
    missedQualityHitCount: missedQualityHit.length,
    nextAction: opportunityQualityNextActions[id],
    planReadyCount,
    qualityHitCount,
    qualityHitRatePct: percent(qualityHitCount, qualityNodes.length),
    sampleSymbols: qualityNodes.slice(0, 8).map((node) => node.symbol),
    totalNodes: qualityNodes.length,
  };
}

function buildOpportunityQualityMetrics(nodes: ProfessionalAuditRoundNode[]) {
  return ([
    "premium_early_setup",
    "watch_only",
    "trade_plan_ready",
    "fakeout_risk",
    "late_move",
    "noise",
  ] as const).map((id) => summarizeOpportunityQuality(id, nodes));
}

export function buildPlanBlockerMetrics(nodes: ProfessionalAuditRoundNode[]): ProfessionalAuditPlanBlockerMetric[] {
  const grouped = new Map<string, {
    capturedCount: number;
    conditionalWaitCount: number;
    count: number;
    lateCount: number;
    qualityHitCount: number;
    riskReviewCount: number;
    sampleContexts: ProfessionalAuditPlanBlockerMetric["sampleContexts"];
    sampleSymbols: string[];
  }>();

  for (const node of nodes) {
    for (const blocker of node.planBlockers) {
      const current = grouped.get(blocker) ?? {
        capturedCount: 0,
        conditionalWaitCount: 0,
        count: 0,
        lateCount: 0,
        qualityHitCount: 0,
        riskReviewCount: 0,
        sampleContexts: [],
        sampleSymbols: [],
      };

      current.count += 1;
      current.capturedCount += node.capturedByRadar ? 1 : 0;
      current.conditionalWaitCount += node.tradePlanStatus === "WAIT_PULLBACK" || node.tradePlanStatus === "WAIT_RETEST" ? 1 : 0;
      current.lateCount += node.lateAtSelection ? 1 : 0;
      current.qualityHitCount += node.qualityHit ? 1 : 0;
      current.riskReviewCount += node.opportunityLane === "risk_review" ? 1 : 0;

      if (!current.sampleSymbols.includes(node.symbol) && current.sampleSymbols.length < 6) {
        current.sampleSymbols.push(node.symbol);
      }

      if (current.sampleContexts.length < 6) {
        current.sampleContexts.push({
          capturedByRadar: node.capturedByRadar,
          hit: node.hit,
          lateAtSelection: node.lateAtSelection,
          nodeRole: node.nodeRole,
          opportunityLane: node.opportunityLane,
          qualityHit: node.qualityHit,
          rewardRisk: node.rewardRisk,
          symbol: node.symbol,
          tradePlanStatus: node.tradePlanStatus,
        });
      }

      grouped.set(blocker, current);
    }
  }

  return [...grouped.entries()]
    .map(([blocker, value]) => {
      const category = professionalAuditPlanBlockerCategory(blocker);
      const diagnosis = professionalAuditPlanBlockerDiagnosis({
        category,
        capturedCount: value.capturedCount,
        conditionalWaitCount: value.conditionalWaitCount,
        count: value.count,
        lateCount: value.lateCount,
        qualityHitCount: value.qualityHitCount,
        riskReviewCount: value.riskReviewCount,
      });

      return {
        blocker,
        capturedCount: value.capturedCount,
        category,
        conditionalWaitCount: value.conditionalWaitCount,
        count: value.count,
        diagnosis,
        label: professionalAuditPlanBlockerLabel(blocker),
        lateCount: value.lateCount,
        qualityHitCount: value.qualityHitCount,
        riskReviewCount: value.riskReviewCount,
        sampleContexts: value.sampleContexts,
        sampleSymbols: value.sampleSymbols,
      };
    })
    .sort((left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker));
}

const levelQualityReasonLabels: Record<ProfessionalAuditLevelQualityReason, string> = {
  level_missing_or_invalid: "关键位缺失或无效",
  quality_hit_needs_manual_review: "质量命中但被关键位/RR 阻断",
  reasonable_late_or_risk_block: "迟到或风险复盘，阻断更合理",
  rr_below_minimum: "结构盈亏比低于 3:1",
  stop_too_tight: "结构止损距离过近",
  stop_too_wide: "结构止损距离过宽",
  target_projection_too_near: "目标位投射过近或空间不足",
  unknown_level_issue: "关键位/RR 问题未细分",
};

function levelQualityReasonFor(metric: ProfessionalAuditPlanBlockerMetric): ProfessionalAuditLevelQualityReason {
  if (
    metric.blocker === "no_nearest_target" ||
    metric.blocker === "no_structural_stop" ||
    metric.blocker === "invalid_nearest_target" ||
    metric.blocker === "invalid_structural_stop"
  ) {
    return "level_missing_or_invalid";
  }

  if (metric.blocker === "stop_distance_too_wide") {
    return "stop_too_wide";
  }

  if (metric.blocker === "stop_distance_too_tight") {
    return "stop_too_tight";
  }

  if (metric.blocker === "reward_risk_below_minimum") {
    return "rr_below_minimum";
  }

  if (
    metric.blocker === "location_rr" ||
    metric.blocker === "reward_risk_unknown" ||
    metric.blocker === "位置/RR"
  ) {
    return "target_projection_too_near";
  }

  if (metric.qualityHitCount > 0) {
    return "quality_hit_needs_manual_review";
  }

  if (metric.lateCount + metric.riskReviewCount >= Math.max(1, Math.ceil(metric.count * 0.5))) {
    return "reasonable_late_or_risk_block";
  }

  return "unknown_level_issue";
}

function levelQualityNextAction(metric: ProfessionalAuditPlanBlockerMetric, reason: ProfessionalAuditLevelQualityReason) {
  const qualityPrefix = metric.qualityHitCount > 0
    ? `其中 ${metric.qualityHitCount} 个质量命中样本被阻断，必须抽样复核；`
    : "";

  if (reason === "level_missing_or_invalid") {
    return `${qualityPrefix}优先复查结构止损、最近目标和关键位有效性，缺位时维持阻断，不允许补假目标。`;
  }

  if (reason === "stop_too_wide") {
    return `${qualityPrefix}复查止损是否被放到过远结构位；若只能用宽止损，就改成等待更好位置，不能降低 RR。`;
  }

  if (reason === "stop_too_tight") {
    return `${qualityPrefix}复查止损是否贴得过近；若止损只是普通噪音区间，必须等待二次确认或改用更有效结构位。`;
  }

  if (reason === "rr_below_minimum") {
    return `${qualityPrefix}复查目标投射和止损距离；若真实 RR 仍低于 3:1，不降低 3:1 门槛，继续阻断并输出等待条件。`;
  }

  if (reason === "target_projection_too_near") {
    return `${qualityPrefix}检查是否只用了最近小目标误杀空间；必须寻找可追溯前方结构目标，仍不足 3:1 则阻断。`;
  }

  if (reason === "quality_hit_needs_manual_review") {
    return "质量命中但被关键位/RR 阻断，逐样本复核目标位、止损位、方向和观察时间，确认是不是规则错杀。";
  }

  if (reason === "reasonable_late_or_risk_block") {
    return "样本偏迟到或属于风险复盘，暂时维持阻断；只作为反面教材，不提升为交易计划。";
  }

  return "先人工抽样确认卡点语义，再决定是补关键位规则还是保留阻断。";
}

export function buildLevelQualityMetrics(planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[]): ProfessionalAuditLevelQualityMetric[] {
  return planBlockerMetrics
    .filter((metric) =>
      metric.diagnosis === "needs_level_audit" ||
      metric.category === "rr" ||
      metric.category === "stop_target"
    )
    .map((metric) => {
      const primaryReason = levelQualityReasonFor(metric);

      return {
        blocker: metric.blocker,
        capturedCount: metric.capturedCount,
        category: metric.category,
        conditionalWaitCount: metric.conditionalWaitCount,
        count: metric.count,
        diagnosis: metric.diagnosis,
        label: metric.label,
        lateCount: metric.lateCount,
        nextAction: levelQualityNextAction(metric, primaryReason),
        primaryReason,
        primaryReasonLabel: levelQualityReasonLabels[primaryReason],
        qualityHitCount: metric.qualityHitCount,
        qualityHitRatePct: percent(metric.qualityHitCount, metric.count),
        riskReviewCount: metric.riskReviewCount,
        sampleContexts: metric.sampleContexts,
        sampleSymbols: metric.sampleSymbols,
      };
    })
    .sort((left, right) =>
      right.qualityHitCount - left.qualityHitCount ||
      right.count - left.count ||
      left.blocker.localeCompare(right.blocker)
    );
}

export function isActionableWaitPlanNode(node: Pick<
  ProfessionalAuditRoundNode,
  "lateAtSelection" | "opportunityLane" | "rewardRisk" | "tradePlanStatus"
>) {
  return (
    node.tradePlanStatus === "WAIT_PULLBACK" ||
    node.tradePlanStatus === "WAIT_RETEST"
  ) &&
    typeof node.rewardRisk === "number" &&
    node.rewardRisk >= 3 &&
    !node.lateAtSelection &&
    node.opportunityLane !== "risk_review";
}

function waitPlanDiagnosticLabel(code: string) {
  const labels: Record<string, string> = {
    adverse_pressure_dominates_after_trigger: "触发后反向压力更强",
    missing_plan_levels: "缺少结构止损或第一目标",
    no_follow_through_after_trigger: "触发后没有顺向延续",
    no_valid_reaction: "没有有效回踩/反抽反应",
    post_trigger_rr_below_minimum: "触发后结构盈亏比低于 3:1",
    stop_first_after_trigger: "触发后先打结构止损",
    trigger_followthrough_missing: "初步触发后缺少二次确认",
    trigger_reaction_not_strong_enough: "触发 K 线反应强度不足",
    triggered_but_no_resolution: "触发后目标/止损都未验证",
  };

  return labels[code] ?? code;
}

export function buildWaitPlanMetrics(nodes: ProfessionalAuditRoundNode[]): ProfessionalAuditWaitPlanMetric {
  const waitNodes = nodes.filter(isActionableWaitPlanNode);
  const triggered = waitNodes.filter((node) =>
    node.waitPlanEvaluation.status === "triggered_tp_first" ||
    node.waitPlanEvaluation.status === "triggered_sl_first" ||
    node.waitPlanEvaluation.status === "triggered_timeout"
  );
  const targetFirst = waitNodes.filter((node) => node.waitPlanEvaluation.status === "triggered_tp_first");
  const stopFirst = waitNodes.filter((node) => node.waitPlanEvaluation.status === "triggered_sl_first");
  const timeout = waitNodes.filter((node) => node.waitPlanEvaluation.status === "triggered_timeout");
  const notTriggered = waitNodes.filter((node) => node.waitPlanEvaluation.status === "not_triggered");
  const missing = waitNodes.filter((node) => node.waitPlanEvaluation.status === "missing_plan_levels");
  const triggerQualityScores = triggered
    .map((node) => node.waitPlanEvaluation.triggerQualityScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const diagnosticMap = new Map<string, { code: string; count: number; sampleSymbols: Set<string> }>();

  for (const node of waitNodes) {
    for (const code of node.waitPlanEvaluation.diagnosticFlags) {
      const item = diagnosticMap.get(code) ?? {
        code,
        count: 0,
        sampleSymbols: new Set<string>(),
      };

      item.count += 1;
      item.sampleSymbols.add(node.symbol);
      diagnosticMap.set(code, item);
    }
  }

  return {
    avgTriggerQualityScore: triggerQualityScores.length > 0
      ? round(triggerQualityScores.reduce((sum, score) => sum + score, 0) / triggerQualityScores.length)
      : null,
    badWaitRatePct: percent(stopFirst.length, waitNodes.length),
    diagnosticBreakdown: [...diagnosticMap.values()]
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
      .map((item) => ({
        code: item.code,
        count: item.count,
        label: waitPlanDiagnosticLabel(item.code),
        sampleSymbols: [...item.sampleSymbols].slice(0, 5),
      })),
    label: "等待型计划后验",
    missingLevelCount: missing.length,
    noTradeRatePct: percent(notTriggered.length, waitNodes.length),
    notTriggeredCount: notTriggered.length,
    stopFirstCount: stopFirst.length,
    targetFirstCount: targetFirst.length,
    timeoutCount: timeout.length,
    totalWaitPlans: waitNodes.length,
    triggeredCount: triggered.length,
    usefulWaitRatePct: percent(targetFirst.length, waitNodes.length),
  };
}

function buildPressureTestMetrics(nodes: ProfessionalAuditRoundNode[], topN: number, candidateUniverseSize: number): ProfessionalAuditPressureTestMetric[] {
  const actionable = nodes.filter(isScanActionableOpportunityNode);
  const thresholds = [...new Set([
    Math.max(1, Math.min(topN, candidateUniverseSize)),
    Math.max(1, Math.min(topN * 2, candidateUniverseSize)),
    Math.max(1, Math.min(topN * 3, candidateUniverseSize)),
  ])];

  return thresholds.map((threshold) => {
    const selected = actionable.filter((node) => typeof node.radarRank === "number" && node.radarRank <= threshold);
    const earlySelected = selected.filter((node) => !node.lateAtSelection);
    const earlyTotal = actionable.filter((node) => !node.lateAtSelection);
    const missedEarlyQualityHitCount = actionable.filter((node) =>
      !(typeof node.radarRank === "number" && node.radarRank <= threshold) &&
      node.qualityHit &&
      !node.lateAtSelection
    ).length;

    return {
      captureRatePct: percent(selected.length, actionable.length),
      earlyCaptureRatePct: percent(earlySelected.length, earlyTotal.length),
      label: `Top${threshold}`,
      missedEarlyQualityHitCount,
      qualityHitRatePct: percent(selected.filter((node) => node.qualityHit).length, selected.length),
      selectedCount: selected.length,
      topN: threshold,
      universePressurePct: percent(threshold, candidateUniverseSize),
    };
  });
}

function marketRegimeForNode(node: ProfessionalAuditRoundNode) {
  const absMove = Math.abs(node.moveAtSelectionPct);

  if (node.lateAtSelection || node.opportunityLane === "risk_review") {
    return {
      label: "已延展/高风险",
      regime: "extended_or_risk",
    };
  }

  if (node.opportunityLane === "early_setup" && absMove <= 3 && node.volumeRatio <= 1.2) {
    return {
      label: "安静压缩启动前",
      regime: "quiet_compression",
    };
  }

  if (node.opportunityLane === "early_setup" && node.volumeRatio > 1.2) {
    return {
      label: "早期放量启动",
      regime: "early_volume_expansion",
    };
  }

  if (node.opportunityLane === "pullback_retest") {
    return {
      label: "回踩/反抽确认",
      regime: "pullback_retest",
    };
  }

  if (node.opportunityLane === "higher_timeframe_context" || node.timeframeBand === "large") {
    return {
      label: "大周期背景",
      regime: "higher_timeframe_context",
    };
  }

  return {
    label: "普通震荡样本",
    regime: "neutral_chop",
  };
}

function buildMarketRegimeMetrics(nodes: ProfessionalAuditRoundNode[]): ProfessionalAuditMarketRegimeMetric[] {
  const grouped = new Map<string, { label: string; nodes: ProfessionalAuditRoundNode[] }>();

  for (const node of nodes) {
    const regime = marketRegimeForNode(node);
    const current = grouped.get(regime.regime) ?? { label: regime.label, nodes: [] };

    current.nodes.push(node);
    grouped.set(regime.regime, current);
  }

  return [...grouped.entries()]
    .map(([regime, value]) => {
      const ranks = value.nodes
        .map((node) => node.radarRank)
        .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank));

      return {
        avgRadarRank: ranks.length > 0 ? round(mean(ranks)) : null,
        captureRatePct: percent(value.nodes.filter((node) => node.capturedByRadar).length, value.nodes.length),
        label: value.label,
        lateRatePct: percent(value.nodes.filter((node) => node.lateAtSelection).length, value.nodes.length),
        qualityHitRatePct: percent(value.nodes.filter((node) => node.qualityHit).length, value.nodes.length),
        regime,
        sampleSymbols: [...new Set(value.nodes.map((node) => node.symbol))].slice(0, 6),
        totalNodes: value.nodes.length,
      };
    })
    .sort((left, right) => right.totalNodes - left.totalNodes || left.regime.localeCompare(right.regime));
}

function buildRuleStabilityMetrics(nodes: ProfessionalAuditRoundNode[]): ProfessionalAuditRuleStabilityMetric[] {
  const grouped = new Map<string, {
    missedQualityHitCount: number;
    occurrenceCount: number;
    sampleSymbols: string[];
    selectedUsefulCount: number;
  }>();

  for (const node of nodes) {
    for (const blocker of node.planBlockers) {
      const current = grouped.get(blocker) ?? {
        missedQualityHitCount: 0,
        occurrenceCount: 0,
        sampleSymbols: [],
        selectedUsefulCount: 0,
      };

      current.occurrenceCount += 1;

      if (!node.capturedByRadar && node.qualityHit && !node.lateAtSelection) {
        current.missedQualityHitCount += 1;
      }

      if (node.capturedByRadar && (node.hit || node.qualityHit) && !node.lateAtSelection) {
        current.selectedUsefulCount += 1;
      }

      if (!current.sampleSymbols.includes(node.symbol) && current.sampleSymbols.length < 6) {
        current.sampleSymbols.push(node.symbol);
      }

      grouped.set(blocker, current);
    }
  }

  return [...grouped.entries()]
    .map(([blocker, value]) => {
      const instability = percent(value.missedQualityHitCount, value.occurrenceCount);
      const stabilityScore = clamp(100 - instability + Math.min(12, value.selectedUsefulCount * 2), 0, 100);
      const status: ProfessionalAuditRuleStabilityMetric["status"] = stabilityScore < 60
        ? "unstable"
        : stabilityScore < 80
          ? "watch"
          : "stable";

      return {
        blocker,
        label: professionalAuditPlanBlockerLabel(blocker),
        missedQualityHitCount: value.missedQualityHitCount,
        occurrenceCount: value.occurrenceCount,
        sampleSymbols: value.sampleSymbols,
        selectedUsefulCount: value.selectedUsefulCount,
        stabilityScore: round(stabilityScore),
        status,
      };
    })
    .filter((item) => item.occurrenceCount >= 2 || item.missedQualityHitCount > 0)
    .sort((left, right) =>
      left.stabilityScore - right.stabilityScore ||
      right.missedQualityHitCount - left.missedQualityHitCount ||
      right.occurrenceCount - left.occurrenceCount
    );
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
  const actionableNodes = nodes.filter(isScanActionableOpportunityNode);
  const captured = actionableNodes.filter((node) => node.capturedByRadar);
  const earlyUsefulCaptured = actionableNodes.filter((node) =>
    node.capturedByRadar &&
    (node.hit || node.qualityHit) &&
    !node.lateAtSelection
  );
  const missedEarlyHit = actionableNodes.filter((node) => !node.capturedByRadar && node.hit && !node.lateAtSelection);
  const missedEarlyQualityHit = actionableNodes.filter((node) => !node.capturedByRadar && node.qualityHit && !node.lateAtSelection);
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
      detail: `结构可行动机会池 TopN 捕获率只有 ${captureRatePct}%，说明真正值得测的节点没有稳定进前排。`,
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
      count: missedEarlyHit.length + missedEarlyQualityHit.length,
      detail: `${missedEarlyHit.length} 个不晚到且事后大行情命中的样本、${missedEarlyQualityHit.length} 个质量命中的样本没有进 TopN。`,
      label: "漏掉早期有效机会",
      nextAction: "把这些样本作为下一轮扫描排序校准集。",
      sampleSymbols: [...missedEarlyHit, ...missedEarlyQualityHit].slice(0, 6).map((node) => node.symbol),
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
      missedEarlyQualityHitCount: missedEarlyQualityHit.length,
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
  void planBlockerMetrics;
  const selected = nodes.filter((node) => node.capturedByRadar);
  const useful = selected.filter((node) => (node.hit || node.qualityHit) && !node.lateAtSelection && node.opportunityLane !== "risk_review");
  const falsePositive = selected.filter((node) => !(node.hit || node.qualityHit) || node.lateAtSelection || node.opportunityLane === "risk_review");
  const selectedBlockerMetrics = buildPlanBlockerMetrics(selected);
  const unclearCount = blockerCount(selectedBlockerMetrics, ["neutral_direction"]);
  const directionPendingCount = blockerCount(selectedBlockerMetrics, ["direction_pending_quiet_setup"]);
  const structureBrokenCount = blockerCount(selectedBlockerMetrics, ["bear_structure_broken", "bull_structure_broken", "structure_invalidated"]);
  const exhaustionCount = blockerCount(selectedBlockerMetrics, ["lower_wick_exhaustion", "upper_wick_exhaustion"]);
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
      sampleSymbols: blockerSamples(selectedBlockerMetrics, ["neutral_direction"]),
    }));
  }

  if (structureBrokenCount > nodes.length * 0.15) {
    failures.push(failure({
      code: "analysis_structure_gate_noise",
      count: structureBrokenCount,
      detail: `结构破坏类卡点出现 ${structureBrokenCount} 次，需要确认是合理拦截还是结构门控过粗。`,
      label: "结构判断噪声偏高",
      nextAction: "抽样复查多周期结构、关键位和趋势完整度，区分真失效与等待确认。",
      sampleSymbols: blockerSamples(selectedBlockerMetrics, ["bear_structure_broken", "bull_structure_broken", "structure_invalidated"]),
    }));
  }

  if (exhaustionCount > nodes.length * 0.1) {
    failures.push(failure({
      code: "analysis_exhaustion_noise",
      count: exhaustionCount,
      detail: `上/下影线衰竭类问题出现 ${exhaustionCount} 次，需要检查是否误杀启动前波动。`,
      label: "衰竭识别需复核",
      nextAction: "把衰竭信号和正常洗盘/回踩分开验证。",
      sampleSymbols: blockerSamples(selectedBlockerMetrics, ["lower_wick_exhaustion", "upper_wick_exhaustion"]),
    }));
  }

  return {
    failedNodes: Math.max(0, selected.length - useful.length),
    id: "analysis",
    keyMetrics: {
      directionPendingQuietSetupCount: directionPendingCount,
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

function isConditionalStrategyPlan(node: ProfessionalAuditRoundNode) {
  return isActionableWaitPlanNode(node);
}

function buildStrategyCapabilityMetric({
  nodes,
  planBlockerMetrics,
}: {
  nodes: ProfessionalAuditRoundNode[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
}): ProfessionalCoreCapabilityMetric {
  const planReady = nodes.filter((node) => node.maturity === "TRADE_PLAN_READY");
  const conditionalPlans = nodes.filter(isConditionalStrategyPlan);
  const rrQualified = nodes.filter((node) => typeof node.rewardRisk === "number" && node.rewardRisk >= 3);
  const usablePlans = planReady.filter((node) => typeof node.rewardRisk === "number" && node.rewardRisk >= 3 && (node.hit || node.qualityHit) && !node.lateAtSelection);
  const usableConditionalPlans = conditionalPlans.filter((node) =>
    node.waitPlanEvaluation.status === "triggered_tp_first"
  );
  const usableStrategyCount = usablePlans.length + usableConditionalPlans.length;
  const rrBelowCount = blockerCount(planBlockerMetrics, ["reward_risk_below_minimum", "reward_risk_unknown", "location_rr"]);
  const stopTargetIssueCount = blockerCount(planBlockerMetrics, ["no_nearest_target", "no_structural_stop", "invalid_nearest_target", "invalid_structural_stop", "stop_distance_too_tight", "stop_distance_too_wide"]);
  const pendingCount = blockerCount(planBlockerMetrics, ["reaction_not_confirmed", "structure_confirmation_pending"]);
  const planReadyRatePct = percent(planReady.length, nodes.length);
  const conditionalPlanRatePct = percent(conditionalPlans.length, nodes.length);
  const rrQualifiedRatePct = percent(rrQualified.length, nodes.length);
  const usablePlanRatePct = percent(usablePlans.length, planReady.length);
  const usableStrategyRatePct = percent(usableStrategyCount, Math.max(1, planReady.length + conditionalPlans.length));
  const planCoverageScore = Math.min(100, planReadyRatePct * 3 + conditionalPlanRatePct * 1.2);
  const score = round(
    usableStrategyRatePct * 0.35 +
    rrQualifiedRatePct * 0.20 +
    planCoverageScore * 0.20 +
    Math.max(0, 100 - percent(rrBelowCount + stopTargetIssueCount, Math.max(1, nodes.length))) * 0.25,
  );
  const failures: ProfessionalCoreCapabilityFailure[] = [];

  if (planReady.length === 0 && conditionalPlans.length === 0) {
    failures.push(failure({
      code: "strategy_no_ready_plan",
      count: nodes.length,
      detail: "本轮没有任何 TRADE_PLAN_READY，也没有 RR 合格的 WAIT_PULLBACK / WAIT_RETEST 条件计划，策略能力无法证明可执行。",
      label: "没有交易计划就绪样本",
      nextAction: "先判断是合理风控全部拦截，还是 RR/止损/目标/确认规则错杀。",
    }));
  } else if (planReady.length === 0) {
    failures.push(failure({
      code: "strategy_only_conditional_plan",
      count: conditionalPlans.length,
      detail: `本轮没有 TRADE_PLAN_READY，但有 ${conditionalPlans.length} 个 RR 合格的条件计划。它们只能说明“等什么”，不能冒充就绪信号。`,
      label: "只有条件计划，没有就绪计划",
      nextAction: "继续复查这些 WAIT_PULLBACK / WAIT_RETEST 是否给出了清晰触发、失效和复查条件。",
      sampleSymbols: conditionalPlans.slice(0, 6).map((node) => node.symbol),
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
      sampleSymbols: blockerSamples(planBlockerMetrics, ["no_nearest_target", "no_structural_stop", "invalid_nearest_target", "invalid_structural_stop", "stop_distance_too_tight", "stop_distance_too_wide"]),
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
    failedNodes: Math.max(0, nodes.length - usableStrategyCount),
    id: "strategy",
    keyMetrics: {
      conditionalPlanCount: conditionalPlans.length,
      conditionalPlanRatePct,
      planReadyCount: planReady.length,
      planReadyRatePct,
      rrBelowCount,
      rrQualifiedCount: rrQualified.length,
      rrQualifiedRatePct,
      stopTargetIssueCount,
      usablePlanRatePct,
      usableStrategyRatePct,
    },
    label: "策略：计划可执行性",
    mainFailures: failures,
    nextAction: failures.length > 0
      ? "先重查 RR、止损、目标和等待条件，禁止为了提高计划数降低风控门槛。"
      : "继续用更多样本验证计划先到 TP/SL 的真实表现。",
    passedNodes: usableStrategyCount,
    passRatePct: percent(usableStrategyCount, nodes.length),
    score,
    status: capabilityStatus(score, planReady.length === 0 && conditionalPlans.length === 0),
    summary: failures.length > 0
      ? "策略能力未达标：系统还不能稳定给出就绪计划；条件计划也必须继续验收触发和失效质量。"
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
  marketRegimeMetrics,
  nodes,
  opportunityLaneMetrics,
  opportunityQualityMetrics,
  planBlockerMetrics,
  pressureTestMetrics,
  topN,
  waitPlanMetrics,
}: {
  baselineMetrics: Record<ProfessionalReplayLaneName, ProfessionalReplayLaneMetric>;
  candidateUniverseSize: number;
  marketRegimeMetrics: ProfessionalAuditMarketRegimeMetric[];
  nodes: ProfessionalAuditRoundNode[];
  opportunityLaneMetrics: ProfessionalAuditOpportunityLaneMetric[];
  opportunityQualityMetrics: ProfessionalAuditOpportunityQualityMetric[];
  planBlockerMetrics: ProfessionalAuditPlanBlockerMetric[];
  pressureTestMetrics: ProfessionalAuditPressureTestMetric[];
  topN: number;
  waitPlanMetrics: ProfessionalAuditWaitPlanMetric;
}) {
  const findings: ProfessionalAuditFinding[] = [];
  const radar = baselineMetrics.radar;
  const random = baselineMetrics.random;
  const momentum = baselineMetrics.momentum;
  const actionableNodes = nodes.filter(isScanActionableOpportunityNode);
  const selectedNodes = nodes.filter((item) => item.selectedAsOpportunity);
  const captureRate = actionableNodes.length > 0
    ? actionableNodes.filter((item) => item.capturedByRadar).length / actionableNodes.length * 100
    : 0;
  const lateRate = selectedNodes.length > 0
    ? selectedNodes.filter((item) => item.lateAtSelection).length / selectedNodes.length * 100
    : 0;
  const missedEarlyHits = actionableNodes.filter((item) => !item.capturedByRadar && item.hit && !item.lateAtSelection);
  const missedEarlyQualityHits = actionableNodes.filter((item) => !item.capturedByRadar && item.qualityHit && !item.lateAtSelection);
  const topPlanBlocker = planBlockerMetrics[0] ?? null;
  const dominantLateRole = dominantGroup({
    keyFor: (node) => node.nodeRole,
    nodes,
    predicate: (node) => node.lateAtSelection,
  });
  const dominantMissedRole = dominantGroup({
    keyFor: (node) => node.nodeRole,
    nodes: actionableNodes,
    predicate: (node) => !node.capturedByRadar && (node.hit || node.qualityHit) && !node.lateAtSelection,
  });
  const dominantMissedCoinType = dominantGroup({
    keyFor: (node) => node.coinType,
    nodes: actionableNodes,
    predicate: (node) => !node.capturedByRadar && (node.hit || node.qualityHit) && !node.lateAtSelection,
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
      detail: `结构可行动机会池 radar topN 捕获率 ${round(captureRate)}%。风险复盘、硬结构破坏、RR 不足、止损过宽和追涨追空样本已剔除，仍然偏低，说明系统可能漏掉真正有布局价值的节点。`,
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

  if (missedEarlyHits.length > 0 || missedEarlyQualityHits.length > 0) {
    const missedUseful = [...missedEarlyHits, ...missedEarlyQualityHits];
    const avgRank = averageRadarRank(missedUseful);

    findings.push(aggregateFinding({
      detail: `发现 ${missedEarlyHits.length} 个事后大行情命中、${missedEarlyQualityHits.length} 个质量命中且不晚到、但未进入 radar topN 的机会样本。平均排序名次 ${avgRank ?? "无"}；主要节点 ${dominantMissedRole ? `${dominantMissedRole.key} ${dominantMissedRole.count}/${dominantMissedRole.total}` : "暂无"}；主要币种类型 ${dominantMissedCoinType ? `${dominantMissedCoinType.key} ${dominantMissedCoinType.count}/${dominantMissedCoinType.total}` : "暂无"}。`,
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
  const premiumQuality = opportunityQualityMetrics.find((item) => item.id === "premium_early_setup");
  const watchOnlyQuality = opportunityQualityMetrics.find((item) => item.id === "watch_only");
  const tradePlanReadyQuality = opportunityQualityMetrics.find((item) => item.id === "trade_plan_ready");
  const fakeoutQuality = opportunityQualityMetrics.find((item) => item.id === "fakeout_risk");
  const lateQuality = opportunityQualityMetrics.find((item) => item.id === "late_move");
  const noiseQuality = opportunityQualityMetrics.find((item) => item.id === "noise");

  if (earlyLane && earlyLane.totalNodes > 0 && (earlyLane.missedEarlyHitCount > 0 || earlyLane.missedEarlyQualityHitCount > 0)) {
    findings.push(aggregateFinding({
      detail: `启动前机会池共有 ${earlyLane.totalNodes} 个节点，其中 ${earlyLane.missedEarlyHitCount} 个大行情命中、${earlyLane.missedEarlyQualityHitCount} 个质量命中但未被选中。`,
      id: "PBA-SCAN-LANE-EARLY-001",
      layer: "scan",
      nextAction: "继续强化压缩、早期量能、主动买卖压力和靠近关键位的优先级。",
      rootCause: "启动前机会分层仍没有稳定把早期样本推入 TopN。",
      severity: "high",
      title: "启动前机会池仍有漏判",
    }));
  }

  if (premiumQuality && premiumQuality.totalNodes > 0 && premiumQuality.captureRatePct < 45) {
    findings.push(aggregateFinding({
      detail: `优质启动前样本 ${premiumQuality.totalNodes} 个，雷达只捕获 ${premiumQuality.capturedCount} 个，捕获率 ${premiumQuality.captureRatePct}%；漏掉的质量命中 ${premiumQuality.missedQualityHitCount} 个，代表币种 ${premiumQuality.sampleSymbols.join(" / ") || "暂无"}。`,
      id: "PBA-QUALITY-PREMIUM-MISSED-001",
      layer: "scan",
      nextAction: "把布林带/波动压缩、早期量能、相对强弱、靠近关键位和深扫轮换一起纳入排序校准，不再只追 24h 涨跌幅。",
      rootCause: "系统没有稳定把真正接近启动前的机会推入前排。",
      severity: premiumQuality.captureRatePct < 25 ? "high" : "medium",
      title: "优质启动前机会捕获不足",
    }));
  }

  if (watchOnlyQuality && watchOnlyQuality.totalNodes > 0 && watchOnlyQuality.falsePositiveRatePct >= 45) {
    findings.push(aggregateFinding({
      detail: `值得观察但不能做的样本被选中 ${watchOnlyQuality.capturedCount} 个，假阳性率 ${watchOnlyQuality.falsePositiveRatePct}%。这类信号必须讲清“缺什么、等什么”，不能包装成狙击目标。`,
      id: "PBA-QUALITY-WATCH-AMBIGUOUS-001",
      layer: "structure",
      nextAction: "把观察级信号和交易计划级信号彻底分层，前端展示必须避免让观察信号看起来像可直接执行。",
      rootCause: "信号成熟度表达不够硬，观察信号仍可能污染主信号区。",
      severity: "medium",
      title: "观察级信号容易被误读",
    }));
  }

  if (tradePlanReadyQuality && tradePlanReadyQuality.totalNodes > 0 && tradePlanReadyQuality.falsePositiveRatePct > 0) {
    findings.push(aggregateFinding({
      detail: `交易计划就绪样本 ${tradePlanReadyQuality.totalNodes} 个，其中被捕获后仍有 ${tradePlanReadyQuality.falsePositiveCount} 个假阳性。计划就绪必须继续追踪 TP/SL、MFE/MAE 和失效条件。`,
      id: "PBA-QUALITY-PLAN-FALSE-POSITIVE-001",
      layer: "plan",
      nextAction: "抽样复查交易计划的入场触发、止损、目标、RR 和失效条件，优先修正计划质量而不是增加计划数量。",
      rootCause: "可执行计划层仍存在质量不稳定。",
      severity: tradePlanReadyQuality.falsePositiveRatePct >= 35 ? "high" : "medium",
      title: "交易计划就绪样本仍有假阳性",
    }));
  }

  if (fakeoutQuality && fakeoutQuality.capturedCount > 0) {
    findings.push(aggregateFinding({
      detail: `假突破风险样本被雷达选中 ${fakeoutQuality.capturedCount} 个，代表币种 ${fakeoutQuality.sampleSymbols.join(" / ") || "暂无"}。这些样本只能做风险提示或等待确认。`,
      id: "PBA-QUALITY-FAKEOUT-SELECTED-001",
      layer: "structure",
      nextAction: "把未确认突破/跌破、长影线衰竭、结构失效重新站回等条件前置为硬门控。",
      rootCause: "假突破风险没有被稳定挡在交易计划外。",
      severity: fakeoutQuality.capturedCount >= 3 ? "high" : "medium",
      title: "假突破风险进入候选前排",
    }));
  }

  if (lateQuality && lateQuality.capturedCount > 0) {
    findings.push(aggregateFinding({
      detail: `已经晚了的样本被雷达选中 ${lateQuality.capturedCount} 个，假阳性率 ${lateQuality.falsePositiveRatePct}%，代表币种 ${lateQuality.sampleSymbols.join(" / ") || "暂无"}。`,
      id: "PBA-QUALITY-LATE-SELECTED-001",
      layer: "timing",
      nextAction: "把已涨/已跌过多、位置过远、RR 不足和追涨追空风险从排序层降权，不要等策略层才拦截。",
      rootCause: "扫描层仍会把事后行情、末端行情推上来。",
      severity: lateQuality.capturedCount >= 3 ? "high" : "medium",
      title: "已迟到机会仍被推上前排",
    }));
  }

  if (noiseQuality && noiseQuality.capturedCount > 0) {
    findings.push(aggregateFinding({
      detail: `噪音样本被雷达选中 ${noiseQuality.capturedCount} 个，假阳性率 ${noiseQuality.falsePositiveRatePct}%。噪音不应进入主信号区。`,
      id: "PBA-QUALITY-NOISE-SELECTED-001",
      layer: "scan",
      nextAction: "提高最小证据门槛，要求结构、位置、量能、相对强弱或衍生品至少形成多项共振。",
      rootCause: "轻扫异常和低质量波动仍可能污染深扫/主信号。",
      severity: noiseQuality.capturedCount >= 3 ? "high" : "medium",
      title: "噪音样本进入候选前排",
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
      detail: `本轮没有交易计划就绪样本；最常见阻断是 ${topPlanBlocker.label}，类别 ${professionalAuditPlanBlockerCategoryLabel(topPlanBlocker.category)}，诊断 ${professionalAuditPlanBlockerDiagnosisLabel(topPlanBlocker.diagnosis)}，出现 ${topPlanBlocker.count} 次；其中质量命中 ${topPlanBlocker.qualityHitCount} 次、已被雷达捕获 ${topPlanBlocker.capturedCount} 次、条件等待 ${topPlanBlocker.conditionalWaitCount} 次，代表币种 ${topPlanBlocker.sampleSymbols.join(" / ") || "暂无"}。`,
      id: "PBA-PLAN-BLOCKER-ROUND-001",
      layer: "plan",
      nextAction: "不要强行生成交易计划；先判断阻断是合理风控，还是结构/RR/确认规则过严导致错杀。",
      rootCause: "证据链到交易计划之间的门禁没有形成可执行通过样本。",
      severity: "high",
      title: "交易计划未就绪原因需要专项处理",
    }));
  }

  if (waitPlanMetrics.totalWaitPlans > 0 && waitPlanMetrics.missingLevelCount > 0) {
    findings.push(aggregateFinding({
      detail: `${waitPlanMetrics.missingLevelCount} 个 WAIT_PULLBACK / WAIT_RETEST 条件计划缺少结构止损或第一目标，无法验证触发后 TP/SL 先后。`,
      id: "PBA-PLAN-WAIT-LEVELS-001",
      layer: "plan",
      nextAction: "先修等待型计划的结构止损、第一目标和 RR 输出，再讨论计划命中率。",
      rootCause: "条件计划只有等待语义，没有足够结构位用于后验验证。",
      severity: "high",
      title: "等待型计划缺少可验证结构位",
    }));
  }

  if (waitPlanMetrics.totalWaitPlans > 0 && waitPlanMetrics.badWaitRatePct >= 35) {
    const topDiagnostics = waitPlanMetrics.diagnosticBreakdown
      .slice(0, 3)
      .map((item) => `${item.label} ${item.count} 次`)
      .join("，") || "暂无细分诊断";

    findings.push(aggregateFinding({
      detail: `等待型计划共 ${waitPlanMetrics.totalWaitPlans} 个，触发后先到止损 ${waitPlanMetrics.stopFirstCount} 个，占 ${waitPlanMetrics.badWaitRatePct}%。主要诊断：${topDiagnostics}。平均触发质量 ${waitPlanMetrics.avgTriggerQualityScore ?? "无"}。`,
      id: "PBA-PLAN-WAIT-QUALITY-001",
      layer: "plan",
      nextAction: "按诊断项分别复核触发反应强度、触发后 RR、结构止损、第一目标和反向压力，不能只写“等待”。",
      rootCause: "等待条件触发后质量不足，已拆分为触发反应、触发后 RR、顺向延续和反向压力诊断。",
      severity: "high",
      title: "等待型计划触发后质量不足",
    }));
  }

  const topPressure = pressureTestMetrics[0];
  const relaxedPressure = pressureTestMetrics.at(-1);

  if (
    topPressure &&
    relaxedPressure &&
    relaxedPressure.missedEarlyQualityHitCount < topPressure.missedEarlyQualityHitCount
  ) {
    findings.push(aggregateFinding({
      detail: `Top${topPressure.topN} 漏判质量机会 ${topPressure.missedEarlyQualityHitCount} 个；放宽到 Top${relaxedPressure.topN} 后为 ${relaxedPressure.missedEarlyQualityHitCount} 个。说明部分机会不是没识别，而是排序/名额压力下排不上。`,
      id: "PBA-SCAN-PRESSURE-001",
      layer: "scan",
      nextAction: "检查 TopN 槽位、机会池配额和固定币/普通噪声占位，不要把问题误判为分析完全不会识别。",
      rootCause: "全市场压力下 TopN 名额不足或排序权重仍不够精准。",
      severity: "medium",
      title: "全市场候选池压力导致机会排不上",
    }));
  }

  const weakRegime = marketRegimeMetrics.find((metric) =>
    metric.regime !== "extended_or_risk" &&
    metric.totalNodes >= 5 &&
    metric.qualityHitRatePct >= 20 &&
    metric.captureRatePct < 25
  );

  if (weakRegime) {
    findings.push(aggregateFinding({
      detail: `${weakRegime.label} 有 ${weakRegime.totalNodes} 个节点，质量命中率 ${weakRegime.qualityHitRatePct}%，但捕获率只有 ${weakRegime.captureRatePct}%。代表币种：${weakRegime.sampleSymbols.join(" / ") || "暂无"}。`,
      id: "PBA-SCAN-REGIME-001",
      layer: "scan",
      nextAction: "按市场状态分组修正扫描排序，不要用一套权重同时处理压缩、放量、回踩和大周期样本。",
      rootCause: "某类市场状态下有质量机会，但当前雷达没有稳定把它推到前排。",
      severity: "medium",
      title: "市场状态分组暴露扫描弱区",
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

  if (findings.some((item) => item.id === "PBA-QUALITY-PREMIUM-MISSED-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮优质启动前机会捕获率高于 45%，且漏判质量命中数量下降。",
      action: "把优质启动前分类作为扫描排序校准目标，优先修压缩、早期量能、相对强弱、关键位靠近和轮换公平性。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "premium early setup ranking calibration",
    });
  }

  if (findings.some((item) => item.id === "PBA-QUALITY-WATCH-AMBIGUOUS-001")) {
    remediations.push({
      acceptanceCriteria: "前端和报告能清楚区分观察级、证据信号和交易计划；观察级不进入狙击榜。",
      action: "加强信号成熟度分层，把 watch_only 明确标为等待条件，不允许生成完整交易计划。",
      canAutoApply: false,
      layer: "structure",
      priority: "P1",
      targetModule: "signal maturity and watch-only contract",
    });
  }

  if (findings.some((item) => item.id === "PBA-QUALITY-PLAN-FALSE-POSITIVE-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮交易计划就绪样本假阳性率下降，并逐笔输出触发、止损、目标、失效和 MFE/MAE。",
      action: "复查 TRADE_PLAN_READY 的结构位、RR、触发确认和风险门控，不通过就降级为等待或观察。",
      canAutoApply: false,
      layer: "plan",
      priority: "P0",
      targetModule: "trade plan ready quality gate",
    });
  }

  if (findings.some((item) => item.id === "PBA-QUALITY-FAKEOUT-SELECTED-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮假突破风险样本不进入交易计划，进入候选时必须显示等待确认或风险提示。",
      action: "把假突破、长影线衰竭、失守后收回、突破未确认等条件前置为硬门控。",
      canAutoApply: false,
      layer: "structure",
      priority: "P0",
      targetModule: "fakeout and invalidation gate",
    });
  }

  if (findings.some((item) => item.id === "PBA-QUALITY-LATE-SELECTED-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮 late_move 被捕获数量下降，已涨/已跌过多样本只能输出等待回踩/反抽或复盘教材。",
      action: "在扫描排序层加入已发生行情降权，避免把末端行情送入狙击榜。",
      canAutoApply: false,
      layer: "timing",
      priority: "P0",
      targetModule: "anti-late and anti-chase ranking gate",
    });
  }

  if (findings.some((item) => item.id === "PBA-QUALITY-NOISE-SELECTED-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮 noise 被捕获数量下降；没有至少两到三项证据共振的样本不能进入主信号区。",
      action: "提高低质量波动过滤门槛，轻扫异常只做调度，不直接变成用户可见信号。",
      canAutoApply: false,
      layer: "scan",
      priority: "P0",
      targetModule: "noise filter and evidence threshold",
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

  if (findings.some((item) => item.id === "PBA-PLAN-WAIT-LEVELS-001" || item.id === "PBA-PLAN-WAIT-QUALITY-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮 WAIT_PULLBACK / WAIT_RETEST 必须输出可验证结构位，并展示触发后先到 TP/SL/超时的统计。",
      action: "把等待型计划从空泛文案升级为可后验计划：触发区、结构止损、第一目标、失效和复查条件必须完整。",
      canAutoApply: false,
      layer: "plan",
      priority: "P0",
      targetModule: "wait plan trigger validation",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-PRESSURE-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮 Top10/Top20/Top30 压力表显示漏判质量机会随名额变化的原因，并减少 Top10 漏判。",
      action: "按全市场候选压力复查 TopN 配额和排序，不让普通噪声或固定币挤掉早期质量机会。",
      canAutoApply: false,
      layer: "scan",
      priority: "P1",
      targetModule: "candidate pressure ranking audit",
    });
  }

  if (findings.some((item) => item.id === "PBA-SCAN-REGIME-001")) {
    remediations.push({
      acceptanceCriteria: "下一轮市场状态分组表能说明每类状态捕获率，并让弱势分组捕获率改善或明确降级理由。",
      action: "按压缩、早期放量、回踩确认、大周期背景分开调权，不再用同一套评分处理所有状态。",
      canAutoApply: false,
      layer: "scan",
      priority: "P1",
      targetModule: "market regime grouped ranking audit",
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
        opportunityQuality: target.opportunityQuality,
        opportunityQualityLabel: target.opportunityQualityLabel,
        planBlockers: target.planBlockers,
        qualityHit: target.qualityHit,
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
        waitPlanEvaluation: target.waitPlanEvaluation,
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
  const opportunityQualityMetrics = buildOpportunityQualityMetrics(nodes);
  const planBlockerMetrics = buildPlanBlockerMetrics(nodes);
  const levelQualityMetrics = buildLevelQualityMetrics(planBlockerMetrics);
  const waitPlanMetrics = buildWaitPlanMetrics(nodes);
  const pressureTestMetrics = buildPressureTestMetrics(nodes, topN, candidateUniverseSize);
  const marketRegimeMetrics = buildMarketRegimeMetrics(nodes);
  const ruleStabilityMetrics = buildRuleStabilityMetrics(nodes);
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
    marketRegimeMetrics,
    nodes,
    opportunityLaneMetrics,
    opportunityQualityMetrics,
    planBlockerMetrics,
    pressureTestMetrics,
    topN,
    waitPlanMetrics,
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
    .filter((item) => !item.capturedByRadar && (item.hit || item.qualityHit) && !item.lateAtSelection)
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
      opportunityLaneScore: item.opportunityLaneScore,
      opportunityQuality: item.opportunityQuality,
      opportunityQualityLabel: item.opportunityQualityLabel,
      planBlockers: item.planBlockers,
      radarRank: item.radarRank,
      radarScore: item.radarScore,
      reason: `该目标节点事后${item.hit ? "达到大行情阈值" : "达到质量命中阈值"}，但当时 radar 排名第 ${item.radarRank ?? "未知"}，未进入 Top${item.topN}；用于检查扫描覆盖、候选排序和深扫槽位。`,
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
    opportunityQualityMetrics,
    planBlockerMetrics,
    levelQualityMetrics,
    waitPlanMetrics,
    pressureTestMetrics,
    marketRegimeMetrics,
    ruleStabilityMetrics,
    remediationPlan,
    roundSummary,
    schemaVersion: "professional-backtest-audit-report.v2",
    summary: auditRound.summary,
    timingMetrics,
  };
}
