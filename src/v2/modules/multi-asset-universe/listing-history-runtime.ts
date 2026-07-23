import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
} from "../../runtime-schema/primitives";
import {
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  M1ListingAnnouncementObservationSchema,
  type M1ListingAnnouncementObservation,
} from "./listing-lifecycle-contract";
import {
  bitgetListingAnnouncementSchemaConforms,
  bybitListingAnnouncementSchemaConforms,
  normalizeBitgetListingAnnouncements,
  normalizeBybitListingAnnouncements,
} from "./adapters/bybit-bitget-listing-announcements";
import {
  M1RuntimeAdapterProfileSchema,
  type M1RuntimeAdapterProfile,
} from "../collector/runtime-adapter-profile";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";

export const M1_LISTING_HISTORY_PAGE_VERSION =
  "v2-m1-listing-history-page.v1" as const;
export const M1_LISTING_HISTORY_CHECKPOINT_VERSION =
  "v2-m1-listing-history-checkpoint.v1" as const;
export const M1_LISTING_HISTORY_GAP_VERSION =
  "v2-m1-listing-history-gap.v1" as const;

export const M1_LISTING_HISTORY_SOURCES = [
  "BYBIT_DERIVATIVES",
  "BITGET_FUTURES",
] as const;

export const M1_LISTING_HISTORY_GAP_REASONS = [
  "SOURCE_OR_PROFILE_DRIFT",
  "REQUEST_TOKEN_DISCONTINUITY",
  "PAGE_ORDINAL_DISCONTINUITY",
  "REPEATED_REQUEST_TOKEN",
  "EMPTY_NONTERMINAL_PAGE",
  "ANNOUNCEMENT_ID_CONTENT_CONFLICT",
  "NO_CHECKPOINT_OVERLAP",
  "INVALID_SEGMENT_STOP",
  "FUTURE_KNOWLEDGE",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ListingSourceSchema = z.enum(M1_LISTING_HISTORY_SOURCES);
const ListingModeSchema = z.enum(["BOOTSTRAP", "INCREMENTAL"]);
const ListingHistoryResponsibilitySchema = z.enum([
  "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED",
  "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED",
]);
const UniqueStringsSchema = z.array(NonEmptyStringSchema)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  });

function responsibilityFor(
  sourceId: (typeof M1_LISTING_HISTORY_SOURCES)[number],
) {
  return sourceId === "BYBIT_DERIVATIVES"
    ? "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED" as const
    : "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED" as const;
}

function validateListingProfile(
  profile: M1RuntimeAdapterProfile,
): asserts profile is M1RuntimeAdapterProfile & {
  sourceId: (typeof M1_LISTING_HISTORY_SOURCES)[number];
  capabilityId: "LISTING_ANNOUNCEMENT";
  historyResponsibility:
    | "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED"
    | "BITGET_OFFICIAL_ONE_MONTH_WINDOW_CHECKPOINTED";
} {
  M1RuntimeAdapterProfileSchema.parse(profile);
  if (
    !M1_LISTING_HISTORY_SOURCES.includes(
      profile.sourceId as (typeof M1_LISTING_HISTORY_SOURCES)[number],
    ) ||
    profile.capabilityId !== "LISTING_ANNOUNCEMENT" ||
    profile.operation !== "LISTING_HISTORY_SEGMENT" ||
    !profile.schedulerRouteEligible ||
    !profile.noAuthorityShadowEligible ||
    profile.historyResponsibility !==
      responsibilityFor(
        profile.sourceId as (typeof M1_LISTING_HISTORY_SOURCES)[number],
      )
  ) {
    throw new Error(
      "listing history requires an exact live-passed announcement profile",
    );
  }
}

const ListingHistoryPageCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_LISTING_HISTORY_PAGE_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  profileId: NonEmptyStringSchema,
  sourceId: ListingSourceSchema,
  historyResponsibility: ListingHistoryResponsibilitySchema,
  mode: ListingModeSchema,
  pageOrdinal: z.number().int().positive().max(10_000),
  requestToken: NonEmptyStringSchema,
  receivedAt: IsoDateTimeSchema,
  responseBodyHash: DigestSchema,
  rawRecordCount: NonNegativeIntegerSchema,
  normalizedRecordCount: NonNegativeIntegerSchema,
  providerReportedTotal: NonNegativeIntegerSchema.nullable(),
  nextRequestToken: NonEmptyStringSchema.nullable(),
  providerTerminal: z.boolean(),
  observations: z.array(M1ListingAnnouncementObservationSchema),
  rawBodyRetained: z.literal(false),
  secretMaterialPresent: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
});

