import { z } from "zod";
import {
  createM1ListingAnnouncementObservation,
  type M1ListingAnnouncementObservation,
} from "../listing-lifecycle-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";

export type M1AnnouncementNormalizationResult = Readonly<{
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES";
  receivedAt: string;
  rawRecordCount: number;
  observations: readonly M1ListingAnnouncementObservation[];
  status: "PASS" | "PARTIAL" | "FAIL";
  reasonCodes: readonly string[];
  authorityBoundary:
    "ANNOUNCEMENT_NORMALIZATION_ONLY_NO_TITLE_SYMBOL_GUESSING_OR_CANDIDATE_AUTHORITY";
}>;

const BybitEnvelopeSchema = z.object({
  retCode: z.number().int(),
  result: z.object({
    total: z.number().int().nonnegative(),
    list: z.array(z.unknown()),
  }).passthrough(),
}).passthrough();

const BybitAnnouncementSchema = z.object({
  title: z.string(),
  type: z.object({
    key: z.string(),
  }).passthrough(),
  tags: z.array(z.string()).optional(),
  url: z.string(),
  publishTime: z.number().optional(),
  dateTimestamp: z.number().optional(),
  startDateTimestamp: z.number().optional(),
  startDataTimestamp: z.number().optional(),
}).passthrough();

const BitgetEnvelopeSchema = z.object({
  code: z.string(),
  data: z.array(z.unknown()),
}).passthrough();

const BitgetAnnouncementSchema = z.object({
  annId: z.string(),
  annTitle: z.string(),
  annUrl: z.string(),
  cTime: z.string(),
  annType: z.string().optional(),
  annSubType: z.string().optional(),
}).passthrough();

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function timestampFromMilliseconds(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return null;
  }
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function bybitListingAnnouncementSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = BybitEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    envelope.data.retCode === 0 &&
    envelope.data.result.list.every((record) => {
      const parsed = BybitAnnouncementSchema.safeParse(record);
      return parsed.success &&
        timestampFromMilliseconds(
          parsed.data.publishTime ?? parsed.data.dateTimestamp,
        ) !== null &&
        isHttpsUrl(parsed.data.url);
    });
}

export function bitgetListingAnnouncementSchemaConforms(
  payload: unknown,
): boolean {
  const envelope = BitgetEnvelopeSchema.safeParse(payload);
  return envelope.success &&
    envelope.data.code === "00000" &&
    envelope.data.data.every((record) => {
      const parsed = BitgetAnnouncementSchema.safeParse(record);
      return parsed.success &&
        timestampFromMilliseconds(parsed.data.cTime) !== null &&
        isHttpsUrl(parsed.data.annUrl);
    });
}

function finish(
  sourceId: M1AnnouncementNormalizationResult["sourceId"],
  receivedAt: string,
  rawRecordCount: number,
  observations: readonly M1ListingAnnouncementObservation[],
  reasonCodes: readonly string[],
): M1AnnouncementNormalizationResult {
  const status =
    rawRecordCount === 0 || observations.length === 0
      ? "FAIL"
      : observations.length === rawRecordCount && reasonCodes.length === 0
        ? "PASS"
        : "PARTIAL";
  return deepFreezeArtifact({
    sourceId,
    receivedAt,
    rawRecordCount,
    observations: [...observations],
    status,
    reasonCodes: uniqueSorted(reasonCodes),
    authorityBoundary:
      "ANNOUNCEMENT_NORMALIZATION_ONLY_NO_TITLE_SYMBOL_GUESSING_OR_CANDIDATE_AUTHORITY",
  });
}

function bybitKind(
  typeKey: string,
  tags: readonly string[],
): M1ListingAnnouncementObservation["announcementKind"] {
  const normalized = [typeKey, ...tags].map((value) =>
    value.trim().toLowerCase()
  );
  if (normalized.some((value) => value.includes("delist"))) {
    return "DELISTING";
  }
  if (
    normalized.includes("new_crypto") ||
    normalized.some((value) => value === "spot listings")
  ) {
    return "LISTING";
  }
  return normalized.some((value) =>
      value.includes("product") || value.includes("maintenance")
    )
    ? "PRODUCT_UPDATE"
    : "OTHER";
}

function bybitProductScope(
  tags: readonly string[],
): M1ListingAnnouncementObservation["productScope"] {
  const normalized = tags.map((value) => value.trim().toLowerCase());
  const spot = normalized.some((value) => value.includes("spot"));
  const derivative = normalized.some((value) =>
    value.includes("derivative") ||
    value.includes("futures") ||
    value.includes("perpetual")
  );
  return spot && derivative
    ? "MIXED"
    : spot
      ? "SPOT"
      : derivative
        ? "DERIVATIVE"
        : "UNKNOWN";
}

