import type {
  EvidencePoint,
  JournalEvent,
  MarketSignal,
  RiskGrade,
  SignalDirection,
  SignalMaturityStage,
} from "../analysis/types";
import type { KeyLevel, StrategyV3TradePlan } from "../analysis/v3/types";
import type { SignalBackendDossier } from "../market/signal-backend-dossier";
import type {
  DerivativeSnapshot,
  MarketRadarSnapshot,
  MarketTicker,
  ScanLightScanCandidate,
} from "../market/types";
import type { BackendContract } from "./backend-contract";
import type { BusinessCapabilityStage } from "./business-capability";

export type DataStatus =
  | "loading"
  | "live"
  | "cached"
  | "stale"
  | "partial"
  | "empty"
  | "error"
  | "failed";

export type Resource<T> = {
  status: DataStatus;
  data: T;
  updatedAt?: string;
  ageSec?: number;
  source?: string;
  reason?: string;
};

export type ScanProofData = {
  totalMonitored: number;
  scannable: number;
  lightScanned: number;
  deepScanned: number;
  awaitingDeepScan: number;
  coverage: number;
  lastScanAt: string;
  nextScanCountdownSec: number;
  stuck: boolean;
};

export type DeepScanQueue = {
  currentBatch: string[];
  nextBatch: string[];
  highPriority: string[];
  coldExploration: string[];
  longUnscanned: { symbol: string; idleMin: number }[];
};

export type CapabilityStage = {
  key: string;
  name: string;
  desc: string;
  status: "active" | "standby" | "degraded";
  note: string;
};

export type DataSourceState = {
  name: "CoinGlass" | "Binance" | "OKX" | "Bybit";
  feed: "live" | "cached" | "stale" | "partial" | "failed";
  latencyMs: number;
  lastUpdate: string;
  note: string;
};

export type SignalMaturity =
  | SignalMaturityStage
  | "BLOCKED"
  | "INVALIDATED"
  | "COOLDOWN";

export type RadarSignal = {
  id: string;
  symbol: string;
  hue: number;
  direction: "多" | "空" | "观察";
  maturity: SignalMaturity;
  rr: number | null;
  risk: "低" | "中" | "高" | "极高";
  evidenceCount: number;
  counterCount: number;
  freshness: DataSourceState["feed"];
  whySelected: string;
  whyBlocked: string | null;
  updatedMinAgo: number;
};

export type TfStructure = {
  tf: "15m" | "1h" | "4h" | "1d";
  phase: string;
  trend: "多" | "空" | "震荡";
  priorHigh: number;
  priorLow: number;
  support: number;
  resistance: number;
};

export type EvidenceItem = {
  kind: string;
  label: string;
  weight: number;
  detail: string;
  supportive: boolean;
};

export type CounterItem = {
  kind: string;
  label: string;
  detail: string;
};

export type RiskGateResult = {
  allowTradePlan: boolean;
  reasons: string[];
};

export type TradePlanData = {
  bias: "多" | "空" | "观望";
  entryCondition: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  rr: number;
  scaleOut: string;
  invalidation: string;
  allowChase: boolean;
};

export type AiReviewData = {
  reviewed: boolean;
  findings: string[];
  suggestDowngrade: boolean;
  note: string;
};

export type TokenDossier = {
  symbol: string;
  direction: "看多" | "看空" | "中性";
  maturity: SignalMaturity;
  structures: TfStructure[];
  evidence: EvidenceItem[];
  counter: CounterItem[];
  riskGate: RiskGateResult;
  tradePlan: TradePlanData | null;
  aiReview: AiReviewData;
};

export type SignalLifecycle = {
  id: string;
  symbol: string;
  hue: number;
  side: "多" | "空";
  appearedAt: string;
  triggerPrice: number;
  stopPrice: number;
  targetPrice: number;
  verifyWindowH: number;
  hitTpFirst: boolean;
  hitSlFirst: boolean;
  timedOut: boolean;
  mfe: number;
  mae: number;
};

export type StrategyArchetype = {
  key: string;
  name: string;
  winRate: number;
  avgRR: number;
  samples: number;
  commonFailure: string;
};

export type MissedDetection = {
  symbol: string;
  hue: number;
  move: number;
  side: "涨" | "跌";
  reason: "未进轻扫" | "未进深扫" | "被风控挡住" | "证据不足";
  detail: string;
  improvement: string;
};

export type EvolutionSuggestion = {
  title: string;
  rationale: string;
  impact: "高" | "中" | "低";
  adopted: boolean;
};

export type ServiceNode = {
  key: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
};

export type DataPipelineState = {
  lastScanAt: string;
  lastWriteAt: string;
  stale: boolean;
  cacheHit: boolean;
  recentError: string | null;
  recentSuccess: string;
};

export type ApiUsageState = {
  provider: "CoinGlass";
  usedToday: number;
  remainingToday: number;
  perMinuteLimit: number;
  pacingMs: number;
  throttled: boolean;
};

export type PetBackendStatus = {
  system: "正常" | "降级" | "异常";
  scan: "扫描中" | "空闲" | "卡住";
  signal: "有就绪信号" | "验证中" | "无信号";
  risk: "低" | "中" | "高";
  rank: string;
  discipline: "优秀" | "良好" | "需改进";
  review: "已完成" | "待复盘";
  todayPerf: number;
};

