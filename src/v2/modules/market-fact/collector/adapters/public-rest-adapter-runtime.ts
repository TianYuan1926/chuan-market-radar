import { fetchBinanceCatalog } from "../../../universe/adapters/binance-catalog";
import { fetchBybitCatalog } from "../../../universe/adapters/bybit-catalog";
import { fetchOkxCatalog } from "../../../universe/adapters/okx-catalog";
import type { PublicJsonTransport } from "../../../universe/public-json-transport";
import { fetchBinanceMarkPrices } from "../../adapters/binance-mark-price";
import { fetchBybitMarkPrices } from "../../adapters/bybit-mark-price";
import { fetchOkxMarkPrices } from "../../adapters/okx-mark-price";
import type {
  CollectorAdapterRuntime,
  CollectorClock,
  CollectorRequestPolicy,
} from "../contracts";
import { CollectorRequestGovernor } from "./request-governor";

export const M1_COLLECTOR_DEFAULT_REQUEST_POLICY: CollectorRequestPolicy =
  Object.freeze({
    globalMaxConcurrentRequests: 2,
    maxQueueDepth: 16,
    maxQueueWaitMs: 10_000,
    providerBudgets: Object.freeze({
      BINANCE_FUTURES: Object.freeze({
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 20,
        windowMs: 60_000,
      }),
      OKX_SWAP: Object.freeze({
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 20,
        windowMs: 60_000,
      }),
      BYBIT_LINEAR_PERPETUAL: Object.freeze({
        maxConcurrentRequests: 1,
        maxRequestsPerWindow: 64,
        windowMs: 60_000,
      }),
    }),
  });

export function createPublicRestCollectorAdapterRuntime(input: {
  clock: CollectorClock;
  policy?: CollectorRequestPolicy;
  transport: PublicJsonTransport;
}): CollectorAdapterRuntime {
  const requestControl = new CollectorRequestGovernor({
    clock: input.clock,
    delegate: input.transport,
    policy: input.policy ?? M1_COLLECTOR_DEFAULT_REQUEST_POLICY,
  });

  return Object.freeze({
    adapters: Object.freeze([
      Object.freeze({
        venue: "BINANCE_FUTURES" as const,
        fetchCatalog: () =>
          fetchBinanceCatalog(requestControl.transportFor("BINANCE_FUTURES")),
        fetchPriceSnapshots: () =>
          fetchBinanceMarkPrices(
            requestControl.transportFor("BINANCE_FUTURES"),
          ),
      }),
      Object.freeze({
        venue: "OKX_SWAP" as const,
        fetchCatalog: () =>
          fetchOkxCatalog(requestControl.transportFor("OKX_SWAP")),
        fetchPriceSnapshots: () =>
          fetchOkxMarkPrices(requestControl.transportFor("OKX_SWAP")),
      }),
      Object.freeze({
        venue: "BYBIT_LINEAR_PERPETUAL" as const,
        fetchCatalog: () =>
          fetchBybitCatalog(
            requestControl.transportFor("BYBIT_LINEAR_PERPETUAL"),
          ),
        fetchPriceSnapshots: () =>
          fetchBybitMarkPrices(
            requestControl.transportFor("BYBIT_LINEAR_PERPETUAL"),
          ),
      }),
    ]),
    requestControl,
  });
}
