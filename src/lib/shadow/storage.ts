import { createHash } from "node:crypto";
import type { Candle } from "../market/ohlcv/types";

export type ShadowDecision = "OBSERVE" | "WAIT" | "BLOCKED" | "TRADE_PLAN_READY" | "UNKNOWN";

export type ShadowEnrichmentSource =
  | "scan_embedded_unified_decision"
  | "production_contract_enrichment"
  | "partial_contract_enrichment"
  | "scan_summary_fallback";

export type ShadowEnrichmentStatus = "complete" | "partial" | "missing";

export type ShadowEventType =
  | "DISCOVERED"
  | "DECISION_OBSERVED"
  | "STATUS_TRANSITION"
  | "CHECKPOINT_DUE"
  | "CHECKPOINT_RECORDED"
  | "EXPIRED"
  | "ERROR";

export type ShadowRunStatus =
  | "prepared"
  | "baseline_captured"
  | "ready_to_start"
  | "running"
  | "paused"
  | "completed"
  | "aborted";

export type ShadowProductionStatus = {
  commit: string;
  evidenceValidate: "pass" | "partial" | "fail" | "unknown";
  health: "pass" | "partial" | "fail" | "unknown";
  targetUrl: string;
};

export type ShadowRunManifest = {
  boundaries: {
    allowsParameterAutoTuning: false;
    autoTradingEnabled: false;
    mutatesProductionRanking: false;
    mutatesStrategyWeights: false;
    researchOnly: true;
  };
  canStartShadowV1: boolean;
  canEnterLiveTrading: false;
  createdAt: string;
  dedupe: {
    dedupeKeyFields: ["symbol", "decision", "source", "firstSeenWindow"];
    strategy: "symbol_decision_time_bucket";
    windowMinutes: number;
  };
  mode: "baseline_readiness" | "shadow_v1_live_observation";
  phase: "5.1" | "5.1-R";
  production: ShadowProductionStatus;
  runId: string;
  samplingPlan: {
    captureIntervalMinutes: number;
    checkpoints: ["1h", "4h", "24h"];
    durationDaysPlanned: number;
    maxRuntimeDays: number;
  };
  shadowTrackingStarted: boolean;
  startedAt?: string;
  plannedEndAt?: string;
  status: ShadowRunStatus;
  enrichment?: {
    enabled: boolean;
    coverageRequired: number;
    nonObserveCoverage: number;
    overallCoverage: number;
    sourcePriority: [
      "scan_embedded_unified_decision",
      "production_contract_enrichment",
      "partial_contract_enrichment",
      "scan_summary_fallback",
    ];
  };
  statusDefinitions: {
    allowedStates: ["OBSERVE", "WAIT", "BLOCKED", "TRADE_PLAN_READY"];
    unknownStatePolicy: "record_as_unknown_and_warn";
  };
  stillNotReadyForLiveTrading: true;
  storage: {
    checkpointPlanPath: string;
    eventsPath: string;
    observationsPath: string;
    outcomesPath: string;
    transitionsPath: string;
  };
  updatedAt: string;
};

export type ShadowWaitPlan = {
  confirmation: string;
  invalidation: string;
  trigger: string;
  whyNotNow: string;
};

export type ShadowObservationEvent = {
  blockers: string[];
  checkpointPlan: {
    checkpoint1hAt: string;
    checkpoint4hAt: string;
    checkpoint24hAt: string;
  };
  dataFreshness: string;
  decision: ShadowDecision;
  decisionSource: "unified_decision_engine" | "scan_summary" | "unknown";
  dedupeKey: string;
  eventId: string;
  eventType: ShadowEventType;
  evidence: unknown[];
  enrichmentSource: ShadowEnrichmentSource;
  enrichmentStatus: ShadowEnrichmentStatus;
  enrichmentWarnings: string[];
  firstSeenAt: string;
  isDuplicate: boolean;
  linkedPreviousEventId: string;
  priceAtObservation: number | null;
  readyPlan: unknown | null;
  reasons: string[];
  researchOnly: true;
  runId: string;
  scanMeta: {
    candidateCount: number;
    radarSignals: number;
    scannedCount: number;
    source: string;
  };
  source: "production_scan" | "production_contract" | "manual_import" | "unknown";
  symbol: string;
  observedAt: string;
  unifiedDecision: unknown;
  waitPlan: ShadowWaitPlan;
};

export type ShadowStatusTransition = {
  changedAt: string;
  eventId: string;
  fromDecision: ShadowDecision;
  previousEventId: string;
  reason: string;
  runId: string;
  symbol: string;
  toDecision: ShadowDecision;
};

export type ShadowCheckpointType = "1h" | "4h" | "24h";
export type ShadowCheckpointStatus = "pending" | "recorded" | "missed" | "pending_with_error";

export type ShadowCheckpointErrorReason =
  | "MISSING_PRICE_AT_OBSERVATION"
  | "CHECKPOINT_EVENT_MISSING"
  | "DATA_SOURCE_UNAVAILABLE"
  | "NO_CANDLES_IN_WINDOW"
  | "BACKFILL_WINDOW_EXCEEDED"
  | "INVALID_CHECKPOINT_WINDOW";

export type ShadowCheckpoint = {
  checkpointType: ShadowCheckpointType;
  dataFreshness?: string;
  dataSource?: string;
  dataWindowEnd?: string | null;
  dataWindowStart?: string | null;
  dueAt: string;
  errorReason?: ShadowCheckpointErrorReason;
  exchange?: string;
  eventId: string;
  fetchedAt?: string;
  klineCount?: number;
  manualReviewRequired?: boolean;
  marketType?: string;
  maxAdverseMove: number | null;
  maxDownPctSinceObservation?: number | null;
  maxFavorableMove: number | null;
  maxUpPctSinceObservation?: number | null;
  notes: string;
  observedAt: string;
  priceAtCheckpoint: number | null;
  priceAtObservation: number | null;
  priceAtCheckpointSource?: string;
  priceAtObservationSource?: string;
  priceSource?: string;
  rawMovePct?: number | null;
  recordedAt?: string;
  recordDelayMinutes?: number | null;
  restoredPriceSource?: string;
  shouldRetry?: boolean;
  status: ShadowCheckpointStatus;
  symbol: string;
  usedKlineInterval?: string;
};

export type ShadowCheckpointPlan = {
  checkpoints: ShadowCheckpoint[];
  createdAt: string;
  runId: string;
};

export type ShadowCheckpointOutcomeStatus = Exclude<ShadowCheckpointStatus, "pending">;

