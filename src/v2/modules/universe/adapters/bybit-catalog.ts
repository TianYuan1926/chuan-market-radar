import { z } from "zod";
import { createInstrumentIdentity } from "../identity";
import {
  catalogAccountingRecord,
  unresolvedCatalogRecord,
} from "../catalog-normalization";
import {
  failedCatalog,
  type ProviderFailure,
  unavailableAccounting,
  type VenueCatalogResult,
} from "../catalog-types";
import type { PublicJsonTransport } from "../public-json-transport";

const VENUE = "BYBIT_LINEAR_PERPETUAL" as const;
const HOST = "api.bybit.com";
const BASE_URL = `https://${HOST}/v5/market/instruments-info`;

const EnvelopeSchema = z.object({
  result: z.object({
    category: z.string(),
    list: z.array(z.unknown()),
    nextPageCursor: z.string().optional(),
  }),
  retCode: z.number().int(),
});
const RetCodeSchema = z.object({ retCode: z.number().int() });

const RowSchema = z.object({
  baseCoin: z.string(),
  contractType: z.string(),
  isPreListing: z.boolean().optional(),
  quoteCoin: z.string(),
  settleCoin: z.string(),
  status: z.string(),
  symbol: z.string(),
});

function normalizeRow(
  rawRecord: unknown,
  pageIndex: number,
  rowIndex: number,
  observedAt: string,
) {
  const parsed = RowSchema.safeParse(rawRecord);
  if (!parsed.success) {
    return unresolvedCatalogRecord({
      observedAt,
      pageIndex,
      rawRecord,
      reasonCode: "bybit_catalog_row_schema_invalid",
      rowIndex,
      venue: VENUE,
    });
  }

  const row = parsed.data;
  const supportedContract = row.contractType === "LinearPerpetual";
  const supportedSettlement =
    row.quoteCoin.toUpperCase() === "USDT" &&
    row.settleCoin.toUpperCase() === "USDT";
  const identity = supportedContract && supportedSettlement
    ? createInstrumentIdentity({
      baseAsset: row.baseCoin,
      contractSize: "1",
      quoteAsset: row.quoteCoin,
      settlementAsset: row.settleCoin,
      venue: VENUE,
      venueInstrumentId: row.symbol,
    })
    : null;

  let status: "ELIGIBLE" | "SUSPENDED" | "DELISTING" | "UNAVAILABLE" |
    "UNRESOLVED" | "UNSUPPORTED";
  let reasons: string[];
  if (!supportedContract) {
    status = "UNSUPPORTED";
    reasons = ["bybit_contract_not_linear_perpetual"];
  } else if (!supportedSettlement) {
    status = "UNSUPPORTED";
    reasons = ["bybit_contract_not_usdt_settled"];
  } else if (identity === null) {
    status = "UNRESOLVED";
    reasons = ["bybit_identity_invalid"];
  } else if (row.status === "Trading" && row.isPreListing !== true) {
    status = "ELIGIBLE";
    reasons = [];
  } else if (row.status === "PreLaunch" || row.isPreListing === true) {
    status = "SUSPENDED";
    reasons = ["bybit_contract_prelaunch"];
  } else if (["Settling", "Closed", "Delivering"].includes(row.status)) {
    status = "DELISTING";
    reasons = ["bybit_contract_closing"];
  } else {
    status = "UNAVAILABLE";
    reasons = ["bybit_contract_status_unknown"];
  }

  return catalogAccountingRecord({
    identity,
    known: {
      baseAsset: row.baseCoin,
      contractSize: "1",
      quoteAsset: row.quoteCoin,
      settlementAsset: row.settleCoin,
      supportedContract,
      venueInstrumentId: row.symbol,
    },
    observedAt,
    pageIndex,
    rawRecord,
    rowIndex,
    status,
    statusReasons: reasons,
    venue: VENUE,
  });
}

