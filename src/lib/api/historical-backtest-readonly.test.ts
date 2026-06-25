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
          "AI 只能解释证据，不能替代规则引擎。",
        ],
        input: {
          baseInterval: "15m",
          horizonBars: 96,
          topN: 10,
        },
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
    assert.equal(result.data.auditV2?.findings[0]?.id, "PBA-DERIVATIVES-001");
    assert.equal(result.data.auditV2?.remediationPlan[0]?.priority, "P0");
    assert.match(result.data.summary, /历史衍生品证据缺失/);
    assert.match(result.data.nextAction, /补齐历史 OI\/Funding/);
    assert.equal(result.ageSec, 300);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