export type ShadowCheckpointOutcome = {
  backfilled: boolean;
  canAutoAdjustWeights: false;
  checkpointType: ShadowCheckpointType;
  dataFreshness: string;
  dataSource: string;
  dataWindowEnd: string | null;
  dataWindowStart: string | null;
  dueAt: string;
  errorReason?: ShadowCheckpointErrorReason;
  eventId: string;
  exchange: string;
  fetchedAt: string;
  klineCount: number;
  manualReviewRequired: boolean;
  marketType: string;
  maxAdverseMove: number | null;
  maxDownPctSinceObservation: number | null;
  maxFavorableMove: number | null;
  maxUpPctSinceObservation: number | null;
  mutatesProductionRanking: false;
  notes: string;
  observedAt: string;
  outcomeId: string;
  priceAtCheckpoint: number | null;
  priceAtCheckpointSource: string;
  priceAtObservation: number | null;
  priceAtObservationSource: string;
  priceSource: string;
  rawMovePct: number | null;
  recordedAt: string;
  recordDelayMinutes: number | null;
  researchOnly: true;
  restoredPriceSource?: string;
  runId: string;
  schemaVersion: "shadow-checkpoint-outcome.v1";
  shouldRetry: boolean;
  status: ShadowCheckpointOutcomeStatus;
  symbol: string;
  usedKlineInterval: string;
};

export type ShadowCheckpointPriceWindowSuccess = {
  ok: true;
  candles: Candle[];
  dataFreshness: string;
  exchange: string;
  fetchedAt: string;
  marketType: string;
  priceSource: string;
  source: string;
  usedKlineInterval: string;
};

export type ShadowCheckpointPriceWindowFailure = {
  ok: false;
  dataFreshness: string;
  error: string;
  errorReason: ShadowCheckpointErrorReason;
  exchange: string;
  fetchedAt: string;
  marketType: string;
  priceSource: string;
  shouldRetry: boolean;
  source: string;
  usedKlineInterval: string;
};

export type ShadowCheckpointPriceWindowResult = ShadowCheckpointPriceWindowSuccess | ShadowCheckpointPriceWindowFailure;

export type FillDueCheckpointOutcomesResult = {
  checkpointPlan: ShadowCheckpointPlan;
  dueCount: number;
  dryRun: boolean;
  generatedAt: string;
  outcomes: ShadowCheckpointOutcome[];
  outcomesWritten: ShadowCheckpointOutcome[];
  skippedExisting: number;
  status: ReturnType<typeof checkpointStatusDistribution>;
};

export type ShadowEventsManifest = {
  duplicateCount: number;
  eventsPath: string;
  generatedAt: string;
  primaryEventCount: number;
  runId: string;
  schemaVersion: "shadow-events-manifest.v1";
  transitionCount: number;
  uniqueSymbols: number;
};

export type ShadowLatest = {
  canStartShadowV1: boolean;
  errors: string[];
  generatedAt: string;
  mode: "baseline_readiness" | "shadow_v1_live_observation";
  productionCommit: string;
  productionEvidenceValidate: string;
  productionHealth: string;
  runId: string;
  scan: {
    candidateCount: number;
    freshness: string;
    radarSignals: number;
    scannedCount: number;
    source: string;
  };
  shadowTrackingStarted: boolean;
  stats: {
    blockedCount: number;
    checkpointsDue?: number;
    checkpointsDuePending?: number;
    checkpointsMissed?: number;
    checkpointsPending?: number;
    checkpointsPlanned: number;
    checkpointsPendingWithError?: number;
    checkpointsRecorded?: number;
    duplicatesSkipped: number;
    eventsTotal: number;
    observeCount: number;
    readyCount: number;
    transitionsRecorded: number;
    uniqueSymbols: number;
    waitCount: number;
  };
  stillNotReadyForLiveTrading: true;
  warnings: string[];
};

export type ShadowStorageValidationResult = {
  errors: string[];
  ok: boolean;
  warnings: string[];
};

export type ShadowCaptureResult = {
  checkpointPlan: ShadowCheckpointPlan;
  duplicateEvents: number;
  events: ShadowObservationEvent[];
  latest: ShadowLatest;
  manifest: ShadowRunManifest;
  transitions: ShadowStatusTransition[];
  warnings: string[];
};

export type ShadowScanSignalInput = {
  blockers?: string[];
  confidence?: number;
  currentPrice?: number;
  decision?: unknown;
  evidence?: unknown[];
  id?: string;
  maturity?: { stage?: string } | string;
  price?: number;
  riskReward?: number;
  state?: string;
  strategy?: {
    entry?: string;
    invalidation?: string;
    status?: string;
    targets?: string[];
    takeProfitPlan?: string;
  };
  strategyStatus?: string;
  summary?: string;
  symbol?: string;
  shadowEnrichment?: {
    source: ShadowEnrichmentSource;
    sourceContract: string;
    status: ShadowEnrichmentStatus;
    warnings: string[];
  };
  unifiedDecision?: unknown;
  updatedAt?: string;
  waitPlan?: ShadowWaitPlan | null;
};

export type ShadowScanInput = {
  instrumentPool?: { total?: number; candidateCount?: number; scannedCount?: number; summary?: unknown };
  metadata?: { generatedAt?: string; status?: string; source?: string; activeSource?: string };
  ok?: boolean;
  signals?: ShadowScanSignalInput[];
  status?: string;
  [key: string]: unknown;
};

export type BuildShadowRunManifestOptions = {
  nowIso: string;
  mode?: ShadowRunManifest["mode"];
  production: ShadowProductionStatus;
  reportsRoot?: string;
  runId: string;
  phase?: ShadowRunManifest["phase"];
  shadowTrackingStarted?: boolean;
  status?: ShadowRunStatus;
};

export const SHADOW_ALLOWED_STATES = ["OBSERVE", "WAIT", "BLOCKED", "TRADE_PLAN_READY"] as const;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 8) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function plusHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function timeBucket(iso: string, windowMinutes: number) {
  const intervalMs = windowMinutes * 60 * 1000;
  const bucketMs = Math.floor(new Date(iso).getTime() / intervalMs) * intervalMs;
  return new Date(bucketMs).toISOString();
}

function decisionFromInput(signal: ShadowScanSignalInput): {
  decision: ShadowDecision;
  decisionSource: ShadowObservationEvent["decisionSource"];
  warnings: string[];
} {
  const warnings: string[] = [];
  const unifiedDecision = asRecord(signal.unifiedDecision);
  const unifiedState = asString(unifiedDecision?.decision) || asString(unifiedDecision?.state);
  const maturity = typeof signal.maturity === "string" ? signal.maturity : signal.maturity?.stage;
  const strategyStatus = signal.strategy?.status ?? signal.strategyStatus ?? "";

  if (unifiedState === "TRADE" || maturity === "TRADE_PLAN_READY") {
    const hasReadyPlan = Boolean(asRecord(unifiedDecision?.readyPlan)) ||
      Boolean(signal.strategy?.entry && signal.strategy?.invalidation && (signal.strategy?.targets?.length ?? 0) > 0);
    if (hasReadyPlan) {
      return { decision: "TRADE_PLAN_READY", decisionSource: "unified_decision_engine", warnings };
    }
    warnings.push("production_ready_like_signal_missing_ready_plan_recorded_as_wait");
    return { decision: "WAIT", decisionSource: "unified_decision_engine", warnings };
  }

  if (unifiedState === "BLOCKED" || strategyStatus === "blocked" || signal.state === "invalidated") {
    return { decision: "BLOCKED", decisionSource: unifiedDecision ? "unified_decision_engine" : "scan_summary", warnings };
  }
  if (unifiedState === "WAIT" || strategyStatus === "waiting" || signal.state === "waiting_confirmation" || signal.state === "near_trigger") {
    return { decision: "WAIT", decisionSource: unifiedDecision ? "unified_decision_engine" : "scan_summary", warnings };
  }
  if (maturity === "DEEP_SCAN_CANDIDATE" || maturity === "EVIDENCE_SIGNAL" || maturity === "REVIEW_ONLY") {
    return { decision: "OBSERVE", decisionSource: "scan_summary", warnings };
  }

  warnings.push("production_signal_missing_unified_decision_recorded_as_observe");
  return { decision: "OBSERVE", decisionSource: "scan_summary", warnings };
}

