import type {
  AssetExchangeCoverage,
  ContractInstrument,
  ExchangeCoverageSummary,
  ExchangeId,
  InstrumentRejectionReason,
  ScanCoverage,
  ScanDynamicPriorityPlan,
  ScanPriorityCandidate,
  ScanPriorityCandidateStatus,
  ScanPriorityDecision,
  ScanPriorityReason,
  ScanRotationAudit,
  ScanRotationAuditWarning,
  ScanTwoStageAllocationPlan,
  ScanTwoStageSlot,
  ScanTwoStageSlotKind,
  ScanTierCounts,
  ScanTierKey,
  ScanTierPolicy,
  VenueCoverageQuality,
} from "./types";
import { isCryptoFuturesUnderlying } from "./asset-class-filter";
import { scanWindowCursor } from "./scan-batch-queue";

export type UniverseAssetKey = {
  baseAsset: string;
  quoteAsset: "USDT";
  symbol: string;
};

export type UniverseAssetSource = "anchor" | "configured" | "observed";
export type UniverseAssetTier = ScanTierKey;

export type UniverseTierCounts = ScanTierCounts;

export type UniverseTierPolicy = ScanTierPolicy;

export type UniversePriorityHint = {
  anomalyScore?: number;
  baseAsset?: string;
  consecutiveSkipped?: number;
  deepScanCount1h?: number;
  deepScanCount24h?: number;
  earlyOpportunityScore?: number;
  overextensionRiskScore?: number;
  recentDeepScanPenalty?: number;
  recentSignalCount?: number;
  rotationAgeBoost?: number;
  rotationPriorityScore?: number;
  symbol?: string;
  wasDisplacedByDynamicPriority?: boolean;
};

export type UniversePriorityReason = ScanPriorityReason;

export type UniversePriorityDecision = ScanPriorityDecision;

export type UniverseDynamicPriorityPlan = ScanDynamicPriorityPlan;

export type PlanUniverseScanOptions = {
  dynamicPrioritySlots?: number;
  priorityHints?: UniversePriorityHint[];
};

export type UniverseAsset = UniverseAssetKey & {
  exchanges: ContractInstrument["exchange"][];
  isAnchor: boolean;
  lastSeenAt?: string;
  priority: number;
  sources: UniverseAssetSource[];
  tier: UniverseAssetTier;
  venueCoverage: VenueCoverageQuality;
  volume24hUsd: number;
};

export type SkippedUniverseAsset = {
  reason: InstrumentRejectionReason;
  symbol: string;
};

export type UniverseRegistry = {
  assets: UniverseAsset[];
  skipped: SkippedUniverseAsset[];
  summary: {
    anchors: number;
    active: number;
    configured: number;
    core: number;
    longTail: number;
    majorThree: number;
    multiExchange: number;
    observed: number;
    singleExchange: number;
    skipped: number;
    total: number;
    unlisted: number;
  };
};

export type UniverseScanPlan = {
  allAssets: string[];
  anchorAssets: string[];
  assets: string[];
  batchIndex: number;
  batchSize: number;
  dynamicPriority: UniverseDynamicPriorityPlan;
  nextBatchIndex: number;
  pendingAssets: string[];
  requestsPlanned: number;
  rotatingAssets: string[];
  rotationAudit: ScanRotationAudit;
  selectedTierCounts: UniverseTierCounts;
  tierCounts: UniverseTierCounts;
  tierPolicy: UniverseTierPolicy;
  twoStageAllocation: ScanTwoStageAllocationPlan;
  totalBatches: number;
};

const anchorAssets = ["BTC", "ETH"] as const;
const coreLiquidityFloorUsd = 100_000_000;
const activeLiquidityFloorUsd = 20_000_000;
const defaultTierPolicy: UniverseTierPolicy = {
  activeEveryWindows: 3,
  longTailEveryWindows: 4,
};
const majorDiscoveryExchanges: ExchangeId[] = ["BINANCE", "OKX", "BYBIT"];

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function emptyTierCounts(): UniverseTierCounts {
  return {
    anchor: 0,
    core: 0,
    active: 0,
    long_tail: 0,
  };
}

function countAssetTiers(assets: UniverseAsset[]): UniverseTierCounts {
  const counts = emptyTierCounts();

  for (const asset of assets) {
    counts[asset.tier] += 1;
  }

  return counts;
}

function clampNumber(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number | undefined) {
  const normalized = typeof value === "number" && value > 0 && value <= 1
    ? value * 100
    : value;

  return clampNumber(normalized, 0, 100);
}

function emptyExchangeCoverageSummary(): ExchangeCoverageSummary {
  return {
    majorThree: 0,
    multiExchange: 0,
    singleExchange: 0,
    unlisted: 0,
  };
}

function venueCoverageFor(exchanges: ContractInstrument["exchange"][]): VenueCoverageQuality {
  const listedExchanges = exchanges.filter((exchange) => exchange !== "UNKNOWN");
  const listedExchangeSet = new Set<ExchangeId>(listedExchanges);

  if (listedExchanges.length === 0) {
    return "unlisted";
  }

  if (majorDiscoveryExchanges.every((exchange) => listedExchangeSet.has(exchange))) {
    return "major_three";
  }

  if (listedExchanges.length >= 2) {
    return "multi_exchange";
  }

  return "single_exchange";
}

