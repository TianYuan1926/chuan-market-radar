import assert from "node:assert/strict";
import test from "node:test";
import type { MarketRadarSnapshot } from "../market/types";
import type { BusinessCapabilityReport } from "./business-capability";
import type { SystemHealthReport } from "./system-health";
import { buildCoreChainGovernanceReport } from "./core-chain-governance";

function businessCapability(): BusinessCapabilityReport {
  const stages: BusinessCapabilityReport["stages"] = [
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
  ].map((id) => ({
    id: id as BusinessCapabilityReport["stages"][number]["id"],
    title: id,
    status: id === "ai_counter_review" ? "disabled" : "ready",
    score: id === "ai_counter_review" ? 25 : 90,
    summary: `${id} summary`,
    evidence: [`${id} evidence`],
    nextAction: `${id} next`,
    guardrail: `${id} guardrail`,
  }));

  return {
    schemaVersion: "business-capability.v1",
    generatedAt: "2026-06-24T08:00:00.000Z",
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    canAutoExecute: false,
    canMutateLiveRanking: false,
    frontendContracts: [],
    gaps: [],
    mode: "business_capability_loop_v1",
    nextActions: [],
    operatingRules: [],
    operatorHint: "ready",
    readinessScore: 88,
    stages,
    status: "watch",
  };
}

function snapshot(): MarketRadarSnapshot {
  return {
    metadata: {
      id: "scan-core-chain",
      mode: "scheduled",
      status: "ready",
      source: "coinglass",
      isRealtime: true,
      cadenceMinutes: 15,
      scannedCount: 24,
      anomalyCount: 3,
      candidateCount: 3,
      riskGate: "on",
      generatedAt: "2026-06-24T08:00:00.000Z",
      nextScanAt: "2026-06-24T08:15:00.000Z",
      staleAfterMinutes: 30,
      notes: [],
      signalMaturity: {
        candidateLaneSymbols: ["TIAUSDT"],
        counts: {
          DEEP_SCAN_CANDIDATE: 1,
          EVIDENCE_SIGNAL: 1,
          LIGHT_SCAN_MARK: 24,
          REVIEW_ONLY: 0,
          TRADE_PLAN_READY: 0,
        },
        guardrail: "候选不能冒充交易计划。",
        mainSignalSymbols: ["ARBUSDT"],
        rules: ["TRADE_PLAN_READY is the only sniper-board layer"],
        tradePlanReadySymbols: [],
      },
    },
    derivatives: [],
    heatmap: [],
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        accepted: 0,
        duplicatesRemoved: 0,
        marketTypes: [],
        minVolume24hUsd: 0,
        quoteAssets: [],
        rejected: 0,
        total: 0,
      },
    },
    instruments: [],
    journalEvents: [],
    signals: [],
    tickers: [],
  };
}

function health(): SystemHealthReport {
  return {
    generatedAt: "2026-06-24T08:00:00.000Z",
    reviewStatistics: {
      allowedUse: "research_only",
      canAutoAdjustWeights: false,
      canMutateLiveRanking: false,
      generatedAt: "2026-06-24T08:00:00.000Z",
      guardrail: "样本不足不能宣传胜率。",
      mae: {
        averagePercent: 0,
        maxPercent: 0,
      },
      mfe: {
        averagePercent: 0,
        maxPercent: 0,
      },
      outcomeBuckets: [],
      sampleStatus: "collecting",
      samples: {
        closed: 0,
        evidenceLevel: 0,
        pending: 2,
        total: 2,
        tradePlanReady: 0,
        withMetrics: 0,
      },
      summary: "样本收集中。",
      winRate: {
        expiredExcludedPercent: null,
        rawResolvedPercent: null,
      },
    },
  } as unknown as SystemHealthReport;
}

test("buildCoreChainGovernanceReport keeps the site centered on the trading-value chain", () => {
  const report = buildCoreChainGovernanceReport({
    businessCapability: businessCapability(),
    health: health(),
    snapshot: snapshot(),
  });

  assert.equal(report.schemaVersion, "core-chain-governance.v1");
  assert.equal(report.canCreateTradeSignal, false);
  assert.match(report.coreObjective, /提前发现有潜力的山寨币异动/u);
  assert.deepEqual(report.chain.map((step) => step.id), [
    "full_market_discovery",
    "candidate_filtering",
    "deep_scan_verification",
    "structure_analysis",
    "risk_reward_gate",
    "trade_plan_readiness",
    "review_evolution",
  ]);
  assert.equal(report.chain.find((step) => step.id === "trade_plan_readiness")?.status, "partial");
  assert.match(report.chain.find((step) => step.id === "candidate_filtering")?.guardrail ?? "", /不能进入狙击榜/u);
  assert.ok(report.featureTriage.some((item) =>
    item.id === "mock_market_facts" &&
    item.classification === "delete" &&
    item.action === "delete"
  ));
  assert.ok(report.featureTriage.some((item) =>
    item.id === "rank_pet_eggs" &&
    item.classification === "supporting" &&
    item.action === "downgrade"
  ));
  assert.ok(report.pageRoles.some((page) =>
    page.route === "/token/[id]" &&
    page.role === "core" &&
    page.mustShow.some((item) => /触发/u.test(item))
  ));
  assert.ok(report.apiRoles.some((api) =>
    api.route === "/api/frontend/radar-contract" &&
    api.role === "core" &&
    api.mustNotDo.some((item) => /生成交易计划/u.test(item))
  ));
  assert.equal(report.p0Completion.percent, 100);
  assert.equal(report.p0Completion.status, "ready");
  assert.deepEqual(report.p0Completion.remaining, []);
  assert.ok(report.p0Completion.checks.every((check) => check.status === "pass"));
  assert.match(report.cleanupRules.join("\n"), /前端展示能力不能强于后端真实能力/u);
  assert.match(report.operatingSequence.join(" -> "), /RR 是否至少 3:1/u);
});
