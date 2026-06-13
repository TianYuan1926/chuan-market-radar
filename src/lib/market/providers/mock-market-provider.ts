import { mockJournalEvents } from "../../../data/mock-signals";
import {
  analyzeMarketAnomalies,
  type MarketAnomalyInput,
} from "../../analysis/anomaly-engine";
import type { MarketSignal } from "../../analysis/types";
import { siteConfig } from "../../config/site";
import { buildContractInstrumentPool } from "../instrument-pool";
import type {
  ContractInstrument,
  DerivativeSnapshot,
  InstrumentPoolResult,
  MarketDataProvider,
  MarketHeatCell,
  MarketRadarSnapshot,
  MarketTicker,
  ScanMetadata,
} from "../types";

const generatedAt = "2026-06-12T10:20:00+08:00";
const nextScanAt = "2026-06-12T10:35:00+08:00";

const demoTickers: MarketTicker[] = [
  {
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    price: 0.684,
    changePercent24h: 4.2,
    volume24hUsd: 148_000_000,
    high24h: 0.701,
    low24h: 0.631,
    updatedAt: generatedAt,
  },
  {
    symbol: "SUIUSDT",
    exchange: "BINANCE",
    price: 3.24,
    changePercent24h: 2.1,
    volume24hUsd: 318_000_000,
    high24h: 3.42,
    low24h: 3.08,
    updatedAt: generatedAt,
  },
  {
    symbol: "TIAUSDT",
    exchange: "BINANCE",
    price: 2.82,
    changePercent24h: -2.8,
    volume24hUsd: 92_000_000,
    high24h: 2.98,
    low24h: 2.74,
    updatedAt: generatedAt,
  },
  {
    symbol: "ONDOUSDT",
    exchange: "BINANCE",
    price: 0.91,
    changePercent24h: 1.6,
    volume24hUsd: 76_000_000,
    high24h: 0.94,
    low24h: 0.87,
    updatedAt: generatedAt,
  },
];

function demoVolumeFromRank(volumeRank = 40, anomalyScore = 40) {
  return Math.max(6_000_000, 180_000_000 - volumeRank * 4_750_000 + anomalyScore * 950_000);
}

const demoHeatmap: MarketHeatCell[] = [
  { symbol: "ENA", tone: "up", changePercent: 4.2, anomalyScore: 78, volumeRank: 11 },
  { symbol: "SUI", tone: "watch", changePercent: 2.1, anomalyScore: 69, volumeRank: 7 },
  { symbol: "OP", tone: "sleep", changePercent: 0.6, anomalyScore: 44, volumeRank: 19 },
  { symbol: "TIA", tone: "down", changePercent: -2.8, anomalyScore: 62, volumeRank: 23 },
  { symbol: "SOL", tone: "up", changePercent: 3.3, anomalyScore: 71, volumeRank: 3 },
  { symbol: "ARB", tone: "sleep", changePercent: 0.2, anomalyScore: 39, volumeRank: 21 },
  { symbol: "WIF", tone: "watch", changePercent: 1.7, anomalyScore: 57, volumeRank: 18 },
  { symbol: "SEI", tone: "up", changePercent: 2.9, anomalyScore: 67, volumeRank: 15 },
  { symbol: "JUP", tone: "sleep", changePercent: -0.4, anomalyScore: 36, volumeRank: 26 },
  { symbol: "APT", tone: "down", changePercent: -1.9, anomalyScore: 52, volumeRank: 20 },
  { symbol: "INJ", tone: "watch", changePercent: 1.2, anomalyScore: 49, volumeRank: 16 },
  { symbol: "LDO", tone: "sleep", changePercent: 0.3, anomalyScore: 33, volumeRank: 31 },
  { symbol: "ORDI", tone: "up", changePercent: 3.9, anomalyScore: 74, volumeRank: 13 },
  { symbol: "LINK", tone: "sleep", changePercent: 0.8, anomalyScore: 41, volumeRank: 10 },
  { symbol: "PEPE", tone: "down", changePercent: -3.1, anomalyScore: 66, volumeRank: 9 },
  { symbol: "FET", tone: "up", changePercent: 2.4, anomalyScore: 63, volumeRank: 17 },
  { symbol: "DYDX", tone: "sleep", changePercent: -0.2, anomalyScore: 35, volumeRank: 28 },
  { symbol: "NEAR", tone: "watch", changePercent: 1.6, anomalyScore: 55, volumeRank: 14 },
  { symbol: "BLUR", tone: "sleep", changePercent: 0.5, anomalyScore: 38, volumeRank: 33 },
  { symbol: "RNDR", tone: "up", changePercent: 2.7, anomalyScore: 65, volumeRank: 12 },
  { symbol: "ATOM", tone: "sleep", changePercent: 0.1, anomalyScore: 31, volumeRank: 29 },
  { symbol: "FIL", tone: "down", changePercent: -1.4, anomalyScore: 47, volumeRank: 24 },
  { symbol: "IMX", tone: "watch", changePercent: 1.8, anomalyScore: 59, volumeRank: 22 },
  { symbol: "RUNE", tone: "sleep", changePercent: -0.3, anomalyScore: 34, volumeRank: 27 },
];

