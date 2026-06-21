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

test("altcoin trend radar specs and blueprint preserve the backend analysis contract", () => {
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

test("local dev preview uses webpack to match the production CSS pipeline", () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const devScript = packageJson.scripts?.dev ?? "";

  assert.match(devScript, /--webpack/);
});

test("v0 frontend shell is restored without touching backend API routes", () => {
  const pageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const radarComponentDir = resolve(process.cwd(), "src/components/radar");
  const radarComponentFiles = existsSync(radarComponentDir) ? readdirSync(radarComponentDir) : [];
  const requiredApiRoutes = [
    "src/app/api/health/route.ts",
    "src/app/api/scan/route.ts",
    "src/app/api/radar/route.ts",
    "src/app/api/radar/backend-contract/route.ts",
    "src/app/api/radar/dossier/route.ts",
    "src/app/api/archive/route.ts",
    "src/app/api/journal/route.ts",
    "src/app/api/frontend/radar-contract/route.ts",
    "src/app/api/frontend/token-dossier/route.ts",
    "src/app/api/frontend/leaderboard/route.ts",
    "src/app/api/frontend/review-contract/route.ts",
  ];

  assert.match(pageSource, /IntroHero/);
  assert.match(pageSource, /CHUANSCAN|虚拟货币异动检测/u);
  assert.match(cssSource, /@import 'tailwindcss'/);
  assert.match(cssSource, /--background:/);
  assert.equal(radarComponentFiles.length, 0, "src/components/radar should contain no active frontend files");
  assert.doesNotMatch(pageSource, /@\/components\/radar/);
  assert.doesNotMatch(pageSource, /getReadableMarketRadarSnapshot/);
  assert.doesNotMatch(pageSource, /buildSystemHealthReport/);
  assert.doesNotMatch(pageSource, /appPersistenceRepository/);

  for (const routePath of requiredApiRoutes) {
    assert.equal(existsSync(resolve(process.cwd(), routePath)), true, `${routePath} must remain after frontend reset`);
  }
});

test("v0 frontend handoff keeps old visual artifacts removed and records the handoff in docs", () => {
  const removedPaths = [
    "design-qa.md",
    "public/assets/radar-crystal-lens.png",
    "docs/superpowers/plans/2026-06-17-ui-reset-living-radar-cockpit.md",
    "docs/superpowers/specs/2026-06-17-ui-reset-living-radar-cockpit-design.md",
  ];
  const blueprintSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-blueprint.md"), "utf8");
  const charterSource = readFileSync(resolve(process.cwd(), "docs/chuan-market-radar-engineering-charter.md"), "utf8");

  for (const path of removedPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), false, `${path} should be removed by frontend reset`);
  }

  assert.match(blueprintSource, /v0 前端 UI 作为当前展示事实源/);
  assert.match(blueprintSource, /\/api\/frontend\/radar-contract/);
  assert.match(charterSource, /v0 前端 UI/);
});

test("frontend contract routes are read-only and cannot trigger scans", () => {
  const routePaths = [
    "src/app/api/frontend/radar-contract/route.ts",
    "src/app/api/frontend/token-dossier/route.ts",
    "src/app/api/frontend/leaderboard/route.ts",
    "src/app/api/frontend/review-contract/route.ts",
  ];

  for (const routePath of routePaths) {
    const source = readFileSync(resolve(process.cwd(), routePath), "utf8");
    assert.match(source, /allowRefresh:\s*false/, `${routePath} must read cached snapshots only`);
    assert.doesNotMatch(source, /refreshMarketRadarSnapshot/, `${routePath} must not start scan refreshes`);
  }
});

