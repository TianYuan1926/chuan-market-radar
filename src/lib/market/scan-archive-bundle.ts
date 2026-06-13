import type { PersistenceRepository } from "../persistence/persistence-store";
import type { ScanArchiveBundle } from "./types";

export type ScanArchiveBundleOptions = {
  listLimit?: number;
  maxEntries?: number;
};

export async function buildScanArchiveBundle(
  repository: PersistenceRepository,
  replayId?: string,
  {
    listLimit = 8,
    maxEntries = 24,
  }: ScanArchiveBundleOptions = {},
): Promise<ScanArchiveBundle> {
  const [entries, latestReplay, comparison] = await Promise.all([
    repository.listScanArchives(listLimit),
    repository.getScanReplayFrame(replayId),
    repository.compareLatestScanArchives(),
  ]);

  return {
    entries,
    latestReplay: latestReplay ?? undefined,
    comparison,
    retention: {
      storage: repository.mode,
      durable: repository.mode === "database",
      maxEntries,
    },
  };
}
