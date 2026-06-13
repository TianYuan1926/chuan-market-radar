export type ScanBatchPlan = {
  allAssets: string[];
  assets: string[];
  batchSize: number;
  batchIndex: number;
  totalBatches: number;
  nextBatchIndex: number;
  requestsPlanned: number;
  coveragePercent: number;
};

export type BuildScanBatchPlanOptions = {
  assets: string[];
  batchSize: number;
  cadenceMinutes: 15 | 30;
  now: Date;
};

export function normalizeScanAssets(assets: string[]) {
  const normalized = assets
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean)
    .map((asset) => asset.replace("/USDT", "").replace("-USDT", "").replace("USDT", ""));

  return [...new Set(normalized)];
}

export function scanWindowCursor(now: Date, cadenceMinutes: 15 | 30) {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsed = Math.max(0, now.getTime() - dayStart);

  return Math.floor(elapsed / (cadenceMinutes * 60_000));
}

export function buildScanBatchPlan({
  assets,
  batchSize,
  cadenceMinutes,
  now,
}: BuildScanBatchPlanOptions): ScanBatchPlan {
  const allAssets = normalizeScanAssets(assets);
  const safeBatchSize = Math.max(1, Math.floor(batchSize || 1));
  const totalBatches = Math.max(1, Math.ceil(allAssets.length / safeBatchSize));
  const batchIndex = scanWindowCursor(now, cadenceMinutes) % totalBatches;
  const start = batchIndex * safeBatchSize;
  const batchAssets = allAssets.slice(start, start + safeBatchSize);
  const requestsPlanned = batchAssets.length;

  return {
    allAssets,
    assets: batchAssets,
    batchSize: safeBatchSize,
    batchIndex,
    totalBatches,
    nextBatchIndex: (batchIndex + 1) % totalBatches,
    requestsPlanned,
    coveragePercent: allAssets.length
      ? Math.round((requestsPlanned / allAssets.length) * 100)
      : 0,
  };
}