function waitPlanFromSignal(signal: ShadowScanSignalInput, decision: ShadowDecision): ShadowWaitPlan {
  const unifiedDecision = asRecord(signal.unifiedDecision);
  const unifiedWaitPlan = asRecord(unifiedDecision?.waitPlan);
  const signalWaitPlan = asRecord(signal.waitPlan);
  const contractWaitPlan = unifiedWaitPlan ?? signalWaitPlan;

  if (decision !== "WAIT" && decision !== "TRADE_PLAN_READY") {
    return {
      confirmation: "",
      invalidation: "",
      trigger: "",
      whyNotNow: decision === "BLOCKED" ? "风控门禁或结构条件阻断。" : "当前只做观察，不生成交易计划。",
    };
  }
  return {
    confirmation: asString(contractWaitPlan?.confirmation),
    invalidation: asString(contractWaitPlan?.invalidation) || signal.strategy?.invalidation || "",
    trigger: asString(contractWaitPlan?.trigger) || signal.strategy?.entry || "",
    whyNotNow: decision === "TRADE_PLAN_READY"
      ? ""
      : asString(contractWaitPlan?.whyNotNow) || "生产扫描未返回完整交易计划，只记录等待观察。",
  };
}

function blockersFromSignal(signal: ShadowScanSignalInput, decision: ShadowDecision, waitPlan: ShadowWaitPlan): string[] {
  const blockers: string[] = [];
  const unifiedDecision = asRecord(signal.unifiedDecision);
  const blockerReasons = Array.isArray(unifiedDecision?.blockerReasons) ? unifiedDecision.blockerReasons : [];
  const blockersFromDecision = Array.isArray(unifiedDecision?.blockers)
    ? unifiedDecision.blockers.map((item) => {
      const record = asRecord(item);
      const reason = asString(record?.reason);
      const unblock = asString(record?.unblockCondition);
      return unblock ? `${reason}：${unblock}` : reason;
    })
    : [];
  blockers.push(
    ...(signal.blockers ?? []),
    ...blockerReasons.filter((item): item is string => typeof item === "string"),
    ...blockersFromDecision.filter(Boolean),
  );
  if (decision === "BLOCKED") blockers.push("production_decision_blocked");
  if (decision === "WAIT" && !waitPlan.trigger) blockers.push("wait_trigger_missing_from_scan_contract");
  if (decision === "WAIT" && !waitPlan.invalidation) blockers.push("wait_invalidation_missing_from_scan_contract");
  return [...new Set(blockers)];
}

function reasonsFromSignal(signal: ShadowScanSignalInput, warnings: string[]): string[] {
  const unifiedDecision = asRecord(signal.unifiedDecision);
  const decisionReasons = Array.isArray(unifiedDecision?.reasons) ? unifiedDecision.reasons : [];
  const reasons = [
    ...decisionReasons.filter((item): item is string => typeof item === "string"),
    signal.summary,
    signal.state ? `scan_state:${signal.state}` : "",
    signal.strategyStatus ? `strategy_status:${signal.strategyStatus}` : "",
    typeof signal.confidence === "number" ? `confidence:${signal.confidence}` : "",
    typeof signal.riskReward === "number" ? `rr:${signal.riskReward}` : "",
    ...warnings,
  ].filter(Boolean);
  return reasons.length > 0 ? reasons as string[] : ["production_scan_candidate_observed"];
}

