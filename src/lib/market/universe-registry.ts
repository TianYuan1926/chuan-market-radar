import type {
  AssetExchangeCoverage,
  ContractInstrument,
  ExchangeCoverageSummary,
  ExchangeId,
  InstrumentRejectionReason,
  ScanCoverage,
  VenueCoverageQuality,
} from "./types";
import { scanWindowCursor } from "./scan-batch-queue";

export type UniverseAssetKey = {
  baseAsset: string;
  quoteAsset: "USDT";
  symbol: string;
};

export type UniverseAssetSource = "anchor" | "configured" | "observed";
export type UniverseAssetTier = "anchor" | "core" | "active" | "long_tail";

export type UniverseTierCounts = Record<UniverseAssetTier, number>;

export type UniverseTierPolicy = {
  activeEveryWindows: number;
  longTailEveryWindows: number;
};

export type UniversePriorityHint = {
  anomalyScore?: number;
  baseAsset?: string;
  historicalSampleSize?: number;
  historicalWinRate?: number;
  recentSignalCount?: number;
  symbol?: string;
};

export type UniversePriorityReason =
  | "anomaly"
  | "history"
  | "liquidity"
  | "recent_signal"
  | "venue_coverage";

export type UniversePriorityDecision = {
  baseAsset: string;
  dynamicBoost: number;
  reasons: UniversePriorityReason[];
  score: number;
  staticPriority: number;
  symbol: string;
};

export type UniverseDynamicPriorityPlan = {
  boostedAssets: string[];
  enabled: boolean;
  topAssets: UniversePriorityDecision[];
};

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
  selectedTierCounts: UniverseTierCounts;
  tierCounts: UniverseTierCounts;
  tierPolicy: UniverseTierPolicy;
  totalBatches: number;
};

const anchorAssets = ["BTC", "ETH"] as const;
const coreLiquidityFloorUsd = 100_000_000;
const activeLiquidityFloorUsd = 20_000_000;
const defaultTierPolicy: UniverseTierPolicy = {
  activeEveryWindows: 3,
  longTailEveryWindows: 8,
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

function clampRatio(value: number | undefined) {
  const normalized = typeof value === "number" && value > 1 && value <= 100
    ? value / 100
    : value;

  return clampNumber(normalized, 0, 1);
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
  const historicalSampleSize = clampNumber(hint.historicalSampleSize, 0, 100);
  const historicalConfidence = Math.min(1, historicalSampleSize / 20);
  const historicalBoost = Math.round(
    (clampRatio(hint.historicalWinRate) - 0.5) * 400_000 * historicalConfidence,
  );
  const recentSignalBoost = Math.round(
    Math.min(5, clampNumber(hint.recentSignalCount, 0, 100)) * 30_000,
  );
  const liquidityBoost = asset.volume24hUsd > 0
    ? Math.min(60_000, Math.round(Math.log10(asset.volume24hUsd) * 6_000))
    : 0;
  const coverageBoost = venueCoverageBoost(asset);

  if (anomalyBoost !== 0) {
    reasons.push("anomaly");
  }

  if (historicalSampleSize > 0) {
    reasons.push("history");
  }

  if (recentSignalBoost !== 0) {
    reasons.push("recent_signal");
  }

  if (liquidityBoost !== 0) {
    reasons.push("liquidity");
  }

  if (coverageBoost !== 0) {
    reasons.push("venue_coverage");
  }

  const dynamicBoost = anomalyBoost + historicalBoost + recentSignalBoost + liquidityBoost + coverageBoost;

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
  const defaultDynamicSlots = dynamicPriorityDecisions.length > 0
    ? Math.max(1, Math.floor(rotatingSlots / 2))
    : 0;
  const dynamicPrioritySlots = Math.min(
    rotatingSlots,
    Math.max(0, Math.floor(options.dynamicPrioritySlots ?? defaultDynamicSlots)),
  );
  const boostedAssets: string[] = [];

  for (let slot = 0; slot < rotatingSlots; slot += 1) {
    const slotCursor = cursor * rotatingSlots + slot;

    if (slot < dynamicPrioritySlots) {
      const dynamicCandidate = pickDynamicPriorityAsset(dynamicPriorityDecisions, selectedSymbols);

      if (dynamicCandidate) {
        selectedRotatingAssets.push(dynamicCandidate);
        selectedSymbols.add(dynamicCandidate.symbol);
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

  return {
    allAssets: sortedAssets.map((asset) => asset.baseAsset),
    anchorAssets: pinnedAnchors,
    assets,
    batchIndex,
    batchSize: safeBatchSize,
    dynamicPriority: {
      boostedAssets,
      enabled: dynamicPriorityDecisions.length > 0,
      topAssets: dynamicPriorityDecisions.slice(0, 8).map(publicPriorityDecision),
    },
    nextBatchIndex: (batchIndex + 1) % totalBatches,
    pendingAssets,
    requestsPlanned: assets.length,
    rotatingAssets,
    selectedTierCounts: countAssetTiers(selectedAssetRecords),
    tierCounts,
    tierPolicy: defaultTierPolicy,
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
    eligible,
    exchangeCoverage,
    exchangeCoverageSummary: exchangeCoverageSummary(registry.assets),
    nextBatchIndex: batchPlan.nextBatchIndex,
    pending: batchPlan.pendingAssets.length,
    pendingAssets: batchPlan.pendingAssets,
    scanned: batchPlan.assets.length,
    scannedAssets: batchPlan.assets,
    skipped: registry.skipped.length,
    skippedAssets: registry.skipped,
    total: eligible + registry.skipped.length,
    totalBatches: batchPlan.totalBatches,
  };
}