function providerFailure(retCode: number): ProviderFailure {
  if (retCode === 10006) {
    return { kind: "RATE_LIMITED", reasonCode: "bybit_catalog_rate_limited" };
  }
  return { kind: "INVALID", reasonCode: "bybit_catalog_provider_error" };
}

export async function fetchBybitCatalog(
  transport: PublicJsonTransport,
  options: { maxPages?: number } = {},
): Promise<VenueCatalogResult> {
  const maxPages = options.maxPages ?? 32;
  if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
    throw new RangeError("maxPages must be a positive safe integer");
  }

  const accounting = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let pageCount = 0;
  let lastReceivedAt = new Date(0).toISOString();

  while (pageCount < maxPages) {
    const url = new URL(BASE_URL);
    url.searchParams.set("category", "linear");
    url.searchParams.set("limit", "1000");
    if (cursor !== null) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await transport({
      allowedHost: HOST,
      url: url.toString(),
    });
    lastReceivedAt = response.receivedAt;
    if (!response.ok) {
      const reasonCode = pageCount === 0
        ? response.failure.reasonCode
        : "bybit_pagination_incomplete";
      return failedCatalog({
        accounting: unavailableAccounting(accounting, reasonCode),
        failure: pageCount === 0
          ? response.failure
          : { kind: "UNAVAILABLE", reasonCode },
        pageCount,
        receivedAt: response.receivedAt,
        sourceRecordIds: accounting.map((record) => record.observationId),
        venue: VENUE,
      });
    }

    const retCode = RetCodeSchema.safeParse(response.data);
    if (retCode.success && retCode.data.retCode !== 0) {
      return failedCatalog({
        accounting: unavailableAccounting(
          accounting,
          "bybit_pagination_incomplete",
        ),
        failure: providerFailure(retCode.data.retCode),
        pageCount: pageCount + 1,
        receivedAt: response.receivedAt,
        sourceRecordIds: accounting.map((record) => record.observationId),
        venue: VENUE,
      });
    }

    const parsed = EnvelopeSchema.safeParse(response.data);
    if (
      !parsed.success ||
      parsed.data.result.category !== "linear" ||
      parsed.data.retCode !== 0
    ) {
      return failedCatalog({
        accounting: unavailableAccounting(
          accounting,
          "bybit_pagination_incomplete",
        ),
        failure: {
          kind: "INVALID",
          reasonCode: "bybit_catalog_schema_drift",
        },
        pageCount: pageCount + 1,
        receivedAt: response.receivedAt,
        sourceRecordIds: accounting.map((record) => record.observationId),
        venue: VENUE,
      });
    }

    const pageIndex = pageCount;
    accounting.push(
      ...parsed.data.result.list.map((row, rowIndex) =>
        normalizeRow(row, pageIndex, rowIndex, response.receivedAt)),
    );
    pageCount += 1;

    const nextCursor = parsed.data.result.nextPageCursor?.trim() ?? "";
    if (nextCursor === "") {
      return {
        accounting,
        ok: true,
        pageCount,
        receivedAt: response.receivedAt,
        sourceRecordIds: accounting.map((record) => record.observationId),
        venue: VENUE,
      };
    }
    if (cursors.has(nextCursor) || nextCursor === cursor) {
      return failedCatalog({
        accounting: unavailableAccounting(
          accounting,
          "bybit_pagination_cursor_repeated",
        ),
        failure: {
          kind: "INVALID",
          reasonCode: "bybit_pagination_cursor_repeated",
        },
        pageCount,
        receivedAt: response.receivedAt,
        sourceRecordIds: accounting.map((record) => record.observationId),
        venue: VENUE,
      });
    }
    cursors.add(nextCursor);
    cursor = nextCursor;
  }

  return failedCatalog({
    accounting: unavailableAccounting(accounting, "bybit_pagination_truncated"),
    failure: { kind: "INVALID", reasonCode: "bybit_pagination_truncated" },
    pageCount,
    receivedAt: lastReceivedAt,
    sourceRecordIds: accounting.map((record) => record.observationId),
    venue: VENUE,
  });
}
