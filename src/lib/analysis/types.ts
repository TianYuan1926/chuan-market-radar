import type { TimeframeProfile } from "./timeframe-profile";
import type {
  ChineseStrategyReport,
} from "./v2/report/report-schema";
import type {
  StrategyV3Dossier,
  TrendRadarReview,
  TrendRadarReviewRunSummary,
} from "./v3/types";
import type {
  RiskGateResult,
} from "./v2/strategy/risk-gate";
import type {
  MarketStage,
  StrategyDecision,
  StrategyScores,
} from "./v2/strategy/market-state-machine";

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

export type SignalMaturityStage =
  | "LIGHT_SCAN_MARK"
  | "DEEP_SCAN_CANDIDATE"
  | "EVIDENCE_SIGNAL"
  | "TRADE_PLAN_READY";

export type SignalMaturityReason =
  | "eligible_legacy_trade_plan"
  | "eligible_v3_trade_plan"
  | "has_structured_evidence"
  | "insufficient_data"
  | "light_scan_only"
  | "risk_gate_or_rr_blocked"
  | "timeframe_gate_blocked"
  | "trade_plan_not_ready";

export type SignalMaturity = {
  canAttachTradePlan: boolean;
  canEnterMainSignalArea: boolean;
  canRequestAiReview: boolean;
  label: string;
  reasons: SignalMaturityReason[];
  stage: SignalMaturityStage;
};

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

export type TimeframeHardGateBlocker =
  | "regime_timeframe_double_conflict"
  | "structure_timeframe_conflict";

export type TimeframeHardGateAction =
  | "ALLOW"
  | "WAIT_HIGH_TIMEFRAME_BREAK"
  | "WATCH_ONLY";

export type TimeframeHardGate = {
  action: TimeframeHardGateAction;
  allowed: boolean;
  blockedBy: TimeframeHardGateBlocker[];
  conflictTimeframes: Timeframe[];
  guardrail: string;
  mode: "multi_timeframe_hard_gate_v1";
  summary: string;
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

export type StrategyV2Audit = {
  canMutateLiveRanking: false;
  counterEvidenceIds: string[];
  decision: StrategyDecision;
  ignoredExternalInputs: number;
  report: ChineseStrategyReport;
  riskGate: RiskGateResult;
  scores: StrategyScores;
  stage: MarketStage;
  supportEvidenceIds: string[];
};

export type AiReviewStatus = "disabled" | "fallback" | "reviewed";

export type AiReviewBoundary = {
  allowedUse: "counter_evidence_review_only";
  canAutoExecute: false;
  canCreateTradeSignal: false;
  canMutateLiveRanking: false;
  canOverrideDecision: false;
  cost: {
    maxPromptChars: number;
    maxSignalsPerSnapshot: number;
    model?: string;
    promptChars?: number;
    provider?: string;
    reason?: string;
    status: "disabled" | "fallback" | "missing_key" | "over_budget" | "within_budget";
  };
  replayCalibration: {
    allowedUse: "manual_replay_calibration_only";
    canAutoAdjustWeights: false;
    requiresOutcomeSample: true;
    tag: "ai_counter_evidence_review";
  };
  summary: string;
};

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
  boundary: AiReviewBoundary;
  counterEvidence: string[];
  sections: AiReviewSections;
  reason?: string;
  provider?: string;
  model?: string;
  reviewedAt?: string;
  confidenceAdjustment?: number;
  evidenceIds?: string[];
  referencedEvidenceIds?: string[];
  signalId?: string;
};

export type SignalJournalAction = "track" | "paper_trade" | "skip" | "invalidate";

export type ManualTradeJournalOperation = "upsert" | "close" | "reopen" | "remove";

export type ManualTradeJournalEntry = {
  id: string;
  symbol: string;
  side: "long" | "short";
  leverage: number;
  margin: number;
  entry: number;
  stop: number;
  target: number;
  status: "持仓中" | "已平仓";
  note: string;
  images: string[];
  createdAt: number;
  exitPrice?: number;
  result?: "win" | "loss";
  closeNote?: string;
  closedAt?: number;
};

