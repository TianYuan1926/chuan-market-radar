import type {
  MarketDataProvider,
  MarketRadarSnapshot,
  ScanMetadata,
  ScanRuntimeDiagnostics,
} from "./types";

export type ScanRunStatus = "updated" | "in_progress" | "served_cache" | "failed";

export type ScanRunResult = {
  status: ScanRunStatus;
  snapshot: MarketRadarSnapshot | null;
  error?: string;
};

export type ScanCache = {
  get: () => MarketRadarSnapshot | null;
  set: (snapshot: MarketRadarSnapshot) => void;
};

export type ScanCoordinationClaim = {
  allowed: true;
  token: string;
} | {
  allowed: false;
  code: "budget_exhausted" | "scan_in_progress";
  reason: string;
};

export type ScanCoordinator = {
  beforeScan: (context: {
    cadenceMinutes: 15 | 30;
    forceRefresh: boolean;
    now: Date;
    providerId: MarketDataProvider["id"];
    trigger: ScanRuntimeDiagnostics["trigger"];
  }) => Promise<ScanCoordinationClaim>;
  afterScan: (token: string, context: {
    status: ScanRunStatus;
  }) => Promise<void>;
};

export type RunScheduledScanOptions = {
  provider: MarketDataProvider;
  cache: ScanCache;
  now: Date;
  clock?: () => Date;
  cadenceMinutes: 15 | 30;
  coordinator?: ScanCoordinator;
  forceRefresh?: boolean;
  trigger?: ScanRuntimeDiagnostics["trigger"];
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

export function calculateNextFixedScanAt({
  cadenceMinutes,
  completedAt,
  startedAt,
}: {
  cadenceMinutes: 15 | 30;
  completedAt: string | Date;
  startedAt: string | Date;
}) {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const completed = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  const intervalMs = cadenceMinutes * 60_000;
  const firstCandidateMs = start.getTime() + intervalMs;

  if (firstCandidateMs > completed.getTime()) {
    return new Date(firstCandidateMs).toISOString();
  }

  const missedSlots = Math.floor((completed.getTime() - firstCandidateMs) / intervalMs) + 1;
  return new Date(firstCandidateMs + missedSlots * intervalMs).toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown provider error";
}

function validTimestamp(value: Date, label: string) {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }

  return value;
}

function attemptTiming(startedAt: Date, clock: () => Date) {
  const completedAt = validTimestamp(clock(), "scan completion time");

  return {
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    startedAt: startedAt.toISOString(),
  };
}

function successfulScanAt(snapshot: MarketRadarSnapshot) {
  return snapshot.metadata.runtime?.scanCompletedAt ?? snapshot.metadata.generatedAt;
}

