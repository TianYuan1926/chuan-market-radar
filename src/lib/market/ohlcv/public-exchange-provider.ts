import type {
  Candle,
  OhlcvInterval,
  OhlcvProvider,
  OhlcvProviderFailure,
  OhlcvProviderResult,
  OhlcvRequest,
} from "./types";

export const BINANCE_FUTURES_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
export const OKX_SWAP_CANDLES_URL = "https://www.okx.com/api/v5/market/candles";
export const BYBIT_LINEAR_KLINES_URL = "https://api.bybit.com/v5/market/kline";
export const DEFAULT_PUBLIC_OHLCV_TIMEOUT_MS = 4_000;

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

export const okxIntervalMap: Record<OhlcvInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};

export const bybitIntervalMap: Record<OhlcvInterval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D",
  "1w": "W",
};

export type PublicExchangeOhlcvProviderOptions = {
  baseUrl?: string;
  bybitBaseUrl?: string;
  fetcher?: typeof fetch;
  okxBaseUrl?: string;
  requestTimeoutMs?: number;
};

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function fetchTimeoutMs(value: number | undefined) {
  const envValue = Number(process.env.PUBLIC_OHLCV_REQUEST_TIMEOUT_MS ?? "");
  let resolved = DEFAULT_PUBLIC_OHLCV_TIMEOUT_MS;

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

function isoTime(value: unknown) {
  const timestamp = finiteNumber(value);

  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function intervalMs(interval: OhlcvInterval) {
  const minutes: Record<OhlcvInterval, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1_440,
    "1w": 10_080,
  };

  return minutes[interval] * 60_000;
}

function closeTimeFromOpen(openTime: string, interval: OhlcvInterval) {
  const timestamp = Date.parse(openTime);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp + intervalMs(interval) - 1).toISOString();
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

export function normalizeOkxCandle(row: unknown, interval: OhlcvInterval): Candle | null {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }

  const openTime = isoTime(row[0]);
  const open = finiteNumber(row[1]);
  const high = finiteNumber(row[2]);
  const low = finiteNumber(row[3]);
  const close = finiteNumber(row[4]);
  const volume = finiteNumber(row[7] ?? row[6] ?? row[5]);
  const closeTime = openTime ? closeTimeFromOpen(openTime, interval) : null;

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

export function normalizeBybitKline(row: unknown, interval: OhlcvInterval): Candle | null {
  if (!Array.isArray(row) || row.length < 6) {
    return null;
  }

  const openTime = isoTime(row[0]);
  const open = finiteNumber(row[1]);
  const high = finiteNumber(row[2]);
  const low = finiteNumber(row[3]);
  const close = finiteNumber(row[4]);
  const volume = finiteNumber(row[5]);
  const closeTime = openTime ? closeTimeFromOpen(openTime, interval) : null;

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

function okxInstrumentId(symbol: string) {
  const normalized = normalizedSymbol(symbol);

  return normalized.endsWith("USDT")
    ? `${normalized.slice(0, -4)}-USDT-SWAP`
    : `${normalized}-USDT-SWAP`;
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

function okxRequestUrl(baseUrl: string, request: OhlcvRequest) {
  const params = new URLSearchParams({
    instId: okxInstrumentId(request.symbol),
    bar: okxIntervalMap[request.interval],
    limit: String(request.limit ?? 200),
  });

  return `${baseUrl}?${params.toString()}`;
}

function bybitRequestUrl(baseUrl: string, request: OhlcvRequest) {
  const params = new URLSearchParams({
    category: "linear",
    symbol: normalizedSymbol(request.symbol),
    interval: bybitIntervalMap[request.interval],
    limit: String(request.limit ?? 200),
  });

  return `${baseUrl}?${params.toString()}`;
}

function sortCandles(candles: Candle[]) {
  return [...candles].sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime));
}

function normalizeBinancePayload(payload: unknown) {
  if (!Array.isArray(payload)) {
    return null;
  }

  const candles = payload.map((row) => normalizeBinanceKline(row));

  return candles.some((candle) => candle === null) ? null : sortCandles(candles as Candle[]);
}

function normalizeOkxPayload(payload: unknown, interval: OhlcvInterval) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray((payload as { data?: unknown }).data)
  ) {
    return null;
  }

  const okxPayload = payload as { code?: unknown; data: unknown[] };

  if (String(okxPayload.code ?? "0") !== "0") {
    return null;
  }

  const candles = okxPayload.data.map((row) => normalizeOkxCandle(row, interval));

  return candles.some((candle) => candle === null) ? null : sortCandles(candles as Candle[]);
}

