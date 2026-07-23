import { z } from "zod";
import {
  type M1AssetDomain,
  type M1SourceId,
} from "../../source-capability/source-capability-contract";
import {
  createM1MultiAssetObservation,
  deriveM1CanonicalInstrumentId,
  deriveM1IdentityEpoch,
  deriveM1ListingEpoch,
  deriveM1UnderlyingGroupId,
  M1OfficialUnderlyingMappingSchema,
  type M1MultiAssetInstrumentObservation,
  type M1OfficialUnderlyingMapping,
} from "../multi-asset-identity-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";

export type M1CatalogNormalizationStatus = "PASS" | "PARTIAL" | "FAIL";

export type M1CatalogNormalizationResult = Readonly<{
  sourceId: Exclude<M1SourceId, "COINGLASS_V4">;
  receivedAt: string;
  rawRecordCount: number;
  observations: readonly M1MultiAssetInstrumentObservation[];
  status: M1CatalogNormalizationStatus;
  reasonCodes: readonly string[];
  authorityBoundary:
    "NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY";
}>;

type VenueSourceId = M1CatalogNormalizationResult["sourceId"];
type ClassificationAuthority =
  M1MultiAssetInstrumentObservation["classificationAuthority"];
type LifecycleState =
  M1MultiAssetInstrumentObservation["lifecycleState"];

type ClassificationHint = Readonly<{
  assetDomain: M1AssetDomain | null;
  authority: ClassificationAuthority;
  reasonCodes: readonly string[];
  broadRwa: boolean;
}>;

type MaterializeInput = Readonly<{
  sourceId: VenueSourceId;
  venueInstrumentId: string;
  baseAsset: string | null;
  quoteAsset: string | null;
  settlementAsset: string | null;
  contractMechanism:
    | "LINEAR_PERPETUAL"
    | "EQUITY_CFD"
    | "UNKNOWN_DERIVATIVE";
  contractMultiplier: string | null;
  priceTick: string | null;
  quantityStep: string | null;
  providerStatus: string;
  lifecycleState: LifecycleState;
  providerListTime: string | null;
  providerDelistTime: string | null;
  statusEffectiveAt: string | null;
  receivedAt: string;
  rawRecord: unknown;
  classificationHint: ClassificationHint;
  mappings: readonly M1OfficialUnderlyingMapping[];
  extraReasonCodes: readonly string[];
  targetContract: boolean;
}>;

const BinanceEnvelopeSchema = z.object({
  symbols: z.array(z.unknown()),
}).passthrough();

const BinanceRowSchema = z.object({
  symbol: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  marginAsset: z.string(),
  contractType: z.string(),
  status: z.string(),
  onboardDate: z.union([z.number(), z.string()]).optional(),
  deliveryDate: z.union([z.number(), z.string()]).optional(),
  underlyingType: z.string().optional(),
  underlyingSubType: z.array(z.string()).optional(),
  filters: z.array(z.unknown()).optional(),
}).passthrough();

const OkxEnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
}).passthrough();

const OkxRowSchema = z.object({
  instId: z.string(),
  instType: z.string(),
  ctType: z.string(),
  ctVal: z.string(),
  ctValCcy: z.string(),
  quoteCcy: z.string().optional(),
  settleCcy: z.string(),
  state: z.string(),
  instCategory: z.string().optional(),
  uly: z.string().optional(),
  instFamily: z.string().optional(),
  listTime: z.string().optional(),
  expTime: z.string().optional(),
  tickSz: z.string().optional(),
  lotSz: z.string().optional(),
  minSz: z.string().optional(),
}).passthrough();

const BybitEnvelopeSchema = z.object({
  retCode: z.number().int(),
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
    nextPageCursor: z.string().optional(),
  }).passthrough(),
}).passthrough();

const BybitRowSchema = z.object({
  symbol: z.string(),
  contractType: z.string(),
  status: z.string(),
  baseCoin: z.string(),
  quoteCoin: z.string(),
  settleCoin: z.string(),
  launchTime: z.union([z.string(), z.number()]).optional(),
  deliveryTime: z.union([z.string(), z.number()]).optional(),
  symbolType: z.string().optional(),
  isPreListing: z.boolean().optional(),
  priceFilter: z.object({
    tickSize: z.string(),
  }).passthrough().optional(),
  lotSizeFilter: z.object({
    qtyStep: z.string(),
  }).passthrough().optional(),
}).passthrough();

const BitgetEnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
}).passthrough();

