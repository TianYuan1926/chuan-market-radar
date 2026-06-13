import type { PersistenceMode, PersistenceRepository } from "../persistence/persistence-store";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import type {
  MarketDataSource,
  MarketDataStatus,
  MarketRadarSnapshot,
  ScanArchiveSummary,
} from "../market/types";

export type SystemHealthLevel = "ready" | "preview" | "degraded" | "blocked";
export type ScanFreshness = "fresh" | "aging" | "expired" | "unknown";
export type DataSourceHealthStatus = "ready" | "preview" | "missing_key" | "fallback";

export type SystemHealthGuard = {
  id: "data-source" | "persistence" | "freshness" | "archive";
  label: string;
  state: SystemHealthLevel;
  detail: string;
};

export type ScanOperationsVerdict = "healthy" | "watch" | "attention" | "blocked";

export type SystemHealthReport = {
  generatedAt: string;
  level: SystemHealthLevel;
  summary: string;
  dataSource: {
    activeSource: MarketDataSource;
    configuredProvider: string;
    detail: string;
    isRealtime: boolean;
    mode: "demo" | "live";
    status: DataSourceHealthStatus;
  };
  persistence: {
    databaseDriver: DatabaseClientDiagnostics["driver"];
    databaseReason?: DatabaseClientDiagnostics["reason"];
    databaseStatus: DatabaseClientDiagnostics["status"];
    detail: string;
    durable: boolean;
    mode: PersistenceMode;
    scope: string;
  };
  scan: {
    ageMinutes: number | null;
    anomalyCount: number;
    cadenceMinutes: number;
    candidateCount: number;
    freshness: ScanFreshness;
    generatedAt: string;
    nextScanAt: string;
    riskGate: MarketRadarSnapshot["metadata"]["riskGate"];
    scannedCount: number;
    status: MarketDataStatus;
    staleAfterMinutes: number;
  };
  archive: {
    entries: number;
    retentionMode: PersistenceMode;
  };
  operations: {
    batchDetail: string | null;
    lastProblemScanAt: string | null;
    lastSuccessfulScanAt: string | null;
    minutesUntilNextScan: number | null;
    minutesUntilStale: number | null;
    operatorHint: string;
    recentProblemCount: number;
    recentSuccessCount: number;
    requestDetail: string | null;
    runtimeDetail: string | null;
    verdict: ScanOperationsVerdict;
  };
  guards: SystemHealthGuard[];
};

export type BuildSystemHealthReportOptions = {
  database?: DatabaseClientDiagnostics;
  env?: Record<string, string | undefined>;
  now?: Date;
  repository: PersistenceRepository;
  snapshot: MarketRadarSnapshot;
};

function requestedProvider(env: Record<string, string | undefined>) {
  return env.MARKET_DATA_PROVIDER?.trim() || "mock";
}

function ageMinutes(generatedAt: string, now: Date) {
  const generatedTime = new Date(generatedAt).getTime();

  if (Number.isNaN(generatedTime)) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - generatedTime) / 60_000));
}

function minutesUntil(value: string, now: Date) {
  const targetTime = new Date(value).getTime();

  if (Number.isNaN(targetTime)) {
    return null;
  }

  return Math.max(0, Math.ceil((targetTime - now.getTime()) / 60_000));
}

function addMinutes(value: string, minutes: number) {
  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  return new Date(time + minutes * 60_000).toISOString();
}

function scanFreshness({
  age,
  metadata,
}: {
  age: number | null;
  metadata: MarketRadarSnapshot["metadata"];
}): ScanFreshness {
  if (age === null) {
    return "unknown";
  }

  if (metadata.status === "failed" || age > metadata.staleAfterMinutes) {
    return "expired";
  }

  if (metadata.status === "stale" || age > metadata.cadenceMinutes) {
    return "aging";
  }

  return "fresh";
}

function metadataNote(notes: string[], prefix: string) {
  return notes.find((note) => note.startsWith(prefix)) ?? null;
}

function sourceStatus({
  activeSource,
  configuredProvider,
  env,
}: {
  activeSource: MarketDataSource;
  configuredProvider: string;
  env: Record<string, string | undefined>;
}): DataSourceHealthStatus {
  if (configuredProvider === "coinglass" && !env.COINGLASS_API_KEY?.trim()) {
    return "missing_key";
  }

  if (configuredProvider === "coinglass" && activeSource !== "coinglass") {
    return "fallback";
  }

  return activeSource === "mock" ? "preview" : "ready";
}