export function buildShadowRunManifest({
  mode = "baseline_readiness",
  nowIso,
  phase = "5.1",
  production,
  reportsRoot = "reports/shadow-tracking",
  runId,
  shadowTrackingStarted = false,
  status = "prepared",
}: BuildShadowRunManifestOptions): ShadowRunManifest {
  const startedAt = shadowTrackingStarted ? nowIso : undefined;
  const plannedEndAt = shadowTrackingStarted
    ? new Date(new Date(nowIso).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  return {
    boundaries: {
      allowsParameterAutoTuning: false,
      autoTradingEnabled: false,
      mutatesProductionRanking: false,
      mutatesStrategyWeights: false,
      researchOnly: true,
    },
    canStartShadowV1: status === "ready_to_start" || status === "running",
    canEnterLiveTrading: false,
    createdAt: nowIso,
    dedupe: {
      dedupeKeyFields: ["symbol", "decision", "source", "firstSeenWindow"],
      strategy: "symbol_decision_time_bucket",
      windowMinutes: 60,
    },
    enrichment: {
      enabled: true,
      coverageRequired: 0.8,
      nonObserveCoverage: 0,
      overallCoverage: 0,
      sourcePriority: [
        "scan_embedded_unified_decision",
        "production_contract_enrichment",
        "partial_contract_enrichment",
        "scan_summary_fallback",
      ],
    },
    mode,
    phase,
    ...(plannedEndAt ? { plannedEndAt } : {}),
    production,
    runId,
    samplingPlan: {
      captureIntervalMinutes: 5,
      checkpoints: ["1h", "4h", "24h"],
      durationDaysPlanned: 7,
      maxRuntimeDays: 14,
    },
    shadowTrackingStarted,
    ...(startedAt ? { startedAt } : {}),
    status,
    statusDefinitions: {
      allowedStates: ["OBSERVE", "WAIT", "BLOCKED", "TRADE_PLAN_READY"],
      unknownStatePolicy: "record_as_unknown_and_warn",
    },
    stillNotReadyForLiveTrading: true,
    storage: {
      checkpointPlanPath: `${reportsRoot}/runs/${runId}/checkpoint-plan.json`,
      eventsPath: `${reportsRoot}/events/${runId}/events.jsonl`,
      observationsPath: `${reportsRoot}/runs/${runId}/observations.jsonl`,
      outcomesPath: `${reportsRoot}/outcomes/${runId}/outcomes.jsonl`,
      transitionsPath: `${reportsRoot}/runs/${runId}/transitions.jsonl`,
    },
    updatedAt: nowIso,
  };
}

export function extractScanSignals(scan: ShadowScanInput): ShadowScanSignalInput[] {
  if (Array.isArray(scan.signals)) return scan.signals;
  const candidates = scan.candidates;
  if (Array.isArray(candidates)) return candidates as ShadowScanSignalInput[];
  const radarSignals = scan.radarSignals;
  if (Array.isArray(radarSignals)) return radarSignals as ShadowScanSignalInput[];
  const data = asRecord(scan.data);
  if (Array.isArray(data?.signals)) return data.signals as ShadowScanSignalInput[];
  if (Array.isArray(data?.candidates)) return data.candidates as ShadowScanSignalInput[];
  return [];
}

export function scanMeta(scan: ShadowScanInput) {
  const signals = extractScanSignals(scan);
  const metadata = asRecord(scan.metadata);
  const instrumentPool = asRecord(scan.instrumentPool);
  const poolSummary = asRecord(instrumentPool?.summary);
  return {
    candidateCount: asNumber(instrumentPool?.candidateCount) ?? asNumber(poolSummary?.candidateCount) ?? signals.length,
    freshness: asString(metadata?.status) || asString(scan.status) || "unknown",
    generatedAt: asString(metadata?.generatedAt) || "",
    radarSignals: signals.length,
    scannedCount: asNumber(instrumentPool?.scannedCount) ?? asNumber(poolSummary?.scannedCount) ?? asNumber(instrumentPool?.total) ?? 0,
    source: asString(metadata?.activeSource) || asString(metadata?.source) || "production_scan",
  };
}

export function buildShadowObservationEvent({
  existingFirstSeenAt,
  nowIso,
  runId,
  scan,
  signal,
  windowMinutes = 60,
}: {
  existingFirstSeenAt?: string;
  nowIso: string;
  runId: string;
  scan: ShadowScanInput;
  signal: ShadowScanSignalInput;
  windowMinutes?: number;
}): { event: ShadowObservationEvent; warnings: string[] } {
  const symbol = (signal.symbol ?? "").trim().toUpperCase() || "UNKNOWN";
  const observedAt = signal.updatedAt || nowIso;
  const firstSeenAt = existingFirstSeenAt || observedAt;
  const decisionResult = decisionFromInput(signal);
  const waitPlan = waitPlanFromSignal(signal, decisionResult.decision);
  const blockers = blockersFromSignal(signal, decisionResult.decision, waitPlan);
  const enrichment = signal.shadowEnrichment ?? {
    source: signal.unifiedDecision ? "scan_embedded_unified_decision" : "scan_summary_fallback",
    sourceContract: signal.unifiedDecision ? "api_scan" : "api_scan_summary",
    status: signal.unifiedDecision ? "complete" : "missing",
    warnings: signal.unifiedDecision ? [] : ["production_signal_missing_unified_decision_recorded_as_observe"],
  } satisfies NonNullable<ShadowScanSignalInput["shadowEnrichment"]>;
  const bucket = timeBucket(firstSeenAt, windowMinutes);
  const source: ShadowObservationEvent["source"] = "production_scan";
  const dedupeKey = `${symbol}:${decisionResult.decision}:${source}:${bucket}`;
  const eventId = `shadow_evt_${hash(`${runId}:${dedupeKey}`)}`;
  const meta = scanMeta(scan);

  return {
    event: {
      blockers,
      checkpointPlan: {
        checkpoint1hAt: plusHours(observedAt, 1),
        checkpoint4hAt: plusHours(observedAt, 4),
        checkpoint24hAt: plusHours(observedAt, 24),
      },
      dataFreshness: meta.freshness,
      decision: decisionResult.decision,
      decisionSource: decisionResult.decisionSource,
      dedupeKey,
      eventId,
      eventType: "DECISION_OBSERVED",
      evidence: Array.isArray(signal.evidence) ? signal.evidence : [],
      enrichmentSource: enrichment.source,
      enrichmentStatus: enrichment.status,
      enrichmentWarnings: enrichment.warnings,
      firstSeenAt,
      isDuplicate: false,
      linkedPreviousEventId: "",
      observedAt,
      priceAtObservation: asNumber(signal.price) ?? asNumber(signal.currentPrice),
      readyPlan: decisionResult.decision === "TRADE_PLAN_READY" ? signal.strategy ?? null : null,
      reasons: reasonsFromSignal(signal, decisionResult.warnings),
      researchOnly: true,
      runId,
      scanMeta: {
        candidateCount: meta.candidateCount,
        radarSignals: meta.radarSignals,
        scannedCount: meta.scannedCount,
        source: meta.source,
      },
      source,
      symbol,
      unifiedDecision: signal.unifiedDecision ?? null,
      waitPlan,
    },
    warnings: decisionResult.warnings,
  };
}

export function buildCheckpointPlan(runId: string, createdAt: string, events: ShadowObservationEvent[]): ShadowCheckpointPlan {
  return {
    createdAt,
    runId,
    checkpoints: events.flatMap((event) => [
      checkpointFromEvent(event, "1h", event.checkpointPlan.checkpoint1hAt),
      checkpointFromEvent(event, "4h", event.checkpointPlan.checkpoint4hAt),
      checkpointFromEvent(event, "24h", event.checkpointPlan.checkpoint24hAt),
    ]),
  };
}

function checkpointFromEvent(event: ShadowObservationEvent, checkpointType: ShadowCheckpointType, dueAt: string): ShadowCheckpoint {
  return {
    checkpointType,
    dueAt,
    eventId: event.eventId,
    maxAdverseMove: null,
    maxFavorableMove: null,
    notes: "checkpoint 尚未到期或尚未完成 outcome 回填。",
    observedAt: event.observedAt,
    priceAtCheckpoint: null,
    priceAtObservation: event.priceAtObservation,
    priceAtObservationSource: event.priceAtObservation === null ? "missing" : "production_scan_signal_price",
    shouldRetry: true,
    status: "pending",
    symbol: event.symbol,
  };
}

function checkpointKey(checkpoint: Pick<ShadowCheckpoint, "eventId" | "checkpointType">) {
  return `${checkpoint.eventId}:${checkpoint.checkpointType}`;
}

export function shadowCheckpointOutcomeKey(outcome: Pick<ShadowCheckpointOutcome, "eventId" | "checkpointType">) {
  return `${outcome.eventId}:${outcome.checkpointType}`;
}

export function mergeCheckpointPlans(existing: ShadowCheckpointPlan | null | undefined, next: ShadowCheckpointPlan): ShadowCheckpointPlan {
  if (!existing || existing.runId !== next.runId) return next;
  const existingByKey = new Map(existing.checkpoints.map((checkpoint) => [checkpointKey(checkpoint), checkpoint]));

  return {
    ...next,
    checkpoints: next.checkpoints.map((checkpoint) => {
      const previous = existingByKey.get(checkpointKey(checkpoint));

      return previous
        ? {
          ...checkpoint,
          ...previous,
          dueAt: checkpoint.dueAt,
          observedAt: checkpoint.observedAt,
          priceAtObservation: previous.priceAtObservation ?? checkpoint.priceAtObservation,
          symbol: checkpoint.symbol,
        }
        : checkpoint;
    }),
  };
}

export function checkpointStatusDistribution(checkpointPlan: ShadowCheckpointPlan, nowIso: string) {
  const nowTime = Date.parse(nowIso);
  const due = checkpointPlan.checkpoints.filter((checkpoint) => Date.parse(checkpoint.dueAt) <= nowTime);
  const count = (status: ShadowCheckpointStatus) => checkpointPlan.checkpoints.filter((checkpoint) => checkpoint.status === status).length;

  return {
    due: due.length,
    duePending: due.filter((checkpoint) => checkpoint.status === "pending").length,
    missed: count("missed"),
    pending: count("pending"),
    pendingWithError: count("pending_with_error"),
    recorded: count("recorded"),
    total: checkpointPlan.checkpoints.length,
  };
}

function outcomeId(runId: string, checkpoint: Pick<ShadowCheckpoint, "eventId" | "checkpointType">) {
  return `shadow_outcome_${hash(`${runId}:${checkpoint.eventId}:${checkpoint.checkpointType}`)}`;
}

function recordDelayMinutes(recordedAt: string, dueAt: string) {
  const recorded = Date.parse(recordedAt);
  const due = Date.parse(dueAt);

  if (!Number.isFinite(recorded) || !Number.isFinite(due)) return null;
  return round((recorded - due) / 60_000, 2);
}

function outcomeBase({
  checkpoint,
  event,
  generatedAt,
  runId,
}: {
  checkpoint: ShadowCheckpoint;
  event: ShadowObservationEvent | null;
  generatedAt: string;
  runId: string;
}): Omit<ShadowCheckpointOutcome, "backfilled" | "dataFreshness" | "dataSource" | "dataWindowEnd" | "dataWindowStart" | "errorReason" | "exchange" | "fetchedAt" | "klineCount" | "manualReviewRequired" | "marketType" | "maxAdverseMove" | "maxDownPctSinceObservation" | "maxFavorableMove" | "maxUpPctSinceObservation" | "notes" | "priceAtCheckpoint" | "priceAtCheckpointSource" | "priceAtObservation" | "priceAtObservationSource" | "priceSource" | "rawMovePct" | "restoredPriceSource" | "shouldRetry" | "status" | "usedKlineInterval"> {
  return {
    canAutoAdjustWeights: false,
    checkpointType: checkpoint.checkpointType,
    dueAt: checkpoint.dueAt,
    eventId: checkpoint.eventId,
    mutatesProductionRanking: false,
    observedAt: event?.observedAt ?? checkpoint.observedAt,
    outcomeId: outcomeId(runId, checkpoint),
    recordedAt: generatedAt,
    recordDelayMinutes: recordDelayMinutes(generatedAt, checkpoint.dueAt),
    researchOnly: true,
    runId,
    schemaVersion: "shadow-checkpoint-outcome.v1",
    symbol: checkpoint.symbol,
  };
}

function errorOutcome({
  checkpoint,
  dataFreshness = "unavailable",
  errorReason,
  event,
  generatedAt,
  manualReviewRequired,
  notes,
  runId,
  shouldRetry,
  status = "pending_with_error",
}: {
  checkpoint: ShadowCheckpoint;
  dataFreshness?: string;
  errorReason: ShadowCheckpointErrorReason;
  event: ShadowObservationEvent | null;
  generatedAt: string;
  manualReviewRequired: boolean;
  notes: string;
  runId: string;
  shouldRetry: boolean;
  status?: "missed" | "pending_with_error";
}): ShadowCheckpointOutcome {
  return {
    ...outcomeBase({ checkpoint, event, generatedAt, runId }),
    backfilled: false,
    dataFreshness,
    dataSource: "none",
    dataWindowEnd: null,
    dataWindowStart: null,
    errorReason,
    exchange: "none",
    fetchedAt: generatedAt,
    klineCount: 0,
    manualReviewRequired,
    marketType: "none",
    maxAdverseMove: null,
    maxDownPctSinceObservation: null,
    maxFavorableMove: null,
    maxUpPctSinceObservation: null,
    notes,
    priceAtCheckpoint: null,
    priceAtCheckpointSource: "unavailable",
    priceAtObservation: checkpoint.priceAtObservation,
    priceAtObservationSource: checkpoint.priceAtObservation === null ? "missing" : checkpoint.priceAtObservationSource ?? "checkpoint_plan",
    priceSource: "none",
    rawMovePct: null,
    shouldRetry,
    status,
    usedKlineInterval: "none",
  };
}

function candleCloseTime(candle: Candle) {
  return candle.closeTime || candle.openTime;
}

function candlesInWindow(candles: Candle[], observedAt: string, dueAt: string) {
  const start = Date.parse(observedAt);
  const end = Date.parse(dueAt);

  return [...candles]
    .filter((candle) => {
      const open = Date.parse(candle.openTime);
      const close = Date.parse(candleCloseTime(candle));
      return Number.isFinite(open) && Number.isFinite(close) && open >= start && close <= end;
    })
    .sort((left, right) => Date.parse(candleCloseTime(left)) - Date.parse(candleCloseTime(right)));
}

function recordedOutcome({
  checkpoint,
  event,
  generatedAt,
  priceWindow,
  runId,
}: {
  checkpoint: ShadowCheckpoint;
  event: ShadowObservationEvent;
  generatedAt: string;
  priceWindow: ShadowCheckpointPriceWindowSuccess;
  runId: string;
}): ShadowCheckpointOutcome | null {
  const observed = checkpoint.priceAtObservation ?? event.priceAtObservation;
  if (observed === null || observed <= 0) return null;
  const windowCandles = candlesInWindow(priceWindow.candles, event.observedAt, checkpoint.dueAt);
  if (windowCandles.length === 0) return null;
  const last = windowCandles.at(-1)!;
  const high = Math.max(...windowCandles.map((candle) => candle.high));
  const low = Math.min(...windowCandles.map((candle) => candle.low));
  const priceAtCheckpoint = last.close;
  const maxUpPct = ((high - observed) / observed) * 100;
  const maxDownPct = ((low - observed) / observed) * 100;

  return {
    ...outcomeBase({ checkpoint: { ...checkpoint, priceAtObservation: observed }, event, generatedAt, runId }),
    backfilled: true,
    dataFreshness: priceWindow.dataFreshness,
    dataSource: "historical_kline_backfill",
    dataWindowEnd: candleCloseTime(last),
    dataWindowStart: candleCloseTime(windowCandles[0]!),
    exchange: priceWindow.exchange,
    fetchedAt: priceWindow.fetchedAt,
    klineCount: windowCandles.length,
    manualReviewRequired: false,
    marketType: priceWindow.marketType,
    maxAdverseMove: null,
    maxDownPctSinceObservation: round(maxDownPct, 4),
    maxFavorableMove: null,
    maxUpPctSinceObservation: round(maxUpPct, 4),
    notes: "已使用公开合约历史 K 线按 observedAt 到 dueAt 窗口回填 checkpoint outcome；不使用 dueAt 之后数据。",
    priceAtCheckpoint: round(priceAtCheckpoint, 10),
    priceAtCheckpointSource: priceWindow.priceSource,
    priceAtObservation: round(observed, 10),
    priceAtObservationSource: checkpoint.priceAtObservation === null ? "restored_from_observation_event" : checkpoint.priceAtObservationSource ?? "checkpoint_plan",
    priceSource: priceWindow.priceSource,
    rawMovePct: round(((priceAtCheckpoint - observed) / observed) * 100, 4),
    ...(checkpoint.priceAtObservation === null ? { restoredPriceSource: "shadow_observation_event" } : {}),
    shouldRetry: false,
    status: "recorded",
    usedKlineInterval: priceWindow.usedKlineInterval,
  };
}

function checkpointFromOutcome(checkpoint: ShadowCheckpoint, outcome: ShadowCheckpointOutcome): ShadowCheckpoint {
  return {
    ...checkpoint,
    dataFreshness: outcome.dataFreshness,
    dataSource: outcome.dataSource,
    dataWindowEnd: outcome.dataWindowEnd,
    dataWindowStart: outcome.dataWindowStart,
    errorReason: outcome.errorReason,
    exchange: outcome.exchange,
    fetchedAt: outcome.fetchedAt,
    klineCount: outcome.klineCount,
    manualReviewRequired: outcome.manualReviewRequired,
    marketType: outcome.marketType,
    maxAdverseMove: outcome.maxAdverseMove,
    maxDownPctSinceObservation: outcome.maxDownPctSinceObservation,
    maxFavorableMove: outcome.maxFavorableMove,
    maxUpPctSinceObservation: outcome.maxUpPctSinceObservation,
    notes: outcome.notes,
    priceAtCheckpoint: outcome.priceAtCheckpoint,
    priceAtCheckpointSource: outcome.priceAtCheckpointSource,
    priceAtObservation: outcome.priceAtObservation,
    priceAtObservationSource: outcome.priceAtObservationSource,
    priceSource: outcome.priceSource,
    rawMovePct: outcome.rawMovePct,
    recordedAt: outcome.recordedAt,
    recordDelayMinutes: outcome.recordDelayMinutes,
    restoredPriceSource: outcome.restoredPriceSource,
    shouldRetry: outcome.shouldRetry,
    status: outcome.status,
    usedKlineInterval: outcome.usedKlineInterval,
  };
}

export async function fillDueCheckpointOutcomes({
  checkpointPlan,
  dryRun = false,
  events,
  existingOutcomes = [],
  fetchPriceWindow,
  maxBackfillWindowHours = 24 * 30,
  nowIso,
}: {
  checkpointPlan: ShadowCheckpointPlan;
  dryRun?: boolean;
  events: ShadowObservationEvent[];
  existingOutcomes?: ShadowCheckpointOutcome[];
  fetchPriceWindow: (checkpoint: ShadowCheckpoint, event: ShadowObservationEvent) => Promise<ShadowCheckpointPriceWindowResult>;
  maxBackfillWindowHours?: number;
  nowIso: string;
}): Promise<FillDueCheckpointOutcomesResult> {
  const nowTime = Date.parse(nowIso);
  const maxBackfillMs = maxBackfillWindowHours * 60 * 60 * 1000;
  const eventsById = new Map(events.map((event) => [event.eventId, event]));
  const outcomesByKey = new Map(existingOutcomes.map((outcome) => [shadowCheckpointOutcomeKey(outcome), outcome]));
  const changedOutcomes = new Map<string, ShadowCheckpointOutcome>();
  const updatedCheckpoints: ShadowCheckpoint[] = [];
  let dueCount = 0;
  let skippedExisting = 0;

  for (const checkpoint of checkpointPlan.checkpoints) {
    const key = checkpointKey(checkpoint);
    const dueTime = Date.parse(checkpoint.dueAt);
    const isDue = Number.isFinite(dueTime) && dueTime <= nowTime;
    const existing = outcomesByKey.get(key);

    if (existing && (existing.status === "recorded" || existing.status === "missed" || existing.shouldRetry === false)) {
      skippedExisting += 1;
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, existing));
      continue;
    }

    if (checkpoint.status === "recorded" || checkpoint.status === "missed") {
      updatedCheckpoints.push(checkpoint);
      continue;
    }

    if (!isDue) {
      updatedCheckpoints.push({ ...checkpoint, status: "pending" });
      continue;
    }

    dueCount += 1;
    const event = eventsById.get(checkpoint.eventId) ?? null;

    if (!event) {
      const outcome = errorOutcome({
        checkpoint,
        errorReason: "CHECKPOINT_EVENT_MISSING",
        event,
        generatedAt: nowIso,
        manualReviewRequired: true,
        notes: "checkpoint 对应 observation event 缺失，无法回填。",
        runId: checkpointPlan.runId,
        shouldRetry: false,
      });
      changedOutcomes.set(key, outcome);
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
      continue;
    }

    const observed = checkpoint.priceAtObservation ?? event.priceAtObservation;
    if (observed === null || observed <= 0) {
      const outcome = errorOutcome({
        checkpoint,
        errorReason: "MISSING_PRICE_AT_OBSERVATION",
        event,
        generatedAt: nowIso,
        manualReviewRequired: true,
        notes: "缺少 priceAtObservation，禁止伪造检测价，不能计算 rawMove/MFE/MAE。",
        runId: checkpointPlan.runId,
        shouldRetry: false,
      });
      changedOutcomes.set(key, outcome);
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
      continue;
    }

    if (nowTime - dueTime > maxBackfillMs) {
      const outcome = errorOutcome({
        checkpoint: { ...checkpoint, priceAtObservation: observed },
        dataFreshness: "expired",
        errorReason: "BACKFILL_WINDOW_EXCEEDED",
        event,
        generatedAt: nowIso,
        manualReviewRequired: true,
        notes: "checkpoint 超过最大可回填窗口，标记 missed，不再无限重试。",
        runId: checkpointPlan.runId,
        shouldRetry: false,
        status: "missed",
      });
      changedOutcomes.set(key, outcome);
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
      continue;
    }

    if (Date.parse(event.observedAt) > dueTime) {
      const outcome = errorOutcome({
        checkpoint: { ...checkpoint, priceAtObservation: observed },
        errorReason: "INVALID_CHECKPOINT_WINDOW",
        event,
        generatedAt: nowIso,
        manualReviewRequired: true,
        notes: "observedAt 晚于 dueAt，checkpoint 窗口无效。",
        runId: checkpointPlan.runId,
        shouldRetry: false,
      });
      changedOutcomes.set(key, outcome);
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
      continue;
    }

    const priceWindow = await fetchPriceWindow({ ...checkpoint, priceAtObservation: observed }, event);
    if (!priceWindow.ok) {
      const outcome = errorOutcome({
        checkpoint: { ...checkpoint, priceAtObservation: observed },
        dataFreshness: priceWindow.dataFreshness,
        errorReason: priceWindow.errorReason,
        event,
        generatedAt: nowIso,
        manualReviewRequired: !priceWindow.shouldRetry,
        notes: `价格源不可用：${priceWindow.error}`,
        runId: checkpointPlan.runId,
        shouldRetry: priceWindow.shouldRetry,
      });
      changedOutcomes.set(key, outcome);
      updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
      continue;
    }

    const outcome = recordedOutcome({
      checkpoint: { ...checkpoint, priceAtObservation: observed },
      event,
      generatedAt: nowIso,
      priceWindow,
      runId: checkpointPlan.runId,
    }) ?? errorOutcome({
      checkpoint: { ...checkpoint, priceAtObservation: observed },
      dataFreshness: priceWindow.dataFreshness,
      errorReason: "NO_CANDLES_IN_WINDOW",
      event,
      generatedAt: nowIso,
      manualReviewRequired: false,
      notes: "公开合约 K 线返回成功，但 observedAt 到 dueAt 窗口内没有可用已收盘 K 线。",
      runId: checkpointPlan.runId,
      shouldRetry: true,
    });
    changedOutcomes.set(key, outcome);
    updatedCheckpoints.push(checkpointFromOutcome(checkpoint, outcome));
  }

  const mergedOutcomes = new Map(outcomesByKey);
  for (const [key, outcome] of changedOutcomes.entries()) {
    mergedOutcomes.set(key, outcome);
  }

  const updatedPlan = {
    ...checkpointPlan,
    checkpoints: updatedCheckpoints,
  };

  return {
    checkpointPlan: dryRun ? checkpointPlan : updatedPlan,
    dueCount,
    dryRun,
    generatedAt: nowIso,
    outcomes: dryRun ? existingOutcomes : [...mergedOutcomes.values()],
    outcomesWritten: [...changedOutcomes.values()],
    skippedExisting,
    status: checkpointStatusDistribution(dryRun ? checkpointPlan : updatedPlan, nowIso),
  };
}