function exchangeCoverageSummary(assets: UniverseAsset[]): ExchangeCoverageSummary {
  const summary = emptyExchangeCoverageSummary();

  for (const asset of assets) {
    if (asset.venueCoverage === "major_three") {
      summary.majorThree += 1;
    } else if (asset.venueCoverage === "multi_exchange") {
      summary.multiExchange += 1;
    } else if (asset.venueCoverage === "single_exchange") {
      summary.singleExchange += 1;
    } else {
      summary.unlisted += 1;
    }
  }

  return summary;
}

function buildAssetExchangeCoverage(asset: UniverseAsset): AssetExchangeCoverage {
  const exchanges = asset.exchanges.filter((exchange) => exchange !== "UNKNOWN");

  return {
    baseAsset: asset.baseAsset,
    exchangeCount: exchanges.length,
    exchanges,
    symbol: asset.symbol,
    venueCoverage: asset.venueCoverage,
  };
}

function tierForAsset(asset: {
  isAnchor: boolean;
  sources: UniverseAssetSource[];
  volume24hUsd: number;
}): UniverseAssetTier {
  if (asset.isAnchor) {
    return "anchor";
  }

  if (asset.sources.includes("configured") || asset.volume24hUsd >= coreLiquidityFloorUsd) {
    return "core";
  }

  if (asset.volume24hUsd >= activeLiquidityFloorUsd) {
    return "active";
  }

  return "long_tail";
}

function priorityFor(asset: {
  baseAsset: string;
  configuredIndex?: number;
  isAnchor: boolean;
  tier: UniverseAssetTier;
  volume24hUsd?: number;
}) {
  const anchorBoost = asset.isAnchor ? 1_000_000 : 0;
  const tierBoost = asset.tier === "core"
    ? 500_000
    : asset.tier === "active"
      ? 250_000
      : 0;
  const configuredBoost = asset.configuredIndex === undefined ? 0 : 1_000 - asset.configuredIndex;
  const liquidityBoost = Math.min(90_000, Math.round(Math.log10(Math.max(1, asset.volume24hUsd ?? 0)) * 10_000));

  return anchorBoost + tierBoost + configuredBoost + liquidityBoost;
}

export function normalizeUniverseAsset(value: string): UniverseAssetKey | null {
  const cleaned = value.trim().toUpperCase().replace("-", "/");

  if (!cleaned) {
    return null;
  }

  const baseAsset = cleaned
    .replace(/\/USDT$/u, "")
    .replace(/USDT$/u, "");

  if (!baseAsset || baseAsset === cleaned && cleaned.includes("/")) {
    return null;
  }

  if (!/^[A-Z0-9]{1,30}$/u.test(baseAsset)) {
    return null;
  }

  if (!isCryptoFuturesUnderlying(baseAsset)) {
    return null;
  }

  return {
    baseAsset,
    quoteAsset: "USDT",
    symbol: `${baseAsset}USDT`,
  };
}

function instrumentRejectionReason(instrument: ContractInstrument): InstrumentRejectionReason | null {
  if (!instrument.isActive) {
    return "inactive";
  }

  if (instrument.quoteAsset !== "USDT") {
    return "quote_not_supported";
  }

  if (!isCryptoFuturesUnderlying(instrument.baseAsset)) {
    return "quote_not_supported";
  }

  if (instrument.marketType !== "perpetual") {
    return "market_type_not_supported";
  }

  return null;
}

function addOrMergeAsset(
  assets: Map<string, UniverseAsset>,
  key: UniverseAssetKey,
  update: {
    configuredIndex?: number;
    exchange?: ContractInstrument["exchange"];
    lastSeenAt?: string;
    source: UniverseAssetSource;
    volume24hUsd?: number;
  },
) {
  const isAnchor = anchorAssets.includes(key.baseAsset as typeof anchorAssets[number]);
  const current = assets.get(key.symbol);
  const volume24hUsd = Math.max(current?.volume24hUsd ?? 0, update.volume24hUsd ?? 0);
  const sources = uniqueValues([...(current?.sources ?? []), update.source]);
  const exchanges = uniqueValues([
    ...(current?.exchanges ?? []),
    ...(update.exchange ? [update.exchange] : []),
  ]);
  const venueCoverage = venueCoverageFor(exchanges);
  const tier = tierForAsset({
    isAnchor,
    sources,
    volume24hUsd,
  });

  assets.set(key.symbol, {
    ...key,
    exchanges,
    isAnchor,
    lastSeenAt: update.lastSeenAt ?? current?.lastSeenAt,
    priority: Math.max(
      current?.priority ?? 0,
      priorityFor({
        baseAsset: key.baseAsset,
        configuredIndex: update.configuredIndex,
        isAnchor,
        tier,
        volume24hUsd,
      }),
    ),
    sources,
    tier,
    venueCoverage,
    volume24hUsd,
  });
}