function sourceDetail(status: DataSourceHealthStatus, activeSource: MarketDataSource) {
  if (status === "missing_key") {
    return "已请求 CoinGlass，但缺少 COINGLASS_API_KEY，当前不能视为真实行情。";
  }

  if (status === "fallback") {
    return `配置请求真实数据，但当前返回 ${activeSource}，需要检查 provider 启用条件。`;
  }

  if (status === "preview") {
    return "当前使用演示数据，适合预览界面和流程，不代表真实市场。";
  }

  return "当前使用真实数据源，仍需同时观察缓存和限速状态。";
}

function levelRank(level: SystemHealthLevel) {
  return {
    ready: 0,
    preview: 1,
    degraded: 2,
    blocked: 3,
  }[level];
}

function strongestLevel(levels: SystemHealthLevel[]): SystemHealthLevel {
  return levels.reduce<SystemHealthLevel>(
    (current, item) => (levelRank(item) > levelRank(current) ? item : current),
    "ready",
  );
}

function overallSummary(level: SystemHealthLevel) {
  if (level === "blocked") {
    return "系统有阻断项，不能把当前结果当成可用扫描。";
  }

  if (level === "degraded") {
    return "系统可访问，但存在数据源或新鲜度问题，需要先排查。";
  }

  if (level === "preview") {
    return "系统处于预览状态，适合调试流程，不能承诺永久保存或真实行情。";
  }

  return "系统状态可用，数据源、扫描和持久化边界清晰。";
}

function fallbackDatabaseDiagnostics({
  durable,
  repository,
}: {
  durable: boolean;
  repository: PersistenceRepository;
}): DatabaseClientDiagnostics {
  if (durable) {
    return {
      detail: `当前使用 ${repository.mode} 持久化，scope 为 ${repository.scope}。`,
      driver: "postgres",
      durable: true,
      hasDatabaseUrl: true,
      scope: repository.scope,
      status: "ready",
    };
  }

  return {
    detail: `当前使用 ${repository.mode} 存储，刷新或重启后可能丢失演示记录。`,
    driver: "none",
    durable: false,
    hasDatabaseUrl: false,
    reason: "database_url_missing",
    scope: repository.scope,
    status: "unconfigured",
  };
}

function scanOperations({
  archiveSummaries,
  freshness,
  metadata,
  now,
}: {
  archiveSummaries: ScanArchiveSummary[];
  freshness: ScanFreshness;
  metadata: MarketRadarSnapshot["metadata"];
  now: Date;
}): SystemHealthReport["operations"] {
  const successfulArchives = archiveSummaries.filter((archive) =>
    archive.status === "ready" || archive.status === "partial"
  );
  const problemArchives = archiveSummaries.filter((archive) =>
    archive.status === "failed" || archive.status === "stale"
  );
  const currentIsSuccessful = metadata.status === "ready" || metadata.status === "partial";
  const lastSuccessfulScanAt = currentIsSuccessful
    ? metadata.generatedAt
    : successfulArchives[0]?.generatedAt ?? null;
  const lastProblemScanAt = problemArchives[0]?.generatedAt ??
    (metadata.status === "failed" || metadata.status === "stale" ? metadata.generatedAt : null);
  const staleAt = addMinutes(metadata.generatedAt, metadata.staleAfterMinutes);
  const minutesUntilStale = staleAt ? minutesUntil(staleAt, now) : null;
  const minutesUntilNextScan = minutesUntil(metadata.nextScanAt, now);
  const recentProblemCount = problemArchives.length;
  const recentSuccessCount = successfulArchives.length;
  const batchDetail = metadataNote(metadata.notes, "batch ");
  const requestDetail = metadataNote(metadata.notes, "requests ");
  const runtimeDetail = metadataNote(metadata.notes, "scan runtime:");
  const verdict: ScanOperationsVerdict = metadata.status === "failed" || !lastSuccessfulScanAt
    ? "blocked"
    : freshness === "expired" || freshness === "unknown"
      ? "attention"
      : freshness === "aging" || metadata.status === "stale"
        ? "watch"
        : "healthy";

  let operatorHint = "扫描链路正常，继续观察下一次自动触发。";

  if (!lastSuccessfulScanAt) {
    operatorHint = "没有成功扫描记录，先检查 GitHub Actions、CRON_SECRET 和数据源响应。";
  } else if (verdict === "blocked") {
    operatorHint = "当前扫描失败，先处理接口鉴权、数据源或持久化错误。";
  } else if (verdict === "attention") {
    operatorHint = "扫描结果已经过期，需要确认定时任务是否继续运行。";
  } else if (verdict === "watch") {
    operatorHint = "扫描正在接近过期窗口，观察下一次自动刷新是否准时。";
  } else if (recentProblemCount > 0) {
    operatorHint = "最近出现过异常，但当前扫描已恢复，建议继续观察一轮。";
  } else if (minutesUntilStale !== null && minutesUntilStale <= 5) {
    operatorHint = "距离过期窗口很近，下一轮扫描需要准时完成。";
  }

  return {
    batchDetail,
    lastProblemScanAt,
    lastSuccessfulScanAt,
    minutesUntilNextScan,
    minutesUntilStale,
    operatorHint,
    recentProblemCount,
    recentSuccessCount,
    requestDetail,
    runtimeDetail,
    verdict,
  };
}