export function applyDedupeAndTransitions({
  existingEvents,
  incomingEvents,
  nowIso,
  runId,
}: {
  existingEvents: ShadowObservationEvent[];
  incomingEvents: ShadowObservationEvent[];
  nowIso: string;
  runId: string;
}): {
  duplicateEvents: number;
  primaryEvents: ShadowObservationEvent[];
  transitions: ShadowStatusTransition[];
} {
  const existingByDedupe = new Map(existingEvents.filter((event) => event.runId === runId).map((event) => [event.dedupeKey, event]));
  const lastBySymbol = new Map<string, ShadowObservationEvent>();
  for (const event of existingEvents.filter((item) => item.runId === runId)) {
    const previous = lastBySymbol.get(event.symbol);
    if (!previous || new Date(event.observedAt).getTime() >= new Date(previous.observedAt).getTime()) {
      lastBySymbol.set(event.symbol, event);
    }
  }

  const primaryEvents: ShadowObservationEvent[] = [];
  const transitions: ShadowStatusTransition[] = [];
  let duplicateEvents = 0;

  for (const event of incomingEvents) {
    const existing = existingByDedupe.get(event.dedupeKey);
    if (existing) {
      duplicateEvents += 1;
      continue;
    }

    const previous = lastBySymbol.get(event.symbol);
    if (previous && hasMeaningfulTransition(previous, event)) {
      transitions.push({
        changedAt: nowIso,
        eventId: `shadow_transition_${hash(`${runId}:${previous.eventId}:${event.eventId}:${stableJson(event.waitPlan)}:${stableJson(event.blockers)}`)}`,
        fromDecision: previous.decision,
        previousEventId: previous.eventId,
        reason: transitionReason(previous, event),
        runId,
        symbol: event.symbol,
        toDecision: event.decision,
      });
    }

    primaryEvents.push(event);
    existingByDedupe.set(event.dedupeKey, event);
    lastBySymbol.set(event.symbol, event);
  }

  return { duplicateEvents, primaryEvents, transitions };
}