const BitgetRowSchema = z.object({
  symbol: z.string(),
  baseCoin: z.string(),
  quoteCoin: z.string(),
  supportMarginCoins: z.array(z.string()).optional(),
  symbolType: z.string(),
  symbolStatus: z.string(),
  launchTime: z.string().optional(),
  offTime: z.string().optional(),
  maintainTime: z.string().optional(),
  sizeMultiplier: z.string().optional(),
  pricePlace: z.string().optional(),
  priceEndStep: z.string().optional(),
  isRwa: z.string().optional(),
}).passthrough();

function everyRowConforms(
  records: readonly unknown[],
  schema: z.ZodType,
): boolean {
  return records.every((record) => schema.safeParse(record).success);
}

export function binanceMultiAssetCatalogSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = BinanceEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    everyRowConforms(envelope.data.symbols, BinanceRowSchema);
}

export function okxMultiAssetCatalogSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = OkxEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    envelope.data.code === "0" &&
    everyRowConforms(envelope.data.data, OkxRowSchema);
}

export function bybitMultiAssetCatalogSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = BybitEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    envelope.data.retCode === 0 &&
    envelope.data.result.category === "linear" &&
    everyRowConforms(envelope.data.result.list, BybitRowSchema);
}

export function bitgetMultiAssetCatalogSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = BitgetEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    envelope.data.code === "00000" &&
    everyRowConforms(envelope.data.data, BitgetRowSchema);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().normalize("NFC").toUpperCase();
  return normalized.length > 0 && normalized.length <= 160 ? normalized : null;
}

function normalizeDecimal(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) {
    return null;
  }
  const [integer = "0", fraction = ""] = trimmed.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  const normalized = normalizedFraction.length > 0
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
  return /[1-9]/u.test(normalized) ? normalized : null;
}

function decimalFromPlaces(
  coefficient: string | undefined,
  places: string | undefined,
): string | null {
  if (
    coefficient === undefined ||
    places === undefined ||
    !/^[1-9]\d*$/u.test(coefficient) ||
    !/^(?:0|[1-9]\d*)$/u.test(places)
  ) {
    return null;
  }
  const decimalPlaces = Number(places);
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces > 24) {
    return null;
  }
  if (decimalPlaces === 0) {
    return normalizeDecimal(coefficient);
  }
  const padded = coefficient.padStart(decimalPlaces + 1, "0");
  const splitAt = padded.length - decimalPlaces;
  return normalizeDecimal(`${padded.slice(0, splitAt)}.${padded.slice(splitAt)}`);
}

function timestampFromMilliseconds(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "" || value === "-1") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return null;
  }
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function activeMapping(
  mappings: readonly M1OfficialUnderlyingMapping[],
  sourceId: VenueSourceId,
  venueInstrumentId: string,
  receivedAt: string,
): Readonly<{
  mapping: M1OfficialUnderlyingMapping | null;
  ambiguous: boolean;
}> {
  const normalizedInstrumentId = normalizeToken(venueInstrumentId);
  const valid = mappings
    .filter((mapping) =>
      mapping.sourceId === sourceId &&
      normalizeToken(mapping.venueInstrumentId) === normalizedInstrumentId &&
      Date.parse(mapping.reviewedAt) <= Date.parse(receivedAt) &&
      Date.parse(receivedAt) < Date.parse(mapping.expiresAt)
    );
  return {
    mapping: valid.length === 1 ? valid[0]! : null,
    ambiguous: valid.length > 1,
  };
}

function validatedMappings(
  mappings: readonly M1OfficialUnderlyingMapping[],
): readonly M1OfficialUnderlyingMapping[] {
  return mappings.map((mapping) =>
    M1OfficialUnderlyingMappingSchema.parse(mapping)
  );
}

