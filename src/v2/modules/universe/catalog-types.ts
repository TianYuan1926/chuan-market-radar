import type {
  InstrumentAccountingRecord,
} from "../../domain/contracts";
import type { TargetVenue } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";

export type ProviderFailureKind = Extract<
  DataQualityState,
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "TRANSPORT_ERROR"
  | "INVALID"
  | "UNAVAILABLE"
>;

export type ProviderFailure = {
  kind: ProviderFailureKind;
  reasonCode: string;
};

type VenueCatalogBase = {
  accounting: readonly InstrumentAccountingRecord[];
  pageCount: number;
  receivedAt: string;
  sourceRecordIds: readonly string[];
  venue: TargetVenue;
};

export type VenueCatalogSuccess = VenueCatalogBase & {
  ok: true;
};

export type VenueCatalogFailure = VenueCatalogBase & {
  failure: ProviderFailure;
  ok: false;
};

export type VenueCatalogResult =
  | VenueCatalogSuccess
  | VenueCatalogFailure;

export function failedCatalog(input: {
  accounting?: readonly InstrumentAccountingRecord[];
  failure: ProviderFailure;
  pageCount?: number;
  receivedAt: string;
  sourceRecordIds?: readonly string[];
  venue: TargetVenue;
}): VenueCatalogFailure {
  return {
    accounting: input.accounting ?? [],
    failure: input.failure,
    ok: false,
    pageCount: input.pageCount ?? 0,
    receivedAt: input.receivedAt,
    sourceRecordIds: input.sourceRecordIds ?? [],
    venue: input.venue,
  };
}

export function unavailableAccounting(
  records: readonly InstrumentAccountingRecord[],
  reasonCode: string,
): readonly InstrumentAccountingRecord[] {
  return records.map((record) => ({
    ...record,
    eligible: false,
    status: "UNAVAILABLE" as const,
    statusReasons: [...new Set([...record.statusReasons, reasonCode])].sort(),
  }));
}
