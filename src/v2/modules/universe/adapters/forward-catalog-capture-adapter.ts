import type { TargetVenue } from "../../../domain/product-constitution";
import { stableContentHash } from "../stable-artifact";
import { fetchBinanceCatalog } from "./binance-catalog";
import { fetchBybitCatalog } from "./bybit-catalog";
import { fetchOkxCatalog } from "./okx-catalog";
import type { VenueCatalogResult } from "../catalog-types";
import {
  createPublicJsonTransport,
  type PublicJsonRequest,
  type PublicJsonTransport,
} from "../public-json-transport";

export type ForwardInstrumentProviderId =
  | "BINANCE_USDS_FUTURES"
  | "OKX_SWAP"
  | "BYBIT_LINEAR_PERPETUAL";

export type CapturedCatalogPage = Readonly<{
  bodyBytes: number;
  bodyDigest: string;
  providerId: ForwardInstrumentProviderId;
  rawBody: Uint8Array;
  receivedAt: string;
  requestId: string;
  requestSequence: number;
  requestUrl: string;
  status: number;
}>;

export type CatalogRequestFailure = Readonly<{
  providerId: ForwardInstrumentProviderId;
  reasonCode: string;
  receivedAt: string;
  requestId: string;
  requestSequence: number;
  requestUrl: string;
  status: number | null;
}>;

export type ForwardCatalogCaptureAttempt = Readonly<{
  catalog: VenueCatalogResult;
  completedAt: string;
  pages: readonly CapturedCatalogPage[];
  providerId: ForwardInstrumentProviderId;
  requestCount: number;
  requestFailures: readonly CatalogRequestFailure[];
  startedAt: string;
  venue: TargetVenue;
}>;

type FetchCatalog = (transport: PublicJsonTransport) => Promise<VenueCatalogResult>;

const CAPTURE_DEFINITIONS: readonly Readonly<{
  fetchCatalog: FetchCatalog;
  providerId: ForwardInstrumentProviderId;
  venue: TargetVenue;
}>[] = [
  {
    fetchCatalog: fetchBinanceCatalog,
    providerId: "BINANCE_USDS_FUTURES",
    venue: "BINANCE_FUTURES",
  },
  {
    fetchCatalog: fetchOkxCatalog,
    providerId: "OKX_SWAP",
    venue: "OKX_SWAP",
  },
  {
    fetchCatalog: (transport) => fetchBybitCatalog(transport),
    providerId: "BYBIT_LINEAR_PERPETUAL",
    venue: "BYBIT_LINEAR_PERPETUAL",
  },
] as const;

const PROVIDER_HOSTS: Readonly<Record<ForwardInstrumentProviderId, string>> =
  Object.freeze({
    BINANCE_USDS_FUTURES: "fapi.binance.com",
    OKX_SWAP: "www.okx.com",
    BYBIT_LINEAR_PERPETUAL: "api.bybit.com",
  });

export function forwardProviderOwnsRequest(
  providerId: ForwardInstrumentProviderId,
  requestUrl: string,
): boolean {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" &&
      url.hostname === PROVIDER_HOSTS[providerId] &&
      url.username === "" &&
      url.password === "";
  } catch {
    return false;
  }
}

function requestId(input: Readonly<{
  providerId: ForwardInstrumentProviderId;
  request: PublicJsonRequest;
  requestSequence: number;
}>): string {
  return stableContentHash({
    providerId: input.providerId,
    requestSequence: input.requestSequence,
    requestUrl: input.request.url,
  });
}

async function captureCatalog(input: Readonly<{
  definition: typeof CAPTURE_DEFINITIONS[number];
  fetchImplementation: typeof fetch;
  now: () => Date;
}>): Promise<ForwardCatalogCaptureAttempt> {
  const startedAt = input.now().toISOString();
  const pages: CapturedCatalogPage[] = [];
  const requestFailures: CatalogRequestFailure[] = [];
  const baseTransport = createPublicJsonTransport(
    input.fetchImplementation,
    input.now,
  );
  let requestCount = 0;
  const evidenceTransport: PublicJsonTransport = async (request) => {
    const requestSequence = requestCount;
    requestCount += 1;
    const id = requestId({
      providerId: input.definition.providerId,
      request,
      requestSequence,
    });
    const result = await baseTransport({ ...request, captureBody: true });
    if (
      result.ok &&
      result.bodyBytes !== undefined &&
      result.bodyDigest !== undefined &&
      result.rawBody !== undefined
    ) {
      pages.push(Object.freeze({
        bodyBytes: result.bodyBytes,
        bodyDigest: result.bodyDigest,
        providerId: input.definition.providerId,
        rawBody: result.rawBody,
        receivedAt: result.receivedAt,
        requestId: id,
        requestSequence,
        requestUrl: request.url,
        status: result.status,
      }));
    } else if (!result.ok) {
      requestFailures.push(Object.freeze({
        providerId: input.definition.providerId,
        reasonCode: result.failure.reasonCode,
        receivedAt: result.receivedAt,
        requestId: id,
        requestSequence,
        requestUrl: request.url,
        status: result.status,
      }));
    }
    return result;
  };

  const catalog = await input.definition.fetchCatalog(evidenceTransport);
  if (catalog.venue !== input.definition.venue) {
    throw new Error("catalog adapter returned an unexpected venue");
  }
  return Object.freeze({
    catalog,
    completedAt: input.now().toISOString(),
    pages: Object.freeze([...pages]),
    providerId: input.definition.providerId,
    requestCount,
    requestFailures: Object.freeze([...requestFailures]),
    startedAt,
    venue: input.definition.venue,
  });
}

export async function captureThreeVenueForwardCatalogs(input: Readonly<{
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}> = {}): Promise<readonly ForwardCatalogCaptureAttempt[]> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const now = input.now ?? (() => new Date());
  const attempts: ForwardCatalogCaptureAttempt[] = [];
  for (const definition of CAPTURE_DEFINITIONS) {
    attempts.push(await captureCatalog({
      definition,
      fetchImplementation,
      now,
    }));
  }
  return Object.freeze(attempts);
}
