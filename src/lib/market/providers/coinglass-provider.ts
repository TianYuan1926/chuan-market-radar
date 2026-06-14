import {
  analyzeMarketAnomalies,
  type MarketAnchorContext,
  type MarketAnomalyInput,
} from "../../analysis/anomaly-engine";
import { buildTechnicalEvidence } from "../../analysis/technical-indicators";
import type { EvidencePoint } from "../../analysis/types";
import { buildContractInstrumentPool } from "../instrument-pool";
import type { OhlcvProvider, OhlcvProviderFailure } from "../ohlcv/types";
import { buildScanQuotaPlan } from "../scan-quota";
import {
  buildCoverageReport,
  buildUniverseRegistry,
  planUniverseScan,
  type UniversePriorityHint,
} from "../universe-registry";
import type {
  MarketDataProvider,
  MarketRadarSnapshot,
  ScanMetadata,
} from "../types";
import type { UniverseDiscoveryProvider } from "./binance-universe-discovery";
import { requestCoinGlass } from "./coinglass-client";
import {
  type CoinGlassMarketRow,
  type CoinGlassMarketRowRejectionReason,
  classifyCoinGlassMarketRow,
  marketSymbolFromCoinGlass,
  mapCoinGlassDerivativeSnapshot,
  mapCoinGlassHeatCell,
  mapCoinGlassMarketInstrument,
  mapCoinGlassTicker,
} from "./coinglass-mapper";

export type CoinGlassProviderOptions = {
  apiKey: string;
  baseAssets?: string[];
  batchSize?: number;
  coinGlassDailyRequestBudget?: number;
  fetcher?: typeof fetch;
  ohlcvProvider?: OhlcvProvider;
  universePriorityHintNotes?: string[];
  universePriorityHints?: UniversePriorityHint[];
  universeDiscoveryProvider?: UniverseDiscoveryProvider;
  now?: () => Date;
};

function anomalyInputFromMarketRow(
  row: CoinGlassMarketRow,
  updatedAt: string,
  marketContext: MarketAnchorContext,
  ohlcvFailure?: OhlcvProviderFailure,
  indicatorEvidence?: EvidencePoint[],
): MarketAnomalyInput {
  const ticker = mapCoinGlassTicker(row, updatedAt);
  const derivative = mapCoinGlassDerivativeSnapshot(row, updatedAt);
  const volumeChange = row.volume_usd_change_percent_24h ?? row.volumeUsdChangePercent24h ?? 0;
  const directionBias = ticker.changePercent24h < -1 ? "short" : ticker.changePercent24h > 1 ? "long" : "neutral";

  return {
    id: `coinglass-${ticker.exchange}-${ticker.symbol}`,
    symbol: ticker.symbol,
    exchange: ticker.exchange,
    timeframe: "15m",
    regime: marketContext.regime,
    directionBias,
    dataQualityScore: 0.82,
    priceChangePercent: ticker.changePercent24h,
    volumeRatio: Math.max(0.1, 1 + volumeChange / 100),
    openInterestChangePercent: derivative.openInterestChangePercent,
    fundingRateZScore: derivative.fundingRateZScore,
    volatilityCompressionPercentile: 50,
    liquidationUsd24h: derivative.liquidationUsd24h ?? 0,
    structureLocation: "middle",
    distanceToInvalidationPercent: 2,
    projectedMovePercent: Math.max(3, Math.abs(ticker.changePercent24h) * 1.8),
    triggerHint: "等待价格靠近关键结构边界后再确认",
    invalidationHint: "OI 和价格方向背离，或价格回到区间中部",
    targetHints: ["前一流动性区", "大周期供需边界"],
    updatedAt,
    marketContext,
    dataWarnings: ohlcvFailure
      ? [{
        label: "OHLCV 数据缺失",
        value: `公开 K 线源 ${ohlcvFailure.source} 暂不可用：${ohlcvFailure.reason}。本轮保留 CoinGlass 衍生品扫描，但多周期结构证据需要等待补齐。`,
        layer: "data_quality",
        polarity: "neutral",
      }]
      : undefined,
    indicatorEvidence,
  };
}

const exchangePriority = {
  BINANCE: 4,
  OKX: 3,
  BYBIT: 2,
  COINBASE: 1,
  UNKNOWN: 0,
} as const;

