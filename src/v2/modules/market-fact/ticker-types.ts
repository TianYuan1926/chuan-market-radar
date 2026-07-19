import type { TargetVenue } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";
import type { ProviderFailure } from "../universe/catalog-types";

export type TickerObservation = {
  eventTime: string | null;
  qualityStatus: DataQualityState;
  reasonCodes: readonly string[];
  sequence: string | null;
  sourceRecordId: string;
  value: string | null;
  venue: TargetVenue;
  venueInstrumentId: string | null;
};

type VenueTickerBase = {
  issues: readonly string[];
  observations: readonly TickerObservation[];
  receivedAt: string;
  venue: TargetVenue;
};

export type VenueTickerSuccess = VenueTickerBase & { ok: true };
export type VenueTickerFailure = VenueTickerBase & {
  failure: ProviderFailure;
  ok: false;
};
export type VenueTickerResult = VenueTickerSuccess | VenueTickerFailure;

export function failedTickerBatch(input: {
  failure: ProviderFailure;
  receivedAt: string;
  venue: TargetVenue;
}): VenueTickerFailure {
  return {
    failure: input.failure,
    issues: [input.failure.reasonCode],
    observations: [],
    ok: false,
    receivedAt: input.receivedAt,
    venue: input.venue,
  };
}
