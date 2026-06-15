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