type MarketRowQualityReport = {
  cleanRows: CoinGlassMarketRow[];
  duplicateSymbolCount: number;
  rejections: Record<CoinGlassMarketRowRejectionReason, number>;
};

function marketRowVolume(row: CoinGlassMarketRow) {
  return row.volume_usd ?? row.volumeUsd ?? 0;
}

function marketRowOpenInterest(row: CoinGlassMarketRow) {
  return row.open_interest_usd ?? row.openInterestUsd ?? 0;
}

function emptyQualityRejections(): Record<CoinGlassMarketRowRejectionReason, number> {
  return {
    quote_not_supported: 0,
    unsupported_exchange: 0,
  };
}

function qualityFilterMarketRows(rows: CoinGlassMarketRow[]): MarketRowQualityReport {
  const rejections = emptyQualityRejections();
  const cleanRows: CoinGlassMarketRow[] = [];

  for (const row of rows) {
    const quality = classifyCoinGlassMarketRow(row);

    if (!quality.ok) {
      rejections[quality.reason] += 1;
      continue;
    }

    cleanRows.push(row);
  }

  return {
    cleanRows,
    duplicateSymbolCount: Math.max(0, cleanRows.length - new Set(cleanRows.map(marketSymbolFromCoinGlass)).size),
    rejections,
  };
}

function primaryRowScore(row: CoinGlassMarketRow, updatedAt: string) {
  const ticker = mapCoinGlassTicker(row, updatedAt);

  return exchangePriority[ticker.exchange] * 1_000_000_000_000 +
    marketRowVolume(row) +
    marketRowOpenInterest(row) * 0.1;
}

function selectPrimarySignalRows(rows: CoinGlassMarketRow[], updatedAt: string) {
  const bySymbol = new Map<string, CoinGlassMarketRow>();

  for (const row of rows) {
    const symbol = marketSymbolFromCoinGlass(row);
    const current = bySymbol.get(symbol);

    if (!current || primaryRowScore(row, updatedAt) > primaryRowScore(current, updatedAt)) {
      bySymbol.set(symbol, row);
    }
  }

  return [...bySymbol.values()];
}

function compactAssetList(label: string, assets: string[], previewLimit = 12) {
  const preview = assets.slice(0, previewLimit).join(",");
  const suffix = assets.length > previewLimit
    ? ` +${assets.length - previewLimit} more`
    : "";

  return `${label}: ${preview}${suffix}`;
}

function regimeFromAnchorChange(changePercent: number) {
  if (changePercent <= -1.2) {
    return "risk_off";
  }

  if (changePercent >= 1.2) {
    return "risk_on";
  }

  if (Math.abs(changePercent) <= 0.6) {
    return "range";
  }

  return "mixed";
}

function deriveMarketAnchorContext(rows: CoinGlassMarketRow[], updatedAt: string): MarketAnchorContext {
  const tickers = rows.map((row) => mapCoinGlassTicker(row, updatedAt));
  const btc = tickers.find((ticker) => ticker.symbol === "BTCUSDT");
  const eth = tickers.find((ticker) => ticker.symbol === "ETHUSDT");
  const anchorChanges = [btc?.changePercent24h, eth?.changePercent24h]
    .filter((value): value is number => typeof value === "number");

  if (anchorChanges.length === 0) {
    return {
      anchor: "unknown",
      note: "BTC/ETH anchors not present in this low-rate batch",
      regime: "unknown",
    };
  }

  const averageChange = anchorChanges.reduce((total, value) => total + value, 0) / anchorChanges.length;
  const anchor = btc && eth ? "btc_eth" : btc ? "btc" : "eth";
  const regime = regimeFromAnchorChange(averageChange);

  return {
    anchor,
    btcChangePercent: btc?.changePercent24h,
    ethChangePercent: eth?.changePercent24h,
    note: `anchor average ${averageChange.toFixed(2)}%`,
    regime,
  };
}

async function fetchPairsMarkets({
  apiKey,
  baseAssets,
  fetcher,
}: {
  apiKey: string;
  baseAssets: string[];
  fetcher?: typeof fetch;
}) {
  const rows: CoinGlassMarketRow[] = [];

  for (const symbol of baseAssets) {
    const data = await requestCoinGlass<CoinGlassMarketRow[]>({
      apiKey,
      path: "/api/futures/pairs-markets",
      query: { symbol },
      fetcher,
    });

    rows.push(...data);
  }

  return rows;
}