export type LeaderboardKind =
  | "gainers"
  | "losers"
  | "volume"
  | "volatility_squeeze"
  | "relative_strength"
  | "oi_change"
  | "funding_hot";

export type LeaderboardRow = {
  symbol: string;
  hue: number;
  value: number;
  price: number;
  inCandidatePool: boolean;
  deepScanned: boolean;
  hasSignal: boolean;
  blocked: boolean;
  awaitingScan: boolean;
};

export type MacroAltEnv = {
  btcState: "强势" | "震荡" | "弱势";
  ethState: "强势" | "震荡" | "弱势";
  btcDominance: number;
  btcDominanceTrend: "上升" | "下降" | "走平";
  total2: number;
  total3: number;
  altStrength: number;
  riskMode: "进攻" | "中性" | "防守";
  suggestion: "更适合做多" | "更适合做空" | "建议观望";
};

export type DerivativesState = {
  oiChange: number;
  funding: number;
  longShortRatio: number;
  takerBuySell: number;
  exchangeCoverage: number;
  totalExchanges: number;
  lastUpdate: string;
};

export type RadarContract = {
  scanProof: Resource<ScanProofData>;
  deepScanQueue: Resource<DeepScanQueue>;
  capabilityStages: Resource<CapabilityStage[]>;
  dataSources: Resource<DataSourceState[]>;
  apiUsage: Resource<ApiUsageState>;
  dataPipeline: Resource<DataPipelineState>;
  petBackendStatus: Resource<PetBackendStatus>;
  radarSignals: Resource<RadarSignal[]>;
  macroAltEnv: Resource<MacroAltEnv>;
  derivatives: Resource<DerivativesState>;
  serviceNodes: Resource<ServiceNode[]>;
};

export type ReviewContract = {
  signalLifecycles: Resource<SignalLifecycle[]>;
  strategyArchetypes: Resource<StrategyArchetype[]>;
  missedDetections: Resource<MissedDetection[]>;
  evolutionSuggestions: Resource<EvolutionSuggestion[]>;
};

type FrontendContractEnv = Partial<Record<
  "COINGLASS_DAILY_REQUEST_BUDGET" | "COINGLASS_REQUEST_INTERVAL_MS",
  string
>>;

function resource<T>(
  data: T,
  status: DataStatus = "live",
  extra: Omit<Resource<T>, "data" | "status"> = {},
): Resource<T> {
  return {
    status,
    data,
    ...extra,
  };
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function baseSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[-_/]/g, "").replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "");
}

function displaySymbol(value: string) {
  return baseSymbol(value);
}

function symbolHue(symbol: string) {
  let hash = 0;
  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 360;
}