function classification(
  input: MaterializeInput,
): Readonly<{
  assetDomain: M1AssetDomain | null;
  authority: ClassificationAuthority;
  evidenceIds: readonly string[];
  underlyingReferenceId: string | null;
  reasonCodes: readonly string[];
}> {
  const mappingResolution = activeMapping(
    input.mappings,
    input.sourceId,
    input.venueInstrumentId,
    input.receivedAt,
  );
  if (mappingResolution.ambiguous) {
    return {
      assetDomain: null,
      authority: "UNRESOLVED",
      evidenceIds: [],
      underlyingReferenceId: null,
      reasonCodes: ["multiple_active_official_mappings_for_instrument"],
    };
  }
  const mapping = mappingResolution.mapping;
  const hint = input.classificationHint;
  if (mapping !== null) {
    const hintConflicts =
      hint.assetDomain === "CRYPTO_LINEAR_PERPETUAL" ||
      (
        hint.assetDomain !== null &&
        hint.assetDomain !== "OTHER_RWA_DERIVATIVE" &&
        hint.assetDomain !== mapping.assetDomain
      );
    if (hintConflicts) {
      return {
        assetDomain: null,
        authority: "UNRESOLVED",
        evidenceIds: mapping.evidenceIds,
        underlyingReferenceId: null,
        reasonCodes: uniqueSorted([
          ...hint.reasonCodes,
          "provider_and_official_mapping_classification_conflict",
        ]),
      };
    }
    return {
      assetDomain: mapping.assetDomain,
      authority: "OFFICIAL_PRODUCT_MAPPING",
      evidenceIds: mapping.evidenceIds,
      underlyingReferenceId: mapping.underlyingReferenceId,
      reasonCodes: hint.broadRwa
        ? ["broad_provider_rwa_category_refined_by_official_mapping"]
        : [],
    };
  }
  if (hint.assetDomain === null) {
    return {
      assetDomain: null,
      authority: "UNRESOLVED",
      evidenceIds: [],
      underlyingReferenceId: null,
      reasonCodes: uniqueSorted([
        ...hint.reasonCodes,
        "asset_domain_not_proven_without_symbol_guessing",
      ]),
    };
  }
  const baseAsset = normalizeToken(input.baseAsset);
  return {
    assetDomain: hint.assetDomain,
    authority: hint.authority,
    evidenceIds: [],
    underlyingReferenceId: baseAsset === null
      ? null
      : `VENUE_ASSET:${input.sourceId}:${baseAsset}`,
    reasonCodes: hint.reasonCodes,
  };
}

function materialize(
  input: MaterializeInput,
): M1MultiAssetInstrumentObservation {
  const venueInstrumentId =
    normalizeToken(input.venueInstrumentId) ??
    `UNRESOLVED:${stableContentHash(input.rawRecord).slice(7, 31)}`;
  const baseAsset = normalizeToken(input.baseAsset);
  const quoteAsset = normalizeToken(input.quoteAsset);
  const settlementAsset = normalizeToken(input.settlementAsset);
  const contractMultiplier = normalizeDecimal(input.contractMultiplier);
  const priceTick = normalizeDecimal(input.priceTick);
  const quantityStep = normalizeDecimal(input.quantityStep);
  const resolved = classification({ ...input, venueInstrumentId });
  const listingEpoch = deriveM1ListingEpoch({
    sourceId: input.sourceId,
    venueInstrumentId,
    providerListTime: input.providerListTime,
    firstObservedAt: input.receivedAt,
  });
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId: input.sourceId,
    venueInstrumentId,
    listingEpoch,
    assetDomain: resolved.assetDomain,
    underlyingReferenceId: resolved.underlyingReferenceId,
  });
  const complete =
    input.targetContract &&
    resolved.assetDomain !== null &&
    baseAsset !== null &&
    quoteAsset !== null &&
    settlementAsset !== null &&
    contractMultiplier !== null &&
    priceTick !== null &&
    quantityStep !== null;
  const identityStatus = complete
    ? "EXACT"
    : resolved.assetDomain === null
      ? "UNRESOLVED"
      : "PARTIAL";
  const canonicalInstrumentId = complete
    ? deriveM1CanonicalInstrumentId({
      sourceId: input.sourceId,
      venueInstrumentId,
      identityEpoch,
    })
    : null;
  const reasonCodes = uniqueSorted([
    ...input.extraReasonCodes,
    ...resolved.reasonCodes,
    ...(input.targetContract ? [] : ["contract_outside_target_mechanism"]),
    ...(baseAsset === null ? ["base_asset_missing_or_invalid"] : []),
    ...(quoteAsset === null ? ["quote_asset_missing_or_invalid"] : []),
    ...(settlementAsset === null
      ? ["settlement_asset_missing_or_invalid"]
      : []),
    ...(contractMultiplier === null ? ["contract_multiplier_unresolved"] : []),
    ...(priceTick === null ? ["price_tick_unresolved"] : []),
    ...(quantityStep === null ? ["quantity_step_unresolved"] : []),
  ]);

  return createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: resolved.assetDomain,
    sourceId: input.sourceId,
    venueInstrumentId,
    canonicalInstrumentId,
    underlyingGroupId: complete && resolved.assetDomain !== null
      ? deriveM1UnderlyingGroupId({
        assetDomain: resolved.assetDomain,
        underlyingReferenceId: resolved.underlyingReferenceId,
        settlementAsset,
      })
      : null,
    underlyingReferenceId: resolved.underlyingReferenceId,
    baseAsset,
    quoteAsset,
    settlementAsset,
    contractMechanism: input.contractMechanism,
    contractMultiplier,
    priceTick,
    quantityStep,
    listingEpoch,
    identityEpoch,
    identityStatus,
    classificationAuthority: resolved.authority,
    classificationEvidenceIds: [...resolved.evidenceIds],
    providerStatus: input.providerStatus,
    lifecycleState: input.lifecycleState,
    providerListTime: input.providerListTime,
    providerDelistTime: input.providerDelistTime,
    firstObservedAt: input.receivedAt,
    statusEffectiveAt: input.statusEffectiveAt,
    knowledgeTime: input.receivedAt,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: stableContentHash(input.rawRecord),
    reasonCodes,
  });
}