function hasMeaningfulTransition(previous: ShadowObservationEvent, next: ShadowObservationEvent): boolean {
  return previous.decision !== next.decision ||
    stableJson(previous.blockers) !== stableJson(next.blockers) ||
    stableJson(previous.waitPlan) !== stableJson(next.waitPlan);
}

function transitionReason(previous: ShadowObservationEvent, next: ShadowObservationEvent): string {
  if (previous.decision !== next.decision) {
    return `decision_changed:${previous.decision}->${next.decision}`;
  }
  if (stableJson(previous.blockers) !== stableJson(next.blockers)) {
    return "blockers_changed";
  }
  return "wait_plan_changed";
}

export function buildShadowLatest({
  checkpointPlan,
  duplicateEvents,
  events,
  manifest,
  scan,
  transitions,
  warnings,
}: {
  checkpointPlan: ShadowCheckpointPlan;
  duplicateEvents: number;
  events: ShadowObservationEvent[];
  manifest: ShadowRunManifest;
  scan: ShadowScanInput;
  transitions: ShadowStatusTransition[];
  warnings: string[];
}): ShadowLatest {
  const meta = scanMeta(scan);
  const count = (decision: ShadowDecision) => events.filter((event) => event.decision === decision).length;
  const checkpointStats = checkpointStatusDistribution(checkpointPlan, manifest.updatedAt);

  return {
    canStartShadowV1: manifest.canStartShadowV1,
    errors: [],
    generatedAt: manifest.updatedAt,
    mode: manifest.mode,
    productionCommit: manifest.production.commit,
    productionEvidenceValidate: manifest.production.evidenceValidate,
    productionHealth: manifest.production.health,
    runId: manifest.runId,
    scan: {
      candidateCount: meta.candidateCount,
      freshness: meta.freshness,
      radarSignals: meta.radarSignals,
      scannedCount: meta.scannedCount,
      source: meta.source,
    },
    shadowTrackingStarted: manifest.shadowTrackingStarted,
    stats: {
      blockedCount: count("BLOCKED"),
      checkpointsDue: checkpointStats.due,
      checkpointsDuePending: checkpointStats.duePending,
      checkpointsMissed: checkpointStats.missed,
      checkpointsPending: checkpointStats.pending,
      checkpointsPlanned: checkpointPlan.checkpoints.length,
      checkpointsPendingWithError: checkpointStats.pendingWithError,
      checkpointsRecorded: checkpointStats.recorded,
      duplicatesSkipped: duplicateEvents,
      eventsTotal: events.length,
      observeCount: count("OBSERVE") + count("UNKNOWN"),
      readyCount: count("TRADE_PLAN_READY"),
      transitionsRecorded: transitions.length,
      uniqueSymbols: new Set(events.map((event) => event.symbol)).size,
      waitCount: count("WAIT"),
    },
    stillNotReadyForLiveTrading: true,
    warnings,
  };
}