export function normalizeBybitListingAnnouncements(input: {
  payload: unknown;
  receivedAt: string;
}): M1AnnouncementNormalizationResult {
  const envelope = BybitEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success || envelope.data.retCode !== 0) {
    return finish(
      "BYBIT_DERIVATIVES",
      input.receivedAt,
      0,
      [],
      [
        envelope.success
          ? "bybit_announcement_provider_error"
          : "bybit_announcement_schema_invalid",
      ],
    );
  }
  const observations: M1ListingAnnouncementObservation[] = [];
  const reasonCodes: string[] = [];
  for (const rawRecord of envelope.data.result.list) {
    const parsed = BybitAnnouncementSchema.safeParse(rawRecord);
    if (!parsed.success) {
      reasonCodes.push("bybit_announcement_row_schema_invalid");
      continue;
    }
    const row = parsed.data;
    const publishedAt = timestampFromMilliseconds(
      row.publishTime ?? row.dateTimestamp,
    );
    if (publishedAt === null || !isHttpsUrl(row.url)) {
      reasonCodes.push("bybit_announcement_time_or_url_invalid");
      continue;
    }
    const tags = row.tags ?? [];
    observations.push(createM1ListingAnnouncementObservation({
      sourceId: "BYBIT_DERIVATIVES",
      announcementId:
        `bybit:${stableContentHash({
          url: row.url,
          publishedAt,
        }).slice(7, 31)}`,
      announcementUrl: row.url,
      titleDigest: stableContentHash(row.title),
      announcementKind: bybitKind(row.type.key, tags),
      productScope: bybitProductScope(tags),
      providerPublishedAt: publishedAt,
      providerEffectiveAt: timestampFromMilliseconds(
        row.startDateTimestamp ?? row.startDataTimestamp,
      ),
      knowledgeTime: input.receivedAt,
      structuredVenueInstrumentIds: [],
      instrumentLinkAuthority: "UNLINKED_NO_SYMBOL_GUESSING",
      sourceCapability: "LISTING_ANNOUNCEMENT",
      sourceRecordDigest: stableContentHash(rawRecord),
      reasonCodes: ["announcement_has_no_structured_instrument_id"],
    }));
  }
  return finish(
    "BYBIT_DERIVATIVES",
    input.receivedAt,
    envelope.data.result.list.length,
    observations,
    reasonCodes,
  );
}

function bitgetKind(
  annType: string | undefined,
): M1ListingAnnouncementObservation["announcementKind"] {
  if (annType === "coin_listings") {
    return "LISTING";
  }
  if (annType === "symbol_delisting") {
    return "DELISTING";
  }
  if (
    annType === "product_updates" ||
    annType === "maintenance_system_updates" ||
    annType === "api_trading"
  ) {
    return "PRODUCT_UPDATE";
  }
  return "OTHER";
}

function bitgetProductScope(
  annSubType: string | undefined,
): M1ListingAnnouncementObservation["productScope"] {
  if (annSubType === "spot") {
    return "SPOT";
  }
  if (annSubType === "futures") {
    return "DERIVATIVE";
  }
  return "UNKNOWN";
}

export function normalizeBitgetListingAnnouncements(input: {
  payload: unknown;
  receivedAt: string;
}): M1AnnouncementNormalizationResult {
  const envelope = BitgetEnvelopeSchema.safeParse(input.payload);
  if (!envelope.success || envelope.data.code !== "00000") {
    return finish(
      "BITGET_FUTURES",
      input.receivedAt,
      0,
      [],
      [
        envelope.success
          ? "bitget_announcement_provider_error"
          : "bitget_announcement_schema_invalid",
      ],
    );
  }
  const observations: M1ListingAnnouncementObservation[] = [];
  const reasonCodes: string[] = [];
  for (const rawRecord of envelope.data.data) {
    const parsed = BitgetAnnouncementSchema.safeParse(rawRecord);
    if (!parsed.success) {
      reasonCodes.push("bitget_announcement_row_schema_invalid");
      continue;
    }
    const row = parsed.data;
    const publishedAt = timestampFromMilliseconds(row.cTime);
    if (publishedAt === null || !isHttpsUrl(row.annUrl)) {
      reasonCodes.push("bitget_announcement_time_or_url_invalid");
      continue;
    }
    observations.push(createM1ListingAnnouncementObservation({
      sourceId: "BITGET_FUTURES",
      announcementId: `bitget:${row.annId.trim()}`,
      announcementUrl: row.annUrl,
      titleDigest: stableContentHash(row.annTitle),
      announcementKind: bitgetKind(row.annType),
      productScope: bitgetProductScope(row.annSubType),
      providerPublishedAt: publishedAt,
      providerEffectiveAt: null,
      knowledgeTime: input.receivedAt,
      structuredVenueInstrumentIds: [],
      instrumentLinkAuthority: "UNLINKED_NO_SYMBOL_GUESSING",
      sourceCapability: "LISTING_ANNOUNCEMENT",
      sourceRecordDigest: stableContentHash(rawRecord),
      reasonCodes: ["announcement_has_no_structured_instrument_id"],
    }));
  }
  return finish(
    "BITGET_FUTURES",
    input.receivedAt,
    envelope.data.data.length,
    observations,
    reasonCodes,
  );
}