function finish(
  sourceId: VenueSourceId,
  receivedAt: string,
  rawRecordCount: number,
  observations: readonly M1MultiAssetInstrumentObservation[],
  outerReasonCodes: readonly string[] = [],
): M1CatalogNormalizationResult {
  const reasonCodes = uniqueSorted([
    ...outerReasonCodes,
    ...observations.flatMap((observation) => observation.reasonCodes),
  ]);
  const status: M1CatalogNormalizationStatus =
    rawRecordCount === 0 || observations.length === 0
      ? "FAIL"
      : observations.some((observation) =>
        observation.identityStatus !== "EXACT"
      )
        ? "PARTIAL"
        : "PASS";
  return deepFreezeArtifact({
    sourceId,
    receivedAt,
    rawRecordCount,
    observations: [...observations],
    status,
    reasonCodes,
    authorityBoundary:
      "NORMALIZATION_ONLY_NO_ELIGIBLE_FACT_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  });
}

function invalidEnvelope(
  sourceId: VenueSourceId,
  receivedAt: string,
  reasonCode: string,
): M1CatalogNormalizationResult {
  return finish(sourceId, receivedAt, 0, [], [reasonCode]);
}

function binanceClassification(row: z.infer<typeof BinanceRowSchema>) {
  const category = normalizeToken(row.underlyingType);
  const domain = category === "COIN" || category === "CRYPTO"
    ? "CRYPTO_LINEAR_PERPETUAL"
    : category === "STOCK" || category === "EQUITY"
      ? "EQUITY_SINGLE_NAME_PERPETUAL"
      : category === "ETF" || category === "INDEX"
        ? "EQUITY_INDEX_ETF_PERPETUAL"
        : ["RWA", "TRADFI", "COMMODITY", "FOREX", "BOND"].includes(
            category ?? "",
          )
          ? "OTHER_RWA_DERIVATIVE"
          : null;
  return {
    assetDomain: domain,
    authority: domain === null
      ? "UNRESOLVED"
      : "PROVIDER_EXPLICIT_CATEGORY",
    reasonCodes: domain === null
      ? ["binance_underlying_type_unrecognized_or_missing"]
      : [],
    broadRwa: domain === "OTHER_RWA_DERIVATIVE",
  } as const satisfies ClassificationHint;
}

function binanceFilter(
  filters: readonly unknown[] | undefined,
  filterType: string,
  field: string,
): string | null {
  for (const filter of filters ?? []) {
    if (
      typeof filter === "object" &&
      filter !== null &&
      (filter as Record<string, unknown>).filterType === filterType &&
      typeof (filter as Record<string, unknown>)[field] === "string"
    ) {
      return (filter as Record<string, string>)[field] ?? null;
    }
  }
  return null;
}

function binanceLifecycle(status: string): LifecycleState {
  if (status === "PENDING_TRADING") {
    return "PRE_LAUNCH_OR_PREOPEN";
  }
  if (status === "TRADING") {
    return "TRADING_WARMUP";
  }
  if (["PRE_DELIVERING", "DELIVERING", "PRE_SETTLE", "SETTLING"].includes(status)) {
    return "DELISTING";
  }
  if (["DELIVERED", "CLOSE"].includes(status)) {
    return "OFFLINE";
  }
  return "UNRESOLVED";
}

export function normalizeBinanceMultiAssetCatalog(input: {
  payload: unknown;
  receivedAt: string;
  mappings?: readonly M1OfficialUnderlyingMapping[];
}): M1CatalogNormalizationResult {
  const envelope = BinanceEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success) {
    return invalidEnvelope(
      "BINANCE_FUTURES",
      input.receivedAt,
      "binance_scope_v2_catalog_schema_invalid",
    );
  }
  const mappings = validatedMappings(input.mappings ?? []);
  const observations = envelope.data.symbols.map((rawRecord) => {
    const parsed = BinanceRowSchema.safeParse(rawRecord);
    if (!parsed.success) {
      return materialize({
        sourceId: "BINANCE_FUTURES",
        venueInstrumentId:
          typeof (rawRecord as Record<string, unknown> | null)?.symbol ===
              "string"
            ? String((rawRecord as Record<string, unknown>).symbol)
            : `UNRESOLVED:${stableContentHash(rawRecord).slice(7, 31)}`,
        baseAsset: null,
        quoteAsset: null,
        settlementAsset: null,
        contractMechanism: "UNKNOWN_DERIVATIVE",
        contractMultiplier: null,
        priceTick: null,
        quantityStep: null,
        providerStatus: "SCHEMA_INVALID",
        lifecycleState: "UNRESOLVED",
        providerListTime: null,
        providerDelistTime: null,
        statusEffectiveAt: null,
        receivedAt: input.receivedAt,
        rawRecord,
        classificationHint: {
          assetDomain: null,
          authority: "UNRESOLVED",
          reasonCodes: ["binance_catalog_row_schema_invalid"],
          broadRwa: false,
        },
        mappings,
        extraReasonCodes: ["binance_catalog_row_schema_invalid"],
        targetContract: false,
      });
    }
    const row = parsed.data;
    const targetContract =
      row.contractType === "PERPETUAL" &&
      row.quoteAsset.toUpperCase() === "USDT" &&
      row.marginAsset.toUpperCase() === "USDT";
    return materialize({
      sourceId: "BINANCE_FUTURES",
      venueInstrumentId: row.symbol,
      baseAsset: row.baseAsset,
      quoteAsset: row.quoteAsset,
      settlementAsset: row.marginAsset,
      contractMechanism: row.contractType === "PERPETUAL"
        ? "LINEAR_PERPETUAL"
        : "UNKNOWN_DERIVATIVE",
      contractMultiplier: "1",
      priceTick: binanceFilter(row.filters, "PRICE_FILTER", "tickSize"),
      quantityStep: binanceFilter(row.filters, "LOT_SIZE", "stepSize"),
      providerStatus: row.status,
      lifecycleState: binanceLifecycle(row.status),
      providerListTime: timestampFromMilliseconds(row.onboardDate),
      providerDelistTime: timestampFromMilliseconds(row.deliveryDate),
      statusEffectiveAt: timestampFromMilliseconds(row.onboardDate),
      receivedAt: input.receivedAt,
      rawRecord,
      classificationHint: binanceClassification(row),
      mappings,
      extraReasonCodes: [],
      targetContract,
    });
  });
  return finish(
    "BINANCE_FUTURES",
    input.receivedAt,
    envelope.data.symbols.length,
    observations,
  );
}

function okxClassification(row: z.infer<typeof OkxRowSchema>) {
  const domain = row.instCategory === "1"
    ? "CRYPTO_LINEAR_PERPETUAL"
    : row.instCategory === "3"
      ? "EQUITY_SINGLE_NAME_PERPETUAL"
      : ["4", "5", "6"].includes(row.instCategory ?? "")
        ? "OTHER_RWA_DERIVATIVE"
        : null;
  return {
    assetDomain: domain,
    authority: domain === null
      ? "UNRESOLVED"
      : "PROVIDER_EXPLICIT_CATEGORY",
    reasonCodes: domain === null
      ? ["okx_inst_category_unrecognized_or_missing"]
      : [],
    broadRwa: domain === "OTHER_RWA_DERIVATIVE",
  } as const satisfies ClassificationHint;
}

function okxQuoteAsset(row: z.infer<typeof OkxRowSchema>): string | null {
  if (normalizeToken(row.quoteCcy) !== null) {
    return row.quoteCcy ?? null;
  }
  const underlying = row.uly?.trim() || row.instFamily?.trim() || "";
  const match = /^(.+)-([^-]+)$/u.exec(underlying);
  return match?.[2] ?? null;
}

function okxLifecycle(state: string): LifecycleState {
  if (state === "preopen") {
    return "PRE_LAUNCH_OR_PREOPEN";
  }
  if (state === "live") {
    return "TRADING_WARMUP";
  }
  if (state === "suspend") {
    return "SUSPENDED";
  }
  if (state === "test") {
    return "RESTRICTED";
  }
  if (state === "expiring") {
    return "DELISTING";
  }
  if (state === "expired") {
    return "OFFLINE";
  }
  return "UNRESOLVED";
}

export function normalizeOkxMultiAssetCatalog(input: {
  payload: unknown;
  receivedAt: string;
  mappings?: readonly M1OfficialUnderlyingMapping[];
}): M1CatalogNormalizationResult {
  const envelope = OkxEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success || envelope.data.code !== "0") {
    return invalidEnvelope(
      "OKX_SWAP",
      input.receivedAt,
      envelope.success
        ? "okx_scope_v2_catalog_provider_error"
        : "okx_scope_v2_catalog_schema_invalid",
    );
  }
  const mappings = validatedMappings(input.mappings ?? []);
  const observations = envelope.data.data.map((rawRecord) => {
    const parsed = OkxRowSchema.safeParse(rawRecord);
    if (!parsed.success) {
      return materialize({
        sourceId: "OKX_SWAP",
        venueInstrumentId:
          typeof (rawRecord as Record<string, unknown> | null)?.instId ===
              "string"
            ? String((rawRecord as Record<string, unknown>).instId)
            : `UNRESOLVED:${stableContentHash(rawRecord).slice(7, 31)}`,
        baseAsset: null,
        quoteAsset: null,
        settlementAsset: null,
        contractMechanism: "UNKNOWN_DERIVATIVE",
        contractMultiplier: null,
        priceTick: null,
        quantityStep: null,
        providerStatus: "SCHEMA_INVALID",
        lifecycleState: "UNRESOLVED",
        providerListTime: null,
        providerDelistTime: null,
        statusEffectiveAt: null,
        receivedAt: input.receivedAt,
        rawRecord,
        classificationHint: {
          assetDomain: null,
          authority: "UNRESOLVED",
          reasonCodes: ["okx_catalog_row_schema_invalid"],
          broadRwa: false,
        },
        mappings,
        extraReasonCodes: ["okx_catalog_row_schema_invalid"],
        targetContract: false,
      });
    }
    const row = parsed.data;
    const quoteAsset = okxQuoteAsset(row);
    const targetContract =
      row.instType === "SWAP" &&
      row.ctType === "linear" &&
      ["USDT", "USDC"].includes(row.settleCcy.toUpperCase()) &&
      normalizeToken(quoteAsset) === normalizeToken(row.settleCcy);
    return materialize({
      sourceId: "OKX_SWAP",
      venueInstrumentId: row.instId,
      baseAsset: row.ctValCcy,
      quoteAsset,
      settlementAsset: row.settleCcy,
      contractMechanism: row.instType === "SWAP" && row.ctType === "linear"
        ? "LINEAR_PERPETUAL"
        : "UNKNOWN_DERIVATIVE",
      contractMultiplier: row.ctVal,
      priceTick: row.tickSz ?? null,
      quantityStep: row.lotSz ?? row.minSz ?? null,
      providerStatus: row.state,
      lifecycleState: okxLifecycle(row.state),
      providerListTime: timestampFromMilliseconds(row.listTime),
      providerDelistTime: timestampFromMilliseconds(row.expTime),
      statusEffectiveAt: timestampFromMilliseconds(row.listTime),
      receivedAt: input.receivedAt,
      rawRecord,
      classificationHint: okxClassification(row),
      mappings,
      extraReasonCodes: [],
      targetContract,
    });
  });
  return finish(
    "OKX_SWAP",
    input.receivedAt,
    envelope.data.data.length,
    observations,
  );
}

