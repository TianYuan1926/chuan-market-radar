import type { PersistenceRepository } from "../persistence/persistence-store";
import type { RuntimeProbeReport } from "../runtime/worker-heartbeat";
import { buildScanArchiveBundle } from "./scan-archive-bundle";
import { buildScanEventFeed, type ScanEvent, type ScanEventType } from "./scan-events";
import type { ScanArchiveBundle } from "./types";

export const frontendLiveEventsVersion = "frontend-live-events.v1";

export type FrontendLiveEventType =
  | "scan_heartbeat"
  | "signal_change"
  | "candidate_change"
  | "system_status";

export type FrontendLiveEventSeverity =
  | "info"
  | "watch"
  | "hot"
  | "degraded"
  | "down";

export type FrontendLiveEvent = {
  detail: string;
  id: string;
  occurredAt: string;
  payload: {
    changeKind?: "added" | "removed" | "changed" | "heartbeat" | "status";
    metrics?: ScanEvent["metrics"];
    runtime?: {
      generatedAt: string;
      redisStatus: RuntimeProbeReport["redis"]["status"];
      staleAfterSeconds: number;
      workerStatusCounts: {
        degraded: number;
        down: number;
        healthy: number;
      };
      workers: Array<{
        ageSec: number | null;
        key: string;
        lastSeenAt: string | null;
        status: RuntimeProbeReport["workers"][number]["status"];
        task: string | null;
      }>;
    };
    sourceEventType?: ScanEventType;
  };
  scanId?: string;
  severity: FrontendLiveEventSeverity;
  source: "scan_archive" | "runtime_probe";
  symbols: string[];
  title: string;
  type: FrontendLiveEventType;
};

export type FrontendLiveEventsContract = {
  events: FrontendLiveEvent[];
  generatedAt: string;
  meta: {
    archiveCount: number;
    emptyReason?: "no_scan_archive" | "no_events";
    latestScanAt?: string;
    latestScanId?: string;
    limit: number;
    repositoryMode: PersistenceRepository["mode"];
    retention: ScanArchiveBundle["retention"];
    returned: number;
    runtimeProbeGeneratedAt?: string;
    source: "archive";
    triggeredScan: false;
  };
  ok: true;
  version: typeof frontendLiveEventsVersion;
};

export type BuildFrontendLiveEventsOptions = {
  limit?: number;
  now?: Date;
  repository: PersistenceRepository;
  runtimeProbes?: RuntimeProbeReport | null;
};

const defaultLimit = 20;
const maxLimit = 50;
const archiveRetentionMaxEntries = 24;

export function boundedFrontendLiveEventLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }

  return Math.min(maxLimit, Math.floor(parsed));
}

function severityFromScanEvent(event: ScanEvent): FrontendLiveEventSeverity {
  if (event.severity === "hot") return "hot";
  if (event.severity === "system") return "degraded";
  if (event.severity === "watch" || event.severity === "cooldown") return "watch";

  return "info";
}

function changeKindFromScanEvent(event: ScanEvent): NonNullable<FrontendLiveEvent["payload"]["changeKind"]> {
  if (event.type === "new_signal") return "added";
  if (event.type === "signal_removed") return "removed";
  if (event.type === "signal_shift") return "changed";
  if (event.type === "scan_heartbeat") return "heartbeat";

  return "status";
}

function frontendTypeFromScanEvent(event: ScanEvent): FrontendLiveEventType | null {
  if (event.type === "new_signal") return "candidate_change";
  if (event.type === "signal_removed" || event.type === "signal_shift") return "signal_change";
  if (event.type === "system_shift") return "system_status";
  if (event.type === "scan_heartbeat") return "scan_heartbeat";

  return null;
}

function scanIdFromEventId(id: string) {
  return id.split(":")[0] || undefined;
}

function mapScanEvent(event: ScanEvent): FrontendLiveEvent | null {
  const type = frontendTypeFromScanEvent(event);

  if (!type) {
    return null;
  }

  return {
    detail: event.detail,
    id: `archive:${event.id}`,
    occurredAt: event.generatedAt,
    payload: {
      changeKind: changeKindFromScanEvent(event),
      metrics: event.metrics,
      sourceEventType: event.type,
    },
    scanId: scanIdFromEventId(event.id),
    severity: severityFromScanEvent(event),
    source: "scan_archive",
    symbols: event.symbols,
    title: event.title,
    type,
  };
}

