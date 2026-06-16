import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseClientDiagnostics } from "../persistence/database-client";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import { buildSystemHealthReport } from "./system-health";
import type { MarketRadarSnapshot, ScanArchiveSummary, ScanReplayFrame } from "../market/types";

function snapshot(
  metadata: Partial<MarketRadarSnapshot["metadata"]> = {},
): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-health",
      mode: "demo",
      status: "ready",
      source: "mock",
      isRealtime: false,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 4,
      candidateCount: 4,
      riskGate: "on",
      generatedAt: "2026-06-12T10:00:00.000Z",
      nextScanAt: "2026-06-12T10:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["演示数据", "scan runtime: updated from Demo Market Provider"],
      ...metadata,
    },
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 29,
        accepted: 24,
        rejected: 4,
        duplicatesRemoved: 1,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals: [],
    journalEvents: [],
  };
}

function archiveSummary(overrides: Partial<ScanArchiveSummary> = {}): ScanArchiveSummary {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    topSymbols: ["ENAUSDT"],
    notes: ["演示数据"],
    ...overrides,
  };
}

function replayFrame(): ScanReplayFrame {
  return {
    id: "scan-health",
    source: "mock",
    status: "ready",
    generatedAt: "2026-06-12T10:00:00.000Z",
    nextScanAt: "2026-06-12T10:15:00.000Z",
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 4,
    candidateCount: 4,
    signals: [],
  };
}

test("buildSystemHealthReport marks mock and memory mode as a visible preview state", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(archiveSummary(), replayFrame());

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "preview");
  assert.equal(report.dataSource.mode, "demo");
  assert.equal(report.dataSource.activeSource, "mock");
  assert.equal(report.dataSource.configuredProvider, "mock");
  assert.equal(report.persistence.mode, "memory");
  assert.equal(report.persistence.durable, false);
  assert.equal(report.archive.entries, 1);
  assert.equal(report.scan.freshness, "fresh");
  assert.equal(report.scan.ageMinutes, 5);
  assert.deepEqual(report.guards.map((guard) => guard.id), [
    "data-source",
    "persistence",
    "freshness",
    "archive",
  ]);
});

test("buildSystemHealthReport reports a degraded provider when CoinGlass is requested without a key", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "coinglass" },
    now: new Date("2026-06-12T10:02:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.dataSource.configuredProvider, "coinglass");
  assert.equal(report.dataSource.status, "missing_key");
  assert.match(report.dataSource.detail, /COINGLASS_API_KEY/);
  assert.equal(report.guards.find((guard) => guard.id === "data-source")?.state, "degraded");
});

test("buildSystemHealthReport exposes database fallback diagnostics instead of hiding them behind memory mode", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const database: DatabaseClientDiagnostics = {
    connectionStringEnv: "DATABASE_URL",
    detail: "检测到 DATABASE_URL，但还没有注入服务端 SQL client，当前安全回落到内存存储。",
    driver: "neon",
    durable: false,
    hasDatabaseUrl: true,
    reason: "sql_client_missing",
    scope: "chuan-public",
    status: "fallback",
  };

  const report = await buildSystemHealthReport({
    database,
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:04:30.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.persistence.databaseStatus, "fallback");
  assert.equal(report.persistence.databaseDriver, "neon");
  assert.equal(report.persistence.databaseReason, "sql_client_missing");
  assert.match(report.persistence.detail, /SQL client/);
  assert.match(
    report.guards.find((guard) => guard.id === "persistence")?.detail ?? "",
    /SQL client/,
  );
});

test("buildSystemHealthReport escalates stale scans past the stale window", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:45:00.000Z"),
    repository,
    snapshot: snapshot({
      status: "stale",
      generatedAt: "2026-06-12T10:00:00.000Z",
      staleAfterMinutes: 30,
    }),
  });

  assert.equal(report.level, "degraded");
  assert.equal(report.scan.freshness, "expired");
  assert.equal(report.scan.ageMinutes, 45);
  assert.equal(report.guards.find((guard) => guard.id === "freshness")?.state, "degraded");
});

