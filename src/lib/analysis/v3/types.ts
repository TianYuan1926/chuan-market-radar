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

export type TrendTimeframeStructure =
  | "COMPRESSING"
  | "DOWNTREND"
  | "RANGE"
  | "UPTREND";

export type MarketReadingStructure =
  | "DOWN_SEQUENCE"
  | "INSUFFICIENT_STRUCTURE"
  | "RANGE_SEQUENCE"
  | "UP_SEQUENCE";

export type MarketReadingEventType =
  | "BOS_DOWN"
  | "BOS_UP"
  | "CHOCH_DOWN"
  | "CHOCH_UP"
  | "FAKE_BREAKDOWN"
  | "FAKE_BREAKOUT"
  | "HH"
  | "HL"
  | "LH"
  | "LL";

export type MarketReadingEvent = {
  candleIndex: number;
  detail: string;
  occurredAt: string;
  price: number;
  type: MarketReadingEventType;
};

export type MarketReadingContext = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  events: MarketReadingEvent[];
  latestClose: number;
  range: {
    high: number;
    low: number;
    widthPercent: number;
  };
  structure: MarketReadingStructure;
  summary: string;
  swingHighCount: number;
  swingLowCount: number;
  symbol: string;
  timeframe: TrendTimeframe;
};

export type TrendTimeframeContext = {
  changePercent: number;
  close: number;
  compressionScore: number;
  directionalScore: number;
  rangePercent: number;
  structure: TrendTimeframeStructure;
  timeframe: TrendTimeframe;
};

export type StrategyV3RiskGate = {
  allowed: boolean;
  blockedBy: string[];
  mode: "readonly_v3_risk_gate";
};

export type V3LocationDirection = "long" | "short" | "neutral";

export type V3LocationRiskFlag =
  | "chase_risk"
  | "neutral_direction"
  | "no_nearest_target"
  | "no_structural_stop"
  | "reward_risk_below_minimum"
  | "stop_distance_too_wide";

export type V3PositionQuality =
  | "CHASE_RISK"
  | "GOOD_LOCATION"
  | "NEUTRAL_DIRECTION"
  | "NO_STRUCTURAL_STOP"
  | "NO_TARGET"
  | "POOR_RR"
  | "WATCH_LOCATION";

export type StrategyV3LocationRiskReward = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  currentPrice: number;
  direction: V3LocationDirection;
  hasTradeSignal: false;
  isTradeEligible: boolean;
  minRewardRisk: number;
  nearestTarget: number | null;
  positionQuality: V3PositionQuality;
  rewardRisk: number | null;
  riskFlags: V3LocationRiskFlag[];
  stopDistance: number;
  stopDistancePercent: number;
  structuralStop: number | null;
  summary: string;
  targetDistance: number;
  targetDistancePercent: number;
  targetLevelId: string | null;
  stopLevelId: string | null;
};

export type V3ReactionStatus =
  | "CONFIRMED"
  | "FAILED"
  | "NO_REACTION"
  | "REACTION_STARTED"
  | "TOO_FAR_FROM_LEVEL";

export type V3ReactionRiskFlag =
  | "no_relevant_level"
  | "no_recent_touch"
  | "resistance_reclaimed"
  | "support_lost";

export type StrategyV3ReactionQuality = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  direction: V3LocationDirection;
  evidence: string[];
  hasTradeSignal: false;
  qualityScore: number;
  riskFlags: V3ReactionRiskFlag[];
  status: V3ReactionStatus;
  summary: string;
  touchedLevelId: string | null;
};

export type V3TrendIntegrityStatus =
  | "DAMAGED_TREND"
  | "EXHAUSTION_RISK"
  | "HEALTHY_TREND"
  | "INSUFFICIENT_DATA"
  | "RANGE_BOUND";

export type V3TrendIntegrityRiskFlag =
  | "bear_structure_broken"
  | "bull_structure_broken"
  | "insufficient_market_reading"
  | "lower_wick_exhaustion"
  | "low_alignment"
  | "upper_wick_exhaustion";

export type StrategyV3TrendIntegrity = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  direction: V3LocationDirection;
  evidence: string[];
  hasTradeSignal: false;
  integrityScore: number;
  riskFlags: V3TrendIntegrityRiskFlag[];
  status: V3TrendIntegrityStatus;
  summary: string;
};

export type StrategyV3TrendContext = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  conflicts: string[];
  decision: TrendDecision;
  guardrail: string;
  locationRiskReward?: StrategyV3LocationRiskReward;
  marketReadings?: MarketReadingContext[];
  nextStep: string;
  noParticipationReasons: string[];
  reactionQuality?: StrategyV3ReactionQuality;
  riskGate: StrategyV3RiskGate;
  scores: TrendScores;
  state: TrendState;
  summary: string;
  timeframes: TrendTimeframeContext[];
  trendIntegrity?: StrategyV3TrendIntegrity;
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

export type TrendRadarReviewSkipReasonCode =
  | "no_forward_levels"
  | "no_future_candles"
  | "ohlcv_unavailable"
  | "unsupported_timeframe";

export type TrendRadarReviewSkipReasonSummary = {
  code: TrendRadarReviewSkipReasonCode;
  count: number;
  label: string;
  symbols: string[];
};

export type TrendRadarReviewRunSummary = {
  failedFetches: number;
  failures: Array<{
    error: string;
    reason: string;
    scanId: string;
    signalId: string;
    symbol: string;
  }>;
  fetchedCandles: number;
  reviewedSnapshots: number;
  scannedSnapshots: number;
  skippedReasons: TrendRadarReviewSkipReasonSummary[];
  skippedSnapshots: number;
  writtenEvents: number;
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
  trendContext?: StrategyV3TrendContext;
};

export type V3ForwardMapSnapshot = {
  allowedUse: "research_only";
  canAutoAdjustWeights: false;
  canMutateLiveRanking: false;
  dossier: StrategyV3Dossier;
  generatedAt: string;
  scanId: string;
  signalId: string;
  symbol: string;
};
