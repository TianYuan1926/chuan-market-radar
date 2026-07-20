import { z } from "zod";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { markPriceObservation } from "../mark-price-normalization";
import {
  failedPriceSnapshotBatch,
  type VenuePriceSnapshotResult,
} from "../price-snapshot-types";

const VENUE = "BYBIT_LINEAR_PERPETUAL" as const;
const HOST = "api.bybit.com";
const URL = `https://${HOST}/v5/market/tickers?category=linear`;

const EnvelopeSchema = z.object({
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
  }),
  retCode: z.number().int(),
  time: z.unknown().optional(),
});
const RetCodeSchema = z.object({ retCode: z.number().int() });
const RowSchema = z.object({
  markPrice: z.unknown().optional(),
  symbol: z.unknown().optional(),
});

export async function fetchBybitMarkPrices(
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

  const retCode = RetCodeSchema.safeParse(response.data);
  if (retCode.success && retCode.data.retCode !== 0) {
    return failedPriceSnapshotBatch({
      failure: retCode.data.retCode === 10006
        ? { kind: "RATE_LIMITED", reasonCode: "bybit_mark_price_rate_limited" }
        : { kind: "INVALID", reasonCode: "bybit_mark_price_provider_error" },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const envelope = EnvelopeSchema.safeParse(response.data);
  if (
    !envelope.success ||
    envelope.data.retCode !== 0 ||
    envelope.data.result.category !== "linear"
  ) {
    return failedPriceSnapshotBatch({
      failure: {
        kind: "INVALID",
        reasonCode: "bybit_mark_price_schema_drift",
      },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const observations = envelope.data.result.list.map((rawRecord, rowIndex) => {
    const row = RowSchema.safeParse(rawRecord);
    return markPriceObservation({
      eventTimestamp: envelope.data.time,
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