export function buildUniverseRegistry(
  configuredAssets: string[] = [],
  observedInstruments: ContractInstrument[] = [],
): UniverseRegistry {
  const assets = new Map<string, UniverseAsset>();
  const skipped: SkippedUniverseAsset[] = [];

  anchorAssets.forEach((asset) => {
    const key = normalizeUniverseAsset(asset);

    if (key) {
      addOrMergeAsset(assets, key, { source: "anchor" });
    }
  });

  configuredAssets.forEach((asset, index) => {
    const key = normalizeUniverseAsset(asset);

    if (key) {
      addOrMergeAsset(assets, key, { configuredIndex: index, source: "configured" });
    }
  });

  for (const instrument of observedInstruments) {
    if (!isCryptoFuturesUnderlying(instrument.baseAsset) || !isCryptoFuturesUnderlying(instrument.symbol)) {
      continue;
    }

    const rejectionReason = instrumentRejectionReason(instrument);

    if (rejectionReason) {
      skipped.push({
        reason: rejectionReason,
        symbol: instrument.symbol,
      });
      continue;
    }

    const key = normalizeUniverseAsset(instrument.symbol);

    if (key) {
      addOrMergeAsset(assets, key, {
        exchange: instrument.exchange,
        lastSeenAt: instrument.lastSeenAt,
        source: "observed",
        volume24hUsd: instrument.volume24hUsd,
      });
    }
  }

  const sortedAssets = [...assets.values()].sort((left, right) =>
    right.priority - left.priority || left.symbol.localeCompare(right.symbol)
  );
  const tierCounts = countAssetTiers(sortedAssets);
  const exchangeSummary = exchangeCoverageSummary(sortedAssets);

  return {
    assets: sortedAssets,
    skipped,
    summary: {
      anchors: sortedAssets.filter((asset) => asset.isAnchor).length,
      active: tierCounts.active,
      configured: sortedAssets.filter((asset) => asset.sources.includes("configured")).length,
      core: tierCounts.core,
      longTail: tierCounts.long_tail,
      majorThree: exchangeSummary.majorThree,
      multiExchange: exchangeSummary.multiExchange,
      observed: sortedAssets.filter((asset) => asset.sources.includes("observed")).length,
      singleExchange: exchangeSummary.singleExchange,
      skipped: skipped.length,
      total: sortedAssets.length + skipped.length,
      unlisted: exchangeSummary.unlisted,
    },
  };
}

function groupedRotatingAssets(assets: UniverseAsset[]) {
  return {
    core: assets.filter((asset) => asset.tier === "core"),
    active: assets.filter((asset) => asset.tier === "active"),
    long_tail: assets.filter((asset) => asset.tier === "long_tail"),
  };
}

function preferredTiersForSlot(
  slotCursor: number,
  groups: ReturnType<typeof groupedRotatingAssets>,
  policy: UniverseTierPolicy,
): UniverseAssetTier[] {
  const hasHigherPriorityLane = groups.core.length > 0 || groups.active.length > 0;

  if (
    groups.long_tail.length > 0 &&
    hasHigherPriorityLane &&
    (slotCursor + 1) % policy.longTailEveryWindows === 0
  ) {
    return ["long_tail", "active", "core"];
  }

  if (
    groups.active.length > 0 &&
    groups.core.length > 0 &&
    (slotCursor + 1) % policy.activeEveryWindows === 0
  ) {
    return ["active", "core", "long_tail"];
  }

  return ["core", "active", "long_tail"];
}

function rotationDivisorForTier(
  tier: UniverseAssetTier,
  groups: ReturnType<typeof groupedRotatingAssets>,
  policy: UniverseTierPolicy,
) {
  if (tier === "active" && groups.core.length > 0) {
    return policy.activeEveryWindows;
  }

  if (tier === "long_tail" && (groups.core.length > 0 || groups.active.length > 0)) {
    return policy.longTailEveryWindows;
  }

  return 1;
}

function pickTierAsset(
  assets: UniverseAsset[],
  slotCursor: number,
  selectedSymbols: Set<string>,
  rotationDivisor: number,
) {
  if (assets.length === 0) {
    return null;
  }

  const start = Math.floor(slotCursor / Math.max(1, rotationDivisor)) % assets.length;

  for (let index = 0; index < assets.length; index += 1) {
    const candidate = assets[(start + index) % assets.length];

    if (!selectedSymbols.has(candidate.symbol)) {
      return candidate;
    }
  }

  return null;
}

function estimateTierCycleWindows(
  groups: ReturnType<typeof groupedRotatingAssets>,
  rotatingSlots: number,
  policy: UniverseTierPolicy,
) {
  const slots = Math.max(1, rotatingSlots);
  const hasCoreOrActive = groups.core.length > 0 || groups.active.length > 0;
  const coreCycle = groups.core.length
    ? Math.ceil(groups.core.length / slots)
    : 0;
  const activeCycle = groups.active.length
    ? Math.ceil(groups.active.length * (groups.core.length ? policy.activeEveryWindows : 1) / slots)
    : 0;
  const longTailCycle = groups.long_tail.length
    ? Math.ceil(groups.long_tail.length * (hasCoreOrActive ? policy.longTailEveryWindows : 1) / slots)
    : 0;

  return Math.max(1, coreCycle, activeCycle, longTailCycle);
}

