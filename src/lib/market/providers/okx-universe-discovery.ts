import type { ContractInstrument } from "../types";
import { recordConfiguredDataSourceLatency } from "../../runtime/api-observability";
import type {
  UniverseDiscoveryFailure,
  UniverseDiscoveryProvider,
  UniverseDiscoveryResult,
} from "./binance-universe-discovery";

export const OKX_PUBLIC_INSTRUMENTS_URL = "https://www.okx.com/api/v5/public/instruments";

export type OkxInstrumentRow = {
  baseCcy?: string;
  ctType?: string;
  instCategory?: string;
  instId?: string;
  instType?: string;
  quoteCcy?: string;
  ruleType?: string;
  settleCcy?: string;
  state?: string;
};

export type OkxUniverseDiscoveryProviderOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
};

function normalizeSymbolPart(value: string) {
  return value.trim().toUpperCase().replace("/", "").replace("-", "");
}

function normalizeOkxState(value: string) {
  return value.trim().toLowerCase();
}

function parseOkxUsdtSwapInstId(instId: string) {
  const match = /^([A-Z0-9]+)-USDT-SWAP$/u.exec(instId.trim().toUpperCase());

  return match?.[1] ?? "";
}

function failure(fields: Omit<UniverseDiscoveryFailure, "ok">): UniverseDiscoveryFailure {
  return {
    ok: false,
    ...fields,
  };
}

function buildOkxInstrumentsUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("instType", "SWAP");

  return url;
}

export function normalizeOkxInstrument(
  row: OkxInstrumentRow,
  observedAt: string,
): ContractInstrument | null {
  const instId = row.instId?.trim().toUpperCase() ?? "";
  const baseAsset = normalizeSymbolPart(row.baseCcy ?? "") || parseOkxUsdtSwapInstId(instId);
  const quoteAsset = normalizeSymbolPart(row.quoteCcy ?? "") || (parseOkxUsdtSwapInstId(instId) ? "USDT" : "");
  const settleAsset = normalizeSymbolPart(row.settleCcy ?? "");
  const instType = normalizeSymbolPart(row.instType ?? "");
  const instCategory = normalizeSymbolPart(row.instCategory ?? "");
  const ctType = normalizeOkxState(row.ctType ?? "");
  const ruleType = normalizeOkxState(row.ruleType ?? "");
  const state = normalizeOkxState(row.state ?? "");
  const symbol = `${baseAsset}${quoteAsset}`;

  if (
    !baseAsset ||
    quoteAsset !== "USDT" ||
    settleAsset !== "USDT" ||
    instType !== "SWAP" ||
    instCategory !== "1" ||
    ctType !== "linear" ||
    ruleType === "pre_market" ||
    state !== "live" ||
    instId !== `${baseAsset}-USDT-SWAP`
  ) {
    return null;
  }

  return {
    id: `OKX:${symbol}`,
    symbol,
    baseAsset,
    quoteAsset: "USDT",
    exchange: "OKX",
    marketType: "perpetual",
    isActive: true,
    volume24hUsd: 0,
    tags: ["okx-public-swap", "instType:SWAP", "instCategory:1", "ctType:linear", "state:live"],
    lastSeenAt: observedAt,
  };
}

export function createOkxUniverseDiscoveryProvider({
  baseUrl = OKX_PUBLIC_INSTRUMENTS_URL,
  fetcher = fetch,
  now = () => new Date(),
}: OkxUniverseDiscoveryProviderOptions = {}): UniverseDiscoveryProvider {
  const source = "okx-public-swap";

  return {
    id: source,
    label: "OKX Public Swap Universe Discovery",

    async discoverInstruments(): Promise<UniverseDiscoveryResult> {
      const startedAt = Date.now();

      try {
        const response = await fetcher(buildOkxInstrumentsUrl(baseUrl));

        void recordConfiguredDataSourceLatency({
          elapsedMs: Date.now() - startedAt,
          source: "okx",
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
          !("data" in payload) ||
          !Array.isArray(payload.data)
        ) {
          return failure({
            source,
            reason: "invalid_response",
            error: "Universe discovery upstream returned an invalid instruments payload",
            requestCount: 1,
          });
        }

        if ("code" in payload && String(payload.code) !== "0") {
          return failure({
            source,
            reason: "upstream_error",
            error: `Universe discovery upstream returned code ${String(payload.code)}`,
            requestCount: 1,
          });
        }

        const observedAt = now().toISOString();
        const instruments = payload.data
          .map((row: unknown) => (
            typeof row === "object" && row !== null
              ? normalizeOkxInstrument(row as OkxInstrumentRow, observedAt)
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
          source: "okx",
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