export const M1ListingHistoryPageSchema =
  ListingHistoryPageCoreSchema.extend({
    pageId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((page, context) => {
    if (
      page.rawRecordCount !== page.normalizedRecordCount ||
      page.normalizedRecordCount !== page.observations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "listing history page cannot hide normalization loss",
        path: ["normalizedRecordCount"],
      });
    }
    if (page.providerTerminal !== (page.nextRequestToken === null)) {
      context.addIssue({
        code: "custom",
        message: "provider terminal status must match the next token",
        path: ["providerTerminal"],
      });
    }
    const announcementIds = page.observations.map((observation) =>
      observation.announcementId
    );
    if (new Set(announcementIds).size !== announcementIds.length) {
      context.addIssue({
        code: "custom",
        message: "one provider page cannot repeat an announcement id",
        path: ["observations"],
      });
    }
    for (const observation of page.observations) {
      if (
        observation.sourceId !== page.sourceId ||
        Date.parse(observation.knowledgeTime) > Date.parse(page.receivedAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "page observation source or knowledge time drifted",
          path: ["observations"],
        });
      }
    }
    if (page.sourceId === "BYBIT_DERIVATIVES") {
      const requestPage = parseBybitPageToken(page.requestToken);
      const nextPage = page.nextRequestToken === null
        ? null
        : parseBybitPageToken(page.nextRequestToken);
      if (
        requestPage === null ||
        (nextPage !== null && nextPage !== requestPage + 1) ||
        page.providerReportedTotal === null
      ) {
        context.addIssue({
          code: "custom",
          message: "Bybit listing page number chain is invalid",
          path: ["requestToken"],
        });
      }
    } else if (
      !(
        page.requestToken === "ROOT" ||
        page.requestToken.startsWith("cursor:")
      ) ||
      (
        page.nextRequestToken !== null &&
        !page.nextRequestToken.startsWith("cursor:")
      ) ||
      page.providerReportedTotal !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Bitget listing cursor chain is invalid",
        path: ["requestToken"],
      });
    }
    const expectedHash = stableContentHash(listingHistoryPageCore(page));
    if (page.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "listing history page content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      page.pageId !==
        `listing-history-page:${page.sourceId}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "listing history page id mismatch",
        path: ["pageId"],
      });
    }
  });

export type M1ListingHistoryPage = z.infer<
  typeof M1ListingHistoryPageSchema
>;

function listingHistoryPageCore(
  page: z.input<typeof ListingHistoryPageCoreSchema> & {
    readonly pageId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ListingHistoryPageCoreSchema> {
  return ListingHistoryPageCoreSchema.parse({
    schemaVersion: page.schemaVersion,
    scopeEpoch: page.scopeEpoch,
    releaseId: page.releaseId,
    profileId: page.profileId,
    sourceId: page.sourceId,
    historyResponsibility: page.historyResponsibility,
    mode: page.mode,
    pageOrdinal: page.pageOrdinal,
    requestToken: page.requestToken,
    receivedAt: page.receivedAt,
    responseBodyHash: page.responseBodyHash,
    rawRecordCount: page.rawRecordCount,
    normalizedRecordCount: page.normalizedRecordCount,
    providerReportedTotal: page.providerReportedTotal,
    nextRequestToken: page.nextRequestToken,
    providerTerminal: page.providerTerminal,
    observations: page.observations,
    rawBodyRetained: page.rawBodyRetained,
    secretMaterialPresent: page.secretMaterialPresent,
    candidateEmissionAllowed: page.candidateEmissionAllowed,
    strategyAuthorityGranted: page.strategyAuthorityGranted,
    readyAuthorityGranted: page.readyAuthorityGranted,
  });
}

function parseBybitPageToken(token: string): number | null {
  const match = /^page:([1-9][0-9]*)$/u.exec(token);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayAt(value: unknown, ...path: string[]): readonly unknown[] | null {
  let current = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) return null;
    current = record[key];
  }
  return Array.isArray(current) ? current : null;
}

function numberAt(value: unknown, ...path: string[]): number | null {
  let current = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) return null;
    current = record[key];
  }
  return typeof current === "number" && Number.isFinite(current)
    ? current
    : null;
}

function stringAt(value: unknown, ...path: string[]): string | null {
  let current = value;
  for (const key of path) {
    const record = object(current);
    if (record === null) return null;
    current = record[key];
  }
  return typeof current === "string" ? current : null;
}

export function buildM1ListingHistoryRequest(input: {
  profile: M1RuntimeAdapterProfile;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  checkpoint: M1ListingHistoryCheckpoint | null;
}): Readonly<{
  allowedHost: string;
  requestToken: string;
  url: string;
  credentialRequired: false;
  rawBodyRetentionAllowed: false;
}> {
  validateListingProfile(input.profile);
  if (input.checkpoint !== null) {
    M1ListingHistoryCheckpointSchema.parse(input.checkpoint);
    if (
      input.checkpoint.releaseId !== input.profile.runtimeReleaseId ||
      input.checkpoint.profileId !== input.profile.profileId ||
      input.checkpoint.sourceId !== input.profile.sourceId
    ) {
      throw new Error("listing history checkpoint and profile drifted");
    }
  }
  let requestToken: string;
  if (input.mode === "INCREMENTAL") {
    if (
      input.checkpoint === null ||
      input.checkpoint.status === "BOOTSTRAP_IN_PROGRESS"
    ) {
      throw new Error("incremental collection requires a complete bootstrap");
    }
    requestToken = input.profile.sourceId === "BYBIT_DERIVATIVES"
      ? "page:1"
      : "ROOT";
  } else {
    if (
      input.checkpoint !== null &&
      input.checkpoint.status !== "BOOTSTRAP_IN_PROGRESS"
    ) {
      throw new Error("completed listing history cannot restart bootstrap");
    }
    requestToken = input.checkpoint?.nextBootstrapRequestToken ??
      (input.profile.sourceId === "BYBIT_DERIVATIVES" ? "page:1" : "ROOT");
  }

  return buildM1ListingHistoryPageRequest({
    profile: input.profile,
    requestToken,
  });
}

export function buildM1ListingHistoryPageRequest(input: {
  profile: M1RuntimeAdapterProfile;
  requestToken: string;
}): Readonly<{
  allowedHost: string;
  requestToken: string;
  url: string;
  credentialRequired: false;
  rawBodyRetentionAllowed: false;
}> {
  validateListingProfile(input.profile);
  const requestToken = NonEmptyStringSchema.parse(input.requestToken);
  const url = new URL(input.profile.initialUrl);
  if (input.profile.sourceId === "BYBIT_DERIVATIVES") {
    const page = parseBybitPageToken(requestToken);
    if (page === null) throw new Error("invalid Bybit page token");
    url.searchParams.set("locale", "en-US");
    url.searchParams.set("type", "new_crypto");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "20");
  } else {
    url.searchParams.set("language", "en_US");
    url.searchParams.set("annType", "coin_listings");
    url.searchParams.set("limit", "10");
    if (requestToken === "ROOT") {
      url.searchParams.delete("cursor");
    } else if (requestToken.startsWith("cursor:")) {
      url.searchParams.set("cursor", requestToken.slice("cursor:".length));
    } else {
      throw new Error("invalid Bitget cursor token");
    }
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== input.profile.endpointHost
  ) {
    throw new Error("listing request escaped the exact profile host");
  }
  return deepFreezeArtifact({
    allowedHost: input.profile.endpointHost,
    requestToken,
    url: url.toString(),
    credentialRequired: false,
    rawBodyRetentionAllowed: false,
  });
}

export function parseM1ListingHistoryPage(input: {
  profile: M1RuntimeAdapterProfile;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  pageOrdinal: number;
  requestToken: string;
  receivedAt: string;
  responseBodyHash: string;
  payload: unknown;
}): M1ListingHistoryPage {
  validateListingProfile(input.profile);
  DigestSchema.parse(input.responseBodyHash);
  IsoDateTimeSchema.parse(input.receivedAt);

  let observations: readonly M1ListingAnnouncementObservation[];
  let rawRecordCount: number;
  let providerReportedTotal: number | null;
  let nextRequestToken: string | null;
  if (input.profile.sourceId === "BYBIT_DERIVATIVES") {
    if (!bybitListingAnnouncementSchemaConforms(input.payload)) {
      throw new Error("Bybit listing page failed exact schema conformance");
    }
    const records = arrayAt(input.payload, "result", "list");
    const total = numberAt(input.payload, "result", "total");
    const page = parseBybitPageToken(input.requestToken);
    if (
      records === null ||
      total === null ||
      !Number.isSafeInteger(total) ||
      page === null
    ) {
      throw new Error("Bybit listing page metadata is incomplete");
    }
    const normalized = normalizeBybitListingAnnouncements({
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
    observations = normalized.observations;
    rawRecordCount = records.length;
    providerReportedTotal = total;
    nextRequestToken = page * 20 < total ? `page:${page + 1}` : null;
  } else {
    if (!bitgetListingAnnouncementSchemaConforms(input.payload)) {
      throw new Error("Bitget listing page failed exact schema conformance");
    }
    const records = arrayAt(input.payload, "data");
    if (records === null) {
      throw new Error("Bitget listing page metadata is incomplete");
    }
    const normalized = normalizeBitgetListingAnnouncements({
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
    observations = normalized.observations;
    rawRecordCount = records.length;
    providerReportedTotal = null;
    const lastAnnouncementId = stringAt(records.at(-1), "annId")?.trim() ?? "";
    nextRequestToken = records.length === 10 && lastAnnouncementId.length > 0
      ? `cursor:${lastAnnouncementId}`
      : null;
  }
  if (observations.length !== rawRecordCount) {
    throw new Error("listing page normalization was partial");
  }

  const core = listingHistoryPageCore({
    schemaVersion: M1_LISTING_HISTORY_PAGE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.profile.runtimeReleaseId,
    profileId: input.profile.profileId,
    sourceId: input.profile.sourceId,
    historyResponsibility: input.profile.historyResponsibility,
    mode: input.mode,
    pageOrdinal: input.pageOrdinal,
    requestToken: input.requestToken,
    receivedAt: input.receivedAt,
    responseBodyHash: input.responseBodyHash,
    rawRecordCount,
    normalizedRecordCount: observations.length,
    providerReportedTotal,
    nextRequestToken,
    providerTerminal: nextRequestToken === null,
    observations: [...observations],
    rawBodyRetained: false,
    secretMaterialPresent: false,
    candidateEmissionAllowed: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ListingHistoryPageSchema.parse({
    ...core,
    pageId:
      `listing-history-page:${core.sourceId}:${contentHash.slice(7, 23)}`,
    contentHash,
  }));
}

const ListingHistoryCheckpointCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_LISTING_HISTORY_CHECKPOINT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  profileId: NonEmptyStringSchema,
  sourceId: ListingSourceSchema,
  historyResponsibility: ListingHistoryResponsibilitySchema,
  status: z.enum([
    "BOOTSTRAP_IN_PROGRESS",
    "BOOTSTRAP_COMPLETE",
    "INCREMENTAL_CURRENT",
  ]),
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  bootstrapCutoff: IsoDateTimeSchema,
  nextBootstrapRequestToken: NonEmptyStringSchema.nullable(),
  providerHistoryComplete: z.boolean(),
  providerWindowComplete: z.boolean(),
  pageCount: NonNegativeIntegerSchema,
  announcementCount: NonNegativeIntegerSchema,
  duplicateObservationCount: NonNegativeIntegerSchema,
  lastIncrementalOverlapCount: NonNegativeIntegerSchema,
  newestProviderPublishedAt: IsoDateTimeSchema.nullable(),
  oldestProviderPublishedAt: IsoDateTimeSchema.nullable(),
  pageChainHeadHash: DigestSchema,
  pageIds: UniqueStringsSchema,
  observations: z.array(M1ListingAnnouncementObservationSchema),
  authorityBoundary: z.literal(
    "LISTING_HISTORY_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  runtimeExecutionAllowed: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1ListingHistoryCheckpointSchema =
  ListingHistoryCheckpointCoreSchema.extend({
    checkpointId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((checkpoint, context) => {
    if (
      Date.parse(checkpoint.sourceCutoff) > Date.parse(checkpoint.generatedAt) ||
      Date.parse(checkpoint.bootstrapCutoff) >
        Date.parse(checkpoint.sourceCutoff)
    ) {
      context.addIssue({
        code: "custom",
        message: "listing checkpoint chronology is invalid",
        path: ["sourceCutoff"],
      });
    }
    const complete = checkpoint.status !== "BOOTSTRAP_IN_PROGRESS";
    if (complete === (checkpoint.nextBootstrapRequestToken !== null)) {
      context.addIssue({
        code: "custom",
        message: "bootstrap completion and next token disagree",
        path: ["nextBootstrapRequestToken"],
      });
    }
    if (
      checkpoint.sourceId === "BYBIT_DERIVATIVES" &&
      (
        checkpoint.providerHistoryComplete !== complete ||
        checkpoint.providerWindowComplete
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Bybit checkpoint history boundary is overstated",
        path: ["providerHistoryComplete"],
      });
    }
    if (
      checkpoint.sourceId === "BITGET_FUTURES" &&
      (
        checkpoint.providerHistoryComplete ||
        checkpoint.providerWindowComplete !== complete
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Bitget one-month window cannot claim full history",
        path: ["providerWindowComplete"],
      });
    }
    if (
      checkpoint.pageCount !== checkpoint.pageIds.length ||
      checkpoint.announcementCount !== checkpoint.observations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint page or announcement denominator drifted",
      });
    }
    const ids = checkpoint.observations.map((observation) =>
      observation.announcementId
    );
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "checkpoint announcements must be unique",
        path: ["observations"],
      });
    }
    const sorted = sortObservations(checkpoint.observations);
    if (
      checkpoint.observations.some((observation, index) =>
        stableContentHash(observation) !== stableContentHash(sorted[index])
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint observations require canonical ordering",
        path: ["observations"],
      });
    }
    const newest = checkpoint.observations[0]?.providerPublishedAt ?? null;
    const oldest = checkpoint.observations.at(-1)?.providerPublishedAt ?? null;
    if (
      checkpoint.newestProviderPublishedAt !== newest ||
      checkpoint.oldestProviderPublishedAt !== oldest
    ) {
      context.addIssue({
        code: "custom",
        message: "checkpoint time bounds do not match observations",
      });
    }
    const expectedHash = stableContentHash(
      listingHistoryCheckpointCore(checkpoint),
    );
    if (checkpoint.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "listing history checkpoint content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      checkpoint.checkpointId !==
        `listing-history-checkpoint:${checkpoint.sourceId}:${
          expectedHash.slice(7, 23)
        }`
    ) {
      context.addIssue({
        code: "custom",
        message: "listing history checkpoint id mismatch",
        path: ["checkpointId"],
      });
    }
  });

export type M1ListingHistoryCheckpoint = z.infer<
  typeof M1ListingHistoryCheckpointSchema
>;

function listingHistoryCheckpointCore(
  checkpoint: z.input<typeof ListingHistoryCheckpointCoreSchema> & {
    readonly checkpointId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ListingHistoryCheckpointCoreSchema> {
  return ListingHistoryCheckpointCoreSchema.parse({
    schemaVersion: checkpoint.schemaVersion,
    scopeEpoch: checkpoint.scopeEpoch,
    releaseId: checkpoint.releaseId,
    profileId: checkpoint.profileId,
    sourceId: checkpoint.sourceId,
    historyResponsibility: checkpoint.historyResponsibility,
    status: checkpoint.status,
    generatedAt: checkpoint.generatedAt,
    sourceCutoff: checkpoint.sourceCutoff,
    bootstrapCutoff: checkpoint.bootstrapCutoff,
    nextBootstrapRequestToken: checkpoint.nextBootstrapRequestToken,
    providerHistoryComplete: checkpoint.providerHistoryComplete,
    providerWindowComplete: checkpoint.providerWindowComplete,
    pageCount: checkpoint.pageCount,
    announcementCount: checkpoint.announcementCount,
    duplicateObservationCount: checkpoint.duplicateObservationCount,
    lastIncrementalOverlapCount: checkpoint.lastIncrementalOverlapCount,
    newestProviderPublishedAt: checkpoint.newestProviderPublishedAt,
    oldestProviderPublishedAt: checkpoint.oldestProviderPublishedAt,
    pageChainHeadHash: checkpoint.pageChainHeadHash,
    pageIds: checkpoint.pageIds,
    observations: checkpoint.observations,
    authorityBoundary: checkpoint.authorityBoundary,
    runtimeExecutionAllowed: checkpoint.runtimeExecutionAllowed,
    candidateEmissionAllowed: checkpoint.candidateEmissionAllowed,
    strategyAuthorityGranted: checkpoint.strategyAuthorityGranted,
    readyAuthorityGranted: checkpoint.readyAuthorityGranted,
    productionChanged: checkpoint.productionChanged,
  });
}

function sortObservations(
  observations: readonly M1ListingAnnouncementObservation[],
): M1ListingAnnouncementObservation[] {
  return [...observations].sort((left, right) =>
    right.providerPublishedAt.localeCompare(left.providerPublishedAt) ||
    left.announcementId.localeCompare(right.announcementId)
  );
}

const ListingHistoryGapCoreSchema = z.strictObject({
  schemaVersion: z.literal(M1_LISTING_HISTORY_GAP_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  profileId: NonEmptyStringSchema,
  sourceId: ListingSourceSchema,
  mode: ListingModeSchema,
  detectedAt: IsoDateTimeSchema,
  reason: z.enum(M1_LISTING_HISTORY_GAP_REASONS),
  expectedRequestToken: NonEmptyStringSchema.nullable(),
  observedRequestToken: NonEmptyStringSchema.nullable(),
  priorCheckpointHash: DigestSchema.nullable(),
  pageEvidenceHash: DigestSchema,
  checkpointAdvanced: z.literal(false),
  candidateEmissionAllowed: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  productionChanged: z.literal(false),
});

export const M1ListingHistoryGapSchema =
  ListingHistoryGapCoreSchema.extend({
    gapId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((gap, context) => {
    const expectedHash = stableContentHash(listingHistoryGapCore(gap));
    if (gap.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "listing history gap content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      gap.gapId !==
        `listing-history-gap:${gap.sourceId}:${expectedHash.slice(7, 23)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "listing history gap id mismatch",
        path: ["gapId"],
      });
    }
  });

