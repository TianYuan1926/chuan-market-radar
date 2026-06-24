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
    "src/app/api/frontend/kline-contract/route.ts",
    "src/app/api/frontend/journal-contract/route.ts",
    "src/app/api/frontend/live-events/route.ts",
    "src/app/api/frontend/live-events/stream/route.ts",
    "src/app/api/frontend/ui-state/route.ts",
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

test("dashboard exposes core chain governance as a visible backend contract panel", () => {
  const dashboardPageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
  const radarControlSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/radar-control.tsx"), "utf8");

  assert.match(dashboardPageSource, /<DashboardRadarControl contract=\{radar\}/);
  assert.match(radarControlSource, /coreChainGovernance/);
  assert.match(radarControlSource, /核心链路体检/u);
  assert.match(radarControlSource, /全市场发现 → 复盘进化/u);
  assert.match(radarControlSource, /cleanupRules/);
  assert.match(radarControlSource, /功能分级/u);
  assert.match(radarControlSource, /featureTriage/);
  assert.match(radarControlSource, /页面职责/u);
  assert.match(radarControlSource, /pageRoles/);
  assert.match(radarControlSource, /canCreateTradeSignal:\s*false/);
  assert.doesNotMatch(radarControlSource, /getCoreChainGovernance\(/);
});

test("dashboard exposes realtime capability boundaries instead of fake realtime claims", () => {
  const radarControlSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/radar-control.tsx"), "utf8");
  const frontendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/frontend-contract.ts"), "utf8");

  assert.match(frontendContractSource, /RealtimeCapabilityState/);
  assert.match(frontendContractSource, /buildRealtimeCapability/);
  assert.match(frontendContractSource, /canCreateTradeSignal:\s*false/);
  assert.match(frontendContractSource, /秒级数据只负责发现异常/u);
  assert.match(frontendContractSource, /CoinGlass 是资金质量确认层/u);

  assert.match(radarControlSource, /realtimeCapability/);
  assert.match(radarControlSource, /实时能力分层/u);
  assert.match(radarControlSource, /秒级发现，不直接生成交易计划/u);
  assert.match(radarControlSource, /硬边界/u);
  assert.doesNotMatch(radarControlSource, /秒级.*交易计划就绪/u);
});

test("dashboard exposes light scan quality diagnostics without promoting light scan to trade plans", () => {
  const radarControlSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/radar-control.tsx"), "utf8");
  const frontendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/frontend-contract.ts"), "utf8");
  const legacyContractSource = readFileSync(resolve(process.cwd(), "src/lib/radar-contract.ts"), "utf8");

  assert.match(frontendContractSource, /LightScanQualityState/);
  assert.match(frontendContractSource, /light-scan-quality\.v1/);
  assert.match(frontendContractSource, /rollingWindowCandidateCount/);
  assert.match(frontendContractSource, /zScoreCandidateCount/);
  assert.match(frontendContractSource, /canCreateTradeSignal:\s*false/);
  assert.match(frontendContractSource, /轻扫质量诊断只用于发现层可靠性/u);

  assert.match(legacyContractSource, /getLightScanQuality/);
  assert.match(legacyContractSource, /轻扫质量不能生成交易计划/u);

  assert.match(radarControlSource, /lightScanQuality/);
  assert.match(radarControlSource, /轻扫质量诊断/u);
  assert.match(radarControlSource, /发现层可靠性，不生成交易计划/u);
  assert.match(radarControlSource, /rollingWindowCandidateCount/);
  assert.doesNotMatch(radarControlSource, /轻扫质量.*计划就绪/u);
});

test("dashboard runtime overview is derived from backend contract state without fake live movement", () => {
  const dashboardPageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

  assert.match(dashboardPageSource, /systemStatusFromContracts/);
  assert.match(dashboardPageSource, /radar\.scanProof\.status/);
  assert.match(dashboardPageSource, /radar\.dataSources\.data\.map/);
  assert.doesNotMatch(dashboardPageSource, /value:\s*['"]正常['"]/u);
  assert.doesNotMatch(dashboardPageSource, /LiveStat/);
});

test("scan proof header reflects scan resource status instead of hardcoded green healthy state", () => {
  const scanProofSource = readFileSync(resolve(process.cwd(), "src/components/scan-proof.tsx"), "utf8");

  assert.match(scanProofSource, /scanRuntimeLabel/);
  assert.match(scanProofSource, /SCAN_DOT_TONE/);
  assert.match(scanProofSource, /scanProof\?\.status/);
  assert.match(scanProofSource, /<StatusBadge status=\{scanProof\.status\}/);
  assert.doesNotMatch(scanProofSource, /bg-up[^\\n]+扫描正常/u);
});

test("frontend contract routes are read-only and cannot trigger scans", () => {
  const directSnapshotRoutePaths = [
    "src/app/api/frontend/token-dossier/route.ts",
  ];
  const cachedGetterRoutePaths = [
    ["src/app/api/frontend/radar-contract/route.ts", "getRadarContractForPage"],
    ["src/app/api/frontend/leaderboard/route.ts", "getLeaderboardContractForPage"],
    ["src/app/api/frontend/review-contract/route.ts", "getReviewContractForPage"],
  ] as const;
  const frontendContractServerSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-contract-server.ts"), "utf8");

  for (const routePath of directSnapshotRoutePaths) {
    const source = readFileSync(resolve(process.cwd(), routePath), "utf8");
    assert.match(source, /allowRefresh:\s*false/, `${routePath} must read cached snapshots only`);
    assert.doesNotMatch(source, /refreshMarketRadarSnapshot/, `${routePath} must not start scan refreshes`);
  }

  for (const [routePath, getterName] of cachedGetterRoutePaths) {
    const source = readFileSync(resolve(process.cwd(), routePath), "utf8");
    assert.match(source, new RegExp(`${getterName}\\(`), `${routePath} must use the shared cached frontend getter`);
    assert.doesNotMatch(source, /getReadableMarketRadarSnapshot|refreshMarketRadarSnapshot/, `${routePath} must not read or refresh snapshots directly`);
  }

  assert.match(frontendContractServerSource, /allowRefresh:\s*false/, "shared frontend getters must read cached snapshots only");
  assert.doesNotMatch(frontendContractServerSource, /refreshMarketRadarSnapshot/, "shared frontend getters must not start scan refreshes");
  assert.match(frontendContractServerSource, /readThroughTtlCache/, "shared frontend getters must use short TTL caching");

  const liveEventsRoute = "src/app/api/frontend/live-events/route.ts";
  const liveEventsSource = readFileSync(resolve(process.cwd(), liveEventsRoute), "utf8");

  assert.match(liveEventsSource, /buildFrontendLiveEvents/, `${liveEventsRoute} must use the archive event contract`);
  assert.match(liveEventsSource, /x-chuan-triggered-scan/);
  assert.doesNotMatch(liveEventsSource, /getReadableMarketRadarSnapshot|refreshMarketRadarSnapshot/, `${liveEventsRoute} must not start scan refreshes`);

  const liveEventsStreamRoute = "src/app/api/frontend/live-events/stream/route.ts";
  const liveEventsStreamSource = readFileSync(resolve(process.cwd(), liveEventsStreamRoute), "utf8");

  assert.match(liveEventsStreamSource, /text\/event-stream/, `${liveEventsStreamRoute} must be an SSE stream`);
  assert.match(liveEventsStreamSource, /buildFrontendLiveEvents/, `${liveEventsStreamRoute} must reuse the archive event contract`);
  assert.match(liveEventsStreamSource, /x-chuan-triggered-scan/);
  assert.match(liveEventsStreamSource, /request\.signal/);
  assert.doesNotMatch(liveEventsStreamSource, /getReadableMarketRadarSnapshot|refreshMarketRadarSnapshot|COINGLASS_API_KEY/, `${liveEventsStreamRoute} must not start scans or read provider secrets`);

  const uiStateRoute = "src/app/api/frontend/ui-state/route.ts";
  const uiStateSource = readFileSync(resolve(process.cwd(), uiStateRoute), "utf8");

  assert.match(uiStateSource, /upsertFrontendUiState/, `${uiStateRoute} must use the dedicated UI state store`);
  assert.match(uiStateSource, /ui_state_only/);
  assert.doesNotMatch(uiStateSource, /addJournalEvent|addScanArchive|refreshMarketRadarSnapshot|getReadableMarketRadarSnapshot/);
});

test("frontend manual journal is backed by the journal contract with local fallback only", () => {
  const routePath = "src/app/api/frontend/journal-contract/route.ts";
  const journalStoreSource = readFileSync(resolve(process.cwd(), "src/lib/journal-store.ts"), "utf8");
  const routeSource = existsSync(resolve(process.cwd(), routePath))
    ? readFileSync(resolve(process.cwd(), routePath), "utf8")
    : "";

  assert.equal(existsSync(resolve(process.cwd(), routePath)), true, `${routePath} must exist`);
  assert.match(routeSource, /reconstructManualTradeJournal/);
  assert.match(routeSource, /buildManualTradeJournalEvent/);
  assert.doesNotMatch(routeSource, /refreshMarketRadarSnapshot/);
  assert.match(journalStoreSource, /\/api\/frontend\/journal-contract/);
  assert.match(journalStoreSource, /syncEntriesFromServer/);
  assert.match(journalStoreSource, /postJournalMutation/);
  assert.match(journalStoreSource, /localStorage/);
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
  const sniperDataSource = readFileSync(resolve(process.cwd(), "src/lib/sniper-data.ts"), "utf8");
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
  assert.match(sniperBoardSource, /targets\s*\?\?\s*\[\]/);
  assert.doesNotMatch(sniperBoardSource, /getSniperTargets/);
  assert.doesNotMatch(sniperBoardSource, /Math\.random/);
  assert.doesNotMatch(sniperBoardSource, /setTimeout/);
  assert.doesNotMatch(sniperDataSource, /getSniperTargets|getSignalCards|mulberry32|Math\.random/);
  assert.match(sniperDataSource, /纯显示 helper/);
  assert.match(liveFeedSource, /useSignalFeed/);
  assert.match(liveFeedSource, /eventItems\.length > 0 \? eventItems : cardItems/);
  assert.match(liveFeedSource, /items\.length === 0/);
  assert.doesNotMatch(liveFeedSource, /Math\.random/);
  assert.doesNotMatch(liveFeedSource, /setInterval/);
  assert.doesNotMatch(liveFeedSource, /巨鲸入场|\$3,280|空单爆仓 \$4,200/);
  assert.match(liveStoreSource, /upsertLiveQuotes/);
  assert.doesNotMatch(liveStoreSource, /fallbackQuoteForId/);
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
  assert.doesNotMatch(reviewEvolutionSource, /getSignalLifecycles|getStrategyArchetypes|getMissedDetections|getEvolutionSuggestions/);

  assert.match(systemStatusSource, /contract\?:\s*RadarContract/);
  assert.match(systemStatusSource, /contract\?\.serviceNodes\s*\?\?/);
  assert.match(systemStatusSource, /contract\?\.dataPipeline\s*\?\?/);
  assert.match(systemStatusSource, /contract\?\.apiUsage\s*\?\?/);
  assert.doesNotMatch(systemStatusSource, /getServiceNodes|getDataPipeline|getApiUsage/);
});

test("system service nodes use runtime probes instead of static Redis and worker placeholders", () => {
  const frontendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/frontend-contract.ts"), "utf8");
  const systemHealthSource = readFileSync(resolve(process.cwd(), "src/lib/api/system-health.ts"), "utf8");
  const backendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/backend-contract.ts"), "utf8");
  const heartbeatRoutePath = "src/app/api/admin/runtime/heartbeat/route.ts";
  const heartbeatRouteSource = existsSync(resolve(process.cwd(), heartbeatRoutePath))
    ? readFileSync(resolve(process.cwd(), heartbeatRoutePath), "utf8")
    : "";
  const protectedWorkerSource = readFileSync(resolve(process.cwd(), "deploy/workers/protected-api-worker.mjs"), "utf8");
  const websocketWorkerSource = readFileSync(resolve(process.cwd(), "deploy/workers/ws-light-scan-worker.mjs"), "utf8");

  assert.equal(existsSync(resolve(process.cwd(), "src/lib/runtime/worker-heartbeat.ts")), true);
  assert.equal(existsSync(resolve(process.cwd(), heartbeatRoutePath)), true);
  assert.match(heartbeatRouteSource, /isCronRequestAuthorized/);
  assert.match(heartbeatRouteSource, /writeConfiguredWorkerHeartbeat/);
  assert.match(protectedWorkerSource, /\/api\/admin\/runtime\/heartbeat/);
  assert.match(websocketWorkerSource, /\/api\/admin\/runtime\/heartbeat/);

  assert.match(systemHealthSource, /runtimeProbes:\s*RuntimeProbeReport/);
  assert.match(backendContractSource, /runtimeProbes:\s*SystemHealthReport\["runtimeProbes"\]/);
  assert.match(frontendContractSource, /runtimeProbeServiceNodes/);
  assert.doesNotMatch(frontendContractSource, /未从后端健康检查暴露 Redis 探针/);
});

test("token detail page can render backend radar symbols without relying only on mock tokens", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const adapterSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-display-adapters.ts"), "utf8");

  assert.match(adapterSource, /radarSignalsToFeedSignals/);

  assert.match(tokenPageSource, /getRadarContractForPage/);
  assert.match(tokenPageSource, /getLeaderboardContractForPage/);
  assert.match(tokenPageSource, /getAllLeaderboardContractsForPage/);
  assert.match(tokenPageSource, /radarSignalsToTokens/);
  assert.match(tokenPageSource, /leaderboardRowsToTokens/);
  assert.match(tokenPageSource, /mergeTokensBySymbol/);
  assert.match(tokenPageSource, /radarSignalsToFeedSignals/);
  assert.match(tokenPageSource, /const backendTokens = mergeTokensBySymbol/);
  assert.match(tokenPageSource, /const token = backendTokens\.find/);
  assert.match(tokenPageSource, /if \(!token\) notFound\(\)/);
  assert.match(tokenPageSource, /const backendSignals = radarSignalsToFeedSignals\(radar\.radarSignals\.data,\s*token\.symbol\)/);
  assert.match(tokenPageSource, /backendSignals\.length === 0/);
  assert.match(tokenPageSource, /当前没有该标的的后端异动追踪记录/);
  assert.doesNotMatch(tokenPageSource, /getToken\(id\)/);
  assert.doesNotMatch(tokenPageSource, /getSignals/);
  assert.doesNotMatch(tokenPageSource, /数据均为模拟演示/);
});

test("sniper board stays visible when backend has no trade-plan-ready targets", () => {
  const sniperBoardSource = readFileSync(resolve(process.cwd(), "src/components/sniper-board.tsx"), "utf8");

  assert.doesNotMatch(sniperBoardSource, /if \(pool\.length === 0\) return null/);
  assert.match(sniperBoardSource, /暂无通过最终筛选/);
  assert.match(sniperBoardSource, /等待证据融合、赔率和风控同时满足/);
});

test("frontend data truth contract blocks active mock market facts", () => {
  const contractDoc = readFileSync(resolve(process.cwd(), "docs/frontend-data-truth-contract.md"), "utf8");
  const signalFeedSource = readFileSync(resolve(process.cwd(), "src/lib/signal-feed.ts"), "utf8");
  const journalStoreSource = readFileSync(resolve(process.cwd(), "src/lib/journal-store.ts"), "utf8");
  const liveNumberSource = readFileSync(resolve(process.cwd(), "src/lib/use-live-number.ts"), "utf8");
  const displayFormatSource = readFileSync(resolve(process.cwd(), "src/lib/display-format.ts"), "utf8");
  const trainingEngineSource = readFileSync(resolve(process.cwd(), "src/lib/training-engine.ts"), "utf8");
  const petRobotSource = readFileSync(resolve(process.cwd(), "src/components/pet-robot.tsx"), "utf8");
  const leaderboardSource = readFileSync(resolve(process.cwd(), "src/components/leaderboard-table.tsx"), "utf8");
  const anomalyBoardSource = readFileSync(resolve(process.cwd(), "src/components/anomaly-board.tsx"), "utf8");
  const appRepositorySource = readFileSync(resolve(process.cwd(), "src/lib/persistence/app-repository.ts"), "utf8");
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");

  assert.match(contractDoc, /Backend fact/);
  assert.match(contractDoc, /Honest empty state/);
  assert.match(contractDoc, /Randomly generated market signals/);
  assert.match(contractDoc, /Market cap: show `待补齐`, not `0`/);

  assert.match(signalFeedSource, /publishSignalEvent/);
  assert.doesNotMatch(signalFeedSource, /getTokens|Math\.random|scheduleNext|playSound/);

  assert.match(journalStoreSource, /LEGACY_SEED_IDS/);
  assert.doesNotMatch(journalStoreSource, /symbol:\s*'DOGS'|symbol:\s*'WIF'/);
  assert.match(appRepositorySource, /ENABLE_PREVIEW_SEED_DATA/);
  assert.match(appRepositorySource, /previewSeedEnabled \? mockJournalEvents : \[\]/);
  assert.doesNotMatch(appRepositorySource, /initialJournalEvents:\s*mockJournalEvents/);

  assert.match(liveNumberSource, /mirrors the latest backend-provided value only/);
  assert.doesNotMatch(liveNumberSource, /Math\.random|setInterval|随机游走/);

  assert.match(trainingEngineSource, /setTrainingPool/);
  assert.doesNotMatch(trainingEngineSource, /getSniperTargets|getSignalCards/);
  assert.doesNotMatch(petRobotSource, /startTrainingEngine/);

  assert.match(displayFormatSource, /fmtKnownCap/);
  assert.match(leaderboardSource, /fmtKnownCap/);
  assert.match(anomalyBoardSource, /fmtKnownCap/);
  assert.match(tokenPageSource, /fmtKnownCap/);
  assert.doesNotMatch(anomalyBoardSource, /AI 模拟推演/);
});

test("frontend backend field map records current wiring gaps before refinement", () => {
  const fieldMapPath = "docs/frontend-backend-field-map.md";
  const integrationPlanPath = "docs/current-frontend-backend-integration-plan.md";
  const fieldMap = readFileSync(resolve(process.cwd(), fieldMapPath), "utf8");
  const integrationPlan = readFileSync(resolve(process.cwd(), integrationPlanPath), "utf8");

  assert.match(fieldMap, /Frontend Backend Field Map/);
  assert.match(fieldMap, /v0 frontend UI is the visual source of truth/);
  assert.match(fieldMap, /\/api\/frontend\/radar-contract/);
  assert.match(fieldMap, /\/api\/frontend\/leaderboard\?kind=\.\.\./);
  assert.match(fieldMap, /\/api\/frontend\/token-dossier\?symbol=\.\.\./);
  assert.match(fieldMap, /\/api\/frontend\/review-contract/);

  assert.match(fieldMap, /Radar Contract Field Map/);
  assert.match(fieldMap, /Leaderboard Contract Field Map/);
  assert.match(fieldMap, /Token Dossier Field Map/);
  assert.match(fieldMap, /Review Contract Field Map/);
  assert.match(fieldMap, /System Data Gaps/);

  assert.match(fieldMap, /K-line panel[\s\S]+buildFrontendKlineContract/);
  assert.match(fieldMap, /fund-flow panel is still an honest waiting state/);
  assert.match(fieldMap, /fundFlow[\s\S]+partial/);
  assert.match(fieldMap, /scanStability[\s\S]+operations diagnostic only/);
  assert.match(fieldMap, /reviewStats[\s\S]+sample-size aware/);
  assert.match(fieldMap, /strategyV3\.tradePlan/);
  assert.match(fieldMap, /missing or blocked plans render no trade plan/);
  assert.match(fieldMap, /Manual Journal Contract Field Map/);
  assert.match(fieldMap, /\/api\/frontend\/journal-contract/);
  assert.match(fieldMap, /rankDelta=0/);
  assert.match(fieldMap, /Redis health probe and worker heartbeat probe/);
  assert.match(fieldMap, /\/api\/frontend\/live-events\/stream/);
  assert.match(fieldMap, /SSE transport is available/);
  assert.match(fieldMap, /AI counter-evidence review is evidence-id bound/);

  assert.match(integrationPlan, /docs\/frontend-backend-field-map\.md/);
  assert.match(integrationPlan, /当前已经完成的基础/);
  assert.match(integrationPlan, /已补齐的只读合同/);
  assert.match(integrationPlan, /下一批需要补强的合同/);
  assert.match(integrationPlan, /\/api\/frontend\/kline-contract/);
  assert.match(integrationPlan, /\/api\/frontend\/journal-contract/);
  assert.match(integrationPlan, /\/api\/frontend\/live-events/);
  assert.match(integrationPlan, /\/api\/frontend\/live-events\/stream/);
  assert.match(integrationPlan, /RadarContract\.scanStability/);
  assert.match(integrationPlan, /ReviewContract\.reviewStats/);
  assert.match(integrationPlan, /\/api\/frontend\/ui-state/);
  assert.match(integrationPlan, /\/api\/auth\/session/);
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
  assert.match(priceTickerSource, /tokens\s*\?\?\s*\[\]/);
  assert.doesNotMatch(priceTickerSource, /getTokens\(\)/);
  assert.match(sessionBarSource, /tokens\?:\s*Token\[\]/);
  assert.match(sessionBarSource, /tokens\s*\?\?\s*\[\]/);
  assert.doesNotMatch(sessionBarSource, /getTokens\(\)/);

  assert.match(signalsSource, /<SessionBar tokens=\{tokens\}/);
  assert.match(leaderboardSource, /leaderboardRowsToTokens/);
  assert.match(leaderboardSource, /mergeTokensBySymbol/);
  assert.match(leaderboardSource, /<PriceTicker tokens=\{tickerTokens\}/);
  assert.match(leaderboardSource, /<LeaderboardTable tokens=\{tableTokens\}/);
  assert.doesNotMatch(leaderboardSource, /getTokens\(\)/);
  assert.doesNotMatch(leaderboardSource, /数据均为模拟演示/);
});

test("stage 8 token signal archive uses backend dossier and honest empty state instead of mock fallback", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const signalArchiveSource = readFileSync(resolve(process.cwd(), "src/components/signal-archive.tsx"), "utf8");

  assert.match(tokenPageSource, /<SignalArchive token=\{token\} dossier=\{dossier\}/);

  assert.match(signalArchiveSource, /TokenArchive/);
  assert.match(signalArchiveSource, /TokenDossier/);
  assert.match(signalArchiveSource, /Resource/);
  assert.match(signalArchiveSource, /dossier\?:\s*Resource<TokenDossier>/);
  assert.match(signalArchiveSource, /dossierToArchive/);
  assert.match(signalArchiveSource, /dossierState/);
  assert.match(signalArchiveSource, /dossier\?\.data/);
  assert.match(signalArchiveSource, /系统不会用模拟证据、模拟关键位或模拟交易计划补位/);
  assert.match(signalArchiveSource, /后端结构化研究输出/);
  assert.doesNotMatch(signalArchiveSource, /value="活跃"/);
  assert.doesNotMatch(signalArchiveSource, /getTokenArchive/);
  assert.doesNotMatch(signalArchiveSource, /系统模拟推演/);
});

test("stage 8 token detail chart and flow panels do not present generated mock data as real", () => {
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const klinePanelSource = readFileSync(resolve(process.cwd(), "src/components/kline-panel.tsx"), "utf8");
  const serverReaderSource = readFileSync(resolve(process.cwd(), "src/lib/frontend-contract-server.ts"), "utf8");

  assert.match(klinePanelSource, /candles\?:\s*ChartCandle\[\]/);
  assert.doesNotMatch(klinePanelSource, /allowMockFallback/);
  assert.doesNotMatch(klinePanelSource, /getCandles/);
  assert.doesNotMatch(klinePanelSource, /@\/lib\/mock-data/);
  assert.match(klinePanelSource, /等待真实 K 线数据/);
  assert.match(klinePanelSource, /candles\?\.length/);
  assert.match(klinePanelSource, /buildTradingViewWidgetEmbedUrl/);
  assert.match(klinePanelSource, /TradingView 主图/);
  assert.match(klinePanelSource, /initialTradingView/);

  assert.match(serverReaderSource, /getKlineContractForPage/);
  assert.match(serverReaderSource, /buildFrontendKlineContract/);
  assert.match(tokenPageSource, /getKlineContractForPage/);
  assert.match(tokenPageSource, /candles=\{kline\.data\}/);
  assert.match(tokenPageSource, /initialTradingView=\{kline\.tradingView\}/);
  assert.doesNotMatch(tokenPageSource, /allowMockFallback/);
  assert.match(tokenPageSource, /等待真实资金流数据/);
  assert.doesNotMatch(tokenPageSource, /Array\.from\(\{ length: 28 \}\)/);
  assert.doesNotMatch(tokenPageSource, /\(\(seed \* \(i \+ 3\)\) % 100\)/);
});

test("token avatars prefer real icon lookup without a fixed small whitelist", () => {
  const tokenAvatarSource = readFileSync(resolve(process.cwd(), "src/components/token-avatar.tsx"), "utf8");

  assert.match(tokenAvatarSource, /logoLookupSymbol/);
  assert.match(tokenAvatarSource, /assets\.coincap\.io\/assets\/icons/);
  assert.match(tokenAvatarSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.doesNotMatch(tokenAvatarSource, /const REAL_LOGOS = new Set/);
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
  assert.doesNotMatch(scanProofSource, /getScanState|getExchangeCoverage/);

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

test("radar contract observability no longer uses planned request or zero latency placeholders", () => {
  const frontendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/frontend-contract.ts"), "utf8");
  const backendContractSource = readFileSync(resolve(process.cwd(), "src/lib/api/backend-contract.ts"), "utf8");
  const systemHealthSource = readFileSync(resolve(process.cwd(), "src/lib/api/system-health.ts"), "utf8");
  const fieldMap = readFileSync(resolve(process.cwd(), "docs/frontend-backend-field-map.md"), "utf8");

  assert.match(systemHealthSource, /readConfiguredApiObservabilityReport/);
  assert.match(backendContractSource, /apiUsage:\s*health\.apiUsage/);
  assert.match(backendContractSource, /sourceLatency:\s*health\.dataSourceLatency/);
  assert.match(frontendContractSource, /backend\.runtime\.apiUsage/);
  assert.match(frontendContractSource, /latencyStatus/);
  assert.doesNotMatch(frontendContractSource, /latencyMs:\s*0,/);
  assert.doesNotMatch(frontendContractSource, /plannedRequests[\s\S]{0,180}usedToday/);
  assert.doesNotMatch(frontendContractSource, /真实日内计数后续接入/);

  assert.match(fieldMap, /CoinGlass Redis daily usage counter/);
  assert.match(fieldMap, /source latency probes/);
});

test("stage 8 review and system pages do not render legacy mock centers", () => {
  const reviewPageSource = readFileSync(resolve(process.cwd(), "src/app/review/page.tsx"), "utf8");
  const systemPageSource = readFileSync(resolve(process.cwd(), "src/app/system/page.tsx"), "utf8");

  assert.equal(existsSync(resolve(process.cwd(), "src/components/review-center.tsx")), false);
  assert.equal(existsSync(resolve(process.cwd(), "src/components/system-center.tsx")), false);
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

test("active frontend files do not import mock-data as a market fact source", () => {
  const activeRoots = ["src/app", "src/components", "src/lib"];
  const allowed = new Set([
    "src/lib/mock-data.ts",
    "src/lib/market/providers/mock-market-provider.ts",
    "src/lib/market/providers/mock-market-provider.test.ts",
  ]);
  const offenders: string[] = [];

  for (const root of activeRoots) {
    for (const filePath of listRepositoryFiles(root)) {
      if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
      if (allowed.has(filePath) || filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) continue;

      const source = readFileSync(resolve(process.cwd(), filePath), "utf8");
      if (/from ['"](?:@\/lib\/mock-data|\.\/mock-data|\.\.\/mock-data)['"]/.test(source)) {
        offenders.push(filePath);
      }
    }
  }

  assert.deepEqual(offenders, [], `active frontend files must not import mock-data: ${offenders.join(", ")}`);
});

test("leaderboard price display does not present missing prices as zero", () => {
  const leaderboardSource = readFileSync(resolve(process.cwd(), "src/components/leaderboard/market-leaderboards.tsx"), "utf8");

  assert.match(leaderboardSource, /formatPrice/);
  assert.match(leaderboardSource, /等待价格/);
  assert.match(leaderboardSource, /hasKnownPositiveValue/);
  assert.doesNotMatch(leaderboardSource, /\$\{row\.price\.toLocaleString\(\)\}/);
});

test("live feed subscribes to backend SSE events before falling back to SSR cards", () => {
  const liveFeedSource = readFileSync(resolve(process.cwd(), "src/components/live-feed.tsx"), "utf8");

  assert.match(liveFeedSource, /useSignalFeed/);
  assert.match(liveFeedSource, /eventToAlert/);
  assert.match(liveFeedSource, /eventItems\.length > 0 \? eventItems : cardItems/);
  assert.match(liveFeedSource, /SNAPSHOT/);
  assert.match(liveFeedSource, /feedMode === 'live'/);
  assert.doesNotMatch(liveFeedSource, /<span className="font-semibold">实时预警<\/span>/u);
});

test("market overview does not label derived altcoin temperature as real fear greed data", () => {
  const marketClientSource = readFileSync(resolve(process.cwd(), "src/app/market/market-page-client.tsx"), "utf8");

  assert.match(marketClientSource, /山寨温度/);
  assert.match(marketClientSource, /由宏观合同推导/);
  assert.doesNotMatch(marketClientSource, /label="贪婪指数"/);
});

test("visual preview panels do not overstate backend realtime capability", () => {
  const homePageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const heatmapSource = readFileSync(resolve(process.cwd(), "src/components/market-heatmap.tsx"), "utf8");
  const introRadarSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-radar.tsx"), "utf8");

  assert.match(homePageSource, /按成熟度展示候选、证据信号与风险提示/u);
  assert.match(heatmapSource, /行情快照/u);
  assert.match(introRadarSource, /雷达流程演示/u);
  assert.doesNotMatch(homePageSource, /风险提示实时推送/u);
  assert.doesNotMatch(heatmapSource, />\s*实时\s*</u);
  assert.doesNotMatch(introRadarSource, /实时捕获 · LIVE/u);
});

test("market page participation advice comes from backend contract status instead of a hardcoded action phrase", () => {
  const marketClientSource = readFileSync(resolve(process.cwd(), "src/app/market/market-page-client.tsx"), "utf8");

  assert.match(marketClientSource, /marketAdviceFromContracts/);
  assert.match(marketClientSource, /radar\.macroAltEnv\.status/);
  assert.match(marketClientSource, /radar\.derivatives\.status/);
  assert.match(marketClientSource, /radar\.scanProof\.status/);
  assert.match(marketClientSource, /数据异常 · 只观察/u);
  assert.match(marketClientSource, /数据降级 · 等待确认/u);
  assert.doesNotMatch(marketClientSource, /适度参与/u);
});

test("market page does not use fake-live number hooks for backend snapshot metrics", () => {
  const marketClientSource = readFileSync(resolve(process.cwd(), "src/app/market/market-page-client.tsx"), "utf8");

  assert.doesNotMatch(marketClientSource, /useLiveNumber/);
  assert.doesNotMatch(marketClientSource, /LiveStat/);
  assert.doesNotMatch(marketClientSource, /volatility=/);
  assert.doesNotMatch(marketClientSource, /Math\.random/);
});

test("signals page status chip reflects signal resource status instead of hardcoded live", () => {
  const signalsPageSource = readFileSync(resolve(process.cwd(), "src/app/signals/page.tsx"), "utf8");

  assert.match(signalsPageSource, /SIGNAL_STATUS_LABEL/);
  assert.match(signalsPageSource, /SIGNAL_STATUS_CLASS/);
  assert.match(signalsPageSource, /const signalStatus = displaySignals\.status/);
  assert.match(signalsPageSource, /SIGNAL_STATUS_LABEL\[signalStatus\]/);
  assert.doesNotMatch(signalsPageSource, /bg-neon-soft[^\\n]+LIVE/u);
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

test("single-server deployment scripts expose current runtime contracts and recovery commands", () => {
  const composeSource = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");
  const bootstrapSource = readFileSync(resolve(process.cwd(), "deploy/scripts/bootstrap-prod-env.sh"), "utf8");
  const verifyPath = "deploy/scripts/production-full-verify.sh";
  const gitSyncPath = "deploy/scripts/verify-git-sync.sh";
  const restorePath = "deploy/scripts/restore-postgres.sh";
  const verifySource = readFileSync(resolve(process.cwd(), verifyPath), "utf8");
  const gitSyncSource = readFileSync(resolve(process.cwd(), gitSyncPath), "utf8");
  const restoreSource = readFileSync(resolve(process.cwd(), restorePath), "utf8");
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  for (const token of [
    "FRONTEND_LIVE_EVENTS_RATE_LIMIT",
    "FRONTEND_UI_STATE_RATE_LIMIT",
    "FRONTEND_UI_STATE_MAX_BYTES",
    "AUTH_SESSION_RATE_LIMIT",
    "CHUAN_PRIVATE_MODE_ENABLED",
    "CHUAN_SESSION_SECRET",
    "WORKER_HEARTBEAT_TTL_SECONDS",
    "WORKER_HEARTBEAT_STALE_SECONDS",
  ]) {
    assert.match(composeSource, new RegExp(token), `docker-compose.yml missing ${token}`);
    assert.match(bootstrapSource, new RegExp(token), `bootstrap-prod-env.sh missing ${token}`);
  }

  assert.equal(existsSync(resolve(process.cwd(), verifyPath)), true, `${verifyPath} must exist`);
  assert.equal(existsSync(resolve(process.cwd(), gitSyncPath)), true, `${gitSyncPath} must exist`);
  assert.equal(existsSync(resolve(process.cwd(), restorePath)), true, `${restorePath} must exist`);
  assert.match(packageJson.scripts?.["production:git-sync"] ?? "", /verify-git-sync\.sh/);
  assert.match(verifySource, /verify-git-sync\.sh/);
  assert.match(gitSyncSource, /git ls-remote/);
  assert.match(gitSyncSource, /ALLOW_UNTRACKED/);
  assert.match(gitSyncSource, /\.env\.production/);
  assert.match(verifySource, /scanStability/);
  assert.match(verifySource, /reviewStatistics/);
  assert.match(verifySource, /\/api\/frontend\/live-events/);
  assert.match(verifySource, /backup-postgres\.sh/);
  assert.match(restoreSource, /CONFIRM_RESTORE=yes/);
  assert.match(restoreSource, /pg_restore/);
  assert.doesNotMatch(verifySource, /COINGLASS_API_KEY=.*echo|AI_API_KEY=.*echo/);
  assert.doesNotMatch(restoreSource, /POSTGRES_PASSWORD=.*echo/);
});

test("active frontend carrier components cannot fall back to radar-contract mock getters", () => {
  const activeCarrierFiles: Record<string, RegExp[]> = {
    "src/components/dashboard/radar-control.tsx": [
      /getScanProof/,
      /getDeepScanQueue/,
      /getCapabilityStages/,
      /getDataSources/,
    ],
    "src/components/signals/signal-maturity-pool.tsx": [/getRadarSignals/],
    "src/components/leaderboard/market-leaderboards.tsx": [/getLeaderboard\(/, /getLeaderboard,/],
    "src/components/market/macro-derivatives.tsx": [/getMacroAltEnv/, /getDerivatives/, /getApiUsage/],
  };

  for (const [filePath, bannedPatterns] of Object.entries(activeCarrierFiles)) {
    const source = readFileSync(resolve(process.cwd(), filePath), "utf8");

    for (const pattern of bannedPatterns) {
      assert.doesNotMatch(source, pattern, `${filePath} must not use active mock fallback ${pattern}`);
    }
  }
});

test("frontend subscribes to the read-only live event stream after auth", () => {
  const bridgePath = "src/components/frontend-live-event-bridge.tsx";
  const authGateSource = readFileSync(resolve(process.cwd(), "src/components/auth/auth-gate.tsx"), "utf8");

  assert.equal(existsSync(resolve(process.cwd(), bridgePath)), true, `${bridgePath} must exist`);

  const bridgeSource = readFileSync(resolve(process.cwd(), bridgePath), "utf8");

  assert.match(authGateSource, /FrontendLiveEventBridge/);
  assert.match(bridgeSource, /new EventSource\('\/api\/frontend\/live-events\/stream\?/);
  assert.match(bridgeSource, /publishSignalEvent/);
  assert.match(bridgeSource, /upsertLiveQuotes/);
  assert.doesNotMatch(bridgeSource, /refreshMarketRadarSnapshot|\/api\/scan|COINGLASS_API_KEY/);
});

test("production smoke keeps token chart and external intelligence truth checks", () => {
  const smokeSource = readFileSync(resolve(process.cwd(), "deploy/scripts/prod-smoke.sh"), "utf8");

  assert.match(smokeSource, /\/api\/frontend\/token-dossier\?symbol=/);
  assert.match(smokeSource, /canUseMockCandles/);
  assert.match(smokeSource, /must be false/);
  assert.match(smokeSource, /TV_SYMBOL_RE/);
  assert.match(smokeSource, /\/api\/frontend\/external-intel/);
  assert.match(smokeSource, /sourcePlan/);
  assert.match(smokeSource, /不绕过/);
  assert.match(smokeSource, /legal crawl guardrail/);
});

test("token avatar uses real logo lookup before generated fallback and no static placeholder logo", () => {
  const avatarSource = readFileSync(resolve(process.cwd(), "src/components/token-avatar.tsx"), "utf8");

  assert.match(avatarSource, /assets\.coincap\.io\/assets\/icons/);
  assert.match(avatarSource, /GeneratedAvatar/);
  assert.match(avatarSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.doesNotMatch(avatarSource, /placeholder\.svg/);
});

test("review page restores rank visibility without rendering the legacy mock review center", () => {
  const reviewPageSource = readFileSync(resolve(process.cwd(), "src/app/review/page.tsx"), "utf8");
  const reviewEvolutionSource = readFileSync(resolve(process.cwd(), "src/components/review/review-evolution.tsx"), "utf8");

  assert.match(reviewPageSource, /RankBanner/);
  assert.match(reviewPageSource, /<RankBanner/);
  assert.doesNotMatch(reviewPageSource, /ReviewCenter/);
  assert.match(reviewEvolutionSource, /复盘样本门禁/);
  assert.match(reviewEvolutionSource, /AI 反证复核状态/);
  assert.match(reviewEvolutionSource, /样本不足/);
  assert.match(reviewEvolutionSource, /不能替代规则引擎/);
});

test("signal table does not fabricate lifecycle prices or frontend trade plans", () => {
  const anomalyBoardSource = readFileSync(resolve(process.cwd(), "src/components/anomaly-board.tsx"), "utf8");
  const sniperBoardSource = readFileSync(resolve(process.cwd(), "src/components/sniper-board.tsx"), "utf8");
  const homePageSource = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  const dashboardPageSource = readFileSync(resolve(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
  const tokenPageSource = readFileSync(resolve(process.cwd(), "src/app/token/[id]/page.tsx"), "utf8");
  const signalsPageSource = readFileSync(resolve(process.cwd(), "src/app/signals/page.tsx"), "utf8");
  const introSectionsSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-sections.tsx"), "utf8");
  const introRadarSource = readFileSync(resolve(process.cwd(), "src/components/intro/intro-radar.tsx"), "utf8");

  assert.doesNotMatch(anomalyBoardSource, /function entryPlan|const plan = entryPlan/);
  assert.doesNotMatch(anomalyBoardSource, /建议入场|目标位|仓位管理|链上换手|AI 分析逻辑|推送后涨幅|推送后跌幅/);
  assert.match(anomalyBoardSource, /后端未给出完整交易计划/);
  assert.match(anomalyBoardSource, /单币档案/);
  assert.match(anomalyBoardSource, /追踪/);

  assert.doesNotMatch(sniperBoardSource, /建仓区间|止损|目标位|entryLow|entryHigh|target1|target2|card\.stop|card\.target/);
  assert.match(sniperBoardSource, /后端完整计划/);
  assert.match(sniperBoardSource, /追踪/);

  assert.doesNotMatch(homePageSource, /扫描覆盖率/);
  assert.doesNotMatch(dashboardPageSource, /本轮深扫占比/);
  assert.doesNotMatch(homePageSource, /实力交易者/);
  assert.doesNotMatch(signalsPageSource, /入场策略/);
  assert.doesNotMatch(introSectionsSource, /建议入场区间|杠杆建议|主力净流入\/流出|链上数据|精准出手|资金净流向|入场窗口与目标价/);
  assert.doesNotMatch(introRadarSource, /资金净流入/);
  assert.doesNotMatch(tokenPageSource, /主力资金|净流入/);
  assert.match(homePageSource, /轻扫覆盖率/);
  assert.match(dashboardPageSource, /轻扫覆盖率/);
});

test("legacy radar contract getters are disabled instead of returning static market facts", () => {
  const radarContractSource = readFileSync(resolve(process.cwd(), "src/lib/radar-contract.ts"), "utf8");
  const siteLoaderSource = readFileSync(resolve(process.cwd(), "src/components/site-loader.tsx"), "utf8");
  const anomalyBoardSource = readFileSync(resolve(process.cwd(), "src/components/anomaly-board.tsx"), "utf8");
  const sniperBoardSource = readFileSync(resolve(process.cwd(), "src/components/sniper-board.tsx"), "utf8");
  const scanProofSource = readFileSync(resolve(process.cwd(), "src/components/scan-proof.tsx"), "utf8");

  assert.match(radarContractSource, /旧同步 getter 已停用/);
  assert.match(radarContractSource, /legacyEmptyResource/);
  assert.doesNotMatch(radarContractSource, /后端契约 mock 数据层/);
  assert.doesNotMatch(radarContractSource, /const RADAR_SIGNALS|function mkRows/);
  assert.doesNotMatch(radarContractSource, /QPS 1\.2k|主从同步|社媒情绪源|数据均为模拟演示/);

  assert.match(siteLoaderSource, /SERVER FACT/);
  assert.doesNotMatch(siteLoaderSource, /87\.6%|5\/6 LINKED|v4\.2 LOADED/);

  assert.match(scanProofSource, /轻扫覆盖/);
  assert.doesNotMatch(scanProofSource, />覆盖率</);

  assert.match(anomalyBoardSource, /待后端追踪/);
  assert.doesNotMatch(anomalyBoardSource, /入选后上涨|入选后回撤/);
  assert.match(sniperBoardSource, /hasTrackedPushPrice/);
  assert.match(sniperBoardSource, /待追踪/);
});
