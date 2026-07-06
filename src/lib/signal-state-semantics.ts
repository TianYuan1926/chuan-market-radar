import { uiStatusLabel } from "./ui-schema/status-labels";

export type DisplaySignalMaturity =
  | "LIGHT_SCAN_MARK"
  | "DEEP_SCAN_CANDIDATE"
  | "EVIDENCE_SIGNAL"
  | "REVIEW_ONLY"
  | "TRADE_PLAN_READY"
  | "BLOCKED"
  | "INVALIDATED"
  | "COOLDOWN";

export type CoreSemanticState =
  | "WAIT"
  | "WATCH"
  | "CANDIDATE"
  | "SIGNAL"
  | "EVIDENCE_SIGNAL"
  | "TRADE_PLAN_READY"
  | "BLOCKED";

export type SemanticTone = "live" | "neon" | "warn" | "down" | "muted";

export type SemanticLane = "sniper" | "watch" | "validate" | "blocked" | "review";

export type StateDefinition = {
  state: CoreSemanticState;
  label: string;
  short: string;
  userLabel: string;
  definition: string;
  boundary: string;
  canTrade: boolean;
  canDisplay: boolean;
  canEnterSniper: boolean;
  canAttachTradePlan: boolean;
  canUpgrade: boolean;
  upgradeRule: string;
  lane: SemanticLane;
  laneLabel: "计划就绪区" | "重点观察" | "验证中" | "不看" | "只复盘";
  misleadingRisk: string;
};

export type MaturityDisplayMeta = {
  label: string;
  short: string;
  tone: SemanticTone;
  order: number;
  semanticState: CoreSemanticState;
  userLabel: string;
  boundary: string;
  canTrade: boolean;
  canEnterSniper: boolean;
  canAttachTradePlan: boolean;
};

export const STATE_DEFINITION_MAP: Record<CoreSemanticState, StateDefinition> = {
  WAIT: {
    state: "WAIT",
    label: "等待条件",
    short: "等待",
    userLabel: "等待条件",
    definition: "结构或位置有观察价值，但还缺少突破、回踩、反抽、量能或高周期确认。",
    boundary: "WAIT 不是交易计划，不允许显示为可直接执行。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "只有新行情数据满足后端触发条件，并重新通过证据融合、结构盈亏比和风控门禁后才能升级。",
    lane: "validate",
    laneLabel: "验证中",
    misleadingRisk: "把等待确认写成入场信号。",
  },
  WATCH: {
    state: "WATCH",
    label: "观察",
    short: "观察",
    userLabel: "只观察",
    definition: "当前只用于背景、跟踪或复盘，不具备可交易条件。",
    boundary: "WATCH 不能给方向承诺，不能生成入场、止损或目标。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "必须重新进入扫描和分析链路，不能由前端直接升级。",
    lane: "watch",
    laneLabel: "重点观察",
    misleadingRisk: "把观察对象包装成推荐。",
  },
  CANDIDATE: {
    state: "CANDIDATE",
    label: "候选观察",
    short: "候选",
    userLabel: "候选观察",
    definition: "轻扫、榜单或深扫排队发现的待验证标的。",
    boundary: "候选观察只说明值得继续验证，不是交易计划或执行依据。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "必须完成深扫验证、盘面结构、证据融合、结构盈亏比和风控门禁。",
    lane: "validate",
    laneLabel: "验证中",
    misleadingRisk: "候选池数量被误读为可交易机会数量。",
  },
  SIGNAL: {
    state: "SIGNAL",
    label: "证据观察",
    short: "证据",
    userLabel: "证据观察",
    definition: "已经进入主信号区的观察对象，但不代表可交易。",
    boundary: "证据观察是用户可读归类，不是交易执行权限。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "必须变成交易计划就绪后才能附带完整策略计划。",
    lane: "watch",
    laneLabel: "重点观察",
    misleadingRisk: "证据观察容易被误读为买卖点，必须配套不可交易说明。",
  },
  EVIDENCE_SIGNAL: {
    state: "EVIDENCE_SIGNAL",
    label: uiStatusLabel("EVIDENCE_SIGNAL"),
    short: "证据",
    userLabel: uiStatusLabel("EVIDENCE_SIGNAL"),
    definition: "已有结构或数据证据，值得重点观察，但交易条件仍未全部通过。",
    boundary: "证据观察不能附带完整交易计划，不能进入计划就绪区。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "必须由后端确认结构盈亏比、风控、结构、触发、失效条件全部满足。",
    lane: "watch",
    laneLabel: "重点观察",
    misleadingRisk: "被误读为已经可买卖的执行依据。",
  },
  TRADE_PLAN_READY: {
    state: "TRADE_PLAN_READY",
    label: "交易计划就绪",
    short: "就绪",
    userLabel: "交易计划就绪",
    definition: "证据、结构、结构盈亏比、风控门禁、入场、止损、目标和失效条件都已由后端生成。",
    boundary: "这是唯一可进入计划就绪区的状态；仍只供人工复核，不自动下单。",
    canTrade: true,
    canDisplay: true,
    canEnterSniper: true,
    canAttachTradePlan: true,
    canUpgrade: false,
    upgradeRule: "终态由后端策略层生成，前端无权升级。",
    lane: "sniper",
    laneLabel: "计划就绪区",
    misleadingRisk: "若没有完整计划却显示计划就绪，就是 P0 误导。",
  },
  BLOCKED: {
    state: "BLOCKED",
    label: "风控阻断",
    short: "拦截",
    userLabel: "不可交易",
    definition: "被风控、结构盈亏比、结构、多周期、数据质量、晚到或失效条件阻断。",
    boundary: "BLOCKED 可以解释原因，不能生成或展示交易计划。",
    canTrade: false,
    canDisplay: true,
    canEnterSniper: false,
    canAttachTradePlan: false,
    canUpgrade: true,
    upgradeRule: "必须阻断原因解除并重新通过后端完整链路。",
    lane: "blocked",
    laneLabel: "不看",
    misleadingRisk: "把拦截原因写成反向交易机会。",
  },
};

