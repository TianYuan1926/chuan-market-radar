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
    resolve(process.cwd(), "src/components/radar/pixel-copilot.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(workspaceSource, /studio-scan-grid/);
  assert.match(workspaceSource, /signal-rhythm/);
  assert.match(petSource, /copilot-dashboard/);
  assert.match(petSource, /copilot-vital/);
  assert.match(cssSource, /\.studio-scan-grid/);
  assert.match(cssSource, /\.signal-rhythm/);
  assert.match(cssSource, /\.copilot-dashboard/);
  assert.match(cssSource, /prefers-reduced-motion/);
});

test("public radar UI keeps reader-facing controls Chinese-first", () => {
  const sourceFiles = [
    "src/components/radar/chart-panel.tsx",
    "src/components/radar/event-center-panel.tsx",
    "src/components/radar/journal-panel.tsx",
    "src/components/radar/ops-and-filter-panel.tsx",
    "src/components/radar/radar-boot-briefing.tsx",
    "src/components/radar/radar-cockpit-shell.tsx",
    "src/components/radar/radar-workspace.tsx",
    "src/components/radar/radar-table.tsx",
    "src/components/radar/rank-panel.tsx",
    "src/components/radar/replay-panel.tsx",
    "src/components/radar/strategy-card.tsx",
    "src/components/radar/system-health-panel.tsx",
    "src/components/radar/top-radar-bar.tsx",
    "src/components/radar/pixel-copilot.tsx",
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

test("public radar UI opens a selected-signal dossier that fuses strategy, journal, mover, chart, and alerts", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const dossierSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/signal-dossier.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "SignalDossier",
    "selectedDossierSignal",
    "isDossierOpen",
    "openSignalDossier",
    "closeSignalDossier",
    "dailyMoverMatches",
    "journalMatches",
    "alertMatches",
    "onOpenDossier",
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
  assert.match(dossierSource, /位置\/RR/u);
  assert.match(dossierSource, /回踩\/反抽/u);
  assert.match(dossierSource, /趋势完整度/u);
  assert.match(dossierSource, /signal-dossier__v3-location/u);
  assert.match(dossierSource, /signal-dossier__v3-reaction/u);
  assert.match(dossierSource, /signal-dossier__v3-integrity/u);
  assert.match(dossierSource, /signal-dossier__v3-levels/u);
  assert.match(dossierSource, /signal-dossier__v3-map/u);
  assert.match(dossierSource, /signal-dossier__v3-trend/u);
  assert.match(dossierSource, /signal-dossier__v3-reading/u);
  assert.match(dossierSource, /signal-dossier__v3-scores/u);
  assert.match(dossierSource, /signal-dossier__v3-timeframes/u);
});

test("living radar UI second pass exposes functional motion, state dimming, and compact cockpit status", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "studio-shell--",
    "studio-shell--refresh-",
    "radar-command-strip",
    "radar-command-strip__beam",
    "扫描节拍",
    "信号脉冲",
    "风险/延迟",
    "覆盖密度",
    "signalPulseTone",
    "selectedPulseTone",
    "coveragePercent",
  ];
  const requiredClasses = [
    "radar-command-strip",
    "radar-command-strip__beam",
    "radar-command-strip__cell",
    "radar-command-strip__cell--alert",
    "signal-node--selected",
    "signal-node--risk-high",
    "signal-rhythm__bar--active",
    "studio-shell--stale",
    "studio-shell--failed",
    "studio-shell--refresh-updated",
  ];
  const requiredAnimations = [
    "radarCommandSweep",
    "signalNodePulse",
    "signalBarPulse",
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

test("radar workspace composes the phase 8.2c cockpit app shell", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const componentPaths = [
    "src/components/radar/top-radar-bar.tsx",
    "src/components/radar/radar-boot-briefing.tsx",
    "src/components/radar/radar-cockpit-shell.tsx",
    "src/components/radar/ops-and-filter-panel.tsx",
  ];
  const requiredWorkspaceTokens = [
    "TopRadarBar",
    "RadarBootBriefing",
    "RadarCockpitShell",
    "OpsAndFilterPanel",
    "radar-app-shell",
  ];
  const requiredShellTokens = [
    "data-cockpit-ratio=\"2:6:2\"",
    "role=\"tablist\"",
    "运行",
    "机会",
    "复盘",
    "drawer",
    "lg:grid-cols-[minmax(220px,2fr)_minmax(0,6fr)_minmax(220px,2fr)]",
  ];
  const requiredCssClasses = [
    "radar-app-shell",
    "radar-boot-briefing",
    "radar-cockpit-shell",
    "ops-filter-panel",
  ];

  for (const path of componentPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), true, `${path} must exist`);
  }

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

  const shellSource = readFileSync(resolve(process.cwd(), "src/components/radar/radar-cockpit-shell.tsx"), "utf8");

  for (const token of requiredShellTokens) {
    assert.ok(shellSource.includes(token), `RadarCockpitShell missing ${token}`);
  }

  for (const className of requiredCssClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test("radar workspace exposes the phase 8.2b live navbar and 2-6-2 cockpit shell", () => {
  const uiSource = [
    "src/components/radar/radar-workspace.tsx",
    "src/components/radar/top-radar-bar.tsx",
    "src/components/radar/radar-cockpit-shell.tsx",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "live-navbar",
    "Live Navbar / Banner",
    "cockpit-card",
    "cockpit-column--left",
    "cockpit-column--center",
    "cockpit-column--right",
    "crystal-lens",
    "雷达之眼",
    "market-session-clock",
    "Altcoin Opportunity Board",
    "Macro Radar",
    "Signal Lifecycle Tracker",
  ];
  const requiredClasses = [
    "live-navbar",
    "cockpit-card",
    "cockpit-column--left",
    "cockpit-column--center",
    "cockpit-column--right",
    "crystal-lens",
    "market-session-clock",
    "altcoin-opportunity-board",
    "macro-radar-preview",
    "signal-lifecycle-preview",
  ];

  for (const token of requiredWorkspaceTokens) {
    assert.ok(uiSource.includes(token), `radar UI source missing phase 8.2b token: ${token}`);
  }

  for (const className of requiredClasses) {
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }

  assert.match(cssSource, /2fr\s+6fr\s+2fr/);
});

test("phase 8.2d live runtime layer exposes heartbeat, countdown, freshness, and degraded states", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const topBarSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/top-radar-bar.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredTopBarTokens = [
    "scan-heartbeat",
    "next-scan-countdown",
    "freshness-meter",
    "runtime-state-grid",
    "data-freshness",
    "runtimeStates",
    "formatCountdownLabel",
  ];
  const requiredWorkspaceTokens = [
    "buildRuntimeStates",
    "clockNow",
    "liveHealth.scan.freshness",
    "liveHealth.operations.minutesUntilNextScan",
    "liveHealth.archive.entries",
    "cron",
  ];
  const requiredClasses = [
    "scan-heartbeat",
    "next-scan-countdown",
    "freshness-meter",
    "runtime-state-grid",
    "runtime-state",
    "data-freshness",
  ];
  const requiredAnimations = [
    "scanHeartbeatPulse",
    "freshnessSweep",
    "runtimeStateFlash",
  ];

  for (const token of requiredTopBarTokens) {
    assert.match(topBarSource, new RegExp(token));
  }

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
  assert.equal(topBarSource.includes("background music"), false);
  assert.equal(topBarSource.includes("<audio"), false);
});

test("phase 3.8 altcoin opportunity board is the primary grouped opportunity surface", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const componentPath = resolve(process.cwd(), "src/components/radar/altcoin-opportunity-board.tsx");
  const componentSource = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "AltcoinOpportunityBoard",
    "buildAltcoinOpportunityBoard",
    "altcoinOpportunityBoard",
    "dailyMoverState.selectedDetails",
    "metadata.status",
  ];
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

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

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
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const componentPath = resolve(process.cwd(), "src/components/radar/macro-weather-panel.tsx");
  const componentSource = existsSync(componentPath) ? readFileSync(componentPath, "utf8") : "";
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredWorkspaceTokens = [
    "MacroWeatherPanel",
    "buildMacroWeather",
    "macroWeather",
    "tickers",
    "derivatives",
    "metadata.status",
  ];
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

  for (const token of requiredWorkspaceTokens) {
    assert.match(workspaceSource, new RegExp(token));
  }

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

test("pixel copilot removes the visible S680 vehicle direction from the normal radar UI", () => {
  const workspaceSource = readFileSync(resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"), "utf8");
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/pixel-copilot.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const requiredCopilotParts = [
    "copilot-dashboard",
    "copilot-vital",
    "copilot-stage",
    "copilot-shadow",
    "copilot-radar-desk",
  ];

  assert.match(workspaceSource, /PixelCopilot/);
  assert.doesNotMatch(workspaceSource, /PixelS680|pixel-s680/);
  assert.equal(componentSource.includes("<img"), false);
  assert.doesNotMatch(componentSource, /S680|s680-/);

  for (const part of requiredCopilotParts) {
    assert.match(componentSource, new RegExp(part));
    assert.match(cssSource, new RegExp(`\\.${part}`));
  }
});

test("pixel copilot MVP renders a BTC-necklace male avatar with equipment and no callout copy", () => {
  const componentSource = readFileSync(resolve(process.cwd(), "src/components/radar/pixel-copilot.tsx"), "utf8");
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