export async function buildSystemHealthReport({
  database,
  env = {},
  now = new Date(),
  repository,
  snapshot,
}: BuildSystemHealthReportOptions): Promise<SystemHealthReport> {
  const configuredProvider = requestedProvider(env);
  const metadata = snapshot.metadata;
  const age = ageMinutes(metadata.generatedAt, now);
  const freshness = scanFreshness({ age, metadata });
  const providerStatus = sourceStatus({
    activeSource: metadata.source,
    configuredProvider,
    env,
  });
  const archiveSummaries = await repository.listScanArchives(24);
  const archiveEntries = archiveSummaries.length;
  const durable = repository.mode === "database";
  const databaseDiagnostics = database ?? fallbackDatabaseDiagnostics({ durable, repository });
  const sourceLevel: SystemHealthLevel = providerStatus === "missing_key" ||
      providerStatus === "fallback"
    ? "degraded"
    : providerStatus === "preview"
      ? "preview"
      : "ready";
  const persistenceLevel: SystemHealthLevel = durable ? "ready" : "preview";
  const freshnessLevel: SystemHealthLevel = metadata.status === "failed"
    ? "blocked"
    : freshness === "expired" || freshness === "unknown"
      ? "degraded"
      : freshness === "aging"
        ? "degraded"
        : "ready";
  const archiveLevel: SystemHealthLevel = archiveEntries > 0 ? persistenceLevel : "degraded";
  const level = strongestLevel([sourceLevel, persistenceLevel, freshnessLevel, archiveLevel]);

  return {
    generatedAt: now.toISOString(),
    level,
    summary: overallSummary(level),
    dataSource: {
      activeSource: metadata.source,
      configuredProvider,
      detail: sourceDetail(providerStatus, metadata.source),
      isRealtime: metadata.isRealtime,
      mode: metadata.source === "mock" ? "demo" : "live",
      status: providerStatus,
    },
    persistence: {
      databaseDriver: databaseDiagnostics.driver,
      databaseReason: databaseDiagnostics.reason,
      databaseStatus: databaseDiagnostics.status,
      detail: databaseDiagnostics.detail,
      durable,
      mode: repository.mode,
      scope: repository.scope,
    },
    scan: {
      ageMinutes: age,
      anomalyCount: metadata.anomalyCount,
      cadenceMinutes: metadata.cadenceMinutes,
      candidateCount: metadata.candidateCount,
      freshness,
      generatedAt: metadata.generatedAt,
      nextScanAt: metadata.nextScanAt,
      riskGate: metadata.riskGate,
      scannedCount: metadata.scannedCount,
      status: metadata.status,
      staleAfterMinutes: metadata.staleAfterMinutes,
    },
    archive: {
      entries: archiveEntries,
      retentionMode: repository.mode,
    },
    operations: scanOperations({
      archiveSummaries,
      freshness,
      metadata,
      now,
    }),
    guards: [
      {
        id: "data-source",
        label: "数据源",
        state: sourceLevel,
        detail: sourceDetail(providerStatus, metadata.source),
      },
      {
        id: "persistence",
        label: "持久化",
        state: persistenceLevel,
        detail: databaseDiagnostics.detail,
      },
      {
        id: "freshness",
        label: "新鲜度",
        state: freshnessLevel,
        detail: age === null
          ? "扫描时间无法解析。"
          : `距离上次扫描约 ${age} 分钟，过期阈值 ${metadata.staleAfterMinutes} 分钟。`,
      },
      {
        id: "archive",
        label: "归档",
        state: archiveLevel,
        detail: archiveEntries > 0
          ? `已记录 ${archiveEntries} 个扫描回放帧。`
          : "还没有扫描回放帧。",
      },
    ],
  };
}