test("signals and leaderboard pages expose backend contract injection points", () => {
  const serverReaderPath = "src/lib/frontend-contract-server.ts";
  const serverReaderSource = existsSync(resolve(process.cwd(), serverReaderPath))
    ? readFileSync(resolve(process.cwd(), serverReaderPath), "utf8")
    : "";
  const requiredSources: Record<string, RegExp[]> = {
    "src/app/signals/page.tsx": [/getRadarContractForPage/, /<SignalMaturityPool signals=\{displaySignals\}/],
    "src/app/leaderboard/page.tsx": [/getAllLeaderboardContractsForPage/, /<MarketLeaderboards initialLeaderboards=\{leaderboards\}/],
    "src/components/signals/signal-maturity-pool.tsx": [/signals\?:/],
    "src/components/leaderboard/market-leaderboards.tsx": [/initialLeaderboards\?:/],
  };

  assert.equal(existsSync(resolve(process.cwd(), serverReaderPath)), true, "server-side frontend contract reader must exist");
  assert.doesNotMatch(serverReaderSource, /fetch\s*\(/, "server-side page reader must not HTTP fetch its own app");
  assert.match(serverReaderSource, /allowRefresh:\s*false/, "server-side page reader must not trigger scans");

  for (const [path, patterns] of Object.entries(requiredSources)) {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    for (const pattern of patterns) {
      assert.match(source, pattern, `${path} must match ${pattern}`);
    }
  }
});

test("signals visual widgets derive from backend radar signals", () => {
  const adapterPath = "src/lib/frontend-display-adapters.ts";

  assert.equal(existsSync(resolve(process.cwd(), adapterPath)), true, "backend-to-v0 display adapter must exist");

  const adapterSource = readFileSync(resolve(process.cwd(), adapterPath), "utf8");
  const signalsSource = readFileSync(resolve(process.cwd(), "src/app/signals/page.tsx"), "utf8");
  const sniperBoardSource = readFileSync(resolve(process.cwd(), "src/components/sniper-board.tsx"), "utf8");
  const liveFeedSource = readFileSync(resolve(process.cwd(), "src/components/live-feed.tsx"), "utf8");
  const liveStoreSource = readFileSync(resolve(process.cwd(), "src/lib/live-store.ts"), "utf8");

  assert.match(adapterSource, /radarSignalsToSignalCards/);
  assert.match(adapterSource, /radarSignalsToTokens/);
  assert.match(adapterSource, /radarSignalsToSniperTargets/);
  assert.match(adapterSource, /leaderboardRowsToCandidateSignals/);
  assert.match(adapterSource, /withLeaderboardSignalFallback/);

  assert.match(signalsSource, /radarSignalsToSignalCards/);
  assert.match(signalsSource, /radarSignalsToTokens/);
  assert.match(signalsSource, /radarSignalsToSniperTargets/);
  assert.match(signalsSource, /const displaySignals = withLeaderboardSignalFallback\(radar\.radarSignals,\s*tickerRows\)/);
  assert.match(signalsSource, /<SignalMaturityPool signals=\{displaySignals\}/);
  assert.match(signalsSource, /<SniperBoard targets=\{sniperTargets\}/);
  assert.doesNotMatch(signalsSource, /getTokens|getSignalCards/);

  assert.match(sniperBoardSource, /targets\?:\s*SniperTarget\[\]/);
  assert.match(liveFeedSource, /cards\.length === 0/);
  assert.match(liveStoreSource, /ensureQuote|fallbackQuoteForId/);
});

test("backend radar visual cards are enriched with backend ticker rows before falling back", () => {
  const adapterSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-display-adapters.ts"), "utf8");
  const signalsSource = readFileSync(resolve(process.cwd(), "src/app/signals/page.tsx"), "utf8");

  assert.match(adapterSource, /LeaderboardRow/);
  assert.match(adapterSource, /tickerRows/);
  assert.match(adapterSource, /priceBySymbol/);
  assert.match(adapterSource, /leaderboardRowsToCandidateSignals/);
  assert.match(adapterSource, /候选不等于交易计划/);

  assert.match(signalsSource, /getLeaderboardContractForPage/);
  assert.match(signalsSource, /const tickerRows = tickerLeaderboard\.data/);
  assert.match(signalsSource, /withLeaderboardSignalFallback\(radar\.radarSignals,\s*tickerRows\)/);
  assert.match(signalsSource, /radarSignalsToTokens\(displaySignals\.data,\s*tickerRows\)/);
  assert.match(signalsSource, /radarSignalsToSignalCards\(displaySignals\.data,\s*tickerRows\)/);
  assert.match(signalsSource, /radarSignalsToSniperTargets\(radar\.radarSignals\.data,\s*tickerRows\)/);
});

test("review and system backend carrier panels receive server-side contracts", () => {
  const reviewPageSource = readFileSync(resolve(process.cwd(), "src/app/review/page.tsx"), "utf8");
  const systemPageSource = readFileSync(resolve(process.cwd(), "src/app/system/page.tsx"), "utf8");
  const reviewEvolutionSource = readFileSync(resolve(process.cwd(), "src/components/review/review-evolution.tsx"), "utf8");
  const systemStatusSource = readFileSync(resolve(process.cwd(), "src/components/system/system-status.tsx"), "utf8");

  assert.match(reviewPageSource, /getReviewContractForPage/);
  assert.match(reviewPageSource, /export default async function ReviewPage/);
  assert.match(reviewPageSource, /<ReviewEvolution contract=\{review\}/);

  assert.match(systemPageSource, /getRadarContractForPage/);
  assert.match(systemPageSource, /export default async function SystemPage/);
  assert.match(systemPageSource, /<SystemStatus contract=\{radar\}/);

  assert.match(reviewEvolutionSource, /contract\?:\s*ReviewContract/);
  assert.match(reviewEvolutionSource, /contract\?\.signalLifecycles\s*\?\?/);
  assert.match(reviewEvolutionSource, /contract\?\.strategyArchetypes\s*\?\?/);
  assert.match(reviewEvolutionSource, /contract\?\.missedDetections\s*\?\?/);
  assert.match(reviewEvolutionSource, /contract\?\.evolutionSuggestions\s*\?\?/);

  assert.match(systemStatusSource, /contract\?:\s*RadarContract/);
  assert.match(systemStatusSource, /contract\?\.serviceNodes\s*\?\?/);
  assert.match(systemStatusSource, /contract\?\.dataPipeline\s*\?\?/);
  assert.match(systemStatusSource, /contract\?\.apiUsage\s*\?\?/);
});

test("token detail page can render backend radar symbols without relying only on mock tokens", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const adapterSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-display-adapters.ts"), "utf8");

  assert.match(adapterSource, /radarSignalsToFeedSignals/);

  assert.match(tokenPageSource, /getRadarContractForPage/);
  assert.match(tokenPageSource, /getLeaderboardContractForPage/);
  assert.match(tokenPageSource, /radarSignalsToTokens/);
  assert.match(tokenPageSource, /radarSignalsToFeedSignals/);
  assert.match(tokenPageSource, /const backendToken = radarSignalsToTokens\(radar\.radarSignals\.data,\s*tickerRows\)\.find/);
  assert.match(tokenPageSource, /const token = backendToken \?\? getToken\(id\)/);
  assert.match(tokenPageSource, /const backendSignals = radarSignalsToFeedSignals\(radar\.radarSignals\.data,\s*token\.symbol\)/);
  assert.match(tokenPageSource, /backendSignals\.length === 0/);
  assert.match(tokenPageSource, /当前没有该标的的后端异动追踪记录/);
  assert.doesNotMatch(tokenPageSource, /getSignals/);
  assert.doesNotMatch(tokenPageSource, /数据均为模拟演示/);
});

