import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_LISTING_LIFECYCLE_STATES,
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetIdentitySnapshot,
} from "./multi-asset-identity-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../universe/stable-artifact";

export const M1_ANNOUNCEMENT_OBSERVATION_VERSION =
  "v2-m1-listing-announcement-observation.v1" as const;
export const M1_LISTING_LIFECYCLE_LEDGER_VERSION =
  "v2-m1-listing-lifecycle-ledger.v1" as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const HttpsUrlSchema = z.string().url().superRefine((value, context) => {
  if (new URL(value).protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "announcement URL must use HTTPS",
    });
  }
});

export const M1ListingAnnouncementObservationSchema = z.strictObject({
  schemaVersion: z.literal(M1_ANNOUNCEMENT_OBSERVATION_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  sourceId: VenueSchema,
  announcementId: NonEmptyStringSchema,
  announcementUrl: HttpsUrlSchema,
  titleDigest: DigestSchema,
  announcementKind: z.enum([
    "LISTING",
    "DELISTING",
    "PRODUCT_UPDATE",
    "OTHER",
  ]),
  productScope: z.enum([
    "SPOT",
    "DERIVATIVE",
    "MIXED",
    "UNKNOWN",
  ]),
  providerPublishedAt: IsoDateTimeSchema,
  providerEffectiveAt: IsoDateTimeSchema.nullable(),
  knowledgeTime: IsoDateTimeSchema,
  structuredVenueInstrumentIds: z.array(NonEmptyStringSchema),
  instrumentLinkAuthority: z.enum([
    "PROVIDER_STRUCTURED_FIELD",
    "UNLINKED_NO_SYMBOL_GUESSING",
  ]),
  sourceCapability: z.literal("LISTING_ANNOUNCEMENT"),
  sourceRecordDigest: DigestSchema,
  candidateEmissionAllowed: z.literal(false),
  strategyAuthority: z.literal(false),
  reasonCodes: ReasonCodesSchema,
}).superRefine((observation, context) => {
  if (
    Date.parse(observation.providerPublishedAt) >
    Date.parse(observation.knowledgeTime)
  ) {
    context.addIssue({
      code: "custom",
      message: "announcement cannot be known before provider publication",
      path: ["knowledgeTime"],
    });
  }
  if (
    observation.instrumentLinkAuthority ===
      "UNLINKED_NO_SYMBOL_GUESSING" &&
    observation.structuredVenueInstrumentIds.length > 0
  ) {
    context.addIssue({
      code: "custom",
      message: "unlinked announcements cannot claim instrument ids",
      path: ["structuredVenueInstrumentIds"],
    });
  }
  if (
    observation.instrumentLinkAuthority === "PROVIDER_STRUCTURED_FIELD" &&
    observation.structuredVenueInstrumentIds.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "structured linkage requires at least one instrument id",
      path: ["structuredVenueInstrumentIds"],
    });
  }
});

export type M1ListingAnnouncementObservation = z.infer<
  typeof M1ListingAnnouncementObservationSchema
>;

export const M1ListingLifecycleEventSchema = z.strictObject({
  eventId: NonEmptyStringSchema,
  sourceId: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema.nullable(),
  listingEpoch: NonEmptyStringSchema.nullable(),
  previousState: z.enum(M1_LISTING_LIFECYCLE_STATES).nullable(),
  currentState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  eventSource: z.enum([
    "DERIVATIVE_CATALOG",
    "ANNOUNCEMENT",
    "CATALOG_ABSENCE",
  ]),
  providerEffectiveAt: IsoDateTimeSchema.nullable(),
  knowledgeTime: IsoDateTimeSchema,
  announcementIds: z.array(NonEmptyStringSchema),
  correlationStatus: z.enum([
    "EXACT_STRUCTURED_LINK",
    "UNLINKED_ANNOUNCEMENT",
    "CATALOG_ONLY",
    "MISSING_FROM_COMPLETE_CATALOG_NOT_DELISTING_PROOF",
  ]),
  sourceRecordDigests: z.array(DigestSchema).min(1),
  candidateEmissionAllowed: z.literal(false),
  reasonCodes: ReasonCodesSchema,
}).superRefine((event, context) => {
  const hasInstrument = event.venueInstrumentId !== null;
  if (hasInstrument !== (event.listingEpoch !== null)) {
    context.addIssue({
      code: "custom",
      message: "instrument and listing epoch must be present together",
      path: ["listingEpoch"],
    });
  }
  if (
    event.eventSource === "ANNOUNCEMENT" &&
    event.correlationStatus === "UNLINKED_ANNOUNCEMENT" &&
    hasInstrument
  ) {
    context.addIssue({
      code: "custom",
      message: "unlinked announcement cannot claim an instrument",
      path: ["venueInstrumentId"],
    });
  }
  if (
    event.eventSource === "CATALOG_ABSENCE" &&
    (
      event.currentState !== "UNRESOLVED" ||
      event.correlationStatus !==
        "MISSING_FROM_COMPLETE_CATALOG_NOT_DELISTING_PROOF"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "catalog absence must remain unresolved, never inferred delisting",
      path: ["currentState"],
    });
  }
});

