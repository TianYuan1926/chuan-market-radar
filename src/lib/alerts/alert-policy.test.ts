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
      calibrationAdmission: {
        allowedUse: "research_only",
        autoWeightEligible: false,
        blockers: ["closed_samples_below_threshold"],
        canAutoAdjustWeights: false,
        closedEvents: 0,
        counterEvidenceEvents: 0,
        expiredEvents: 0,
        failedEvents: 0,
        guardrail: "outcome 样本准入只服务人工校准和回滚复核，不能自动改权重。",
        manualCalibrationReady: false,
        mode: "manual_calibration_gate",
        nextStep: "继续积累 outcome 样本，只读观察有效、反证和过期比例。",
        pendingEvents: 0,
        readinessScore: 0,
        sampleCount: 0,
        status: "collecting",
        validationRatePercent: 0,
        validatedEvents: 0,
      },
      calibrationFlow: {
        admissionStatus: "collecting",
        allowedUse: "research_only",
        autoWeightEligible: false,
        blockerDetails: [
          {
            code: "closed_samples_below_threshold",
            detail: "已关闭样本不足，当前只能继续观察。",
            label: "样本不足",
            nextStep: "继续积累已关闭 outcome 样本，不进入权重讨论。",
            severity: "watch",
          },
        ],
        calibrationReviewEvents: 0,
        canAutoAdjustWeights: false,
        checkpoints: [
          {
            detail: "继续积累 outcome 样本并观察阻断项。",
            id: "sample_admission",
            label: "样本准入",
            status: "collecting",
          },
          {
            detail: "0 个人工确认 / 0 个校准复盘。",
            id: "manual_confirmation",
            label: "人工确认",
            status: "waiting",
          },
          {
            detail: "0 个版本进入回滚观察。",
            id: "rollback_boundary",
            label: "回滚边界",
            status: "waiting",
          },
        ],
        confirmedStrategyVersions: 0,
        guardrail: "outcome 校准流只读展示样本准入、人工确认和回滚边界，不能自动改权重。",
        manualConfirmationEvents: 0,
        manualReviewVersions: 0,
        mode: "outcome_calibration_readonly_flow",
        nextStep: "继续积累 outcome 样本和校准复盘，不进入策略版本确认。",
        pendingCalibrationReviews: 0,
        retainedObservationVersions: 0,
        rollbackWatchVersions: 0,
        sampleBreakdown: {
          expired: 0,
          pending: 0,
          rejected: 0,
          validated: 0,
        },
        sampleDrilldown: [],
        sampleGateReady: false,
        status: "collecting_samples",
        thresholdLayers: [
          {
            current: "0 已关闭",
            detail: "已关闭样本不足，继续等待 outcome executor 写回。",
            id: "sample_floor",
            label: "样本地板",
            nextStep: "继续积累已关闭样本，不进入确认流程。",
            status: "collecting",
            target: ">= 12 已关闭样本",
          },
          {
            current: "0% 有效率",
            detail: "有效率只用于人工校准准入，不能直接升级策略权重。",
            id: "validation_quality",
            label: "有效率阈值",
            nextStep: "有效率达到基础线后仍需人工确认。",
            status: "collecting",
            target: ">= 50% 有效已关闭样本",
          },
          {
            current: "0 反证 / 0 有效",
            detail: "反证不能压过有效样本；一旦反证占优，策略只能降级或进入观察。",
            id: "counterevidence_pressure",
            label: "反证压力",
            nextStep: "保留反证监控，等待更多样本验证。",
            status: "ready",
            target: "反证不高于有效样本，且亏损不形成聚集",
          },
          {
            current: "0 个人工确认",
            detail: "策略版本必须经过人工确认后才能进入长期表现观察。",
            id: "manual_confirmation",
            label: "人工确认",
            nextStep: "等待人工确认策略版本和适用边界。",
            status: "collecting",
            target: ">= 1 个人工确认版本",
          },
          {
            current: "0 回滚观察 / 0 人工复核",
            detail: "确认后反证会触发回滚观察；该层只冻结加权讨论，不写权重。",
            id: "rollback_pressure",
            label: "回滚压力",
            nextStep: "继续按确认后样本观察保留、复核或回滚边界。",
            status: "collecting",
            target: "0 个回滚观察版本，或明确人工降级理由",
          },
        ],
        rollbackPlan: {
          allowedUse: "research_only",
          canAutoAdjustWeights: false,
          checkpoints: [
            {
              detail: "0 个人工确认版本。",
              id: "confirm_version",
              label: "确认版本",
              nextStep: "先人工确认策略版本。",
              status: "waiting",
            },
            {
              detail: "0 个校准复盘仍待复查。",
              id: "observe_followups",
              label: "观察样本",
              nextStep: "用已关闭样本判断保留、复核或回滚。",
              status: "waiting",
            },
            {
              detail: "0 回滚观察 / 0 保留观察。",
              id: "freeze_or_retain",
              label: "冻结或保留",
              nextStep: "继续积累 outcome 样本和校准复盘，不进入权重讨论。",
              status: "waiting",
            },
          ],
          guardrail: "回滚计划只服务人工复核和版本边界，不自动写入策略权重。",
          mode: "manual_rollback_plan",
          nextStep: "继续积累 outcome 样本和校准复盘，不进入权重讨论。",
          severity: "low",
          stage: "collect_samples",
          trigger: "样本仍在收集中，尚未进入策略版本回滚判断。",
        },
      },
      strategyWeightCalibration: {
        allowedUse: "research_only",
        canAutoAdjustWeights: false,
        candidateCount: 0,
        candidates: [],
        closedSamples: 0,
        decreaseCandidates: 0,
        guardrail: "策略权重回测校准 MVP 只输出人工候选和审计边界，不自动写入策略权重。",
        increaseCandidates: 0,
        mode: "strategy_weight_backtest_calibration_mvp",
        nextStep: "继续积累校准样本，暂不进入权重校准讨论。",
        pendingCandidates: 0,
        quarantineCandidates: 0,
        sampleCount: 0,
        status: "collecting",
      },
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