const demoAnomalyInputs: MarketAnomalyInput[] = [
  {
    id: "ena-near-trigger",
    symbol: "ENAUSDT",
    exchange: "BINANCE",
    timeframe: "15m",
    regime: "mixed",
    directionBias: "long",
    dataQualityScore: 0.94,
    priceChangePercent: 2.4,
    volumeRatio: 1.92,
    openInterestChangePercent: 6.8,
    fundingRateZScore: 0.35,
    volatilityCompressionPercentile: 18,
    liquidationUsd24h: 7_200_000,
    structureLocation: "breakout_edge",
    distanceToInvalidationPercent: 1.2,
    projectedMovePercent: 4.8,
    triggerHint: "15m 放量突破后，回踩箱体上沿不破再考虑",
    invalidationHint: "跌回箱体并收在突破位下方",
    targetHints: ["前高流动性区", "4H 供给下沿"],
    updatedAt: "2026-06-12T10:15:00+08:00",
  },
  {
    id: "sui-short-confirmation",
    symbol: "SUIUSDT",
    exchange: "BINANCE",
    timeframe: "1h",
    regime: "risk_off",
    directionBias: "short",
    dataQualityScore: 0.9,
    priceChangePercent: -1.1,
    volumeRatio: 1.62,
    openInterestChangePercent: 7.1,
    fundingRateZScore: 1.45,
    volatilityCompressionPercentile: 25,
    liquidationUsd24h: 5_900_000,
    structureLocation: "resistance",
    distanceToInvalidationPercent: 1.8,
    projectedMovePercent: 5.1,
    triggerHint: "反抽 1H 供应区失败，或跌破小级别需求区后回踩不过",
    invalidationHint: "重新站上反弹高点并放量",
    targetHints: ["前低流动性区", "日线需求上沿"],
    updatedAt: "2026-06-12T10:00:00+08:00",
  },
  {
    id: "tia-abnormal-watch",
    symbol: "TIAUSDT",
    exchange: "BINANCE",
    timeframe: "30m",
    regime: "range",
    directionBias: "neutral",
    dataQualityScore: 0.88,
    priceChangePercent: -2.8,
    volumeRatio: 1.76,
    openInterestChangePercent: 8.6,
    fundingRateZScore: 0.4,
    volatilityCompressionPercentile: 12,
    liquidationUsd24h: 4_700_000,
    structureLocation: "middle",
    distanceToInvalidationPercent: 3.4,
    projectedMovePercent: 3.8,
    triggerHint: "不参与，等待靠近箱体边界或方向确认",
    invalidationHint: "继续停留箱体中部且量能衰减",
    targetHints: ["上沿突破观察", "下沿跌破观察"],
    updatedAt: "2026-06-12T09:45:00+08:00",
  },
  {
    id: "ondo-normal-watch",
    symbol: "ONDOUSDT",
    exchange: "BINANCE",
    timeframe: "4h",
    regime: "mixed",
    directionBias: "long",
    dataQualityScore: 0.89,
    priceChangePercent: 1.6,
    volumeRatio: 1.16,
    openInterestChangePercent: 2.1,
    fundingRateZScore: 0.18,
    volatilityCompressionPercentile: 46,
    liquidationUsd24h: 2_300_000,
    structureLocation: "support",
    distanceToInvalidationPercent: 1.4,
    projectedMovePercent: 4.5,
    triggerHint: "靠近 4H 支撑后出现 15m 放量反转再评估",
    invalidationHint: "4H 支撑带被有效跌破",
    targetHints: ["区间中轴", "前高压力"],
    updatedAt: "2026-06-12T09:30:00+08:00",
  },
];

function buildSignals() {
  return analyzeMarketAnomalies(demoAnomalyInputs);
}

