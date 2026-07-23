import { createHash } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import {
  request as nodeHttpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import { z } from "zod";
import {
  M1_SOURCE_CONFORMANCE_PROBE_IDS,
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
  type M1SourceConformanceArtifact,
  type M1SourceConformanceFailure,
  type M1SourceConformanceProbeDefinition,
  type M1SourceConformanceProbeObservation,
} from "../source-conformance-contract";
import {
  stableContentHash,
} from "../../universe/stable-artifact";
import {
  binanceMultiAssetCatalogSchemaConforms,
  bitgetMultiAssetCatalogSchemaConforms,
  bybitMultiAssetCatalogSchemaConforms,
  okxMultiAssetCatalogSchemaConforms,
} from "../../multi-asset-universe/adapters/four-venue-multi-asset-catalog";
import {
  bitgetListingAnnouncementSchemaConforms,
  bybitListingAnnouncementSchemaConforms,
} from "../../multi-asset-universe/adapters/bybit-bitget-listing-announcements";

type JsonObject = Record<string, unknown>;

type ParsedPage = Readonly<{
  records: readonly unknown[];
  providerServerTime: string | null;
  nextToken: string | null;
}>;

type RuntimeProbeDefinition = M1SourceConformanceProbeDefinition & Readonly<{
  host: string;
  initialUrl: string;
  maxPages: number;
  parsePage: (
    payload: unknown,
    pageIndex: number,
  ) => ParsedPage | M1SourceConformanceFailure;
  nextUrl: ((token: string, nextPageIndex: number) => string) | null;
}>;

type PageResponse = Readonly<{
  data: unknown;
  digest: string;
  bytes: number;
  receivedAt: string;
  status: number;
}>;

type TransportSuccess = Readonly<{
  body: Uint8Array;
  receivedAt: string;
  status: number;
}>;

type TransportResult =
  | Readonly<{ ok: true; response: TransportSuccess }>
  | Readonly<{
    ok: false;
    failure: M1SourceConformanceFailure;
  }>;

export type M1SourceConformanceTransport = (input: Readonly<{
  allowedHost: string;
  headers: Readonly<Record<string, string>>;
  maxResponseBytes: number;
  now: () => Date;
  timeoutMs: number;
  url: string;
}>) => Promise<TransportResult>;

export type M1HttpsRequestImplementation = (
  url: URL,
  options: HttpsRequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

const MAX_RESPONSE_BYTES_PER_PAGE = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

export const M1_EXACT_SOURCE_EXECUTION_POLICY = Object.freeze({
  announcementScope: Object.freeze({
    bitget: "OFFICIAL_ONE_MONTH_COIN_LISTINGS",
    bybit:
      "LATEST_TWO_NEW_CRYPTO_PAGES_FOR_CONFORMANCE_FULL_BACKFILL_DEFERRED_TO_LISTING_RUNTIME",
  }),
  crossSourceConcurrency: 5,
  maxResponseBytesPerPage: MAX_RESPONSE_BYTES_PER_PAGE,
  perSourceConcurrency: 1,
  requestTimeoutMs: REQUEST_TIMEOUT_MS,
  liveTransport:
    "NODE_HTTPS_CORE_TLS_VERIFIED_NO_REDIRECT_JITLESS_COMPATIBLE",
});

const BinanceSpotRowSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
}).passthrough();

const OkxSpotRowSchema = z.object({
  instId: z.string(),
  instType: z.literal("SPOT"),
  state: z.string(),
  baseCcy: z.string(),
  quoteCcy: z.string(),
}).passthrough();

const BybitSpotRowSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  baseCoin: z.string(),
  quoteCoin: z.string(),
}).passthrough();

const BitgetSpotRowSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  baseCoin: z.string(),
  quoteCoin: z.string(),
}).passthrough();

const CoinGlassSupportedCoinSchema = z.string().trim().min(1);

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function arrayAt(value: unknown, ...path: string[]): readonly unknown[] | null {
  let current: unknown = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) {
      return null;
    }
    current = record[key];
  }
  return Array.isArray(current) ? current : null;
}

function stringAt(value: unknown, ...path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) {
      return null;
    }
    current = record[key];
  }
  return typeof current === "string" ? current : null;
}