test("buildSystemHealthReport exposes scan operation timing and provider notes", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-ready",
      status: "ready",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["ready archive"],
    }),
    replayFrame(),
  );
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-failed",
      status: "failed",
      generatedAt: "2026-06-12T09:45:00.000Z",
      notes: ["provider failed"],
    }),
    replayFrame(),
  );

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "test-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-12T10:04:20.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
      generatedAt: "2026-06-12T10:00:00.000Z",
      nextScanAt: "2026-06-12T10:15:00.000Z",
      notes: [
        "batch 2/3: ENA,SUI,ONDO",
        "requests 3/7, next batch 3",
        "scan runtime: updated from CoinGlass",
      ],
    }),
  });

  assert.equal(report.operations.verdict, "healthy");
  assert.equal(report.operations.lastSuccessfulScanAt, "2026-06-12T10:00:00.000Z");
  assert.equal(report.operations.lastProblemScanAt, "2026-06-12T09:45:00.000Z");
  assert.equal(report.operations.minutesUntilNextScan, 11);
  assert.equal(report.operations.minutesUntilStale, 26);
  assert.equal(report.operations.recentSuccessCount, 1);
  assert.equal(report.operations.recentProblemCount, 1);
  assert.equal(report.operations.batchDetail, "batch 2/3: ENA,SUI,ONDO");
  assert.equal(report.operations.requestDetail, "requests 3/7, next batch 3");
  assert.equal(report.operations.runtimeDetail, "scan runtime: updated from CoinGlass");
});

test("buildSystemHealthReport exposes structured universe coverage", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  const report = await buildSystemHealthReport({
    env: {
      COINGLASS_API_KEY: "test-key",
      MARKET_DATA_PROVIDER: "coinglass",
    },
    now: new Date("2026-06-12T10:04:20.000Z"),
    repository,
    snapshot: snapshot({
      source: "coinglass",
      isRealtime: true,
      coverage: {
        batchIndex: 1,
        coveragePercent: 60,
        eligible: 5,
        nextBatchIndex: 2,
        pending: 2,
        pendingAssets: ["SOL", "SUI"],
        scanned: 3,
        scannedAssets: ["BTC", "ETH", "ENA"],
        skipped: 1,
        skippedAssets: [{ symbol: "OLDUSDT", reason: "inactive" }],
        total: 6,
        totalBatches: 3,
      },
    }),
  });

  assert.equal(report.coverage.coveragePercent, 60);
  assert.equal(report.coverage.scanned, 3);
  assert.equal(report.coverage.pending, 2);
  assert.equal(report.coverage.skipped, 1);
  assert.deepEqual(report.coverage.scannedAssets, ["BTC", "ETH", "ENA"]);
});

test("buildSystemHealthReport marks scan operations blocked without a recent success", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addScanArchive(
    archiveSummary({
      id: "scan-failed",
      status: "failed",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["provider failed"],
    }),
    replayFrame(),
  );

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T10:05:00.000Z"),
    repository,
    snapshot: snapshot({
      status: "failed",
      generatedAt: "2026-06-12T10:00:00.000Z",
      notes: ["scan runtime: provider failed before cache"],
    }),
  });

  assert.equal(report.operations.verdict, "blocked");
  assert.equal(report.operations.lastSuccessfulScanAt, null);
  assert.equal(report.operations.lastProblemScanAt, "2026-06-12T10:00:00.000Z");
  assert.equal(report.operations.recentSuccessCount, 0);
  assert.equal(report.operations.recentProblemCount, 1);
  assert.match(report.operations.operatorHint, /没有成功扫描/);
});

