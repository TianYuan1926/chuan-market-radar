import type { UniverseDiscoveryProvider, UniverseDiscoveryResult } from "./providers/binance-universe-discovery";
import {
  buildUniverseRegistry,
  normalizeUniverseAsset,
  type UniverseAsset,
} from "./universe-registry";

export type DailyMoverCoverageMode = "configured_only" | "discovered_rotation";

export type DailyMoverCoveragePlan = {
  configuredAssets: string[];
  discovery: {
    instrumentCount: number;
    notes: string[];
    requestCount: number;
    source: string;
    status: "disabled" | "failed" | "ready";
  };
  maxAssets: number;
  mode: DailyMoverCoverageMode;
  notes: string[];
  requestedAssets: string[];
  rotationCursor: number;
  totalUniverseAssets: number;
};

export type BuildDailyMoverCoveragePlanOptions = {
  baseAssets?: string[];
  maxAssets: number;
  now: Date;
  universeDiscoveryProvider?: UniverseDiscoveryProvider;
};

const defaultDailyMoverBaseAssets = ["BTC", "ETH"];

function normalizeBaseAssets(baseAssets?: string[]) {
  const assets = (baseAssets && baseAssets.length > 0 ? baseAssets : defaultDailyMoverBaseAssets)
    .map((asset) => normalizeUniverseAsset(asset)?.baseAsset)
    .filter((asset): asset is string => Boolean(asset));

  return [...new Set(assets)];
}

function dayCursor(now: Date) {
  const safeTime = Number.isNaN(now.getTime()) ? Date.now() : now.getTime();

  return Math.floor(safeTime / (24 * 60 * 60 * 1000));
}

function rotateAssets<T>(assets: T[], cursor: number) {
  if (assets.length === 0) {
    return [];
  }

  const start = cursor % assets.length;

  return [...assets.slice(start), ...assets.slice(0, start)];
}

function tierWeight(asset: UniverseAsset) {
  if (asset.tier === "core") {
    return 4;
  }

  if (asset.tier === "active") {
    return 3;
  }

  if (asset.tier === "long_tail") {
    return 2;
  }

  return 1;
}

function selectAssets({
  configuredAssets,
  maxAssets,
  now,
  universeAssets,
}: {
  configuredAssets: string[];
  maxAssets: number;
  now: Date;
  universeAssets: UniverseAsset[];
}) {
  const safeMaxAssets = Math.max(1, Math.floor(maxAssets || 1));
  const selected = new Set<string>();
  const requestedAssets: string[] = [];

  for (const asset of configuredAssets) {
    if (requestedAssets.length >= safeMaxAssets) {
      break;
    }

    requestedAssets.push(asset);
    selected.add(asset);
  }

  const remainingSlots = safeMaxAssets - requestedAssets.length;

  if (remainingSlots <= 0) {
    return requestedAssets;
  }

  const candidates = universeAssets
    .filter((asset) => !selected.has(asset.baseAsset))
    .sort((left, right) =>
      tierWeight(right) - tierWeight(left) ||
      right.priority - left.priority ||
      left.baseAsset.localeCompare(right.baseAsset)
    );
  const rotatedCandidates = rotateAssets(candidates, dayCursor(now));

  for (const asset of rotatedCandidates) {
    if (requestedAssets.length >= safeMaxAssets) {
      break;
    }

    requestedAssets.push(asset.baseAsset);
    selected.add(asset.baseAsset);
  }

  return requestedAssets;
}

function discoveryStatus(result?: UniverseDiscoveryResult): DailyMoverCoveragePlan["discovery"] {
  if (!result) {
    return {
      instrumentCount: 0,
      notes: [],
      requestCount: 0,
      source: "disabled",
      status: "disabled",
    };
  }

  return {
    instrumentCount: result.ok ? result.instruments.length : 0,
    notes: result.notes ?? [],
    requestCount: result.requestCount ?? 0,
    source: result.source,
    status: result.ok ? "ready" : "failed",
  };
}

export async function buildDailyMoverCoveragePlan({
  baseAssets,
  maxAssets,
  now,
  universeDiscoveryProvider,
}: BuildDailyMoverCoveragePlanOptions): Promise<DailyMoverCoveragePlan> {
  const configuredAssets = normalizeBaseAssets(baseAssets);
  const discoveryResult = universeDiscoveryProvider
    ? await universeDiscoveryProvider.discoverInstruments()
    : undefined;
  const discovery = discoveryStatus(discoveryResult);
  const discoveredInstruments = discoveryResult?.ok ? discoveryResult.instruments : [];
  const registry = buildUniverseRegistry(configuredAssets, discoveredInstruments);
  const requestedAssets = discovery.status === "ready"
    ? selectAssets({
        configuredAssets,
        maxAssets,
        now,
        universeAssets: registry.assets,
      })
    : configuredAssets.slice(0, Math.max(1, Math.floor(maxAssets || 1)));
  const mode: DailyMoverCoverageMode = discovery.status === "ready"
    ? "discovered_rotation"
    : "configured_only";

  return {
    configuredAssets,
    discovery,
    maxAssets: Math.max(1, Math.floor(maxAssets || 1)),
    mode,
    notes: [
      mode === "discovered_rotation"
        ? `daily mover coverage: discovered ${registry.assets.length} universe assets, requested ${requestedAssets.length}`
        : `daily mover coverage: configured only, requested ${requestedAssets.length}`,
      `daily mover rotation: cursor ${dayCursor(now)}, max assets ${Math.max(1, Math.floor(maxAssets || 1))}`,
      "daily mover guardrail: wide coverage is daily low-frequency research sampling, not a full-market deep scan.",
    ],
    requestedAssets,
    rotationCursor: dayCursor(now),
    totalUniverseAssets: registry.assets.length,
  };
}