test("sniper board stays visible when backend has no trade-plan-ready targets", () => {
  const sniperBoardSource = readFileSync(resolve(process.cwd(), "src/components/sniper-board.tsx"), "utf8");

  assert.doesNotMatch(sniperBoardSource, /if \(pool\.length === 0\) return null/);
  assert.match(sniperBoardSource, /暂无通过最终筛选/);
  assert.match(sniperBoardSource, /等待证据融合、赔率和风控同时满足/);
});

test("stage 8 global ticker bars can receive backend-derived tokens", () => {
  const priceTickerSource = readFileSync(resolve(process.cwd(), "src/components/price-ticker.tsx"), "utf8");
  const sessionBarSource = readFileSync(resolve(process.cwd(), "src/components/session-bar.tsx"), "utf8");
  const signalsSource = readFileSync(resolve(process.cwd(), "src/app/signals/page.tsx"), "utf8");
  const leaderboardSource = readFileSync(resolve(process.cwd(), "src/app/leaderboard/page.tsx"), "utf8");
  const adapterSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-display-adapters.ts"), "utf8");

  assert.match(adapterSource, /leaderboardRowsToTokens/);
  assert.match(adapterSource, /mergeTokensBySymbol/);

  assert.match(priceTickerSource, /tokens\?:\s*Token\[\]/);
  assert.match(priceTickerSource, /tokens\s*\?\?\s*getTokens\(\)/);
  assert.match(sessionBarSource, /tokens\?:\s*Token\[\]/);
  assert.match(sessionBarSource, /tokens\s*\?\?\s*getTokens\(\)/);

  assert.match(signalsSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(leaderboardSource, /leaderboardRowsToTokens/);
  assert.match(leaderboardSource, /mergeTokensBySymbol/);
  assert.match(leaderboardSource, /<PriceTicker tokens=\{tickerTokens\}/);
  assert.match(leaderboardSource, /<LeaderboardTable tokens=\{tableTokens\}/);
  assert.doesNotMatch(leaderboardSource, /getTokens\(\)/);
  assert.doesNotMatch(leaderboardSource, /数据均为模拟演示/);
});

test("stage 8 token signal archive prefers backend dossier before mock fallback", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const signalArchiveSource = readFileSync(resolve(process.cwd(), "src/components/signal-archive.tsx"), "utf8");

  assert.match(tokenPageSource, /<SignalArchive token=\{token\} dossier=\{dossier\}/);

  assert.match(signalArchiveSource, /type TokenArchive/);
  assert.match(signalArchiveSource, /TokenDossier/);
  assert.match(signalArchiveSource, /Resource/);
  assert.match(signalArchiveSource, /dossier\?:\s*Resource<TokenDossier>/);
  assert.match(signalArchiveSource, /dossierToArchive/);
  assert.match(signalArchiveSource, /dossier\?\.data/);
  assert.match(signalArchiveSource, /dossierToArchive\(dossier,\s*token\)\s*\?\?\s*getTokenArchive\(token\)/);
  assert.match(signalArchiveSource, /后端结构化研究输出/);
  assert.doesNotMatch(signalArchiveSource, /系统模拟推演/);
});

