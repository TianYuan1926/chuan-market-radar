import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "../analysis/types";
import type { MarketRadarSnapshot } from "../market/types";
import type { SystemHealthReport } from "./system-health";
import { buildBusinessCapabilityReport } from "./business-capability";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "arb-signal",
    symbol: "ARBUSDT",
    exchange: "BINANCE",
    direction: "long",
    state: "near_trigger",
    timeframe: "15m",
    regime: "risk_on",
    confidence: 82,
    risk: "medium",
    updatedAt: "2026-06-20T08:00:00.000Z",
    summary: "ARB 证据融合信号。",
    evidence: [],
    maturity: {
      canAttachTradePlan: false,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "证据融合信号",
      reasons: ["has_structured_evidence"],
      stage: "EVIDENCE_SIGNAL",
    },
    strategy: {
      bias: "long",
      entry: "1.000",
      invalidation: "0.940",
      positionHint: "人工确认",
      riskReward: 3.4,
      status: "waiting",
      targets: ["1.180"],
    },
    ...overrides,
  };
}

function snapshot(): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-business-capability",
      mode: "scheduled",
      status: "ready",
      source: "coinglass",
      isRealtime: true,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 4,
      candidateCount: 4,
      riskGate: "on",
      generatedAt: "2026-06-20T08:00:00.000Z",
      nextScanAt: "2026-06-20T08:15:00.000Z",
      staleAfterMinutes: 30,
      notes: ["scan runtime: updated from coinglass"],
      lightScan: {
        acceptedCount: 420,
        candidateCount: 36,
        generatedAt: "2026-06-20T08:00:00.000Z",
        notes: ["public light scan ready"],
        requestCount: 2,
        source: "public-light-composite",
        status: "ready",
        topCandidates: [],
        universeCount: 520,
      },
      signalMaturity: {
        candidateLaneSymbols: ["BAKEUSDT"],
        counts: {
          DEEP_SCAN_CANDIDATE: 1,
          EVIDENCE_SIGNAL: 1,
          LIGHT_SCAN_MARK: 36,
          REVIEW_ONLY: 0,
          TRADE_PLAN_READY: 0,
        },
        guardrail: "轻扫标记不进入主信号区。",
        mainSignalSymbols: ["ARBUSDT"],
        rules: ["LIGHT_SCAN_MARK is scheduling input only"],
        tradePlanReadySymbols: [],
      },
      coverage: {
        batchIndex: 2,
        coveragePercent: 30,
        eligible: 480,
        nextBatchIndex: 3,
        pending: 456,
        pendingAssets: ["SUI", "MANTA"],
        scanned: 24,
        scannedAssets: ["BTC", "ETH", "ARB"],
        skipped: 0,
        skippedAssets: [],
        total: 520,
        totalBatches: 20,
        rotationAudit: {
          fairnessRules: ["anchor slots do not count against altcoin rotation"],
          guardrail: "轮转审计只解释扫描分配健康度，不增加请求。",
          mode: "scan_rotation_audit_v1",
          operatorHint: "轮转可用但仍需展示排队资产。",
          priorityQueue: {
            queuedAssets: ["SUI"],
            queuedCount: 1,
            selectedPriorityAssets: ["ARB"],
          },
          slots: {
            anchorSlots: 2,
            dynamicPrioritySlots: 2,
            explorationReserveSlots: 1,
            rotatingSlots: 19,
            selectedLongTailAssets: ["BAKE"],
            selectedNonAnchorAssets: ["ARB", "BAKE"],
          },
          status: "watch",
          timing: {
            cadenceMinutes: 15,
            estimatedFullCycleMinutes: 300,
            estimatedFullCycleWindows: 20,
            pendingNonAnchorAssets: 456,
          },
          warnings: [],
        },
      },
    },
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 480,
        duplicatesRemoved: 0,
        marketTypes: ["perpetual"],
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        rejected: 40,
        total: 520,
      },
    },
    instruments: [],
    journalEvents: [],
    signals: [
      signal({
        aiReview: {
          status: "reviewed",
          boundary: {
            allowedUse: "counter_evidence_review_only",
            canAutoExecute: false,
            canCreateTradeSignal: false,
            canMutateLiveRanking: false,
            canOverrideDecision: false,
            cost: {
              maxPromptChars: 12_000,
              maxSignalsPerSnapshot: 3,
              model: "deterministic-counter-review-v1",
              provider: "rule-engine",
              status: "within_budget",
            },
            replayCalibration: {
              allowedUse: "manual_replay_calibration_only",
              canAutoAdjustWeights: false,
              requiresOutcomeSample: true,
              tag: "rule_counter_evidence_review",
            },
            summary: "外部 AI 已取消；当前只做代码规则反证复核。",
          },
          counterEvidence: ["1h 压力仍需确认"],
          sections: {
            fact: "facts",
            failurePath: "failure",
            judgment: "judgment",
            reasoning: "reasoning",
            strategy: "strategy",
            uncertainty: "uncertainty",
          },
        },
      }),
    ],
    tickers: [],
  };
}

