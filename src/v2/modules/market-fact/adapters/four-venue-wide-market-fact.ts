import { z } from "zod";
import {
  DecimalStringSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeDecimalStringSchema,
  NonNegativeIntegerSchema,
  PositiveDecimalStringSchema,
  ReasonCodesSchema,
} from "../../../runtime-schema/primitives";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
  type M1SourceId,
} from "../../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../../universe/stable-artifact";
import type { ProviderFailure } from "../../universe/catalog-types";

export const M1_WIDE_MARKET_SOURCE_PROFILE_VERSION =
  "v2-m1-wide-market-source-profile.v1" as const;
export const M1_WIDE_MARKET_COMPONENT_VERSION =
  "v2-m1-wide-market-component.v2" as const;
export const M1_WIDE_MARKET_VENUE_BATCH_VERSION =
  "v2-m1-wide-market-venue-batch.v2" as const;

export const M1_WIDE_MARKET_COMPONENT_IDS = [
  "BINANCE_PREMIUM_INDEX",
  "BINANCE_TICKER_24H",
  "OKX_TICKERS",
  "OKX_MARK_PRICE",
  "BYBIT_TICKERS",
  "BITGET_TICKERS",
] as const;

export const M1_WIDE_MARKET_FIELD_IDS = [
  "lastPrice",
  "markPrice",
  "indexPrice",
  "bestBidPrice",
  "bestAskPrice",
  "fundingRate",
  "openInterest",
  "baseVolume24h",
  "quoteVolume24h",
] as const;

export type M1WideMarketFieldId =
  (typeof M1_WIDE_MARKET_FIELD_IDS)[number];
export type M1WideMarketVenueSourceId = Exclude<
  M1SourceId,
  "COINGLASS_V4"
>;
export type M1WideMarketComponentId =
  (typeof M1_WIDE_MARKET_COMPONENT_IDS)[number];

type SourceRequestProfile = Readonly<{
  componentId: M1WideMarketComponentId;
  allowedHost: string;
  url: string;
  timeoutMs: 12_000;
  maxResponseBytes: 8_388_608;
  required: true;
  officialDocumentation: string;
}>;

type VenueSourceProfile = Readonly<{
  sourceId: M1WideMarketVenueSourceId;
  requests: readonly SourceRequestProfile[];
  requiredFreshFields: readonly M1WideMarketFieldId[];
  requiredAnyFreshFieldGroups: readonly (
    readonly M1WideMarketFieldId[]
  )[];
}>;

const BINANCE_DOCUMENTATION =
  "https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data";
const OKX_DOCUMENTATION = "https://www.okx.com/docs-v5/en/";
const BYBIT_DOCUMENTATION =
  "https://bybit-exchange.github.io/docs/v5/market/tickers";
const BITGET_DOCUMENTATION =
  "https://www.bitget.com/api-doc/classic/contract/market/Get-All-Symbol-Ticker";

export const M1_WIDE_MARKET_SOURCE_PROFILES = deepFreezeArtifact({
  schemaVersion: M1_WIDE_MARKET_SOURCE_PROFILE_VERSION,
  scopeEpoch: M1_SCOPE_EPOCH,
  reviewedAt: "2026-07-27T00:00:00.000Z",
  sourceOrder: M1_VENUE_SOURCE_IDS,
  credentialsRequired: false,
  rawBodyRetentionAllowed: false,
  automaticTradingAllowed: false,
  sources: {
    BINANCE_FUTURES: {
      sourceId: "BINANCE_FUTURES",
      requests: [
        {
          componentId: "BINANCE_PREMIUM_INDEX",
          allowedHost: "fapi.binance.com",
          url: "https://fapi.binance.com/fapi/v1/premiumIndex",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: BINANCE_DOCUMENTATION,
        },
        {
          componentId: "BINANCE_TICKER_24H",
          allowedHost: "fapi.binance.com",
          url: "https://fapi.binance.com/fapi/v1/ticker/24hr",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: BINANCE_DOCUMENTATION,
        },
      ],
      requiredFreshFields: [
        "lastPrice",
        "bestBidPrice",
        "bestAskPrice",
        "markPrice",
      ],
      requiredAnyFreshFieldGroups: [
        ["baseVolume24h", "quoteVolume24h"],
      ],
    },
    OKX_SWAP: {
      sourceId: "OKX_SWAP",
      requests: [
        {
          componentId: "OKX_TICKERS",
          allowedHost: "www.okx.com",
          url: "https://www.okx.com/api/v5/market/tickers?instType=SWAP",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: OKX_DOCUMENTATION,
        },
        {
          componentId: "OKX_MARK_PRICE",
          allowedHost: "www.okx.com",
          url: "https://www.okx.com/api/v5/public/mark-price?instType=SWAP",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: OKX_DOCUMENTATION,
        },
      ],
      requiredFreshFields: [
        "lastPrice",
        "bestBidPrice",
        "bestAskPrice",
        "markPrice",
      ],
      requiredAnyFreshFieldGroups: [
        ["baseVolume24h", "quoteVolume24h"],
      ],
    },
    BYBIT_DERIVATIVES: {
      sourceId: "BYBIT_DERIVATIVES",
      requests: [
        {
          componentId: "BYBIT_TICKERS",
          allowedHost: "api.bybit.com",
          url: "https://api.bybit.com/v5/market/tickers?category=linear",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: BYBIT_DOCUMENTATION,
        },
      ],
      requiredFreshFields: [
        "lastPrice",
        "bestBidPrice",
        "bestAskPrice",
        "markPrice",
      ],
      requiredAnyFreshFieldGroups: [
        ["baseVolume24h", "quoteVolume24h"],
      ],
    },
    BITGET_FUTURES: {
      sourceId: "BITGET_FUTURES",
      requests: [
        {
          componentId: "BITGET_TICKERS",
          allowedHost: "api.bitget.com",
          url:
            "https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES",
          timeoutMs: 12_000,
          maxResponseBytes: 8_388_608,
          required: true,
          officialDocumentation: BITGET_DOCUMENTATION,
        },
      ],
      requiredFreshFields: [
        "lastPrice",
        "bestBidPrice",
        "bestAskPrice",
        "markPrice",
      ],
      requiredAnyFreshFieldGroups: [
        ["baseVolume24h", "quoteVolume24h"],
      ],
    },
  } satisfies Record<M1WideMarketVenueSourceId, VenueSourceProfile>,
  authorityBoundary:
    "PUBLIC_READ_ONLY_T1_NORMALIZATION_NO_FACT_CANDIDATE_SIGNAL_STRATEGY_READY_OR_TRADING_AUTHORITY",
} as const);