function bybitClassification(row: z.infer<typeof BybitRowSchema>) {
  const category = row.symbolType === undefined
    ? null
    : row.symbolType.trim() === ""
      ? ""
      : normalizeToken(row.symbolType);
  const domain =
    category === "" || category === "INNOVATION"
      ? "CRYPTO_LINEAR_PERPETUAL"
      : category === "STOCK" ||
          category === "COMMODITY" ||
          category === "FOREX"
        ? "OTHER_RWA_DERIVATIVE"
        : null;
  return {
    assetDomain: domain,
    authority: domain === null
      ? "UNRESOLVED"
      : "PROVIDER_EXPLICIT_CATEGORY",
    reasonCodes: domain === null
      ? ["bybit_symbol_type_unrecognized"]
      : category === "STOCK"
        ? ["bybit_stock_category_does_not_distinguish_single_name_from_etf"]
        : [],
    broadRwa: domain === "OTHER_RWA_DERIVATIVE",
  } as const satisfies ClassificationHint;
}

function bybitLifecycle(
  status: string,
  isPreListing: boolean | undefined,
): LifecycleState {
  if (status === "PreLaunch" || isPreListing === true) {
    return "PRE_LAUNCH_OR_PREOPEN";
  }
  if (status === "Trading") {
    return "TRADING_WARMUP";
  }
  if (status === "Settling" || status === "Delivering") {
    return "DELISTING";
  }
  if (status === "Closed") {
    return "OFFLINE";
  }
  return "UNRESOLVED";
}