type InternalPriorityDecision = UniversePriorityDecision & {
  asset: UniverseAsset;
};

const priorityReasons: UniversePriorityReason[] = [
  "anomaly",
  "early_opportunity",
  "liquidity",
  "overextended_move",
  "recent_signal",
  "recent_deep_scan",
  "rotation_age",
  "venue_coverage",
];

function hintKeys(hint: UniversePriorityHint) {
  return uniqueValues([
    hint.symbol ? normalizeUniverseAsset(hint.symbol)?.symbol : null,
    hint.baseAsset ? normalizeUniverseAsset(hint.baseAsset)?.symbol : null,
  ].filter((value): value is string => value !== null));
}

function buildPriorityHintMap(hints: UniversePriorityHint[] = []) {
  const map = new Map<string, UniversePriorityHint>();

  for (const hint of hints) {
    for (const key of hintKeys(hint)) {
      map.set(key, hint);
    }
  }

  return map;
}

function venueCoverageBoost(asset: UniverseAsset): number {
  if (asset.venueCoverage === "major_three") {
    return 80_000;
  }

  if (asset.venueCoverage === "multi_exchange") {
    return 40_000;
  }

  if (asset.venueCoverage === "single_exchange") {
    return 10_000;
  }

  return -15_000;
}

function dynamicPriorityDecision(
  asset: UniverseAsset,
  hint: UniversePriorityHint,
): InternalPriorityDecision {
  const reasons: UniversePriorityReason[] = [];
  const anomalyBoost = Math.round(clampPercent(hint.anomalyScore) * 5_000);
  const earlyOpportunityBoost = Math.round(clampPercent(hint.earlyOpportunityScore) * 6_500);
  const recentSignalBoost = Math.round(
    Math.min(5, clampNumber(hint.recentSignalCount, 0, 100)) * 30_000,
  );
  const rotationAgeBoost = Math.round(clampNumber(hint.rotationAgeBoost, 0, 2_000_000));
  const overextensionPenalty = Math.round(clampPercent(hint.overextensionRiskScore) * 4_000);
  const recentDeepScanPenalty = Math.round(clampNumber(hint.recentDeepScanPenalty, 0, 2_000_000));
  const liquidityBoost = asset.volume24hUsd > 0
    ? Math.min(60_000, Math.round(Math.log10(asset.volume24hUsd) * 6_000))
    : 0;
  const coverageBoost = venueCoverageBoost(asset);

  if (anomalyBoost !== 0) {
    reasons.push("anomaly");
  }

  if (earlyOpportunityBoost !== 0) {
    reasons.push("early_opportunity");
  }

  if (overextensionPenalty !== 0) {
    reasons.push("overextended_move");
  }

  if (recentSignalBoost !== 0) {
    reasons.push("recent_signal");
  }

  if (recentDeepScanPenalty !== 0) {
    reasons.push("recent_deep_scan");
  }

  if (rotationAgeBoost !== 0) {
    reasons.push("rotation_age");
  }

  if (liquidityBoost !== 0) {
    reasons.push("liquidity");
  }

  if (coverageBoost !== 0) {
    reasons.push("venue_coverage");
  }

  const dynamicBoost = anomalyBoost + earlyOpportunityBoost +
    recentSignalBoost + rotationAgeBoost + liquidityBoost + coverageBoost -
    overextensionPenalty - recentDeepScanPenalty;

  return {
    asset,
    baseAsset: asset.baseAsset,
    dynamicBoost,
    reasons,
    score: asset.priority + dynamicBoost,
    staticPriority: asset.priority,
    symbol: asset.symbol,
  };
}

function buildDynamicPriorityDecisions(
  assets: UniverseAsset[],
  hints: UniversePriorityHint[] = [],
) {
  const hintsBySymbol = buildPriorityHintMap(hints);

  return assets
    .map((asset) => {
      const hint = hintsBySymbol.get(asset.symbol);

      return hint ? dynamicPriorityDecision(asset, hint) : null;
    })
    .filter((item): item is InternalPriorityDecision => item !== null)
    .sort((left, right) =>
      right.score - left.score ||
      right.dynamicBoost - left.dynamicBoost ||
      left.symbol.localeCompare(right.symbol)
    );
}

function pickDynamicPriorityAsset(
  decisions: InternalPriorityDecision[],
  selectedSymbols: Set<string>,
) {
  return decisions.find((decision) =>
    decision.dynamicBoost > 0 && !selectedSymbols.has(decision.symbol)
  )?.asset ?? null;
}

function pickLongTailExplorationAsset(
  groups: ReturnType<typeof groupedRotatingAssets>,
  slotCursor: number,
  selectedSymbols: Set<string>,
  dynamicPrioritySymbols: Set<string>,
) {
  const coldExplorationAssets = groups.long_tail.filter((asset) => !dynamicPrioritySymbols.has(asset.symbol));
  const coldCandidate = pickTierAsset(
    coldExplorationAssets,
    slotCursor,
    selectedSymbols,
    defaultTierPolicy.longTailEveryWindows,
  );

  return coldCandidate ??
    pickTierAsset(groups.long_tail, slotCursor, selectedSymbols, defaultTierPolicy.longTailEveryWindows);
}

