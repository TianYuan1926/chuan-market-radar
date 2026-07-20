import { z } from "zod";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { markPriceObservation } from "../mark-price-normalization";
import {
  failedPriceSnapshotBatch,
  type VenuePriceSnapshotResult,
} from "../price-snapshot-types";

const VENUE = "OKX_SWAP" as const;
const HOST = "www.okx.com";
const URL = `https://${HOST}/api/v5/public/mark-price?instType=SWAP`;

const EnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
});
const RowSchema = z.object({
  instId: z.unknown().optional(),
  markPx: z.unknown().optional(),
  ts: z.unknown().optional(),
});

function providerFailure(code: string) {
  return ["50011", "50040"].includes(code)
    ? { kind: "RATE_LIMITED" as const, reasonCode: "okx_mark_price_rate_limited" }
    : { kind: "INVALID" as const, reasonCode: "okx_mark_price_provider_error" };
}

export async function fetchOkxMarkPrices(
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
        reasonCode: "okx_mark_price_schema_drift",
      },
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }
  if (envelope.data.code !== "0") {
    return failedPriceSnapshotBatch({
      failure: providerFailure(envelope.data.code),
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const observations = envelope.data.data.map((rawRecord, rowIndex) => {
    const row = RowSchema.safeParse(rawRecord);
    return markPriceObservation({
      eventTimestamp: row.success ? row.data.ts : null,
      rawRecord,
      rowIndex,
      value: row.success ? row.data.markPx : null,
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