export function normalizeBybitMultiAssetCatalog(input: {
  payload: unknown;
  receivedAt: string;
  mappings?: readonly M1OfficialUnderlyingMapping[];
}): M1CatalogNormalizationResult {
  const envelope = BybitEnvelopeSchema.safeParse(input.payload);
  if (
    !envelope.success ||
    envelope.data.retCode !== 0 ||
    envelope.data.result.category !== "linear"
  ) {
    return invalidEnvelope(
      "BYBIT_DERIVATIVES",
      input.receivedAt,
      envelope.success
        ? "bybit_scope_v2_catalog_provider_error"
        : "bybit_scope_v2_catalog_schema_invalid",
    );
  }
  const mappings = validatedMappings(input.mappings ?? []);
  const observations = envelope.data.result.list.map((rawRecord) => {
    const parsed = BybitRowSchema.safeParse(rawRecord);
    if (!parsed.success) {
      return materialize({
        sourceId: "BYBIT_DERIVATIVES",
        venueInstrumentId:
          typeof (rawRecord as Record<string, unknown> | null)?.symbol ===
              "string"
            ? String((rawRecord as Record<string, unknown>).symbol)
            : `UNRESOLVED:${stableContentHash(rawRecord).slice(7, 31)}`,
        baseAsset: null,
        quoteAsset: null,
        settlementAsset: null,
        contractMechanism: "UNKNOWN_DERIVATIVE",
        contractMultiplier: null,
        priceTick: null,
        quantityStep: null,
        providerStatus: "SCHEMA_INVALID",
        lifecycleState: "UNRESOLVED",
        providerListTime: null,
        providerDelistTime: null,
        statusEffectiveAt: null,
        receivedAt: input.receivedAt,
        rawRecord,
        classificationHint: {
          assetDomain: null,
          authority: "UNRESOLVED",
          reasonCodes: ["bybit_catalog_row_schema_invalid"],
          broadRwa: false,
        },
        mappings,
        extraReasonCodes: ["bybit_catalog_row_schema_invalid"],
        targetContract: false,
      });
    }
    const row = parsed.data;
    const targetContract =
      row.contractType === "LinearPerpetual" &&
      ["USDT", "USDC"].includes(row.settleCoin.toUpperCase()) &&
      row.quoteCoin.toUpperCase() === row.settleCoin.toUpperCase();
    return materialize({
      sourceId: "BYBIT_DERIVATIVES",
      venueInstrumentId: row.symbol,
      baseAsset: row.baseCoin,
      quoteAsset: row.quoteCoin,
      settlementAsset: row.settleCoin,
      contractMechanism: row.contractType === "LinearPerpetual"
        ? "LINEAR_PERPETUAL"
        : "UNKNOWN_DERIVATIVE",
      contractMultiplier: "1",
      priceTick: row.priceFilter?.tickSize ?? null,
      quantityStep: row.lotSizeFilter?.qtyStep ?? null,
      providerStatus: row.status,
      lifecycleState: bybitLifecycle(row.status, row.isPreListing),
      providerListTime: timestampFromMilliseconds(row.launchTime),
      providerDelistTime: timestampFromMilliseconds(row.deliveryTime),
      statusEffectiveAt: timestampFromMilliseconds(row.launchTime),
      receivedAt: input.receivedAt,
      rawRecord,
      classificationHint: bybitClassification(row),
      mappings,
      extraReasonCodes: [],
      targetContract,
    });
  });
  return finish(
    "BYBIT_DERIVATIVES",
    input.receivedAt,
    envelope.data.result.list.length,
    observations,
  );
}