function publicPriorityDecision(decision: InternalPriorityDecision): UniversePriorityDecision {
  return {
    baseAsset: decision.baseAsset,
    dynamicBoost: decision.dynamicBoost,
    reasons: decision.reasons,
    score: decision.score,
    staticPriority: decision.staticPriority,
    symbol: decision.symbol,
  };
}

function emptyPriorityReasonCounts(): Record<UniversePriorityReason, number> {
  return Object.fromEntries(
    priorityReasons.map((reason) => [reason, 0]),
  ) as Record<UniversePriorityReason, number>;
}

function buildPriorityReasonCounts(
  decisions: InternalPriorityDecision[],
): Record<UniversePriorityReason, number> {
  const counts = emptyPriorityReasonCounts();

  for (const decision of decisions) {
    for (const reason of decision.reasons) {
      counts[reason] += 1;
    }
  }

  return counts;
}

function priorityCandidateStatus(
  decision: InternalPriorityDecision,
  selectedSymbols: Set<string>,
  boostedAssets: string[],
): ScanPriorityCandidateStatus {
  if (boostedAssets.includes(decision.baseAsset)) {
    return "selected";
  }

  if (selectedSymbols.has(decision.symbol)) {
    return "already_selected";
  }

  return "queued";
}

function priorityCandidateStatusReason(status: ScanPriorityCandidateStatus) {
  if (status === "selected") {
    return "本轮占用高优先级槽位";
  }

  if (status === "already_selected") {
    return "本轮已被层级轮转选中";
  }

  return "等待后续批次或高优先级槽位";
}

function buildPriorityCandidates(
  decisions: InternalPriorityDecision[],
  selectedSymbols: Set<string>,
  boostedAssets: string[],
): ScanPriorityCandidate[] {
  return decisions.slice(0, 8).map((decision) => {
    const status = priorityCandidateStatus(decision, selectedSymbols, boostedAssets);

    return {
      ...publicPriorityDecision(decision),
      status,
      statusReason: priorityCandidateStatusReason(status),
    };
  });
}

function twoStageSlotKind(
  asset: UniverseAsset,
  source: ScanTwoStageSlot["source"],
): ScanTwoStageSlotKind {
  if (source === "anchor") {
    return "anchor_context";
  }

  if (source === "dynamic_priority") {
    return "hot_priority";
  }

  if (source === "exploration_reserve" || asset.tier === "long_tail") {
    return "long_tail_exploration";
  }

  return asset.tier === "core" ? "core_rotation" : "active_rotation";
}

function twoStageReason(kind: ScanTwoStageSlotKind) {
  return {
    active_rotation: "主动轮转活跃层，防止只看已熟悉币种。",
    anchor_context: "BTC/ETH 锚点用于大盘环境，不参与山寨筛选名额竞争。",
    core_rotation: "核心流动性层常规轮转。",
    hot_priority: "来自 public light scan / repository hints 的高优先级异动。",
    long_tail_exploration: "冷门探索保底，避免前置漏斗过死。",
  }[kind];
}

function buildTwoStageSlot({
  asset,
  decision,
  slotIndex,
  source,
}: {
  asset: UniverseAsset;
  decision?: InternalPriorityDecision;
  slotIndex: number;
  source: ScanTwoStageSlot["source"];
}): ScanTwoStageSlot {
  const priorityReasons = decision?.reasons ?? [];
  const kind = twoStageSlotKind(asset, source);

  return {
    baseAsset: asset.baseAsset,
    kind,
    priorityReasons,
    reason: twoStageReason(kind),
    slotIndex,
    source,
    symbol: asset.symbol,
    tier: asset.tier,
    venueCoverage: asset.venueCoverage,
  };
}