export type ManualTradeJournalPayload = {
  operation: ManualTradeJournalOperation;
  entry: ManualTradeJournalEntry;
  savedAt: string;
  storagePolicy: {
    imagesPersisted: number;
    maxImageChars: number;
    maxImages: number;
  };
};

export type JournalAction =
  | SignalJournalAction
  | "manual_trade"
  | "calibration_review"
  | "outcome_executor_run"
  | "strategy_confirmation"
  | "strategy_weight_change_execution"
  | "trend_radar_review"
  | "trend_radar_review_run";

export type ReviewStatus = "queued" | "tracking" | "closed";

export type ReviewCheckpoint = {
  id: "1h" | "4h" | "24h" | "4d";
  label: string;
  reviewAt: string;
  status: "pending" | "due" | "complete";
};

export type OutcomeMetrics = {
  entryPrice?: number;
  evaluatedCandles: number;
  firstTargetPrice?: number;
  invalidationPrice?: number;
  maePercent?: number;
  maxAdversePrice?: number;
  maxFavorablePrice?: number;
  mfePercent?: number;
  validationWindowHours: number;
  validationWindowLabel: string;
};

export type SignalOutcomeStatus =
  | "pending"
  | "partial_win"
  | "saved"
  | "loss"
  | "expired";

export type OutcomeExecutorRunFailure = {
  eventId: string;
  signalId?: string;
  symbol: string;
  reason: string;
  error: string;
};

export type OutcomeExecutorSkipReasonCode =
  | "closed_duplicate"
  | "missing_signal_context"
  | "not_due"
  | "ohlcv_unavailable"
  | "outcome_pending";

export type OutcomeExecutorSkipReasonSummary = {
  code: OutcomeExecutorSkipReasonCode;
  count: number;
  label: string;
  symbols: string[];
};

export type OutcomeExecutorRunSummary = {
  dueEvents: number;
  failedFetches: number;
  failures: OutcomeExecutorRunFailure[];
  fetchedCandles: number;
  scannedEvents: number;
  skippedReasons: OutcomeExecutorSkipReasonSummary[];
  skippedEvents: number;
  writtenEvents: number;
};

export type StrategyWeightChangeApprovalStatus =
  | "approved"
  | "pending_approval"
  | "rejected"
  | "rollback_watch";

export type StrategyWeightChangeExecutionRecord = {
  approvalStatus: StrategyWeightChangeApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
  canExecuteWeightChange: false;
  direction: "decrease" | "increase" | "quarantine";
  rollbackTrigger: string;
  rollbackWindowDays: number;
  tag: string;
  versionLabel: string;
};

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
  maturity?: SignalMaturity;
  strategyV2?: StrategyV2Audit;
  strategyV3?: StrategyV3Dossier;
  timeframeProfile?: TimeframeProfile;
  timeframeAgreement?: string;
  timeframeConflicts?: Timeframe[];
  timeframeGate?: TimeframeHardGate;
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
  firstTarget?: string;
  thesis?: string;
  plannedReviewAt?: string;
  lessons?: string[];
  outcomeStatus?: SignalOutcomeStatus;
  triggerHit?: boolean;
  invalidationHit?: boolean;
  firstTargetHit?: boolean;
  outcomeMetrics?: OutcomeMetrics;
  reviewCheckpoints?: ReviewCheckpoint[];
  signalMaturityStage?: SignalMaturityStage;
  source?: "signal" | "daily_mover_calibration" | "outcome_executor" | "strategy_version_confirmation" | "strategy_weight_change_execution" | "trend_radar_review_executor" | "manual_trade_journal";
  sourceId?: string;
  manualTradeJournal?: ManualTradeJournalPayload;
  outcomeExecutorRun?: OutcomeExecutorRunSummary;
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
  strategyWeightChange?: StrategyWeightChangeExecutionRecord;
  trendRadarReview?: TrendRadarReview;
  trendRadarReviewRun?: TrendRadarReviewRunSummary;
};