function bitgetClassification(row: z.infer<typeof BitgetRowSchema>) {
  const isRwa = normalizeToken(row.isRwa);
  const domain = isRwa === "NO"
    ? "CRYPTO_LINEAR_PERPETUAL"
    : isRwa === "YES"
      ? "OTHER_RWA_DERIVATIVE"
      : null;
  return {
    assetDomain: domain,
    authority: isRwa === "NO"
      ? "PROVIDER_NEGATIVE_RWA_FLAG"
      : domain === null
        ? "UNRESOLVED"
        : "PROVIDER_EXPLICIT_CATEGORY",
    reasonCodes: isRwa === "YES"
      ? ["bitget_is_rwa_does_not_prove_stock_or_etf_identity"]
      : domain === null
        ? ["bitget_is_rwa_unrecognized_or_missing"]
        : [],
    broadRwa: isRwa === "YES",
  } as const satisfies ClassificationHint;
}

function bitgetLifecycle(
  status: string,
  maintainTime: string | undefined,
): LifecycleState {
  if (status === "listed") {
    return "PRE_LAUNCH_OR_PREOPEN";
  }
  if (status === "maintain" || timestampFromMilliseconds(maintainTime) !== null) {
    return "MAINTENANCE";
  }
  if (status === "limit_open" || status === "restrictedAPI") {
    return "RESTRICTED";
  }
  if (status === "normal") {
    return "TRADING_WARMUP";
  }
  if (status === "off") {
    return "OFFLINE";
  }
  return "UNRESOLVED";
}

