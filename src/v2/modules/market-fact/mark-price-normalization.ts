import type { TargetVenue } from "../../domain/product-constitution";
import {
  normalizePositiveDecimal,
  normalizeVenueInstrumentId,
} from "../universe/identity";
import { stableSha256 } from "../universe/stable-artifact";
import type { PriceSnapshotObservation } from "./price-snapshot-types";

export function unixMilliseconds(value: unknown): {
  eventTime: string;
  sequence: string;
} | null {
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
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return { eventTime: date.toISOString(), sequence: text };
}

export function markPriceObservation(input: {
  eventTimestamp: unknown;
  rawRecord: unknown;
  rowIndex: number;
  value: unknown;
  venue: TargetVenue;
  venueInstrumentId: unknown;
}): PriceSnapshotObservation {
  const venueInstrumentId = typeof input.venueInstrumentId === "string"
    ? normalizeVenueInstrumentId(input.venueInstrumentId)
    : null;
  const value = typeof input.value === "string"
    ? normalizePositiveDecimal(input.value)
    : null;
  const time = unixMilliseconds(input.eventTimestamp);
  const reasonCodes: string[] = [];
  if (venueInstrumentId === null) {
    reasonCodes.push("mark_price_instrument_id_invalid");
  }
  if (value === null) {
    reasonCodes.push("mark_price_value_invalid");
  }
  if (time === null) {
    reasonCodes.push("mark_price_event_time_invalid");
  }

  return {
    eventTimeBasis: "MARK_PRICE_SNAPSHOT",
    eventTime: time?.eventTime ?? null,
    factType: "MARK_PRICE",
    qualityStatus: reasonCodes.length === 0 ? "FRESH" : "INVALID",
    reasonCodes,
    sequence: time?.sequence ?? null,
    sourceRecordId:
      `${input.venue}:mark-price:${input.rowIndex}:` +
      stableSha256(input.rawRecord).slice(0, 20),
    value,
    venue: input.venue,
    venueInstrumentId,
  };
}