function buildTwoStageAllocation({
  dynamicPriorityDecisions,
  pinnedAnchorRecords,
  selectedRotatingAssets,
  selectedSymbols,
  selectedSources,
  universeAssets,
}: {
  dynamicPriorityDecisions: InternalPriorityDecision[];
  pinnedAnchorRecords: UniverseAsset[];
  selectedRotatingAssets: UniverseAsset[];
  selectedSymbols: Set<string>;
  selectedSources: Map<string, ScanTwoStageSlot["source"]>;
  universeAssets: number;
}): ScanTwoStageAllocationPlan {
  const decisionsBySymbol = new Map(dynamicPriorityDecisions.map((decision) => [decision.symbol, decision]));
  const slots = [
    ...pinnedAnchorRecords.map((asset, index) => buildTwoStageSlot({
      asset,
      slotIndex: index,
      source: "anchor",
    })),
    ...selectedRotatingAssets.map((asset, index) => buildTwoStageSlot({
      asset,
      decision: decisionsBySymbol.get(asset.symbol),
      slotIndex: pinnedAnchorRecords.length + index,
      source: selectedSources.get(asset.symbol) ?? "tier_rotation",
    })),
  ];
  const selectedAssets = slots.map((slot) => slot.baseAsset);
  const queuedPriorityAssets = dynamicPriorityDecisions
    .filter((decision) => decision.dynamicBoost > 0 && !selectedSymbols.has(decision.symbol))
    .map((decision) => decision.baseAsset)
    .slice(0, 12);

  return {
    guardrail: "二段深扫只分配本轮 CoinGlass 名额；未进入深扫不代表淘汰，资产继续留在轮转、复活观察或冷门探索池。",
    mode: "two_stage_deep_scan_v1",
    slots,
    stageOne: {
      priorityCandidates: dynamicPriorityDecisions.length,
      priorityQueued: queuedPriorityAssets.length,
      source: "public_light_scan_and_repository_hints",
      universeAssets,
    },
    stageTwo: {
      anchorSlots: pinnedAnchorRecords.length,
      capacity: slots.length,
      explorationSlots: slots.filter((slot) => slot.kind === "long_tail_exploration").length,
      prioritySlots: slots.filter((slot) => slot.source === "dynamic_priority").length,
      queuedPriorityAssets,
      rotationSlots: slots.filter((slot) => slot.source === "tier_rotation").length,
      selectedAssets,
    },
  };
}

function rotationAuditStatus(warnings: ScanRotationAuditWarning[]): ScanRotationAudit["status"] {
  if (warnings.some((warning) => warning.id === "deep_scan_starved")) {
    return "blocked";
  }

  if (warnings.some((warning) => warning.severity === "high")) {
    return "starved";
  }

  if (warnings.length > 0) {
    return "watch";
  }

  return "healthy";
}

function rotationAuditOperatorHint(status: ScanRotationAudit["status"]) {
  if (status === "blocked") {
    return "当前没有山寨轮转深扫槽，必须先提高 batch size 或降低锚点占用，否则全市场山寨雷达会失真。";
  }

  if (status === "starved") {
    return "轮转存在明显饥饿风险，优先保留长尾探索和常规轮转，不允许热门候选长期吃光名额。";
  }

  if (status === "watch") {
    return "轮转可用但有排队或周期偏长风险，前端必须展示排队资产和完整轮转周期。";
  }

  return "轮转健康：锚点、动态优先级、常规轮转和冷门探索都有明确边界。";
}

function buildScanRotationAudit({
  dynamicPriorityDecisions,
  dynamicPrioritySlots,
  explorationReserveSlots,
  groups,
  pinnedAnchors,
  rotatingSlots,
  selectedRotatingAssets,
  selectedSources,
  totalBatches,
  twoStageAllocation,
}: {
  dynamicPriorityDecisions: InternalPriorityDecision[];
  dynamicPrioritySlots: number;
  explorationReserveSlots: number;
  groups: ReturnType<typeof groupedRotatingAssets>;
  pinnedAnchors: string[];
  rotatingSlots: number;
  selectedRotatingAssets: UniverseAsset[];
  selectedSources: Map<string, ScanTwoStageSlot["source"]>;
  totalBatches: number;
  twoStageAllocation: ScanTwoStageAllocationPlan;
}): ScanRotationAudit {
  const warnings: ScanRotationAuditWarning[] = [];
  const selectedLongTailAssets = selectedRotatingAssets
    .filter((asset) => asset.tier === "long_tail")
    .map((asset) => asset.baseAsset);
  const selectedPriorityAssets = selectedRotatingAssets
    .filter((asset) => selectedSources.get(asset.symbol) === "dynamic_priority")
    .map((asset) => asset.baseAsset);
  const pendingNonAnchorAssets = Math.max(
    0,
    groups.core.length + groups.active.length + groups.long_tail.length - selectedRotatingAssets.length,
  );
  const estimatedFullCycleMinutes = totalBatches * 15;

  if (rotatingSlots === 0 && pendingNonAnchorAssets > 0) {
    warnings.push({
      action: "提高 COINGLASS_BATCH_SIZE，至少保留 1 个山寨深扫位。",
      detail: "BTC/ETH 锚点已经占满本轮深扫容量，山寨币无法进入 CoinGlass 深扫。",
      id: "deep_scan_starved",
      severity: "high",
    });
  }

  if (rotatingSlots === 1 && dynamicPriorityDecisions.length > 0) {
    warnings.push({
      action: "保持唯一山寨槽位给常规轮转，高优先级候选排队展示，不能抢占唯一轮转位。",
      detail: "本轮只有 1 个山寨深扫位，同时存在高优先级候选。",
      id: "single_rotation_slot",
      severity: "medium",
    });
  }

  if (groups.long_tail.length > 0 && rotatingSlots >= 3 && selectedLongTailAssets.length === 0) {
    warnings.push({
      action: "保留至少 1 个长尾探索位，避免新币和冷门币永远进不了深扫。",
      detail: "本轮具备长尾探索条件，但没有任何长尾资产被选入。",
      id: "exploration_missing",
      severity: "high",
    });
  }

  if (twoStageAllocation.stageTwo.queuedPriorityAssets.length > 0) {
    warnings.push({
      action: "前端展示 queuedPriorityAssets，并在后续批次继续轮转，不要静默隐藏。",
      detail: `${twoStageAllocation.stageTwo.queuedPriorityAssets.length} 个高优先级标的仍在排队。`,
      id: "priority_queue_waiting",
      severity: "low",
    });
  }

  if (estimatedFullCycleMinutes > 6 * 60) {
    warnings.push({
      action: "继续使用轻扫覆盖全市场；CoinGlass 深扫只给候选池，并在前端展示完整周期。",
      detail: `当前预计完整深扫轮转约 ${estimatedFullCycleMinutes} 分钟。`,
      id: "full_cycle_slow",
      severity: "medium",
    });
  }

  const status = rotationAuditStatus(warnings);

  return {
    fairnessRules: [
      "BTC/ETH 是大盘锚点，不和山寨轮转名额混算。",
      "动态优先级只能占用部分非锚点名额，不能长期吃光常规轮转。",
      "当非锚点名额足够时，必须保留长尾探索入口。",
      "未进入本轮深扫只代表排队或低频轮转，不代表淘汰。",
    ],
    guardrail: "轮转审计只解释扫描分配健康度，不增加请求、不生成交易计划、不绕过 Evidence/Risk Gate。",
    mode: "scan_rotation_audit_v1",
    operatorHint: rotationAuditOperatorHint(status),
    priorityQueue: {
      queuedAssets: twoStageAllocation.stageTwo.queuedPriorityAssets,
      queuedCount: twoStageAllocation.stageOne.priorityQueued,
      selectedPriorityAssets,
    },
    slots: {
      anchorSlots: pinnedAnchors.length,
      dynamicPrioritySlots,
      explorationReserveSlots,
      rotatingSlots,
      selectedLongTailAssets,
      selectedNonAnchorAssets: selectedRotatingAssets.map((asset) => asset.baseAsset),
    },
    status,
    timing: {
      cadenceMinutes: 15,
      estimatedFullCycleMinutes,
      estimatedFullCycleWindows: totalBatches,
      pendingNonAnchorAssets,
    },
    warnings,
  };
}