function normalizeBybitPayload(payload: unknown, interval: OhlcvInterval) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("result" in payload)
  ) {
    return null;
  }

  const bybitPayload = payload as { retCode?: unknown; result?: { list?: unknown } };

  if (Number(bybitPayload.retCode ?? 0) !== 0 || !Array.isArray(bybitPayload.result?.list)) {
    return null;
  }

  const candles = bybitPayload.result.list.map((row) => normalizeBybitKline(row, interval));

  return candles.some((candle) => candle === null) ? null : sortCandles(candles as Candle[]);
}

async function requestCandles({
  fetcher,
  interval,
  normalize,
  source,
  symbol,
  url,
}: {
  fetcher: typeof fetch;
  interval: OhlcvInterval;
  normalize: (payload: unknown, interval: OhlcvInterval) => Candle[] | null;
  source: string;
  symbol: string;
  url: string;
}): Promise<OhlcvProviderResult> {
  try {
    const response = await fetcher(url);

    if (!response.ok) {
      return failure({
        ok: false,
        source,
        symbol,
        interval,
        reason: "upstream_error",
        error: `OHLCV upstream returned ${response.status}`,
        status: response.status,
      });
    }

    const payload: unknown = await response.json();
    const candles = normalize(payload, interval);

    if (!candles || candles.length === 0) {
      return failure({
        ok: false,
        source,
        symbol,
        interval,
        reason: "invalid_response",
        error: "OHLCV upstream returned invalid candle data",
      });
    }

    return {
      ok: true,
      source,
      symbol,
      interval,
      candles,
    };
  } catch (error) {
    return failure({
      ok: false,
      source,
      symbol,
      interval,
      reason: "network_error",
      error: error instanceof Error ? error.message : "OHLCV request failed",
    });
  }
}

export function createPublicExchangeOhlcvProvider({
  baseUrl = BINANCE_FUTURES_KLINES_URL,
  bybitBaseUrl = BYBIT_LINEAR_KLINES_URL,
  fetcher = fetch,
  okxBaseUrl = OKX_SWAP_CANDLES_URL,
  requestTimeoutMs,
}: PublicExchangeOhlcvProviderOptions = {}): OhlcvProvider {
  const timedFetcher = fetchWithTimeout(fetcher, fetchTimeoutMs(requestTimeoutMs), "public-exchange-ohlcv");

  return {
    id: "public-exchange-ohlcv",
    label: "Public Futures OHLCV Cascade",

    async fetchCandles(request): Promise<OhlcvProviderResult> {
      const symbol = normalizedSymbol(request.symbol);
      const attempts = [
        {
          normalize: (payload: unknown) => normalizeBinancePayload(payload),
          source: "binance-public-futures",
          url: requestUrl(baseUrl, { ...request, symbol }),
        },
        {
          normalize: normalizeOkxPayload,
          source: "okx-public-swap",
          url: okxRequestUrl(okxBaseUrl, { ...request, symbol }),
        },
        {
          normalize: normalizeBybitPayload,
          source: "bybit-public-linear",
          url: bybitRequestUrl(bybitBaseUrl, { ...request, symbol }),
        },
      ];
      const failures: OhlcvProviderFailure[] = [];

      for (const attempt of attempts) {
        const result = await requestCandles({
          fetcher: timedFetcher,
          interval: request.interval,
          normalize: attempt.normalize,
          source: attempt.source,
          symbol,
          url: attempt.url,
        });

        if (result.ok) {
          return result;
        }

        failures.push(result);
      }

      return failure({
        ok: false,
        source: "public-exchange-ohlcv",
        symbol,
        interval: request.interval,
        reason: failures.some((item) => item.reason === "network_error") ? "network_error" : failures[0]?.reason ?? "upstream_error",
        error: failures.map((item) => `${item.source}:${item.reason}:${item.error}`).join("; "),
        status: failures.find((item) => item.status)?.status,
      });
    },
  };
}
