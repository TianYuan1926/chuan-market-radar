import { z } from "zod";
import { createInstrumentIdentity } from "../identity";
import {
  catalogAccountingRecord,
  unresolvedCatalogRecord,
} from "../catalog-normalization";
import {
  failedCatalog,
  type VenueCatalogResult,
} from "../catalog-types";
import type { PublicJsonTransport } from "../public-json-transport";

const VENUE = "BINANCE_FUTURES" as const;
const HOST = "fapi.binance.com";
const URL = `https://${HOST}/fapi/v1/exchangeInfo`;

const EnvelopeSchema = z.object({
  symbols: z.array(z.unknown()),
});

const RowSchema = z.object({
  baseAsset: z.string(),
  contractType: z.string(),
  marginAsset: z.string(),
  quoteAsset: z.string(),
  status: z.string(),
  symbol: z.string(),
});

function normalizeRow(rawRecord: unknown, rowIndex: number, observedAt: string) {
  const parsed = RowSchema.safeParse(rawRecord);
  if (!parsed.success) {
    return unresolvedCatalogRecord({
      observedAt,
      pageIndex: 0,
      rawRecord,
      reasonCode: "binance_catalog_row_schema_invalid",
      rowIndex,
      venue: VENUE,
    });
  }

  const row = parsed.data;
  const supportedContract = row.contractType === "PERPETUAL";
  const supportedSettlement =
    row.quoteAsset.toUpperCase() === "USDT" &&
    row.marginAsset.toUpperCase() === "USDT";
  const identity = supportedContract && supportedSettlement
    ? createInstrumentIdentity({
      baseAsset: row.baseAsset,
      contractSize: "1",
      quoteAsset: row.quoteAsset,
      settlementAsset: row.marginAsset,
      venue: VENUE,
      venueInstrumentId: row.symbol,
    })
    : null;

  let status: "ELIGIBLE" | "SUSPENDED" | "DELISTING" | "UNAVAILABLE" |
    "UNRESOLVED" | "UNSUPPORTED";
  let reasons: string[];
  if (!supportedContract) {
    status = "UNSUPPORTED";
    reasons = ["binance_contract_not_perpetual"];
  } else if (!supportedSettlement) {
    status = "UNSUPPORTED";
    reasons = ["binance_contract_not_linear_usdt_settled"];
  } else if (identity === null) {
    status = "UNRESOLVED";
    reasons = ["binance_identity_invalid"];
  } else if (row.status === "TRADING") {
    status = "ELIGIBLE";
    reasons = [];
  } else if (row.status === "PENDING_TRADING") {
    status = "SUSPENDED";
    reasons = ["binance_contract_pending_trading"];
  } else if (
    [
      "PRE_DELIVERING",
      "DELIVERING",
      "DELIVERED",
      "PRE_SETTLE",
      "SETTLING",
      "CLOSE",
    ].includes(row.status)
  ) {
    status = "DELISTING";
    reasons = ["binance_contract_closing"];
  } else {
    status = "UNAVAILABLE";
    reasons = ["binance_contract_status_unknown"];
  }

  return catalogAccountingRecord({
    identity,
    known: {
      baseAsset: row.baseAsset,
      contractSize: "1",
      quoteAsset: row.quoteAsset,
      settlementAsset: row.marginAsset,
      supportedContract,
      venueInstrumentId: row.symbol,
    },
    observedAt,
    pageIndex: 0,
    rawRecord,
    rowIndex,
    status,
    statusReasons: reasons,
    venue: VENUE,
  });
}

export async function fetchBinanceCatalog(
  transport: PublicJsonTransport,
): Promise<VenueCatalogResult> {
  const response = await transport({ allowedHost: HOST, url: URL });
  if (!response.ok) {
    return failedCatalog({
      failure: response.failure,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const parsed = EnvelopeSchema.safeParse(response.data);
  if (!parsed.success) {
    return failedCatalog({
      failure: {
        kind: "INVALID",
        reasonCode: "binance_catalog_schema_drift",
      },
      pageCount: 1,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const accounting = parsed.data.symbols.map((row, index) =>
    normalizeRow(row, index, response.receivedAt));
  return {
    accounting,
    ok: true,
    pageCount: 1,
    receivedAt: response.receivedAt,
    sourceRecordIds: accounting.map((record) => record.observationId),
    venue: VENUE,
  };
}
