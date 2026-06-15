import type { TimeframeProfile } from "./timeframe-profile";

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w";

export type SignalDirection = "long" | "short" | "neutral";

export type SignalState =
  | "no_trade"
  | "insufficient_data"
  | "abnormal_watch"
  | "normal_watch"
  | "waiting_confirmation"
  | "near_trigger"
  | "triggered"
  | "invalidated"
  | "reviewed";

export type MarketRegime =
  | "risk_on"
  | "risk_off"
  | "range"
  | "mixed"
  | "unknown";

export type RiskGrade = "low" | "medium" | "high" | "blocked";

export type AnalysisLayer =
  | "data_quality"
  | "market_regime"
  | "structure_location"
  | "price_volume"
  | "derivatives"
  | "indicators"
  | "risk_reward"
  | "flexibility"
  | "ai_review"
  | "lifecycle_review";

export type EvidencePoint = {
  label: string;
  value: string;
  layer: AnalysisLayer;
  polarity: "supportive" | "conflicting" | "neutral" | "blocking";
};

export type StrategyPlan = {
  bias: SignalDirection;
  entry: string;
  invalidation: string;
  targets: string[];
  riskReward: number;
  positionHint: string;
  status?: "actionable" | "waiting" | "observe_only" | "blocked";
  entryZone?: string;
  stopLoss?: string;
  takeProfitPlan?: string;
  noChase?: boolean;
  confirmation?: string[];
  counterEvidence?: string[];
  riskControls?: string[];
};

export type AiReviewStatus = "disabled" | "fallback" | "reviewed";

export type AiReviewSections = {
  fact: string;
  reasoning: string;
  judgment: string;
  strategy: string;
  failurePath: string;
  uncertainty: string;
};

export type AiSignalReview = {
  status: AiReviewStatus;
  counterEvidence: string[];
  sections: AiReviewSections;
  reason?: string;
  provider?: string;
  model?: string;
  reviewedAt?: string;
  confidenceAdjustment?: number;
};

export type SignalJournalAction = "track" | "paper_trade" | "skip" | "invalidate";

export type JournalAction = SignalJournalAction | "calibration_review" | "strategy_confirmation";

export type ReviewStatus = "queued" | "tracking" | "closed";

export type ReviewCheckpoint = {
  id: "1h" | "4h" | "24h";
  label: string;
  reviewAt: string;
  status: "pending" | "due" | "complete";
};

export type SignalOutcomeStatus =
  | "pending"
  | "partial_win"
  | "saved"
  | "loss"
  | "expired";

export type MarketSignal = {
  id: string;
  symbol: string;
  exchange: string;
  direction: SignalDirection;
  state: SignalState;
  timeframe: Timeframe;
  regime: MarketRegime;
  confidence: number;
  risk: RiskGrade;
  updatedAt: string;
  summary: string;
  evidence: EvidencePoint[];
  strategy: StrategyPlan;
  aiReview?: AiSignalReview;
  timeframeProfile?: TimeframeProfile;
  timeframeAgreement?: string;
  timeframeConflicts?: Timeframe[];
};

export type JournalEvent = {
  id: string;
  signalId?: string;
  symbol: string;
  title: string;
  result: "win" | "loss" | "saved" | "watching";
  note: string;
  rankDelta: number;
  createdAt: string;
  action?: JournalAction;
  reviewStatus?: ReviewStatus;
  timeframe?: Timeframe;
  direction?: SignalDirection;
  strategyStatus?: StrategyPlan["status"];
  riskReward?: number;
  trigger?: string;
  invalidation?: string;
  thesis?: string;
  plannedReviewAt?: string;
  lessons?: string[];
  outcomeStatus?: SignalOutcomeStatus;
  triggerHit?: boolean;
  invalidationHit?: boolean;
  firstTargetHit?: boolean;
  reviewCheckpoints?: ReviewCheckpoint[];
  source?: "signal" | "daily_mover_calibration" | "strategy_version_confirmation";
  sourceId?: string;
  calibrationTag?: string;
  sampleSymbols?: string[];
  allowedUse?: "research_only";
  canAutoAdjustWeights?: false;
  strategyDraftId?: string;
  strategyEvidenceSummary?: string;
  strategyLabel?: string;
  strategyLimitation?: string;
  strategyTag?: string;
  strategyValidationVerdict?: string;
  strategyVersionLabel?: string;
};