export function buildEventsManifest({
  duplicateEvents,
  events,
  eventsPath,
  generatedAt,
  runId,
  transitions,
}: {
  duplicateEvents: number;
  events: ShadowObservationEvent[];
  eventsPath: string;
  generatedAt: string;
  runId: string;
  transitions: ShadowStatusTransition[];
}): ShadowEventsManifest {
  return {
    duplicateCount: duplicateEvents,
    eventsPath,
    generatedAt,
    primaryEventCount: events.length,
    runId,
    schemaVersion: "shadow-events-manifest.v1",
    transitionCount: transitions.length,
    uniqueSymbols: new Set(events.map((event) => event.symbol)).size,
  };
}

export function buildShadowLatestMarkdown(latest: ShadowLatest): string {
  const warningText = latest.warnings.length > 0 ? latest.warnings.map((warning) => `- ${warning}`).join("\n") : "- 无";
  const modeLabel = latest.mode === "shadow_v1_live_observation" ? "Shadow Tracking v1 live observation" : "Shadow Tracking v1 baseline readiness";
  return `# ${modeLabel}

生成时间：${latest.generatedAt}

## 当前状态

- 是否已经开始 Shadow Tracking：${latest.shadowTrackingStarted ? "是" : "否"}
- 当前模式：${latest.mode}
- 生产 commit：${latest.productionCommit}
- 生产 health：${latest.productionHealth}
- 生产 evidence validate：${latest.productionEvidenceValidate}
- 是否仍不能支撑实战交易：是
- 是否可进入第 5.1-R 正式启动任务书：${latest.canStartShadowV1 ? "是" : "否"}

## 本次捕获

- 扫描覆盖数：${latest.scan.scannedCount}
- 候选数：${latest.scan.candidateCount}
- 生产信号数：${latest.scan.radarSignals}
- 事件总数：${latest.stats.eventsTotal}
- 唯一币种数：${latest.stats.uniqueSymbols}
- OBSERVE：${latest.stats.observeCount}
- WAIT：${latest.stats.waitCount}
- BLOCKED：${latest.stats.blockedCount}
- READY：${latest.stats.readyCount}
- 去重跳过：${latest.stats.duplicatesSkipped}
- 状态迁移：${latest.stats.transitionsRecorded}
- 待记录 checkpoint：${latest.stats.checkpointsPlanned}
- checkpoint due：${latest.stats.checkpointsDue ?? 0}
- checkpoint pending：${latest.stats.checkpointsPending ?? latest.stats.checkpointsPlanned}
- checkpoint due pending：${latest.stats.checkpointsDuePending ?? 0}
- checkpoint recorded：${latest.stats.checkpointsRecorded ?? 0}
- checkpoint missed：${latest.stats.checkpointsMissed ?? 0}
- checkpoint pending_with_error：${latest.stats.checkpointsPendingWithError ?? 0}

## Warning

${warningText}

## 边界

本报告只说明 Shadow Tracking research-only 观察状态，不代表系统支撑实战交易，不代表可以自动下单。
`;
}