export type M1ListingHistoryGap = z.infer<
  typeof M1ListingHistoryGapSchema
>;

function listingHistoryGapCore(
  gap: z.input<typeof ListingHistoryGapCoreSchema> & {
    readonly gapId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ListingHistoryGapCoreSchema> {
  return ListingHistoryGapCoreSchema.parse({
    schemaVersion: gap.schemaVersion,
    scopeEpoch: gap.scopeEpoch,
    releaseId: gap.releaseId,
    profileId: gap.profileId,
    sourceId: gap.sourceId,
    mode: gap.mode,
    detectedAt: gap.detectedAt,
    reason: gap.reason,
    expectedRequestToken: gap.expectedRequestToken,
    observedRequestToken: gap.observedRequestToken,
    priorCheckpointHash: gap.priorCheckpointHash,
    pageEvidenceHash: gap.pageEvidenceHash,
    checkpointAdvanced: gap.checkpointAdvanced,
    candidateEmissionAllowed: gap.candidateEmissionAllowed,
    strategyAuthorityGranted: gap.strategyAuthorityGranted,
    readyAuthorityGranted: gap.readyAuthorityGranted,
    productionChanged: gap.productionChanged,
  });
}

export const M1ListingHistoryAdvanceResultSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({
      status: z.literal("COMMITTED"),
      checkpoint: M1ListingHistoryCheckpointSchema,
      gap: z.null(),
    }),
    z.strictObject({
      status: z.literal("BLOCKED_GAP"),
      checkpoint: z.null(),
      gap: M1ListingHistoryGapSchema,
    }),
  ],
);