function numberAt(value: unknown, ...path: string[]): number | null {
  let current: unknown = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) {
      return null;
    }
    current = record[key];
  }
  return typeof current === "number" && Number.isFinite(current)
    ? current
    : null;
}

function millisecondsToIso(value: string | number | null): string | null {
  if (value === null || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return null;
  }
  const parsed = new Date(numeric);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function secondsToIso(value: string | number | null): string | null {
  if (value === null || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return millisecondsToIso(Math.trunc(numeric * 1000));
}

function simpleArrayParser(
  path: readonly string[],
  providerSuccess?: (payload: unknown) => boolean,
  payloadConforms?: (payload: unknown) => boolean,
): RuntimeProbeDefinition["parsePage"] {
  return (payload) => {
    if (providerSuccess !== undefined && !providerSuccess(payload)) {
      return "PROVIDER_BODY_ERROR_UNAVAILABLE";
    }
    const records = arrayAt(payload, ...path);
    return records === null ||
        (payloadConforms !== undefined && !payloadConforms(payload))
      ? "SCHEMA_DRIFT_UNAVAILABLE"
      : { records, providerServerTime: null, nextToken: null };
  };
}

function rowsAtPathConform(
  payload: unknown,
  path: readonly string[],
  schema: z.ZodType,
): boolean {
  const records = arrayAt(payload, ...path);
  return records !== null &&
    records.every((record) => schema.safeParse(record).success);
}

function bybitCatalogParser(
  category: "linear" | "spot",
): RuntimeProbeDefinition["parsePage"] {
  return (payload) => {
    if (numberAt(payload, "retCode") !== 0) {
      return "PROVIDER_BODY_ERROR_UNAVAILABLE";
    }
    if (stringAt(payload, "result", "category") !== category) {
      return "SCHEMA_DRIFT_UNAVAILABLE";
    }
    const records = arrayAt(payload, "result", "list");
    if (records === null) {
      return "SCHEMA_DRIFT_UNAVAILABLE";
    }
    const schemaConforms = category === "linear"
      ? bybitMultiAssetCatalogSchemaConforms(payload)
      : records.every((record) =>
        BybitSpotRowSchema.safeParse(record).success
      );
    if (!schemaConforms) {
      return "SCHEMA_DRIFT_UNAVAILABLE";
    }
    const cursor = stringAt(payload, "result", "nextPageCursor")?.trim() ?? "";
    return {
      records,
      providerServerTime: millisecondsToIso(numberAt(payload, "time")),
      nextToken: category === "linear" && cursor.length > 0 ? cursor : null,
    };
  };
}

function bybitAnnouncementParser(
  payload: unknown,
  pageIndex: number,
): ParsedPage | M1SourceConformanceFailure {
  if (numberAt(payload, "retCode") !== 0) {
    return "PROVIDER_BODY_ERROR_UNAVAILABLE";
  }
  const records = arrayAt(payload, "result", "list");
  const total = numberAt(payload, "result", "total");
  if (records === null || total === null || !Number.isSafeInteger(total)) {
    return "SCHEMA_DRIFT_UNAVAILABLE";
  }
  if (!bybitListingAnnouncementSchemaConforms(payload)) {
    return "SCHEMA_DRIFT_UNAVAILABLE";
  }
  const consumed = (pageIndex + 1) * 20;
  return {
    records,
    providerServerTime: millisecondsToIso(numberAt(payload, "time")),
    nextToken: consumed < total ? String(pageIndex + 2) : null,
  };
}

function bitgetAnnouncementParser(
  payload: unknown,
): ParsedPage | M1SourceConformanceFailure {
  if (stringAt(payload, "code") !== "00000") {
    return "PROVIDER_BODY_ERROR_UNAVAILABLE";
  }
  const records = arrayAt(payload, "data");
  if (records === null) {
    return "SCHEMA_DRIFT_UNAVAILABLE";
  }
  if (!bitgetListingAnnouncementSchemaConforms(payload)) {
    return "SCHEMA_DRIFT_UNAVAILABLE";
  }
  const last = object(records.at(-1));
  const cursor = typeof last?.annId === "string" ? last.annId.trim() : "";
  return {
    records,
    providerServerTime: millisecondsToIso(numberAt(payload, "requestTime")),
    nextToken: records.length === 10 && cursor.length > 0 ? cursor : null,
  };
}

const RUNTIME_PROBE_DEFINITIONS = [
  {
    probeId: "BINANCE_SERVER_TIME",
    sourceId: "BINANCE_FUTURES",
    capabilityId: "SERVER_TIME",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "fapi.binance.com",
    initialUrl: "https://fapi.binance.com/fapi/v1/time",
    maxPages: 1,
    parsePage: (payload) => {
      const providerServerTime = millisecondsToIso(
        numberAt(payload, "serverTime"),
      );
      return providerServerTime === null
        ? "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE"
        : { records: [payload], providerServerTime, nextToken: null };
    },
    nextUrl: null,
  },
  {
    probeId: "BINANCE_DERIVATIVE_CATALOG",
    sourceId: "BINANCE_FUTURES",
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "fapi.binance.com",
    initialUrl: "https://fapi.binance.com/fapi/v1/exchangeInfo",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["symbols"],
      undefined,
      binanceMultiAssetCatalogSchemaConforms,
    ),
    nextUrl: null,
  },
  {
    probeId: "BINANCE_SPOT_CATALOG",
    sourceId: "BINANCE_FUTURES",
    capabilityId: "SPOT_INSTRUMENT_CATALOG",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.binance.com",
    initialUrl: "https://api.binance.com/api/v3/exchangeInfo",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["symbols"],
      undefined,
      (payload) => rowsAtPathConform(
        payload,
        ["symbols"],
        BinanceSpotRowSchema,
      ),
    ),
    nextUrl: null,
  },
  {
    probeId: "OKX_SERVER_TIME",
    sourceId: "OKX_SWAP",
    capabilityId: "SERVER_TIME",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "www.okx.com",
    initialUrl: "https://www.okx.com/api/v5/public/time",
    maxPages: 1,
    parsePage: (payload) => {
      if (stringAt(payload, "code") !== "0") {
        return "PROVIDER_BODY_ERROR_UNAVAILABLE";
      }
      const first = object(arrayAt(payload, "data")?.[0]);
      const providerServerTime = millisecondsToIso(
        typeof first?.ts === "string" ? first.ts : null,
      );
      return providerServerTime === null
        ? "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE"
        : { records: [first], providerServerTime, nextToken: null };
    },
    nextUrl: null,
  },
  {
    probeId: "OKX_DERIVATIVE_CATALOG",
    sourceId: "OKX_SWAP",
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "www.okx.com",
    initialUrl: "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["data"],
      (payload) => stringAt(payload, "code") === "0",
      okxMultiAssetCatalogSchemaConforms,
    ),
    nextUrl: null,
  },
  {
    probeId: "OKX_SPOT_CATALOG",
    sourceId: "OKX_SWAP",
    capabilityId: "SPOT_INSTRUMENT_CATALOG",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "www.okx.com",
    initialUrl: "https://www.okx.com/api/v5/public/instruments?instType=SPOT",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["data"],
      (payload) => stringAt(payload, "code") === "0",
      (payload) => rowsAtPathConform(
        payload,
        ["data"],
        OkxSpotRowSchema,
      ),
    ),
    nextUrl: null,
  },
  {
    probeId: "BYBIT_SERVER_TIME",
    sourceId: "BYBIT_DERIVATIVES",
    capabilityId: "SERVER_TIME",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.bybit.com",
    initialUrl: "https://api.bybit.com/v5/market/time",
    maxPages: 1,
    parsePage: (payload) => {
      if (numberAt(payload, "retCode") !== 0) {
        return "PROVIDER_BODY_ERROR_UNAVAILABLE";
      }
      const providerServerTime =
        millisecondsToIso(numberAt(payload, "time")) ??
        secondsToIso(stringAt(payload, "result", "timeSecond"));
      return providerServerTime === null
        ? "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE"
        : { records: [payload], providerServerTime, nextToken: null };
    },
    nextUrl: null,
  },
  {
    probeId: "BYBIT_DERIVATIVE_CATALOG",
    sourceId: "BYBIT_DERIVATIVES",
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "MUST_TERMINATE",
    host: "api.bybit.com",
    initialUrl:
      "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000",
    maxPages: 32,
    parsePage: bybitCatalogParser("linear"),
    nextUrl: (cursor) => {
      const url = new URL(
        "https://api.bybit.com/v5/market/instruments-info",
      );
      url.searchParams.set("category", "linear");
      url.searchParams.set("limit", "1000");
      url.searchParams.set("cursor", cursor);
      return url.toString();
    },
  },
  {
    probeId: "BYBIT_SPOT_CATALOG",
    sourceId: "BYBIT_DERIVATIVES",
    capabilityId: "SPOT_INSTRUMENT_CATALOG",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.bybit.com",
    initialUrl:
      "https://api.bybit.com/v5/market/instruments-info?category=spot",
    maxPages: 1,
    parsePage: bybitCatalogParser("spot"),
    nextUrl: null,
  },
  {
    probeId: "BYBIT_LISTING_ANNOUNCEMENT",
    sourceId: "BYBIT_DERIVATIVES",
    capabilityId: "LISTING_ANNOUNCEMENT",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "BOUNDED_HEAD_WINDOW",
    host: "api.bybit.com",
    initialUrl:
      "https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&page=1&limit=20",
    maxPages: 2,
    parsePage: bybitAnnouncementParser,
    nextUrl: (_token, nextPageIndex) =>
      `https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&page=${
        nextPageIndex + 1
      }&limit=20`,
  },
  {
    probeId: "BITGET_SERVER_TIME",
    sourceId: "BITGET_FUTURES",
    capabilityId: "SERVER_TIME",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.bitget.com",
    initialUrl: "https://api.bitget.com/api/v2/public/time",
    maxPages: 1,
    parsePage: (payload) => {
      if (stringAt(payload, "code") !== "00000") {
        return "PROVIDER_BODY_ERROR_UNAVAILABLE";
      }
      const providerServerTime = millisecondsToIso(
        stringAt(payload, "data", "serverTime") ??
        numberAt(payload, "requestTime"),
      );
      return providerServerTime === null
        ? "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE"
        : { records: [payload], providerServerTime, nextToken: null };
    },
    nextUrl: null,
  },
  {
    probeId: "BITGET_DERIVATIVE_CATALOG",
    sourceId: "BITGET_FUTURES",
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    gate: "MULTI_ASSET_IDENTITY",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.bitget.com",
    initialUrl:
      "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["data"],
      (payload) => stringAt(payload, "code") === "00000",
      bitgetMultiAssetCatalogSchemaConforms,
    ),
    nextUrl: null,
  },
  {
    probeId: "BITGET_SPOT_CATALOG",
    sourceId: "BITGET_FUTURES",
    capabilityId: "SPOT_INSTRUMENT_CATALOG",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "NOT_APPLICABLE",
    host: "api.bitget.com",
    initialUrl: "https://api.bitget.com/api/v2/spot/public/symbols",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["data"],
      (payload) => stringAt(payload, "code") === "00000",
      (payload) => rowsAtPathConform(
        payload,
        ["data"],
        BitgetSpotRowSchema,
      ),
    ),
    nextUrl: null,
  },
  {
    probeId: "BITGET_LISTING_ANNOUNCEMENT",
    sourceId: "BITGET_FUTURES",
    capabilityId: "LISTING_ANNOUNCEMENT",
    gate: "LISTING_INTELLIGENCE",
    requiresReadOnlyApiKey: false,
    paginationExpectation: "MUST_TERMINATE",
    host: "api.bitget.com",
    initialUrl:
      "https://api.bitget.com/api/v2/public/annoucements?language=en_US&annType=coin_listings&limit=10",
    maxPages: 64,
    parsePage: bitgetAnnouncementParser,
    nextUrl: (cursor) =>
      `https://api.bitget.com/api/v2/public/annoucements?language=en_US&annType=coin_listings&limit=10&cursor=${
        encodeURIComponent(cursor)
      }`,
  },
  {
    probeId: "COINGLASS_SUPPORTED_COINS",
    sourceId: "COINGLASS_V4",
    capabilityId: "DERIVATIVE_INSTRUMENT_CATALOG",
    gate: "COINGLASS_CONTEXT",
    requiresReadOnlyApiKey: true,
    paginationExpectation: "NOT_APPLICABLE",
    host: "open-api-v4.coinglass.com",
    initialUrl:
      "https://open-api-v4.coinglass.com/api/futures/supported-coins",
    maxPages: 1,
    parsePage: simpleArrayParser(
      ["data"],
      (payload) => stringAt(payload, "code") === "0",
      (payload) => rowsAtPathConform(
        payload,
        ["data"],
        CoinGlassSupportedCoinSchema,
      ),
    ),
    nextUrl: null,
  },
] as const satisfies readonly RuntimeProbeDefinition[];