export type M1ListingLifecycleEvent = z.infer<
  typeof M1ListingLifecycleEventSchema
>;

const CountByVenueSchema = z.strictObject({
  BINANCE_FUTURES: NonNegativeIntegerSchema,
  OKX_SWAP: NonNegativeIntegerSchema,
  BYBIT_DERIVATIVES: NonNegativeIntegerSchema,
  BITGET_FUTURES: NonNegativeIntegerSchema,
});

export const M1ListingLifecycleLedgerSchema = z.strictObject({
  schemaVersion: z.literal(M1_LISTING_LIFECYCLE_LEDGER_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: NonEmptyStringSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  currentIdentitySnapshotId: NonEmptyStringSchema,
  previousIdentitySnapshotId: NonEmptyStringSchema.nullable(),
  completeCatalogSources: z.array(VenueSchema),
  announcementCount: NonNegativeIntegerSchema,
  eventCount: NonNegativeIntegerSchema,
  unlinkedAnnouncementCount: NonNegativeIntegerSchema,
  eventsByVenue: CountByVenueSchema,
  events: z.array(M1ListingLifecycleEventSchema),
  ledgerId: NonEmptyStringSchema,
  contentHash: DigestSchema,
  authorityBoundary: z.literal(
    "LISTING_INTELLIGENCE_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY",
  ),
  productionChanged: z.literal(false),
}).superRefine((ledger, context) => {
  if (Date.parse(ledger.sourceCutoff) > Date.parse(ledger.generatedAt)) {
    context.addIssue({
      code: "custom",
      message: "sourceCutoff cannot be later than generatedAt",
      path: ["sourceCutoff"],
    });
  }
  if (new Set(ledger.completeCatalogSources).size !==
      ledger.completeCatalogSources.length) {
    context.addIssue({
      code: "custom",
      message: "complete catalog sources must be unique",
      path: ["completeCatalogSources"],
    });
  }
  if (ledger.eventCount !== ledger.events.length) {
    context.addIssue({
      code: "custom",
      message: "eventCount must equal events length",
      path: ["eventCount"],
    });
  }
  const eventIds = ledger.events.map((event) => event.eventId);
  if (new Set(eventIds).size !== eventIds.length) {
    context.addIssue({
      code: "custom",
      message: "event ids must be unique",
      path: ["events"],
    });
  }
  const unlinked = ledger.events.filter(
    (event) => event.correlationStatus === "UNLINKED_ANNOUNCEMENT",
  ).length;
  if (ledger.unlinkedAnnouncementCount !== unlinked) {
    context.addIssue({
      code: "custom",
      message: "unlinked announcement count does not match events",
      path: ["unlinkedAnnouncementCount"],
    });
  }
  const announcementEvents = ledger.events.filter(
    (event) => event.eventSource === "ANNOUNCEMENT",
  ).length;
  if (ledger.announcementCount !== announcementEvents) {
    context.addIssue({
      code: "custom",
      message: "announcement count does not match announcement events",
      path: ["announcementCount"],
    });
  }
  const expectedByVenue = emptyVenueCounts();
  for (const event of ledger.events) {
    expectedByVenue[event.sourceId] += 1;
  }
  if (
    stableContentHash(ledger.eventsByVenue) !==
      stableContentHash(expectedByVenue)
  ) {
    context.addIssue({
      code: "custom",
      message: "event venue counts do not match events",
      path: ["eventsByVenue"],
    });
  }
  const sortedEvents = [...ledger.events].sort((left, right) =>
    left.knowledgeTime.localeCompare(right.knowledgeTime) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.eventId.localeCompare(right.eventId)
  );
  if (
    ledger.events.some((event, index) =>
      stableContentHash(event) !== stableContentHash(sortedEvents[index])
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "listing events must use canonical ordering",
      path: ["events"],
    });
  }
  const expectedContentHash = stableContentHash({
    scopeEpoch: ledger.scopeEpoch,
    releaseId: ledger.releaseId,
    generatedAt: ledger.generatedAt,
    sourceCutoff: ledger.sourceCutoff,
    currentIdentitySnapshotId: ledger.currentIdentitySnapshotId,
    previousIdentitySnapshotId: ledger.previousIdentitySnapshotId,
    completeCatalogSources: ledger.completeCatalogSources,
    announcementCount: ledger.announcementCount,
    eventCount: ledger.eventCount,
    unlinkedAnnouncementCount: ledger.unlinkedAnnouncementCount,
    eventsByVenue: ledger.eventsByVenue,
    events: ledger.events,
    authorityBoundary: ledger.authorityBoundary,
    productionChanged: ledger.productionChanged,
  });
  if (ledger.contentHash !== expectedContentHash) {
    context.addIssue({
      code: "custom",
      message: "listing lifecycle content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    ledger.ledgerId !== `listing-ledger:${ledger.contentHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "listing lifecycle ledger id mismatch",
      path: ["ledgerId"],
    });
  }
});

