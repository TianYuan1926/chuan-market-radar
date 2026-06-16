import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import type { SystemHealthReport } from "@/lib/api/system-health";
import {
  buildAlertEvent,
  buildOperationsAlertEvent,
  mergeAlertEventsById,
  notificationCopyForAlert,
  shouldSuppressAlert,
  soundProfileForSeverity,
} from "./alert-policy";

const baseSignal: MarketSignal = {
  id: "ena-near-trigger",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 78,
  risk: "low",
  updatedAt: "2026-06-14T10:00:00.000Z",
  summary: "压缩接近触发，等待回踩确认。",
  evidence: [
    {
      label: "structure",
      value: "compression",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "trigger 10.00",
    invalidation: "stop 9.40",
    targets: ["target 11.20"],
    riskReward: 3.5,
    status: "actionable",
    positionHint: "Only act after trigger confirmation.",
  },
};

type SignalOverrides = Partial<Omit<MarketSignal, "strategy">> & {
  strategy?: Partial<MarketSignal["strategy"]>;
};

function signal(overrides: SignalOverrides = {}): MarketSignal {
  return {
    ...baseSignal,
    ...overrides,
    strategy: {
      ...baseSignal.strategy,
      ...overrides.strategy,
    },
  };
}

function health(overrides: Partial<SystemHealthReport> = {}): SystemHealthReport {
  return {
    generatedAt: "2026-06-14T10:05:00.000Z",
    level: "ready",
    summary: "系统状态可用。",
    dataSource: {
      activeSource: "coinglass",
      configuredProvider: "coinglass",
      detail: "live",
      isRealtime: true,
      mode: "live",
      status: "ready",
    },
    persistence: {
      databaseDriver: "postgres",
      databaseStatus: "ready",
      detail: "durable",
      durable: true,
      mode: "database",
      scope: "public",
    },
    scan: {
      ageMinutes: 3,
      anomalyCount: 4,
      cadenceMinutes: 15,
      candidateCount: 2,
      freshness: "fresh",
      generatedAt: "2026-06-14T10:00:00.000Z",
      nextScanAt: "2026-06-14T10:15:00.000Z",
      riskGate: "on",
      scannedCount: 24,
      status: "ready",
      staleAfterMinutes: 40,
    },
    archive: {
      entries: 3,
      retentionMode: "database",
    },
    coverage: {
      batchIndex: 1,
      coveragePercent: 40,
      eligible: 60,
      nextBatchIndex: 2,
      pending: 36,
      pendingAssets: [],
      scanned: 24,
      scannedAssets: [],
      skipped: 0,
      skippedAssets: [],
      total: 60,
      totalBatches: 3,
    },
    operations: {
      batchDetail: "batch 1/3",
      lastProblemScanAt: null,
      lastSuccessfulScanAt: "2026-06-14T10:00:00.000Z",
      minutesUntilNextScan: 10,
      minutesUntilStale: 35,
      operatorHint: "扫描链路正常。",
      recentProblemCount: 0,
      recentSuccessCount: 3,
      requestDetail: "requests 3/7",
      runtimeDetail: "scan runtime: 1200ms",
      verdict: "healthy",
    },
    outcomes: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      closedEvents: 0,
      coveragePercent: 0,
      dueEvents: 0,
      lastRun: null,
      latestOutcomeAt: null,
      latestRunAt: null,
      mode: "outcome_executor_mvp",
      operatorHint: "还没有自动复盘样本，等待信号进入跟踪队列。",
      pendingEvents: 0,
      sampleQuality: {
        autoWeightEligible: false,
        expiredEvents: 0,
        failedEvents: 0,
        manualReviewReady: false,
        pendingEvents: 0,
        status: "empty",
        validatedEvents: 0,
      },
      status: "idle",
      trackingEvents: 0,
    },
    guards: [],
    ...overrides,
  };
}

test("buildAlertEvent promotes near_trigger signals to high severity", () => {
  const event = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  });

  assert.equal(event?.severity, "high");
  assert.equal(event?.symbol, "ENAUSDT");
  assert.equal(event?.state, "near_trigger");
  assert.equal(event?.sound, "pulse");
  assert.match(event?.title ?? "", /接近触发/);
});

test("buildAlertEvent promotes triggered signals to critical severity", () => {
  const event = buildAlertEvent(signal({
    id: "ena-triggered",
    state: "triggered",
    strategy: {
      status: "actionable",
    },
  }), {
    generatedAt: "2026-06-14T10:01:00.000Z",
    scanId: "scan-2",
  });

  assert.equal(event?.severity, "critical");
  assert.equal(event?.sound, "alarm");
  assert.match(notificationCopyForAlert(event!).body, /失效/);
});

test("shouldSuppressAlert suppresses repeated same-symbol same-state alerts within the dedupe window", () => {
  const first = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  })!;
  const second = buildAlertEvent(signal({
    id: "ena-near-trigger-again",
    updatedAt: "2026-06-14T10:03:00.000Z",
  }), {
    generatedAt: "2026-06-14T10:03:00.000Z",
    scanId: "scan-2",
  })!;

  assert.equal(shouldSuppressAlert(second, [first], new Date("2026-06-14T10:04:00.000Z")), true);
  assert.equal(shouldSuppressAlert(second, [first], new Date("2026-06-14T10:12:00.000Z")), false);
});

test("mergeAlertEventsById keeps one stable event per alert id", () => {
  const first = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T10:00:00.000Z",
    scanId: "scan-1",
  })!;
  const duplicate = {
    ...first,
    detail: "newer detail",
    generatedAt: "2026-06-14T10:01:00.000Z",
  };
  const other = buildAlertEvent(signal({
    symbol: "SUIUSDT",
  }), {
    generatedAt: "2026-06-14T10:02:00.000Z",
    scanId: "scan-1",
  })!;

  const merged = mergeAlertEventsById([duplicate, first, other], 5);

  assert.deepEqual(merged.map((event) => event.id), [duplicate.id, other.id]);
  assert.equal(merged[0].detail, "newer detail");
});

test("quiet hours suppress sound but keep alert event copy available", () => {
  const profile = soundProfileForSeverity("high", {
    now: new Date("2026-06-14T15:30:00.000Z"),
    quietHours: {
      endHour: 8,
      startHour: 23,
      timeZone: "Asia/Shanghai",
    },
  });
  const event = buildAlertEvent(signal(), {
    generatedAt: "2026-06-14T15:30:00.000Z",
    scanId: "scan-quiet",
  })!;

  assert.equal(profile.muted, true);
  assert.equal(profile.shouldPlay, false);
  assert.equal(event.severity, "high");
  assert.match(notificationCopyForAlert(event).title, /ENA/);
});

test("buildOperationsAlertEvent creates an operations alert for stale or failed scan state", () => {
  const stale = buildOperationsAlertEvent(health({
    level: "degraded",
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "stale",
    },
    operations: {
      ...health().operations,
      operatorHint: "扫描结果已经过期，需要确认定时任务是否继续运行。",
      verdict: "attention",
    },
  }));
  const failed = buildOperationsAlertEvent(health({
    level: "blocked",
    scan: {
      ...health().scan,
      freshness: "expired",
      status: "failed",
    },
    operations: {
      ...health().operations,
      operatorHint: "当前扫描失败，先处理接口鉴权、数据源或持久化错误。",
      verdict: "blocked",
    },
  }));

  assert.equal(stale?.severity, "operations");
  assert.equal(stale?.type, "system_stale");
  assert.equal(failed?.severity, "critical");
  assert.equal(failed?.type, "system_failed");
  assert.match(failed?.detail ?? "", /扫描失败/);
});
