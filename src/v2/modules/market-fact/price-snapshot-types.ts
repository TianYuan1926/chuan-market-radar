import type { TargetVenue } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";
import type { ProviderFailure } from "../universe/catalog-types";

export type PriceSnapshotObservation = {
  eventTimeBasis: "MARK_PRICE_SNAPSHOT";
  eventTime: string | null;
  factType: "MARK_PRICE";
  qualityStatus: DataQualityState;
  reasonCodes: readonly string[];
  sequence: string | null;
  sourceRecordId: string;
  value: string | null;
  venue: TargetVenue;
  venueInstrumentId: string | null;
};

type VenuePriceSnapshotBase = {
  issues: readonly string[];
  observations: readonly PriceSnapshotObservation[];
  receivedAt: string;
  venue: TargetVenue;
};

export type VenuePriceSnapshotSuccess = VenuePriceSnapshotBase & { ok: true };
export type VenuePriceSnapshotFailure = VenuePriceSnapshotBase & {
  failure: ProviderFailure;
  ok: false;
};
export type VenuePriceSnapshotResult =
  | VenuePriceSnapshotSuccess
  | VenuePriceSnapshotFailure;

export function failedPriceSnapshotBatch(input: {
  failure: ProviderFailure;
  receivedAt: string;
  venue: TargetVenue;
}): VenuePriceSnapshotFailure {
  return {
    failure: input.failure,
    issues: [input.failure.reasonCode],
    observations: [],
    ok: false,
    receivedAt: input.receivedAt,
    venue: input.venue,
  };
}