test("stage 8 token detail chart and flow panels do not present generated mock data as real", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const klinePanelSource = readFileSync(resolve(process.cwd(), "src/components/kline-panel.tsx"), "utf8");

  assert.match(klinePanelSource, /candles\?:\s*ChartCandle\[\]/);
  assert.match(klinePanelSource, /allowMockFallback\?:\s*boolean/);
  assert.match(klinePanelSource, /等待真实 K 线数据/);
  assert.match(klinePanelSource, /candles\?\.length/);

  assert.match(tokenPageSource, /<KlinePanel[\s\S]+allowMockFallback=\{false\}/);
  assert.match(tokenPageSource, /等待真实资金流数据/);
  assert.doesNotMatch(tokenPageSource, /Array\.from\(\{ length: 28 \}\)/);
  assert.doesNotMatch(tokenPageSource, /\(\(seed \* \(i \+ 3\)\) % 100\)/);
});

test("stage 8 dashboard and market pages read backend contract instead of mock market panels", () => {
  const dashboardSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
  const scanProofSource = readFileSync(resolve(process.cwd(), "src/components/scan-proof.tsx"), "utf8");
  const dashboardControlSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/radar-control.tsx"), "utf8");
  const marketPageSource = readFileSync(resolve(process.cwd(), "src/app/market/page.tsx"), "utf8");
  const marketClientSource = readFileSync(resolve(process.cwd(), "src/app/market/market-page-client.tsx"), "utf8");
  const macroDerivativesSource = readFileSync(resolve(process.cwd(), "src/components/market/macro-derivatives.tsx"), "utf8");
  const adapterSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-display-adapters.ts"), "utf8");

  assert.match(adapterSource, /macroResourceToMarketEnv/);
  assert.match(adapterSource, /scanProofResourceToScanState/);
  assert.match(adapterSource, /scanProofResourceToDataQuality/);
  assert.match(adapterSource, /derivativesResourceToCoinglassData/);

  assert.match(dashboardSource, /getRadarContractForPage/);
  assert.match(dashboardSource, /getLeaderboardContractForPage/);
  assert.match(dashboardSource, /scanProofResourceToScanState/);
  assert.match(dashboardSource, /macroResourceToMarketEnv/);
  assert.match(dashboardSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(dashboardSource, /<ScanProof[\s\S]+scanProof=\{radar\.scanProof\}/);
  assert.match(dashboardSource, /<DashboardRadarControl contract=\{radar\}/);
  assert.doesNotMatch(dashboardSource, /getTokens|getSignalCards|getScanState|getMarketEnv/);

  assert.match(scanProofSource, /scanProof\?:\s*Resource<ScanProofData>/);
  assert.match(scanProofSource, /scanProofResourceToScanState/);
  assert.match(scanProofSource, /dataSourcesResourceToExchangeCoverage/);

  assert.match(dashboardControlSource, /contract\?:\s*RadarContract/);
  assert.match(dashboardControlSource, /contract\?\.scanProof\s*\?\?/);
  assert.match(dashboardControlSource, /contract\?\.deepScanQueue\s*\?\?/);
  assert.match(dashboardControlSource, /contract\?\.dataSources\s*\?\?/);

  assert.match(marketPageSource, /getRadarContractForPage/);
  assert.match(marketPageSource, /getAllLeaderboardContractsForPage/);
  assert.match(marketPageSource, /<MarketPageClient radar=\{radar\} tokens=\{tokens\}/);
  assert.match(marketClientSource, /radar\.macroAltEnv/);
  assert.match(marketClientSource, /radar\.derivatives/);
  assert.match(marketClientSource, /radar\.dataSources/);
  assert.match(marketClientSource, /radar\.scanProof/);
  assert.match(marketClientSource, /radar\.apiUsage/);
  assert.match(marketClientSource, /后端契约数据/);
  assert.match(marketClientSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(marketClientSource, /<MarketMacroDerivatives contract=\{radar\}/);

  assert.doesNotMatch(marketClientSource, /getMarketEnv|getDataQuality|getCoinglass/);
  assert.doesNotMatch(marketClientSource, /数据均为模拟演示/);

  assert.match(macroDerivativesSource, /contract\?:\s*RadarContract/);
  assert.match(macroDerivativesSource, /contract\?\.macroAltEnv\s*\?\?/);
  assert.match(macroDerivativesSource, /contract\?\.derivatives\s*\?\?/);
  assert.match(macroDerivativesSource, /contract\?\.apiUsage\s*\?\?/);
});

test("stage 8 review and system pages do not render legacy mock centers", () => {
  const reviewPageSource = readFileSync(resolve(process.cwd(), "src/app/review/page.tsx"), "utf8");
  const systemPageSource = readFileSync(resolve(process.cwd(), "src/app/system/page.tsx"), "utf8");

  assert.match(reviewPageSource, /getReviewContractForPage/);
  assert.match(reviewPageSource, /<ReviewEvolution contract=\{review\}/);
  assert.doesNotMatch(reviewPageSource, /ReviewCenter/);

  assert.match(systemPageSource, /getRadarContractForPage/);
  assert.match(systemPageSource, /radarSignalsToTokens/);
  assert.match(systemPageSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(systemPageSource, /<SystemStatus contract=\{radar\}/);
  assert.doesNotMatch(systemPageSource, /SystemCenter/);
  assert.doesNotMatch(systemPageSource, /<SessionBar\s*\/>/);
});

test("stage 8 homepage uses backend contract data and removes old demo claims", () => {
  const homePageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const introSectionsSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-sections.tsx"), "utf8");
  const introHeroSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-hero.tsx"), "utf8");
  const introPipelineSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-pipeline.tsx"), "utf8");
  const siteLoaderSource = readFileSync(resolve(process.cwd(), "src/components/site-loader.tsx"), "utf8");
  const layoutSource = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

  assert.match(homePageSource, /getRadarContractForPage/);
  assert.match(homePageSource, /radarSignalsToTokens/);
  assert.match(homePageSource, /export default async function HomePage/);
  assert.match(homePageSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(homePageSource, /后端契约数据/);
  assert.doesNotMatch(homePageSource, /<SessionBar\s*\/>/);
  assert.doesNotMatch(homePageSource, /数据均为模拟演示/);
  assert.doesNotMatch(homePageSource, /15600|99\.9|200ms|毫秒级/);

  assert.match(introSectionsSource, /分层扫描/);
  assert.match(introSectionsSource, /CoinGlass/);
  assert.match(introSectionsSource, /交易所合约/);
  assert.match(introSectionsSource, /显式标注/);
  assert.doesNotMatch(
    introSectionsSource,
    /模拟演示数据|毫秒级|不足 200ms|2400\+|链上转账|社交热度|即刻推送/,
  );
  assert.doesNotMatch(introHeroSource, /毫秒级|链上异动/);
  assert.doesNotMatch(introPipelineSource, /毫秒级/);
  assert.doesNotMatch(siteLoaderSource, /链上异动|链上数据源/);
  assert.doesNotMatch(layoutSource, /链上资金异动/);
});

test("frontend contract pages render dynamically instead of freezing build-time data", () => {
  const contractPages = [
    "src/app/page.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/signals/page.tsx",
    "src/app/market/page.tsx",
    "src/app/leaderboard/page.tsx",
    "src/app/review/page.tsx",
    "src/app/system/page.tsx",
    "src/app/token/[id]/page.tsx",
  ];

  for (const pagePath of contractPages) {
    const source = readFileSync(resolve(process.cwd(), pagePath), "utf8");
    assert.match(source, /export const dynamic = ['"]force-dynamic['"]/, `${pagePath} must not prerender stale contract data`);
  }
});
