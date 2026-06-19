import type {
  ContractInstrument,
  MarketTicker,
  ScanLightScanCandidate,
  ScanLightScanDiagnostics,
} from "../types";

export const BINANCE_FUTURES_24H_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";

export type PublicLightScanResult = {
  diagnostics: ScanLightScanDiagnostics;
  instruments: ContractInstrument[];
  priorityCandidates: ScanLightScanCandidate[];
  tickers: MarketTicker[];
};

export type PublicLightScanProvider = {
  id: string;
  label: string;
  scan: () => Promise<PublicLightScanResult>;
};

export type BinanceFutures24hTickerRow = {
  highPrice?: string;
  lastPrice?: string;
  lowPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  symbol?: string;
};

export type BinancePublicLightScanProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  maxPriorityCandidates?: number;
  now?: () => Date;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedSymbol(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function baseFromSymbol(symbol: string) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function isUsdtPerpLikeSymbol(symbol: string) {
  return symbol.endsWith("USDT") && !symbol.includes("_") && symbol.length > 4;
}

function volatilityPercent(high: number, low: number, price: number) {
  if (price <= 0) {
    return 0;
  }

  return Math.max(0, ((high - low) / price) * 100);
}

function distanceFromHighPercent(high: number, price: number) {
  if (high <= 0 || price <= 0) {
    return 100;
  }

  return Math.max(0, ((high - price) / high) * 100);
}

function distanceFromLowPercent(low: number, price: number) {
  if (low <= 0 || price <= 0) {
    return 100;
  }

  return Math.max(0, ((price - low) / low) * 100);
}

function logVolumeScore(volume24hUsd: number) {
  return Math.min(35, Math.max(0, Math.log10(Math.max(1, volume24hUsd)) * 3));
}

function candidateState({
  changePercent24h,
  volume24hUsd,
  volatility,
}: {
  changePercent24h: number;
  volume24hUsd: number;
  volatility: number;
}): ScanLightScanCandidate["state"] {
  const absChange = Math.abs(changePercent24h);

  if (absChange >= 5 || (absChange >= 3 && volume24hUsd >= 20_000_000)) {
    return "HOT";
  }

  if (absChange <= 1.5 && volatility <= 5 && volume24hUsd >= 10_000_000) {
    return "PRE_TREND";
  }

  if (absChange >= 1.2 || volume24hUsd >= 8_000_000) {
    return "WARM";
  }

  return "COLD";
}

function candidateReasons(candidate: {
  changePercent24h: number;
  distanceHigh: number;
  distanceLow: number;
  state: ScanLightScanCandidate["state"];
  volume24hUsd: number;
  volatility: number;
}) {
  const reasons: string[] = [];

  if (candidate.state === "HOT") {
    reasons.push("price_volume_anomaly");
  }

  if (candidate.state === "PRE_TREND") {
    reasons.push("range_compression_watch");
  }

  if (candidate.volume24hUsd >= 20_000_000) {
    reasons.push("liquid_enough");
  }

  if (candidate.distanceHigh <= 3 || candidate.distanceLow <= 3) {
    reasons.push("near_24h_edge");
  }

  if (Math.abs(candidate.changePercent24h) >= 3) {
    reasons.push("relative_motion");
  }

  return reasons.length ? reasons : ["broad_universe_light_scan"];
}

function priorityScore(candidate: {
  changePercent24h: number;
  distanceHigh: number;
  distanceLow: number;
  state: ScanLightScanCandidate["state"];
  volume24hUsd: number;
  volatility: number;
}) {
  const stateBoost = {
    COLD: 0,
    HOT: 45,
    PRE_TREND: 38,
    WARM: 18,
  }[candidate.state];
  const edgeBoost = candidate.distanceHigh <= 3 || candidate.distanceLow <= 3 ? 10 : 0;

  return Math.round(
    stateBoost +
    Math.min(35, Math.abs(candidate.changePercent24h) * 4) +
    logVolumeScore(candidate.volume24hUsd) +
    Math.min(15, candidate.volatility) +
    edgeBoost,
  );
}

function tickerFromRow(row: BinanceFutures24hTickerRow, updatedAt: string): MarketTicker | null {
  const symbol = normalizedSymbol(row.symbol ?? "");

  if (!isUsdtPerpLikeSymbol(symbol)) {
    return null;
  }

  const price = finiteNumber(row.lastPrice);
  const high24h = finiteNumber(row.highPrice);
  const low24h = finiteNumber(row.lowPrice);

  if (price <= 0 || high24h <= 0 || low24h <= 0) {
    return null;
  }

  return {
    symbol,
    exchange: "BINANCE",
    price,
    changePercent24h: finiteNumber(row.priceChangePercent),
    volume24hUsd: finiteNumber(row.quoteVolume),
    high24h,
    low24h,
    updatedAt,
  };
}

function instrumentFromTicker(ticker: MarketTicker): ContractInstrument {
  const baseAsset = baseFromSymbol(ticker.symbol);

  return {
    id: `BINANCE-LIGHT:${ticker.symbol}`,
    symbol: ticker.symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: ticker.volume24hUsd,
    tags: ["binance-public-light-scan", "quote:USDT", "market:perpetual"],
    lastSeenAt: ticker.updatedAt,
  };
}

function candidateFromTicker(ticker: MarketTicker): ScanLightScanCandidate {
  const volatility = volatilityPercent(ticker.high24h, ticker.low24h, ticker.price);
  const distanceHigh = distanceFromHighPercent(ticker.high24h, ticker.price);
  const distanceLow = distanceFromLowPercent(ticker.low24h, ticker.price);
  const state = candidateState({
    changePercent24h: ticker.changePercent24h,
    volume24hUsd: ticker.volume24hUsd,
    volatility,
  });
  const score = priorityScore({
    changePercent24h: ticker.changePercent24h,
    distanceHigh,
    distanceLow,
    state,
    volume24hUsd: ticker.volume24hUsd,
    volatility,
  });

  return {
    baseAsset: baseFromSymbol(ticker.symbol),
    changePercent24h: ticker.changePercent24h,
    distanceFromHighPercent: Math.round(distanceHigh * 100) / 100,
    distanceFromLowPercent: Math.round(distanceLow * 100) / 100,
    reasons: candidateReasons({
      changePercent24h: ticker.changePercent24h,
      distanceHigh,
      distanceLow,
      state,
      volume24hUsd: ticker.volume24hUsd,
      volatility,
    }),
    score,
    state,
    symbol: ticker.symbol,
    volume24hUsd: Math.round(ticker.volume24hUsd),
    volatilityPercent: Math.round(volatility * 100) / 100,
  };
}

function disabledLightScanDiagnostics(generatedAt: string): ScanLightScanDiagnostics {
  return {
    acceptedCount: 0,
    candidateCount: 0,
    generatedAt,
    notes: ["public light scan disabled"],
    requestCount: 0,
    source: "disabled",
    status: "disabled",
    topCandidates: [],
    universeCount: 0,
  };
}

export function disabledPublicLightScanProvider(now: () => Date = () => new Date()): PublicLightScanProvider {
  return {
    id: "disabled",
    label: "Disabled Public Light Scan",
    async scan() {
      return {
        diagnostics: disabledLightScanDiagnostics(now().toISOString()),
        instruments: [],
        priorityCandidates: [],
        tickers: [],
      };
    },
  };
}

export function createBinancePublicLightScanProvider({
  baseUrl = BINANCE_FUTURES_24H_TICKER_URL,
  fetcher = fetch,
  maxPriorityCandidates = 80,
  now = () => new Date(),
}: BinancePublicLightScanProviderOptions = {}): PublicLightScanProvider {
  const source = "binance-public-futures-24h";

  return {
    id: source,
    label: "Binance Public Futures Light Scan",

    async scan(): Promise<PublicLightScanResult> {
      const startedAt = now().toISOString();

      try {
        const response = await fetcher(baseUrl);

        if (!response.ok) {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: [`public light scan upstream returned ${response.status}`],
              requestCount: 1,
              source,
              status: "failed",
              topCandidates: [],
              universeCount: 0,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        }

        const payload: unknown = await response.json();

        if (!Array.isArray(payload)) {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: ["public light scan returned a non-array payload"],
              requestCount: 1,
              source,
              status: "failed",
              topCandidates: [],
              universeCount: 0,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        }

        const tickers = payload
          .map((row) => (
            typeof row === "object" && row !== null
              ? tickerFromRow(row as BinanceFutures24hTickerRow, startedAt)
              : null
          ))
          .filter((ticker): ticker is MarketTicker => ticker !== null);
        const candidates = tickers
          .map(candidateFromTicker)
          .filter((candidate) => candidate.state !== "COLD")
          .sort((left, right) => right.score - left.score || right.volume24hUsd - left.volume24hUsd)
          .slice(0, maxPriorityCandidates);
        const instruments = tickers.map(instrumentFromTicker);

        return {
          diagnostics: {
            acceptedCount: tickers.length,
            candidateCount: candidates.length,
            generatedAt: startedAt,
            notes: [`public light scan accepted ${tickers.length}/${payload.length} USDT perpetual tickers`],
            requestCount: 1,
            source,
            status: tickers.length > 0 ? "ready" : "partial",
            topCandidates: candidates.slice(0, 16),
            universeCount: payload.length,
          },
          instruments,
          priorityCandidates: candidates,
          tickers,
        };
      } catch (error) {
        return {
          diagnostics: {
            acceptedCount: 0,
            candidateCount: 0,
            generatedAt: startedAt,
            notes: [error instanceof Error ? error.message : "public light scan request failed"],
            requestCount: 1,
            source,
            status: "failed",
            topCandidates: [],
            universeCount: 0,
          },
          instruments: [],
          priorityCandidates: [],
          tickers: [],
        };
      }
    },
  };
}
