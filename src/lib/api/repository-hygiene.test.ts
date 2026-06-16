import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function lines(path: string) {
  return new Set(
    readFileSync(resolve(process.cwd(), path), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

test("repository ignore files keep local agent tooling and preview screenshots out of deployable source", () => {
  const gitignore = lines(".gitignore");
  const vercelignore = lines(".vercelignore");
  const requiredPatterns = [
    ".agents/",
    ".codex/",
    "/chuan-quant-heatmap-v4.png",
    "/chuan-v31-main-desktop.png",
    "/chuan-v31-main-mobile.png",
    "/dribbble-quant-reference.png",
    "/flow-14-preview.png",
    "/flow-15-preview.png",
    "/flow-16-preview.png",
    "skills-lock.json",
  ];

  for (const pattern of requiredPatterns) {
    assert.ok(gitignore.has(pattern), `.gitignore missing ${pattern}`);
    assert.ok(vercelignore.has(pattern), `.vercelignore missing ${pattern}`);
  }
});

test("public radar shell does not label the live site as demo data", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );

  assert.equal(workspaceSource.includes("公开模板 · 演示数据 · 非实时扫描"), false);
  assert.match(workspaceSource, /CoinGlass/);
});

test("radar UI exposes premium pixel cockpit anchors without relying on prose", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const petSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/pixel-s680.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(workspaceSource, /studio-scan-grid/);
  assert.match(workspaceSource, /signal-rhythm/);
  assert.match(petSource, /s680-dashboard/);
  assert.match(petSource, /s680-vital/);
  assert.match(cssSource, /\.studio-scan-grid/);
  assert.match(cssSource, /\.signal-rhythm/);
  assert.match(cssSource, /\.s680-dashboard/);
  assert.match(cssSource, /prefers-reduced-motion/);
});

test("public radar UI keeps reader-facing controls Chinese-first", () => {
  const sourceFiles = [
    "src/components/radar/chart-panel.tsx",
    "src/components/radar/event-center-panel.tsx",
    "src/components/radar/journal-panel.tsx",
    "src/components/radar/radar-workspace.tsx",
    "src/components/radar/radar-table.tsx",
    "src/components/radar/rank-panel.tsx",
    "src/components/radar/replay-panel.tsx",
    "src/components/radar/strategy-card.tsx",
    "src/components/radar/system-health-panel.tsx",
    "src/components/radar/pixel-s680.tsx",
  ];
  const combinedSource = sourceFiles
    .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
    .join("\n");
  const requiredChineseLabels = [
    "雷达中枢",
    "候选池",
    "策略模型",
    "禁止追单",
    "反证检查",
    "执行计划",
    "系统状态",
    "事件中心",
    "结构主图",
    "复盘记录",
    "扫描回放",
    "段位系统",
    "未选择",
    "像素副驾驶",
    "BTC 项链",
    "装备",
    "纪律",
    "动量",
    "热度",
    "S680 模式",
  ];
  const disallowedReaderLabels = [
    "ENGINE FEED",
    "MODEL",
    "NO CHASE",
    "CHECK",
    "PERSONALITY",
    "DISC",
    "MOM",
    "HEAT",
    "S680 MODE",
    "NONE",
  ];

  for (const label of requiredChineseLabels) {
    assert.match(combinedSource, new RegExp(label));
  }

  for (const label of disallowedReaderLabels) {
    assert.equal(combinedSource.includes(label), false, `reader-facing label should be localized: ${label}`);
  }
});