export type M1ListingLifecycleLedger = z.infer<
  typeof M1ListingLifecycleLedgerSchema
>;

export function createM1ListingAnnouncementObservation(
  input: Omit<
    M1ListingAnnouncementObservation,
    | "schemaVersion"
    | "scopeEpoch"
    | "candidateEmissionAllowed"
    | "strategyAuthority"
  >,
): M1ListingAnnouncementObservation {
  return deepFreezeArtifact(M1ListingAnnouncementObservationSchema.parse({
    ...input,
    schemaVersion: M1_ANNOUNCEMENT_OBSERVATION_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    candidateEmissionAllowed: false,
    strategyAuthority: false,
  }));
}

function observationKey(
  observation: M1MultiAssetIdentitySnapshot["observations"][number],
): string {
  return `${observation.sourceId}:${observation.venueInstrumentId}`;
}

function eventId(
  event: Omit<M1ListingLifecycleEvent, "eventId">,
): string {
  return `listing-event:${stableSha256(event).slice(0, 24)}`;
}

function catalogEvent(input: {
  current: M1MultiAssetIdentitySnapshot["observations"][number];
  previous:
    | M1MultiAssetIdentitySnapshot["observations"][number]
    | null;
}): M1ListingLifecycleEvent {
  const event = {
    sourceId: input.current.sourceId,
    venueInstrumentId: input.current.venueInstrumentId,
    listingEpoch: input.current.listingEpoch,
    previousState: input.previous?.lifecycleState ?? null,
    currentState: input.current.lifecycleState,
    eventSource: "DERIVATIVE_CATALOG" as const,
    providerEffectiveAt: input.current.statusEffectiveAt,
    knowledgeTime: input.current.knowledgeTime,
    announcementIds: [],
    correlationStatus: "CATALOG_ONLY" as const,
    sourceRecordDigests: [input.current.sourceRecordDigest],
    candidateEmissionAllowed: false as const,
    reasonCodes: input.previous === null
      ? ["first_catalog_observation_no_announcement_link"]
      : ["provider_catalog_lifecycle_transition"],
  };
  return M1ListingLifecycleEventSchema.parse({
    ...event,
    eventId: eventId(event),
  });
}

function absenceEvent(
  previous: M1MultiAssetIdentitySnapshot["observations"][number],
  sourceCutoff: string,
): M1ListingLifecycleEvent {
  const event = {
    sourceId: previous.sourceId,
    venueInstrumentId: previous.venueInstrumentId,
    listingEpoch: previous.listingEpoch,
    previousState: previous.lifecycleState,
    currentState: "UNRESOLVED" as const,
    eventSource: "CATALOG_ABSENCE" as const,
    providerEffectiveAt: null,
    knowledgeTime: sourceCutoff,
    announcementIds: [],
    correlationStatus:
      "MISSING_FROM_COMPLETE_CATALOG_NOT_DELISTING_PROOF" as const,
    sourceRecordDigests: [previous.sourceRecordDigest],
    candidateEmissionAllowed: false as const,
    reasonCodes: [
      "catalog_absence_is_not_delisting_proof",
      "requires_explicit_status_or_announcement_confirmation",
    ],
  };
  return M1ListingLifecycleEventSchema.parse({
    ...event,
    eventId: eventId(event),
  });
}

