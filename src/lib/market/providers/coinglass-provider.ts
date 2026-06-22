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
import {
  buildMacroWeather,
  type AltcoinMacroAnchorInput,
} from "../macro-weather";
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
  MarketDataStatus,
  MarketDataProvider,
  MarketRadarSnapshot,
  ScanMetadata,
  ScanRequestDiagnostics,
  ScanV3CoverageDiagnostics,
} from "../types";
import type { UniverseDiscoveryProvider } from "./binance-universe-discovery";
import { CoinGlassApiError, requestCoinGlass } from "./coinglass-client";
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
import {
  disabledPublicLightScanProvider,
  type PublicLightScanProvider,
  type PublicLightScanResult,
} from "./public-light-scan";

export type CoinGlassProviderOptions = {
  apiKey: string;
  altcoinMacro?: AltcoinMacroAnchorInput;
  baseAssets?: string[];
  batchSize?: number;
  coinGlassDailyRequestBudget?: number;
  fetcher?: typeof fetch;
  maxConcurrentRequests?: number;
  ohlcvProvider?: OhlcvProvider;
  publicLightScanProvider?: PublicLightScanProvider;
  requestIntervalMs?: number;
  requestPaceSleep?: (ms: number) => Promise<void>;
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
  const volumeChange = marketRowNumber(row.volume_usd_change_percent_24h, row.volumeUsdChangePercent24h);
  const directionBias = directionBiasFromChange(ticker.changePercent24h);
  const structureLocation = structureLocationFromTimeframeProfile(timeframeProfile, directionBias);
  const distanceToInvalidationPercent = distanceToInvalidationPercentFromStructure(structureLocation, timeframeProfile);
  const projectedMovePercent = projectedMovePercentFromInputs(ticker.changePercent24h, structureLocation, timeframeProfile);

  return {
    id: `coinglass-${ticker.exchange}-${ticker.symbol}`,
    symbol: ticker.symbol,
    exchange: ticker.exchange,
    timeframe: "15m",
    regime: marketContext.regime,
    directionBias,
    dataQualityScore: dataQualityScoreFromOhlcv(timeframeProfile, ohlcvFailures),
    priceChangePercent: ticker.changePercent24h,
    volumeRatio: Math.max(0.1, 1 + volumeChange / 100),
    openInterestChangePercent: derivative.openInterestChangePercent,
    fundingRateZScore: derivative.fundingRateZScore,
    volatilityCompressionPercentile: volatilityCompressionPercentileFromTimeframeProfile(timeframeProfile),
    liquidationUsd24h: derivative.liquidationUsd24h ?? 0,
    structureLocation,
    distanceToInvalidationPercent,
    projectedMovePercent,
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
const defaultCoinGlassBatchSize = 24;
const defaultCoinGlassRequestConcurrency = 6;

function dataQualityScoreFromOhlcv(
  timeframeProfile?: TimeframeProfile,
  ohlcvFailures: OhlcvProviderFailure[] = [],
) {
  if (!timeframeProfile) {
    return ohlcvFailures.length > 0 ? 0.72 : 0.82;
  }

  const missingPenalty = Math.min(0.18, timeframeProfile.missingRoles.length * 0.04);
  const conflictPenalty = timeframeProfile.conflictTimeframes.length > 0 ? 0.04 : 0;

  return Math.max(0.68, Number((0.9 - missingPenalty - conflictPenalty).toFixed(2)));
}

function hasStructureSupport(profile?: TimeframeProfile) {
  return profile?.frames.some((frame) =>
    (frame.timeframe === "1h" || frame.timeframe === "4h") && frame.alignment === "support"
  ) ?? false;
}

function hasStructureConflict(profile?: TimeframeProfile) {
  return profile?.frames.some((frame) =>
    (frame.timeframe === "1h" || frame.timeframe === "4h") && frame.alignment === "conflict"
  ) ?? false;
}

function structureLocationFromTimeframeProfile(
  profile: TimeframeProfile | undefined,
  directionBias: SignalDirection,
): MarketAnomalyInput["structureLocation"] {
  if (!profile) {
    return "middle";
  }

  if (hasStructureConflict(profile)) {
    return directionBias === "short" ? "support" : "resistance";
  }

  if (hasStructureSupport(profile)) {
    return "breakout_edge";
  }

  if (profile.supportTimeframes.length >= 2 && profile.conflictTimeframes.length === 0) {
    return "range_edge";
  }

  return "middle";
}

function volatilityCompressionPercentileFromTimeframeProfile(profile?: TimeframeProfile) {
  if (!profile) {
    return 50;
  }

  if (profile.conflictTimeframes.length > profile.supportTimeframes.length) {
    return 62;
  }

  if (hasStructureSupport(profile) && profile.supportTimeframes.length >= 3) {
    return 22;
  }

  if (profile.supportTimeframes.length >= 2) {
    return 32;
  }

  return 45;
}

function distanceToInvalidationPercentFromStructure(
  structureLocation: MarketAnomalyInput["structureLocation"],
  profile?: TimeframeProfile,
) {
  if (structureLocation === "middle") {
    return 2.8;
  }

  const structureBonus = hasStructureSupport(profile) ? 0.2 : 0;

  return Number(Math.max(1.1, 1.6 - structureBonus).toFixed(1));
}

function projectedMovePercentFromInputs(
  priceChangePercent: number,
  structureLocation: MarketAnomalyInput["structureLocation"],
  profile?: TimeframeProfile,
) {
  const minimumMove = structureLocation === "middle" ? 3 : 4.8;
  const timeframeBoost = profile ? Math.min(2.4, Math.max(0, profile.supportScore - profile.conflictScore) / 12) : 0;

  return Number(Math.max(minimumMove, Math.abs(priceChangePercent) * 1.8 + timeframeBoost).toFixed(1));
}

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

type CoinGlassPairsMarketFailure = {
  code?: string;
  error: string;
  httpStatus?: number;
  symbol: string;
};

type CoinGlassPairsMarketFetch = {
  failures: CoinGlassPairsMarketFailure[];
  rows: CoinGlassMarketRow[];
};

function marketRowVolume(row: CoinGlassMarketRow) {
  return marketRowNumber(row.volume_usd, row.volumeUsd);
}

function marketRowOpenInterest(row: CoinGlassMarketRow) {
  return marketRowNumber(row.open_interest_usd, row.openInterestUsd);
}

function marketRowNumber(...values: (number | string | undefined)[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
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

  const duplicateEntries = [...candidatesBySymbol.entries()]
    .filter(([, candidates]) => candidates.length > 1);
  const samples = duplicateEntries
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
    duplicateGroupCount: duplicateEntries.length,
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

function lightScanPriorityHints(lightScan: PublicLightScanResult): UniversePriorityHint[] {
  if (lightScan.diagnostics.status !== "ready" && lightScan.diagnostics.status !== "partial") {
    return [];
  }

  return lightScan.priorityCandidates.slice(0, 24).map((candidate) => ({
    anomalyScore: Math.min(100, Math.max(0, candidate.score)),
    baseAsset: candidate.baseAsset,
    recentSignalCount: candidate.state === "HOT" ? 2 : 1,
    symbol: candidate.symbol,
  }));
}

function rowBaseAsset(row: CoinGlassMarketRow) {
  const symbol = marketSymbolFromCoinGlass(row);

  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function coinGlassFailureFromError(symbol: string, error: unknown): CoinGlassPairsMarketFailure {
  if (error instanceof CoinGlassApiError) {
    return {
      code: error.code,
      error: error.message,
      httpStatus: error.httpStatus,
      symbol,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    symbol,
  };
}

function compactCoinGlassFailures(failures: CoinGlassPairsMarketFailure[], previewLimit = 8) {
  const preview = failures
    .slice(0, previewLimit)
    .map((failure) => {
      const status = failure.httpStatus ? ` http ${failure.httpStatus}` : "";
      const code = failure.code ? ` code ${failure.code}` : "";

      return `${failure.symbol}: ${failure.error}${code}${status}`;
    })
    .join("; ");
  const suffix = failures.length > previewLimit
    ? `; +${failures.length - previewLimit} more`
    : "";

  return `${preview}${suffix}`;
}

function metadataStatusFromCoinGlassFailures(
  failures: CoinGlassPairsMarketFailure[],
): MarketDataStatus {
  return failures.length > 0 ? "partial" : "ready";
}

function buildRequestDiagnostics({
  acceptedInstruments,
  batchAssets,
  cleanRows,
  primaryRows,
  primarySelectionDuplicateGroups,
  qualityRejections,
  rawRows,
}: {
  acceptedInstruments: number;
  batchAssets: string[];
  cleanRows: number;
  primaryRows: number;
  primarySelectionDuplicateGroups: number;
  qualityRejections: Record<CoinGlassMarketRowRejectionReason, number>;
  rawRows: CoinGlassMarketRow[];
}): ScanRequestDiagnostics {
  const rawBaseAssets = new Set(rawRows.map(rowBaseAsset).filter(Boolean));
  const emptyResultAssets = batchAssets.filter((asset) => !rawBaseAssets.has(asset));
  const unsupportedExchangeRows = qualityRejections.unsupported_exchange ?? 0;
  const quoteUnsupportedRows = qualityRejections.quote_not_supported ?? 0;
  const filteredRows = Math.max(0, rawRows.length - cleanRows);

  return {
    acceptedInstruments,
    cleanRows,
    coinGlassRequestsPlanned: batchAssets.length,
    duplicateSymbolGroups: primarySelectionDuplicateGroups,
    emptyResultAssets,
    filteredRows,
    plannedAssets: batchAssets,
    primaryRows,
    quoteUnsupportedRows,
    rawRows: rawRows.length,
    statusCounts: {
      clean: cleanRows,
      conflict: primarySelectionDuplicateGroups,
      empty: emptyResultAssets.length,
      fallback_only: 0,
      filtered: filteredRows,
      live_ok: primaryRows,
      stale: 0,
      unsupported: unsupportedExchangeRows + quoteUnsupportedRows,
    },
    unsupportedExchangeRows,
  };
}

function buildV3CoverageDiagnostics({
  ohlcvAttemptedSymbols,
  ohlcvFailuresBySymbol,
  signals,
}: {
  ohlcvAttemptedSymbols: Iterable<string>;
  ohlcvFailuresBySymbol: Map<string, OhlcvProviderFailure[]>;
  signals: MarketRadarSnapshot["signals"];
}): ScanV3CoverageDiagnostics {
  const withV3Signals = signals.filter((signal) => signal.strategyV3).length;

  return {
    missingSignals: Math.max(0, signals.length - withV3Signals),
    ohlcvAttemptedSymbols: [...ohlcvAttemptedSymbols],
    ohlcvFailureCount: [...ohlcvFailuresBySymbol.values()].reduce(
      (total, failures) => total + failures.length,
      0,
    ),
    totalSignals: signals.length,
    withV3Signals,
  };
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
  maxConcurrentRequests,
  requestIntervalMs,
  requestPaceSleep,
}: {
  apiKey: string;
  baseAssets: string[];
  fetcher?: typeof fetch;
  maxConcurrentRequests?: number;
  requestIntervalMs?: number;
  requestPaceSleep?: (ms: number) => Promise<void>;
}): Promise<CoinGlassPairsMarketFetch> {
  const intervalMs = safeCoinGlassRequestIntervalMs(requestIntervalMs);
  const sleep = requestPaceSleep ?? defaultRequestPaceSleep;
  const concurrency = intervalMs > 0 ? 1 : safeCoinGlassConcurrency(maxConcurrentRequests);
  const results = await mapWithConcurrency(baseAssets, concurrency, async (symbol) => {
    try {
      if (intervalMs > 0 && symbol !== baseAssets[0]) {
        await sleep(intervalMs);
      }

      const rows = await requestCoinGlass<CoinGlassMarketRow[]>({
        apiKey,
        path: "/api/futures/pairs-markets",
        query: { symbol },
        fetcher,
      });

      return {
        failures: [],
        rows,
      };
    } catch (error) {
      return {
        failures: [coinGlassFailureFromError(symbol, error)],
        rows: [],
      };
    }
  });

  return {
    failures: results.flatMap((result) => result.failures),
    rows: results.flatMap((result) => result.rows),
  };
}

async function defaultRequestPaceSleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCoinGlassConcurrency(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return defaultCoinGlassRequestConcurrency;
  }

  return Math.min(30, Math.max(1, Math.floor(value as number)));
}

function safeCoinGlassRequestIntervalMs(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }

  return Math.min(60_000, Math.max(0, Math.floor(value as number)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, concurrency);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];

      if (item !== undefined) {
        results[currentIndex] = await mapper(item, currentIndex);
      }
    }
  }));

  return results;
}

