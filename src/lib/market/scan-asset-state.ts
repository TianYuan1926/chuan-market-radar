import type {
  ScanAssetState,
  ScanCoverage,
  ScanStatePoolAssetSample,
  ScanStatePoolKey,
  ScanTierKey,
} from "./types";
import { normalizeUniverseAsset } from "./universe-registry";

export type BuildScanAssetStatesFromCoverageOptions = {
  coverage: ScanCoverage;
  generatedAt: string;
  previousStates?: ScanAssetState[];
};

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

function timestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedAsset(rawAsset: string) {
  const normalized = normalizeUniverseAsset(rawAsset);

  return normalized ?? {
    baseAsset: rawAsset.toUpperCase().replace(/USDT$/u, ""),
    symbol: `${rawAsset.toUpperCase().replace(/USDT$/u, "")}USDT`,
  };
}

function statePoolFromSample(sample?: ScanStatePoolAssetSample, scanned = false): ScanStatePoolKey {
  return sample?.state ?? (scanned ? "DEEP_QUEUE" : "COLD");
}

function tierFromSampleOrPrevious(
  sample: ScanStatePoolAssetSample | undefined,
  previous: ScanAssetState | undefined,
  baseAsset: string,
): ScanTierKey {
  if (sample?.tier) {
    return sample.tier;
  }

  if (previous?.tier) {
    return previous.tier;
  }

  return baseAsset === "BTC" || baseAsset === "ETH" ? "anchor" : "long_tail";
}

function selectedReason(baseAsset: string, coverage: ScanCoverage, sample?: ScanStatePoolAssetSample) {
  if (coverage.dynamicPriority?.boostedAssets.includes(baseAsset)) {
    return "dynamic_priority";
  }

  if (baseAsset === "BTC" || baseAsset === "ETH") {
    return "anchor_context";
  }

  if (sample?.reasons.includes("battle_ready") || sample?.reasons.includes("battle_watch")) {
    return "state_pool_battle";
  }

  return "tier_rotation";
}

function skippedReason(baseAsset: string, coverage: ScanCoverage) {
  if (coverage.twoStageAllocation?.stageTwo.queuedPriorityAssets.includes(baseAsset)) {
    return "priority_queue_waiting";
  }

  return "waiting_for_rotation";
}

function scoreForSkippedAsset({
  consecutiveSkipped,
  tier,
  wasDisplacedByDynamicPriority,
}: {
  consecutiveSkipped: number;
  tier: ScanTierKey;
  wasDisplacedByDynamicPriority: boolean;
}) {
  const tierBoost = tier === "core"
    ? 120_000
    : tier === "active"
      ? 90_000
      : tier === "long_tail"
        ? 60_000
        : 0;
  const skipBoost = Math.min(900_000, consecutiveSkipped * 90_000);
  const displacementBoost = wasDisplacedByDynamicPriority ? 120_000 : 0;

  return skipBoost + tierBoost + displacementBoost;
}

function recentDeepScanTimes(previous: ScanAssetState | undefined, generatedAt: string, scanned: boolean) {
  const generatedTime = timestamp(generatedAt);
  const existing = previous?.payload.recentDeepScanTimes ?? [];
  const times = [
    ...(scanned ? [generatedAt] : []),
    ...existing,
  ]
    .filter((value, index, items) => items.indexOf(value) === index)
    .filter((value) => {
      const valueTime = timestamp(value);

      return valueTime > 0 && generatedTime - valueTime <= dayMs;
    })
    .sort((left, right) => timestamp(right) - timestamp(left));

  return times;
}

function countWithin(times: string[], generatedAt: string, windowMs: number) {
  const generatedTime = timestamp(generatedAt);

  return times.filter((value) => {
    const valueTime = timestamp(value);

    return valueTime > 0 && generatedTime - valueTime <= windowMs;
  }).length;
}

export function buildScanAssetStatesFromCoverage({
  coverage,
  generatedAt,
  previousStates = [],
}: BuildScanAssetStatesFromCoverageOptions): ScanAssetState[] {
  const previousBySymbol = new Map(previousStates.map((state) => [state.symbol, state]));
  const samplesBySymbol = new Map(
    (coverage.statePool?.assetSamples ?? []).map((sample) => [sample.symbol, sample]),
  );
  const dynamicScoresBySymbol = new Map(
    (coverage.dynamicPriority?.topAssets ?? []).map((asset) => [asset.symbol, asset.dynamicBoost]),
  );
  const selectedAssets = new Set(coverage.scannedAssets.map((asset) => normalizedAsset(asset).symbol));
  const pendingAssets = new Set(coverage.pendingAssets.map((asset) => normalizedAsset(asset).symbol));
  const symbols = [...new Set([...selectedAssets, ...pendingAssets])];

  return symbols.map((symbol) => {
    const key = normalizedAsset(symbol);
    const previous = previousBySymbol.get(key.symbol);
    const sample = samplesBySymbol.get(key.symbol);
    const scanned = selectedAssets.has(key.symbol);
    const wasDisplacedByDynamicPriority = !scanned &&
      coverage.twoStageAllocation?.stageTwo.queuedPriorityAssets.includes(key.baseAsset) === true;
    const tier = tierFromSampleOrPrevious(sample, previous, key.baseAsset);
    const consecutiveSkipped = scanned ? 0 : (previous?.consecutiveSkipped ?? 0) + 1;
    const recentTimes = recentDeepScanTimes(previous, generatedAt, scanned);
    const statePool = statePoolFromSample(sample, scanned);
    const dynamicPriorityScore = scanned
      ? dynamicScoresBySymbol.get(key.symbol) ?? previous?.dynamicPriorityScore ?? 0
      : previous?.dynamicPriorityScore ?? 0;
    const rotationPriorityScore = scanned
      ? 0
      : scoreForSkippedAsset({
        consecutiveSkipped,
        tier,
        wasDisplacedByDynamicPriority,
      });

    return {
      baseAsset: key.baseAsset,
      consecutiveSkipped,
      deepScanCount1h: countWithin(recentTimes, generatedAt, hourMs),
      deepScanCount24h: countWithin(recentTimes, generatedAt, dayMs),
      dynamicPriorityScore,
      lastDeepScannedAt: scanned ? generatedAt : previous?.lastDeepScannedAt ?? null,
      lastLightScannedAt: generatedAt,
      lastSelectedReason: scanned ? selectedReason(key.baseAsset, coverage, sample) : previous?.lastSelectedReason ?? null,
      lastSkippedReason: scanned ? null : skippedReason(key.baseAsset, coverage),
      payload: {
        notes: [
          scanned ? "selected_for_deep_scan" : "kept_in_rotation_queue",
        ],
        recentDeepScanTimes: recentTimes,
        source: "scan_rotation_state_v1" as const,
      },
      rotationPriorityScore,
      statePool,
      symbol: key.symbol,
      tier,
      updatedAt: generatedAt,
      wasDisplacedByDynamicPriority,
    };
  }).sort((left, right) =>
    right.rotationPriorityScore - left.rotationPriorityScore ||
    right.consecutiveSkipped - left.consecutiveSkipped ||
    left.symbol.localeCompare(right.symbol)
  );
}
