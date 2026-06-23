import type {
  ContractInstrument,
  MarketTicker,
  ScanLightScanCandidate,
  ScanLightScanDiagnostics,
} from "../types";
import { isCryptoFuturesUnderlying } from "../asset-class-filter";
import { createBinanceUniverseDiscoveryProvider } from "./binance-universe-discovery";
import { createBybitUniverseDiscoveryProvider } from "./bybit-universe-discovery";
import { createOkxUniverseDiscoveryProvider } from "./okx-universe-discovery";

export const BINANCE_FUTURES_24H_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";
export const OKX_PUBLIC_SWAP_TICKERS_URL = "https://www.okx.com/api/v5/market/tickers";
export const BYBIT_PUBLIC_LINEAR_TICKERS_URL = "https://api.bybit.com/v5/market/tickers";
export const DEFAULT_PUBLIC_LIGHT_SCAN_TIMEOUT_MS = 4_000;

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

export type OkxSwapTickerRow = {
  high24h?: string;
  instCategory?: string;
  instId?: string;
  last?: string;
  low24h?: string;
  open24h?: string;
  ruleType?: string;
  vol24h?: string;
  volCcy24h?: string;
};

export type BybitLinearTickerRow = {
  highPrice24h?: string;
  lastPrice?: string;
  lowPrice24h?: string;
  price24hPcnt?: string;
  symbol?: string;
  turnover24h?: string;
};

export type BinancePublicLightScanProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  maxPriorityCandidates?: number;
  now?: () => Date;
  requestTimeoutMs?: number;
};

export type OkxPublicLightScanProviderOptions = BinancePublicLightScanProviderOptions;
export type BybitPublicLightScanProviderOptions = BinancePublicLightScanProviderOptions;

export type CompositePublicLightScanProviderOptions = {
  maxPriorityCandidates?: number;
  providers?: PublicLightScanProvider[];
};

type AllowedSymbolDiscovery = {
  notes: string[];
  requestCount: number;
  symbols: Set<string>;
  universeCount: number;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function fetchTimeoutMs(value: number | undefined) {
  const envValue = Number(process.env.PUBLIC_LIGHT_SCAN_REQUEST_TIMEOUT_MS ?? "");
  let resolved = DEFAULT_PUBLIC_LIGHT_SCAN_TIMEOUT_MS;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    resolved = value;
  } else if (Number.isFinite(envValue) && envValue > 0) {
    resolved = envValue;
  }

  return Math.max(50, Math.min(15_000, Math.round(resolved)));
}