function buildRawInstruments(signals: MarketSignal[]): ContractInstrument[] {
  const heatmapInstruments: ContractInstrument[] = demoHeatmap.map((item) => {
    const symbol = `${item.symbol}USDT`;
    const signal = signals.find((candidate) => candidate.symbol === symbol);

    return {
      id: `BINANCE:${symbol}`,
      symbol,
      baseAsset: item.symbol,
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd:
        demoTickers.find((ticker) => ticker.symbol === symbol)?.volume24hUsd ??
        demoVolumeFromRank(item.volumeRank, item.anomalyScore),
      openInterestUsd: signal ? 40_000_000 + signal.confidence * 1_250_000 : undefined,
      tags: [item.tone, signal?.state ?? "pool_only"].filter(Boolean),
      lastSeenAt: signal?.updatedAt ?? generatedAt,
    };
  });

  const rejectedSamples: ContractInstrument[] = [
    {
      id: "BINANCE:OLDUSDT",
      symbol: "OLDUSDT",
      baseAsset: "OLD",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: false,
      volume24hUsd: 42_000_000,
      tags: ["inactive_sample"],
      lastSeenAt: generatedAt,
    },
    {
      id: "BINANCE:THINUSDT",
      symbol: "THINUSDT",
      baseAsset: "THIN",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd: 900_000,
      tags: ["low_liquidity_sample"],
      lastSeenAt: generatedAt,
    },
    {
      id: "BINANCE:BTCUSD",
      symbol: "BTCUSD",
      baseAsset: "BTC",
      quoteAsset: "USD",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd: 510_000_000,
      tags: ["quote_sample"],
      lastSeenAt: generatedAt,
    },
    {
      id: "BINANCE:DELIVERYUSDT",
      symbol: "DELIVERYUSDT",
      baseAsset: "DELIVERY",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "delivery",
      isActive: true,
      volume24hUsd: 55_000_000,
      tags: ["delivery_sample"],
      lastSeenAt: generatedAt,
    },
    {
      id: "BINANCE:ENAUSDT-DUPLICATE",
      symbol: "ENAUSDT",
      baseAsset: "ENA",
      quoteAsset: "USDT",
      exchange: "BINANCE",
      marketType: "perpetual",
      isActive: true,
      volume24hUsd: 9_000_000,
      tags: ["duplicate_sample"],
      lastSeenAt: generatedAt,
    },
  ];

  return [...heatmapInstruments, ...rejectedSamples];
}

function buildInstrumentPool(signals: MarketSignal[]): InstrumentPoolResult {
  return buildContractInstrumentPool(buildRawInstruments(signals), {
    minVolume24hUsd: 5_000_000,
  });
}

function buildSignalInstruments(
  instrumentPool: InstrumentPoolResult,
  signals: MarketSignal[],
): ContractInstrument[] {
  return signals.map((signal) => ({
    id: `${signal.exchange}:${signal.symbol}`,
    symbol: signal.symbol,
    baseAsset: signal.symbol.replace("USDT", ""),
    quoteAsset: "USDT",
    exchange: signal.exchange === "BINANCE" ? "BINANCE" : "UNKNOWN",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd:
      instrumentPool.instruments.find((instrument) => instrument.symbol === signal.symbol)
        ?.volume24hUsd ?? 0,
    openInterestUsd: 40_000_000 + signal.confidence * 1_250_000,
    tags: [signal.state, signal.timeframe, signal.risk],
    lastSeenAt: signal.updatedAt,
  }));
}

function buildDerivatives(signals: MarketSignal[]): DerivativeSnapshot[] {
  return signals.map((signal) => ({
    symbol: signal.symbol,
    exchange: signal.exchange === "BINANCE" ? "BINANCE" : "UNKNOWN",
    source: "mock",
    openInterestUsd: 40_000_000 + signal.confidence * 1_250_000,
    openInterestChangePercent:
      signal.state === "near_trigger" ? 6.4 : signal.state === "abnormal_watch" ? 8.6 : 2.1,
    fundingRate: signal.direction === "short" ? 0.00024 : 0.00008,
    fundingRateZScore: signal.direction === "short" ? 1.3 : 0.4,
    longShortRatio: signal.direction === "short" ? 1.18 : 0.96,
    liquidationUsd24h: signal.confidence * 86_000,
    updatedAt: signal.updatedAt,
  }));
}

function buildMetadata(instrumentPool: InstrumentPoolResult, signals: MarketSignal[]): ScanMetadata {
  return {
    id: "demo-scan-2026-06-12-1020",
    mode: "demo",
    status: "ready",
    source: "mock",
    isRealtime: false,
    cadenceMinutes: siteConfig.scanIntervalMinutes,
    scannedCount: instrumentPool.summary.accepted,
    anomalyCount: signals.filter(
      (signal) => signal.state !== "no_trade" && signal.state !== "insufficient_data",
    ).length,
    candidateCount: signals.length,
    riskGate: "on",
    generatedAt,
    nextScanAt,
    staleAfterMinutes: siteConfig.scanIntervalMinutes * 2,
    notes: ["演示数据", "非实时扫描", "合约币种池过滤已启用"],
  };
}

export const mockMarketProvider: MarketDataProvider = {
  id: "mock",
  label: "Demo Market Provider",
  async fetchSnapshot(): Promise<MarketRadarSnapshot> {
    const signals = buildSignals();
    const instrumentPool = buildInstrumentPool(signals);

    return {
      metadata: buildMetadata(instrumentPool, signals),
      instrumentPool,
      instruments: buildSignalInstruments(instrumentPool, signals),
      tickers: demoTickers,
      derivatives: buildDerivatives(signals),
      heatmap: demoHeatmap,
      signals,
      journalEvents: mockJournalEvents,
    };
  },
};