function announcementEvent(
  announcement: M1ListingAnnouncementObservation,
): M1ListingLifecycleEvent {
  const structuredInstrument =
    announcement.structuredVenueInstrumentIds.length === 1
      ? announcement.structuredVenueInstrumentIds[0]!
      : null;
  const exactLink =
    announcement.instrumentLinkAuthority === "PROVIDER_STRUCTURED_FIELD" &&
    structuredInstrument !== null;
  const event = {
    sourceId: announcement.sourceId,
    venueInstrumentId: exactLink ? structuredInstrument : null,
    listingEpoch: null,
    previousState: null,
    currentState: announcement.announcementKind === "DELISTING"
      ? "DELISTING" as const
      : announcement.announcementKind === "LISTING"
        ? "ANNOUNCED_WAITING_CATALOG" as const
        : "UNRESOLVED" as const,
    eventSource: "ANNOUNCEMENT" as const,
    providerEffectiveAt: announcement.providerEffectiveAt,
    knowledgeTime: announcement.knowledgeTime,
    announcementIds: [announcement.announcementId],
    correlationStatus: exactLink
      ? "EXACT_STRUCTURED_LINK" as const
      : "UNLINKED_ANNOUNCEMENT" as const,
    sourceRecordDigests: [announcement.sourceRecordDigest],
    candidateEmissionAllowed: false as const,
    reasonCodes: exactLink
      ? ["provider_structured_instrument_link_requires_catalog_epoch_match"]
      : ["announcement_title_not_parsed_for_symbol_guessing"],
  };

  if (exactLink) {
    const listingEpoch = `announcement-pending:${stableSha256({
      sourceId: announcement.sourceId,
      venueInstrumentId: structuredInstrument,
      announcementId: announcement.announcementId,
    }).slice(0, 20)}`;
    return M1ListingLifecycleEventSchema.parse({
      ...event,
      listingEpoch,
      eventId: eventId({ ...event, listingEpoch }),
    });
  }
  return M1ListingLifecycleEventSchema.parse({
    ...event,
    eventId: eventId(event),
  });
}

function emptyVenueCounts() {
  return {
    BINANCE_FUTURES: 0,
    OKX_SWAP: 0,
    BYBIT_DERIVATIVES: 0,
    BITGET_FUTURES: 0,
  };
}

export function buildM1ListingLifecycleLedger(input: {
  releaseId: string;
  generatedAt: string;
  sourceCutoff: string;
  current: M1MultiAssetIdentitySnapshot;
  previous: M1MultiAssetIdentitySnapshot | null;
  completeCatalogSources: readonly (typeof M1_VENUE_SOURCE_IDS)[number][];
  announcements: readonly M1ListingAnnouncementObservation[];
}): M1ListingLifecycleLedger {
  const current = M1MultiAssetIdentitySnapshotSchema.parse(input.current);
  const previous = input.previous === null
    ? null
    : M1MultiAssetIdentitySnapshotSchema.parse(input.previous);
  if (current.releaseId !== input.releaseId) {
    throw new Error("current identity snapshot release must match ledger release");
  }
  if (
    previous !== null &&
    (
      previous.registryDigest !== current.registryDigest ||
      Date.parse(previous.sourceCutoff) >= Date.parse(current.sourceCutoff)
    )
  ) {
    throw new Error(
      "previous identity snapshot must use the same registry and an earlier cutoff",
    );
  }

  const completeCatalogSources = [...new Set(input.completeCatalogSources)]
    .sort();
  const previousByKey = new Map(
    (previous?.observations ?? []).map((observation) => [
      observationKey(observation),
      observation,
    ]),
  );
  const currentByKey = new Map(
    current.observations.map((observation) => [
      observationKey(observation),
      observation,
    ]),
  );
  const events: M1ListingLifecycleEvent[] = [];
  for (const observation of current.observations) {
    const prior = previousByKey.get(observationKey(observation)) ?? null;
    if (
      prior === null ||
      prior.listingEpoch !== observation.listingEpoch ||
      prior.lifecycleState !== observation.lifecycleState
    ) {
      events.push(catalogEvent({ current: observation, previous: prior }));
    }
  }
  if (previous !== null) {
    for (const prior of previous.observations) {
      if (
        !currentByKey.has(observationKey(prior)) &&
        completeCatalogSources.includes(prior.sourceId)
      ) {
        events.push(absenceEvent(prior, input.sourceCutoff));
      }
    }
  }
  events.push(...input.announcements.map(announcementEvent));
  events.sort((left, right) =>
    left.knowledgeTime.localeCompare(right.knowledgeTime) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.eventId.localeCompare(right.eventId)
  );

  const eventsByVenue = emptyVenueCounts();
  for (const event of events) {
    eventsByVenue[event.sourceId] += 1;
  }
  const core = {
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    currentIdentitySnapshotId: current.snapshotId,
    previousIdentitySnapshotId: previous?.snapshotId ?? null,
    completeCatalogSources,
    announcementCount: input.announcements.length,
    eventCount: events.length,
    unlinkedAnnouncementCount: events.filter(
      (event) => event.correlationStatus === "UNLINKED_ANNOUNCEMENT",
    ).length,
    eventsByVenue,
    events,
    authorityBoundary:
      "LISTING_INTELLIGENCE_ONLY_NO_CANDIDATE_SIGNAL_STRATEGY_OR_READY_AUTHORITY" as const,
    productionChanged: false as const,
  };
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ListingLifecycleLedgerSchema.parse({
    ...core,
    schemaVersion: M1_LISTING_LIFECYCLE_LEDGER_VERSION,
    ledgerId: `listing-ledger:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
