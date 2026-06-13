import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeploymentReadinessReport,
  runAdminDeploymentReadiness,
  type DeploymentReadinessReport,
} from "./deployment-readiness";
import type { SystemHealthReport } from "./system-health";

function health(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    generatedAt: "2026-06-13T12:00:00.000Z",
    level: "preview",
    summary: "系统处于预览状态。",
    dataSource: {
      activeSource: "mock",
      configuredProvider: "mock",
      detail: "当前使用演示数据。",
      isRealtime: false,
      mode: "demo",
      status: "preview",
    },
    persistence: {
      databaseDriver: "neon",
      databaseStatus: "ready",
      detail: "已启用 neon SQL client。",
      durable: true,
      mode: "database",
      scope: "public-demo",
    },
    scan: {
      ageMinutes: 2,
      anomalyCount: 4,
      cadenceMinutes: 15,
      candidateCount: 4,
      freshness: "fresh",
      generatedAt: "2026-06-13T11:58:00.000Z",
      nextScanAt: "2026-06-13T12:13:00.000Z",
      riskGate: "on",
      scannedCount: 24,
      status: "ready",
      staleAfterMinutes: 30,
    },
    archive: {
      entries: 1,
      retentionMode: "database",
    },
    coverage: {
      batchIndex: 0,
      coveragePercent: 100,
      eligible: 24,
      nextBatchIndex: 0,
      pending: 0,
      pendingAssets: [],
      scanned: 24,
      scannedAssets: [],
      skipped: 0,
      skippedAssets: [],
      total: 24,
      totalBatches: 1,
    },
    operations: {
      batchDetail: "batch 1/1: BTC",
      lastProblemScanAt: null,
      lastSuccessfulScanAt: "2026-06-13T11:58:00.000Z",
      minutesUntilNextScan: 13,
      minutesUntilStale: 28,
      operatorHint: "扫描链路正常，继续观察下一次自动触发。",
      recentProblemCount: 0,
      recentSuccessCount: 1,
      requestDetail: "requests 1/1, next batch 1",
      runtimeDetail: "scan runtime: updated from test",
      verdict: "healthy",
    },
    guards: [],
    ...overrides,
  };
}

const readyEnv = {
  CRON_SECRET: "a".repeat(64),
  DATABASE_DRIVER: "neon",
  DATABASE_URL: "postgresql://user:pass@example.neon.tech/neondb",
  JOURNAL_API_RATE_LIMIT: "30",
  MARKET_DATA_PROVIDER: "mock",
  PERSISTENCE_SCOPE: "public-demo",
  SCAN_API_RATE_LIMIT: "60",
};

function check(report: DeploymentReadinessReport, id: string) {
  const item = report.checks.find((entry) => entry.id === id);

  assert.ok(item, `missing check ${id}`);

  return item;
}

test("buildDeploymentReadinessReport treats mock data as deployable preview but not production ready", () => {
  const report = buildDeploymentReadinessReport({
    env: readyEnv,
    health: health(),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "preview");
  assert.equal(report.deployable, true);
  assert.equal(report.productionReady, false);
  assert.equal(check(report, "database").state, "ready");
  assert.equal(check(report, "data-source").state, "preview");
  assert.equal(report.environment.databaseDriver, "neon");
  assert.equal(report.environment.persistenceScope, "public-demo");
});

test("buildDeploymentReadinessReport blocks production when database is not durable", () => {
  const report = buildDeploymentReadinessReport({
    env: {
      ...readyEnv,
      DATABASE_URL: "",
    },
    health: health({
      persistence: {
        databaseDriver: "none",
        databaseReason: "database_url_missing",
        databaseStatus: "unconfigured",
        detail: "未配置数据库。",
        durable: false,
        mode: "memory",
        scope: "public-demo",
      },
    }),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.deployable, false);
  assert.equal(report.productionReady, false);
  assert.equal(check(report, "database").state, "blocked");
});

test("buildDeploymentReadinessReport marks live CoinGlass configuration as production ready", () => {
  const report = buildDeploymentReadinessReport({
    env: {
      ...readyEnv,
      COINGLASS_API_KEY: "cg-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    health: health({
      level: "ready",
      dataSource: {
        activeSource: "coinglass",
        configuredProvider: "coinglass",
        detail: "真实数据源。",
        isRealtime: true,
        mode: "live",
        status: "ready",
      },
    }),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(report.status, "ready");
  assert.equal(report.deployable, true);
  assert.equal(report.productionReady, true);
  assert.equal(check(report, "data-source").state, "ready");
});

test("runAdminDeploymentReadiness refuses to run when CRON_SECRET is missing", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: "Bearer anything",
    env: {},
    health: health(),
  });

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, "readiness_secret_missing");
  }
});

test("runAdminDeploymentReadiness rejects the wrong bearer token", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: "Bearer wrong",
    env: readyEnv,
    health: health(),
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, "unauthorized");
  }
});

test("runAdminDeploymentReadiness returns a safe readiness report after authorization", async () => {
  const response = await runAdminDeploymentReadiness({
    authorization: `Bearer ${readyEnv.CRON_SECRET}`,
    env: readyEnv,
    health: health(),
    now: new Date("2026-06-13T12:00:00.000Z"),
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  if (response.body.ok) {
    assert.equal(response.body.report.status, "preview");
    assert.equal(response.body.report.secrets.databaseUrl.present, true);
    assert.equal(response.body.report.secrets.databaseUrl.value, undefined);
    assert.equal(response.body.report.secrets.cronSecret.value, undefined);
  }
});
