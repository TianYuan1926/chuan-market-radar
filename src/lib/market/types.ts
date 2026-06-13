import type { JournalEvent, MarketSignal } from "@/lib/analysis/types";

export type ExchangeId = "BINANCE" | "OKX" | "BYBIT" | "COINBASE" | "UNKNOWN";

export type MarketDataSource =
  | "mock"
  | "coinglass"
  | "exchange_public"
  | "coingecko"
  | "composite";

export type MarketDataStatus = "ready" | "partial" | "stale" | "failed";

export type ContractInstrument = {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeId;
  marketType: "perpetual" | "delivery";
  isActive: boolean;
  volume24hUsd: number;
  openInterestUsd?: number;
  tags: string[];
  lastSeenAt: string;
};

export type InstrumentRejectionReason =
  | "inactive"
  | "quote_not_supported"
  | "market_type_not_supported"
  | "volume_below_floor";

export type InstrumentPoolOptions = {
  minVolume24hUsd?: number;
  allowedQuoteAssets?: string[];
  allowedMarketTypes?: ContractInstrument["marketType"][];
};

export type RejectedInstrument = {
  instrument: ContractInstrument;
  reason: InstrumentRejectionReason;
};

export type InstrumentPoolSummary = {
  total: number;
  accepted: number;
  rejected: number;
  duplicatesRemoved: number;
  minVolume24hUsd: number;
  quoteAssets: string[];
  marketTypes: ContractInstrument["marketType"][];
};

export type InstrumentPoolResult = {
  instruments: ContractInstrument[];
  rejected: RejectedInstrument[];
  summary: InstrumentPoolSummary;
};

export type MarketTicker = {
  symbol: string;
  exchange: ExchangeId;
  price: number;
  changePercent24h: number;
  volume24hUsd: number;
  high24h: number;
  low24h: number;
  updatedAt: string;
};

export type DerivativeSnapshot = {
  symbol: string;
  exchange: ExchangeId;
  source: MarketDataSource;
  openInterestUsd: number;
  openInterestChangePercent: number;
  fundingRate: number;
  fundingRateZScore: number;
  longShortRatio?: number;
  liquidationUsd24h?: number;
  updatedAt: string;
};

export type HeatmapTone = "up" | "watch" | "sleep" | "down";

export type MarketHeatCell = {
  symbol: string;
  tone: HeatmapTone;
  changePercent: number;
  anomalyScore: number;
  volumeRank?: number;
};

export type ScanMetadata = {
  id: string;
  mode: "demo" | "scheduled" | "manual";
  status: MarketDataStatus;
  source: MarketDataSource;
  isRealtime: boolean;
  cadenceMinutes: number;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  riskGate: "on" | "off";
  generatedAt: string;
  nextScanAt: string;
  staleAfterMinutes: number;
  notes: string[];
};

export type ScanArchiveSummary = {
  id: string;
  source: MarketDataSource;
  status: MarketDataStatus;
  generatedAt: string;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  topSymbols: string[];
  notes: string[];
};

export type ScanReplaySignal = {
  id: string;
  symbol: string;
  direction: MarketSignal["direction"];
  state: MarketSignal["state"];
  timeframe: MarketSignal["timeframe"];
  confidence: number;
  risk: MarketSignal["risk"];
  riskReward: number;
  strategyStatus: MarketSignal["strategy"]["status"] | "unknown";
  updatedAt: string;
  summary: string;
};

export type ScanReplayFrame = {
  id: string;
  source: MarketDataSource;
  status: MarketDataStatus;
  generatedAt: string;
  nextScanAt: string;
  cadenceMinutes: number;
  scannedCount: number;
  anomalyCount: number;
  candidateCount: number;
  signals: ScanReplaySignal[];
};

export type ScanComparison = {
  fromId: string;
  toId: string;
  scannedDelta: number;
  anomalyDelta: number;
  candidateDelta: number;
  newSignalSymbols: string[];
  removedSignalSymbols: string[];
  statusChanged: boolean;
  sourceChanged: boolean;
};

export type ScanArchiveBundle = {
  entries: ScanArchiveSummary[];
  latestReplay?: ScanReplayFrame;
  comparison?: ScanComparison | null;
  retention: {
    storage: "memory" | "database";
    durable: boolean;
    maxEntries: number;
  };
};

export type MarketRadarSnapshot = {
  metadata: ScanMetadata;
  instrumentPool: InstrumentPoolResult;
  instruments: ContractInstrument[];
  tickers: MarketTicker[];
  derivatives: DerivativeSnapshot[];
  heatmap: MarketHeatCell[];
  signals: MarketSignal[];
  journalEvents: JournalEvent[];
  archive?: ScanArchiveBundle;
};

export type MarketDataProvider = {
  id: MarketDataSource;
  label: string;
  fetchSnapshot: () => Promise<MarketRadarSnapshot>;
};
