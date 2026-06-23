import type { ContractInstrument, ScanDiscoverySourceDiagnostic } from "../types";
import { recordConfiguredDataSourceLatency } from "../../runtime/api-observability";
import { isCryptoFuturesUnderlying } from "../asset-class-filter";

export const BINANCE_FUTURES_EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";

export type BinanceExchangeInfoSymbol = {
  baseAsset?: string;
  contractType?: string;
  underlyingType?: string;
  pair?: string;
  quoteAsset?: string;
  status?: string;
  symbol?: string;
};

export type UniverseDiscoverySuccess = {
  ok: true;
  source: string;
  diagnostics?: ScanDiscoverySourceDiagnostic[];
  fallbackActivated?: boolean;
  fallbackInstrumentCount?: number;
  instruments: ContractInstrument[];
  liveInstrumentCount?: number;
  notes?: string[];
  requestCount?: number;
};

export type UniverseDiscoveryFailure = {
  ok: false;
  source: string;
  diagnostics?: ScanDiscoverySourceDiagnostic[];
  reason: "upstream_error" | "invalid_response" | "network_error";
  error: string;
  notes?: string[];
  requestCount?: number;
  status?: number;
};

export type UniverseDiscoveryResult = UniverseDiscoverySuccess | UniverseDiscoveryFailure;

export type UniverseDiscoveryProvider = {
  id: string;
  label: string;
  discoverInstruments: () => Promise<UniverseDiscoveryResult>;
};

export type BinanceUniverseDiscoveryProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
};

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function isDatedOrDeliverySymbol(symbol: string, contractType: string) {
  return contractType !== "PERPETUAL" || /_\d{6}$/u.test(symbol);
}

function failure(fields: Omit<UniverseDiscoveryFailure, "ok">): UniverseDiscoveryFailure {
  return {
    ok: false,
    ...fields,
  };
}

export function normalizeBinanceExchangeInfoSymbol(
  row: BinanceExchangeInfoSymbol,
  observedAt: string,
): ContractInstrument | null {
  const symbol = normalizeSymbol(row.symbol ?? "");
  const baseAsset = normalizeSymbol(row.baseAsset ?? "");
  const quoteAsset = normalizeSymbol(row.quoteAsset ?? "");
  const contractType = normalizeSymbol(row.contractType ?? "");
  const status = normalizeSymbol(row.status ?? "");
  const underlyingType = normalizeSymbol(row.underlyingType ?? "");

  if (
    !symbol ||
    !baseAsset ||
    quoteAsset !== "USDT" ||
    status !== "TRADING" ||
    underlyingType !== "COIN" ||
    !isCryptoFuturesUnderlying(baseAsset) ||
    isDatedOrDeliverySymbol(symbol, contractType) ||
    symbol !== `${baseAsset}USDT`
  ) {
    return null;
  }

  return {
    id: `BINANCE:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BINANCE",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["binance-public-futures", "contract:PERPETUAL", "status:TRADING"],
    lastSeenAt: observedAt,
  };
}

export function createBinanceUniverseDiscoveryProvider({
  baseUrl = BINANCE_FUTURES_EXCHANGE_INFO_URL,
  fetcher = fetch,
  now = () => new Date(),
}: BinanceUniverseDiscoveryProviderOptions = {}): UniverseDiscoveryProvider {
  const source = "binance-public-futures";

  return {
    id: source,
    label: "Binance Public Futures Universe Discovery",

    async discoverInstruments(): Promise<UniverseDiscoveryResult> {
      const startedAt = Date.now();

      try {
        const response = await fetcher(baseUrl);

        void recordConfiguredDataSourceLatency({
          elapsedMs: Date.now() - startedAt,
          source: "binance",
        });

        if (!response.ok) {
          return failure({
            source,
            reason: "upstream_error",
            error: `Universe discovery upstream returned ${response.status}`,
            requestCount: 1,
            status: response.status,
          });
        }

        const payload: unknown = await response.json();

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("symbols" in payload) ||
          !Array.isArray(payload.symbols)
        ) {
          return failure({
            source,
            reason: "invalid_response",
            error: "Universe discovery upstream returned an invalid exchangeInfo payload",
            requestCount: 1,
          });
        }

        const observedAt = now().toISOString();
        const instruments = payload.symbols
          .map((row: unknown) => (
            typeof row === "object" && row !== null
              ? normalizeBinanceExchangeInfoSymbol(row as BinanceExchangeInfoSymbol, observedAt)
              : null
          ))
          .filter((item): item is ContractInstrument => item !== null);

        return {
          ok: true,
          source,
          instruments,
          requestCount: 1,
        };
      } catch (error) {
        void recordConfiguredDataSourceLatency({
          elapsedMs: Date.now() - startedAt,
          source: "binance",
        });

        return failure({
          source,
          reason: "network_error",
          error: error instanceof Error ? error.message : "Universe discovery request failed",
          requestCount: 1,
        });
      }
    },
  };
}
