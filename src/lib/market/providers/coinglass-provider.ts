import {
  analyzeMarketAnomalies,
  type MarketAnchorContext,
  type MarketAnomalyInput,
} from "../../analysis/anomaly-engine";
import { buildTechnicalEvidence } from "../../analysis/technical-indicators";
import type { EvidencePoint } from "../../analysis/types";
import { buildContractInstrumentPool } from "../instrument-pool";
import type { OhlcvProvider, OhlcvProviderFailure } from "../ohlcv/types";
import { buildScanBatchPlan } from "../scan-batch-queue";
import type {
  MarketDataProvider,
  MarketRadarSnapshot,
  ScanMetadata,
} from "../types";
import { requestCoinGlass } from "./coinglass-client";
import {
  type CoinGlassMarketRow,
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
  fetcher?: typeof fetch;
  ohlcvProvider?: OhlcvProvider;
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

function marketRowVolume(row: CoinGlassMarketRow) {
  return row.volume_usd ?? row.volumeUsd ?? 0;
}

function marketRowOpenInterest(row: CoinGlassMarketRow) {
  return row.open_interest_usd ?? row.openInterestUsd ?? 0;
}

function isSupportedSignalRow(row: CoinGlassMarketRow, updatedAt: string) {
  const ticker = mapCoinGlassTicker(row, updatedAt);

  return ticker.symbol.endsWith("USDT") && ticker.exchange !== "UNKNOWN";
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
  fetcher,
  ohlcvProvider,
  now = () => new Date(),
}: CoinGlassProviderOptions): MarketDataProvider {
  return {
    id: "coinglass",
    label: "CoinGlass Futures Provider",

    async fetchSnapshot(): Promise<MarketRadarSnapshot> {
      const scanTime = now();
      const generatedAt = scanTime.toISOString();
      const batchPlan = buildScanBatchPlan({
        assets: baseAssets,
        batchSize,
        cadenceMinutes: 15,
        now: scanTime,
      });
      const marketRows = await fetchPairsMarkets({
        apiKey,
        baseAssets: batchPlan.assets,
        fetcher,
      });
      const cleanMarketRows = marketRows.filter((row) => isSupportedSignalRow(row, generatedAt));
      const primarySignalRows = selectPrimarySignalRows(cleanMarketRows, generatedAt);
      const instruments = cleanMarketRows
        .map((row) => mapCoinGlassMarketInstrument(row, generatedAt))
        .filter((item): item is NonNullable<typeof item> => item !== null);
      const instrumentPool = buildContractInstrumentPool(instruments, {
        minVolume24hUsd: 5_000_000,
      });
      const tickers = cleanMarketRows.map((row) => mapCoinGlassTicker(row, generatedAt));
      const derivatives = cleanMarketRows.map((row) => mapCoinGlassDerivativeSnapshot(row, generatedAt));
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
        staleAfterMinutes: 30,
        notes: [
          "CoinGlass provider enabled",
          "futures pairs-markets boundary active",
          `quality filter: raw ${marketRows.length}, clean ${cleanMarketRows.length}, primary ${primarySignalRows.length}`,
          `base assets: ${batchPlan.allAssets.join(",")}`,
          `batch ${batchPlan.batchIndex + 1}/${batchPlan.totalBatches}: ${batchPlan.assets.join(",")}`,
          `requests ${batchPlan.requestsPlanned}/${batchPlan.allAssets.length}, next batch ${batchPlan.nextBatchIndex + 1}`,
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