export const M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST = stableContentHash(
  M1_WIDE_MARKET_SOURCE_PROFILES,
);

export function m1WideMarketProfileFor(
  sourceId: M1WideMarketVenueSourceId,
): VenueSourceProfile {
  return M1_WIDE_MARKET_SOURCE_PROFILES.sources[sourceId];
}

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const ComponentIdSchema = z.enum(M1_WIDE_MARKET_COMPONENT_IDS);
const UniqueReasonCodesSchema = ReasonCodesSchema.superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique",
      });
    }
  },
);

const FieldValuesSchema = z.strictObject({
  lastPrice: PositiveDecimalStringSchema.nullable(),
  markPrice: PositiveDecimalStringSchema.nullable(),
  indexPrice: PositiveDecimalStringSchema.nullable(),
  bestBidPrice: PositiveDecimalStringSchema.nullable(),
  bestAskPrice: PositiveDecimalStringSchema.nullable(),
  fundingRate: DecimalStringSchema.nullable(),
  openInterest: NonNegativeDecimalStringSchema.nullable(),
  baseVolume24h: NonNegativeDecimalStringSchema.nullable(),
  quoteVolume24h: NonNegativeDecimalStringSchema.nullable(),
});

const NullableTimesSchema = z.strictObject({
  lastPrice: IsoDateTimeSchema.nullable(),
  markPrice: IsoDateTimeSchema.nullable(),
  indexPrice: IsoDateTimeSchema.nullable(),
  bestBidPrice: IsoDateTimeSchema.nullable(),
  bestAskPrice: IsoDateTimeSchema.nullable(),
  fundingRate: IsoDateTimeSchema.nullable(),
  openInterest: IsoDateTimeSchema.nullable(),
  baseVolume24h: IsoDateTimeSchema.nullable(),
  quoteVolume24h: IsoDateTimeSchema.nullable(),
});

const NullableRecordIdsSchema = z.strictObject({
  lastPrice: NonEmptyStringSchema.nullable(),
  markPrice: NonEmptyStringSchema.nullable(),
  indexPrice: NonEmptyStringSchema.nullable(),
  bestBidPrice: NonEmptyStringSchema.nullable(),
  bestAskPrice: NonEmptyStringSchema.nullable(),
  fundingRate: NonEmptyStringSchema.nullable(),
  openInterest: NonEmptyStringSchema.nullable(),
  baseVolume24h: NonEmptyStringSchema.nullable(),
  quoteVolume24h: NonEmptyStringSchema.nullable(),
});

export const M1WideMarketComponentObservationSchema = z.strictObject({
  sourceId: VenueSchema,
  componentId: ComponentIdSchema,
  venueInstrumentId: NonEmptyStringSchema,
  eventTime: IsoDateTimeSchema,
  values: FieldValuesSchema,
  fieldEventTimes: NullableTimesSchema,
  fieldSourceRecordIds: NullableRecordIdsSchema,
  sourceRecordId: NonEmptyStringSchema,
  qualityStatus: z.enum(["FRESH", "PARTIAL", "INVALID"]),
  reasonCodes: UniqueReasonCodesSchema,
}).superRefine((observation, context) => {
  const populated = M1_WIDE_MARKET_FIELD_IDS.filter(
    (field) => observation.values[field] !== null,
  );
  if (populated.length === 0) {
    context.addIssue({
      code: "custom",
      message: "component observation requires at least one normalized field",
      path: ["values"],
    });
  }
  for (const field of M1_WIDE_MARKET_FIELD_IDS) {
    const hasValue = observation.values[field] !== null;
    if (
      hasValue !== (observation.fieldEventTimes[field] !== null) ||
      hasValue !== (observation.fieldSourceRecordIds[field] !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "field value and lineage must be present together",
        path: ["values", field],
      });
    }
  }
  if (
    observation.qualityStatus === "FRESH" &&
    observation.reasonCodes.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "fresh component observations cannot carry degradation reasons",
      path: ["reasonCodes"],
    });
  }
  if (
    observation.qualityStatus !== "FRESH" &&
    observation.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "non-fresh component observations require reasons",
      path: ["reasonCodes"],
    });
  }
});

