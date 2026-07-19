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

const VENUE = "OKX_SWAP" as const;
const HOST = "www.okx.com";
const URL = `https://${HOST}/api/v5/public/instruments?instType=SWAP`;

const EnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
});

const RowSchema = z.object({
  ctType: z.string(),
  ctVal: z.string(),
  ctValCcy: z.string(),
  instCategory: z.string().optional(),
  instFamily: z.string().optional(),
  instId: z.string(),
  instType: z.string(),
  quoteCcy: z.string().optional(),
  settleCcy: z.string(),
  state: z.string(),
  uly: z.string().optional(),
});

function providerFailure(code: string) {
  return ["50011", "50040"].includes(code)
    ? { kind: "RATE_LIMITED" as const, reasonCode: "okx_catalog_rate_limited" }
    : { kind: "INVALID" as const, reasonCode: "okx_catalog_provider_error" };
}

function quoteAsset(row: z.infer<typeof RowSchema>): string | null {
  if (row.quoteCcy?.trim()) {
    return row.quoteCcy;
  }
  const underlying = row.uly?.trim() || row.instFamily?.trim() || "";
  const match = /^([A-Z0-9]{1,32})-([A-Z0-9]{1,32})$/u.exec(
    underlying.toUpperCase(),
  );
  if (match === null || match[1] !== row.ctValCcy.toUpperCase()) {
    return null;
  }
  return match[2] ?? null;
}

function normalizeRow(rawRecord: unknown, rowIndex: number, observedAt: string) {
  const parsed = RowSchema.safeParse(rawRecord);
  if (!parsed.success) {
    return unresolvedCatalogRecord({
      observedAt,
      pageIndex: 0,
      rawRecord,
      reasonCode: "okx_catalog_row_schema_invalid",
      rowIndex,
      venue: VENUE,
    });
  }

  const row = parsed.data;
  const quote = quoteAsset(row);
  const cryptoCategory = row.instCategory === undefined || row.instCategory === "1";
  const supportedContract = row.instType === "SWAP" && row.ctType === "linear";
  const supportedSettlement =
    row.settleCcy.toUpperCase() === "USDT" && quote?.toUpperCase() === "USDT";
  const identity =
    supportedContract && supportedSettlement && cryptoCategory && quote !== null
      ? createInstrumentIdentity({
        baseAsset: row.ctValCcy,
        contractSize: row.ctVal,
        quoteAsset: quote,
        settlementAsset: row.settleCcy,
        venue: VENUE,
        venueInstrumentId: row.instId,
      })
      : null;

  let status: "ELIGIBLE" | "SUSPENDED" | "DELISTING" | "UNAVAILABLE" |
    "UNRESOLVED" | "UNSUPPORTED";
  let reasons: string[];
  if (!cryptoCategory) {
    status = "UNSUPPORTED";
    reasons = ["okx_instrument_not_crypto"];
  } else if (!supportedContract) {
    status = "UNSUPPORTED";
    reasons = ["okx_contract_not_linear_swap"];
  } else if (!supportedSettlement) {
    status = quote === null ? "UNRESOLVED" : "UNSUPPORTED";
    reasons = [
      quote === null
        ? "okx_quote_asset_unresolved"
        : "okx_contract_not_usdt_settled",
    ];
  } else if (identity === null) {
    status = "UNRESOLVED";
    reasons = ["okx_identity_invalid"];
  } else if (row.state === "live") {
    status = "ELIGIBLE";
    reasons = [];
  } else if (["suspend", "preopen", "test"].includes(row.state)) {
    status = "SUSPENDED";
    reasons = ["okx_contract_not_live"];
  } else if (["expiring", "expired"].includes(row.state)) {
    status = "DELISTING";
    reasons = ["okx_contract_closing"];
  } else {
    status = "UNAVAILABLE";
    reasons = ["okx_contract_status_unknown"];
  }

  return catalogAccountingRecord({
    identity,
    known: {
      baseAsset: row.ctValCcy,
      contractSize: row.ctVal,
      quoteAsset: quote,
      settlementAsset: row.settleCcy,
      supportedContract,
      venueInstrumentId: row.instId,
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

export async function fetchOkxCatalog(
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
      failure: { kind: "INVALID", reasonCode: "okx_catalog_schema_drift" },
      pageCount: 1,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }
  if (parsed.data.code !== "0") {
    return failedCatalog({
      failure: providerFailure(parsed.data.code),
      pageCount: 1,
      receivedAt: response.receivedAt,
      venue: VENUE,
    });
  }

  const accounting = parsed.data.data.map((row, index) =>
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