function fetchWithTimeout(fetcher: typeof fetch, timeoutMs: number, label: string): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      return await fetcher(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${label} timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function normalizedSymbol(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function baseFromSymbol(symbol: string) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function isUsdtPerpLikeSymbol(symbol: string) {
  return symbol.endsWith("USDT") &&
    !symbol.includes("_") &&
    symbol.length > 4 &&
    isCryptoFuturesUnderlying(symbol);
}

async function discoverAllowedSymbols({
  label,
  provider,
}: {
  label: string;
  provider: ReturnType<typeof createBinanceUniverseDiscoveryProvider>;
}): Promise<AllowedSymbolDiscovery> {
  const discovery = await provider.discoverInstruments();

  if (!discovery.ok) {
    throw new Error(`${label} discovery failed: ${discovery.error}`);
  }

  return {
    notes: discovery.notes ?? [],
    requestCount: discovery.requestCount ?? 0,
    symbols: new Set(discovery.instruments.map((instrument) => instrument.symbol)),
    universeCount: discovery.instruments.length,
  };
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

  if (candidate.state === "PRE_TREND" && candidate.volatility <= 5) {
    reasons.push("compression_priority");
  }

  if (Math.abs(candidate.changePercent24h) > 15) {
    reasons.push("overextended_move_capped");
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
  const absChange = Math.abs(candidate.changePercent24h);
  const stateBoost = {
    COLD: 0,
    HOT: 40,
    PRE_TREND: 44,
    WARM: 18,
  }[candidate.state];
  const edgeBoost = candidate.distanceHigh <= 3 || candidate.distanceLow <= 3 ? 12 : 0;
  const compressionBoost = candidate.state === "PRE_TREND" && candidate.volatility <= 5 ? 14 : 0;
  const cappedMoveBoost = Math.min(30, Math.min(absChange, 15) * 2);
  const isPositiveHighExtension = candidate.changePercent24h > 15 && candidate.distanceHigh <= 3;
  const isNegativeLowExtension = candidate.changePercent24h < -15 && candidate.distanceLow <= 3;
  const overextensionPenalty = absChange > 15
    ? Math.min(45, (absChange - 15) * 1.2 + (isPositiveHighExtension || isNegativeLowExtension ? 12 : 0))
    : 0;

  return Math.round(
    stateBoost +
    cappedMoveBoost +
    logVolumeScore(candidate.volume24hUsd) +
    Math.min(15, candidate.volatility) +
    edgeBoost +
    compressionBoost -
    overextensionPenalty,
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
  const sourceTag = `${ticker.exchange.toLowerCase()}-public-light-scan`;

  return {
    id: `${ticker.exchange}-LIGHT:${ticker.symbol}`,
    symbol: ticker.symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: ticker.exchange,
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: ticker.volume24hUsd,
    tags: [sourceTag, "quote:USDT", "market:perpetual"],
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
    price: ticker.price,
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
  requestTimeoutMs,
}: BinancePublicLightScanProviderOptions = {}): PublicLightScanProvider {
  const source = "binance-public-futures-24h";
  const timedFetcher = fetchWithTimeout(fetcher, fetchTimeoutMs(requestTimeoutMs), source);

  return {
    id: source,
    label: "Binance Public Futures Light Scan",

    async scan(): Promise<PublicLightScanResult> {
      const startedAt = now().toISOString();

      try {
        const discovery = await discoverAllowedSymbols({
          label: "binance",
          provider: createBinanceUniverseDiscoveryProvider({ fetcher: timedFetcher, now }),
        });
        const response = await timedFetcher(baseUrl);

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
          .filter((ticker): ticker is MarketTicker =>
            ticker !== null && discovery.symbols.has(ticker.symbol)
          );
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
            notes: [
              `public light scan accepted ${tickers.length}/${payload.length} Binance USDT perpetual tickers`,
              `classified universe ${discovery.universeCount} crypto instruments`,
              ...discovery.notes,
            ],
            requestCount: discovery.requestCount + 1,
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

function buildOkxTickersUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("instType", "SWAP");

  return url;
}

function okxSymbolFromInstId(instId: string) {
  const normalized = instId.trim().toUpperCase();
  const match = /^([A-Z0-9]+)-USDT-SWAP$/u.exec(normalized);

  return match?.[1] ? `${match[1]}USDT` : "";
}

function tickerFromOkxRow(row: OkxSwapTickerRow, updatedAt: string): MarketTicker | null {
  const symbol = okxSymbolFromInstId(row.instId ?? "");

  if (!isUsdtPerpLikeSymbol(symbol)) {
    return null;
  }

  const price = finiteNumber(row.last);
  const high24h = finiteNumber(row.high24h);
  const low24h = finiteNumber(row.low24h);
  const open24h = finiteNumber(row.open24h);
  const baseVolume24h = finiteNumber(row.volCcy24h);

  if (price <= 0 || high24h <= 0 || low24h <= 0) {
    return null;
  }

  return {
    symbol,
    exchange: "OKX",
    price,
    changePercent24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
    volume24hUsd: Math.round(baseVolume24h * price),
    high24h,
    low24h,
    updatedAt,
  };
}

export function createOkxPublicLightScanProvider({
  baseUrl = OKX_PUBLIC_SWAP_TICKERS_URL,
  fetcher = fetch,
  maxPriorityCandidates = 80,
  now = () => new Date(),
  requestTimeoutMs,
}: OkxPublicLightScanProviderOptions = {}): PublicLightScanProvider {
  const source = "okx-public-swap-24h";
  const timedFetcher = fetchWithTimeout(fetcher, fetchTimeoutMs(requestTimeoutMs), source);

  return {
    id: source,
    label: "OKX Public Swap Light Scan",

    async scan(): Promise<PublicLightScanResult> {
      const startedAt = now().toISOString();

      try {
        const discovery = await discoverAllowedSymbols({
          label: "okx",
          provider: createOkxUniverseDiscoveryProvider({ fetcher: timedFetcher, now }),
        });
        const response = await timedFetcher(buildOkxTickersUrl(baseUrl));

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

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("data" in payload) ||
          !Array.isArray(payload.data)
        ) {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: ["public light scan returned an invalid OKX payload"],
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

        if ("code" in payload && String(payload.code) !== "0") {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: [`public light scan upstream returned code ${String(payload.code)}`],
              requestCount: 1,
              source,
              status: "failed",
              topCandidates: [],
              universeCount: payload.data.length,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        }

        const tickers = payload.data
          .map((row: unknown) => (
            typeof row === "object" && row !== null
              ? tickerFromOkxRow(row as OkxSwapTickerRow, startedAt)
              : null
          ))
          .filter((ticker): ticker is MarketTicker =>
            ticker !== null && discovery.symbols.has(ticker.symbol)
          );
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
            notes: [
              `public light scan accepted ${tickers.length}/${payload.data.length} OKX USDT swap tickers`,
              `classified universe ${discovery.universeCount} crypto instruments`,
              ...discovery.notes,
            ],
            requestCount: discovery.requestCount + 1,
            source,
            status: tickers.length > 0 ? "ready" : "partial",
            topCandidates: candidates.slice(0, 16),
            universeCount: payload.data.length,
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

function buildBybitTickersUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("category", "linear");

  return url;
}

function tickerFromBybitRow(row: BybitLinearTickerRow, updatedAt: string): MarketTicker | null {
  const symbol = normalizedSymbol(row.symbol ?? "");

  if (!isUsdtPerpLikeSymbol(symbol)) {
    return null;
  }

  const price = finiteNumber(row.lastPrice);
  const high24h = finiteNumber(row.highPrice24h);
  const low24h = finiteNumber(row.lowPrice24h);

  if (price <= 0 || high24h <= 0 || low24h <= 0) {
    return null;
  }

  return {
    symbol,
    exchange: "BYBIT",
    price,
    changePercent24h: Number((finiteNumber(row.price24hPcnt) * 100).toFixed(2)),
    volume24hUsd: finiteNumber(row.turnover24h),
    high24h,
    low24h,
    updatedAt,
  };
}

export function createBybitPublicLightScanProvider({
  baseUrl = BYBIT_PUBLIC_LINEAR_TICKERS_URL,
  fetcher = fetch,
  maxPriorityCandidates = 80,
  now = () => new Date(),
  requestTimeoutMs,
}: BybitPublicLightScanProviderOptions = {}): PublicLightScanProvider {
  const source = "bybit-public-linear-24h";
  const timedFetcher = fetchWithTimeout(fetcher, fetchTimeoutMs(requestTimeoutMs), source);

  return {
    id: source,
    label: "Bybit Public Linear Light Scan",

    async scan(): Promise<PublicLightScanResult> {
      const startedAt = now().toISOString();

      try {
        const discovery = await discoverAllowedSymbols({
          label: "bybit",
          provider: createBybitUniverseDiscoveryProvider({ fetcher: timedFetcher, now }),
        });
        const response = await timedFetcher(buildBybitTickersUrl(baseUrl));

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

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("result" in payload) ||
          typeof payload.result !== "object" ||
          payload.result === null ||
          !("list" in payload.result) ||
          !Array.isArray(payload.result.list)
        ) {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: ["public light scan returned an invalid Bybit payload"],
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

        if ("retCode" in payload && Number(payload.retCode) !== 0) {
          return {
            diagnostics: {
              acceptedCount: 0,
              candidateCount: 0,
              generatedAt: startedAt,
              notes: [`public light scan upstream returned retCode ${Number(payload.retCode)}`],
              requestCount: 1,
              source,
              status: "failed",
              topCandidates: [],
              universeCount: payload.result.list.length,
            },
            instruments: [],
            priorityCandidates: [],
            tickers: [],
          };
        }

        const tickers = payload.result.list
          .map((row: unknown) => (
            typeof row === "object" && row !== null
              ? tickerFromBybitRow(row as BybitLinearTickerRow, startedAt)
              : null
          ))
          .filter((ticker): ticker is MarketTicker =>
            ticker !== null && discovery.symbols.has(ticker.symbol)
          );
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
            notes: [
              `public light scan accepted ${tickers.length}/${payload.result.list.length} Bybit USDT linear tickers`,
              `classified universe ${discovery.universeCount} crypto instruments`,
              ...discovery.notes,
            ],
            requestCount: discovery.requestCount + 1,
            source,
            status: tickers.length > 0 ? "ready" : "partial",
            topCandidates: candidates.slice(0, 16),
            universeCount: payload.result.list.length,
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

function compositeStatus(results: PublicLightScanResult[]): ScanLightScanDiagnostics["status"] {
  const activeResults = results.filter((result) => result.diagnostics.status !== "disabled");
  const acceptedCount = results.reduce((total, result) => total + result.diagnostics.acceptedCount, 0);

  if (activeResults.length === 0) {
    return "disabled";
  }

  if (acceptedCount === 0) {
    return activeResults.some((result) => result.diagnostics.status === "failed") ? "failed" : "partial";
  }

  return activeResults.every((result) => result.diagnostics.status === "ready") ? "ready" : "partial";
}

function mergeCompositeCandidates(
  candidates: ScanLightScanCandidate[],
  maxPriorityCandidates: number,
): ScanLightScanCandidate[] {
  const bySymbol = new Map<string, ScanLightScanCandidate & { sourceCount: number }>();

  for (const candidate of candidates) {
    const existing = bySymbol.get(candidate.symbol);

    if (!existing) {
      bySymbol.set(candidate.symbol, {
        ...candidate,
        sourceCount: 1,
      });
      continue;
    }

    existing.sourceCount += 1;
    existing.score = Math.max(existing.score, candidate.score) + 8;
    existing.volume24hUsd = Math.max(existing.volume24hUsd, candidate.volume24hUsd);
    existing.reasons = [...new Set([
      ...existing.reasons,
      ...candidate.reasons,
      "cross_exchange_light_scan",
    ])];

    if (
      candidate.state === "HOT" ||
      (candidate.state === "PRE_TREND" && existing.state !== "HOT")
    ) {
      existing.state = candidate.state;
    }
  }

  return [...bySymbol.values()]
    .sort((left, right) => right.score - left.score || right.volume24hUsd - left.volume24hUsd)
    .slice(0, maxPriorityCandidates)
    .map((candidate) => ({
      baseAsset: candidate.baseAsset,
      changePercent24h: candidate.changePercent24h,
      distanceFromHighPercent: candidate.distanceFromHighPercent,
      distanceFromLowPercent: candidate.distanceFromLowPercent,
      price: candidate.price,
      reasons: candidate.reasons,
      score: candidate.score,
      state: candidate.state,
      symbol: candidate.symbol,
      volume24hUsd: candidate.volume24hUsd,
      volatilityPercent: candidate.volatilityPercent,
    }));
}

export function createCompositePublicLightScanProvider({
  maxPriorityCandidates = 100,
  providers = [
    createBinancePublicLightScanProvider({ maxPriorityCandidates }),
    createOkxPublicLightScanProvider({ maxPriorityCandidates }),
    createBybitPublicLightScanProvider({ maxPriorityCandidates }),
  ],
}: CompositePublicLightScanProviderOptions = {}): PublicLightScanProvider {
  const source = "public-light-composite";

  return {
    id: source,
    label: "Composite Public Futures Light Scan",

    async scan(): Promise<PublicLightScanResult> {
      const results = await Promise.all(providers.map((provider) => provider.scan()));
      const generatedAt = results[0]?.diagnostics.generatedAt ?? new Date().toISOString();
      const instruments = [...new Map(
        results.flatMap((result) => result.instruments).map((instrument) => [instrument.id, instrument]),
      ).values()];
      const tickers = results.flatMap((result) => result.tickers);
      const priorityCandidates = mergeCompositeCandidates(
        results.flatMap((result) => result.priorityCandidates),
        maxPriorityCandidates,
      );
      const requestCount = results.reduce((total, result) => total + result.diagnostics.requestCount, 0);
      const acceptedCount = new Set(instruments.map((instrument) => `${instrument.exchange}:${instrument.symbol}`)).size;
      const universeCount = results.reduce((total, result) => total + result.diagnostics.universeCount, 0);

      return {
        diagnostics: {
          acceptedCount,
          candidateCount: priorityCandidates.length,
          generatedAt,
          notes: [
            ...results.map((result) =>
              `${result.diagnostics.source} ${result.diagnostics.status} ${result.diagnostics.acceptedCount}/${result.diagnostics.universeCount} accepted`
            ),
            ...results.flatMap((result) =>
              result.diagnostics.notes.map((note) => `${result.diagnostics.source}: ${note}`)
            ),
          ],
          requestCount,
          source,
          status: compositeStatus(results),
          topCandidates: priorityCandidates.slice(0, 16),
          universeCount,
        },
        instruments,
        priorityCandidates,
        tickers,
      };
    },
  };
}
