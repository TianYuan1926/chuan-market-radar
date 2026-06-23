import type { RuntimeProbeReport } from "../runtime/worker-heartbeat";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanRequestDiagnostics } from "./types";

export type ScanStabilityIssueCode =
  | "archive_empty"
  | "coinglass_upgrade_required"
  | "coverage_collapsed"
  | "deep_scan_empty"
  | "long_cycle"
  | "redis_unhealthy"
  | "scan_failed"
  | "scan_stale"
  | "worker_down";

export type ScanStabilityIssue = {
  code: ScanStabilityIssueCode;
  detail: string;
  severity: "info" | "watch" | "critical";
};

export type ScanStabilityReport = {
  generatedAt: string;
  guardrail: string;
  issues: ScanStabilityIssue[];
  rotation: {
    coveragePercent: number;
    eligibleAssets: number;
    estimatedFullCycleMinutes: number | null;
    pendingAssets: number;
    scannedAssets: number;
  };
  runtime: {
    redisStatus: RuntimeProbeReport["redis"]["status"];
    workerDown: number;
    workerHealthy: number;
    workerTotal: number;
  };
  score: number;
  status: "blocked" | "healthy" | "watch";
  summary: string;
  trend: {
    recentArchives: number;
    recentFailures: number;
    recentSuccesses: number;
  };
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ageMinutes(value: string, now: Date) {
  const ms = new Date(value).getTime();

  if (!Number.isFinite(ms)) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - ms) / 60_000));
}

function addIssue(
  issues: ScanStabilityIssue[],
  issue: ScanStabilityIssue,
) {
  issues.push(issue);
}

function statusFromIssues(issues: ScanStabilityIssue[]): ScanStabilityReport["status"] {
  if (issues.some((issue) => issue.severity === "critical")) {
    return "blocked";
  }

  if (issues.some((issue) => issue.severity === "watch")) {
    return "watch";
  }

  return "healthy";
}

function scoreFromIssues(issues: ScanStabilityIssue[]) {
  const penalty = issues.reduce((total, issue) => (
    total + (issue.severity === "critical" ? 35 : issue.severity === "watch" ? 15 : 5)
  ), 0);

  return Math.max(0, 100 - penalty);
}

function summary(status: ScanStabilityReport["status"], issues: ScanStabilityIssue[]) {
  if (status === "healthy") {
    return "扫描链路健康，覆盖、归档和 worker 心跳可用。";
  }

  const first = issues[0]?.detail ?? "扫描链路需要观察。";

  return status === "blocked"
    ? `扫描链路存在阻断：${first}`
    : `扫描链路需要观察：${first}`;
}

function hasCoinGlassUpgradeFailure(requestDiagnostics: ScanRequestDiagnostics) {
  return requestDiagnostics.requestFailures?.some((failure) =>
    /upgrade plan/i.test(failure.error) ||
    failure.code === "401"
  ) ?? false;
}

