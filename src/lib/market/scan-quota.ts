export type ScanQuotaStatus =
  | "within_budget"
  | "near_budget"
  | "over_budget"
  | "unbudgeted";

export type ScanQuotaPlan = {
  cadenceMinutes: 15 | 30;
  coinGlassBudgetUsagePercent: number | null;
  coinGlassDailyRequestBudget: number | null;
  coinGlassRemainingDailyRequestEstimate: number | null;
  coinGlassRequestsPerDayEstimate: number;
  coinGlassRequestsPerScan: number;
  effectiveBatchSize: number;
  maxCoinGlassRequestsPerScan: number;
  minimumRequestsPerScan: number;
  publicDiscoveryRequestsPerDayEstimate: number;
  publicDiscoveryRequestsPerScan: number;
  requestedBatchSize: number;
  status: ScanQuotaStatus;
  warningUsagePercent: number;
  wasCapped: boolean;
  windowsPerDay: number;
};

export type BuildScanQuotaPlanOptions = {
  cadenceMinutes: 15 | 30;
  coinGlassDailyRequestBudget?: number | null;
  minimumRequestsPerScan?: number;
  publicDiscoveryRequestsPerScan?: number;
  requestedBatchSize: number;
  warningUsagePercent?: number;
};

function safePositiveInteger(value: number | undefined | null, fallback: number) {
  if (!Number.isFinite(value ?? NaN)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value as number));
}

export function buildScanQuotaPlan({
  cadenceMinutes,
  coinGlassDailyRequestBudget,
  minimumRequestsPerScan = 1,
  publicDiscoveryRequestsPerScan = 0,
  requestedBatchSize,
  warningUsagePercent = 80,
}: BuildScanQuotaPlanOptions): ScanQuotaPlan {
  const windowsPerDay = Math.ceil(1_440 / cadenceMinutes);
  const safeMinimum = safePositiveInteger(minimumRequestsPerScan, 1);
  const safeRequestedBatchSize = Math.max(
    safeMinimum,
    safePositiveInteger(requestedBatchSize, safeMinimum),
  );
  const safePublicDiscoveryRequestsPerScan = Math.max(0, Math.floor(publicDiscoveryRequestsPerScan || 0));
  const safeBudget = Number.isFinite(coinGlassDailyRequestBudget ?? NaN) && (coinGlassDailyRequestBudget ?? 0) > 0
    ? Math.floor(coinGlassDailyRequestBudget as number)
    : null;
  const maxCoinGlassRequestsPerScan = safeBudget
    ? Math.max(1, Math.floor(safeBudget / windowsPerDay))
    : safeRequestedBatchSize;
  const effectiveBatchSize = safeBudget
    ? Math.max(safeMinimum, Math.min(safeRequestedBatchSize, maxCoinGlassRequestsPerScan))
    : safeRequestedBatchSize;
  const coinGlassRequestsPerDayEstimate = effectiveBatchSize * windowsPerDay;
  const coinGlassRemainingDailyRequestEstimate = safeBudget === null
    ? null
    : Math.max(0, safeBudget - coinGlassRequestsPerDayEstimate);
  const coinGlassBudgetUsagePercent = safeBudget
    ? Math.round((coinGlassRequestsPerDayEstimate / safeBudget) * 100)
    : null;
  const status: ScanQuotaStatus = safeBudget
    ? coinGlassRequestsPerDayEstimate > safeBudget
      ? "over_budget"
      : (coinGlassBudgetUsagePercent ?? 0) >= warningUsagePercent
        ? "near_budget"
        : "within_budget"
    : "unbudgeted";

  return {
    cadenceMinutes,
    coinGlassBudgetUsagePercent,
    coinGlassDailyRequestBudget: safeBudget,
    coinGlassRemainingDailyRequestEstimate,
    coinGlassRequestsPerDayEstimate,
    coinGlassRequestsPerScan: effectiveBatchSize,
    effectiveBatchSize,
    maxCoinGlassRequestsPerScan,
    minimumRequestsPerScan: safeMinimum,
    publicDiscoveryRequestsPerDayEstimate: safePublicDiscoveryRequestsPerScan * windowsPerDay,
    publicDiscoveryRequestsPerScan: safePublicDiscoveryRequestsPerScan,
    requestedBatchSize: safeRequestedBatchSize,
    status,
    warningUsagePercent,
    wasCapped: effectiveBatchSize < safeRequestedBatchSize,
    windowsPerDay,
  };
}