export function normalizeBitgetMultiAssetCatalog(input: {
  payload: unknown;
  receivedAt: string;
  mappings?: readonly M1OfficialUnderlyingMapping[];
}): M1CatalogNormalizationResult {
  const envelope = BitgetEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success || envelope.data.code !== "00000") {
    return invalidEnvelope(
      "BITGET_FUTURES",
      input.receivedAt,
      envelope.success
        ? "bitget_scope_v2_catalog_provider_error"
        : "bitget_scope_v2_catalog_schema_invalid",
    );
  }
  const mappings = validatedMappings(input.mappings ?? []);
  const observations = envelope.data.data.map((rawRecord) => {
    const parsed = BitgetRowSchema.safeParse(rawRecord);
    if (!parsed.success) {
      return materialize({
        sourceId: "BITGET_FUTURES",
        venueInstrumentId:
          typeof (rawRecord as Record<string, unknown> | null)?.symbol ===
              "string"
            ? String((rawRecord as Record<string, unknown>).symbol)
            : `UNRESOLVED:${stableContentHash(rawRecord).slice(7, 31)}`,
        baseAsset: null,
        quoteAsset: null,
        settlementAsset: null,
        contractMechanism: "UNKNOWN_DERIVATIVE",
        contractMultiplier: null,
        priceTick: null,
        quantityStep: null,
        providerStatus: "SCHEMA_INVALID",
        lifecycleState: "UNRESOLVED",
        providerListTime: null,
        providerDelistTime: null,
        statusEffectiveAt: null,
        receivedAt: input.receivedAt,
        rawRecord,
        classificationHint: {
          assetDomain: null,
          authority: "UNRESOLVED",
          reasonCodes: ["bitget_catalog_row_schema_invalid"],
          broadRwa: false,
        },
        mappings,
        extraReasonCodes: ["bitget_catalog_row_schema_invalid"],
        targetContract: false,
      });
    }
    const row = parsed.data;
    const marginCoins = row.supportMarginCoins?.map((value) =>
      value.toUpperCase()
    ) ?? [];
    const targetContract =
      row.symbolType === "perpetual" &&
      row.quoteCoin.toUpperCase() === "USDT" &&
      marginCoins.includes("USDT");
    const lifecycleState = bitgetLifecycle(
      row.symbolStatus,
      row.maintainTime,
    );
    const providerListTime = timestampFromMilliseconds(row.launchTime);
    const providerDelistTime = timestampFromMilliseconds(row.offTime);
    const maintenanceTime = timestampFromMilliseconds(row.maintainTime);
    return materialize({
      sourceId: "BITGET_FUTURES",
      venueInstrumentId: row.symbol,
      baseAsset: row.baseCoin,
      quoteAsset: row.quoteCoin,
      settlementAsset: marginCoins.includes("USDT") ? "USDT" : null,
      contractMechanism: row.symbolType === "perpetual"
        ? "LINEAR_PERPETUAL"
        : "UNKNOWN_DERIVATIVE",
      contractMultiplier: "1",
      priceTick: decimalFromPlaces(row.priceEndStep, row.pricePlace),
      quantityStep: row.sizeMultiplier ?? null,
      providerStatus: row.symbolStatus,
      lifecycleState,
      providerListTime,
      providerDelistTime,
      statusEffectiveAt: lifecycleState === "OFFLINE"
        ? providerDelistTime
        : lifecycleState === "MAINTENANCE" ||
            lifecycleState === "RESTRICTED"
          ? maintenanceTime
          : providerListTime,
      receivedAt: input.receivedAt,
      rawRecord,
      classificationHint: bitgetClassification(row),
      mappings,
      extraReasonCodes: [],
      targetContract,
    });
  });
  return finish(
    "BITGET_FUTURES",
    input.receivedAt,
    envelope.data.data.length,
    observations,
  );
}
