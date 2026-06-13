import type {
  Candle,
  OhlcvInterval,
  OhlcvProvider,
  OhlcvProviderFailure,
  OhlcvProviderResult,
  OhlcvRequest,
} from "./types";

export const BINANCE_FUTURES_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";

export const binanceIntervalMap: Record<OhlcvInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

export type PublicExchangeOhlcvProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function isoTime(value: unknown) {
  const timestamp = finiteNumber(value);

  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeBinanceKline(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 7) {
    return null;
  }

  const openTime = isoTime(row[0]);
  const open = finiteNumber(row[1]);
  const high = finiteNumber(row[2]);
  const low = finiteNumber(row[3]);
  const close = finiteNumber(row[4]);
  const volume = finiteNumber(row[5]);
  const closeTime = isoTime(row[6]);

  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null ||
    closeTime === null
  ) {
    return null;
  }

  return {
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime,
  };
}

function normalizedSymbol(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function failure({
  error,
  interval,
  reason,
  source,
  status,
  symbol,
}: OhlcvProviderFailure): OhlcvProviderFailure {
  return {
    ok: false,
    source,
    symbol,
    interval,
    reason,
    error,
    status,
  };
}

function requestUrl(baseUrl: string, request: OhlcvRequest) {
  const params = new URLSearchParams({
    symbol: normalizedSymbol(request.symbol),
    interval: binanceIntervalMap[request.interval],
    limit: String(request.limit ?? 200),
  });

  return `${baseUrl}?${params.toString()}`;
}

export function createPublicExchangeOhlcvProvider({
  baseUrl = BINANCE_FUTURES_KLINES_URL,
  fetcher = fetch,
}: PublicExchangeOhlcvProviderOptions = {}): OhlcvProvider {
  const source = "binance-public-futures";

  return {
    id: source,
    label: "Binance Public Futures OHLCV",

    async fetchCandles(request): Promise<OhlcvProviderResult> {
      const symbol = normalizedSymbol(request.symbol);

      try {
        const response = await fetcher(requestUrl(baseUrl, { ...request, symbol }));

        if (!response.ok) {
          return failure({
            ok: false,
            source,
            symbol,
            interval: request.interval,
            reason: "upstream_error",
            error: `OHLCV upstream returned ${response.status}`,
            status: response.status,
          });
        }

        const payload: unknown = await response.json();

        if (!Array.isArray(payload)) {
          return failure({
            ok: false,
            source,
            symbol,
            interval: request.interval,
            reason: "invalid_response",
            error: "OHLCV upstream returned a non-array payload",
          });
        }

        const candles = payload.map((row) => normalizeBinanceKline(row));

        if (candles.some((candle) => candle === null)) {
          return failure({
            ok: false,
            source,
            symbol,
            interval: request.interval,
            reason: "invalid_response",
            error: "OHLCV upstream returned invalid candle data",
          });
        }

        return {
          ok: true,
          source,
          symbol,
          interval: request.interval,
          candles: candles as Candle[],
        };
      } catch (error) {
        return failure({
          ok: false,
          source,
          symbol,
          interval: request.interval,
          reason: "network_error",
          error: error instanceof Error ? error.message : "OHLCV request failed",
        });
      }
    },
  };
}