export function planUniverseScan(
  registry: UniverseRegistry,
  batchSize: number,
  now: Date,
  options: PlanUniverseScanOptions = {},
): UniverseScanPlan {
  const sortedAssets = registry.assets;
  const hasRotatingAssets = sortedAssets.some((asset) => !asset.isAnchor);
  const minimumBatchSize = anchorAssets.length + (hasRotatingAssets ? 1 : 0);
  const safeBatchSize = Math.max(minimumBatchSize, Math.floor(batchSize || minimumBatchSize));
  const pinnedAnchors = sortedAssets
    .filter((asset) => asset.isAnchor)
    .slice(0, safeBatchSize)
    .map((asset) => asset.baseAsset);
  const pinnedAnchorRecords = sortedAssets
    .filter((asset) => pinnedAnchors.includes(asset.baseAsset));
  const rotatingAssets = sortedAssets
    .filter((asset) => !asset.isAnchor)
    .map((asset) => asset.baseAsset);
  const rotatingSlots = Math.max(0, safeBatchSize - pinnedAnchors.length);
  const rotatingAssetRecords = sortedAssets.filter((asset) => !asset.isAnchor);
  const groups = groupedRotatingAssets(rotatingAssetRecords);
  const tierCounts = countAssetTiers(sortedAssets);
  const totalBatches = rotatingSlots > 0
    ? estimateTierCycleWindows(groups, rotatingSlots, defaultTierPolicy)
    : 1;
  const cursor = scanWindowCursor(now, 15);
  const batchIndex = cursor % totalBatches;
  const selectedSymbols = new Set(
    pinnedAnchors.map((asset) => `${asset}USDT`),
  );
  const selectedRotatingAssets: UniverseAsset[] = [];
  const dynamicPriorityDecisions = buildDynamicPriorityDecisions(
    rotatingAssetRecords,
    options.priorityHints,
  );
  const dynamicPrioritySymbols = new Set(dynamicPriorityDecisions.map((decision) => decision.symbol));
  const explorationReserveSlots = groups.long_tail.length > 0 && rotatingSlots >= 3 ? 1 : 0;
  const defaultDynamicSlots = dynamicPriorityDecisions.length > 0 && rotatingSlots > 1
    ? Math.max(1, Math.floor(Math.max(0, rotatingSlots - explorationReserveSlots) / 2))
    : 0;
  const dynamicPrioritySlots = Math.min(
    Math.max(0, rotatingSlots - explorationReserveSlots),
    Math.max(0, Math.floor(options.dynamicPrioritySlots ?? defaultDynamicSlots)),
  );
  const boostedAssets: string[] = [];
  const selectedSources = new Map<string, ScanTwoStageSlot["source"]>();

  for (let slot = 0; slot < rotatingSlots; slot += 1) {
    const slotCursor = cursor * rotatingSlots + slot;
    const isExplorationReserveSlot = explorationReserveSlots > 0 && slot >= rotatingSlots - explorationReserveSlots;

    if (isExplorationReserveSlot) {
      const explorationCandidate = pickLongTailExplorationAsset(
        groups,
        slotCursor,
        selectedSymbols,
        dynamicPrioritySymbols,
      );

      if (explorationCandidate) {
        selectedRotatingAssets.push(explorationCandidate);
        selectedSymbols.add(explorationCandidate.symbol);
        selectedSources.set(explorationCandidate.symbol, "exploration_reserve");
        continue;
      }
    }

    if (slot < dynamicPrioritySlots) {
      const dynamicCandidate = isExplorationReserveSlot
        ? null
        : pickDynamicPriorityAsset(dynamicPriorityDecisions, selectedSymbols);

      if (dynamicCandidate) {
        selectedRotatingAssets.push(dynamicCandidate);
        selectedSymbols.add(dynamicCandidate.symbol);
        selectedSources.set(dynamicCandidate.symbol, "dynamic_priority");
        boostedAssets.push(dynamicCandidate.baseAsset);
        continue;
      }
    }

    const preferredTiers = preferredTiersForSlot(slotCursor, groups, defaultTierPolicy);

    for (const tier of preferredTiers) {
      const tierAssets = groups[tier as keyof typeof groups] ?? [];
      const candidate = pickTierAsset(
        tierAssets,
        slotCursor,
        selectedSymbols,
        rotationDivisorForTier(tier, groups, defaultTierPolicy),
      );

      if (candidate) {
        selectedRotatingAssets.push(candidate);
        selectedSymbols.add(candidate.symbol);
        selectedSources.set(candidate.symbol, "tier_rotation");
        break;
      }
    }
  }

  const selectedRotatingBaseAssets = selectedRotatingAssets.map((asset) => asset.baseAsset);
  const assets = uniqueValues([...pinnedAnchors, ...selectedRotatingBaseAssets]);
  const pendingAssets = sortedAssets
    .map((asset) => asset.baseAsset)
    .filter((asset) => !assets.includes(asset));
  const selectedAssetRecords = sortedAssets.filter((asset) => assets.includes(asset.baseAsset));
  const twoStageAllocation = buildTwoStageAllocation({
    dynamicPriorityDecisions,
    pinnedAnchorRecords,
    selectedRotatingAssets,
    selectedSources,
    selectedSymbols,
    universeAssets: sortedAssets.length,
  });
  const rotationAudit = buildScanRotationAudit({
    dynamicPriorityDecisions,
    dynamicPrioritySlots,
    explorationReserveSlots,
    groups,
    pinnedAnchors,
    rotatingSlots,
    selectedRotatingAssets,
    selectedSources,
    totalBatches,
    twoStageAllocation,
  });

  return {
    allAssets: sortedAssets.map((asset) => asset.baseAsset),
    anchorAssets: pinnedAnchors,
    assets,
    batchIndex,
    batchSize: safeBatchSize,
    dynamicPriority: {
      boostedAssets,
      candidateCount: dynamicPriorityDecisions.length,
      candidates: buildPriorityCandidates(
        dynamicPriorityDecisions,
        selectedSymbols,
        boostedAssets,
      ),
      enabled: dynamicPriorityDecisions.length > 0,
      reasonCounts: buildPriorityReasonCounts(dynamicPriorityDecisions),
      slotsAvailable: dynamicPrioritySlots,
      slotsUsed: boostedAssets.length,
      topAssets: dynamicPriorityDecisions.slice(0, 8).map(publicPriorityDecision),
    },
    nextBatchIndex: (batchIndex + 1) % totalBatches,
    pendingAssets,
    requestsPlanned: assets.length,
    rotatingAssets,
    rotationAudit,
    selectedTierCounts: countAssetTiers(selectedAssetRecords),
    tierCounts,
    tierPolicy: defaultTierPolicy,
    twoStageAllocation,
    totalBatches,
  };
}