export const M1_EXACT_SOURCE_PROBE_DEFINITIONS:
  readonly M1SourceConformanceProbeDefinition[] = Object.freeze(
    RUNTIME_PROBE_DEFINITIONS.map((definition) => Object.freeze({
      probeId: definition.probeId,
      sourceId: definition.sourceId,
      capabilityId: definition.capabilityId,
      gate: definition.gate,
      requiresReadOnlyApiKey: definition.requiresReadOnlyApiKey,
      paginationExpectation: definition.paginationExpectation,
    })),
  );

export const M1_EXACT_SOURCE_PROBE_PLAN_DIGEST = stableContentHash(
  {
    executionPolicy: M1_EXACT_SOURCE_EXECUTION_POLICY,
    probes: RUNTIME_PROBE_DEFINITIONS.map((definition) => ({
      ...M1_EXACT_SOURCE_PROBE_DEFINITIONS.find(
        (candidate) => candidate.probeId === definition.probeId,
      ),
      host: definition.host,
      initialUrl: definition.initialUrl,
      maxPages: definition.maxPages,
    })),
  },
);

function definitionDigest(definition: RuntimeProbeDefinition): string {
  return stableContentHash({
    probeId: definition.probeId,
    sourceId: definition.sourceId,
    capabilityId: definition.capabilityId,
    gate: definition.gate,
    requiresReadOnlyApiKey: definition.requiresReadOnlyApiKey,
    paginationExpectation: definition.paginationExpectation,
    host: definition.host,
    initialUrl: definition.initialUrl,
    maxPages: definition.maxPages,
  });
}

