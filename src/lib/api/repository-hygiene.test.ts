import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

function listRepositoryFiles(root: string): string[] {
  const rootPath = resolve(process.cwd(), root);
  const entries = readdirSync(rootPath);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = resolve(rootPath, entry);
    const relativePath = `${root}/${entry}`;
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...listRepositoryFiles(relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files;
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

test("strategy engine v2 specs exist and ban liquidation heatmap modules", () => {
  const requiredSpecs = [
    "docs/CORE_STRATEGY_SPEC.md",
    "docs/EVIDENCE_ENGINE_SPEC.md",
    "docs/INDICATOR_RULES.md",
    "docs/DATA_RULES.md",
    "docs/GOLDEN_CASES.md",
  ];
  const requiredSpecTokens = [
    /EvidenceItem/,
    /不使用清算热力图|Liquidation Heatmap|LiquidationZone|heatmap provider|清算区/,
    /report_generator|report generator|报告层/,
  ];
  const bannedPathTokens = [
    "liquidation-heatmap",
    "liquidation-zone",
    "liquidation_heatmap",
    "liquidation_zone",
    "heatmap-provider",
  ];
  const bannedImplementationPatterns = [
    /LiquidationHeatmap/u,
    /LiquidationZone/u,
    /HeatmapProvider/u,
    /liquidation heatmap provider/iu,
  ];

  for (const specPath of requiredSpecs) {
    assert.equal(existsSync(resolve(process.cwd(), specPath)), true, `${specPath} must exist`);

    const specSource = readFileSync(resolve(process.cwd(), specPath), "utf8");

    for (const token of requiredSpecTokens) {
      assert.match(specSource, token, `${specPath} missing strategy v2 guard token ${token}`);
    }
  }

  const sourceFiles = listRepositoryFiles("src");

  for (const filePath of sourceFiles) {
    const normalizedPath = filePath.toLowerCase();

    for (const token of bannedPathTokens) {
      assert.equal(
        normalizedPath.includes(token),
        false,
        `source path must not implement liquidation heatmap modules: ${filePath}`,
      );
    }
  }

  for (const filePath of sourceFiles.filter((path) => !path.endsWith("repository-hygiene.test.ts"))) {
    const source = readFileSync(resolve(process.cwd(), filePath), "utf8");

    for (const pattern of bannedImplementationPatterns) {
      assert.doesNotMatch(source, pattern, `source file must not implement liquidation heatmap modules: ${filePath}`);
    }
  }
});

test("altcoin trend radar v3 specs and blueprint stay aligned", () => {
  const requiredSpecs = [
    "docs/MARKET_READING_SPEC.md",
    "docs/KEY_LEVEL_ENGINE_SPEC.md",
    "docs/RISK_GATE_SPEC.md",
  ];
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");

  assert.match(blueprintSource, /Altcoin Trend Radar v3/);
  assert.match(blueprintSource, /Market Reading Engine/);
  assert.match(blueprintSource, /Key Level Engine/);
  assert.match(blueprintSource, /Forward Level Map/);
  assert.match(blueprintSource, /trend_switch_review/);
  assert.match(blueprintSource, /forward_map_review/);
  assert.match(blueprintSource, /S680 从常规宠物和常规 UI 主线删除|剔除 S680/);

  for (const specPath of requiredSpecs) {
    assert.equal(existsSync(resolve(process.cwd(), specPath)), true, `${specPath} must exist`);

    const source = readFileSync(resolve(process.cwd(), specPath), "utf8");

    assert.match(source, /Altcoin Trend Radar v3|v3/u);
    assert.doesNotMatch(source, /LiquidationHeatmap|LiquidationZone|HeatmapProvider/u);
  }
});

test("market test script runs nested compiled tests recursively", () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const marketTestScript = packageJson.scripts?.["test:market"] ?? "";

  assert.match(marketTestScript, /find \.tmp\/market-tests\/lib/);
  assert.match(marketTestScript, /-name '\*\.test\.js'/);
  assert.match(marketTestScript, /xargs node --test/);
});

test("current public radar shell uses the CHUANSCAN live-data baseline", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const legacyShellPaths = [
    "src/components/radar/radar-workspace.tsx",
    "src/components/radar/top-radar-bar.tsx",
    "src/components/radar/radar-cockpit-shell.tsx",
    "src/components/radar/radar-boot-briefing.tsx",
    "src/components/radar/ops-and-filter-panel.tsx",
    "src/components/radar/pixel-copilot.tsx",
  ];
  const disallowedTokens = [
    "公开模板 · 演示数据 · 非实时扫描",
    "API 延迟 82ms",
    "67,892.1",
    "3,712.45",
    "153.21",
    "36.9%",
    "24%",
  ];

  assert.match(pageSource, /ChuanScanWorkspace/);
  assert.doesNotMatch(pageSource, /RadarWorkspace/);
  assert.match(workspaceSource, /marketTapeItems\(tickers\)/);
  assert.match(workspaceSource, /liveContract\.source\.activeSource/);
  assert.match(workspaceSource, /scanCoverage\.scannedAssets/);
  assert.match(cssSource, /\.chuan-scan-shell/);

  for (const token of disallowedTokens) {
    assert.equal(workspaceSource.includes(token), false, `CHUANSCAN must not hardcode fake live value: ${token}`);
  }

  for (const path of legacyShellPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), false, `${path} should not remain as current UI shell`);
  }
});

test("CHUANSCAN startup motion exposes brand identity without background music or marketing shell", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "bootVisible",
    "chuan-boot",
    "CHUANSCAN",
    "REAL-TIME ALTCOIN TREND RADAR",
    "证据链启动中",
    "进入雷达",
    "ChuanLogo",
  ];
  const requiredCssTokens = [
    ".chuan-boot",
    ".chuan-boot__grid",
    ".chuan-boot__bar",
    ".chuan-logo",
    "prefers-reduced-motion",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.ok(workspaceSource.includes(token), `CHUANSCAN workspace missing startup token: ${token}`);
  }

  for (const token of requiredCssTokens) {
    assert.ok(cssSource.includes(token), `globals.css missing CHUANSCAN startup token: ${token}`);
  }

  assert.equal(workspaceSource.includes("背景音乐"), false);
  assert.equal(workspaceSource.includes("<audio"), false);
});