export const MATURITY_TO_SEMANTIC_STATE: Record<DisplaySignalMaturity, CoreSemanticState> = {
  LIGHT_SCAN_MARK: "CANDIDATE",
  DEEP_SCAN_CANDIDATE: "CANDIDATE",
  EVIDENCE_SIGNAL: "EVIDENCE_SIGNAL",
  REVIEW_ONLY: "WATCH",
  TRADE_PLAN_READY: "TRADE_PLAN_READY",
  BLOCKED: "BLOCKED",
  INVALIDATED: "BLOCKED",
  COOLDOWN: "WAIT",
};

export const MATURITY_DISPLAY_META: Record<DisplaySignalMaturity, MaturityDisplayMeta> = {
  LIGHT_SCAN_MARK: {
    label: "快速轻扫",
    short: "发现",
    tone: "muted",
    order: 5,
    semanticState: "CANDIDATE",
    userLabel: "快速轻扫",
    boundary: "只做调度输入，不进入主信号区。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  DEEP_SCAN_CANDIDATE: {
    label: "深度确认",
    short: "候选",
    tone: "neon",
    order: 4,
    semanticState: "CANDIDATE",
    userLabel: "验证中",
    boundary: "只说明值得验证，不能当作交易计划或执行依据。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  EVIDENCE_SIGNAL: {
    label: uiStatusLabel("EVIDENCE_SIGNAL"),
    short: "证据",
    tone: "neon",
    order: 3,
    semanticState: "EVIDENCE_SIGNAL",
    userLabel: uiStatusLabel("EVIDENCE_SIGNAL"),
    boundary: "可进观察区，但不能进计划就绪区，不能附带完整计划。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  REVIEW_ONLY: {
    label: "复盘观察",
    short: "复盘",
    tone: "warn",
    order: 6,
    semanticState: "WATCH",
    userLabel: "只复盘",
    boundary: "只做复盘教材，不追涨追跌。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  TRADE_PLAN_READY: {
    label: "交易计划就绪",
    short: "就绪",
    tone: "live",
    order: 1,
    semanticState: "TRADE_PLAN_READY",
    userLabel: "交易计划就绪",
    boundary: "唯一允许进入计划就绪区和展示完整计划的状态。",
    canTrade: true,
    canEnterSniper: true,
    canAttachTradePlan: true,
  },
  BLOCKED: {
    label: "风控阻断",
    short: "拦截",
    tone: "down",
    order: 7,
    semanticState: "BLOCKED",
    userLabel: "不可交易",
    boundary: "可说明原因，不能生成交易计划。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  INVALIDATED: {
    label: "结构失效",
    short: "失效",
    tone: "down",
    order: 8,
    semanticState: "BLOCKED",
    userLabel: "结构失效",
    boundary: "只能归档或等待重新进入链路。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
  COOLDOWN: {
    label: "冷却观察",
    short: "冷却",
    tone: "warn",
    order: 9,
    semanticState: "WAIT",
    userLabel: "冷却观察",
    boundary: "冷却期间不能展示为机会。",
    canTrade: false,
    canEnterSniper: false,
    canAttachTradePlan: false,
  },
};

export function semanticStateForMaturity(maturity: DisplaySignalMaturity): CoreSemanticState {
  return MATURITY_TO_SEMANTIC_STATE[maturity];
}

export function definitionForState(state: CoreSemanticState): StateDefinition {
  return STATE_DEFINITION_MAP[state];
}

export function definitionForMaturity(maturity: DisplaySignalMaturity): StateDefinition {
  return definitionForState(semanticStateForMaturity(maturity));
}

export function canEnterSniper({
  maturity,
  rr,
  whyBlocked,
}: {
  maturity: DisplaySignalMaturity;
  rr: number | null | undefined;
  whyBlocked?: string | null;
}) {
  return MATURITY_DISPLAY_META[maturity].canEnterSniper &&
    typeof rr === "number" &&
    Number.isFinite(rr) &&
    rr >= 3 &&
    !whyBlocked;
}

export function canAttachTradePlan(maturity: DisplaySignalMaturity) {
  return MATURITY_DISPLAY_META[maturity].canAttachTradePlan;
}

export function nonMisleadingNoTradeReason(maturity: DisplaySignalMaturity, fallback?: string | null) {
  if (fallback && fallback.trim().length > 0) return fallback;
  return MATURITY_DISPLAY_META[maturity].boundary;
}

export function normalizeUiSignalSourceLabel(source: string | undefined) {
  if (!source) return "后端契约";
  if (source.includes("leaderboard")) return "榜单观察源";
  if (source.includes("signal-worker")) return "后端信号源";
  if (source.includes("coinglass")) return "CoinGlass 深扫源";
  if (source.includes("public-light")) return "公开轻扫源";
  return source;
}