function health(): SystemHealthReport {
  return {
    generatedAt: "2026-06-20T08:01:00.000Z",
    archive: {
      detail: "ready",
      entries: 8,
      retentionMode: "database",
      status: "ready",
    },
    coverage: snapshot().metadata.coverage!,
    fullMarketCoverage: {
      coverage: {
        estimatedFullCycleMinutes: 300,
      },
      highPriority: {
        queuedAssets: ["SUI"],
      },
      operatorHint: "全市场轮转中。",
      rotationAudit: snapshot().metadata.coverage!.rotationAudit!,
      status: "rotating",
    },
    outcomes: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      closedEvents: 6,
      coveragePercent: 50,
      dueEvents: 0,
      latestOutcomeAt: "2026-06-20T07:00:00.000Z",
      latestRunAt: "2026-06-20T07:30:00.000Z",
      mode: "outcome_executor_mvp",
      operatorHint: "自动复盘正在收集样本。",
      pendingEvents: 6,
      sampleQuality: {
        autoWeightEligible: false,
        expiredEvents: 1,
        failedEvents: 1,
        manualReviewReady: false,
        pendingEvents: 6,
        status: "collecting",
        validatedEvents: 4,
      },
      status: "collecting",
      strategyWeightCalibration: {
        closedSamples: 6,
        sampleCount: 8,
      },
      strategyWeightShadow: {
        approvedRecordCount: 1,
      },
      strategyWeightShadowEvaluation: {
        blockedCount: 0,
        evaluatedShadowCount: 2,
        improvingCount: 1,
        mixedCount: 1,
        nextStep: "继续影子观察。",
        rollbackWatchCount: 0,
        status: "mixed",
      },
      trackingEvents: 12,
    },
    strategyEvolutionLoop: {
      blockers: [],
      guardrail: "进化闭环只读，不自动改权重。",
      nextActions: ["继续收集 outcome 样本。"],
      operatorHint: "继续观察。",
      readinessScore: 66,
      stages: [
        {
          count: 6,
          detail: "有样本",
          id: "outcome_samples",
          label: "outcome 复盘",
          status: "watch",
        },
      ],
      status: "collecting_samples",
    },
    v3ForwardMapReviews: {
      latestReviewAt: "2026-06-20T07:00:00.000Z",
      lastRun: {
        reviewedSnapshots: 3,
      },
      operatorHint: "Forward Map 复盘已覆盖。",
      savedSnapshots: 5,
      status: "covered",
    },
    v3StrategyLoop: {
      review: {
        closedSamples: 6,
        patternStatus: "review_ready",
        pendingSamples: 2,
        sampleCount: 8,
        topPatternLabel: "双底",
        topTradePlanLabel: "等待回踩",
      },
    },
  } as unknown as SystemHealthReport;
}

test("buildBusinessCapabilityReport exposes the full core radar business chain", () => {
  const report = buildBusinessCapabilityReport({
    health: health(),
    snapshot: snapshot(),
  });

  assert.equal(report.schemaVersion, "business-capability.v1");
  assert.equal(report.allowedUse, "research_only");
  assert.equal(report.canAutoExecute, false);
  assert.equal(report.canAutoAdjustWeights, false);
  assert.equal(report.stages.length, 14);
  assert.deepEqual(report.stages.map((stage) => stage.id), [
    "source_truth",
    "full_market_discovery",
    "candidate_rotation",
    "deep_scan_verification",
    "signal_maturity",
    "analysis_reasoning",
    "risk_reward_gate",
    "signal_lifecycle",
    "outcome_standard",
    "historical_case_replay",
    "strategy_family_stats",
    "shadow_tracking",
    "ai_counter_review",
    "evolution_suggestions",
  ]);
  assert.match(report.operatingRules.join("\n"), /扫描 -> 候选 -> 深扫 -> 结构分析 -> 风险赔率 -> 交易计划 -> 复盘进化/);
  assert.equal(report.stages.find((stage) => stage.id === "ai_counter_review")?.status, "ready");
  assert.match(report.operatingRules.join("\n"), /最低 3:1 盈亏比是下限/);
  assert.match(report.frontendContracts.join("\n"), /事实源、覆盖、候选、深扫、分析、风控、复盘/u);
});