export type M1WideMarketComponentObservation = z.infer<
  typeof M1WideMarketComponentObservationSchema
>;

const ComponentCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_WIDE_MARKET_COMPONENT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  sourceProfileDigest: DigestSchema,
  sourceId: VenueSchema,
  componentId: ComponentIdSchema,
  receivedAt: IsoDateTimeSchema,
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
  rawRecordCount: NonNegativeIntegerSchema,
  normalizedRecordCount: NonNegativeIntegerSchema,
  invalidRecordCount: NonNegativeIntegerSchema,
  duplicateInstrumentCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  responseHash: DigestSchema.nullable(),
  providerFailureKind: z.enum([
    "RATE_LIMITED",
    "AUTH_ERROR",
    "TRANSPORT_ERROR",
    "INVALID",
    "UNAVAILABLE",
  ]).nullable(),
  observations: z.array(M1WideMarketComponentObservationSchema),
  reasonCodes: UniqueReasonCodesSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
});

export const M1WideMarketComponentResultSchema =
  ComponentCoreSchema.extend({
    componentResultId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((component, context) => {
    if (
      component.normalizedRecordCount !== component.observations.length ||
      component.rawRecordCount !==
        component.normalizedRecordCount + component.invalidRecordCount
    ) {
      context.addIssue({
        code: "custom",
        message: "component record accounting does not reconcile",
        path: ["rawRecordCount"],
      });
    }
    const failed = component.status === "FAILED";
    if (
      failed !== (component.providerFailureKind !== null) ||
      (!failed && component.responseHash === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "component failure and response lineage disagree",
        path: ["status"],
      });
    }
    const expectedStatus = failed
      ? "FAILED"
      : (
          component.invalidRecordCount > 0 ||
          component.duplicateInstrumentCount > 0 ||
          component.observations.some(
            (observation) => observation.qualityStatus !== "FRESH",
          )
        )
        ? "PARTIAL"
        : "SUCCESS";
    if (component.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "component status overstates normalized observations",
        path: ["status"],
      });
    }
    if (
      component.status !== "SUCCESS" &&
      component.reasonCodes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "non-success component requires reasons",
        path: ["reasonCodes"],
      });
    }
    const expectedHash = stableContentHash(componentCore(component));
    if (component.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "component content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      component.componentResultId !==
        `wide-market-component:${component.componentId}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "component result id mismatch",
        path: ["componentResultId"],
      });
    }
  });

export type M1WideMarketComponentResult = z.infer<
  typeof M1WideMarketComponentResultSchema
>;

function componentCore(
  value: z.input<typeof ComponentCoreSchema> & {
    readonly componentResultId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ComponentCoreSchema> {
  return ComponentCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    sourceProfileDigest: value.sourceProfileDigest,
    sourceId: value.sourceId,
    componentId: value.componentId,
    receivedAt: value.receivedAt,
    status: value.status,
    rawRecordCount: value.rawRecordCount,
    normalizedRecordCount: value.normalizedRecordCount,
    invalidRecordCount: value.invalidRecordCount,
    duplicateInstrumentCount: value.duplicateInstrumentCount,
    responseBytes: value.responseBytes,
    responseHash: value.responseHash,
    providerFailureKind: value.providerFailureKind,
    observations: value.observations,
    reasonCodes: value.reasonCodes,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    authorityGranted: value.authorityGranted,
  });
}

function componentSource(
  componentId: M1WideMarketComponentId,
): M1WideMarketVenueSourceId {
  if (componentId.startsWith("BINANCE_")) {
    return "BINANCE_FUTURES";
  }
  if (componentId.startsWith("OKX_")) {
    return "OKX_SWAP";
  }
  if (componentId.startsWith("BYBIT_")) {
    return "BYBIT_DERIVATIVES";
  }
  return "BITGET_FUTURES";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function emptyValues(): z.infer<typeof FieldValuesSchema> {
  return {
    lastPrice: null,
    markPrice: null,
    indexPrice: null,
    bestBidPrice: null,
    bestAskPrice: null,
    fundingRate: null,
    openInterest: null,
    baseVolume24h: null,
    quoteVolume24h: null,
  };
}

function emptyTimes(): z.infer<typeof NullableTimesSchema> {
  return {
    lastPrice: null,
    markPrice: null,
    indexPrice: null,
    bestBidPrice: null,
    bestAskPrice: null,
    fundingRate: null,
    openInterest: null,
    baseVolume24h: null,
    quoteVolume24h: null,
  };
}

function emptyRecordIds(): z.infer<typeof NullableRecordIdsSchema> {
  return {
    lastPrice: null,
    markPrice: null,
    indexPrice: null,
    bestBidPrice: null,
    bestAskPrice: null,
    fundingRate: null,
    openInterest: null,
    baseVolume24h: null,
    quoteVolume24h: null,
  };
}

function normalizeInstrumentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().normalize("NFC").toUpperCase();
  return normalized.length > 0 && normalized.length <= 160
    ? normalized
    : null;
}

function canonicalDecimal(
  value: unknown,
  mode: "POSITIVE" | "NON_NEGATIVE" | "SIGNED",
): string | null {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value.trim())
  ) {
    return null;
  }
  const negative = value.trim().startsWith("-");
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [integer = "0", fraction = ""] = unsigned.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  const magnitude = normalizedFraction.length > 0
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
  const zero = !/[1-9]/u.test(magnitude);
  if (mode === "POSITIVE" && zero) {
    return null;
  }
  if (mode !== "SIGNED" && negative && !zero) {
    return null;
  }
  return negative && !zero ? `-${magnitude}` : magnitude;
}

function eventTimeFromMilliseconds(value: unknown): string | null {
  const text = typeof value === "number"
    ? (Number.isSafeInteger(value) ? String(value) : null)
    : typeof value === "string" && /^\d{1,16}$/u.test(value.trim())
      ? value.trim()
      : null;
  if (text === null) {
    return null;
  }
  const milliseconds = Number(text);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    return null;
  }
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function observation(input: {
  sourceId: M1WideMarketVenueSourceId;
  componentId: M1WideMarketComponentId;
  rawRecord: unknown;
  rowIndex: number;
  venueInstrumentId: unknown;
  eventTimestamp: unknown;
  fields: Partial<Record<
    M1WideMarketFieldId,
    Readonly<{
      rawValue: unknown;
      mode: "POSITIVE" | "NON_NEGATIVE" | "SIGNED";
    }>
  >>;
}): M1WideMarketComponentObservation | null {
  const venueInstrumentId = normalizeInstrumentId(input.venueInstrumentId);
  const eventTime = eventTimeFromMilliseconds(input.eventTimestamp);
  if (venueInstrumentId === null || eventTime === null) {
    return null;
  }
  const sourceRecordId =
    `${input.sourceId}:${input.componentId}:${input.rowIndex}:` +
    stableSha256(input.rawRecord).slice(0, 20);
  const values = emptyValues();
  const fieldEventTimes = emptyTimes();
  const fieldSourceRecordIds = emptyRecordIds();
  for (const [field, definition] of Object.entries(input.fields) as [
    M1WideMarketFieldId,
    NonNullable<(typeof input.fields)[M1WideMarketFieldId]>,
  ][]) {
    const value = canonicalDecimal(definition.rawValue, definition.mode);
    if (value === null) {
      continue;
    }
    values[field] = value;
    fieldEventTimes[field] = eventTime;
    fieldSourceRecordIds[field] = sourceRecordId;
  }
  if (M1_WIDE_MARKET_FIELD_IDS.every((field) => values[field] === null)) {
    return null;
  }
  return deepFreezeArtifact(M1WideMarketComponentObservationSchema.parse({
    sourceId: input.sourceId,
    componentId: input.componentId,
    venueInstrumentId,
    eventTime,
    values,
    fieldEventTimes,
    fieldSourceRecordIds,
    sourceRecordId,
    qualityStatus: "FRESH",
    reasonCodes: [],
  }));
}

function buildComponent(input: {
  componentId: M1WideMarketComponentId;
  receivedAt: string;
  responseHash: string;
  responseBytes: number;
  rawRecords: readonly unknown[];
  parseRow: (
    rawRecord: unknown,
    rowIndex: number,
  ) => M1WideMarketComponentObservation | null;
  envelopeReasonCodes?: readonly string[];
}): M1WideMarketComponentResult {
  const observations = input.rawRecords.flatMap((record, index) => {
    const parsed = input.parseRow(record, index);
    return parsed === null ? [] : [parsed];
  });
  const counts = new Map<string, number>();
  for (const item of observations) {
    counts.set(
      item.venueInstrumentId,
      (counts.get(item.venueInstrumentId) ?? 0) + 1,
    );
  }
  const duplicateInstrumentCount = [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const invalidRecordCount = input.rawRecords.length - observations.length;
  const reasonCodes = uniqueSorted([
    ...(input.envelopeReasonCodes ?? []),
    ...(invalidRecordCount > 0
      ? [`${input.componentId.toLowerCase()}_invalid_records_present`]
      : []),
    ...(duplicateInstrumentCount > 0
      ? [`${input.componentId.toLowerCase()}_duplicate_instruments_present`]
      : []),
    ...observations.flatMap((item) => item.reasonCodes),
  ]);
  const status =
    invalidRecordCount > 0 ||
      duplicateInstrumentCount > 0 ||
      observations.some((item) => item.qualityStatus !== "FRESH") ||
      reasonCodes.length > 0
      ? "PARTIAL" as const
      : "SUCCESS" as const;
  const core = componentCore({
    schemaVersion: M1_WIDE_MARKET_COMPONENT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceProfileDigest: M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
    sourceId: componentSource(input.componentId),
    componentId: input.componentId,
    receivedAt: input.receivedAt,
    status,
    rawRecordCount: input.rawRecords.length,
    normalizedRecordCount: observations.length,
    invalidRecordCount,
    duplicateInstrumentCount,
    responseBytes: input.responseBytes,
    responseHash: input.responseHash,
    providerFailureKind: null,
    observations,
    reasonCodes,
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1WideMarketComponentResultSchema.parse({
    ...core,
    componentResultId:
      `wide-market-component:${input.componentId}:${
        contentHash.slice(7, 23)
      }`,
    contentHash,
  }));
}

export function failedM1WideMarketComponent(input: {
  componentId: M1WideMarketComponentId;
  receivedAt: string;
  failure: ProviderFailure;
  responseHash?: string;
  responseBytes?: number;
}): M1WideMarketComponentResult {
  const core = componentCore({
    schemaVersion: M1_WIDE_MARKET_COMPONENT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceProfileDigest: M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
    sourceId: componentSource(input.componentId),
    componentId: input.componentId,
    receivedAt: input.receivedAt,
    status: "FAILED",
    rawRecordCount: 0,
    normalizedRecordCount: 0,
    invalidRecordCount: 0,
    duplicateInstrumentCount: 0,
    responseBytes: input.responseBytes ?? 0,
    responseHash: input.responseHash ?? null,
    providerFailureKind: input.failure.kind,
    observations: [],
    reasonCodes: [input.failure.reasonCode],
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1WideMarketComponentResultSchema.parse({
    ...core,
    componentResultId:
      `wide-market-component:${input.componentId}:${
        contentHash.slice(7, 23)
      }`,
    contentHash,
  }));
}

const BinancePremiumEnvelopeSchema = z.array(z.unknown());
const BinancePremiumRowSchema = z.object({
  symbol: z.unknown().optional(),
  markPrice: z.unknown().optional(),
  indexPrice: z.unknown().optional(),
  lastFundingRate: z.unknown().optional(),
  time: z.unknown().optional(),
}).passthrough();
const BinanceTickerEnvelopeSchema = z.array(z.unknown());
const BinanceTickerRowSchema = z.object({
  symbol: z.unknown().optional(),
  lastPrice: z.unknown().optional(),
  bidPrice: z.unknown().optional(),
  askPrice: z.unknown().optional(),
  volume: z.unknown().optional(),
  quoteVolume: z.unknown().optional(),
  closeTime: z.unknown().optional(),
}).passthrough();
const OkxEnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
}).passthrough();
const OkxTickerRowSchema = z.object({
  instId: z.unknown().optional(),
  last: z.unknown().optional(),
  bidPx: z.unknown().optional(),
  askPx: z.unknown().optional(),
  volCcy24h: z.unknown().optional(),
  ts: z.unknown().optional(),
}).passthrough();
const OkxMarkRowSchema = z.object({
  instId: z.unknown().optional(),
  markPx: z.unknown().optional(),
  ts: z.unknown().optional(),
}).passthrough();
const BybitEnvelopeSchema = z.object({
  retCode: z.number().int(),
  time: z.unknown().optional(),
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
  }).passthrough(),
}).passthrough();
const BybitTickerRowSchema = z.object({
  symbol: z.unknown().optional(),
  lastPrice: z.unknown().optional(),
  markPrice: z.unknown().optional(),
  indexPrice: z.unknown().optional(),
  bid1Price: z.unknown().optional(),
  ask1Price: z.unknown().optional(),
  fundingRate: z.unknown().optional(),
  openInterest: z.unknown().optional(),
  volume24h: z.unknown().optional(),
  turnover24h: z.unknown().optional(),
}).passthrough();
const BitgetEnvelopeSchema = z.object({
  code: z.string(),
  requestTime: z.unknown().optional(),
  data: z.array(z.unknown()),
}).passthrough();
const BitgetTickerRowSchema = z.object({
  symbol: z.unknown().optional(),
  lastPr: z.unknown().optional(),
  markPrice: z.unknown().optional(),
  indexPrice: z.unknown().optional(),
  bidPr: z.unknown().optional(),
  askPr: z.unknown().optional(),
  fundingRate: z.unknown().optional(),
  holdingAmount: z.unknown().optional(),
  baseVolume: z.unknown().optional(),
  quoteVolume: z.unknown().optional(),
  ts: z.unknown().optional(),
}).passthrough();

function schemaFailure(
  componentId: M1WideMarketComponentId,
  receivedAt: string,
  reasonCode: string,
  responseHash: string,
  responseBytes: number,
): M1WideMarketComponentResult {
  return failedM1WideMarketComponent({
    componentId,
    receivedAt,
    failure: { kind: "INVALID", reasonCode },
    responseHash,
    responseBytes,
  });
}

export function parseM1WideMarketComponent(input: {
  componentId: M1WideMarketComponentId;
  payload: unknown;
  receivedAt: string;
  responseHash: string;
  responseBytes: number;
}): M1WideMarketComponentResult {
  IsoDateTimeSchema.parse(input.receivedAt);
  DigestSchema.parse(input.responseHash);
  if (input.componentId === "BINANCE_PREMIUM_INDEX") {
    const envelope = BinancePremiumEnvelopeSchema.safeParse(input.payload);
    if (!envelope.success) {
      return schemaFailure(
        input.componentId,
        input.receivedAt,
        "binance_premium_index_schema_drift",
        input.responseHash,
        input.responseBytes,
      );
    }
    return buildComponent({
      ...input,
      rawRecords: envelope.data,
      parseRow: (rawRecord, rowIndex) => {
        const row = BinancePremiumRowSchema.safeParse(rawRecord);
        return row.success
          ? observation({
            sourceId: "BINANCE_FUTURES",
            componentId: input.componentId,
            rawRecord,
            rowIndex,
            venueInstrumentId: row.data.symbol,
            eventTimestamp: row.data.time,
            fields: {
              markPrice: { rawValue: row.data.markPrice, mode: "POSITIVE" },
              indexPrice: {
                rawValue: row.data.indexPrice,
                mode: "POSITIVE",
              },
              fundingRate: {
                rawValue: row.data.lastFundingRate,
                mode: "SIGNED",
              },
            },
          })
          : null;
      },
    });
  }
  if (input.componentId === "BINANCE_TICKER_24H") {
    const envelope = BinanceTickerEnvelopeSchema.safeParse(input.payload);
    if (!envelope.success) {
      return schemaFailure(
        input.componentId,
        input.receivedAt,
        "binance_ticker_24h_schema_drift",
        input.responseHash,
        input.responseBytes,
      );
    }
    return buildComponent({
      ...input,
      rawRecords: envelope.data,
      parseRow: (rawRecord, rowIndex) => {
        const row = BinanceTickerRowSchema.safeParse(rawRecord);
        return row.success
          ? observation({
            sourceId: "BINANCE_FUTURES",
            componentId: input.componentId,
            rawRecord,
            rowIndex,
            venueInstrumentId: row.data.symbol,
            eventTimestamp: row.data.closeTime,
            fields: {
              lastPrice: { rawValue: row.data.lastPrice, mode: "POSITIVE" },
              bestBidPrice: {
                rawValue: row.data.bidPrice,
                mode: "POSITIVE",
              },
              bestAskPrice: {
                rawValue: row.data.askPrice,
                mode: "POSITIVE",
              },
              baseVolume24h: {
                rawValue: row.data.volume,
                mode: "NON_NEGATIVE",
              },
              quoteVolume24h: {
                rawValue: row.data.quoteVolume,
                mode: "NON_NEGATIVE",
              },
            },
          })
          : null;
      },
    });
  }
  if (
    input.componentId === "OKX_TICKERS" ||
    input.componentId === "OKX_MARK_PRICE"
  ) {
    const envelope = OkxEnvelopeSchema.safeParse(input.payload);
    if (!envelope.success || envelope.data.code !== "0") {
      return schemaFailure(
        input.componentId,
        input.receivedAt,
        input.componentId === "OKX_TICKERS"
          ? "okx_tickers_schema_or_provider_error"
          : "okx_mark_price_schema_or_provider_error",
        input.responseHash,
        input.responseBytes,
      );
    }
    return buildComponent({
      ...input,
      rawRecords: envelope.data.data,
      parseRow: (rawRecord, rowIndex) => {
        if (input.componentId === "OKX_TICKERS") {
          const row = OkxTickerRowSchema.safeParse(rawRecord);
          return row.success
            ? observation({
              sourceId: "OKX_SWAP",
              componentId: input.componentId,
              rawRecord,
              rowIndex,
              venueInstrumentId: row.data.instId,
              eventTimestamp: row.data.ts,
              fields: {
                lastPrice: { rawValue: row.data.last, mode: "POSITIVE" },
                bestBidPrice: {
                  rawValue: row.data.bidPx,
                  mode: "POSITIVE",
                },
                bestAskPrice: {
                  rawValue: row.data.askPx,
                  mode: "POSITIVE",
                },
                baseVolume24h: {
                  rawValue: row.data.volCcy24h,
                  mode: "NON_NEGATIVE",
                },
              },
            })
            : null;
        }
        const row = OkxMarkRowSchema.safeParse(rawRecord);
        return row.success
          ? observation({
            sourceId: "OKX_SWAP",
            componentId: input.componentId,
            rawRecord,
            rowIndex,
            venueInstrumentId: row.data.instId,
            eventTimestamp: row.data.ts,
            fields: {
              markPrice: { rawValue: row.data.markPx, mode: "POSITIVE" },
            },
          })
          : null;
      },
    });
  }
  if (input.componentId === "BYBIT_TICKERS") {
    const envelope = BybitEnvelopeSchema.safeParse(input.payload);
    if (
      !envelope.success ||
      envelope.data.retCode !== 0 ||
      envelope.data.result.category !== "linear"
    ) {
      return schemaFailure(
        input.componentId,
        input.receivedAt,
        "bybit_tickers_schema_or_provider_error",
        input.responseHash,
        input.responseBytes,
      );
    }
    return buildComponent({
      ...input,
      rawRecords: envelope.data.result.list,
      parseRow: (rawRecord, rowIndex) => {
        const row = BybitTickerRowSchema.safeParse(rawRecord);
        return row.success
          ? observation({
            sourceId: "BYBIT_DERIVATIVES",
            componentId: input.componentId,
            rawRecord,
            rowIndex,
            venueInstrumentId: row.data.symbol,
            eventTimestamp: envelope.data.time,
            fields: {
              lastPrice: { rawValue: row.data.lastPrice, mode: "POSITIVE" },
              markPrice: { rawValue: row.data.markPrice, mode: "POSITIVE" },
              indexPrice: {
                rawValue: row.data.indexPrice,
                mode: "POSITIVE",
              },
              bestBidPrice: {
                rawValue: row.data.bid1Price,
                mode: "POSITIVE",
              },
              bestAskPrice: {
                rawValue: row.data.ask1Price,
                mode: "POSITIVE",
              },
              fundingRate: {
                rawValue: row.data.fundingRate,
                mode: "SIGNED",
              },
              openInterest: {
                rawValue: row.data.openInterest,
                mode: "NON_NEGATIVE",
              },
              baseVolume24h: {
                rawValue: row.data.volume24h,
                mode: "NON_NEGATIVE",
              },
              quoteVolume24h: {
                rawValue: row.data.turnover24h,
                mode: "NON_NEGATIVE",
              },
            },
          })
          : null;
      },
    });
  }

  const envelope = BitgetEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success || envelope.data.code !== "00000") {
    return schemaFailure(
      input.componentId,
      input.receivedAt,
      "bitget_tickers_schema_or_provider_error",
      input.responseHash,
      input.responseBytes,
    );
  }
  return buildComponent({
    ...input,
    rawRecords: envelope.data.data,
    parseRow: (rawRecord, rowIndex) => {
      const row = BitgetTickerRowSchema.safeParse(rawRecord);
      return row.success
        ? observation({
          sourceId: "BITGET_FUTURES",
          componentId: input.componentId,
          rawRecord,
          rowIndex,
          venueInstrumentId: row.data.symbol,
          eventTimestamp: row.data.ts ?? envelope.data.requestTime,
          fields: {
            lastPrice: { rawValue: row.data.lastPr, mode: "POSITIVE" },
            markPrice: { rawValue: row.data.markPrice, mode: "POSITIVE" },
            indexPrice: {
              rawValue: row.data.indexPrice,
              mode: "POSITIVE",
            },
            bestBidPrice: { rawValue: row.data.bidPr, mode: "POSITIVE" },
            bestAskPrice: { rawValue: row.data.askPr, mode: "POSITIVE" },
            fundingRate: {
              rawValue: row.data.fundingRate,
              mode: "SIGNED",
            },
            openInterest: {
              rawValue: row.data.holdingAmount,
              mode: "NON_NEGATIVE",
            },
            baseVolume24h: {
              rawValue: row.data.baseVolume,
              mode: "NON_NEGATIVE",
            },
            quoteVolume24h: {
              rawValue: row.data.quoteVolume,
              mode: "NON_NEGATIVE",
            },
          },
        })
        : null;
    },
  });
}

const VenueBatchCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_WIDE_MARKET_VENUE_BATCH_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  sourceProfileDigest: DigestSchema,
  sourceId: VenueSchema,
  status: z.enum(["COMPLETE", "PARTIAL", "FAILED"]),
  attemptedComponentCount: NonNegativeIntegerSchema,
  successfulComponentCount: NonNegativeIntegerSchema,
  failedComponentCount: NonNegativeIntegerSchema,
  rawRecordCount: NonNegativeIntegerSchema,
  normalizedRecordCount: NonNegativeIntegerSchema,
  invalidRecordCount: NonNegativeIntegerSchema,
  duplicateInstrumentCount: NonNegativeIntegerSchema,
  responseBytes: NonNegativeIntegerSchema,
  earliestReceivedAt: IsoDateTimeSchema,
  latestReceivedAt: IsoDateTimeSchema,
  components: z.array(M1WideMarketComponentResultSchema).min(1),
  reasonCodes: UniqueReasonCodesSchema,
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  authorityGranted: z.literal(false),
});

export const M1WideMarketVenueBatchSchema = VenueBatchCoreSchema.extend({
  batchId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((batch, context) => {
  const expectedComponents = m1WideMarketProfileFor(batch.sourceId).requests
    .map((request) => request.componentId);
  const actualComponents = batch.components.map(
    (component) => component.componentId,
  );
  if (
    expectedComponents.length !== actualComponents.length ||
    expectedComponents.some(
      (componentId, index) => componentId !== actualComponents[index],
    ) ||
    batch.components.some((component) => component.sourceId !== batch.sourceId)
  ) {
    context.addIssue({
      code: "custom",
      message: "Venue batch component denominator drifted",
      path: ["components"],
    });
  }
    if (
      batch.attemptedComponentCount !== batch.components.length ||
      batch.successfulComponentCount + batch.failedComponentCount !==
        batch.attemptedComponentCount ||
    batch.successfulComponentCount !==
      batch.components.filter((component) => component.status !== "FAILED")
        .length ||
      batch.failedComponentCount !==
        batch.components.filter((component) => component.status === "FAILED")
          .length ||
      batch.responseBytes !== batch.components.reduce(
        (total, component) => total + component.responseBytes,
        0,
      )
    ) {
    context.addIssue({
      code: "custom",
      message: "Venue batch component accounting does not reconcile",
      path: ["attemptedComponentCount"],
    });
  }
  const expectedStatus = batch.failedComponentCount === batch.components.length
    ? "FAILED"
    : batch.failedComponentCount > 0 ||
        batch.components.some((component) => component.status === "PARTIAL")
      ? "PARTIAL"
      : "COMPLETE";
  if (batch.status !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: "Venue batch status overstates component outcomes",
      path: ["status"],
    });
  }
  const expectedHash = stableContentHash(venueBatchCore(batch));
  if (batch.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "Venue batch content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    batch.batchId !==
      `wide-market-batch:${batch.sourceId}:${expectedHash.slice(7, 23)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "Venue batch id mismatch",
      path: ["batchId"],
    });
  }
});

