import { z } from "zod";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { markPriceObservation } from "../mark-price-normalization";
import {
  failedPriceSnapshotBatch,
  type VenuePriceSnapshotResult,
} from "../price-snapshot-types";

const VENUE = "BINANCE_FUTURES" as const;
const HOST = "fapi.binance.com";
const URL = `https://${HOST}/fapi/v1/premiumIndex`;

const EnvelopeSchema = z.array(z.unknown());
const RowSchema = z.object({
  markPrice: z.unknown().optional(),
  symbol: z.unknown().optional(),
  time: z.unknown().optional(),
});

export async function fetchBinanceMarkPrices(
  transport: PublicJsonTransport,
): Promise<VenuePriceSnapshotResult> {
  const response = await transport({ allowedHost: HOST, url: URL });
  if (!response.ok) {
    return failedPriceSnapshotBatch({
      failure: response.failure,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const envelope = EnvelopeSchema.safeParse(response.data);
  if (!envelope.success) {
    return failedPriceSnapshotBatch({
      failure: {
        kind: "INVALID",
        reasonCode: "binance_mark_price_schema_drift",
      },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const observations = envelope.data.map((rawRecord, rowIndex) => {
    const row = RowSchema.safeParse(rawRecord);
    return markPriceObservation({
      eventTimestamp: row.success ? row.data.time : null,
      rawRecord,
      rowIndex,
      value: row.success ? row.data.markPrice : null,
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
