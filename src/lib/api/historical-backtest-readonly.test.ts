import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getLatestHistoricalBacktestResource } from "./historical-backtest-readonly";

async function writeReport(root: string, id: string, payload: unknown, summary: string, mtime: Date) {
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  const findingsPath = path.join(dir, "findings.json");
  const summaryPath = path.join(dir, "summary.md");
  await writeFile(findingsPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(summaryPath, summary, "utf8");
  await utimes(findingsPath, mtime, mtime);
  await utimes(summaryPath, mtime, mtime);
}

test("historical backtest readonly returns empty when no report exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chuan-hbt-empty-"));

  try {
    const result = await getLatestHistoricalBacktestResource({
      now: new Date("2026-06-25T12:00:00.000Z"),
      roots: [root],
    });

    assert.equal(result.status, "empty");
    assert.equal(result.data.status, "empty");
    assert.match(result.reason ?? "", /未发现/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("historical backtest readonly parses latest report into frontend state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chuan-hbt-ready-"));

  try {
    await writeReport(
      root,
      "old-report",
      {
        generatedAt: "2026-06-23T08:00:00.000Z",
        laneMetrics: {},
        symbolsUsed: ["BTCUSDT"],
      },
      "# old",
      new Date("2026-06-23T08:00:00.000Z"),
    );
    await writeReport(
      root,
      "new-report",
      {
        diagnostics: {
          missedOpportunities: [
            {
              change24hPct: 1.2,
              direction: "LONG",
              mfePct: 18.5,
              observedAt: "2026-06-24T08:00:00.000Z",
              opportunityScore: 55,
              reasons: ["波动压缩"],
              symbol: "ALICEUSDT",
            },
          ],
          radarReasonMetrics: [
            {
              avgMaePct: 3,
              avgMfePct: 12,
              count: 8,
              hitRatePct: 25,
              lateRatePct: 5,
              reason: "波动压缩",
            },
          ],
          radarScoreBuckets: [
            {
              avgMaePct: 2,
              avgMfePct: 8,
              count: 10,
              hitRatePct: 20,
              label: "40-60",
              lateRatePct: 4,
            },
          ],
        },
        findings: [
          {
            detail: "radar=14% momentum=26%",
            id: "HBT-SIGNAL-001",
            severity: "medium",
            title: "雷达候选命中率没有跑赢追涨榜基线",
          },
        ],
        generatedAt: "2026-06-24T08:00:00.000Z",
        laneMetrics: {
          momentum: { count: 100, hitCount: 26, hitRatePct: 26, lateRatePct: 44 },
          radar: {
            avgMaePct: 4,
            avgMfePct: 10,
            avgOpportunityScore: 62,
            count: 100,
            falsePositiveRatePct: 86,
            hitCount: 14,
            hitRatePct: 14,
            lateCount: 4,
            lateRatePct: 4,
          },
          random: { count: 100, hitCount: 12, hitRatePct: 12, lateRatePct: 5 },
          volume: { count: 100, hitCount: 20, hitRatePct: 20, lateRatePct: 8 },
        },
        options: {
          horizonBars: 96,
          moveThresholdPct: 8,
          topN: 10,
        },
        replayTimes: 10,
        sourceCounts: {
          "binance-public-futures": 36,
          "bybit-public-linear": 4,
        },
        symbolsUsed: ["BTCUSDT", "ETHUSDT"],
      },
      `# Chuan Market Radar Historical Backtest

## 输入

- 数据源：binance-public-futures:36, bybit-public-linear:4
- 周期：15m
- 天数：14
- 使用币种：40
- 回放时间点：10
- 每轮候选数：10
- 未来验证窗口：96 根 K 线
- 命中阈值：8%
`,
      new Date("2026-06-24T08:00:00.000Z"),
    );

    const result = await getLatestHistoricalBacktestResource({
      now: new Date("2026-06-24T09:00:00.000Z"),
      roots: [root],
    });

    assert.equal(result.status, "cached");
    assert.equal(result.data.status, "ready");
    assert.equal(result.data.reportId, "new-report");
    assert.equal(result.data.input.days, 14);
    assert.equal(result.data.input.horizonBars, 96);
    assert.equal(result.data.input.symbolsUsed, 2);
    assert.equal(result.data.lanes.radar.hitRatePct, 14);
    assert.equal(result.data.diagnostics.missedOpportunities[0]?.symbol, "ALICEUSDT");
    assert.match(result.data.summary, /未跑赢 24h 涨跌幅基线/);
    assert.equal(result.ageSec, 3600);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("historical backtest readonly exposes professional audit v2 findings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chuan-pba-ready-"));

  try {
    await writeReport(
      root,
      "professional-report",
      {
        baselineMetrics: {
          momentum: {
            avgConfidence: 42,
            avgMaePct: 3.2,
            avgMfePct: 9.4,
            avgMoveAtSelectionPct: 12,
            avgVolumeRatio: 1.5,
            count: 5,
            hitCount: 2,
            hitRatePct: 40,
            lane: "momentum",
            lateCount: 3,
            lateRatePct: 60,
          },
          radar: {
            avgConfidence: 62,
            avgMaePct: 2.8,
            avgMfePct: 11.4,
            avgMoveAtSelectionPct: 4.5,
            avgVolumeRatio: 1.8,
            count: 5,
            hitCount: 3,
            hitRatePct: 60,
            lane: "radar",
            lateCount: 1,
            lateRatePct: 20,
          },
          random: {
            avgConfidence: 38,
            avgMaePct: 4.1,
            avgMfePct: 7.2,
            avgMoveAtSelectionPct: 3.1,
            avgVolumeRatio: 1.1,
            count: 5,
            hitCount: 1,
            hitRatePct: 20,
            lane: "random",
            lateCount: 0,
            lateRatePct: 0,
          },
          volume: {
            avgConfidence: 44,
            avgMaePct: 3.5,
            avgMfePct: 8.5,
            avgMoveAtSelectionPct: 5.5,
            avgVolumeRatio: 2.2,
            count: 5,
            hitCount: 2,
            hitRatePct: 40,
            lane: "volume",
            lateCount: 1,
            lateRatePct: 20,
          },
        },
        auditRound: {
          candidateUniverseSize: 80,
          completedAt: "2026-06-25T08:10:00.000Z",
          completedNodes: 1,
          currentNodeRole: null,
          currentSymbol: null,
          generatedAt: "2026-06-25T08:00:00.000Z",
          guardrails: [
            "审计节点可以用未来结果做测试标签，但分析引擎在 observedAt 只能读取历史数据。",
          ],
          nodes: [
            {
              capturedByRadar: true,
              coinType: "layer1_layer2",
              coinTypeLabel: "L1 / L2",
              confidence: 66,
              direction: "long",
              findingCount: 1,
              hit: true,
              lateAtSelection: false,
              maePct: 2.4,
              maturity: "DEEP_SCAN_CANDIDATE",
              mfePct: 16.2,
              moveAtSelectionPct: 2.1,
              nodeIndex: 120,
              nodeRole: "pre_move",
              observedAt: "2026-06-24T10:00:00.000Z",
              opportunityLane: "early_setup",
              opportunityLaneLabel: "启动前机会",
              opportunityLaneScore: 82.5,
              planBlockers: ["reward_risk_below_minimum"],
              qualityHit: true,
              radarRank: 2,
              radarScore: 74.2,
              rewardRisk: 2.4,
              selectedAsOpportunity: true,
              selectedLane: "early_setup",
              symbol: "SUIUSDT",
              timeframeBand: "small",
              tradePlanStatus: "WAIT_PULLBACK",
              validationWindowBars: 16,
              validationWindowHours: 4,
              validationWindowLabel: "4h",
              topN: 10,
              volumeRatio: 1.7,
            },
          ],
          nodesPerSymbol: 10,
          phase: "completed",
          plannedSymbols: [
            {
              coinType: "layer1_layer2",
              coinTypeLabel: "L1 / L2",
              symbol: "SUIUSDT",
            },
          ],
          schemaVersion: "professional-backtest-audit-round-progress.v1",
          status: "completed",
          summary: "10x10 专业审计完成。",
          totalNodes: 10,
          updatedAt: "2026-06-25T08:10:00.000Z",
        },
        cases: [
          {
            symbol: "TIAUSDT",
          },
        ],
        findings: [
          {
            detail: "历史衍生品快照缺失，无法验证 OI/Funding 是否支持当时信号。",
            id: "PBA-DERIVATIVES-001",
            layer: "derivatives",
            nextAction: "接入 CoinGlass 或公开交易所历史衍生品快照后重跑。",
            rootCause: "回测只能看到 K 线，不能看到当时资金质量。",
            severity: "high",
            title: "历史衍生品证据未参与专业回测",
          },
        ],
        generatedAt: "2026-06-25T08:00:00.000Z",
        guardrails: [
          "专业回测审计只验证系统能力，不承诺未来收益。",
          "规则反证只能解释证据，不能替代规则引擎。",
        ],
        input: {
          baseInterval: "15m",
          horizonBars: 96,
          topN: 10,
        },
        missedOpportunities: [
          {
            coinType: "layer1_layer2",
            coinTypeLabel: "L1 / L2",
            confidence: 54,
            direction: "long",
            maePct: 2.1,
            mfePct: 18.4,
            moveAtSelectionPct: 2.8,
            nodeRole: "pullback_retest",
            observedAt: "2026-06-24T10:00:00.000Z",
            opportunityLane: "pullback_retest",
            opportunityLaneLabel: "回踩/反抽确认机会",
            planBlockers: ["reaction_not_confirmed"],
            radarRank: 27,
            reason: "未进入 radar topN。",
            rewardRisk: 3.4,
            symbol: "SUIUSDT",
            timeframeBand: "medium",
            tradePlanStatus: "WAIT_PULLBACK",
            validationWindowLabel: "24h",
            volumeRatio: 1.9,
          },
        ],
        coreCapabilityMetrics: [
          {
            failedNodes: 6,
            id: "scan",
            keyMetrics: {
              captureRatePct: 40,
              missedEarlyQualityHitCount: 1,
            },
            label: "扫描：提前发现能力",
            mainFailures: [
              {
                code: "scan_capture_low",
                count: 6,
                detail: "机会捕获率不足。",
                label: "机会捕获率不足",
                nextAction: "复查候选排序。",
                sampleSymbols: ["SUIUSDT"],
              },
            ],
            nextAction: "先修扫描。",
            passedNodes: 4,
            passRatePct: 40,
            score: 52,
            status: "watch",
            summary: "扫描能力仍需继续验证。",
            testedNodes: 10,
          },
        ],
        opportunityLaneMetrics: [
          {
            avgRadarRank: 2,
            avgRadarScore: 74.2,
            captureRatePct: 100,
            capturedCount: 1,
            hitCount: 1,
            hitRatePct: 100,
            label: "启动前机会",
            lane: "early_setup",
            lateCount: 0,
            lateRatePct: 0,
            missedEarlyHitCount: 0,
            missedEarlyQualityHitCount: 1,
            planReadyCount: 0,
            qualityHitCount: 1,
            qualityHitRatePct: 100,
            selectedCount: 1,
            totalNodes: 1,
          },
        ],
        planBlockerMetrics: [
          {
            blocker: "reward_risk_below_minimum",
            capturedCount: 1,
            category: "rr",
            conditionalWaitCount: 1,
            count: 1,
            diagnosis: "needs_level_audit",
            label: "结构盈亏比低于 3:1",
            lateCount: 0,
            qualityHitCount: 1,
            riskReviewCount: 0,
            sampleContexts: [{
              capturedByRadar: true,
              hit: true,
              lateAtSelection: false,
              nodeRole: "pre_move",
              opportunityLane: "early_setup",
              qualityHit: true,
              rewardRisk: 2.7,
              symbol: "SUIUSDT",
              tradePlanStatus: "WAIT_PULLBACK",
            }],
            sampleSymbols: ["SUIUSDT"],
          },
        ],
        remediationPlan: [
          {
            acceptanceCriteria: "连续两轮报告不再出现 PBA-DERIVATIVES-001。",
            action: "补齐历史 OI/Funding 快照源，并将其注入专业回测。",
            canAutoApply: false,
            layer: "derivatives",
            priority: "P0",
            targetModule: "src/lib/backtest/professional-audit.ts",
          },
        ],
        roundSummary: {
          cases: 1,
          highSeverityFindings: 1,
          planReadyCount: 0,
          testedCapabilities: 6,
        },
        schemaVersion: "professional-backtest-audit-report.v2",
        summary: "专业回测 v2 发现高优先级问题：历史衍生品证据缺失。",
        timingMetrics: {
          earlyCount: 4,
          earlyRatePct: 80,
          lateCount: 1,
          lateRatePct: 20,
          noPlanCount: 5,
          planReadyCount: 0,
        },
      },
      `# Professional Backtest Audit v2

## 输入

- 数据源：binance-public-futures
- 周期：15m
- 未来验证窗口：96 根 K 线
- 每轮候选数：10
`,
      new Date("2026-06-25T08:00:00.000Z"),
    );

    const result = await getLatestHistoricalBacktestResource({
      now: new Date("2026-06-25T08:05:00.000Z"),
      roots: [root],
    });

    assert.equal(result.status, "partial");
    assert.equal(result.data.status, "degraded");
    assert.equal(result.data.auditV2?.schemaVersion, "professional-backtest-audit-report.v2");
    assert.equal(result.data.auditV2?.cases, 1);
    assert.equal(result.data.auditV2?.highSeverityFindings, 1);
    assert.equal(result.data.auditV2?.baselineMetrics.radar.hitRatePct, 60);
    assert.equal(result.data.lanes.radar.count, 5);
    assert.equal(result.data.lanes.radar.hitRatePct, 60);
    assert.equal(result.data.lanes.radar.avgOpportunityScore, 62);
    assert.equal(result.data.auditV2?.timingMetrics.lateRatePct, 20);
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.symbol, "SUIUSDT");
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.radarRank, 27);
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.nodeRole, "pullback_retest");
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.opportunityLane, "pullback_retest");
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.tradePlanStatus, "WAIT_PULLBACK");
    assert.equal(result.data.auditV2?.missedOpportunities[0]?.validationWindowLabel, "24h");
    assert.equal(result.data.auditV2?.coreCapabilityMetrics[0]?.id, "scan");
    assert.equal(result.data.auditV2?.coreCapabilityMetrics[0]?.mainFailures[0]?.label, "机会捕获率不足");
    assert.equal(result.data.auditV2?.opportunityLaneMetrics[0]?.lane, "early_setup");
    assert.equal(result.data.auditV2?.opportunityLaneMetrics[0]?.captureRatePct, 100);
    assert.equal(result.data.auditV2?.opportunityLaneMetrics[0]?.qualityHitRatePct, 100);
    assert.equal(result.data.auditV2?.planBlockerMetrics[0]?.label, "结构盈亏比低于 3:1");
    assert.equal(result.data.auditV2?.planBlockerMetrics[0]?.category, "rr");
    assert.equal(result.data.auditV2?.planBlockerMetrics[0]?.diagnosis, "needs_level_audit");
    assert.equal(result.data.auditV2?.planBlockerMetrics[0]?.qualityHitCount, 1);
    assert.equal(result.data.auditV2?.planBlockerMetrics[0]?.sampleContexts[0]?.tradePlanStatus, "WAIT_PULLBACK");
    assert.equal(result.data.auditV2?.findings[0]?.id, "PBA-DERIVATIVES-001");
    assert.equal(result.data.auditV2?.remediationPlan[0]?.priority, "P0");
    assert.equal(result.data.progress?.schemaVersion, "professional-backtest-audit-round-progress.v1");
    assert.equal(result.data.progress?.candidateUniverseSize, 80);
    assert.equal(result.data.progress?.nodes[0]?.nodeRole, "pre_move");
    assert.equal(result.data.progress?.nodes[0]?.opportunityLane, "early_setup");
    assert.equal(result.data.progress?.nodes[0]?.qualityHit, true);
    assert.equal(result.data.progress?.nodes[0]?.selectedAsOpportunity, true);
    assert.equal(result.data.progress?.nodes[0]?.validationWindowLabel, "4h");
    assert.equal(result.data.auditV2?.auditRound?.plannedSymbols[0]?.symbol, "SUIUSDT");
    assert.match(result.data.summary, /历史衍生品证据缺失/);
    assert.match(result.data.nextAction, /补齐历史 OI\/Funding/);
    assert.equal(result.ageSec, 300);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("historical backtest readonly exposes running professional audit progress without final report", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chuan-pba-progress-"));

  try {
    await writeFile(path.join(root, "latest-progress.json"), JSON.stringify({
      candidateUniverseSize: 80,
      completedAt: null,
      completedNodes: 3,
      currentNodeRole: "early_volume_expansion",
      currentSymbol: "SUIUSDT",
      generatedAt: "2026-06-25T08:00:00.000Z",
      guardrails: ["回测只用于找问题。"],
      nodes: [],
      nodesPerSymbol: 10,
      phase: "evaluating_nodes",
      plannedSymbols: [
        {
          coinType: "layer1_layer2",
          coinTypeLabel: "L1 / L2",
          symbol: "SUIUSDT",
        },
      ],
      schemaVersion: "professional-backtest-audit-round-progress.v1",
      status: "running",
      summary: "正在审计 SUIUSDT 3/10。",
      totalNodes: 10,
      updatedAt: "2026-06-25T08:03:00.000Z",
    }, null, 2), "utf8");

    const result = await getLatestHistoricalBacktestResource({
      now: new Date("2026-06-25T08:04:00.000Z"),
      roots: [root],
    });

    assert.equal(result.status, "partial");
    assert.equal(result.data.progress?.status, "running");
    assert.equal(result.data.progress?.candidateUniverseSize, 80);
    assert.equal(result.data.progress?.currentSymbol, "SUIUSDT");
    assert.equal(result.data.input.replayTimes, 3);
    assert.equal(result.ageSec, 60);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
