import {
  analyzeMarketAnomalies,
  type MarketAnchorContext,
  type MarketAnomalyInput,
} from "../../analysis/anomaly-engine";
import {
  buildSignalTrendRadarV3Dossier,
} from "../../analysis/v3/current-signal-dossier";
import { buildTechnicalEvidence } from "../../analysis/technical-indicators";
import {
  buildTimeframeProfile,
  type TimeframeProfile,
  type TimeframeProfileFrame,
} from "../../analysis/timeframe-profile";
import type { EvidencePoint, SignalDirection } from "../../analysis/types";
import { buildContractInstrumentPool } from "../instrument-pool";
import type {
  Candle,
  OhlcvInterval,
  OhlcvProvider,
  OhlcvProviderFailure,
} from "../ohlcv/types";
import { buildScanQuotaPlan } from "../scan-quota";
import { buildScanStatePoolReport } from "../scan-state-pool";
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
  ohlcvFailures?: OhlcvProviderFailure[],
  indicatorEvidence?: EvidencePoint[],
  timeframeProfile?: TimeframeProfile,
): MarketAnomalyInput {
  const ticker = mapCoinGlassTicker(row, updatedAt);
  const derivative = mapCoinGlassDerivativeSnapshot(row, updatedAt);
  const volumeChange = row.volume_usd_change_percent_24h ?? row.volumeUsdChangePercent24h ?? 0;
  const directionBias = directionBiasFromChange(ticker.changePercent24h);

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
    timeframeProfile,
    dataWarnings: ohlcvFailures?.length
      ? [{
        label: "OHLCV 数据缺失",
        value: `公开 K 线源有 ${ohlcvFailures.length} 个周期暂不可用：${ohlcvFailures.map((failure) => `${failure.interval}/${failure.reason}`).join(", ")}。本轮保留 CoinGlass 衍生品扫描，但缺失周期需要等待补齐。`,
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

const multiTimeframeIntervals: OhlcvInterval[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
];
const maxOhlcvSymbolsPerScan = 8;

type MarketRowQualityReport = {
  cleanRows: CoinGlassMarketRow[];
  duplicateSymbolCount: number;
  rejections: Record<CoinGlassMarketRowRejectionReason, number>;
  rejectedSamples: Array<{
    exchangeName: string;
    reason: CoinGlassMarketRowRejectionReason;
    symbol: string;
  }>;
};

type PrimarySignalRowSelectionReport = {
  duplicateGroupCount: number;
  primaryRows: CoinGlassMarketRow[];
  samples: Array<{
    discardedExchanges: string[];
    reason: "exchange_priority_then_volume_oi";
    selectedExchange: string;
    symbol: string;
  }>;
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

function coinGlassRowExchangeName(row: CoinGlassMarketRow) {
  return row.exchange_name ?? row.exchangeName ?? "unknown";
}

function qualityFilterMarketRows(rows: CoinGlassMarketRow[]): MarketRowQualityReport {
  const rejections = emptyQualityRejections();
  const cleanRows: CoinGlassMarketRow[] = [];
  const rejectedSamples: MarketRowQualityReport["rejectedSamples"] = [];

  for (const row of rows) {
    const quality = classifyCoinGlassMarketRow(row);

    if (!quality.ok) {
      rejections[quality.reason] += 1;
      rejectedSamples.push({
        exchangeName: coinGlassRowExchangeName(row),
        reason: quality.reason,
        symbol: marketSymbolFromCoinGlass(row) || "UNKNOWN",
      });
      continue;
    }

    cleanRows.push(row);
  }

  return {
    cleanRows,
    duplicateSymbolCount: Math.max(0, cleanRows.length - new Set(cleanRows.map(marketSymbolFromCoinGlass)).size),
    rejections,
    rejectedSamples: rejectedSamples.slice(0, 8),
  };
}

function primaryRowScore(row: CoinGlassMarketRow, updatedAt: string) {
  const ticker = mapCoinGlassTicker(row, updatedAt);

  return exchangePriority[ticker.exchange] * 1_000_000_000_000 +
    marketRowVolume(row) +
    marketRowOpenInterest(row) * 0.1;
}

function selectPrimarySignalRows(rows: CoinGlassMarketRow[], updatedAt: string): PrimarySignalRowSelectionReport {
  const bySymbol = new Map<string, CoinGlassMarketRow>();
  const candidatesBySymbol = new Map<string, CoinGlassMarketRow[]>();

  for (const row of rows) {
    const symbol = marketSymbolFromCoinGlass(row);
    const current = bySymbol.get(symbol);
    const candidates = candidatesBySymbol.get(symbol) ?? [];

    if (!current || primaryRowScore(row, updatedAt) > primaryRowScore(current, updatedAt)) {
      bySymbol.set(symbol, row);
    }

    candidates.push(row);
    candidatesBySymbol.set(symbol, candidates);
  }

  const samples = [...candidatesBySymbol.entries()]
    .filter(([, candidates]) => candidates.length > 1)
    .slice(0, 8)
    .map(([symbol, candidates]) => {
      const selected = bySymbol.get(symbol) ?? candidates[0];
      const selectedExchange = mapCoinGlassTicker(selected, updatedAt).exchange;
      const discardedExchanges = candidates
        .filter((row) => row !== selected)
        .map((row) => mapCoinGlassTicker(row, updatedAt).exchange)
        .filter((exchange, index, exchanges) => exchanges.indexOf(exchange) === index);

      return {
        discardedExchanges,
        reason: "exchange_priority_then_volume_oi" as const,
        selectedExchange,
        symbol,
      };
    });

  return {
    duplicateGroupCount: samples.length,
    primaryRows: [...bySymbol.values()],
    samples,
  };
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

function directionBiasFromChange(changePercent: number): SignalDirection {
  if (changePercent < -1) {
    return "short";
  }

  if (changePercent > 1) {
    return "long";
  }

  return "neutral";
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

function candleChangePercent(candles: Candle[]) {
  const first = candles[0];
  const last = candles.at(-1);

  if (!first || !last || first.close <= 0) {
    return 0;
  }

  return ((last.close - first.close) / first.close) * 100;
}

function timeframeAlignment(
  directionBias: SignalDirection,
  changePercent: number,
): TimeframeProfileFrame["alignment"] {
  if (Math.abs(changePercent) < 0.4 || directionBias === "neutral") {
    return "neutral";
  }

  if (directionBias === "long") {
    return changePercent > 0 ? "support" : "conflict";
  }

  return changePercent < 0 ? "support" : "conflict";
}

function timeframeWeight(changePercent: number, candles: Candle[]) {
  return Math.min(100, Math.max(10, Math.round(Math.abs(changePercent) * 3 + candles.length)));
}

function buildTimeframeFrames(
  candlesByTimeframe: Partial<Record<OhlcvInterval, Candle[]>>,
  directionBias: SignalDirection,
): TimeframeProfileFrame[] {
  const frames: TimeframeProfileFrame[] = [];

  for (const timeframe of multiTimeframeIntervals) {
    const candles = candlesByTimeframe[timeframe] ?? [];

    if (candles.length < 5) {
      continue;
    }

    const changePercent = candleChangePercent(candles);
    const alignment = timeframeAlignment(directionBias, changePercent);

    frames.push({
      timeframe,
      alignment,
      direction: directionBias,
      note: `${timeframe} close change ${changePercent.toFixed(2)}% -> ${alignment}`,
      weight: timeframeWeight(changePercent, candles),
    });
  }

  return frames;
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
      const primarySelectionReport = selectPrimarySignalRows(cleanMarketRows, generatedAt);
      const primarySignalRows = primarySelectionReport.primaryRows;
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
      const baseCoverage = buildCoverageReport(universeRegistry, batchPlan);
      const tickers = primarySignalRows.map((row) => mapCoinGlassTicker(row, generatedAt));
      const derivatives = primarySignalRows.map((row) => mapCoinGlassDerivativeSnapshot(row, generatedAt));
      const marketContext = deriveMarketAnchorContext(primarySignalRows, generatedAt);
      const ohlcvFailuresBySymbol = new Map<string, OhlcvProviderFailure[]>();
      const ohlcvCandlesBySymbol = new Map<string, Partial<Record<OhlcvInterval, Candle[]>>>();
      const indicatorEvidenceBySymbol = new Map<string, EvidencePoint[]>();
      const timeframeProfileBySymbol = new Map<string, TimeframeProfile>();
      const ohlcvSummaryNotes: string[] = [];

      if (ohlcvProvider) {
        await Promise.all(primarySignalRows.slice(0, maxOhlcvSymbolsPerScan).map(async (row) => {
          const ticker = mapCoinGlassTicker(row, generatedAt);
          const candlesByTimeframe: Partial<Record<OhlcvInterval, Candle[]>> = {};
          const failures: OhlcvProviderFailure[] = [];

          for (const interval of multiTimeframeIntervals) {
            const result = await ohlcvProvider.fetchCandles({
              symbol: ticker.symbol,
              interval,
              limit: 120,
            });

            if (!result.ok) {
              failures.push(result);
              continue;
            }

            candlesByTimeframe[interval] = result.candles;
          }

          const successfulIntervals = Object.keys(candlesByTimeframe).length;
          ohlcvSummaryNotes.push(
            `ohlcv multi-timeframe: ${ticker.symbol} ${successfulIntervals}/${multiTimeframeIntervals.length}`,
          );

          if (failures.length) {
            ohlcvFailuresBySymbol.set(ticker.symbol, failures);
          }

          if (successfulIntervals > 0) {
            const directionBias = directionBiasFromChange(ticker.changePercent24h);
            const frames = buildTimeframeFrames(candlesByTimeframe, directionBias);

            ohlcvCandlesBySymbol.set(ticker.symbol, candlesByTimeframe);
            indicatorEvidenceBySymbol.set(ticker.symbol, buildTechnicalEvidence(candlesByTimeframe));

            if (frames.length) {
              timeframeProfileBySymbol.set(ticker.symbol, buildTimeframeProfile(frames));
            }
          }
        }));
      }

      const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
      const signals = analyzeMarketAnomalies(
        primarySignalRows.slice(0, 50).map((row) => {
          const ticker = mapCoinGlassTicker(row, generatedAt);

          return anomalyInputFromMarketRow(
            row,
            generatedAt,
            marketContext,
            ohlcvFailuresBySymbol.get(ticker.symbol),
            indicatorEvidenceBySymbol.get(ticker.symbol),
            timeframeProfileBySymbol.get(ticker.symbol),
          );
        }),
      ).map((signal) => {
        const candlesByTimeframe = ohlcvCandlesBySymbol.get(signal.symbol);

        if (!candlesByTimeframe) {
          return signal;
        }

        const strategyV3 = buildSignalTrendRadarV3Dossier({
          candlesByTimeframe,
          currentPrice: tickerBySymbol.get(signal.symbol)?.price,
          signal,
        });

        return strategyV3
          ? {
            ...signal,
            strategyV3,
          }
          : signal;
      });
      const v3Signals = signals.filter((signal) => signal.strategyV3);
      const heatmap = primarySignalRows
        .slice(0, 24)
        .map((row) => mapCoinGlassHeatCell(row));
      const coverage = {
        ...baseCoverage,
        statePool: buildScanStatePoolReport({
          batchPlan,
          derivatives,
          registry: universeRegistry,
          signals,
          tickers,
        }),
      };
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
          qualityReport.rejectedSamples.length
            ? `quality rejected samples: ${qualityReport.rejectedSamples.map((sample) => `${sample.exchangeName}:${sample.symbol}:${sample.reason}`).join("; ")}`
            : "quality rejected samples: none",
          `quality aggregation summary: duplicate_groups ${primarySelectionReport.duplicateGroupCount}, rule exchange_priority_then_volume_oi`,
          primarySelectionReport.samples.length
            ? `quality aggregation: ${primarySelectionReport.samples.map((sample) => `${sample.symbol} selected ${sample.selectedExchange} over ${sample.discardedExchanges.join("/") || "none"} by ${sample.reason}`).join("; ")}`
            : "quality aggregation: none",
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
          v3Signals.length
            ? `v3 key levels: ${v3Signals.map((signal) => `${signal.symbol} ${signal.strategyV3?.keyLevels.length ?? 0}/${signal.strategyV3?.forwardLevels.length ?? 0}`).join(", ")}`
            : "v3 key levels: unavailable",
          ...ohlcvSummaryNotes,
          ...[...ohlcvFailuresBySymbol.entries()].flatMap(([symbol, failures]) =>
            failures.map((failure) => `ohlcv unavailable: ${symbol} ${failure.interval} ${failure.reason}`)
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