export function buildScanStabilityReport({
  archives,
  now = new Date(),
  runtimeProbes,
  snapshot,
}: {
  archives: ScanArchiveSummary[];
  now?: Date;
  runtimeProbes: RuntimeProbeReport;
  snapshot: MarketRadarSnapshot;
}): ScanStabilityReport {
  const issues: ScanStabilityIssue[] = [];
  const coverage = snapshot.metadata.coverage;
  const scannedAssets = safeNumber(coverage?.scanned, snapshot.metadata.scannedCount);
  const eligibleAssets = safeNumber(coverage?.eligible, snapshot.instrumentPool.summary.accepted);
  const pendingAssets = safeNumber(coverage?.pending, Math.max(0, eligibleAssets - scannedAssets));
  const coveragePercent = safeNumber(coverage?.coveragePercent, eligibleAssets > 0 ? (scannedAssets / eligibleAssets) * 100 : 0);
  const estimatedFullCycleMinutes = coverage?.totalBatches
    ? coverage.totalBatches * snapshot.metadata.cadenceMinutes
    : null;
  const workerDown = runtimeProbes.workers.filter((worker) => worker.status === "down").length;
  const workerHealthy = runtimeProbes.workers.filter((worker) => worker.status === "healthy").length;
  const recentFailures = archives.filter((archive) => archive.status === "failed").length;
  const recentSuccesses = archives.filter((archive) => archive.status === "ready").length;
  const scanAge = ageMinutes(snapshot.metadata.generatedAt, now);
  const requestDiagnostics = snapshot.metadata.diagnostics?.requests;

  if (archives.length === 0) {
    addIssue(issues, {
      code: "archive_empty",
      detail: "没有扫描归档，无法证明长期扫描连续性。",
      severity: "critical",
    });
  }

  if (snapshot.metadata.status === "failed") {
    addIssue(issues, {
      code: "scan_failed",
      detail: "当前扫描状态为 failed。",
      severity: "critical",
    });
  }

  if (scanAge !== null && scanAge > snapshot.metadata.staleAfterMinutes) {
    addIssue(issues, {
      code: "scan_stale",
      detail: `扫描已 ${scanAge} 分钟未更新，超过 ${snapshot.metadata.staleAfterMinutes} 分钟阈值。`,
      severity: "critical",
    });
  }

  if (eligibleAssets >= 100 && scannedAssets <= 5 && coveragePercent < 5) {
    addIssue(issues, {
      code: "coverage_collapsed",
      detail: `可扫 ${eligibleAssets} 个，但本轮只扫 ${scannedAssets} 个且覆盖率 ${coveragePercent.toFixed(1)}%。`,
      severity: "watch",
    });
  }

  if (
    snapshot.metadata.source === "coinglass" &&
    requestDiagnostics &&
    requestDiagnostics.coinGlassRequestsPlanned > 0 &&
    requestDiagnostics.cleanRows === 0
  ) {
    const upgradeRequired = hasCoinGlassUpgradeFailure(requestDiagnostics);

    addIssue(issues, {
      code: upgradeRequired ? "coinglass_upgrade_required" : "deep_scan_empty",
      detail: upgradeRequired
        ? `CoinGlass 本轮计划深扫 ${requestDiagnostics.coinGlassRequestsPlanned} 个币，但 API 返回 Upgrade plan；当前 Key/套餐没有这些 futures 深扫端点权限，不能生成衍生品证据和交易计划。`
        : `CoinGlass 本轮计划深扫 ${requestDiagnostics.coinGlassRequestsPlanned} 个币，但返回 0 行可用数据；不能把本轮计划资产标成已完成深扫。`,
      severity: "watch",
    });
  }

  if (estimatedFullCycleMinutes !== null && estimatedFullCycleMinutes > 24 * 60) {
    addIssue(issues, {
      code: "long_cycle",
      detail: `预计完整轮转约 ${estimatedFullCycleMinutes} 分钟，长尾机会可能等待过久。`,
      severity: "watch",
    });
  }

  if (runtimeProbes.redis.status !== "healthy") {
    addIssue(issues, {
      code: "redis_unhealthy",
      detail: `Redis 状态为 ${runtimeProbes.redis.status}，扫描锁、心跳和实时轻扫可能受影响。`,
      severity: "critical",
    });
  }

  if (workerDown > 0) {
    addIssue(issues, {
      code: "worker_down",
      detail: `${workerDown} 个 worker 未报告健康心跳。`,
      severity: "critical",
    });
  }

  const status = statusFromIssues(issues);

  return {
    generatedAt: now.toISOString(),
    guardrail: "扫描稳定性报告只用于运维诊断；不能直接生成交易信号。",
    issues,
    rotation: {
      coveragePercent: Number(coveragePercent.toFixed(2)),
      eligibleAssets,
      estimatedFullCycleMinutes,
      pendingAssets,
      scannedAssets,
    },
    runtime: {
      redisStatus: runtimeProbes.redis.status,
      workerDown,
      workerHealthy,
      workerTotal: runtimeProbes.workers.length,
    },
    score: scoreFromIssues(issues),
    status,
    summary: summary(status, issues),
    trend: {
      recentArchives: archives.length,
      recentFailures,
      recentSuccesses,
    },
  };
}