test("public radar UI keeps reader-facing controls Chinese-first", () => {
  const sourceFiles = [
    "src/components/radar/chuan-scan-workspace.tsx",
    "src/components/radar/chart-panel.tsx",
    "src/components/radar/daily-mover-panel.tsx",
    "src/components/radar/event-center-panel.tsx",
    "src/components/radar/journal-panel.tsx",
    "src/components/radar/radar-table.tsx",
    "src/components/radar/rank-panel.tsx",
    "src/components/radar/replay-panel.tsx",
    "src/components/radar/signal-dossier.tsx",
    "src/components/radar/strategy-card.tsx",
    "src/components/radar/system-health-panel.tsx",
  ];
  const combinedSource = sourceFiles
    .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
    .join("\n");
  const requiredChineseLabels = [
    "异动雷达",
    "候选池",
    "策略模型",
    "禁止追单",
    "反证检查",
    "执行计划",
    "系统状态",
    "事件中心",
    "系统结构图",
    "复盘记录",
    "扫描回放",
    "段位系统",
    "未选择",
    "川川助手",
    "纪律",
    "动量",
    "交易计划",
    "证据链",
    "信号档案",
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

test("public radar UI opens a selected CHUANSCAN dossier and keeps the legacy dossier module reusable", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "DossierOverlay",
    "dossierSignalId",
    "openDossier",
    "closeDossier",
    "chuan-dossier",
    "信号档案",
    "证据链",
    "交易计划",
    "相关复盘",
    "打开 TradingView",
  ];
  const requiredLabels = [
    "信号档案",
    "当前上下文",
    "证据链",
    "执行策略",
    "失效条件",
    "TradingView",
    "每日异动关联",
    "复盘记录",
    "告警状态",
    "副驾驶反馈",
    "关闭档案",
    "同一标的联动",
  ];
  const requiredClasses = [
    "signal-dossier",
    "signal-dossier--open",
    "signal-dossier__backdrop",
    "signal-dossier__drawer",
    "signal-dossier__hero",
    "signal-dossier__section",
    "signal-dossier__evidence",
    "signal-dossier__journal",
    "signal-dossier__movers",
    "signal-dossier__actions",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

  assert.match(dossierSource, /buildTradingViewUrl/);
  assert.match(dossierSource, /onCreateJournalEntry/);

  for (const label of requiredLabels) {
    assert.match(dossierSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(dossierSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  assert.match(cssSource, /\.chuan-dossier/);
});

test("public radar UI reset uses the CHUANSCAN control-center shell instead of the old cockpit", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  const requiredWorkspaceTokens = [
    "chuan-topbar",
    "chuan-market-strip",
    "chuan-kpi-grid",
    "chuan-radar-card-grid",
    "chuan-drawer",
    "chuan-side-card",
    "chuan-proof-card",
    "chuan-assistant-card",
    "activeSection",
    "川",
    "Radar",
    "Signals",
    "Review",
    "Journal",
    "Evolution",
    "Settings",
  ];
  const requiredCssTokens = [
    ".chuan-topbar",
    ".chuan-market-strip",
    ".chuan-kpi-grid",
    ".chuan-radar-card-grid",
    ".chuan-drawer",
    ".chuan-side-card",
    ".chuan-proof-card",
    ".chuan-assistant-card",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

  for (const token of requiredCssTokens) {
    assert.match(cssSource, new RegExp(token.replaceAll(".", "\\.")));
  }

  assert.doesNotMatch(workspaceSource, /TopRadarBar|RadarCockpitShell|OpsAndFilterPanel|PixelCopilot/);
  assert.doesNotMatch(workspaceSource, /radar-action-rail|signal-arena-command|workspace-drawer|companion-dock/);
});

test("radar UI exposes strategy v2 traceability without liquidation heatmap concepts", () => {
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const boardSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/altcoin-opportunity-board.tsx"),
    "utf8",
  );
  const combinedSource = `${dossierSource}\n${boardSource}`;

  assert.match(dossierSource, /strategyV2/u);
  assert.match(dossierSource, /evidenceTrace/u);
  assert.match(dossierSource, /supportEvidenceIds/u);
  assert.match(dossierSource, /counterEvidenceIds/u);
  assert.match(boardSource, /strategyV2StageLabel/u);
  assert.match(boardSource, /strategyV2DecisionLabel/u);
  assert.doesNotMatch(combinedSource, /清算热力图|LiquidationHeatmap|LiquidationZone|heatmap provider|潜在清算区/iu);
});

test("signal dossier exposes v3 key levels and forward map as readonly context", () => {
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const typesSource = readFileSync(resolve(process.cwd(), "src/lib/analysis/types.ts"), "utf8");

  assert.match(typesSource, /strategyV3/u);
  assert.match(dossierSource, /strategyV3/u);
  assert.match(dossierSource, /关键位地图/u);
  assert.match(dossierSource, /趋势上下文/u);
  assert.match(dossierSource, /多周期结构/u);
  assert.match(dossierSource, /盘面结构/u);
  assert.match(dossierSource, /Forward Map/u);
  assert.match(dossierSource, /canMutateLiveRanking/u);
  assert.match(dossierSource, /trendContext/u);
  assert.match(dossierSource, /locationRiskReward/u);
  assert.match(dossierSource, /reactionQuality/u);
  assert.match(dossierSource, /trendIntegrity/u);
  assert.match(dossierSource, /tradePlan/u);
  assert.match(dossierSource, /patternLibrary/u);
  assert.match(dossierSource, /patternTypeLabel/u);
  assert.match(dossierSource, /FIBONACCI_PULLBACK/u);
  assert.match(dossierSource, /位置\/RR/u);
  assert.match(dossierSource, /回踩\/反抽/u);
  assert.match(dossierSource, /趋势完整度/u);
  assert.match(dossierSource, /v3 计划草案/u);
  assert.match(dossierSource, /形态辅助/u);
  assert.match(dossierSource, /signal-dossier__v3-location/u);
  assert.match(dossierSource, /signal-dossier__v3-reaction/u);
  assert.match(dossierSource, /signal-dossier__v3-integrity/u);
  assert.match(dossierSource, /signal-dossier__v3-trade-plan/u);
  assert.match(dossierSource, /signal-dossier__v3-pattern/u);
  assert.match(dossierSource, /signal-dossier__v3-levels/u);
  assert.match(dossierSource, /signal-dossier__v3-map/u);
  assert.match(dossierSource, /signal-dossier__v3-trend/u);
  assert.match(dossierSource, /signal-dossier__v3-reading/u);
  assert.match(dossierSource, /signal-dossier__v3-scores/u);
  assert.match(dossierSource, /signal-dossier__v3-timeframes/u);
});

test("phase 8.2h signal dossier uses a workstation evidence-room hierarchy", () => {
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const requiredLabels = [
    "证据室 · 计划边界",
    "信号档案决策总览",
    "策略状态速览",
    "v3 证据路径",
    "结构阶段",
    "关键位置",
    "计划边界",
    "副驾驶纪律",
  ];
  const requiredClasses = [
    "signal-dossier__command",
    "signal-dossier__decision-rail",
    "signal-dossier__route-map",
    "signal-dossier__section--v3",
    "signal-dossier__section--plan",
    "signal-dossier__section--evidence-room",
    "signal-dossier__copilot-card",
  ];

  for (const label of requiredLabels) {
    assert.match(dossierSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(dossierSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  assert.match(cssSource, /Phase 8\.2h: Signal Dossier visual upgrade/);
  assert.match(blueprintSource, /Signal Dossier Visual Upgrade/);
  assert.doesNotMatch(dossierSource, /LiquidationHeatmap|LiquidationZone|HeatmapProvider/u);
});

test("settings drawer exposes local alert controls without external notification channels", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const panelSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/alert-control-panel.tsx"),
    "utf8",
  );
  const policySource = readFileSync(resolve(process.cwd(), "src/lib/alerts/alert-policy.ts"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(workspaceSource, /Settings 系统设置/);
  assert.match(workspaceSource, /后端契约/);
  assert.match(workspaceSource, /扫描证明/);
  assert.match(workspaceSource, /chuan-settings-grid/);
  assert.match(panelSource, /站内告警设置/);
  assert.match(panelSource, /告警等级阈值/);
  assert.match(panelSource, /告警通道开关/);
  assert.match(panelSource, /告警去重窗口/);
  assert.match(panelSource, /Telegram\/Webhook/);
  assert.match(policySource, /allowedUse: "in_app_only"/);
  assert.match(policySource, /canUseTelegram: false/);
  assert.match(policySource, /canUseWebhook: false/);
  assert.match(policySource, /externalChannelsEnabled: false/);
  assert.match(cssSource, /\.alert-control-module/);
  assert.match(cssSource, /\.alert-control__summary/);
  assert.match(cssSource, /\.alert-control__severity/);
  assert.match(cssSource, /\.alert-control__toggles/);
  assert.match(cssSource, /\.alert-control__dedupe/);
  assert.match(cssSource, /\.alert-control__channels/);
  assert.match(cssSource, /\.chuan-settings-grid/);
});

test("CHUANSCAN UI exposes functional motion, state refresh, and compact runtime status", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "chuan-scan-shell--refresh-",
    "refreshState",
    "syncRadar",
    "compareSignalSets",
    "buildRefreshPlan",
    "chuan-radar-card--",
    "chuan-radar-card__live",
    "chuan-proof-card",
    "scanCoverage.coveragePercent",
  ];
  const requiredClasses = [
    "chuan-radar-card",
    "chuan-radar-card__live",
    "chuan-score-ring",
    "chuan-progress",
    "chuan-bg-scanline",
  ];
  const requiredAnimations = [
    "chuanScanline",
    "chuanPulse",
    "chuanBootBar",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

  for (const className of requiredClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  for (const animationName of requiredAnimations) {
    assert.match(cssSource, new RegExp(`@keyframes ${animationName}`));
  }

  assert.match(cssSource, /prefers-reduced-motion/);
});

test("blueprint records the new radar control-center route before rebuilding the UI shell", () => {
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const planSource = readFileSync(
    resolve(process.cwd(), "docs/superpowers/plans/2026-06-16-chuan-market-radar-next-build-flow.md"),
    "utf8",
  );
  const requiredBlueprintTokens = [
    "高级活体雷达控制台",
    "Tailwind CSS + daisyUI",
    "Live Navbar / Banner",
    "Cockpit Card",
    "左 / 中 / 右 = 2 : 6 : 2",
    "雷达之眼 / Crystal Lens",
    "Altcoin Opportunity Board",
    "Macro Radar",
    "Signal Lifecycle Tracker",
    "背景音乐删除",
  ];
  const requiredPlanTokens = [
    "Phase 0: Rebaseline Product And UI Direction",
    "Phase 8.2b: Rebuild UI Shell With Tailwind And DaisyUI",
    "Phase 8.2c: Live Radar Runtime Layer",
    "Phase 3.8: Altcoin Opportunity Board",
    "Phase 3.9: BTC ETH Macro Radar",
    "Rebuild radar UI shell",
  ];

  for (const token of requiredBlueprintTokens) {
    assert.ok(blueprintSource.includes(token), `Blueprint missing required token: ${token}`);
  }

  for (const token of requiredPlanTokens) {
    assert.ok(planSource.includes(token), `Plan missing required token: ${token}`);
  }
});

test("radar UI reset has a real Tailwind and daisyUI foundation", () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    browserslist?: string;
  };
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const globalsSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const nextConfigSource = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const specSource = readFileSync(
    resolve(process.cwd(), "docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md"),
    "utf8",
  );
  const postcssPath = resolve(process.cwd(), "postcss.config.mjs");

  for (const dependency of ["tailwindcss", "@tailwindcss/postcss", "postcss", "daisyui"]) {
    assert.ok(dependencies[dependency], `package.json missing ${dependency}`);
  }

  assert.equal(dependencies["element-plus"], undefined, "Element Plus should stay reference-only");
  assert.match(packageJson.scripts?.build ?? "", /next build --webpack/);
  assert.equal(packageJson.browserslist, "> 1%", "Turbopack-compatible browserslist should be configured");
  assert.equal(existsSync(postcssPath), true, "postcss.config.mjs must exist");

  const postcssSource = readFileSync(postcssPath, "utf8");
  assert.match(postcssSource, /@tailwindcss\/postcss/);
  assert.match(globalsSource, /@import\s+"tailwindcss";/);
  assert.match(globalsSource, /@plugin\s+"daisyui";/);
  assert.match(nextConfigSource, /turbopack/);
  assert.match(nextConfigSource, /root/);
  assert.match(blueprintSource, /必须真实接入 \*\*Tailwind CSS \+ daisyUI\*\*/);
  assert.match(specSource, /Tailwind CSS and daisyUI are actually installed\/configured/);
});

test("CHUANSCAN baseline removes the retired 2-6-2 cockpit shell files", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const retiredComponentPaths = [
    "src/components/radar/radar-workspace.tsx",
    "src/components/radar/top-radar-bar.tsx",
    "src/components/radar/radar-cockpit-shell.tsx",
    "src/components/radar/ops-and-filter-panel.tsx",
    "src/components/radar/pixel-copilot.tsx",
    "src/components/radar/radar-boot-briefing.tsx",
  ];
  const requiredWorkspaceTokens = [
    "chuan-radar-layout",
    "chuan-radar-main",
    "chuan-radar-side",
    "chuan-drawer",
    "chuan-dossier",
    "chuan-side-card",
  ];
  const requiredCssClasses = [
    "chuan-radar-layout",
    "chuan-radar-main",
    "chuan-radar-side",
    "chuan-drawer",
    "chuan-dossier",
    "chuan-side-card",
  ];

  for (const path of retiredComponentPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), false, `${path} should be removed after CHUANSCAN rebuild`);
  }

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

  for (const className of requiredCssClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("CHUANSCAN exposes the selected navbar, ticker strip, drawers, and compact assistant", () => {
  const uiSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "chuan-topbar",
    "chuan-topbar__nav",
    "chuan-market-strip",
    "chuan-kpi-grid",
    "chuan-radar-card-grid",
    "功能抽屉",
    "川川助手",
    "扫描证明",
    "实时预警",
  ];
  const requiredClasses = [
    "chuan-topbar",
    "chuan-topbar__nav",
    "chuan-market-strip",
    "chuan-kpi-grid",
    "chuan-radar-card-grid",
    "chuan-mini-assistant__avatar",
    "chuan-proof-card",
    "chuan-alert-list",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.ok(uiSource.includes(token), `radar UI source missing phase 8.2b token: ${token}`);
  }

  for (const className of requiredClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("CHUANSCAN live runtime layer exposes polling, freshness proof, and degraded states", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "buildRefreshPlan",
    "compareSignalSets",
    "fetch(\"/api/radar\"",
    "fetch(\"/api/radar/backend-contract\"",
    "setRefreshState",
    "liveHealth",
    "liveContract",
    "metadata.nextScanAt",
  ];
  const requiredClasses = [
    "chuan-proof-compact",
    "chuan-progress",
  ];
  const requiredAnimations = [
    "chuanScanline",
    "chuanPulse",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.ok(workspaceSource.includes(token), `CHUANSCAN workspace missing runtime token: ${token}`);
  }

  for (const className of requiredClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  for (const animationName of requiredAnimations) {
    assert.match(cssSource, new RegExp(`@keyframes ${animationName}`));
  }

  assert.match(cssSource, /prefers-reduced-motion/);
  assert.equal(workspaceSource.includes("background music"), false);
  assert.equal(workspaceSource.includes("<audio"), false);
});

test("phase 3.8 altcoin opportunity board is the primary grouped opportunity surface", () => {
  const componentPath = resolve(process.cwd(), "src/components/radar/altcoin-opportunity-board.tsx");
  const componentSource = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredLabels = [
    "山寨机会板",
    "多头升温",
    "空头升温",
    "接近触发",
    "过热勿追",
    "新币/长尾",
    "数据观察",
    "禁止追单",
    "复盘上下文",
    "不新增请求",
    "v3风控",
    "不参与原因",
    "OI",
    "资金",
    "量能",
  ];
  const requiredClasses = [
    "altcoin-opportunity-board",
    "altcoin-opportunity-board__summary",
    "altcoin-opportunity-board__groups",
    "altcoin-opportunity-group",
    "altcoin-opportunity-card",
    "altcoin-opportunity-card__badges",
    "altcoin-opportunity-card__v3",
    "altcoin-opportunity-card__v3-reason",
    "altcoin-opportunity-card--no_chase",
    "altcoin-opportunity-card--new_long_tail",
  ];

  assert.equal(existsSync(componentPath), true, "AltcoinOpportunityBoard component must exist");

  for (const label of requiredLabels) {
    assert.match(componentSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(componentSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  assert.equal(componentSource.includes("买入"), false);
  assert.equal(componentSource.includes("卖出"), false);
  assert.equal(componentSource.includes("梭哈"), false);
});

test("phase 3.9 macro weather panel keeps BTC ETH context as a non-mutating market layer", () => {
  const componentPath = resolve(process.cwd(), "src/components/radar/macro-weather-panel.tsx");
  const componentSource = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredLabels = [
    "大盘天气",
    "BTC",
    "ETH",
    "顺风",
    "逆风",
    "震荡",
    "杠杆拥挤",
    "去杠杆",
    "波动扩张",
    "未知",
    "不抢山寨主线",
    "不新增请求",
    "不改权重",
    "山寨环境",
  ];
  const requiredClasses = [
    "macro-weather-panel",
    "macro-weather-panel__hero",
    "macro-weather-panel__anchors",
    "macro-weather-panel__grid",
    "macro-weather-regime",
    "macro-weather-regime--tailwind",
    "macro-weather-regime--deleveraging",
  ];

  assert.equal(existsSync(componentPath), true, "MacroWeatherPanel component must exist");

  for (const label of requiredLabels) {
    assert.match(componentSource, new RegExp(label));
  }

  for (const className of requiredClasses) {
    assert.match(componentSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  assert.equal(componentSource.includes("买入"), false);
  assert.equal(componentSource.includes("卖出"), false);
  assert.equal(componentSource.includes("梭哈"), false);
});

test("CHUANSCAN assistant removes the visible S680 vehicle direction from the normal radar UI", () => {
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredAssistantTokens = [
    "川川助手",
    "rankProfile.petLine",
    "风控门不是装饰",
  ];
  const requiredAssistantClasses = [
    "chuan-assistant-card",
    "chuan-mini-assistant__avatar",
  ];

  assert.doesNotMatch(componentSource, /PixelCopilot|PixelS680|pixel-s680|S680|s680-/);

  for (const token of requiredAssistantTokens) {
    assert.match(componentSource, new RegExp(token));
  }

  for (const className of requiredAssistantClasses) {
    assert.match(componentSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("CHUANSCAN assistant stays compact and contains no direct trade callout copy", () => {
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredAssistantClasses = [
    "chuan-assistant-card",
    "chuan-mini-assistant__avatar",
    "chuan-progress",
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

  for (const className of requiredAssistantClasses) {
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

  assert.match(workflowSource, /cron:\s*["']\*\/15 \* \* \* \*["']/);
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

test("external v3 forward map review scheduler calls the protected v3 review endpoint at low frequency", () => {
  const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/chuan-v3-forward-map-review.yml"),
    "utf8",
  );

  assert.match(workflowSource, /cron:\s*["']41 \*\/6 \* \* \*["']/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /CHUAN_SCAN_BASE="\$\{CHUAN_SCAN_URL%\/\}"/);
  assert.match(
    workflowSource,
    /CHUAN_V3_FORWARD_MAP_REVIEW_URL="\$\{CHUAN_SCAN_BASE%\/api\/scan\}\/api\/admin\/v3\/forward-map-reviews\/run"/,
  );
  assert.match(workflowSource, /-X POST "\$CHUAN_V3_FORWARD_MAP_REVIEW_URL"/);
  assert.match(workflowSource, /Authorization: Bearer \$CHUAN_CRON_SECRET/);
  assert.match(workflowSource, /api\/admin\/v3\/forward-map-reviews\/run/);
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

test("protected v3 forward map review API is exposed as a POST-only admin route", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/v3/forward-map-reviews/run/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /runAdminForwardMapReviewExecutor/);
  assert.match(routeSource, /authorization/);
  assert.match(routeSource, /x-chuan-v3-forward-map-review/);
  assert.equal(routeSource.includes("export async function GET"), false);
});

test("protected strategy weight execution API is exposed as a POST-only admin route", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/strategy-weights/executions/record/route.ts"),
    "utf8",
  );

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /runAdminStrategyWeightChangeExecutionRecord/);
  assert.match(routeSource, /authorization/);
  assert.match(routeSource, /x-chuan-strategy-weight-execution/);
  assert.equal(routeSource.includes("export async function GET"), false);
});

test("admin execution modules use the shared cron authorization helper", () => {
  const adminSources = [
    "src/lib/analysis/v3/forward-map-review-admin.ts",
    "src/lib/api/deployment-readiness.ts",
    "src/lib/journal/outcome-executor-admin.ts",
    "src/lib/journal/strategy-weight-change-execution-admin.ts",
    "src/lib/market/daily-mover-admin.ts",
    "src/lib/market/daily-mover-kline-cache-admin.ts",
    "src/lib/persistence/database-admin.ts",
  ];

  for (const sourcePath of adminSources) {
    const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");

    assert.match(source, /isCronRequestAuthorized/);
    assert.match(source, /requireSecret: true/);
    assert.doesNotMatch(source, /function expectedAuthorization/);
    assert.doesNotMatch(source, /authorization !== expected/);
  }
});

test("system health UI exposes outcome executor status and coverage", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/system-health-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

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
  assert.match(componentSource, /阻断解释/);
  assert.match(componentSource, /样本明细/);
  assert.match(componentSource, /样本分布/);
  assert.match(componentSource, /阈值层/);
  assert.match(componentSource, /回滚计划/);
  assert.match(componentSource, /权重回测/);
  assert.match(componentSource, /人工候选/);
  assert.match(componentSource, /升权候选/);
  assert.match(componentSource, /降权候选/);
  assert.match(componentSource, /隔离候选/);
  assert.match(componentSource, /候选明细/);
  assert.match(componentSource, /变更审计/);
  assert.match(componentSource, /审计候选/);
  assert.match(componentSource, /可审计/);
  assert.match(componentSource, /需回滚/);
  assert.match(componentSource, /阻断审计/);
  assert.match(componentSource, /不可执行/);
  assert.match(componentSource, /执行记录/);
  assert.match(componentSource, /审批/);
  assert.match(componentSource, /记录审批账本/);
  assert.match(componentSource, /管理密钥/);
  assert.match(componentSource, /只保存记录/);
  assert.match(componentSource, /影子权重/);
  assert.match(componentSource, /影子表现/);
  assert.match(componentSource, /当前权重/);
  assert.match(componentSource, /建议权重/);
  assert.match(componentSource, /差异/);
  assert.match(componentSource, /样本数/);
  assert.match(componentSource, /有效\/反证/);
  assert.match(componentSource, /回滚压力/);
  assert.match(componentSource, /不影响实盘判断/);
  assert.match(componentSource, /已记录/);
  assert.match(componentSource, /待审批/);
  assert.match(componentSource, /不可写权重/);
  assert.match(componentSource, /blockerDetails/);
  assert.match(componentSource, /sampleDrilldown/);
  assert.match(componentSource, /sampleBreakdown/);
  assert.match(componentSource, /thresholdLayers/);
  assert.match(componentSource, /rollbackPlan/);
  assert.match(componentSource, /strategyWeightCalibration/);
  assert.match(componentSource, /strategyWeightChangeAudit/);
  assert.match(componentSource, /strategyWeightChangeExecution/);
  assert.match(componentSource, /strategyWeightShadow/);
  assert.match(componentSource, /strategyWeightShadowEvaluation/);
  assert.match(componentSource, /onRecordStrategyWeightExecution/);
  assert.match(componentSource, /strategyWeightExecutionForm/);
  assert.match(componentSource, /manualAdjustmentBand/);
  assert.match(componentSource, /canExecuteWeightChange/);
  assert.match(componentSource, /canWriteRuleWeights/);
  assert.match(componentSource, /阻断项/);
  assert.match(componentSource, /不改权重/);
  assert.match(componentSource, /有效/);
  assert.match(componentSource, /反证/);
  assert.match(componentSource, /过期/);
  assert.match(componentSource, /promotionBridge/);
  assert.match(componentSource, /只读晋级桥/);
  assert.match(componentSource, /v2\/v3 晋级桥/);
  assert.match(componentSource, /health-outcomes/);
  assert.match(componentSource, /health-outcome-run/);
  assert.match(componentSource, /health-outcome-quality/);
  assert.match(componentSource, /health-outcome-admission/);
  assert.match(componentSource, /health-outcome-flow/);
  assert.match(componentSource, /health-outcome-detail/);
  assert.match(componentSource, /health-outcome-samples/);
  assert.match(componentSource, /health-outcome-thresholds/);
  assert.match(componentSource, /health-outcome-rollback/);
  assert.match(componentSource, /health-outcome-weight/);
  assert.match(componentSource, /health-outcome-weight__head/);
  assert.match(componentSource, /health-outcome-weight__grid/);
  assert.match(componentSource, /health-outcome-weight__candidates/);
  assert.match(componentSource, /health-outcome-weight__item/);
  assert.match(componentSource, /health-outcome-audit/);
  assert.match(componentSource, /health-outcome-audit__head/);
  assert.match(componentSource, /health-outcome-audit__grid/);
  assert.match(componentSource, /health-outcome-audit__items/);
  assert.match(componentSource, /health-outcome-audit__item/);
  assert.match(componentSource, /health-outcome-execution/);
  assert.match(componentSource, /health-outcome-execution__head/);
  assert.match(componentSource, /health-outcome-execution__grid/);
  assert.match(componentSource, /health-outcome-execution__items/);
  assert.match(componentSource, /health-outcome-execution__item/);
  assert.match(componentSource, /health-outcome-execution__form/);
  assert.match(componentSource, /health-outcome-execution__button/);
  assert.match(componentSource, /health-outcome-shadow/);
  assert.match(componentSource, /health-outcome-shadow__grid/);
  assert.match(componentSource, /health-outcome-shadow__diffs/);
  assert.match(componentSource, /health-outcome-shadow-eval/);
  assert.match(componentSource, /health-outcome-shadow-eval__grid/);
  assert.match(componentSource, /health-outcome-shadow-eval__items/);
  assert.match(componentSource, /真实权重门禁/);
  assert.match(componentSource, /扫描经济/);
  assert.match(componentSource, /v3 Forward Map/);
  assert.match(componentSource, /事前地图/);
  assert.match(componentSource, /扫描快照/);
  assert.match(componentSource, /最近样本/);
  assert.match(componentSource, /存储可读/);
  assert.match(componentSource, /待迁移/);
  assert.match(componentSource, /不改变实时排序/);
  assert.match(componentSource, /v3 Strategy Loop/);
  assert.match(componentSource, /v3 策略实战闭环/);
  assert.match(componentSource, /v3 live 覆盖/);
  assert.match(componentSource, /v3 复盘覆盖/);
  assert.match(componentSource, /v3 候选下一步/);
  assert.match(componentSource, /关键位\/前方位/);
  assert.match(componentSource, /Risk Gate/);
  assert.match(componentSource, /v3StrategyLoop/);
  assert.match(componentSource, /v3StrategyLoopStatusLabel/);
  assert.match(componentSource, /Evolution Loop/);
  assert.match(componentSource, /策略进化闭环/);
  assert.match(componentSource, /进化闭环准备度/);
  assert.match(componentSource, /策略进化阶段/);
  assert.match(componentSource, /策略进化下一步/);
  assert.match(componentSource, /strategyEvolutionLoop/);
  assert.match(componentSource, /strategyEvolutionLoopStatusLabel/);
  assert.match(componentSource, /strategyEvolutionStageStatusLabel/);
  assert.match(componentSource, /v3ForwardMapReviews/);
  assert.match(componentSource, /v3ForwardMapReviewStatusLabel/);
  assert.match(componentSource, /v3ForwardMapStorageLabel/);
  assert.match(componentSource, /今日预算/);
  assert.match(componentSource, /剩余额度/);
  assert.match(componentSource, /请求\/轮/);
  assert.match(componentSource, /批次上限/);
  assert.match(componentSource, /层级覆盖/);
  assert.match(componentSource, /锚定/);
  assert.match(componentSource, /核心山寨/);
  assert.match(componentSource, /热门资产/);
  assert.match(componentSource, /长尾轮转/);
  assert.match(componentSource, /不新增请求/);
  assert.match(componentSource, /全市场覆盖/);
  assert.match(componentSource, /全市场覆盖深度报告/);
  assert.match(componentSource, /已扫\/可扫/);
  assert.match(componentSource, /当前批次/);
  assert.match(componentSource, /轮转周期/);
  assert.match(componentSource, /三所覆盖/);
  assert.match(componentSource, /高优先级候选池/);
  assert.match(componentSource, /高优先级槽位/);
  assert.match(componentSource, /证据来源/);
  assert.match(componentSource, /待轮转/);
  assert.match(componentSource, /交易所质量/);
  assert.match(componentSource, /交易所覆盖钻取/);
  assert.match(componentSource, /覆盖动作/);
  assert.match(componentSource, /exchangeDrilldown/);
  assert.match(componentSource, /highPriority/);
  assert.match(componentSource, /fullMarketCoverage/);
  assert.match(componentSource, /fullMarketCoverageStatusLabel/);
  assert.match(componentSource, /数据质量清洗报告/);
  assert.match(componentSource, /数据质量分/);
  assert.match(componentSource, /原始行/);
  assert.match(componentSource, /清洗后/);
  assert.match(componentSource, /主信号/);
  assert.match(componentSource, /主信号聚合解释/);
  assert.match(componentSource, /原始拒绝样本/);
  assert.match(componentSource, /primarySelection/);
  assert.match(componentSource, /rejectedRowSamples/);
  assert.match(componentSource, /UNKNOWN/);
  assert.match(componentSource, /非 USDT/);
  assert.match(componentSource, /重复\/去重/);
  assert.match(componentSource, /过滤样本/);
  assert.match(componentSource, /marketDataQuality/);
  assert.match(componentSource, /marketDataQualityStatusLabel/);
  assert.match(componentSource, /scanEconomy/);
  assert.match(componentSource, /scanEconomyTierRows/);
  assert.match(componentSource, /scanEconomyStatusLabel/);
  assert.match(componentSource, /启用模式/);
  assert.match(componentSource, /通过项/);
  assert.match(componentSource, /阻断项/);
  assert.match(componentSource, /不接入扫描/);
  assert.match(componentSource, /strategyWeightActivationGate/);
  assert.match(componentSource, /health-outcome-activation/);
  assert.match(componentSource, /health-outcome-activation__grid/);
  assert.match(componentSource, /health-outcome-activation__checks/);
  assert.match(cssSource, /\.health-outcome-detail/);
  assert.match(cssSource, /\.health-outcome-samples/);
  assert.match(cssSource, /\.health-outcome-thresholds/);
  assert.match(cssSource, /\.health-outcome-rollback/);
  assert.match(cssSource, /\.health-outcome-weight/);
  assert.match(cssSource, /\.health-outcome-weight__head/);
  assert.match(cssSource, /\.health-outcome-weight__grid/);
  assert.match(cssSource, /\.health-outcome-weight__candidates/);
  assert.match(cssSource, /\.health-outcome-weight__item/);
  assert.match(cssSource, /\.health-outcome-audit/);
  assert.match(cssSource, /\.health-outcome-audit__head/);
  assert.match(cssSource, /\.health-outcome-audit__grid/);
  assert.match(cssSource, /\.health-outcome-audit__items/);
  assert.match(cssSource, /\.health-outcome-audit__item/);
  assert.match(cssSource, /\.health-outcome-execution/);
  assert.match(cssSource, /\.health-outcome-execution__head/);
  assert.match(cssSource, /\.health-outcome-execution__grid/);
  assert.match(cssSource, /\.health-outcome-execution__items/);
  assert.match(cssSource, /\.health-outcome-execution__item/);
  assert.match(cssSource, /\.health-outcome-execution__form/);
  assert.match(cssSource, /\.health-full-market/);
  assert.match(cssSource, /\.health-full-market__grid/);
  assert.match(cssSource, /\.health-full-market__lanes/);
  assert.match(cssSource, /\.health-full-market__samples/);
  assert.match(cssSource, /\.health-full-market__guardrails/);
  assert.match(cssSource, /\.health-data-quality/);
  assert.match(cssSource, /\.health-data-quality__score/);
  assert.match(cssSource, /\.health-data-quality__grid/);
  assert.match(cssSource, /\.health-data-quality__issues/);
  assert.match(cssSource, /\.health-data-quality__guardrails/);
  assert.match(cssSource, /\.health-state-pool__bridge/);
  assert.match(cssSource, /\.health-state-pool__bridge-list/);
  assert.match(cssSource, /scanHeartbeatPulse/);
  assert.match(cssSource, /-webkit-line-clamp: 2/);
  assert.match(cssSource, /\.health-outcome-execution__button/);
  assert.match(cssSource, /\.health-outcome-shadow/);
  assert.match(cssSource, /\.health-outcome-shadow__grid/);
  assert.match(cssSource, /\.health-outcome-shadow__diffs/);
  assert.match(cssSource, /\.health-outcome-shadow-eval/);
  assert.match(cssSource, /\.health-outcome-shadow-eval__grid/);
  assert.match(cssSource, /\.health-outcome-shadow-eval__items/);
  assert.match(cssSource, /\.health-outcome-activation/);
  assert.match(cssSource, /\.health-outcome-activation__grid/);
  assert.match(cssSource, /\.health-outcome-activation__checks/);
  assert.match(cssSource, /\.health-v3-forward-map/);
  assert.match(cssSource, /\.health-v3-strategy-loop/);
  assert.match(cssSource, /\.health-v3-strategy-loop__grid/);
  assert.match(cssSource, /\.health-v3-strategy-loop__candidates/);
  assert.match(cssSource, /\.health-v3-strategy-loop__candidate/);
  assert.match(cssSource, /\.health-evolution-loop/);
  assert.match(cssSource, /\.health-evolution-loop__score/);
  assert.match(cssSource, /\.health-evolution-loop__stages/);
  assert.match(cssSource, /\.health-evolution-loop__stage/);
  assert.match(cssSource, /\.health-evolution-loop__actions/);
  assert.match(cssSource, /\.health-v3-forward-map__grid/);
  assert.match(cssSource, /\.health-v3-forward-map__reasons/);
  assert.match(cssSource, /\.health-scan-economy/);
  assert.match(cssSource, /\.health-scan-economy__grid/);
  assert.match(cssSource, /\.health-scan-economy__tiers/);
  assert.match(cssSource, /\.health-scan-economy__tier/);
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

test("journal panel exposes v3 forward map review events as readonly review records", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/journal-panel.tsx"),
    "utf8",
  );
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );

  assert.match(componentSource, /trend_radar_review_run/);
  assert.match(componentSource, /trendRadarReviewRun/);
  assert.match(componentSource, /trend_radar_review/);
  assert.match(componentSource, /trendRadarReview/);
  assert.match(componentSource, /Forward Map/);
  assert.match(componentSource, /事前地图复盘/);
  assert.match(componentSource, /不改权重/);
  assert.match(dossierSource, /trend_radar_review/);
  assert.match(dossierSource, /v3复盘/);
});

test("journal panel exposes v3 pattern and trade-plan review stats as readonly summaries", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/journal-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(componentSource, /buildV3PatternReviewStats/);
  assert.match(componentSource, /patternReviewStats/);
  assert.match(componentSource, /形态复盘统计/);
  assert.match(componentSource, /只读统计/);
  assert.match(componentSource, /不改权重/);
  assert.match(componentSource, /v3_pattern_context/);
  assert.match(componentSource, /v3_trade_/);
  assert.match(componentSource, /bucket\.samples/);
  assert.match(cssSource, /\.v3-review-stats/);
  assert.match(cssSource, /\.v3-review-stats__bucket/);
  assert.match(cssSource, /\.v3-review-stats__samples/);
});

test("chart panel exposes active timeframe v3 structure context without replacing TradingView", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(componentSource, /strategyV3/);
  assert.match(componentSource, /activeV3Timeframe/);
  assert.match(componentSource, /v3 多周期上下文/);
  assert.match(componentSource, /chart-v3-context/);
  assert.match(componentSource, /chart-v3-levels/);
  assert.match(componentSource, /chart-v3-plan/);
  assert.match(componentSource, /chart-v3-pattern-context/);
  assert.match(componentSource, /patternTypeLabel/);
  assert.match(componentSource, /TradingView 实时图/);
  assert.match(cssSource, /\.chart-v3-context/);
  assert.match(cssSource, /\.chart-v3-levels/);
  assert.match(cssSource, /\.chart-v3-plan/);
  assert.match(cssSource, /\.chart-v3-pattern-context/);
});

test("chart panel exposes readonly v3 key-level and forward-map drilldown details", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(componentSource, /activeDrilldownLevel/);
  assert.match(componentSource, /activeForwardDrilldown/);
  assert.match(componentSource, /chart-v3-drilldown/);
  assert.match(componentSource, /chart-v3-forward-drilldown/);
  assert.match(componentSource, /chart-v3-manual-review/);
  assert.match(componentSource, /confirmationRules/);
  assert.match(componentSource, /invalidationRules/);
  assert.match(componentSource, /只读复核/);
  assert.match(cssSource, /\.chart-v3-drilldown/);
  assert.match(cssSource, /\.chart-v3-forward-drilldown/);
  assert.match(cssSource, /\.chart-v3-manual-review/);
});

test("chart panel links selected signal v3 context to readonly journal review samples", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(componentSource, /journalMatches/);
  assert.match(componentSource, /chart-v3-review-links/);
  assert.match(componentSource, /v3_pattern_/);
  assert.match(componentSource, /v3_trade_/);
  assert.match(componentSource, /plannedReviewAt/);
  assert.match(componentSource, /复盘样本/);
  assert.match(cssSource, /\.chart-v3-review-links/);
});

test("chart panel exposes readonly forward-map review executor events", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(componentSource, /forwardReviewEvents/);
  assert.match(componentSource, /trendRadarReview/);
  assert.match(componentSource, /chart-v3-forward-review-events/);
  assert.match(componentSource, /forward_map_review/);
  assert.match(componentSource, /key_level_reaction_review/);
  assert.match(componentSource, /事后复核/);
  assert.match(componentSource, /evidenceIds/);
  assert.match(cssSource, /\.chart-v3-forward-review-events/);
});

test("phase 8.2j chart panel exposes professional readonly focus interaction", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const requiredComponentTokens = [
    "chart-focus-toolbar",
    "chart-focus-layer",
    "chart-focus-note",
    "chart-v3-forward-focus",
    "focusMode",
    "setFocusMode",
    "setActiveKeyLevelId",
    "setActiveForwardLevelId",
    "盘面焦点切换",
    "只读焦点",
  ];
  const requiredCssTokens = [
    "Phase 8.2j: ChartPanel professional focus interaction",
    ".chart-focus-toolbar",
    ".chart-focus-layer",
    ".chart-focus-note",
    ".chart-v3-forward-focus",
    "@keyframes chartFocusPulse",
    "@keyframes chartReviewPulse",
    "prefers-reduced-motion",
  ];

  for (const token of requiredComponentTokens) {
    assert.match(componentSource, new RegExp(token));
  }

  for (const token of requiredCssTokens) {
    assert.match(cssSource, new RegExp(token.replaceAll(".", "\\.")));
  }

  assert.match(blueprintSource, /Phase 8\.2j/);
  assert.match(blueprintSource, /ChartPanel Professional Visual Interaction/);
  assert.match(componentSource, /不自动下单、不改排序、不自动调权/);
});

test("phase 8.2k chart panel exposes readonly candle realism without replacing TradingView", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const requiredComponentTokens = [
    "previewCandles",
    "volumeQualityBars",
    "chart-preview-candles",
    "chart-preview-candle",
    "chart-level-tags",
    "chart-level-tag",
    "chart-volume-profile",
    "只读K线预览",
    "成交量质量",
    "系统结构复核层",
    "TradingViewEmbed",
  ];
  const requiredCssTokens = [
    "Phase 8.2k: chart realism and key-level drilldown preview",
    ".chart-preview-candles",
    ".chart-preview-candle",
    ".chart-level-tags",
    ".chart-level-tag",
    ".chart-volume-profile",
    ".volume-bar--surge",
  ];

  for (const token of requiredComponentTokens) {
    assert.match(componentSource, new RegExp(token));
  }

  for (const token of requiredCssTokens) {
    assert.match(cssSource, new RegExp(token.replaceAll(".", "\\.")));
  }

  assert.match(blueprintSource, /Phase 8\.2k/);
  assert.match(blueprintSource, /Chart Realism And Key-Level Drilldown/);
  assert.match(componentSource, /TradingView 实时图/);
  assert.match(componentSource, /不自动下单、不改排序、不自动调权/);
});

test("public radar UI exposes complete candidate access instead of silent truncation", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");

  assert.match(workspaceSource, /topSignals = filteredSignals\.slice\(0, 12\)/);
  assert.match(workspaceSource, /hiddenSignalCount/);
  assert.match(workspaceSource, /查看剩余 \{hiddenSignalCount\} 个候选/);
  assert.match(workspaceSource, /Signals 完整候选池/);
  assert.match(workspaceSource, /chuan-full-signal-list/);
  assert.match(cssSource, /\.chuan-more-signals/);
  assert.match(cssSource, /\.chuan-full-signal-list/);
  assert.match(blueprintSource, /不允许静默截断/);
});

test("chart panel uses a real TradingView widget boundary and truthful local structure wording", () => {
  const chartSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chart-panel.tsx"),
    "utf8",
  );
  const embedSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/tradingview-embed.tsx"),
    "utf8",
  );
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(chartSource, /TradingViewEmbed/);
  assert.match(chartSource, /TradingView 实时图/);
  assert.match(chartSource, /系统结构图/);
  assert.match(chartSource, /系统结构复核层/);
  assert.match(embedSource, /https:\/\/s3\.tradingview\.com\/tv\.js/);
  assert.match(embedSource, /new window\.TradingView\.widget/);
  assert.match(dossierSource, /打开 TradingView 实时图/);
  assert.match(cssSource, /\.tradingview-embed/);
  assert.equal(chartSource.includes("TradingView 图表"), false);
  assert.equal(dossierSource.includes("TradingView 图表"), false);
});

test("closed workspace overlays are not left mounted as hidden interaction layers", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );

  assert.match(workspaceSource, /\{activeSection !== "radar" \? \(/);
  assert.match(workspaceSource, /if \(!signal\) \{\s*return null;\s*\}/u);
  assert.match(workspaceSource, /aria-modal="true"/);
  assert.equal(workspaceSource.includes("aria-hidden={!isOpen}"), false);
  assert.equal(workspaceSource.includes("tabIndex={isOpen ? 0 : -1}"), false);
});

test("phase 8 current frontend baseline documents the CHUANSCAN Figma rebuild QA", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const designQaSource = readFileSync(resolve(process.cwd(), "design-qa.md"), "utf8");
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const requiredCssTokens = [
    ".chuan-scan-shell",
    ".chuan-topbar",
    ".chuan-market-strip",
    ".chuan-kpi-grid",
    ".chuan-radar-card-grid",
    ".chuan-drawer__panel",
    ".chuan-dossier",
    "prefers-reduced-motion",
  ];
  const requiredQaTokens = [
    "CHUANSCAN",
    "chuan-scan-current-desktop.png",
    "chuan-scan-current-mobile.png",
    "chuan-scan-design-comparison.png",
    "final result: passed",
  ];
  const requiredWorkspaceTokens = [
    "snapshot",
    "backendContract",
    "dailyMoverArchive",
    "marketTapeItems",
    "chuan-radar-card-grid",
    "chuan-side-card",
    "chuan-drawer",
    "chuan-dossier",
    "查看剩余 {hiddenSignalCount} 个候选",
  ];

  assert.match(pageSource, /ChuanScanWorkspace/);
  assert.doesNotMatch(pageSource, /RadarWorkspace/);

  for (const token of requiredCssTokens) {
    assert.ok(cssSource.includes(token), `missing CSS token: ${token}`);
  }

  for (const token of requiredWorkspaceTokens) {
    assert.ok(workspaceSource.includes(token), `missing CHUANSCAN workspace token: ${token}`);
  }

  for (const token of requiredQaTokens) {
    assert.ok(designQaSource.includes(token), `missing QA token: ${token}`);
  }

  assert.match(blueprintSource, /Figma Make 黑金 CHUANSCAN/);
  assert.match(blueprintSource, /旧 2 : 6 : 2 cockpit/);
  assert.match(blueprintSource, /ChuanScanWorkspace/);
  assert.doesNotMatch(blueprintSource, /LiquidationZone/);
});

test("public radar UI exposes daily mover attribution as a research-only review panel", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/chuan-scan-workspace.tsx"),
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
    "v3 漏判复盘",
    "事前地图",
    "策略草案",
    "策略版本草案",
    "确认草案",
    "已确认",
    "确认后表现",
    "只读反馈",
    "后续样本",
    "版本表现",
    "回滚边界",
    "阈值画像",
    "回滚计划",
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
    "daily-mover-missed-v3",
    "daily-mover-missed-v3__stats",
    "daily-mover-strategy",
    "daily-mover-strategy__stats",
    "daily-mover-strategy__button",
    "daily-mover-performance",
    "daily-mover-performance__stats",
    "daily-mover-version",
    "daily-mover-version__stats",
    "daily-mover-version__policy",
    "daily-mover-version__plan",
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
  assert.match(workspaceSource, /dailyMoverArchive/);
  assert.match(workspaceSource, /chuan-drawer/u);
  assert.match(workspaceSource, /dailyMoverArchive\.snapshots/u);
  assert.match(workspaceSource, /dailyMoverArchive\.selectedDetails/u);
  assert.match(workspaceSource, /漏判\/归因样本/u);
  assert.match(workspaceSource, /Review/);
  assert.match(panelSource, /allowedUse/);
  assert.match(panelSource, /research_only/);
  assert.match(panelSource, /onCreateCalibrationReview/);
  assert.match(panelSource, /onConfirmStrategyDraft/);
  assert.match(panelSource, /calibrationFeedback/);
  assert.match(panelSource, /backtestCandidates/);
  assert.match(panelSource, /backtestValidations/);
  assert.match(panelSource, /missedAltcoinReviews/);
  assert.match(panelSource, /missed_altcoin_review/);
  assert.match(panelSource, /strategyDrafts/);
  assert.match(panelSource, /strategyPerformanceFeedback/);
  assert.match(panelSource, /strategyVersionPerformance/);
  assert.match(panelSource, /thresholdProfile/);
  assert.match(panelSource, /rollbackPlan/);
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
