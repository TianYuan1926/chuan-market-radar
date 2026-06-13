import { siteConfig } from "@/lib/config/site";
import { buildScanArchiveBundle } from "@/lib/market/scan-archive-bundle";
import { createReplayFrame, summarizeScanSnapshot } from "@/lib/market/scan-archive";
import { MemoryScanCache, runScheduledScan } from "@/lib/market/scan-runtime";
import { getConfiguredMarketProvider } from "@/lib/market/provider-registry";
import type { MarketDataProvider, MarketRadarSnapshot, ScanArchiveBundle } from "@/lib/market/types";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

const scanCache = new MemoryScanCache();
const archiveMaxEntries = 24;

function archiveBundle(replayId?: string): Promise<ScanArchiveBundle> {
  return buildScanArchiveBundle(appPersistenceRepository, replayId, {
    listLimit: 8,
    maxEntries: archiveMaxEntries,
  });
}

async function withArchive(snapshot: MarketRadarSnapshot): Promise<MarketRadarSnapshot> {
  await appPersistenceRepository.addScanArchive(
    summarizeScanSnapshot(snapshot),
    createReplayFrame(snapshot),
  );

  return {
    ...snapshot,
    archive: await archiveBundle(snapshot.metadata.id),
  };
}

export async function getMarketRadarSnapshot(
  provider: MarketDataProvider = getConfiguredMarketProvider(),
): Promise<MarketRadarSnapshot> {
  const result = await runScheduledScan({
    provider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
  });

  if (!result.snapshot) {
    throw new Error(result.error ?? "market radar snapshot unavailable");
  }

  return withArchive(result.snapshot);
}

export async function refreshMarketRadarSnapshot(
  provider: MarketDataProvider = getConfiguredMarketProvider(),
) {
  const result = await runScheduledScan({
    provider,
    cache: scanCache,
    now: new Date(),
    cadenceMinutes: siteConfig.scanIntervalMinutes,
    forceRefresh: true,
  });

  return {
    ...result,
    snapshot: result.snapshot ? await withArchive(result.snapshot) : null,
  };
}

export async function getScanArchive(replayId?: string) {
  const entries = await appPersistenceRepository.listScanArchives(1);

  if (entries.length === 0) {
    await getMarketRadarSnapshot();
  }

  return archiveBundle(replayId);
}