test("strategy card exposes a compact multi-timeframe indicator matrix", () => {
  const strategySource = readFileSync(resolve(process.cwd(), "src/components/radar/strategy-card.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredLabels = [
    "指标矩阵",
    "周期",
    "EMA",
    "MACD",
    "RSI",
    "POC",
    "价值区",
  ];
  const requiredClasses = [
    "indicator-matrix",
    "indicator-frame",
    "indicator-pill",
    "volume-node",
  ];

  for (const label of requiredLabels) {
    assert.match(strategySource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(strategySource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("strategy card keeps raw matrix evidence out of the compact evidence list", () => {
  const strategySource = readFileSync(resolve(process.cwd(), "src/components/radar/strategy-card.tsx"), "utf8");

  assert.match(strategySource, /matrixEvidenceLabels/);
  assert.match(strategySource, /"多周期指标矩阵"/);
  assert.match(strategySource, /"成交量分布"/);
  assert.match(strategySource, /!matrixEvidenceLabels\.has\(item\.label\)/);
});

test("S680 pet is built from bespoke pixel sedan geometry instead of a flat image", () => {
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/pixel-s680.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredGeometryParts = [
    "s680-hood",
    "s680-window",
    "s680-chrome",
    "s680-tail",
    "s680-face",
    "s680-eye",
    "s680-shadow",
    "s680-grille",
  ];

  assert.equal(componentSource.includes("<img"), false);

  for (const part of requiredGeometryParts) {
    assert.match(componentSource, new RegExp(part));
    assert.match(cssSource, new RegExp(`\\.${part}`));
  }
});

test("pixel copilot MVP renders a BTC-necklace male avatar with equipment and no callout copy", () => {
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/pixel-s680.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredCopilotText = [
    "像素副驾驶",
    "BTC 项链",
    "装备",
  ];
  const requiredCopilotClasses = [
    "copilot-avatar",
    "copilot-head",
    "copilot-hair",
    "copilot-expression",
    "copilot-chain",
    "copilot-medallion",
    "copilot-gear",
    "copilot-level-strip",
  ];
  const disallowedCalloutWords = [
    "买入",
    "卖出",
    "开多",
    "开空",
    "做多",
    "做空",
    "梭哈",
  ];

  assert.equal(componentSource.includes("<img"), false);

  for (const label of requiredCopilotText) {
    assert.match(componentSource, new RegExp(label));
  }

  for (const className of requiredCopilotClasses) {
    assert.match(componentSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  for (const word of disallowedCalloutWords) {
    assert.equal(componentSource.includes(word), false, `copilot voice must not include callout copy: ${word}`);
  }
});

test("external scan scheduler calls the protected scan endpoint without hard-coded secrets", () => {
  const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/chuan-scan-cron.yml"),
    "utf8",
  );

  assert.match(workflowSource, /cron:\s*["']\*\/30 \* \* \* \*["']/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /-X POST "\$CHUAN_SCAN_URL"/);
  assert.match(workflowSource, /Authorization: Bearer \$CHUAN_CRON_SECRET/);
  assert.match(workflowSource, /secrets\.CHUAN_SCAN_URL/);
  assert.match(workflowSource, /secrets\.CHUAN_CRON_SECRET/);
  assert.doesNotMatch(workflowSource, /web-brown-rho-95\.vercel\.app/);
  assert.doesNotMatch(workflowSource, /CRON_SECRET=/);
});

test("external daily mover scheduler calls the protected ingest endpoint once per day", () => {
  const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/chuan-daily-movers.yml"),
    "utf8",
  );

  assert.match(workflowSource, /cron:\s*["']17 0 \* \* \*["']/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /-X POST "\$CHUAN_DAILY_MOVER_INGEST_URL"/);
  assert.match(workflowSource, /Authorization: Bearer \$CHUAN_CRON_SECRET/);
  assert.match(workflowSource, /api\/admin\/daily-movers\/ingest/);
  assert.match(workflowSource, /secrets\.CHUAN_DAILY_MOVER_INGEST_URL/);
  assert.match(workflowSource, /secrets\.CHUAN_CRON_SECRET/);
  assert.doesNotMatch(workflowSource, /web-brown-rho-95\.vercel\.app/);
  assert.doesNotMatch(workflowSource, /CRON_SECRET=/);
});

test("external outcome executor scheduler calls the protected outcome endpoint hourly", () => {
  const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/chuan-outcome-executor.yml"),
    "utf8",
  );

  assert.match(workflowSource, /cron:\s*["']23 \* \* \* \*["']/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /CHUAN_SCAN_BASE="\$\{CHUAN_SCAN_URL%\/\}"/);
  assert.match(workflowSource, /CHUAN_OUTCOME_EXECUTOR_URL="\$\{CHUAN_SCAN_BASE%\/api\/scan\}\/api\/admin\/outcomes\/run"/);
  assert.match(workflowSource, /-X POST "\$CHUAN_OUTCOME_EXECUTOR_URL"/);
  assert.match(workflowSource, /Authorization: Bearer \$CHUAN_CRON_SECRET/);
  assert.match(workflowSource, /api\/admin\/outcomes\/run/);
  assert.match(workflowSource, /secrets\.CHUAN_SCAN_URL/);
  assert.match(workflowSource, /secrets\.CHUAN_CRON_SECRET/);
  assert.doesNotMatch(workflowSource, /web-brown-rho-95\.vercel\.app/);
  assert.doesNotMatch(workflowSource, /CRON_SECRET=/);
});

test("public daily mover archive API is exposed as a read-only route", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/daily-movers/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /export async function GET/);
  assert.match(routeSource, /getDailyMoverReadArchive/);
  assert.match(routeSource, /cache-control/);
  assert.match(routeSource, /x-chuan-daily-movers-storage/);
  assert.equal(routeSource.includes("export async function POST"), false);
});

test("protected daily mover kline cache fill API is exposed as a POST-only admin route", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/daily-movers/klines/fill/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /runAdminDailyMoverKlineCacheFill/);
  assert.match(routeSource, /authorization/);
  assert.match(routeSource, /x-chuan-daily-mover-kline-cache-fill/);
  assert.equal(routeSource.includes("export async function GET"), false);
});

test("protected outcome executor API is exposed as a POST-only admin route", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/outcomes/run/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /runAdminOutcomeExecutor/);
  assert.match(routeSource, /authorization/);
  assert.match(routeSource, /x-chuan-outcome-executor/);
  assert.equal(routeSource.includes("export async function GET"), false);
});

test("system health UI exposes outcome executor status and coverage", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/system-health-panel.tsx"),
    "utf8",
  );

  assert.match(componentSource, /自动复盘/);
  assert.match(componentSource, /覆盖率/);
  assert.match(componentSource, /待复查/);
  assert.match(componentSource, /到期/);
  assert.match(componentSource, /最近写回/);
  assert.match(componentSource, /最近执行/);
  assert.match(componentSource, /写回/);
  assert.match(componentSource, /跳过/);
  assert.match(componentSource, /失败/);
  assert.match(componentSource, /样本质量/);
  assert.match(componentSource, /准入门槛/);
  assert.match(componentSource, /准入分/);
  assert.match(componentSource, /人工校准/);
  assert.match(componentSource, /校准流/);
  assert.match(componentSource, /人工确认/);
  assert.match(componentSource, /回滚观察/);
  assert.match(componentSource, /待校准/);
  assert.match(componentSource, /阻断项/);
  assert.match(componentSource, /不改权重/);
  assert.match(componentSource, /有效/);
  assert.match(componentSource, /反证/);
  assert.match(componentSource, /过期/);
  assert.match(componentSource, /health-outcomes/);
  assert.match(componentSource, /health-outcome-run/);
  assert.match(componentSource, /health-outcome-quality/);
  assert.match(componentSource, /health-outcome-admission/);
  assert.match(componentSource, /health-outcome-flow/);
});

test("journal panel exposes outcome executor batch details without turning them into trades", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/journal-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredLabels = [
    "自动复盘",
    "执行批次",
    "跳过原因",
    "扫描",
    "到期",
    "写回",
    "失败",
    "只读审计",
    "不改权重",
  ];
  const requiredSkipLabels = [
    "未到窗口",
    "已关闭去重",
    "缺少上下文",
    "行情请求失败",
    "结果待判定",
  ];
  const requiredClasses = [
    "review-row--executor",
    "executor-run-grid",
    "executor-skip-reasons",
  ];

  assert.match(componentSource, /outcome_executor_run/);
  assert.match(componentSource, /outcomeExecutorRun/);
  assert.match(componentSource, /canAutoAdjustWeights/);

  for (const label of requiredLabels) {
    assert.match(componentSource, new RegExp(label));
  }

  for (const label of requiredSkipLabels) {
    assert.match(componentSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(componentSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("public radar UI exposes daily mover attribution as a research-only review panel", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const panelSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/daily-mover-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredLabels = [
    "每日异动复盘",
    "归因复盘",
    "样本库",
    "规则校准",
    "加入复盘队列",
    "校准反馈",
    "只读趋势",
    "回测候选",
    "人工确认",
    "样本验证",
    "只读验证",
    "日记验证",
    "不是完整 K 线回测",
    "策略草案",
    "策略版本草案",
    "确认草案",
    "已确认",
    "确认后表现",
    "只读反馈",
    "后续样本",
    "版本表现",
    "回滚边界",
    "禁止",
    "关联摘要",
    "扫描关联",
    "日记关联",
    "校准候选",
    "命中已复盘",
    "漏判有证据",
    "不用于追涨杀跌",
    "抓到",
    "漏判",
  ];
  const requiredClasses = [
    "daily-mover-module",
    "daily-mover-ledger",
    "daily-mover-review",
    "daily-mover-history",
    "daily-mover-correlation",
    "daily-mover-correlation__stats",
    "daily-mover-correlation__links",
    "daily-mover-calibration__button",
    "daily-mover-feedback",
    "daily-mover-feedback__stats",
    "daily-mover-backtest",
    "daily-mover-backtest__stats",
    "daily-mover-validation",
    "daily-mover-validation__stats",
    "daily-mover-strategy",
    "daily-mover-strategy__stats",
    "daily-mover-strategy__button",
    "daily-mover-performance",
    "daily-mover-performance__stats",
    "daily-mover-version",
    "daily-mover-version__stats",
  ];
  const disallowedTradeWords = [
    "买入",
    "卖出",
    "开多",
    "开空",
    "做多",
    "做空",
    "梭哈",
  ];

  assert.match(pageSource, /getDailyMoverReadArchive/);
  assert.match(pageSource, /dailyMoverArchive/);
  assert.match(workspaceSource, /DailyMoverPanel/);
  assert.match(workspaceSource, /dailyMoverArchive/);
  assert.match(workspaceSource, /createDailyMoverCalibrationReview/);
  assert.match(workspaceSource, /createDailyMoverStrategyConfirmation/);
  assert.match(panelSource, /allowedUse/);
  assert.match(panelSource, /research_only/);
  assert.match(panelSource, /onCreateCalibrationReview/);
  assert.match(panelSource, /onConfirmStrategyDraft/);
  assert.match(panelSource, /calibrationFeedback/);
  assert.match(panelSource, /backtestCandidates/);
  assert.match(panelSource, /backtestValidations/);
  assert.match(panelSource, /strategyDrafts/);
  assert.match(panelSource, /strategyPerformanceFeedback/);
  assert.match(panelSource, /strategyVersionPerformance/);
  assert.match(panelSource, /selectedCorrelation/);
  assert.match(panelSource, /correlationStatusLabel/);
  assert.match(
    readFileSync(resolve(process.cwd(), "src/app/api/journal/route.ts"), "utf8"),
    /calibration_review/,
  );
  assert.match(
    readFileSync(resolve(process.cwd(), "src/app/api/journal/route.ts"), "utf8"),
    /strategy_confirmation/,
  );

  for (const label of requiredLabels) {
    assert.match(panelSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(panelSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  for (const word of disallowedTradeWords) {
    assert.equal(panelSource.includes(word), false, `daily mover panel must not include trade instruction copy: ${word}`);
  }
});
