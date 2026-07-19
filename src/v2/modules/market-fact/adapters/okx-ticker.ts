import { z } from "zod";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { tickerObservation } from "../ticker-normalization";
import {
  failedTickerBatch,
  type VenueTickerResult,
} from "../ticker-types";

const VENUE = "OKX_SWAP" as const;
const HOST = "www.okx.com";
const URL = `https://${HOST}/api/v5/market/tickers?instType=SWAP`;

const EnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
});
const RowSchema = z.object({
  instId: z.unknown().optional(),
  last: z.unknown().optional(),
  ts: z.unknown().optional(),
});

function providerFailure(code: string) {
  return ["50011", "50040"].includes(code)
    ? { kind: "RATE_LIMITED" as const, reasonCode: "okx_ticker_rate_limited" }
    : { kind: "INVALID" as const, reasonCode: "okx_ticker_provider_error" };
}

export async function fetchOkxTickers(
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
      failure: { kind: "INVALID", reasonCode: "okx_ticker_schema_drift" },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }
  if (envelope.data.code !== "0") {
    return failedTickerBatch({
      failure: providerFailure(envelope.data.code),
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const observations = envelope.data.data.map((rawRecord, rowIndex) => {
    const row = RowSchema.safeParse(rawRecord);
    return tickerObservation({
      eventTimestamp: row.success ? row.data.ts : null,
      rawRecord,
      rowIndex,
      value: row.success ? row.data.last : null,
      venue: VENUE,
      venueInstrumentId: row.success ? row.data.instId : null,
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