function latestOnlyHeartbeats(events: FrontendLiveEvent[]) {
  let hasHeartbeat = false;

  return events.filter((event) => {
    if (event.type !== "scan_heartbeat") {
      return true;
    }

    if (hasHeartbeat) {
      return false;
    }

    hasHeartbeat = true;
    return true;
  });
}

function runtimeWorkerStatusCounts(runtimeProbes: RuntimeProbeReport) {
  return runtimeProbes.workers.reduce(
    (counts, worker) => {
      counts[worker.status] += 1;
      return counts;
    },
    {
      degraded: 0,
      down: 0,
      healthy: 0,
    },
  );
}

function runtimeSeverity(runtimeProbes: RuntimeProbeReport): FrontendLiveEventSeverity {
  const counts = runtimeWorkerStatusCounts(runtimeProbes);

  if (runtimeProbes.redis.status === "down" || counts.down > 0) {
    return "down";
  }

  if (runtimeProbes.redis.status !== "healthy" || counts.degraded > 0) {
    return "degraded";
  }

  return "info";
}

function buildRuntimeStatusEvent(runtimeProbes: RuntimeProbeReport): FrontendLiveEvent {
  const counts = runtimeWorkerStatusCounts(runtimeProbes);
  const activeWorkers = runtimeProbes.workers.length - counts.down;

  return {
    detail: `redis=${runtimeProbes.redis.status}; workers=${activeWorkers}/${runtimeProbes.workers.length}`,
    id: `runtime:${runtimeProbes.generatedAt}`,
    occurredAt: runtimeProbes.generatedAt,
    payload: {
      changeKind: "status",
      runtime: {
        generatedAt: runtimeProbes.generatedAt,
        redisStatus: runtimeProbes.redis.status,
        staleAfterSeconds: runtimeProbes.staleAfterSeconds,
        workerStatusCounts: counts,
        workers: runtimeProbes.workers.slice(0, 12).map((worker) => ({
          ageSec: worker.ageSec,
          key: worker.key,
          lastSeenAt: worker.lastSeenAt,
          status: worker.status,
          task: worker.task,
        })),
      },
    },
    severity: runtimeSeverity(runtimeProbes),
    source: "runtime_probe",
    symbols: [],
    title: "System heartbeat",
    type: "system_status",
  };
}

export async function buildFrontendLiveEvents({
  limit,
  now = new Date(),
  repository,
  runtimeProbes,
}: BuildFrontendLiveEventsOptions): Promise<FrontendLiveEventsContract> {
  const boundedLimit = boundedFrontendLiveEventLimit(limit);
  const archive = await buildScanArchiveBundle(repository, undefined, {
    listLimit: Math.max(boundedLimit, 8),
    maxEntries: archiveRetentionMaxEntries,
  });
  const scanEvents = latestOnlyHeartbeats(
    buildScanEventFeed(archive, {
      limit: boundedLimit * 2,
    })
      .map(mapScanEvent)
      .filter((event): event is FrontendLiveEvent => Boolean(event)),
  );
  const runtimeEvents = runtimeProbes ? [buildRuntimeStatusEvent(runtimeProbes)] : [];
  const events = [...scanEvents, ...runtimeEvents].slice(0, boundedLimit);
  const latest = archive.entries[0];
  const emptyReason = events.length > 0
    ? undefined
    : archive.entries.length === 0
      ? "no_scan_archive"
      : "no_events";

  return {
    events,
    generatedAt: now.toISOString(),
    meta: {
      archiveCount: archive.entries.length,
      emptyReason,
      latestScanAt: latest?.generatedAt,
      latestScanId: latest?.id,
      limit: boundedLimit,
      repositoryMode: repository.mode,
      retention: archive.retention,
      returned: events.length,
      runtimeProbeGeneratedAt: runtimeProbes?.generatedAt,
      source: "archive",
      triggeredScan: false,
    },
    ok: true,
    version: frontendLiveEventsVersion,
  };
}
