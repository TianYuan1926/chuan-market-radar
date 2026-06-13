import type { ContractInstrument, InstrumentRejectionReason, ScanCoverage } from "./types";
import { scanWindowCursor } from "./scan-batch-queue";

export type UniverseAssetKey = {
  baseAsset: string;
  quoteAsset: "USDT";
  symbol: string;
};

export type UniverseAssetSource = "anchor" | "configured" | "observed";

export type UniverseAsset = UniverseAssetKey & {
  exchanges: ContractInstrument["exchange"][];
  isAnchor: boolean;
  lastSeenAt?: string;
  priority: number;
  sources: UniverseAssetSource[];
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
    configured: number;
    observed: number;
    skipped: number;
    total: number;
  };
};

export type UniverseScanPlan = {
  allAssets: string[];
  anchorAssets: string[];
  assets: string[];
  batchIndex: number;
  batchSize: number;
  nextBatchIndex: number;
  pendingAssets: string[];
  requestsPlanned: number;
  rotatingAssets: string[];
  totalBatches: number;
};

const anchorAssets = ["BTC", "ETH"] as const;

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function priorityFor(asset: {
  baseAsset: string;
  configuredIndex?: number;
  isAnchor: boolean;
  volume24hUsd?: number;
}) {
  const anchorBoost = asset.isAnchor ? 1_000_000 : 0;
  const configuredBoost = asset.configuredIndex === undefined ? 0 : 1_000 - asset.configuredIndex;
  const liquidityBoost = Math.min(90_000, Math.round(Math.log10(Math.max(1, asset.volume24hUsd ?? 0)) * 10_000));

  return anchorBoost + configuredBoost + liquidityBoost;
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
        volume24hUsd,
      }),
    ),
    sources,
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

  return {
    assets: sortedAssets,
    skipped,
    summary: {
      anchors: sortedAssets.filter((asset) => asset.isAnchor).length,
      configured: sortedAssets.filter((asset) => asset.sources.includes("configured")).length,
      observed: sortedAssets.filter((asset) => asset.sources.includes("observed")).length,
      skipped: skipped.length,
      total: sortedAssets.length + skipped.length,
    },
  };
}

export function planUniverseScan(
  registry: UniverseRegistry,
  batchSize: number,
  now: Date,
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
  const totalBatches = rotatingSlots > 0
    ? Math.max(1, Math.ceil(rotatingAssets.length / rotatingSlots))
    : 1;
  const batchIndex = scanWindowCursor(now, 15) % totalBatches;
  const start = batchIndex * rotatingSlots;
  const selectedRotatingAssets = rotatingSlots > 0
    ? rotatingAssets.slice(start, start + rotatingSlots)
    : [];
  const assets = uniqueValues([...pinnedAnchors, ...selectedRotatingAssets]);
  const pendingAssets = sortedAssets
    .map((asset) => asset.baseAsset)
    .filter((asset) => !assets.includes(asset));

  return {
    allAssets: sortedAssets.map((asset) => asset.baseAsset),
    anchorAssets: pinnedAnchors,
    assets,
    batchIndex,
    batchSize: safeBatchSize,
    nextBatchIndex: (batchIndex + 1) % totalBatches,
    pendingAssets,
    requestsPlanned: assets.length,
    rotatingAssets,
    totalBatches,
  };
}

export function buildCoverageReport(
  registry: UniverseRegistry,
  batchPlan: UniverseScanPlan,
): ScanCoverage {
  const eligible = registry.assets.length;

  return {
    batchIndex: batchPlan.batchIndex,
    coveragePercent: eligible
      ? Math.round((batchPlan.assets.length / eligible) * 100)
      : 0,
    eligible,
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