export type M1ListingHistoryAdvanceResult = z.infer<
  typeof M1ListingHistoryAdvanceResultSchema
>;

type GapReason = (typeof M1_LISTING_HISTORY_GAP_REASONS)[number];

function blockedGap(input: {
  profile: M1RuntimeAdapterProfile;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  detectedAt: string;
  reason: GapReason;
  expectedRequestToken: string | null;
  observedRequestToken: string | null;
  priorCheckpoint: M1ListingHistoryCheckpoint | null;
  pages: readonly M1ListingHistoryPage[];
}): M1ListingHistoryAdvanceResult {
  const core = listingHistoryGapCore({
    schemaVersion: M1_LISTING_HISTORY_GAP_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.profile.runtimeReleaseId,
    profileId: input.profile.profileId,
    sourceId: input.profile.sourceId as
      (typeof M1_LISTING_HISTORY_SOURCES)[number],
    mode: input.mode,
    detectedAt: input.detectedAt,
    reason: input.reason,
    expectedRequestToken: input.expectedRequestToken,
    observedRequestToken: input.observedRequestToken,
    priorCheckpointHash: input.priorCheckpoint?.contentHash ?? null,
    pageEvidenceHash: stableContentHash(
      input.pages.map((page) => page.contentHash),
    ),
    checkpointAdvanced: false,
    candidateEmissionAllowed: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  const gap = M1ListingHistoryGapSchema.parse({
    ...core,
    gapId:
      `listing-history-gap:${core.sourceId}:${contentHash.slice(7, 23)}`,
    contentHash,
  });
  return deepFreezeArtifact(M1ListingHistoryAdvanceResultSchema.parse({
    status: "BLOCKED_GAP",
    checkpoint: null,
    gap,
  }));
}

export function advanceM1ListingHistory(input: {
  profile: M1RuntimeAdapterProfile;
  mode: "BOOTSTRAP" | "INCREMENTAL";
  priorCheckpoint: M1ListingHistoryCheckpoint | null;
  pages: readonly M1ListingHistoryPage[];
  segmentStop:
    | "SOURCE_TERMINAL"
    | "SEGMENT_PAGE_LIMIT"
    | "PRIOR_CHECKPOINT_OVERLAP";
  generatedAt: string;
  sourceCutoff: string;
}): M1ListingHistoryAdvanceResult {
  validateListingProfile(input.profile);
  IsoDateTimeSchema.parse(input.generatedAt);
  IsoDateTimeSchema.parse(input.sourceCutoff);
  const prior = input.priorCheckpoint === null
    ? null
    : M1ListingHistoryCheckpointSchema.parse(input.priorCheckpoint);
  const pages = input.pages.map((page) =>
    M1ListingHistoryPageSchema.parse(page)
  );
  if (pages.length === 0) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: null,
      detectedAt: input.generatedAt,
    });
  }
  if (pages.length > input.profile.maxRequestsPerSegment) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: pages[0]!.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  if (
    prior !== null &&
    (
      prior.releaseId !== input.profile.runtimeReleaseId ||
      prior.profileId !== input.profile.profileId ||
      prior.sourceId !== input.profile.sourceId
    )
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "SOURCE_OR_PROFILE_DRIFT",
      expectedRequestToken: null,
      observedRequestToken: pages[0]!.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  const expectedFirstToken = input.mode === "INCREMENTAL"
    ? input.profile.sourceId === "BYBIT_DERIVATIVES"
      ? "page:1"
      : "ROOT"
    : prior?.nextBootstrapRequestToken ??
      (input.profile.sourceId === "BYBIT_DERIVATIVES" ? "page:1" : "ROOT");
  if (pages[0]!.requestToken !== expectedFirstToken) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "REQUEST_TOKEN_DISCONTINUITY",
      expectedRequestToken: expectedFirstToken,
      observedRequestToken: pages[0]!.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  const requestTokens = pages.map((page) => page.requestToken);
  if (new Set(requestTokens).size !== requestTokens.length) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "REPEATED_REQUEST_TOKEN",
      expectedRequestToken: null,
      observedRequestToken: null,
      detectedAt: input.generatedAt,
    });
  }
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    if (page.pageOrdinal !== index + 1) {
      return blockedGap({
        ...input,
        priorCheckpoint: prior,
        pages,
        reason: "PAGE_ORDINAL_DISCONTINUITY",
        expectedRequestToken: String(index + 1),
        observedRequestToken: String(page.pageOrdinal),
        detectedAt: input.generatedAt,
      });
    }
    if (
      page.releaseId !== input.profile.runtimeReleaseId ||
      page.profileId !== input.profile.profileId ||
      page.sourceId !== input.profile.sourceId ||
      page.mode !== input.mode
    ) {
      return blockedGap({
        ...input,
        priorCheckpoint: prior,
        pages,
        reason: "SOURCE_OR_PROFILE_DRIFT",
        expectedRequestToken: null,
        observedRequestToken: page.requestToken,
        detectedAt: input.generatedAt,
      });
    }
    if (Date.parse(page.receivedAt) > Date.parse(input.sourceCutoff)) {
      return blockedGap({
        ...input,
        priorCheckpoint: prior,
        pages,
        reason: "FUTURE_KNOWLEDGE",
        expectedRequestToken: null,
        observedRequestToken: page.requestToken,
        detectedAt: input.generatedAt,
      });
    }
    if (
      page.rawRecordCount === 0 &&
      !page.providerTerminal
    ) {
      return blockedGap({
        ...input,
        priorCheckpoint: prior,
        pages,
        reason: "EMPTY_NONTERMINAL_PAGE",
        expectedRequestToken: null,
        observedRequestToken: page.requestToken,
        detectedAt: input.generatedAt,
      });
    }
    const next = pages[index + 1];
    if (
      next !== undefined &&
      page.nextRequestToken !== next.requestToken
    ) {
      return blockedGap({
        ...input,
        priorCheckpoint: prior,
        pages,
        reason: "REQUEST_TOKEN_DISCONTINUITY",
        expectedRequestToken: page.nextRequestToken,
        observedRequestToken: next.requestToken,
        detectedAt: input.generatedAt,
      });
    }
  }

  if (
    input.mode === "BOOTSTRAP" &&
    prior !== null &&
    prior.status !== "BOOTSTRAP_IN_PROGRESS"
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: pages[0]!.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  if (
    input.mode === "INCREMENTAL" &&
    (
      prior === null ||
      prior.status === "BOOTSTRAP_IN_PROGRESS"
    )
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: pages[0]!.requestToken,
      detectedAt: input.generatedAt,
    });
  }

  const priorById = new Map(
    (prior?.observations ?? []).map((observation) => [
      observation.announcementId,
      observation,
    ]),
  );
  const mergedById = new Map(priorById);
  let duplicateObservationCount = prior?.duplicateObservationCount ?? 0;
  let overlapCount = 0;
  for (const page of pages) {
    for (const observation of page.observations) {
      const existing = mergedById.get(observation.announcementId);
      if (existing === undefined) {
        mergedById.set(observation.announcementId, observation);
        continue;
      }
      if (existing.sourceRecordDigest !== observation.sourceRecordDigest) {
        return blockedGap({
          ...input,
          priorCheckpoint: prior,
          pages,
          reason: "ANNOUNCEMENT_ID_CONTENT_CONFLICT",
          expectedRequestToken: null,
          observedRequestToken: page.requestToken,
          detectedAt: input.generatedAt,
        });
      }
      duplicateObservationCount += 1;
      if (priorById.has(observation.announcementId)) overlapCount += 1;
    }
  }

  const lastPage = pages.at(-1)!;
  if (
    input.segmentStop === "SOURCE_TERMINAL" &&
    !lastPage.providerTerminal
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: lastPage.nextRequestToken,
      observedRequestToken: null,
      detectedAt: input.generatedAt,
    });
  }
  if (
    input.segmentStop === "SEGMENT_PAGE_LIMIT" &&
    lastPage.providerTerminal
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: lastPage.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  if (
    input.mode === "INCREMENTAL" &&
    prior !== null &&
    prior.announcementCount > 0 &&
    (
      overlapCount === 0 ||
      input.segmentStop !== "PRIOR_CHECKPOINT_OVERLAP"
    )
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "NO_CHECKPOINT_OVERLAP",
      expectedRequestToken: null,
      observedRequestToken: lastPage.requestToken,
      detectedAt: input.generatedAt,
    });
  }
  if (
    input.mode === "BOOTSTRAP" &&
    input.segmentStop === "PRIOR_CHECKPOINT_OVERLAP"
  ) {
    return blockedGap({
      ...input,
      priorCheckpoint: prior,
      pages,
      reason: "INVALID_SEGMENT_STOP",
      expectedRequestToken: null,
      observedRequestToken: lastPage.requestToken,
      detectedAt: input.generatedAt,
    });
  }

  const bootstrapComplete = input.mode === "INCREMENTAL" ||
    input.segmentStop === "SOURCE_TERMINAL";
  const observations = sortObservations([...mergedById.values()]);
  const status = input.mode === "INCREMENTAL"
    ? "INCREMENTAL_CURRENT" as const
    : bootstrapComplete
      ? "BOOTSTRAP_COMPLETE" as const
      : "BOOTSTRAP_IN_PROGRESS" as const;
  const pageIds = [
    ...(prior?.pageIds ?? []),
    ...pages.map((page) => page.pageId),
  ];
  const pageChainHeadHash = stableContentHash({
    previous: prior?.pageChainHeadHash ?? null,
    pages: pages.map((page) => page.contentHash),
  });
  const core = listingHistoryCheckpointCore({
    schemaVersion: M1_LISTING_HISTORY_CHECKPOINT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.profile.runtimeReleaseId,
    profileId: input.profile.profileId,
    sourceId: input.profile.sourceId,
    historyResponsibility: input.profile.historyResponsibility,
    status,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    bootstrapCutoff: prior?.bootstrapCutoff ?? input.sourceCutoff,
    nextBootstrapRequestToken:
      status === "BOOTSTRAP_IN_PROGRESS"
        ? lastPage.nextRequestToken
        : null,
    providerHistoryComplete:
      input.profile.sourceId === "BYBIT_DERIVATIVES" &&
      status !== "BOOTSTRAP_IN_PROGRESS",
    providerWindowComplete:
      input.profile.sourceId === "BITGET_FUTURES" &&
      status !== "BOOTSTRAP_IN_PROGRESS",
    pageCount: pageIds.length,
    announcementCount: observations.length,
    duplicateObservationCount,
    lastIncrementalOverlapCount:
      input.mode === "INCREMENTAL" ? overlapCount : 0,
    newestProviderPublishedAt:
      observations[0]?.providerPublishedAt ?? null,
    oldestProviderPublishedAt:
      observations.at(-1)?.providerPublishedAt ?? null,
    pageChainHeadHash,
    pageIds,
    observations,
    authorityBoundary:
      "LISTING_HISTORY_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
    runtimeExecutionAllowed: false,
    candidateEmissionAllowed: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  const checkpoint = M1ListingHistoryCheckpointSchema.parse({
    ...core,
    checkpointId:
      `listing-history-checkpoint:${core.sourceId}:${
        contentHash.slice(7, 23)
      }`,
    contentHash,
  });
  return deepFreezeArtifact(M1ListingHistoryAdvanceResultSchema.parse({
    status: "COMMITTED",
    checkpoint,
    gap: null,
  }));
}