function transportFailure(
  failure: M1SourceConformanceFailure,
): TransportResult {
  return { ok: false, failure };
}

export function createM1NodeHttpsTransport(
  requestImplementation: M1HttpsRequestImplementation = nodeHttpsRequest,
): M1SourceConformanceTransport {
  return async (input) => {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      return transportFailure("PROBE_DEFINITION_DRIFT");
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== input.allowedHost ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return transportFailure("PROBE_DEFINITION_DRIFT");
    }

    return await new Promise<TransportResult>((resolvePromise) => {
      let settled = false;
      let request: ClientRequest | null = null;
      const finish = (result: TransportResult): void => {
        if (settled) return;
        settled = true;
        resolvePromise(result);
      };

      try {
        request = requestImplementation(
          url,
          {
            agent: false,
            headers: input.headers,
            method: "GET",
            rejectUnauthorized: true,
            servername: url.hostname,
          },
          (response) => {
            const status = response.statusCode;
            if (
              status === undefined ||
              !Number.isInteger(status) ||
              status < 100 ||
              status > 599
            ) {
              response.resume();
              finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
              return;
            }

            const receivedAt = input.now().toISOString();
            const chunks: Uint8Array[] = [];
            let total = 0;
            response.on("data", (chunk: Buffer | string) => {
              if (settled) return;
              const bytes = Buffer.from(chunk);
              total += bytes.byteLength;
              if (total > input.maxResponseBytes) {
                finish(transportFailure("SCHEMA_DRIFT_UNAVAILABLE"));
                response.destroy();
                return;
              }
              chunks.push(bytes);
            });
            response.once("aborted", () => {
              finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
            });
            response.once("error", () => {
              finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
            });
            response.once("end", () => {
              if (settled) return;
              const body = new Uint8Array(total);
              let offset = 0;
              for (const chunk of chunks) {
                body.set(chunk, offset);
                offset += chunk.byteLength;
              }
              finish({
                ok: true,
                response: {
                  body,
                  receivedAt,
                  status,
                },
              });
            });
          },
        );
        request.once("error", () => {
          finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
        });
        request.setTimeout(input.timeoutMs, () => {
          finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
          request?.destroy();
        });
        request.end();
      } catch {
        finish(transportFailure("TRANSPORT_FAILURE_UNAVAILABLE"));
        request?.destroy();
      }
    });
  };
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maximumBytes
  ) {
    return null;
  }
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    total += chunk.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(Uint8Array.from(chunk.value));
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function createM1FetchTransport(
  fetchImplementation: typeof fetch,
): M1SourceConformanceTransport {
  return async (input) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetchImplementation(input.url, {
        cache: "no-store",
        credentials: "omit",
        headers: input.headers,
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const body = await readBoundedBody(response, input.maxResponseBytes);
      return body === null
        ? transportFailure("SCHEMA_DRIFT_UNAVAILABLE")
        : {
          ok: true,
          response: {
            body,
            receivedAt: input.now().toISOString(),
            status: response.status,
          },
        };
    } catch {
      return transportFailure("TRANSPORT_FAILURE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

async function fetchPage(input: {
  definition: RuntimeProbeDefinition;
  url: string;
  apiKey: string | null;
  transport: M1SourceConformanceTransport;
  now: () => Date;
}): Promise<PageResponse | M1SourceConformanceFailure> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return "PROBE_DEFINITION_DRIFT";
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== input.definition.host ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return "PROBE_DEFINITION_DRIFT";
  }

  const transport = await input.transport({
    allowedHost: input.definition.host,
    headers: {
      accept: "application/json",
      ...(input.definition.requiresReadOnlyApiKey && input.apiKey !== null
        ? { "CG-API-KEY": input.apiKey }
        : {}),
    },
    maxResponseBytes: MAX_RESPONSE_BYTES_PER_PAGE,
    now: input.now,
    timeoutMs: REQUEST_TIMEOUT_MS,
    url: url.toString(),
  });
  if (!transport.ok) {
    return transport.failure;
  }
  const response = transport.response;
  if (response.status === 429) {
    return "RATE_LIMIT_BACKOFF_NO_STALE_PROMOTION";
  }
  if (response.status === 401 || response.status === 403) {
    return "AUTH_FAILURE_UNAVAILABLE";
  }
  if (response.status < 200 || response.status >= 300) {
    return "HTTP_NON_2XX_UNAVAILABLE";
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(response.body)) as unknown;
  } catch {
    return "SCHEMA_DRIFT_UNAVAILABLE";
  }
  return {
    data,
    digest:
      `sha256:${createHash("sha256").update(response.body).digest("hex")}`,
    bytes: response.body.byteLength,
    receivedAt: response.receivedAt,
    status: response.status,
  };
}

function failedObservation(input: {
  definition: RuntimeProbeDefinition;
  evidenceClass: M1SourceConformanceProbeObservation["evidenceClass"];
  failure: M1SourceConformanceFailure;
  startedAt: string | null;
  receivedAt: string | null;
  credentialDisposition:
    M1SourceConformanceProbeObservation["credentialDisposition"];
  outcome?: "FAIL" | "NOT_RUN";
}): M1SourceConformanceProbeObservation {
  const latencyMs =
    input.startedAt === null || input.receivedAt === null
      ? null
      : Math.max(
        0,
        Date.parse(input.receivedAt) - Date.parse(input.startedAt),
      );
  return M1SourceConformanceProbeObservationSchema.parse({
    probeId: input.definition.probeId,
    sourceId: input.definition.sourceId,
    capabilityId: input.definition.capabilityId,
    gate: input.definition.gate,
    definitionDigest: definitionDigest(input.definition),
    evidenceClass: input.evidenceClass,
    outcome: input.outcome ?? "FAIL",
    attemptStartedAt: input.startedAt,
    receivedAt: input.receivedAt,
    latencyMs,
    httpStatus: null,
    responseBodyDigest: null,
    responseBytes: null,
    topLevelKeys: [],
    recordKeys: [],
    observedRecordCount: null,
    providerServerTime: null,
    absoluteClockSkewMs: null,
    paginationStatus: input.startedAt === null ? "NOT_RUN" : "INCOMPLETE",
    credentialDisposition: input.credentialDisposition,
    failure: input.failure,
    reasonCodes: [input.failure.toLowerCase()],
    rawBodyRetained: false,
    secretMaterialPresent: false,
  });
}

function recordKeys(records: readonly unknown[]): string[] {
  return [...new Set(records.flatMap((record) =>
    object(record) === null ? [] : Object.keys(object(record)!)
  ))].sort();
}

async function runProbe(input: {
  definition: RuntimeProbeDefinition;
  evidenceClass: M1SourceConformanceProbeObservation["evidenceClass"];
  apiKey: string | null;
  transport: M1SourceConformanceTransport;
  now: () => Date;
}): Promise<M1SourceConformanceProbeObservation> {
  const credentialDisposition =
    input.definition.requiresReadOnlyApiKey
      ? input.apiKey === null
        ? "MISSING_REQUIRED_READ_ONLY_KEY"
        : "READ_ONLY_KEY_USED_NOT_RETAINED"
      : "PUBLIC_NO_CREDENTIAL";
  if (
    input.definition.requiresReadOnlyApiKey &&
    input.apiKey === null
  ) {
    return failedObservation({
      definition: input.definition,
      evidenceClass: input.evidenceClass,
      failure: "MISSING_REQUIRED_READ_ONLY_CREDENTIAL",
      startedAt: null,
      receivedAt: null,
      credentialDisposition,
      outcome: "NOT_RUN",
    });
  }

  const startedAt = input.now().toISOString();
  const allRecords: unknown[] = [];
  const pageDigests: string[] = [];
  const topLevelKeys = new Set<string>();
  const seenTokens = new Set<string>();
  let totalBytes = 0;
  let lastReceivedAt = startedAt;
  let providerServerTime: string | null = null;
  let lastStatus: number | null = null;
  let url = input.definition.initialUrl;
  let pageIndex = 0;

  const completedObservation = (
    paginationStatus:
      M1SourceConformanceProbeObservation["paginationStatus"],
  ): M1SourceConformanceProbeObservation => {
    const responseBodyDigest = stableContentHash(pageDigests);
    const absoluteClockSkewMs = providerServerTime === null
      ? null
      : Math.abs(
        Date.parse(lastReceivedAt) - Date.parse(providerServerTime),
      );
    if (
      allRecords.length === 0 &&
      input.definition.capabilityId !== "LISTING_ANNOUNCEMENT"
    ) {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: "EMPTY_RESPONSE_OBSERVED_EMPTY",
        startedAt,
        receivedAt: lastReceivedAt,
        credentialDisposition,
      });
    }
    if (
      input.definition.capabilityId === "SERVER_TIME" &&
      (
        absoluteClockSkewMs === null ||
        absoluteClockSkewMs > 30_000
      )
    ) {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: "SOURCE_CLOCK_UNKNOWN_UNAVAILABLE",
        startedAt,
        receivedAt: lastReceivedAt,
        credentialDisposition,
      });
    }
    return M1SourceConformanceProbeObservationSchema.parse({
      probeId: input.definition.probeId,
      sourceId: input.definition.sourceId,
      capabilityId: input.definition.capabilityId,
      gate: input.definition.gate,
      definitionDigest: definitionDigest(input.definition),
      evidenceClass: input.evidenceClass,
      outcome: "PASS",
      attemptStartedAt: startedAt,
      receivedAt: lastReceivedAt,
      latencyMs: Math.max(
        0,
        Date.parse(lastReceivedAt) - Date.parse(startedAt),
      ),
      httpStatus: lastStatus,
      responseBodyDigest,
      responseBytes: totalBytes,
      topLevelKeys: [...topLevelKeys].sort(),
      recordKeys: recordKeys(allRecords),
      observedRecordCount: allRecords.length,
      providerServerTime,
      absoluteClockSkewMs,
      paginationStatus,
      credentialDisposition,
      failure: null,
      reasonCodes: [],
      rawBodyRetained: false,
      secretMaterialPresent: false,
    });
  };

  while (pageIndex < input.definition.maxPages) {
    const response = await fetchPage({
      definition: input.definition,
      url,
      apiKey: input.apiKey,
      transport: input.transport,
      now: input.now,
    });
    if (typeof response === "string") {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: response,
        startedAt,
        receivedAt: input.now().toISOString(),
        credentialDisposition,
      });
    }
    lastReceivedAt = response.receivedAt;
    lastStatus = response.status;
    totalBytes += response.bytes;
    pageDigests.push(response.digest);
    const envelope = object(response.data);
    if (envelope === null) {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: "SCHEMA_DRIFT_UNAVAILABLE",
        startedAt,
        receivedAt: lastReceivedAt,
        credentialDisposition,
      });
    }
    for (const key of Object.keys(envelope)) {
      topLevelKeys.add(key);
    }
    const parsed = input.definition.parsePage(response.data, pageIndex);
    if (typeof parsed === "string") {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: parsed,
        startedAt,
        receivedAt: lastReceivedAt,
        credentialDisposition,
      });
    }
    allRecords.push(...parsed.records);
    providerServerTime = parsed.providerServerTime ?? providerServerTime;
    pageIndex += 1;
    if (parsed.nextToken === null) {
      return completedObservation(
        input.definition.paginationExpectation === "NOT_APPLICABLE"
          ? "NOT_APPLICABLE"
          : "COMPLETE",
      );
    }
    if (
      input.definition.nextUrl === null ||
      seenTokens.has(parsed.nextToken)
    ) {
      return failedObservation({
        definition: input.definition,
        evidenceClass: input.evidenceClass,
        failure: "PAGINATION_INCOMPLETE_UNAVAILABLE",
        startedAt,
        receivedAt: lastReceivedAt,
        credentialDisposition,
      });
    }
    seenTokens.add(parsed.nextToken);
    url = input.definition.nextUrl(parsed.nextToken, pageIndex);
  }

  if (
    input.definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
  ) {
    return completedObservation("BOUNDED_COMPLETE");
  }

  return failedObservation({
    definition: input.definition,
    evidenceClass: input.evidenceClass,
    failure: "PAGINATION_INCOMPLETE_UNAVAILABLE",
    startedAt,
    receivedAt: lastReceivedAt,
    credentialDisposition,
  });
}