export function buildCoverageReport(
  registry: UniverseRegistry,
  batchPlan: UniverseScanPlan,
): ScanCoverage {
  const eligible = registry.assets.length;
  const exchangeCoverage = registry.assets.map((asset) => buildAssetExchangeCoverage(asset));

  return {
    batchIndex: batchPlan.batchIndex,
    coveragePercent: eligible
      ? Math.round((batchPlan.assets.length / eligible) * 100)
      : 0,
    dynamicPriority: batchPlan.dynamicPriority,
    eligible,
    exchangeCoverage,
    exchangeCoverageSummary: exchangeCoverageSummary(registry.assets),
    nextBatchIndex: batchPlan.nextBatchIndex,
    pending: batchPlan.pendingAssets.length,
    pendingAssets: batchPlan.pendingAssets,
    rotationAudit: batchPlan.rotationAudit,
    scanned: batchPlan.assets.length,
    scannedAssets: batchPlan.assets,
    selectedTierCounts: batchPlan.selectedTierCounts,
    skipped: registry.skipped.length,
    skippedAssets: registry.skipped,
    tierCounts: batchPlan.tierCounts,
    tierPolicy: batchPlan.tierPolicy,
    twoStageAllocation: batchPlan.twoStageAllocation,
    total: eligible + registry.skipped.length,
    totalBatches: batchPlan.totalBatches,
  };
}