export function validateShadowStoragePayload({
  checkpointPlan,
  events,
  eventsManifest,
  latest,
  manifest,
}: {
  checkpointPlan: ShadowCheckpointPlan;
  events: ShadowObservationEvent[];
  eventsManifest: ShadowEventsManifest;
  latest: ShadowLatest;
  manifest: ShadowRunManifest;
}): ShadowStorageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isBaseline = manifest.phase === "5.1" && manifest.mode === "baseline_readiness";
  const isLiveShadow = manifest.phase === "5.1-R" && manifest.mode === "shadow_v1_live_observation";

  if (!manifest.runId) errors.push("manifest_missing_run_id");
  if (!isBaseline && !isLiveShadow) errors.push("manifest_phase_mode_invalid");
  if (isBaseline && manifest.shadowTrackingStarted !== false) errors.push("manifest_shadow_tracking_started_true");
  if (isLiveShadow && manifest.shadowTrackingStarted !== true) errors.push("manifest_shadow_tracking_started_false_for_live_mode");
  if (isLiveShadow && manifest.status !== "running" && manifest.status !== "paused" && manifest.status !== "completed" && manifest.status !== "aborted") {
    errors.push("manifest_live_status_invalid");
  }
  if (manifest.stillNotReadyForLiveTrading !== true) errors.push("manifest_live_trading_boundary_missing");
  if (manifest.canEnterLiveTrading !== false) errors.push("manifest_can_enter_live_trading_not_false");
  if (manifest.boundaries.researchOnly !== true) errors.push("manifest_research_only_missing");
  if (manifest.boundaries.mutatesProductionRanking !== false) errors.push("manifest_mutates_production_ranking");
  if (manifest.boundaries.autoTradingEnabled !== false) errors.push("manifest_auto_trading_enabled");
  if (manifest.canStartShadowV1 !== latest.canStartShadowV1) errors.push("can_start_shadow_v1_mismatch");
  if (manifest.shadowTrackingStarted !== latest.shadowTrackingStarted) errors.push("shadow_tracking_started_mismatch");

  for (const event of events) {
    if (!event.runId) errors.push(`event_missing_run_id:${event.eventId || event.symbol}`);
    if (event.runId !== manifest.runId) errors.push(`event_run_id_mismatch:${event.eventId}`);
    if (!event.eventId) errors.push(`event_missing_event_id:${event.symbol}`);
    if (!event.dedupeKey) errors.push(`event_missing_dedupe_key:${event.eventId}`);
    if (event.researchOnly !== true) errors.push(`event_not_research_only:${event.eventId}`);
    if (!event.enrichmentStatus) errors.push(`event_missing_enrichment_status:${event.eventId}`);
    if (!event.enrichmentSource) errors.push(`event_missing_enrichment_source:${event.eventId}`);
    if (event.decision === "TRADE_PLAN_READY" && event.readyPlan === null) {
      errors.push(`ready_event_missing_ready_plan:${event.eventId}`);
    }
  }

  const validationNow = Date.parse(latest.generatedAt || manifest.updatedAt || new Date().toISOString());
  for (const checkpoint of checkpointPlan.checkpoints) {
    if (!checkpoint.eventId) errors.push(`checkpoint_missing_event_id:${checkpoint.symbol}`);
    if (!checkpoint.dueAt) errors.push(`checkpoint_missing_due_at:${checkpoint.eventId}`);
    if (!["pending", "recorded", "missed", "pending_with_error"].includes(checkpoint.status)) {
      errors.push(`checkpoint_invalid_status:${checkpoint.eventId}:${checkpoint.checkpointType}:${checkpoint.status}`);
    }
    const dueTime = Date.parse(checkpoint.dueAt);
    const isDue = Number.isFinite(dueTime) && dueTime <= validationNow;
    if (checkpoint.status !== "pending" && !isDue) {
      errors.push(`checkpoint_future_outcome_filled:${checkpoint.eventId}:${checkpoint.checkpointType}`);
    }
    if (checkpoint.status === "pending" && (
      checkpoint.priceAtCheckpoint !== null ||
      checkpoint.rawMovePct !== undefined ||
      checkpoint.maxUpPctSinceObservation !== undefined ||
      checkpoint.maxDownPctSinceObservation !== undefined ||
      checkpoint.recordedAt !== undefined
    )) {
      errors.push(`checkpoint_future_outcome_filled:${checkpoint.eventId}:${checkpoint.checkpointType}`);
    }
    if (checkpoint.status === "recorded" && (checkpoint.priceAtCheckpoint === null || checkpoint.rawMovePct === null || checkpoint.dataSource !== "historical_kline_backfill")) {
      errors.push(`checkpoint_recorded_missing_outcome_fields:${checkpoint.eventId}:${checkpoint.checkpointType}`);
    }
    if (checkpoint.status === "pending_with_error" && !checkpoint.errorReason) {
      errors.push(`checkpoint_error_missing_reason:${checkpoint.eventId}:${checkpoint.checkpointType}`);
    }
    if (checkpoint.status === "missed" && !checkpoint.errorReason) {
      errors.push(`checkpoint_missed_missing_reason:${checkpoint.eventId}:${checkpoint.checkpointType}`);
    }
  }

  if (checkpointPlan.runId !== manifest.runId) errors.push("checkpoint_plan_run_id_mismatch");
  if (eventsManifest.runId !== manifest.runId) errors.push("events_manifest_run_id_mismatch");
  if (latest.runId !== manifest.runId) errors.push("latest_run_id_mismatch");
  if (latest.stillNotReadyForLiveTrading !== true) errors.push("latest_live_trading_boundary_missing");
  if (events.length === 0) warnings.push("baseline_capture_no_events");

  return {
    errors,
    ok: errors.length === 0,
    warnings,
  };
}