test("buildSystemHealthReport exposes outcome executor coverage from journal events", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addJournalEvent({
    id: "journal-ena-track",
    signalId: "ena-plan",
    symbol: "ENAUSDT",
    title: "纸面跟踪计划",
    result: "watching",
    note: "等待复盘。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000Z",
    action: "paper_trade",
    reviewStatus: "tracking",
    outcomeStatus: "pending",
    plannedReviewAt: "2026-06-12T11:00:00.000Z",
    reviewCheckpoints: [
      {
        id: "1h",
        label: "1h 误报检查",
        reviewAt: "2026-06-12T11:00:00.000Z",
        status: "pending",
      },
    ],
  });
  await repository.addJournalEvent({
    id: "journal-sol-lifecycle",
    signalId: "sol-plan",
    symbol: "SOLUSDT",
    title: "目标前置命中复盘",
    result: "win",
    note: "首目标已到。",
    rankDelta: 2,
    createdAt: "2026-06-12T10:30:00.000Z",
    action: "paper_trade",
    reviewStatus: "closed",
    outcomeStatus: "partial_win",
    firstTargetHit: true,
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.mode, "outcome_executor_mvp");
  assert.equal(report.outcomes.allowedUse, "research_only");
  assert.equal(report.outcomes.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.trackingEvents, 2);
  assert.equal(report.outcomes.pendingEvents, 1);
  assert.equal(report.outcomes.closedEvents, 1);
  assert.equal(report.outcomes.dueEvents, 1);
  assert.equal(report.outcomes.coveragePercent, 50);
  assert.equal(report.outcomes.latestOutcomeAt, "2026-06-12T10:30:00.000Z");
  assert.equal(report.outcomes.status, "reviewing");
  assert.match(report.outcomes.operatorHint, /自动复盘/);
});

test("buildSystemHealthReport exposes the latest outcome executor run summary", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  await repository.addJournalEvent({
    id: "journal-outcome-executor-2026-06-12t10-30-00-000z",
    symbol: "OUTCOME_EXECUTOR",
    title: "自动复盘执行批次",
    result: "watching",
    note: "自动复盘执行：扫描 24，到期 3，写回 1，跳过 2，失败 1。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:30:00.000Z",
    action: "outcome_executor_run",
    reviewStatus: "closed",
    source: "outcome_executor",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    outcomeExecutorRun: {
      dueEvents: 3,
      failedFetches: 1,
      failures: [
        {
          eventId: "journal-tia-track",
          signalId: "tia-plan",
          symbol: "TIAUSDT",
          reason: "network",
          error: "upstream request failed with a long provider error",
        },
      ],
      fetchedCandles: 180,
      scannedEvents: 24,
      skippedReasons: [
        {
          code: "ohlcv_unavailable",
          count: 1,
          label: "行情请求失败",
          symbols: ["TIAUSDT"],
        },
      ],
      skippedEvents: 2,
      writtenEvents: 1,
    },
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.latestRunAt, "2026-06-12T10:30:00.000Z");
  assert.deepEqual(report.outcomes.lastRun, {
    dueEvents: 3,
    failedFetches: 1,
    failureReasons: ["TIAUSDT:network"],
    fetchedCandles: 180,
    ranAt: "2026-06-12T10:30:00.000Z",
    scannedEvents: 24,
    skippedEvents: 2,
    writtenEvents: 1,
  });
  assert.match(report.outcomes.operatorHint, /失败/);
});

test("buildSystemHealthReport segments outcome sample quality without enabling automatic weights", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-win",
    signalId: "win-plan",
    symbol: "ENAUSDT",
    createdAt: "2026-06-12T10:00:00.000Z",
    outcomeStatus: "partial_win",
    result: "win",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-saved",
    signalId: "saved-plan",
    symbol: "SOLUSDT",
    createdAt: "2026-06-12T10:05:00.000Z",
    outcomeStatus: "saved",
    result: "saved",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-loss",
    signalId: "loss-plan",
    symbol: "TIAUSDT",
    createdAt: "2026-06-12T10:10:00.000Z",
    outcomeStatus: "loss",
    result: "loss",
  });
  await repository.addJournalEvent({
    ...baseEvent,
    id: "journal-expired",
    signalId: "expired-plan",
    symbol: "ONDOUSDT",
    createdAt: "2026-06-12T10:15:00.000Z",
    outcomeStatus: "expired",
  });
  await repository.addJournalEvent({
    id: "journal-pending",
    signalId: "pending-plan",
    symbol: "SUIUSDT",
    title: "纸面跟踪计划",
    result: "watching",
    note: "等待复查。",
    rankDelta: 0,
    createdAt: "2026-06-12T10:20:00.000Z",
    outcomeStatus: "pending",
    reviewStatus: "tracking",
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.deepEqual(report.outcomes.sampleQuality, {
    autoWeightEligible: false,
    expiredEvents: 1,
    failedEvents: 1,
    manualReviewReady: false,
    pendingEvents: 1,
    status: "collecting",
    validatedEvents: 2,
  });
});