export function createCoinGlassProvider({
  apiKey,
  baseAssets = ["BTC", "ETH", "SOL"],
  batchSize = 3,
  coinGlassDailyRequestBudget,
  fetcher,
  ohlcvProvider,
  universePriorityHintNotes,
  universePriorityHints,
  universeDiscoveryProvider,
  now = () => new Date(),
}: CoinGlassProviderOptions): MarketDataProvider {
  return {
    id: "coinglass",
    label: "CoinGlass Futures Provider",

    async fetchSnapshot(): Promise<MarketRadarSnapshot> {
      const scanTime = now();
      const generatedAt = scanTime.toISOString();
      const universeDiscovery = universeDiscoveryProvider
        ? await universeDiscoveryProvider.discoverInstruments()
        : null;
      const discoveredInstruments = universeDiscovery?.ok
        ? universeDiscovery.instruments
        : [];
      const initialRegistry = buildUniverseRegistry(baseAssets, discoveredInstruments);
      const cadenceMinutes = 15;
      const minimumBatchSize = initialRegistry.summary.anchors +
        (initialRegistry.assets.length > initialRegistry.summary.anchors ? 1 : 0);
      const quota = buildScanQuotaPlan({
        cadenceMinutes,
        coinGlassDailyRequestBudget,
        minimumRequestsPerScan: minimumBatchSize,
        publicDiscoveryRequestsPerScan: universeDiscovery?.requestCount ?? 0,
        requestedBatchSize: batchSize,
      });
      const batchPlan = planUniverseScan(
        initialRegistry,
        quota.effectiveBatchSize,
        scanTime,
        { priorityHints: universePriorityHints },
      );
      const marketRows = await fetchPairsMarkets({
        apiKey,
        baseAssets: batchPlan.assets,
        fetcher,
      });
      const qualityReport = qualityFilterMarketRows(marketRows);
      const cleanMarketRows = qualityReport.cleanRows;
      const primarySignalRows = selectPrimarySignalRows(cleanMarketRows, generatedAt);
      const instruments = cleanMarketRows
        .map((row) => mapCoinGlassMarketInstrument(row, generatedAt))
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const instrumentPool = buildContractInstrumentPool(instruments, {
        minVolume24hUsd: 5_000_000,
      });
      const universeRegistry = buildUniverseRegistry(baseAssets, [
        ...discoveredInstruments,
        ...instruments,
      ]);
      const coverage = buildCoverageReport(universeRegistry, batchPlan);
      const tickers = primarySignalRows.map((row) => mapCoinGlassTicker(row, generatedAt));
      const derivatives = primarySignalRows.map((row) => mapCoinGlassDerivativeSnapshot(row, generatedAt));
      const marketContext = deriveMarketAnchorContext(primarySignalRows, generatedAt);
      const ohlcvFailures = new Map<string, OhlcvProviderFailure>();
      const indicatorEvidenceBySymbol = new Map<string, EvidencePoint[]>();

      if (ohlcvProvider) {
        await Promise.all(primarySignalRows.slice(0, 50).map(async (row) => {
          const ticker = mapCoinGlassTicker(row, generatedAt);
          const result = await ohlcvProvider.fetchCandles({
            symbol: ticker.symbol,
            interval: "15m",
            limit: 120,
          });

          if (!result.ok) {
            ohlcvFailures.set(ticker.symbol, result);
          } else {
            indicatorEvidenceBySymbol.set(
              ticker.symbol,
              buildTechnicalEvidence({ "15m": result.candles }),
            );
          }
        }));
      }

      const signals = analyzeMarketAnomalies(
        primarySignalRows.slice(0, 50).map((row) => {
          const ticker = mapCoinGlassTicker(row, generatedAt);

          return anomalyInputFromMarketRow(
            row,
            generatedAt,
            marketContext,
            ohlcvFailures.get(ticker.symbol),
            indicatorEvidenceBySymbol.get(ticker.symbol),
          );
        }),
      );
      const heatmap = primarySignalRows
        .slice(0, 24)
        .map((row) => mapCoinGlassHeatCell(row));
      const metadata: ScanMetadata = {
        id: `coinglass-${generatedAt}`,
        mode: "scheduled",
        status: "ready",
        source: "coinglass",
        isRealtime: true,
        cadenceMinutes: 15,
        scannedCount: instrumentPool.summary.accepted,
        anomalyCount: signals.length,
        candidateCount: signals.length,
        riskGate: "on",
        generatedAt,
        nextScanAt: generatedAt,
        quota,
        staleAfterMinutes: 30,
        coverage,
        notes: [
          "CoinGlass provider enabled",
          "futures pairs-markets boundary active",
          universeDiscovery
            ? universeDiscovery.ok
              ? `universe discovery: ${universeDiscovery.source} ok ${universeDiscovery.instruments.length} instruments`
              : `universe discovery: ${universeDiscovery.source} ${universeDiscovery.reason}`
            : "universe discovery: disabled",
          ...(universeDiscovery?.notes ?? []).map((note) => `universe source: ${note}`),
          ...(universePriorityHintNotes ?? []),
          `quality filter: raw ${marketRows.length}, clean ${cleanMarketRows.length}, primary ${primarySignalRows.length}`,
          `quality rejections: unsupported_exchange ${qualityReport.rejections.unsupported_exchange}, quote_not_supported ${qualityReport.rejections.quote_not_supported}, duplicate_symbol ${qualityReport.duplicateSymbolCount}`,
          `tiered universe: anchor ${batchPlan.tierCounts.anchor}, core ${batchPlan.tierCounts.core}, active ${batchPlan.tierCounts.active}, long_tail ${batchPlan.tierCounts.long_tail}`,
          coverage.exchangeCoverageSummary
            ? `exchange coverage: major_three ${coverage.exchangeCoverageSummary.majorThree}, multi_exchange ${coverage.exchangeCoverageSummary.multiExchange}, single_exchange ${coverage.exchangeCoverageSummary.singleExchange}, unlisted ${coverage.exchangeCoverageSummary.unlisted}`
            : "exchange coverage: unavailable",
          quota.wasCapped
            ? `quota guard: requested batch ${quota.requestedBatchSize} capped to ${quota.effectiveBatchSize}`
            : `quota guard: requested batch ${quota.requestedBatchSize} kept`,
          quota.coinGlassDailyRequestBudget
            ? `quota: coinglass ${quota.coinGlassRequestsPerDayEstimate}/${quota.coinGlassDailyRequestBudget} daily (${quota.coinGlassBudgetUsagePercent}%), public discovery ${quota.publicDiscoveryRequestsPerDayEstimate} daily, status ${quota.status}`
            : `quota: coinglass ${quota.coinGlassRequestsPerDayEstimate}/unconfigured daily, public discovery ${quota.publicDiscoveryRequestsPerDayEstimate} daily, status ${quota.status}`,
          `tier policy: active every ${batchPlan.tierPolicy.activeEveryWindows} windows, long_tail every ${batchPlan.tierPolicy.longTailEveryWindows} windows`,
          batchPlan.dynamicPriority.enabled
            ? `dynamic priority: selected ${batchPlan.dynamicPriority.boostedAssets.join(",") || "none"}, top ${batchPlan.dynamicPriority.topAssets.slice(0, 3).map((item) => `${item.baseAsset} ${Math.round(item.score)} ${item.reasons.join("/")}`).join("; ")}`
            : "dynamic priority: no external hints",
          compactAssetList("base assets", batchPlan.allAssets),
          `batch ${batchPlan.batchIndex + 1}/${batchPlan.totalBatches}: ${batchPlan.assets.join(",")}`,
          `requests ${batchPlan.requestsPlanned}/${coverage.eligible}, next batch ${batchPlan.nextBatchIndex + 1}`,
          `coverage ${coverage.scanned}/${coverage.eligible} (${coverage.coveragePercent}%), pending ${coverage.pending}, skipped ${coverage.skipped}`,
          `market context: ${marketContext.anchor} ${marketContext.regime}`,
          ...[...ohlcvFailures.entries()].map(([symbol, failure]) =>
            `ohlcv unavailable: ${symbol} 15m ${failure.reason}`
          ),
        ],
      };

      return {
        metadata,
        instrumentPool,
        instruments,
        tickers,
        derivatives,
        heatmap,
        signals,
        journalEvents: [],
      };
    },
  };
}