export async function runM1ExactSourceConformance(input: {
  releaseId: string;
  registryDigest: string;
  networkEnvironment: M1SourceConformanceArtifact["networkEnvironment"];
  coinGlassApiKey?: string | null;
  fetchImplementation?: typeof fetch;
  transportImplementation?: M1SourceConformanceTransport;
  now?: () => Date;
}): Promise<M1SourceConformanceArtifact> {
  if (
    input.fetchImplementation !== undefined &&
    input.transportImplementation !== undefined
  ) {
    throw new Error("source conformance accepts only one transport override");
  }
  const transport = input.transportImplementation ??
    (
      input.fetchImplementation === undefined
        ? createM1NodeHttpsTransport()
        : createM1FetchTransport(input.fetchImplementation)
    );
  const now = input.now ?? (() => new Date());
  const evidenceClass: M1SourceConformanceArtifact["evidenceClass"] =
    input.fetchImplementation === undefined &&
      input.transportImplementation === undefined
      ? "LIVE_READ_ONLY"
      : "TEST_ONLY";
  const networkEnvironment: M1SourceConformanceArtifact["networkEnvironment"] =
    evidenceClass === "LIVE_READ_ONLY"
      ? input.networkEnvironment
      : "TEST_HARNESS";
  if (
    evidenceClass === "LIVE_READ_ONLY" &&
    input.networkEnvironment === "TEST_HARNESS"
  ) {
    throw new Error("live source conformance cannot claim TEST_HARNESS");
  }
  const normalizedApiKey = input.coinGlassApiKey?.trim() || null;
  const definitionsBySource = new Map<
    M1SourceConformanceProbeDefinition["sourceId"],
    RuntimeProbeDefinition[]
  >();
  for (const definition of RUNTIME_PROBE_DEFINITIONS) {
    const definitions = definitionsBySource.get(definition.sourceId) ?? [];
    definitions.push(definition);
    definitionsBySource.set(definition.sourceId, definitions);
  }
  const probes = (
    await Promise.all(
      [...definitionsBySource.values()].map(async (definitions) => {
        const sourceProbes: M1SourceConformanceProbeObservation[] = [];
        for (const definition of definitions) {
          sourceProbes.push(await runProbe({
            definition,
            evidenceClass,
            apiKey: normalizedApiKey,
            transport,
            now,
          }));
        }
        return sourceProbes;
      }),
    )
  ).flat();
  const generatedAt = now().toISOString();
  const sourceCutoff = probes
    .map((probe) => probe.receivedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? generatedAt;
  return buildM1SourceConformanceArtifact({
    releaseId: input.releaseId,
    generatedAt,
    sourceCutoff,
    registryDigest: input.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass,
    networkEnvironment,
    probes,
  });
}

if (
  new Set(RUNTIME_PROBE_DEFINITIONS.map((definition) => definition.probeId))
    .size !== M1_SOURCE_CONFORMANCE_PROBE_IDS.length
) {
  throw new Error("source conformance probe definitions are incomplete");
}