export type M1WideMarketVenueBatch = z.infer<
  typeof M1WideMarketVenueBatchSchema
>;

function venueBatchCore(
  value: z.input<typeof VenueBatchCoreSchema> & {
    readonly batchId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof VenueBatchCoreSchema> {
  return VenueBatchCoreSchema.parse({
    schemaVersion: value.schemaVersion,
    scopeEpoch: value.scopeEpoch,
    sourceProfileDigest: value.sourceProfileDigest,
    sourceId: value.sourceId,
    status: value.status,
    attemptedComponentCount: value.attemptedComponentCount,
    successfulComponentCount: value.successfulComponentCount,
    failedComponentCount: value.failedComponentCount,
    rawRecordCount: value.rawRecordCount,
    normalizedRecordCount: value.normalizedRecordCount,
    invalidRecordCount: value.invalidRecordCount,
    duplicateInstrumentCount: value.duplicateInstrumentCount,
    responseBytes: value.responseBytes,
    earliestReceivedAt: value.earliestReceivedAt,
    latestReceivedAt: value.latestReceivedAt,
    components: value.components,
    reasonCodes: value.reasonCodes,
    rawBodyRetained: value.rawBodyRetained,
    secretMaterialPresent: value.secretMaterialPresent,
    authorityGranted: value.authorityGranted,
  });
}

export function buildM1WideMarketVenueBatch(input: {
  sourceId: M1WideMarketVenueSourceId;
  components: readonly M1WideMarketComponentResult[];
}): M1WideMarketVenueBatch {
  const byComponent = new Map(
    input.components.map((component) => [
      component.componentId,
      M1WideMarketComponentResultSchema.parse(component),
    ]),
  );
  const components = m1WideMarketProfileFor(input.sourceId).requests.map(
    (request) => {
      const component = byComponent.get(request.componentId);
      if (component === undefined) {
        throw new Error(
          `missing exact wide-market component ${request.componentId}`,
        );
      }
      return component;
    },
  );
  if (byComponent.size !== components.length) {
    throw new Error("unexpected or duplicate wide-market components");
  }
  const failedComponentCount = components.filter(
    (component) => component.status === "FAILED",
  ).length;
  const status = failedComponentCount === components.length
    ? "FAILED" as const
    : failedComponentCount > 0 ||
        components.some((component) => component.status === "PARTIAL")
      ? "PARTIAL" as const
      : "COMPLETE" as const;
  const receivedTimes = components.map((component) =>
    Date.parse(component.receivedAt)
  );
  const core = venueBatchCore({
    schemaVersion: M1_WIDE_MARKET_VENUE_BATCH_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    sourceProfileDigest: M1_WIDE_MARKET_SOURCE_PROFILE_DIGEST,
    sourceId: input.sourceId,
    status,
    attemptedComponentCount: components.length,
    successfulComponentCount: components.length - failedComponentCount,
    failedComponentCount,
    rawRecordCount: components.reduce(
      (total, component) => total + component.rawRecordCount,
      0,
    ),
    normalizedRecordCount: components.reduce(
      (total, component) => total + component.normalizedRecordCount,
      0,
    ),
    invalidRecordCount: components.reduce(
      (total, component) => total + component.invalidRecordCount,
      0,
    ),
    duplicateInstrumentCount: components.reduce(
      (total, component) => total + component.duplicateInstrumentCount,
      0,
    ),
    responseBytes: components.reduce(
      (total, component) => total + component.responseBytes,
      0,
    ),
    earliestReceivedAt: new Date(Math.min(...receivedTimes)).toISOString(),
    latestReceivedAt: new Date(Math.max(...receivedTimes)).toISOString(),
    components,
    reasonCodes: uniqueSorted(
      components.flatMap((component) => component.reasonCodes),
    ),
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1WideMarketVenueBatchSchema.parse({
    ...core,
    batchId:
      `wide-market-batch:${input.sourceId}:${contentHash.slice(7, 23)}`,
    contentHash,
  }));
}