test("buildSystemHealthReport exposes the read-only calibration flow through manual confirmation and rollback", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  for (let index = 0; index < 8; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `flow-valid-${index}`,
      signalId: `flow-valid-plan-${index}`,
      symbol: `FLOWVALID${index}USDT`,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    });
  }

  for (let index = 0; index < 4; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `flow-counter-${index}`,
      signalId: `flow-counter-plan-${index}`,
      symbol: `FLOWCOUNTER${index}USDT`,
      createdAt: `2026-06-12T10:1${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    });
  }

  await repository.addJournalEvent({
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T10:30:00.000Z",
    id: "flow-calibration-pending",
    note: "规则校准复盘样本。",
    outcomeStatus: "pending",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "tracking",
    source: "daily_mover_calibration",
    symbol: "SUIUSDT",
    title: "规则校准复盘",
  });
  await repository.addJournalEvent({
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id: "flow-strategy-confirmation",
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  });

  for (let index = 0; index < 3; index += 1) {
    await repository.addJournalEvent({
      action: "calibration_review",
      allowedUse: "research_only",
      calibrationTag: "review_volume_oi_weight",
      canAutoAdjustWeights: false,
      createdAt: `2026-06-12T1${index + 2}:00:00.000Z`,
      id: `flow-calibration-loss-${index}`,
      note: "确认后反证样本。",
      outcomeStatus: "loss",
      rankDelta: 0,
      result: "loss",
      reviewStatus: "closed",
      source: "daily_mover_calibration",
      symbol: `LOSS${index}USDT`,
      title: "规则校准复盘",
    });
  }

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T15:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.calibrationFlow.status, "rollback_watch");
  assert.equal(report.outcomes.calibrationFlow.admissionStatus, "ready");
  assert.equal(report.outcomes.calibrationFlow.sampleGateReady, true);
  assert.equal(report.outcomes.calibrationFlow.manualConfirmationEvents, 1);
  assert.equal(report.outcomes.calibrationFlow.calibrationReviewEvents, 4);
  assert.equal(report.outcomes.calibrationFlow.pendingCalibrationReviews, 1);
  assert.equal(report.outcomes.calibrationFlow.rollbackWatchVersions, 1);
  assert.equal(report.outcomes.calibrationFlow.canAutoAdjustWeights, false);
  assert.match(report.outcomes.calibrationFlow.nextStep, /回滚观察/);
});

test("buildSystemHealthReport exposes manual calibration admission for outcome samples", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });
  const baseEvent = {
    note: "样本复盘。",
    rankDelta: 0,
    result: "watching" as const,
    reviewStatus: "closed" as const,
    title: "生命周期复盘",
  };

  for (let index = 0; index < 8; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `journal-valid-${index}`,
      signalId: `valid-plan-${index}`,
      symbol: `VALID${index}USDT`,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      result: index % 2 === 0 ? "win" : "saved",
    });
  }

  for (let index = 0; index < 4; index += 1) {
    await repository.addJournalEvent({
      ...baseEvent,
      id: `journal-counter-${index}`,
      signalId: `counter-plan-${index}`,
      symbol: `COUNTER${index}USDT`,
      createdAt: `2026-06-12T10:1${index}:00.000Z`,
      outcomeStatus: index % 2 === 0 ? "loss" : "expired",
      result: index % 2 === 0 ? "loss" : "watching",
    });
  }

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T11:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.deepEqual(report.outcomes.calibrationAdmission, {
    allowedUse: "research_only",
    autoWeightEligible: false,
    blockers: [],
    canAutoAdjustWeights: false,
    closedEvents: 12,
    counterEvidenceEvents: 4,
    expiredEvents: 2,
    failedEvents: 2,
    guardrail: "outcome 样本准入只服务人工校准和回滚复核，不能自动改权重。",
    manualCalibrationReady: true,
    mode: "manual_calibration_gate",
    nextStep: "样本达到人工校准准入门槛，可以进入人工校准和回滚边界复核，不能自动改权重。",
    pendingEvents: 0,
    readinessScore: 100,
    sampleCount: 12,
    status: "ready",
    validationRatePercent: 67,
    validatedEvents: 8,
  });
});

test("buildSystemHealthReport exposes readonly strategy weight calibration from journal samples", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "public-demo" });

  for (let index = 0; index < 5; index += 1) {
    await repository.addJournalEvent({
      action: "calibration_review",
      allowedUse: "research_only",
      calibrationTag: "review_volume_oi_weight",
      canAutoAdjustWeights: false,
      createdAt: `2026-06-12T10:0${index}:00.000Z`,
      id: `weight-volume-win-${index}`,
      note: "权重校准有效样本。",
      outcomeStatus: index % 2 === 0 ? "partial_win" : "saved",
      rankDelta: 0,
      result: index % 2 === 0 ? "win" : "saved",
      reviewStatus: "closed",
      source: "daily_mover_calibration",
      symbol: `VOL${index}USDT`,
      title: "规则校准复盘",
    });
  }

  await repository.addJournalEvent({
    action: "calibration_review",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T10:10:00.000Z",
    id: "weight-volume-loss",
    note: "权重校准反证样本。",
    outcomeStatus: "loss",
    rankDelta: 0,
    result: "loss",
    reviewStatus: "closed",
    source: "daily_mover_calibration",
    symbol: "VLOSSUSDT",
    title: "规则校准复盘",
  });

  await repository.addJournalEvent({
    action: "strategy_confirmation",
    allowedUse: "research_only",
    calibrationTag: "review_volume_oi_weight",
    canAutoAdjustWeights: false,
    createdAt: "2026-06-12T11:00:00.000Z",
    id: "weight-volume-confirmation",
    note: "人工确认策略版本。",
    rankDelta: 0,
    result: "watching",
    reviewStatus: "closed",
    source: "strategy_version_confirmation",
    strategyDraftId: "strategy-review_volume_oi_weight",
    strategyTag: "review_volume_oi_weight",
    strategyVersionLabel: "draft-volume-oi-weight-v1",
    symbol: "STRATEGY",
    title: "策略版本人工确认",
  });

  const report = await buildSystemHealthReport({
    env: { MARKET_DATA_PROVIDER: "mock" },
    now: new Date("2026-06-12T12:10:00.000Z"),
    repository,
    snapshot: snapshot(),
  });

  assert.equal(report.outcomes.strategyWeightCalibration.mode, "strategy_weight_backtest_calibration_mvp");
  assert.equal(report.outcomes.strategyWeightCalibration.allowedUse, "research_only");
  assert.equal(report.outcomes.strategyWeightCalibration.canAutoAdjustWeights, false);
  assert.equal(report.outcomes.strategyWeightCalibration.status, "manual_review_ready");
  assert.equal(report.outcomes.strategyWeightCalibration.increaseCandidates, 1);
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.tag, "review_volume_oi_weight");
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.recommendation, "increase_candidate");
  assert.equal(report.outcomes.strategyWeightCalibration.candidates[0]?.latestVersionLabel, "draft-volume-oi-weight-v1");
  assert.match(report.outcomes.strategyWeightCalibration.nextStep, /人工复核/);
});
