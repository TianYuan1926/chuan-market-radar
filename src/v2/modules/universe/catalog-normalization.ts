import type {
  InstrumentAccountingRecord,
  InstrumentAccountingStatus,
  InstrumentIdentity,
} from "../../domain/contracts";
import type { TargetVenue } from "../../domain/product-constitution";
import {
  createObservationId,
  normalizeAssetCode,
  normalizePositiveDecimal,
  normalizeVenueInstrumentId,
} from "./identity";

type KnownIdentityFields = {
  baseAsset?: string | null;
  contractSize?: string | null;
  quoteAsset?: string | null;
  settlementAsset?: string | null;
  supportedContract?: boolean;
  venueInstrumentId?: string | null;
};

export function catalogAccountingRecord(input: {
  identity: InstrumentIdentity | null;
  known?: KnownIdentityFields;
  observedAt: string;
  pageIndex: number;
  rawRecord: unknown;
  rowIndex: number;
  status: InstrumentAccountingStatus;
  statusReasons: readonly string[];
  venue: TargetVenue;
}): InstrumentAccountingRecord {
  const known = input.known ?? {};
  const identity = input.identity;

  return {
    observationId: createObservationId(
      input.venue,
      input.pageIndex,
      input.rowIndex,
      input.rawRecord,
    ),
    canonicalInstrumentId: identity?.canonicalInstrumentId ?? null,
    underlyingGroupId: identity?.underlyingGroupId ?? null,
    venue: input.venue,
    venueInstrumentId:
      identity?.venueInstrumentId ??
      (typeof known.venueInstrumentId === "string"
        ? normalizeVenueInstrumentId(known.venueInstrumentId)
        : null),
    baseAsset:
      identity?.baseAsset ??
      (typeof known.baseAsset === "string"
        ? normalizeAssetCode(known.baseAsset)
        : null),
    quoteAsset:
      identity?.quoteAsset ??
      (typeof known.quoteAsset === "string"
        ? normalizeAssetCode(known.quoteAsset)
        : null),
    settlementAsset:
      identity?.settlementAsset ??
      (typeof known.settlementAsset === "string"
        ? normalizeAssetCode(known.settlementAsset)
        : null),
    contractType:
      identity?.contractType ??
      (known.supportedContract === true ? "LINEAR_PERPETUAL" : null),
    contractSize:
      identity?.contractSize ??
      (typeof known.contractSize === "string"
        ? normalizePositiveDecimal(known.contractSize)
        : null),
    status: input.status,
    statusReasons: [...new Set(input.statusReasons)].sort(),
    observedAt: input.observedAt,
    eligible: input.status === "ELIGIBLE",
  };
}

export function unresolvedCatalogRecord(input: {
  observedAt: string;
  pageIndex: number;
  rawRecord: unknown;
  reasonCode: string;
  rowIndex: number;
  venue: TargetVenue;
}): InstrumentAccountingRecord {
  return catalogAccountingRecord({
    identity: null,
    observedAt: input.observedAt,
    pageIndex: input.pageIndex,
    rawRecord: input.rawRecord,
    rowIndex: input.rowIndex,
    status: "UNRESOLVED",
    statusReasons: [input.reasonCode],
    venue: input.venue,
  });
}
