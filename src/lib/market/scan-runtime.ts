import type { MarketDataProvider, MarketRadarSnapshot, ScanMetadata } from "./types";

export type ScanRunStatus = "updated" | "served_cache" | "failed";

export type ScanRunResult = {
  status: ScanRunStatus;
  snapshot: MarketRadarSnapshot | null;
  error?: string;
};

export type ScanCache = {
  get: () => MarketRadarSnapshot | null;
  set: (snapshot: MarketRadarSnapshot) => void;
};

export type RunScheduledScanOptions = {
  provider: MarketDataProvider;
  cache: ScanCache;
  now: Date;
  cadenceMinutes: 15 | 30;
  forceRefresh?: boolean;
};

export class MemoryScanCache implements ScanCache {
  private snapshot: MarketRadarSnapshot | null = null;

  get() {
    return this.snapshot;
  }

  set(snapshot: MarketRadarSnapshot) {
    this.snapshot = snapshot;
  }
}

export function calculateNextScanAt(value: string | Date, cadenceMinutes: 15 | 30) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + cadenceMinutes * 60_000).toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown provider error";
}

function isFresh(snapshot: MarketRadarSnapshot, now: Date, cadenceMinutes: 15 | 30) {
  const generatedAt = new Date(snapshot.metadata.generatedAt);

  if (Number.isNaN(generatedAt.getTime())) {
    return false;
  }

  return now.getTime() - generatedAt.getTime() < cadenceMinutes * 60_000;
}

function withRuntimeMetadata(
  snapshot: MarketRadarSnapshot,
  metadata: Partial<ScanMetadata>,
): MarketRadarSnapshot {
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      ...metadata,
      notes: metadata.notes ?? snapshot.metadata.notes,
    },
  };
}

export async function runScheduledScan({
  cache,
  cadenceMinutes,
  forceRefresh = false,
  now,
  provider,
}: RunScheduledScanOptions): Promise<ScanRunResult> {
  const nowIso = now.toISOString();
  const cachedSnapshot = cache.get();

  if (cachedSnapshot && !forceRefresh && isFresh(cachedSnapshot, now, cadenceMinutes)) {
    return {
      status: "served_cache",
      snapshot: withRuntimeMetadata(cachedSnapshot, {
        cadenceMinutes,
        nextScanAt: calculateNextScanAt(cachedSnapshot.metadata.generatedAt, cadenceMinutes),
        notes: [
          ...cachedSnapshot.metadata.notes,
          "scan runtime: fresh cache served without provider refresh",
        ],
      }),
    };
  }

  try {
    const providerSnapshot = await provider.fetchSnapshot();
    const snapshot = withRuntimeMetadata(providerSnapshot, {
      status: "ready",
      cadenceMinutes,
      generatedAt: nowIso,
      nextScanAt: calculateNextScanAt(now, cadenceMinutes),
      staleAfterMinutes: cadenceMinutes * 2,
      notes: [
        ...providerSnapshot.metadata.notes,
        `scan runtime: updated from ${provider.label}`,
      ],
    });

    cache.set(snapshot);

    return {
      status: "updated",
      snapshot,
    };
  } catch (error) {
    const message = errorMessage(error);

    if (!cachedSnapshot) {
      return {
        status: "failed",
        snapshot: null,
        error: message,
      };
    }

    const snapshot = withRuntimeMetadata(cachedSnapshot, {
      status: "stale",
      cadenceMinutes,
      nextScanAt: calculateNextScanAt(now, cadenceMinutes),
      notes: [
        ...cachedSnapshot.metadata.notes,
        `scan runtime: provider failed, serving cache (${message})`,
      ],
    });

    return {
      status: "served_cache",
      snapshot,
      error: message,
    };
  }
}