function isFresh(snapshot: MarketRadarSnapshot, now: Date, cadenceMinutes: 15 | 30) {
  const generatedAt = new Date(successfulScanAt(snapshot));

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
  clock = () => new Date(),
  coordinator,
  forceRefresh = false,
  now,
  provider,
  trigger = "unknown",
}: RunScheduledScanOptions): Promise<ScanRunResult> {
  const cachedSnapshot = cache.get();

  if (cachedSnapshot && !forceRefresh && isFresh(cachedSnapshot, now, cadenceMinutes)) {
    return {
      status: "served_cache",
      snapshot: withRuntimeMetadata(cachedSnapshot, {
        cadenceMinutes,
        nextScanAt: calculateNextScanAt(successfulScanAt(cachedSnapshot), cadenceMinutes),
        runtime: {
          ...cachedSnapshot.metadata.runtime,
          cacheStatus: "served_cache",
          persistedArchive: cachedSnapshot.metadata.runtime?.persistedArchive ?? false,
          trigger,
        },
        notes: [
          ...cachedSnapshot.metadata.notes,
          "scan runtime: fresh cache served without provider refresh",
        ],
      }),
    };
  }

  const coordination = coordinator
    ? await coordinator.beforeScan({
      cadenceMinutes,
      forceRefresh,
      now,
      providerId: provider.id,
      trigger,
    })
    : null;

  if (coordination && !coordination.allowed) {
    const timing = attemptTiming(now, clock);
    const status: ScanRunStatus = coordination.code === "scan_in_progress"
      ? "in_progress"
      : "failed";

    if (!cachedSnapshot) {
      return {
        status,
        snapshot: null,
        error: coordination.reason,
      };
    }

    return {
      status,
      snapshot: withRuntimeMetadata(cachedSnapshot, {
        cadenceMinutes,
        nextScanAt: calculateNextScanAt(successfulScanAt(cachedSnapshot), cadenceMinutes),
        runtime: {
          ...cachedSnapshot.metadata.runtime,
          cacheStatus: "served_cache",
          lastAttemptCompletedAt: timing.completedAt,
          lastAttemptDurationMs: timing.durationMs,
          lastAttemptError: coordination.reason,
          lastAttemptStartedAt: timing.startedAt,
          lastAttemptStatus: status,
          persistedArchive: cachedSnapshot.metadata.runtime?.persistedArchive ?? false,
          trigger,
        },
        notes: [
          ...cachedSnapshot.metadata.notes,
          `scan runtime: served cache because ${coordination.reason}`,
        ],
      }),
      error: coordination.reason,
    };
  }

  const token = coordination?.token;

  let result: ScanRunResult;

  try {
    const providerSnapshot = await provider.fetchSnapshot();
    const timing = attemptTiming(now, clock);
    const snapshot = withRuntimeMetadata(providerSnapshot, {
      status: providerSnapshot.metadata.status,
      cadenceMinutes,
      generatedAt: timing.completedAt,
      nextScanAt: calculateNextFixedScanAt({
        cadenceMinutes,
        completedAt: timing.completedAt,
        startedAt: timing.startedAt,
      }),
      runtime: {
        ...providerSnapshot.metadata.runtime,
        cacheStatus: "updated",
        lastAttemptCompletedAt: timing.completedAt,
        lastAttemptDurationMs: timing.durationMs,
        lastAttemptStartedAt: timing.startedAt,
        lastAttemptStatus: "updated",
        persistedArchive: providerSnapshot.metadata.runtime?.persistedArchive ?? false,
        scanCompletedAt: timing.completedAt,
        scanDurationMs: timing.durationMs,
        scanStartedAt: timing.startedAt,
        trigger,
      },
      staleAfterMinutes: cadenceMinutes * 2,
      notes: [
        ...providerSnapshot.metadata.notes,
        `scan runtime: updated from ${provider.label}`,
      ],
    });

    result = {
      status: "updated",
      snapshot,
    };
  } catch (error) {
    const message = errorMessage(error);
    const timing = attemptTiming(now, clock);

    if (!cachedSnapshot) {
      result = {
        status: "failed",
        snapshot: null,
        error: message,
      };
    } else {
      const snapshot = withRuntimeMetadata(cachedSnapshot, {
        status: "stale",
        cadenceMinutes,
        nextScanAt: calculateNextFixedScanAt({
          cadenceMinutes,
          completedAt: timing.completedAt,
          startedAt: timing.startedAt,
        }),
        runtime: {
          ...cachedSnapshot.metadata.runtime,
          cacheStatus: "failed",
          lastAttemptCompletedAt: timing.completedAt,
          lastAttemptDurationMs: timing.durationMs,
          lastAttemptError: message,
          lastAttemptStartedAt: timing.startedAt,
          lastAttemptStatus: "served_cache",
          persistedArchive: cachedSnapshot.metadata.runtime?.persistedArchive ?? false,
          trigger,
        },
        notes: [
          ...cachedSnapshot.metadata.notes,
          `scan runtime: provider failed, serving cache (${message})`,
        ],
      });

      result = {
        status: "served_cache",
        snapshot,
        error: message,
      };
    }
  }

  if (token) {
    try {
      await coordinator?.afterScan(token, { status: result.status });
    } catch (error) {
      return {
        status: "failed",
        snapshot: null,
        error: `scan coordination release failed: ${errorMessage(error)}`,
      };
    }
  }

  if (result.status === "updated" && result.snapshot) {
    cache.set(result.snapshot);
  }

  return result;
}