function noteConcurrency(value: number | undefined) {
  const concurrency = safeCoinGlassConcurrency(value);

  return `coinglass concurrency: ${concurrency} parallel pair-market requests`;
}

function notePacing(value: number | undefined) {
  const intervalMs = safeCoinGlassRequestIntervalMs(value);

  return intervalMs > 0
    ? `coinglass pacing: ${intervalMs}ms between deep-scan requests`
    : "coinglass pacing: disabled";
}

export function coinGlassRequestConcurrencyForTest(value?: number) {
  return safeCoinGlassConcurrency(value);
}

export function coinGlassDefaultRequestConcurrencyForTest() {
  return defaultCoinGlassRequestConcurrency;
}

export function createCoinGlassProvider({
  apiKey,
  altcoinMacro,
  baseAssets = ["BTC", "ETH", "SOL"],
  batchSize = defaultCoinGlassBatchSize,
  coinGlassDailyRequestBudget,
  fetcher,
  maxConcurrentRequests,
  now = () => new Date(),
  ohlcvProvider,
  publicLightScanProvider,
  requestIntervalMs,
  requestPaceSleep,
  universePriorityHintNotes,
  universePriorityHints,
  universeDiscoveryProvider,
}: CoinGlassProviderOptions): MarketDataProvider {
  const resolvedPublicLightScanProvider = publicLightScanProvider ?? disabledPublicLightScanProvider(now);

  return {
    id: "coinglass",
    label: "CoinGlass Futures Provider",

    async fetchSnapshot(): Promise<MarketRadarSnapshot> {
      const scanTime = now();
      const generatedAt = scanTime.toISOString();
      const universeDiscovery = universeDiscoveryProvider
        ? await universeDiscoveryProvider.discoverInstruments()
        : null;
      const lightScan = await resolvedPublicLightScanProvider.scan();
      const discoveredInstruments = universeDiscovery?.ok
        ? universeDiscovery.instruments
        : [];
      const combinedDiscoveryInstruments = [
        ...discoveredInstruments,
        ...lightScan.instruments,
      ];
      const lightPriorityHints = lightScanPriorityHints(lightScan);
      const allPriorityHints = [
        ...(universePriorityHints ?? []),
        ...lightPriorityHints,
      ];
      const initialRegistry = buildUniverseRegistry(baseAssets, combinedDiscoveryInstruments);
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
        { priorityHints: allPriorityHints },
      );
      const pairMarketFetch = await fetchPairsMarkets({
        apiKey,
        baseAssets: batchPlan.assets,
        fetcher,
        maxConcurrentRequests,
        requestIntervalMs,
        requestPaceSleep,
      });
      const marketRows = pairMarketFetch.rows;
      const coinGlassFailures = pairMarketFetch.failures;
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
        ...combinedDiscoveryInstruments,
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
      const ohlcvAttemptedSymbols = new Set<string>();
      const ohlcvSummaryNotes: string[] = [];

      if (ohlcvProvider) {
        await Promise.all(primarySignalRows.slice(0, maxOhlcvSymbolsPerScan).map(async (row) => {
          const ticker = mapCoinGlassTicker(row, generatedAt);
          const candlesByTimeframe: Partial<Record<OhlcvInterval, Candle[]>> = {};
          const failures: OhlcvProviderFailure[] = [];

          ohlcvAttemptedSymbols.add(ticker.symbol);

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
      const requestDiagnostics = buildRequestDiagnostics({
        acceptedInstruments: instrumentPool.summary.accepted,
        batchAssets: batchPlan.assets,
        cleanRows: cleanMarketRows.length,
        primaryRows: primarySignalRows.length,
        primarySelectionDuplicateGroups: primarySelectionReport.duplicateGroupCount,
        qualityRejections: qualityReport.rejections,
        rawRows: marketRows,
      });
      const fallbackActivated = universeDiscovery?.ok
        ? universeDiscovery.fallbackActivated === true
        : false;
      const discoveryDiagnostics = universeDiscovery?.diagnostics ?? [];
      const scanDiagnostics: NonNullable<ScanMetadata["diagnostics"]> = {
        discovery: {
          fallbackActivated,
          fallbackInstrumentCount: universeDiscovery?.ok
            ? universeDiscovery.fallbackInstrumentCount ?? 0
            : 0,
          liveInstrumentCount: universeDiscovery?.ok
            ? universeDiscovery.liveInstrumentCount ?? discoveredInstruments.length
            : 0,
          sources: discoveryDiagnostics,
        },
        requests: requestDiagnostics,
        v3Coverage: buildV3CoverageDiagnostics({
          ohlcvAttemptedSymbols,
          ohlcvFailuresBySymbol,
          signals,
        }),
      };
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
      const metadataStatus = metadataStatusFromCoinGlassFailures(coinGlassFailures);
      const macroWeather = buildMacroWeather({
        altcoinMacro,
        derivatives,
        metadataStatus,
        signals,
        tickers,
      });
      const metadata: ScanMetadata = {
        id: `coinglass-${generatedAt}`,
        mode: "scheduled",
        status: metadataStatus,
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
        diagnostics: scanDiagnostics,
        lightScan: lightScan.diagnostics,
        macroWeather,
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
          `public light scan: ${lightScan.diagnostics.source} ${lightScan.diagnostics.status} ${lightScan.diagnostics.acceptedCount}/${lightScan.diagnostics.universeCount} accepted, candidates ${lightScan.diagnostics.candidateCount}`,
          ...lightScan.diagnostics.notes.map((note) => `public light scan source: ${note}`),
          ...(universePriorityHintNotes ?? []),
          lightPriorityHints.length
            ? `public light scan priority hints: ${lightPriorityHints.slice(0, 8).map((item) => item.baseAsset ?? item.symbol).join(",")}`
            : "public light scan priority hints: none",
          coinGlassFailures.length
            ? `coinglass deep scan degraded: ${coinGlassFailures.length}/${batchPlan.assets.length} requests failed; public light scan preserved`
            : "coinglass deep scan: all planned requests returned",
          coinGlassFailures.length
            ? `coinglass request failures: ${compactCoinGlassFailures(coinGlassFailures)}`
            : "coinglass request failures: none",
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
          noteConcurrency(maxConcurrentRequests),
          notePacing(requestIntervalMs),
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
          `request diagnostics: planned ${requestDiagnostics.coinGlassRequestsPlanned}, raw ${requestDiagnostics.rawRows}, empty ${requestDiagnostics.emptyResultAssets.length}, filtered ${requestDiagnostics.filteredRows}, accepted ${requestDiagnostics.acceptedInstruments}`,
          `market context: ${marketContext.anchor} ${marketContext.regime}`,
          v3Signals.length
            ? `v3 key levels: ${v3Signals.map((signal) => `${signal.symbol} ${signal.strategyV3?.keyLevels.length ?? 0}/${signal.strategyV3?.forwardLevels.length ?? 0}`).join(", ")}`
            : "v3 key levels: unavailable",
          `v3 coverage: ${scanDiagnostics.v3Coverage.withV3Signals}/${scanDiagnostics.v3Coverage.totalSignals}, missing ${scanDiagnostics.v3Coverage.missingSignals}, ohlcv_failures ${scanDiagnostics.v3Coverage.ohlcvFailureCount}`,
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
