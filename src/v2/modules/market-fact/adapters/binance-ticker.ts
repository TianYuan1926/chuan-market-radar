import { z } from "zod";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { tickerObservation } from "../ticker-normalization";
import {
  failedTickerBatch,
  type VenueTickerResult,
} from "../ticker-types";

const VENUE = "BINANCE_FUTURES" as const;
const HOST = "fapi.binance.com";
const URL = `https://${HOST}/fapi/v2/ticker/price`;

const EnvelopeSchema = z.array(z.unknown());
const RowSchema = z.object({
  price: z.unknown().optional(),
  symbol: z.unknown().optional(),
  time: z.unknown().optional(),
});

export async function fetchBinanceTickers(
  transport: PublicJsonTransport,
): Promise<VenueTickerResult> {
  const response = await transport({ allowedHost: HOST, url: URL });
  if (!response.ok) {
    return failedTickerBatch({
      failure: response.failure,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const envelope = EnvelopeSchema.safeParse(response.data);
  if (!envelope.success) {
    return failedTickerBatch({
      failure: { kind: "INVALID", reasonCode: "binance_ticker_schema_drift" },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const observations = envelope.data.map((rawRecord, rowIndex) => {
    const row = RowSchema.safeParse(rawRecord);
    return tickerObservation({
      eventTimestamp: row.success ? row.data.time : null,
      rawRecord,
      rowIndex,
      value: row.success ? row.data.price : null,
      venue: VENUE,
      venueInstrumentId: row.success ? row.data.symbol : null,
    });
  });
  return {
    issues: observations.flatMap((observation) => observation.reasonCodes),
    observations,
    ok: true,
    receivedAt: response.receivedAt,
    venue: VENUE,
  };
}
