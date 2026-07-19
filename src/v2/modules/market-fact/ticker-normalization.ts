import type { TargetVenue } from "../../domain/product-constitution";
import {
  normalizePositiveDecimal,
  normalizeVenueInstrumentId,
} from "../universe/identity";
import { stableSha256 } from "../universe/stable-artifact";
import type { TickerObservation } from "./ticker-types";

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

export function tickerObservation(input: {
  eventTimestamp: unknown;
  rawRecord: unknown;
  rowIndex: number;
  value: unknown;
  venue: TargetVenue;
  venueInstrumentId: unknown;
}): TickerObservation {
  const venueInstrumentId = typeof input.venueInstrumentId === "string"
    ? normalizeVenueInstrumentId(input.venueInstrumentId)
    : null;
  const value = typeof input.value === "string"
    ? normalizePositiveDecimal(input.value)
    : null;
  const time = unixMilliseconds(input.eventTimestamp);
  const reasonCodes: string[] = [];
  if (venueInstrumentId === null) {
    reasonCodes.push("ticker_instrument_id_invalid");
  }
  if (value === null) {
    reasonCodes.push("ticker_price_invalid");
  }
  if (time === null) {
    reasonCodes.push("ticker_event_time_invalid");
  }

  return {
    eventTime: time?.eventTime ?? null,
    qualityStatus: reasonCodes.length === 0 ? "FRESH" : "INVALID",
    reasonCodes,
    sequence: time?.sequence ?? null,
    sourceRecordId:
      `${input.venue}:ticker:${input.rowIndex}:` +
      stableSha256(input.rawRecord).slice(0, 20),
    value,
    venue: input.venue,
    venueInstrumentId,
  };
}