function diffSeconds(from: string | null | undefined, now: Date) {
  if (!from) {
    return undefined;
  }
  const parsed = new Date(from).getTime();
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

function diffMinutes(from: string | null | undefined, now: Date) {
  const seconds = diffSeconds(from, now);
  return seconds === undefined ? 0 : Math.round(seconds / 60);
}

function timeLabel(value: string | null | undefined) {
  if (!value) {
    return "等待数据";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) {
    return "等待数据";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")} ${
    String(parsed.getHours()).padStart(2, "0")
  }:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function marketStatusToResourceStatus(status: string | undefined): DataStatus {
  if (status === "ready") {
    return "live";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "stale") {
    return "stale";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "missing" || status === "disabled") {
    return "empty";
  }
  return "partial";
}

function sourceStatusToFeed(status: string | undefined): DataSourceState["feed"] {
  if (status === "ok" || status === "ready") {
    return "live";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "fallback") {
    return "cached";
  }
  if (status === "failed") {
    return "failed";
  }
  return "stale";
}

function directionCn(direction: SignalDirection): RadarSignal["direction"] {
  if (direction === "long") {
    return "多";
  }
  if (direction === "short") {
    return "空";
  }
  return "观察";
}

function tokenDirectionCn(direction: SignalDirection | undefined): TokenDossier["direction"] {
  if (direction === "long") {
    return "看多";
  }
  if (direction === "short") {
    return "看空";
  }
  return "中性";
}

function riskCn(risk: RiskGrade | undefined): RadarSignal["risk"] {
  if (risk === "low") {
    return "低";
  }
  if (risk === "medium") {
    return "中";
  }
  if (risk === "high") {
    return "高";
  }
  return "极高";
}

function lifecycleStatusReason(signal: MarketSignal) {
  const reasons: string[] = [];
  if (signal.risk === "blocked" || signal.strategy.status === "blocked") {
    reasons.push("Risk Gate 拦截");
  }
  if (signal.strategy.riskReward > 0 && signal.strategy.riskReward < 3) {
    reasons.push(`RR ${round(signal.strategy.riskReward, 2)} 低于最低 3:1 门槛`);
  }
  if (signal.timeframeGate && !signal.timeframeGate.allowed) {
    reasons.push(signal.timeframeGate.summary || "高周期门控未通过");
  }
  if (signal.state === "invalidated") {
    reasons.push("结构已经失效");
  }
  return reasons;
}

function maturityForSignal(signal: MarketSignal): SignalMaturity {
  if (signal.state === "invalidated") {
    return "INVALIDATED";
  }
  if (lifecycleStatusReason(signal).length > 0) {
    return "BLOCKED";
  }
  return signal.maturity?.stage ?? (signal.evidence.length > 0 ? "EVIDENCE_SIGNAL" : "DEEP_SCAN_CANDIDATE");
}

function evidenceKind(layer: EvidencePoint["layer"]) {
  return {
    ai_review: "ai",
    data_quality: "data",
    derivatives: "derivatives",
    flexibility: "strategy",
    indicators: "ta",
    lifecycle_review: "review",
    market_regime: "regime",
    price_volume: "volume",
    risk_reward: "rr",
    structure_location: "structure",
  }[layer];
}

function evidenceWeight(item: EvidencePoint, total: number) {
  if (total <= 0) {
    return 0;
  }
  const base = item.polarity === "supportive" ? 100 / total : 50 / total;
  return Math.max(1, Math.round(base));
}

function buildRadarSignal(signal: MarketSignal, snapshot: MarketRadarSnapshot, now: Date): RadarSignal {
  const maturity = maturityForSignal(signal);
  const blockers = lifecycleStatusReason(signal);
  const supportive = signal.evidence.filter((item) => item.polarity === "supportive");
  const counter = signal.evidence.filter((item) => item.polarity === "conflicting" || item.polarity === "blocking");
  const rr = signal.strategy.riskReward > 0 ? round(signal.strategy.riskReward, 2) : null;

  return {
    id: signal.id,
    symbol: displaySymbol(signal.symbol),
    hue: symbolHue(signal.symbol),
    direction: directionCn(signal.direction),
    maturity,
    rr,
    risk: riskCn(signal.risk),
    evidenceCount: supportive.length,
    counterCount: counter.length,
    freshness: marketStatusToResourceStatus(snapshot.metadata.status) === "live"
      ? "live"
      : sourceStatusToFeed(snapshot.metadata.status),
    whySelected: signal.summary || supportive[0]?.value || "已进入后端证据链",
    whyBlocked: blockers.length > 0 ? blockers.join("；") : null,
    updatedMinAgo: diffMinutes(signal.updatedAt, now),
  };
}

function dataSourceRow({
  name,
  feed,
  lastUpdate,
  latencyMs,
  note,
}: DataSourceState): DataSourceState {
  return {
    name,
    feed,
    latencyMs,
    lastUpdate,
    note,
  };
}

function capabilityStatus(status: BusinessCapabilityStage["status"]): CapabilityStage["status"] {
  if (status === "ready") {
    return "active";
  }
  if (status === "blocked" || status === "disabled") {
    return "degraded";
  }
  return "standby";
}

function capabilityKey(id: string) {
  return {
    ai_counter_review: "ai_review",
    candidate_rotation: "rotation",
    evolution_suggestions: "evolution",
    historical_case_replay: "replay",
    outcome_standard: "review",
    shadow_tracking: "shadow",
    signal_lifecycle: "lifecycle",
    signal_maturity: "maturity",
    strategy_family_stats: "archetype",
  }[id] ?? id;
}

function scanCountdown(snapshot: MarketRadarSnapshot, now: Date) {
  const nextScanAt = new Date(snapshot.metadata.nextScanAt).getTime();
  if (!Number.isFinite(nextScanAt)) {
    return 0;
  }
  return Math.max(0, Math.round((nextScanAt - now.getTime()) / 1000));
}

function average(values: number[]) {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildDerivatives(snapshot: MarketRadarSnapshot): DerivativesState {
  const uniqueExchanges = new Set(snapshot.derivatives.map((item) => item.exchange));
  const latest = snapshot.derivatives
    .map((item) => item.updatedAt)
    .sort()
    .at(-1) ?? snapshot.metadata.generatedAt;

  return {
    oiChange: round(average(snapshot.derivatives.map((item) => item.openInterestChangePercent)), 2),
    funding: round(average(snapshot.derivatives.map((item) => item.fundingRate)) * 100, 4),
    longShortRatio: round(average(snapshot.derivatives.map((item) => item.longShortRatio ?? 0)), 2),
    takerBuySell: 0,
    exchangeCoverage: uniqueExchanges.size,
    totalExchanges: 3,
    lastUpdate: timeLabel(latest),
  };
}

function buildMacro(backend: BackendContract): MacroAltEnv {
  const macro = backend.sourceAudit.macroMarket;
  const btcDominance = safeNumber(macro.btcDominancePercent, 0);
  const hint = `${macro.operatorHint ?? ""}`.toLowerCase();
  const btcDominanceTrend: MacroAltEnv["btcDominanceTrend"] =
    hint.includes("下降") || hint.includes("down") ? "下降" :
    hint.includes("上升") || hint.includes("up") ? "上升" :
    "走平";
  const riskMode: MacroAltEnv["riskMode"] =
    macro.status !== "ready" ? "防守" :
    btcDominanceTrend === "下降" ? "进攻" :
    btcDominanceTrend === "上升" ? "防守" :
    "中性";
  const suggestion: MacroAltEnv["suggestion"] =
    riskMode === "进攻" ? "更适合做多" : riskMode === "防守" ? "建议观望" : "建议观望";

  return {
    btcState: macro.status === "ready" ? "震荡" : "弱势",
    ethState: macro.status === "ready" ? "震荡" : "弱势",
    btcDominance,
    btcDominanceTrend,
    total2: safeNumber(macro.total2MarketCapUsd, 0),
    total3: safeNumber(macro.total3MarketCapUsd, 0),
    altStrength: riskMode === "进攻" ? 66 : riskMode === "防守" ? 38 : 50,
    riskMode,
    suggestion,
  };
}

function normalizeAssetList(values: string[] | undefined) {
  return (values ?? []).map(displaySymbol).filter((value, index, list) => value && list.indexOf(value) === index);
}

export function buildFrontendRadarContract({
  backend,
  snapshot,
  env,
  now = new Date(),
}: {
  backend: BackendContract;
  snapshot: MarketRadarSnapshot;
  env: FrontendContractEnv;
  now?: Date;
}): RadarContract {
  const status = marketStatusToResourceStatus(snapshot.metadata.status);
  const ageSec = diffSeconds(snapshot.metadata.generatedAt, now);
  const source = snapshot.metadata.source;
  const coverage = backend.scanProof.fullMarket;
  const allocation = backend.scanProof.allocation;
  const plannedRequests = backend.sourceAudit.coinGlassDeepScan.plannedRequests;
  const dailyBudget = Math.max(1, Number(env.COINGLASS_DAILY_REQUEST_BUDGET ?? 300));
  const usedToday = Math.min(dailyBudget, Math.max(0, plannedRequests));
  const derivatives = buildDerivatives(snapshot);
  const tradeReady = snapshot.signals.some((signal) => maturityForSignal(signal) === "TRADE_PLAN_READY");
  const blockedSignals = snapshot.signals.filter((signal) => lifecycleStatusReason(signal).length > 0);
  const liveSignals = snapshot.signals.map((signal) => buildRadarSignal(signal, snapshot, now));

  return {
    scanProof: resource({
      totalMonitored: coverage.totalAssets,
      scannable: coverage.eligibleAssets,
      lightScanned: backend.scanProof.lightScan.acceptedCount,
      deepScanned: backend.scanProof.deepScan.cleanRows || allocation.selectedAssets.length,
      awaitingDeepScan: coverage.pendingAssets,
      coverage: round(coverage.coveragePercent, 1),
      lastScanAt: timeLabel(snapshot.metadata.generatedAt),
      nextScanCountdownSec: scanCountdown(snapshot, now),
      stuck: snapshot.metadata.status === "failed" || coverage.status === "blocked",
    }, status, { ageSec, source }),
    deepScanQueue: resource({
      currentBatch: normalizeAssetList(allocation.selectedAssets),
      nextBatch: normalizeAssetList(allocation.nextBatchAssets),
      highPriority: normalizeAssetList(backend.scanProof.twoStageAllocation?.stageTwo.queuedPriorityAssets ?? allocation.pendingAssets),
      coldExploration: normalizeAssetList(allocation.coldExplorationAssets),
      longUnscanned: normalizeAssetList(allocation.pendingAssets).slice(0, 8).map((symbol, index) => ({
        symbol,
        idleMin: (index + 1) * snapshot.metadata.cadenceMinutes,
      })),
    }, status, { ageSec, source: "dynamic-scan-scheduler" }),
    capabilityStages: resource(
      backend.analysis.businessCapability.stages.map((stage) => ({
        key: capabilityKey(stage.id),
        name: stage.title,
        desc: stage.summary,
        status: capabilityStatus(stage.status),
        note: stage.nextAction,
      })),
      marketStatusToResourceStatus(backend.analysis.businessCapability.status === "operational" ? "ready" : "partial"),
      { ageSec, source: "signal-worker" },
    ),
    dataSources: resource([
      dataSourceRow({
        name: "CoinGlass",
        feed: marketStatusToResourceStatus(backend.sourceAudit.coinGlassDeepScan.status) === "live" ? "live" : "partial",
        latencyMs: 0,
        lastUpdate: timeLabel(snapshot.metadata.generatedAt),
        note: `深扫 ${backend.sourceAudit.coinGlassDeepScan.cleanRows}/${backend.sourceAudit.coinGlassDeepScan.rawRows} 行可用`,
      }),
      ...(["Binance", "OKX", "Bybit"] as const).map((name) => {
        const sourceRow = backend.sourceAudit.publicDiscovery.sources.find((item) =>
          item.source.toLowerCase().includes(name.toLowerCase())
        );
        return dataSourceRow({
          name,
          feed: sourceStatusToFeed(sourceRow?.status),
          latencyMs: 0,
          lastUpdate: timeLabel(snapshot.metadata.generatedAt),
          note: sourceRow
            ? `发现 ${sourceRow.instrumentCount} 个合约，request=${sourceRow.requestCount}`
            : "当前快照未包含该交易所明细",
        });
      }),
    ], status === "live" ? "partial" : status, {
      ageSec,
      source: "scanner-worker",
      reason: "latencyMs 暂未接入真实探针，先用 0 占位。",
    }),
    apiUsage: resource({
      provider: "CoinGlass",
      usedToday,
      remainingToday: Math.max(0, dailyBudget - usedToday),
      perMinuteLimit: 30,
      pacingMs: Number(env.COINGLASS_REQUEST_INTERVAL_MS ?? 500),
      throttled: false,
    }, "partial", {
      ageSec,
      source: "coinglass-worker",
      reason: "当前只有本轮计划请求数，真实日内计数后续接入 Redis/Postgres 计数器。",
    }),
    dataPipeline: resource({
      lastScanAt: timeLabel(snapshot.metadata.generatedAt),
      lastWriteAt: timeLabel(snapshot.metadata.generatedAt),
      stale: snapshot.metadata.status === "stale",
      cacheHit: backend.runtime.cacheStatus === "served_cache",
      recentError: snapshot.metadata.status === "failed" ? snapshot.metadata.notes.join("；") || "数据源失败" : null,
      recentSuccess: `完成 ${snapshot.signals.length} 条信号融合，归档 ${backend.runtime.persistedArchive ? "已持久化" : "未持久化"}`,
    }, status, { ageSec, source: "web" }),
    petBackendStatus: resource({
      system: status === "live" ? "正常" : status === "failed" ? "异常" : "降级",
      scan: snapshot.metadata.status === "failed" ? "卡住" : scanCountdown(snapshot, now) > 0 ? "扫描中" : "空闲",
      signal: tradeReady ? "有就绪信号" : liveSignals.length > 0 ? "验证中" : "无信号",
      risk: blockedSignals.length > 0 ? "高" : "中",
      rank: "川流不息",
      discipline: "良好",
      review: snapshot.journalEvents.length > 0 ? "已完成" : "待复盘",
      todayPerf: Math.min(100, Math.max(0, backend.analysis.businessCapability.readinessScore)),
    }, status, { ageSec, source: "web" }),
    radarSignals: resource(liveSignals, status, { ageSec, source: "signal-worker" }),
    macroAltEnv: resource(
      buildMacro(backend),
      marketStatusToResourceStatus(backend.sourceAudit.macroMarket.status),
      {
        ageSec: backend.sourceAudit.macroMarket.ageMinutes === null ? undefined : backend.sourceAudit.macroMarket.ageMinutes * 60,
        source: backend.sourceAudit.macroMarket.source ?? "macro-market",
      },
    ),
    derivatives: resource(
      derivatives,
      snapshot.derivatives.length > 0 ? status : "partial",
      {
        ageSec,
        source: "coinglass",
        reason: snapshot.derivatives.length > 0 ? undefined : "当前快照未包含衍生品明细。",
      },
    ),
    serviceNodes: resource([
      { key: "web", name: "web", status: status === "failed" ? "down" : "healthy", detail: `trigger=${backend.runtime.trigger}` },
      {
        key: "postgres",
        name: "postgres",
        status: backend.runtime.repositoryMode === "database" ? "healthy" : "degraded",
        detail: `repository=${backend.runtime.repositoryMode}`,
      },
      { key: "redis", name: "redis", status: "degraded", detail: "未从后端健康检查暴露 Redis 探针" },
      {
        key: "scanner-worker",
        name: "scanner-worker",
        status: status === "failed" ? "down" : status === "partial" ? "degraded" : "healthy",
        detail: `coverage=${round(coverage.coveragePercent, 1)}%`,
      },
      {
        key: "coinglass-worker",
        name: "coinglass-worker",
        status: backend.sourceAudit.coinGlassDeepScan.status === "failed" ? "down" : "healthy",
        detail: `planned=${plannedRequests}, clean=${backend.sourceAudit.coinGlassDeepScan.cleanRows}`,
      },
      { key: "signal-worker", name: "signal-worker", status: "healthy", detail: `signals=${snapshot.signals.length}` },
      {
        key: "dynamic-scan-scheduler",
        name: "dynamic-scan-scheduler",
        status: allocation.selectedAssets.length > 0 ? "healthy" : "degraded",
        detail: `next=${allocation.nextBatchAssets.slice(0, 4).join(", ") || "waiting"}`,
      },
    ], status, { ageSec, source: "web" }),
  };
}

function tickerValue(kind: LeaderboardKind, ticker: MarketTicker, derivatives: DerivativeSnapshot[], light?: ScanLightScanCandidate) {
  const derivative = derivatives.find((item) => baseSymbol(item.symbol) === baseSymbol(ticker.symbol));
  if (kind === "losers") {
    return ticker.changePercent24h;
  }
  if (kind === "volume") {
    return ticker.volume24hUsd;
  }
  if (kind === "volatility_squeeze") {
    return light ? Math.max(0, 100 - light.volatilityPercent) : 0;
  }
  if (kind === "relative_strength") {
    return (light?.score ?? 0) + Math.max(0, ticker.changePercent24h);
  }
  if (kind === "oi_change") {
    return derivative?.openInterestChangePercent ?? 0;
  }
  if (kind === "funding_hot") {
    return derivative?.fundingRate ?? 0;
  }
  return ticker.changePercent24h;
}

function lightCandidateValue(kind: LeaderboardKind, candidate: ScanLightScanCandidate, derivatives: DerivativeSnapshot[]) {
  const derivative = derivatives.find((item) => baseSymbol(item.symbol) === baseSymbol(candidate.symbol));

  if (kind === "losers" || kind === "gainers") {
    return candidate.changePercent24h;
  }
  if (kind === "volume") {
    return candidate.volume24hUsd;
  }
  if (kind === "volatility_squeeze") {
    return Math.max(0, 100 - candidate.volatilityPercent);
  }
  if (kind === "relative_strength") {
    return candidate.score + Math.max(0, candidate.changePercent24h);
  }
  if (kind === "oi_change") {
    return derivative?.openInterestChangePercent ?? 0;
  }
  if (kind === "funding_hot") {
    return derivative?.fundingRate ?? 0;
  }
  return candidate.score;
}

export function buildFrontendLeaderboardContract({
  backend,
  kind,
  snapshot,
}: {
  backend: BackendContract;
  kind: LeaderboardKind;
  snapshot: MarketRadarSnapshot;
}): Resource<LeaderboardRow[]> {
  const signalSymbols = new Set(snapshot.signals.map((signal) => baseSymbol(signal.symbol)));
  const blockedSymbols = new Set(snapshot.signals.filter((signal) => lifecycleStatusReason(signal).length > 0).map((signal) =>
    baseSymbol(signal.symbol)
  ));
  const candidateSymbols = new Set([
    ...backend.scanProof.lightScan.topCandidates.map((candidate) => baseSymbol(candidate.symbol)),
    ...backend.analysis.signalMaturity.candidateLaneSymbols.map(baseSymbol),
  ]);
  const deepScannedSymbols = new Set(backend.scanProof.allocation.selectedAssets.map(baseSymbol));
  const awaitingSymbols = new Set(backend.scanProof.allocation.pendingAssets.map(baseSymbol));
  const lightBySymbol = new Map(backend.scanProof.lightScan.topCandidates.map((candidate) => [baseSymbol(candidate.symbol), candidate]));
  const direction = kind === "losers" ? 1 : -1;
  const rowsBySymbol = new Map<string, LeaderboardRow>();

  for (const ticker of snapshot.tickers) {
    const symbol = baseSymbol(ticker.symbol);
    rowsBySymbol.set(symbol, {
      symbol,
      hue: symbolHue(symbol),
      value: round(tickerValue(kind, ticker, snapshot.derivatives, lightBySymbol.get(symbol)), kind === "funding_hot" ? 4 : 2),
      price: ticker.price,
      inCandidatePool: candidateSymbols.has(symbol),
      deepScanned: deepScannedSymbols.has(symbol),
      hasSignal: signalSymbols.has(symbol),
      blocked: blockedSymbols.has(symbol),
      awaitingScan: awaitingSymbols.has(symbol),
    });
  }

  for (const candidate of backend.scanProof.lightScan.topCandidates) {
    const symbol = baseSymbol(candidate.symbol);
    if (rowsBySymbol.has(symbol)) {
      continue;
    }
    rowsBySymbol.set(symbol, {
      symbol,
      hue: symbolHue(symbol),
      value: round(lightCandidateValue(kind, candidate, snapshot.derivatives), kind === "funding_hot" ? 4 : 2),
      price: safeNumber(candidate.price, 0),
      inCandidatePool: true,
      deepScanned: deepScannedSymbols.has(symbol),
      hasSignal: signalSymbols.has(symbol),
      blocked: blockedSymbols.has(symbol),
      awaitingScan: awaitingSymbols.has(symbol),
    });
  }

  const rows = [...rowsBySymbol.values()]
    .sort((left, right) => direction * (left.value - right.value))
    .slice(0, 50);

  return resource(rows, rows.length > 0 ? marketStatusToResourceStatus(snapshot.metadata.status) : "empty", {
    ageSec: diffSeconds(snapshot.metadata.generatedAt, new Date()),
    source: "scanner-worker",
  });
}

function levelMid(level: KeyLevel) {
  const mid = safeNumber(level.midPrice, 0);
  if (mid > 0) {
    return mid;
  }
  return (safeNumber(level.zoneLow, 0) + safeNumber(level.zoneHigh, 0)) / 2;
}

function bestLevel({
  currentPrice,
  direction,
  levels,
}: {
  currentPrice: number;
  direction: "SUPPORT" | "RESISTANCE";
  levels: KeyLevel[];
}) {
  const directional = levels.filter((level) => level.direction === direction || level.direction === "BOTH");
  const located = directional.filter((level) => {
    if (currentPrice <= 0) {
      return true;
    }
    return direction === "SUPPORT"
      ? safeNumber(level.zoneLow, 0) <= currentPrice
      : safeNumber(level.zoneHigh, 0) >= currentPrice;
  });
  const pool = located.length > 0 ? located : directional;

  return pool
    .map((level) => ({
      distance: currentPrice > 0 ? Math.abs(levelMid(level) - currentPrice) : 0,
      level,
    }))
    .sort((left, right) =>
      left.distance - right.distance ||
      right.level.keyScore - left.level.keyScore ||
      right.level.confluenceScore - left.level.confluenceScore
    )[0]?.level ?? null;
}

function structureFromDossier(dossier: SignalBackendDossier, basePrice: number): TfStructure[] {
  const timeframes = ["15m", "1h", "4h", "1d"] as const;
  const selected = new Set(dossier.chart.availableTimeframes);
  const direction = tokenDirectionCn(dossier.signal?.direction);
  const trend: TfStructure["trend"] = direction === "看多" ? "多" : direction === "看空" ? "空" : "震荡";
  const currentPrice = safeNumber(dossier.strategyV3?.currentPrice, safeNumber(basePrice, 0));
  const keyLevels = dossier.strategyV3?.keyLevels ?? [];

  return timeframes.map((tf) => {
    const timeframeLevels = keyLevels.filter((level) => level.timeframe === tf);
    const support = bestLevel({
      currentPrice,
      direction: "SUPPORT",
      levels: timeframeLevels,
    });
    const resistance = bestLevel({
      currentPrice,
      direction: "RESISTANCE",
      levels: timeframeLevels,
    });
    const supportValue = support ? round(levelMid(support), currentPrice < 1 ? 4 : 2) : 0;
    const resistanceValue = resistance ? round(levelMid(resistance), currentPrice < 1 ? 4 : 2) : 0;

    return {
      tf,
      phase: selected.has(tf)
        ? timeframeLevels.length > 0
          ? dossier.strategyV3?.summary ?? dossier.signal?.summary ?? "后端结构"
          : "OHLCV 已接入，关键位待补齐"
        : "等待 OHLCV 补齐",
      trend,
      priorHigh: resistanceValue,
      priorLow: supportValue,
      support: supportValue,
      resistance: resistanceValue,
    };
  });
}

function priceText(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "等待目标位";
  }

  return value >= 100 ? value.toFixed(2) : value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "");
}

function tradePlanFromV3(plan: StrategyV3TradePlan | undefined): TradePlanData | null {
  if (!plan || !plan.isPlanEligible || plan.rewardRisk === null || plan.rewardRisk < 3) {
    return null;
  }

  if (plan.status !== "READY_LONG" && plan.status !== "READY_SHORT") {
    return null;
  }

  return {
    bias: plan.direction === "long" ? "多" : plan.direction === "short" ? "空" : "观望",
    entryCondition: plan.entryZone,
    stop: plan.structuralStop === null
      ? plan.invalidation
      : `${priceText(plan.structuralStop)}；${plan.invalidation}`,
    tp1: priceText(plan.targets[0]),
    tp2: priceText(plan.targets[1] ?? plan.targets[0]),
    tp3: priceText(plan.targets[2] ?? plan.targets.at(-1) ?? plan.targets[0]),
    rr: round(plan.rewardRisk, 2),
    scaleOut: plan.takeProfitPlan,
    invalidation: plan.invalidation,
    allowChase: false,
  };
}

function v3TradePlanBlockers(plan: StrategyV3TradePlan | undefined) {
  if (!plan) {
    return ["等待后端结构化交易计划"];
  }

  if (plan.isPlanEligible && plan.rewardRisk !== null && plan.rewardRisk >= 3 && (
    plan.status === "READY_LONG" || plan.status === "READY_SHORT"
  )) {
    return [];
  }

  return [
    ...plan.blockedBy,
    plan.rewardRisk !== null && plan.rewardRisk < 3 ? `RR ${round(plan.rewardRisk, 2)} 低于最低 3:1 门槛` : null,
    plan.status === "WAIT_PULLBACK" ? "等待回踩确认" : null,
    plan.status === "WAIT_RETEST" ? "等待反抽确认" : null,
    plan.status === "WATCH_ONLY" ? "只观察，不生成交易计划" : null,
    plan.summary,
  ].filter((item): item is string => Boolean(item));
}

export function buildFrontendTokenDossierContract({
  basePrice = 1,
  dossier,
  now = new Date(),
}: {
  basePrice?: number;
  dossier: SignalBackendDossier;
  now?: Date;
}): Resource<TokenDossier> {
  const signal = dossier.signal;
  const hardBlockedReasons = signal
    ? [
      ...(signal.risk === "blocked" ? ["Risk Gate 拦截"] : []),
      ...(signal.timeframeGate && !signal.timeframeGate.allowed ? [signal.timeframeGate.summary] : []),
    ]
    : ["后端没有找到该币种的成熟信号"];
  const evidence = dossier.evidence.items.filter((item) => item.polarity === "supportive");
  const counter = dossier.evidence.items.filter((item) => item.polarity === "conflicting" || item.polarity === "blocking");
  const v3Plan = dossier.strategyV3?.tradePlan;
  const tradePlan = tradePlanFromV3(v3Plan);
  const blockedReasons = [
    ...hardBlockedReasons,
    ...(signal ? v3TradePlanBlockers(v3Plan) : []),
  ];

  return resource({
    symbol: displaySymbol(dossier.symbol),
    direction: tokenDirectionCn(signal?.direction),
    maturity: signal
      ? hardBlockedReasons.length > 0 || v3Plan?.status === "BLOCKED"
        ? "BLOCKED"
        : tradePlan
          ? "TRADE_PLAN_READY"
          : "EVIDENCE_SIGNAL"
      : "INVALIDATED",
    structures: structureFromDossier(dossier, basePrice),
    evidence: evidence.map((item) => ({
      kind: evidenceKind(item.layer),
      label: item.label,
      weight: evidenceWeight(item, dossier.evidence.total),
      detail: item.value,
      supportive: true,
    })),
    counter: counter.map((item) => ({
      kind: evidenceKind(item.layer),
      label: item.label,
      detail: item.value,
    })),
    riskGate: {
      allowTradePlan: tradePlan !== null,
      reasons: tradePlan ? [] : blockedReasons,
    },
    tradePlan,
    aiReview: {
      reviewed: signal?.timeframeGate !== undefined || dossier.evidence.total > 0,
      findings: counter.map((item) => item.value).slice(0, 5),
      suggestDowngrade: blockedReasons.length > 0,
      note: "AI 仅对反证进行复核，不生成交易结论；最终判定以规则引擎为准。",
    },
  }, dossier.found ? "live" : "empty", {
    ageSec: diffSeconds(dossier.generatedAt, now),
    source: "signal-worker",
  });
}

function lifecycleFromJournal(event: JournalEvent): SignalLifecycle {
  const trigger = event.outcomeMetrics?.entryPrice ?? Number(event.trigger ?? 0);
  const stop = event.outcomeMetrics?.invalidationPrice ?? 0;
  const target = event.outcomeMetrics?.firstTargetPrice ?? 0;
  return {
    id: event.id,
    symbol: displaySymbol(event.symbol),
    hue: symbolHue(event.symbol),
    side: event.direction === "short" ? "空" : "多",
    appearedAt: dateTimeLabel(event.createdAt),
    triggerPrice: trigger,
    stopPrice: stop,
    targetPrice: target,
    verifyWindowH: event.outcomeMetrics?.validationWindowHours ?? 24,
    hitTpFirst: event.firstTargetHit === true || event.result === "win",
    hitSlFirst: event.invalidationHit === true || event.result === "loss",
    timedOut: event.outcomeStatus === "expired",
    mfe: round(event.outcomeMetrics?.mfePercent ?? 0, 2),
    mae: round(event.outcomeMetrics?.maePercent ?? 0, 2),
  };
}

function strategyArchetypeFromStage(stage: BusinessCapabilityStage): StrategyArchetype {
  return {
    key: capabilityKey(stage.id),
    name: stage.title,
    winRate: Math.max(0, Math.min(100, stage.score)),
    avgRR: round(Math.max(1, stage.score / 30), 2),
    samples: Math.max(1, stage.evidence.length),
    commonFailure: stage.nextAction,
  };
}

export function buildFrontendReviewContract({
  backend,
  snapshot,
  now = new Date(),
}: {
  backend: BackendContract;
  snapshot: MarketRadarSnapshot;
  now?: Date;
}): ReviewContract {
  const ageSec = diffSeconds(backend.generatedAt, now);
  const lifecycleEvents = snapshot.journalEvents.filter((event) => event.outcomeMetrics || event.riskReward);
  const archetypeStages = backend.analysis.businessCapability.stages.length > 0
    ? backend.analysis.businessCapability.stages
    : [{
      id: "strategy_family_stats",
      title: "策略分型统计",
      status: "collecting",
      score: 45,
      summary: "等待样本",
      evidence: [],
      nextAction: "继续积累复盘样本。",
      guardrail: "不自动改权重",
    } as BusinessCapabilityStage];
  const suggestions = backend.analysis.businessCapability.nextActions.length > 0
    ? backend.analysis.businessCapability.nextActions
    : backend.analysis.businessCapability.gaps;

  return {
    signalLifecycles: resource(
      lifecycleEvents.map(lifecycleFromJournal),
      lifecycleEvents.length > 0 ? "live" : "empty",
      { ageSec, source: "signal-worker" },
    ),
    strategyArchetypes: resource(
      archetypeStages.map(strategyArchetypeFromStage),
      "live",
      { ageSec, source: "signal-worker" },
    ),
    missedDetections: resource(
      snapshot.journalEvents
        .filter((event) => event.result === "saved" || event.action === "trend_radar_review")
        .slice(0, 20)
        .map((event) => ({
          symbol: displaySymbol(event.symbol),
          hue: symbolHue(event.symbol),
          move: round(event.outcomeMetrics?.mfePercent ?? 0, 2),
          side: (event.direction === "short" ? "跌" : "涨") as "涨" | "跌",
          reason: "证据不足" as const,
          detail: event.note,
          improvement: event.lessons?.[0] ?? "进入漏判复查队列，等待更多样本确认。",
        })),
      "partial",
      {
        ageSec,
        source: "signal-worker",
        reason: "漏判归因需要更多 outcome 样本，当前仅展示已写入复盘的记录。",
      },
    ),
    evolutionSuggestions: resource(
      suggestions.slice(0, 8).map((item, index) => ({
        title: item,
        rationale: backend.analysis.businessCapability.gaps[index] ?? backend.analysis.businessCapability.operatorHint,
        impact: index === 0 ? "高" : index < 3 ? "中" : "低",
        adopted: false,
      })),
      suggestions.length > 0 ? "live" : "empty",
      { ageSec, source: "signal-worker" },
    ),
  };
}
