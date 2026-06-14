import type { ContractInstrument } from "../types";
import type {
  UniverseDiscoveryFailure,
  UniverseDiscoveryProvider,
  UniverseDiscoveryResult,
} from "./binance-universe-discovery";

export const BYBIT_LINEAR_INSTRUMENTS_URL = "https://api.bybit.com/v5/market/instruments-info";

export type BybitInstrumentRow = {
  baseCoin?: string;
  contractType?: string;
  quoteCoin?: string;
  status?: string;
  symbol?: string;
};

export type BybitUniverseDiscoveryProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  maxPages?: number;
  now?: () => Date;
};

function normalizeSymbolPart(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function normalizeBybitValue(value: string) {
  return value.trim().toUpperCase();
}

function failure(fields: Omit<UniverseDiscoveryFailure, "ok">): UniverseDiscoveryFailure {
  return {
    ok: false,
    ...fields,
  };
}

function buildBybitInstrumentsUrl(baseUrl: string, cursor?: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("category", "linear");
  url.searchParams.set("limit", "1000");

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return url;
}

export function normalizeBybitInstrument(
  row: BybitInstrumentRow,
  observedAt: string,
): ContractInstrument | null {
  const symbol = normalizeSymbolPart(row.symbol ?? "");
  const baseAsset = normalizeSymbolPart(row.baseCoin ?? "");
  const quoteAsset = normalizeSymbolPart(row.quoteCoin ?? "");
  const contractType = normalizeBybitValue(row.contractType ?? "");
  const status = normalizeBybitValue(row.status ?? "");

  if (
    !symbol ||
    !baseAsset ||
    quoteAsset !== "USDT" ||
    contractType !== "LINEARPERPETUAL" ||
    status !== "TRADING" ||
    symbol !== `${baseAsset}USDT`
  ) {
    return null;
  }

  return {
    id: `BYBIT:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "BYBIT",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["bybit-public-linear", "contractType:LinearPerpetual", "status:Trading"],
    lastSeenAt: observedAt,
  };
}

export function createBybitUniverseDiscoveryProvider({
  baseUrl = BYBIT_LINEAR_INSTRUMENTS_URL,
  fetcher = fetch,
  maxPages = 5,
  now = () => new Date(),
}: BybitUniverseDiscoveryProviderOptions = {}): UniverseDiscoveryProvider {
  const source = "bybit-public-linear";

  return {
    id: source,
    label: "Bybit Public Linear Universe Discovery",

    async discoverInstruments(): Promise<UniverseDiscoveryResult> {
      const observedAt = now().toISOString();
      const instruments: ContractInstrument[] = [];
      let cursor = "";
      let requestCount = 0;

      try {
        for (let page = 0; page < maxPages; page += 1) {
          requestCount += 1;
          const response = await fetcher(buildBybitInstrumentsUrl(baseUrl, cursor));

          if (!response.ok) {
            return failure({
              source,
              reason: "upstream_error",
              error: `Universe discovery upstream returned ${response.status}`,
              requestCount,
              status: response.status,
            });
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
            return failure({
              source,
              reason: "invalid_response",
              error: "Universe discovery upstream returned an invalid instruments payload",
              requestCount,
            });
          }

          if ("retCode" in payload && Number(payload.retCode) !== 0) {
            return failure({
              source,
              reason: "upstream_error",
              error: `Universe discovery upstream returned retCode ${String(payload.retCode)}`,
              requestCount,
            });
          }

          instruments.push(...payload.result.list
            .map((row: unknown) => (
              typeof row === "object" && row !== null
                ? normalizeBybitInstrument(row as BybitInstrumentRow, observedAt)
                : null
            ))
            .filter((item): item is ContractInstrument => item !== null));

          const nextCursor = "nextPageCursor" in payload.result
            ? String(payload.result.nextPageCursor ?? "")
            : "";

          if (!nextCursor || nextCursor === cursor) {
            break;
          }

          cursor = nextCursor;
        }

        return {
          ok: true,
          source,
          instruments,
          requestCount,
        };
      } catch (error) {
        return failure({
          source,
          reason: "network_error",
          error: error instanceof Error ? error.message : "Universe discovery request failed",
          requestCount,
        });
      }
    },
  };
}
