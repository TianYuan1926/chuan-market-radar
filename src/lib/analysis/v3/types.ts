import type {
  Timeframe,
} from "../types";

export type TrendTimeframe = Exclude<Timeframe, "1m" | "30m"> | "1M";

export type TrendState =
  | "RANGE_IDLE"
  | "RANGE_COMPRESSION"
  | "PRE_TREND_LONG"
  | "PRE_TREND_SHORT"
  | "LONG_BREAKOUT"
  | "SHORT_BREAKDOWN"
  | "LONG_PULLBACK_CONFIRM"
  | "SHORT_RETEST_CONFIRM"
  | "LONG_TREND_ACCELERATION"
  | "SHORT_TREND_ACCELERATION"
  | "LONG_EXHAUSTION"
  | "SHORT_EXHAUSTION"
  | "INVALIDATED"
  | "CONFLICT";

export type TrendDecision =
  | "WATCH_ONLY"
  | "PREPARE_LONG"
  | "PREPARE_SHORT"
  | "WAIT_LONG_BREAKOUT"
  | "WAIT_SHORT_BREAKDOWN"
  | "WAIT_LONG_PULLBACK"
  | "WAIT_SHORT_RETEST"
  | "LONG_PLAN"
  | "SHORT_PLAN"
  | "AVOID_CHASE_LONG"
  | "AVOID_CHASE_SHORT"
  | "TREND_HOLD_LONG"
  | "TREND_HOLD_SHORT"
  | "TAKE_PROFIT_LONG"
  | "TAKE_PROFIT_SHORT"
  | "NO_TRADE"
  | "CONFLICT_WAIT"
  | "INVALIDATED";

export type V3EvidenceFamily =
  | "PRICE_STRUCTURE"
  | "KEY_LEVEL"
  | "LOCATION_RR"
  | "VOLUME_VOLATILITY"
  | "DERIVATIVES"
  | "RELATIVE_STRENGTH"
  | "MARKET_REGIME"
  | "TECHNICAL_INDICATOR";

export type KeyLevelType =
  | "SWING_HIGH"
  | "SWING_LOW"
  | "RANGE_HIGH"
  | "RANGE_LOW"
  | "ROLE_FLIP"
  | "VOLUME_NODE"
  | "DYNAMIC_LEVEL"
  | "PSYCHOLOGICAL"
  | "STATE_CHANGE";

export type KeyLevelDirection = "SUPPORT" | "RESISTANCE" | "BOTH";

export type KeyLevelStatus =
  | "POTENTIAL"
  | "ARRIVED"
  | "REACTION_STARTED"
  | "CONFIRMED"
  | "WEAKENING"
  | "BROKEN"
  | "RECLAIMED"
  | "INVALIDATED";

export type KeyLevel = {
  id: string;
  symbol: string;
  timeframe: TrendTimeframe;
  type: KeyLevelType;
  zoneLow: number;
  zoneHigh: number;
  midPrice: number;
  direction: KeyLevelDirection;
  keyScore: number;
  reactionScore: number;
  confluenceScore: number;
  status: KeyLevelStatus;
  reasons: string[];
  confirmationRules: string[];
  invalidationRule: string;
};

export type ForwardLevelSide = "SUPPORT" | "RESISTANCE";

export type ForwardLevelRole =
  | "CURRENT_DEFENSE"
  | "NEXT_REACTION_ZONE"
  | "FIRST_REBOUND_RESISTANCE"
  | "SECOND_REBOUND_RESISTANCE"
  | "TREND_CHANGE_LEVEL"
  | "INVALIDATION_LEVEL";

export type ForwardLevelStatus =
  | "AHEAD"
  | "ARRIVED"
  | "REACTION"
  | "CONFIRMED"
  | "BROKEN"
  | "RECLAIMED"
  | "INVALIDATED";

export type ForwardLevel = {
  id: string;
  symbol: string;
  side: ForwardLevelSide;
  role: ForwardLevelRole;
  zoneLow: number;
  zoneHigh: number;
  timeframeWeight: number;
  keyScore: number;
  status: ForwardLevelStatus;
  reasons: string[];
  confirmationRules: string[];
  invalidationRules: string[];
  sourceLevelIds: string[];
};

export type TrendScores = {
  longPreTrendScore: number;
  shortPreTrendScore: number;
  longTrendEnergyScore: number;
  shortTrendEnergyScore: number;
  riskScore: number;
  trendHoldScore: number;
  exhaustionScore: number;
};

export type TrendRadarReviewType =
  | "trend_switch_review"
  | "forward_map_review"
  | "key_level_reaction_review"
  | "risk_gate_review"
  | "missed_altcoin_review";

export type TrendRadarReviewVerdict =
  | "pending"
  | "reaction_confirmed"
  | "invalidated"
  | "missed"
  | "saved"
  | "false_positive"
  | "needs_more_evidence";

export type TrendRadarReview = {
  id: string;
  type: TrendRadarReviewType;
  symbol: string;
  sourceId: string;
  verdict: TrendRadarReviewVerdict;
  detail: string;
  observedAt: string;
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  evidenceIds: string[];
};

export type StrategyV3Dossier = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  currentPrice: number;
  forwardLevels: ForwardLevel[];
  guardrails: string[];
  keyLevels: KeyLevel[];
  primaryTimeframe: TrendTimeframe;
  source: "existing_ohlcv_key_level_mvp";
  sourceTimeframes: TrendTimeframe[];
  summary: string;
  symbol: string;
};
