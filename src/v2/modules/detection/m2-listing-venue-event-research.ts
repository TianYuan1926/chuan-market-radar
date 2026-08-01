import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1ListingLifecycleEventSchema,
  M1ListingLifecycleLedgerSchema,
  type M1ListingLifecycleEvent,
  type M1ListingLifecycleLedger,
} from "../multi-asset-universe/listing-lifecycle-contract";
import {
  M1_ASSET_DOMAINS,
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_COVERAGE_CLASSES,
  M1_LISTING_LIFECYCLE_STATES,
  M1MultiAssetIdentitySnapshotSchema,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  deepFreezeArtifact,
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";

export const M2_LISTING_VENUE_EVENT_RESEARCH_VERSION =
  "v2-m2-listing-venue-event-research.v1" as const;
export const M2_LISTING_VENUE_RESEARCH_EVENT_VERSION =
  "v2-m2-listing-venue-research-event.v1" as const;
export const M2_LISTING_VENUE_EVENT_RESEARCH_AUTHORITY =
  "RESEARCH_ONLY_NO_DIRECTION_CANDIDATE_SIGNAL_GRADE_STRATEGY_OR_READY_AUTHORITY" as const;

export const M2_LISTING_VENUE_EVENT_CLASSES = [
  "CONTRACT_ANNOUNCEMENT",
  "FIRST_CATALOG_OBSERVATION",
  "PRE_LAUNCH_OBSERVED",
  "TRADING_WARMUP_STARTED",
  "ESTABLISHED_TRANSITION",
  "MAINTENANCE_TRANSITION",
  "RESTRICTION_TRANSITION",
  "SUSPENSION_TRANSITION",
  "DELISTING_NOTICE",
  "DELISTING_TRANSITION",
  "OFFLINE_TRANSITION",
  "VENUE_PRODUCT_UPDATE",
  "CATALOG_ABSENCE_UNRESOLVED",
  "UNRESOLVED_EVENT",
] as const;

export const M2_LISTING_IDENTITY_LINK_STATES = [
  "CATALOG_EPOCH_EXACT",
  "ANNOUNCEMENT_EPOCH_EXACT",
  "ANNOUNCEMENT_INSTRUMENT_ONLY_EPOCH_UNPROVEN",
  "UNLINKED_ANNOUNCEMENT",
  "CATALOG_ABSENCE_PRIOR_EPOCH",
  "IDENTITY_NOT_FOUND",
  "IDENTITY_EPOCH_CONFLICT",
  "IDENTITY_PARTIAL_OR_UNRESOLVED",
] as const;

export const M2_LISTING_RESEARCH_DISPOSITIONS = [
  "DRAFT_RESEARCH_EVENT",
  "BASELINE_OBSERVATION_ONLY",
  "WATCH_ONLY_NO_CONTRACT_PLAN",
  "DOMAIN_HANDOFF_M2_3B",
  "ACCOUNTING_ONLY_UNSUPPORTED_DOMAIN",
  "OBSERVATION_ONLY_UNPROVEN_EVENT_OR_EPOCH",
  "BLOCKED_UNRESOLVED_LINEAGE",
] as const;

export const M2_LISTING_CATALOG_COVERAGE_STATES = [
  "COMPLETE",
  "PARTIAL",
  "UNAVAILABLE",
] as const;

export const M2_LISTING_ANNOUNCEMENT_COVERAGE_STATES = [
  "COMPLETE_PROVIDER_SCOPE",
  "PARTIAL",
  "UNAVAILABLE",
  "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
] as const;

export const M2_LISTING_RESEARCH_READINESS_STATES = [
  "TEST_ONLY_NO_REAL_RESEARCH_READINESS",
  "INSUFFICIENT_SOURCE_COVERAGE",
  "INSUFFICIENT_EVENT_LINEAGE",
  "INSUFFICIENT_EVENT_DENOMINATOR",
  "M2_4A_REVIEW_READY_NO_AUTHORITY",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReleaseIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const VenueSchema = z.enum(M1_VENUE_SOURCE_IDS);
const EventClassSchema = z.enum(M2_LISTING_VENUE_EVENT_CLASSES);
const LinkStateSchema = z.enum(M2_LISTING_IDENTITY_LINK_STATES);
const DispositionSchema = z.enum(M2_LISTING_RESEARCH_DISPOSITIONS);
const UniqueStringsSchema = z.array(NonEmptyStringSchema).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "values must be unique",
      });
    }
  },
);

const VenueCountSchema = z.strictObject({
  BINANCE_FUTURES: NonNegativeIntegerSchema,
  OKX_SWAP: NonNegativeIntegerSchema,
  BYBIT_DERIVATIVES: NonNegativeIntegerSchema,
  BITGET_FUTURES: NonNegativeIntegerSchema,
});

const EventClassCountSchema = z.strictObject(
  Object.fromEntries(
    M2_LISTING_VENUE_EVENT_CLASSES.map((eventClass) => [
      eventClass,
      NonNegativeIntegerSchema,
    ]),
  ) as Record<
    (typeof M2_LISTING_VENUE_EVENT_CLASSES)[number],
    typeof NonNegativeIntegerSchema
  >,
);

const DispositionCountSchema = z.strictObject(
  Object.fromEntries(
    M2_LISTING_RESEARCH_DISPOSITIONS.map((disposition) => [
      disposition,
      NonNegativeIntegerSchema,
    ]),
  ) as Record<
    (typeof M2_LISTING_RESEARCH_DISPOSITIONS)[number],
    typeof NonNegativeIntegerSchema
  >,
);

export const M2ListingVenueSourceCoverageSchema = z.strictObject({
  sourceId: VenueSchema,
  catalogCoverage: z.enum(M2_LISTING_CATALOG_COVERAGE_STATES),
  announcementCoverage: z.enum(
    M2_LISTING_ANNOUNCEMENT_COVERAGE_STATES,
  ),
  knowledgeTime: IsoDateTimeSchema,
  evidenceIds: UniqueStringsSchema.min(1),
  reasonCodes: ReasonCodesSchema,
}).superRefine((coverage, context) => {
  const incomplete = coverage.catalogCoverage !== "COMPLETE" ||
    coverage.announcementCoverage !== "COMPLETE_PROVIDER_SCOPE";
  if (incomplete && coverage.reasonCodes.length === 0) {
    context.addIssue({
      code: "custom",
      message: "incomplete source coverage requires explicit reasons",
      path: ["reasonCodes"],
    });
  }
});

export type M2ListingVenueSourceCoverage = z.infer<
  typeof M2ListingVenueSourceCoverageSchema
>;

const researchEventCoreShape = {
  schemaVersion: z.literal(M2_LISTING_VENUE_RESEARCH_EVENT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  upstreamEventId: NonEmptyStringSchema,
  upstreamLedgerId: NonEmptyStringSchema,
  sourceId: VenueSchema,
  venueInstrumentId: NonEmptyStringSchema.nullable(),
  upstreamListingEpoch: NonEmptyStringSchema.nullable(),
  canonicalListingEpoch: NonEmptyStringSchema.nullable(),
  canonicalInstrumentId: NonEmptyStringSchema.nullable(),
  coverageClass: z.enum(M1_COVERAGE_CLASSES).nullable(),
  assetDomain: z.enum(M1_ASSET_DOMAINS).nullable(),
  previousState: z.enum(M1_LISTING_LIFECYCLE_STATES).nullable(),
  currentState: z.enum(M1_LISTING_LIFECYCLE_STATES),
  eventClass: EventClassSchema,
  eventSource: M1ListingLifecycleEventSchema.shape.eventSource,
  providerPublishedAt: IsoDateTimeSchema.nullable(),
  providerEffectiveAt: IsoDateTimeSchema.nullable(),
  knowledgeTime: IsoDateTimeSchema,
  eventAnchorAt: IsoDateTimeSchema,
  eventAnchorAuthority: z.enum([
    "PROVIDER_PUBLICATION_TIME",
    "PROVIDER_EFFECTIVE_TIME_KNOWN_AT_OBSERVATION",
    "KNOWLEDGE_TIME_FALLBACK",
  ]),
  identityLinkState: LinkStateSchema,
  researchDisposition: DispositionSchema,
  sourceRecordDigests: z.array(DigestSchema).min(1),
  announcementIds: UniqueStringsSchema,
  directionAuthority: z.literal("NOT_ASSIGNED_EVENT_ALONE"),
  candidateEmissionAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  strategyAuthorityAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  reasonCodes: ReasonCodesSchema,
} as const;

type ResearchEventCore = z.infer<z.ZodObject<typeof researchEventCoreShape>>;

function validateResearchEvent(
  event: ResearchEventCore,
  context: z.RefinementCtx,
): void {
  if (
    event.eventAnchorAuthority === "PROVIDER_PUBLICATION_TIME" &&
    event.providerPublishedAt !== event.eventAnchorAt
  ) {
    context.addIssue({
      code: "custom",
      message: "announcement event anchor must preserve providerPublishedAt",
      path: ["eventAnchorAt"],
    });
  }
  if (
    event.eventAnchorAuthority ===
      "PROVIDER_EFFECTIVE_TIME_KNOWN_AT_OBSERVATION" &&
    event.providerEffectiveAt !== event.eventAnchorAt
  ) {
    context.addIssue({
      code: "custom",
      message: "provider event anchor must preserve providerEffectiveAt",
      path: ["eventAnchorAt"],
    });
  }
  if (
    event.eventAnchorAuthority === "KNOWLEDGE_TIME_FALLBACK" &&
    event.knowledgeTime !== event.eventAnchorAt
  ) {
    context.addIssue({
      code: "custom",
      message: "fallback event anchor must equal knowledgeTime",
      path: ["eventAnchorAt"],
    });
  }
  const hasIdentityMetadata = event.canonicalInstrumentId !== null ||
    event.canonicalListingEpoch !== null || event.coverageClass !== null ||
    event.assetDomain !== null;
  const isWatch = event.coverageClass === "ASSET_LISTING_WATCH";
  const completeDerivativeIdentity =
    event.canonicalInstrumentId !== null &&
    event.canonicalListingEpoch !== null &&
    event.coverageClass === "SUPPORTED_DERIVATIVE" &&
    event.assetDomain !== null && event.assetDomain !== "ASSET_LISTING_WATCH";
  const completeWatchIdentity =
    event.canonicalInstrumentId === null &&
    event.canonicalListingEpoch !== null &&
    isWatch && event.assetDomain === "ASSET_LISTING_WATCH";
  if (
    hasIdentityMetadata && !completeDerivativeIdentity && !completeWatchIdentity
  ) {
    context.addIssue({
      code: "custom",
      message:
        "identity metadata must be a complete derivative identity or an explicit watch-only identity",
      path: ["canonicalInstrumentId"],
    });
  }
  if (
    event.researchDisposition === "DRAFT_RESEARCH_EVENT" &&
    (
      event.identityLinkState !== "CATALOG_EPOCH_EXACT" &&
      event.identityLinkState !== "ANNOUNCEMENT_EPOCH_EXACT"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "draft research events require exact listing-epoch lineage",
      path: ["researchDisposition"],
    });
  }
  if (
    event.researchDisposition === "WATCH_ONLY_NO_CONTRACT_PLAN" &&
    event.coverageClass !== "ASSET_LISTING_WATCH"
  ) {
    context.addIssue({
      code: "custom",
      message: "watch-only disposition requires an asset watch identity",
      path: ["coverageClass"],
    });
  }
}

export const M2ListingVenueResearchEventInputSchema = z
  .strictObject(researchEventCoreShape)
  .superRefine(validateResearchEvent);

export const M2ListingVenueResearchEventSchema = z.strictObject({
  ...researchEventCoreShape,
  researchEventId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((event, context) => {
  validateResearchEvent(event, context);
  const content = omitArtifactFields(event, ["researchEventId", "contentHash"]);
  const expectedHash = stableContentHash(content);
  if (event.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "listing research event content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    event.researchEventId !==
      `listing-research-event:${expectedHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "listing research event id mismatch",
      path: ["researchEventId"],
    });
  }
});

export type M2ListingVenueResearchEvent = z.infer<
  typeof M2ListingVenueResearchEventSchema
>;

const researchBundleCoreShape = {
  schemaVersion: z.literal(M2_LISTING_VENUE_EVENT_RESEARCH_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: ReleaseIdSchema,
  generatedAt: IsoDateTimeSchema,
  sourceCutoff: IsoDateTimeSchema,
  upstreamLedgerId: NonEmptyStringSchema,
  upstreamLedgerHash: DigestSchema,
  currentIdentitySnapshotId: NonEmptyStringSchema,
  currentIdentitySnapshotHash: DigestSchema,
  previousIdentitySnapshotId: NonEmptyStringSchema.nullable(),
  previousIdentitySnapshotHash: DigestSchema.nullable(),
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  venueDenominator: z.literal(4),
  completeCatalogSources: z.array(VenueSchema),
  sourceCoverage: z.array(M2ListingVenueSourceCoverageSchema).length(4),
  upstreamEventCount: NonNegativeIntegerSchema,
  researchEventCount: NonNegativeIntegerSchema,
  countsByVenue: VenueCountSchema,
  countsByEventClass: EventClassCountSchema,
  countsByDisposition: DispositionCountSchema,
  researchEvents: z.array(M2ListingVenueResearchEventSchema),
  researchReadiness: z.enum(M2_LISTING_RESEARCH_READINESS_STATES),
  candidateEmissionAllowed: z.literal(false),
  directionAuthorityAllowed: z.literal(false),
  probabilityAuthorityAllowed: z.literal(false),
  signalGradeAllowed: z.literal(false),
  strategyAuthorityAllowed: z.literal(false),
  readyAuthorityAllowed: z.literal(false),
  productionRuntimeAllowed: z.literal(false),
  realCohortAccepted: z.literal(false),
  authority: z.literal(M2_LISTING_VENUE_EVENT_RESEARCH_AUTHORITY),
  reasonCodes: ReasonCodesSchema,
  productionChanged: z.literal(false),
} as const;

type ResearchBundleCore = z.infer<z.ZodObject<typeof researchBundleCoreShape>>;

function emptyVenueCounts(): Record<
  (typeof M1_VENUE_SOURCE_IDS)[number],
  number
> {
  return {
    BINANCE_FUTURES: 0,
    OKX_SWAP: 0,
    BYBIT_DERIVATIVES: 0,
    BITGET_FUTURES: 0,
  };
}

function emptyEventClassCounts(): Record<
  (typeof M2_LISTING_VENUE_EVENT_CLASSES)[number],
  number
> {
  return Object.fromEntries(
    M2_LISTING_VENUE_EVENT_CLASSES.map((eventClass) => [eventClass, 0]),
  ) as Record<(typeof M2_LISTING_VENUE_EVENT_CLASSES)[number], number>;
}

function emptyDispositionCounts(): Record<
  (typeof M2_LISTING_RESEARCH_DISPOSITIONS)[number],
  number
> {
  return Object.fromEntries(
    M2_LISTING_RESEARCH_DISPOSITIONS.map((disposition) => [disposition, 0]),
  ) as Record<(typeof M2_LISTING_RESEARCH_DISPOSITIONS)[number], number>;
}

function validateResearchBundle(
  bundle: ResearchBundleCore,
  context: z.RefinementCtx,
): void {
  if (
    Date.parse(bundle.sourceCutoff) > Date.parse(bundle.generatedAt)
  ) {
    context.addIssue({
      code: "custom",
      message: "research bundle cutoff cannot exceed generatedAt",
      path: ["sourceCutoff"],
    });
  }
  const sourceIds = bundle.sourceCoverage.map((coverage) => coverage.sourceId);
  if (
    new Set(sourceIds).size !== M1_VENUE_SOURCE_IDS.length ||
    M1_VENUE_SOURCE_IDS.some((sourceId, index) =>
      sourceIds[index] !== sourceId
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "source coverage must account for every Venue exactly once",
      path: ["sourceCoverage"],
    });
  }
  if (
    new Set(bundle.completeCatalogSources).size !==
      bundle.completeCatalogSources.length ||
    bundle.completeCatalogSources.some((sourceId, index) =>
      [...bundle.completeCatalogSources].sort()[index] !== sourceId
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "complete catalog sources must be unique",
      path: ["completeCatalogSources"],
    });
  }
  for (const [index, coverage] of bundle.sourceCoverage.entries()) {
    if (Date.parse(coverage.knowledgeTime) > Date.parse(bundle.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "source coverage cannot read beyond bundle cutoff",
        path: ["sourceCoverage", index, "knowledgeTime"],
      });
    }
    const declaredComplete = coverage.catalogCoverage === "COMPLETE";
    if (declaredComplete !== bundle.completeCatalogSources.includes(
      coverage.sourceId,
    )) {
      context.addIssue({
        code: "custom",
        message: "catalog completeness disagrees with source coverage",
        path: ["sourceCoverage", index, "catalogCoverage"],
      });
    }
  }
  if (
    bundle.upstreamEventCount !== bundle.researchEvents.length ||
    bundle.researchEventCount !== bundle.researchEvents.length
  ) {
    context.addIssue({
      code: "custom",
      message: "listing event denominators must remain lossless",
      path: ["researchEventCount"],
    });
  }
  const eventIds = bundle.researchEvents.map((event) => event.researchEventId);
  if (new Set(eventIds).size !== eventIds.length) {
    context.addIssue({
      code: "custom",
      message: "listing research events must be unique",
      path: ["researchEvents"],
    });
  }
  const sorted = [...bundle.researchEvents].sort((left, right) =>
    left.knowledgeTime.localeCompare(right.knowledgeTime) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.upstreamEventId.localeCompare(right.upstreamEventId)
  );
  if (
    bundle.researchEvents.some((event, index) =>
      event.researchEventId !== sorted[index]?.researchEventId
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "listing research events must use canonical ordering",
      path: ["researchEvents"],
    });
  }
  const countsByVenue = emptyVenueCounts();
  const countsByEventClass = emptyEventClassCounts();
  const countsByDisposition = emptyDispositionCounts();
  for (const event of bundle.researchEvents) {
    countsByVenue[event.sourceId] += 1;
    countsByEventClass[event.eventClass] += 1;
    countsByDisposition[event.researchDisposition] += 1;
    if (Date.parse(event.knowledgeTime) > Date.parse(bundle.sourceCutoff)) {
      context.addIssue({
        code: "custom",
        message: "listing event cannot be known after bundle cutoff",
        path: ["researchEvents"],
      });
    }
    if (
      event.eventSource === "ANNOUNCEMENT" &&
      ["UNAVAILABLE", "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY"].includes(
        bundle.sourceCoverage.find((coverage) =>
          coverage.sourceId === event.sourceId
        )!.announcementCoverage,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "observed announcement contradicts declared source coverage",
        path: ["sourceCoverage"],
      });
    }
  }
  for (const [field, expected, actual] of [
    ["countsByVenue", countsByVenue, bundle.countsByVenue],
    ["countsByEventClass", countsByEventClass, bundle.countsByEventClass],
    ["countsByDisposition", countsByDisposition, bundle.countsByDisposition],
  ] as const) {
    if (stableContentHash(expected) !== stableContentHash(actual)) {
      context.addIssue({
        code: "custom",
        message: `${field} does not match listing research events`,
        path: [field],
      });
    }
  }
  const expectedReadiness = determineReadiness({
    evidenceClass: bundle.evidenceClass,
    sourceCoverage: bundle.sourceCoverage,
    events: bundle.researchEvents,
  });
  if (bundle.researchReadiness !== expectedReadiness) {
    context.addIssue({
      code: "custom",
      message: "listing research readiness does not match evidence",
      path: ["researchReadiness"],
    });
  }
  if (
    (bundle.previousIdentitySnapshotId === null) !==
      (bundle.previousIdentitySnapshotHash === null)
  ) {
    context.addIssue({
      code: "custom",
      message: "previous identity id and hash must be present together",
      path: ["previousIdentitySnapshotHash"],
    });
  }
}

export const M2ListingVenueEventResearchInputSchema = z
  .strictObject(researchBundleCoreShape)
  .superRefine(validateResearchBundle);

export const M2ListingVenueEventResearchBundleSchema = z.strictObject({
  ...researchBundleCoreShape,
  bundleId: NonEmptyStringSchema,
  contentHash: DigestSchema,
}).superRefine((bundle, context) => {
  validateResearchBundle(bundle, context);
  const content = omitArtifactFields(bundle, ["bundleId", "contentHash"]);
  const expectedHash = stableContentHash(content);
  if (bundle.contentHash !== expectedHash) {
    context.addIssue({
      code: "custom",
      message: "listing research bundle content hash mismatch",
      path: ["contentHash"],
    });
  }
  if (
    bundle.bundleId !==
      `listing-event-research:${expectedHash.slice(7, 31)}`
  ) {
    context.addIssue({
      code: "custom",
      message: "listing research bundle id mismatch",
      path: ["bundleId"],
    });
  }
});

export type M2ListingVenueEventResearchBundle = z.infer<
  typeof M2ListingVenueEventResearchBundleSchema
>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameInstant(left: string | null, right: string | null): boolean {
  return left !== null && right !== null &&
    Date.parse(left) === Date.parse(right);
}

function classifyEvent(event: M1ListingLifecycleEvent) {
  if (event.eventSource === "CATALOG_ABSENCE") {
    return "CATALOG_ABSENCE_UNRESOLVED" as const;
  }
  if (event.eventSource === "ANNOUNCEMENT") {
    if (event.currentState === "ANNOUNCED_WAITING_CATALOG") {
      return "CONTRACT_ANNOUNCEMENT" as const;
    }
    if (event.currentState === "DELISTING") {
      return "DELISTING_NOTICE" as const;
    }
    return event.currentState === "UNRESOLVED"
      ? "VENUE_PRODUCT_UPDATE" as const
      : "UNRESOLVED_EVENT" as const;
  }
  if (event.previousState === null) {
    return event.currentState === "PRE_LAUNCH_OR_PREOPEN"
      ? "PRE_LAUNCH_OBSERVED" as const
      : "FIRST_CATALOG_OBSERVATION" as const;
  }
  const byState = {
    ANNOUNCED_WAITING_CATALOG: "UNRESOLVED_EVENT",
    OBSERVED_UNCONFIRMED: "UNRESOLVED_EVENT",
    PRE_LAUNCH_OR_PREOPEN: "PRE_LAUNCH_OBSERVED",
    TRADING_WARMUP: "TRADING_WARMUP_STARTED",
    ESTABLISHED: "ESTABLISHED_TRANSITION",
    MAINTENANCE: "MAINTENANCE_TRANSITION",
    RESTRICTED: "RESTRICTION_TRANSITION",
    SUSPENDED: "SUSPENSION_TRANSITION",
    DELISTING: "DELISTING_TRANSITION",
    OFFLINE: "OFFLINE_TRANSITION",
    UNRESOLVED: "UNRESOLVED_EVENT",
  } as const satisfies Record<
    (typeof M1_LISTING_LIFECYCLE_STATES)[number],
    (typeof M2_LISTING_VENUE_EVENT_CLASSES)[number]
  >;
  return byState[event.currentState];
}

type ResolvedIdentity = Readonly<{
  observation: M1MultiAssetInstrumentObservation | null;
  linkState: (typeof M2_LISTING_IDENTITY_LINK_STATES)[number];
  reasons: readonly string[];
}>;

function deduplicatedInstrumentObservations(
  current: M1MultiAssetIdentitySnapshot,
  previous: M1MultiAssetIdentitySnapshot | null,
  event: M1ListingLifecycleEvent,
): M1MultiAssetInstrumentObservation[] {
  if (event.venueInstrumentId === null) {
    return [];
  }
  const byEpoch = new Map<string, M1MultiAssetInstrumentObservation>();
  for (const observation of [
    ...(previous?.observations ?? []),
    ...current.observations,
  ]) {
    if (
      observation.sourceId === event.sourceId &&
      observation.venueInstrumentId === event.venueInstrumentId
    ) {
      byEpoch.set(observation.listingEpoch, observation);
    }
  }
  return [...byEpoch.values()];
}

function announcementMatchesEpoch(
  event: M1ListingLifecycleEvent,
  observation: M1MultiAssetInstrumentObservation,
): boolean {
  if (event.providerEffectiveAt === null) {
    return false;
  }
  if (event.currentState === "ANNOUNCED_WAITING_CATALOG") {
    return sameInstant(event.providerEffectiveAt, observation.providerListTime);
  }
  if (event.currentState === "DELISTING") {
    return sameInstant(event.providerEffectiveAt, observation.providerDelistTime) ||
      sameInstant(event.providerEffectiveAt, observation.statusEffectiveAt);
  }
  return sameInstant(event.providerEffectiveAt, observation.statusEffectiveAt);
}

function resolveIdentity(input: {
  event: M1ListingLifecycleEvent;
  current: M1MultiAssetIdentitySnapshot;
  previous: M1MultiAssetIdentitySnapshot | null;
}): ResolvedIdentity {
  const candidates = deduplicatedInstrumentObservations(
    input.current,
    input.previous,
    input.event,
  );
  if (
    input.event.eventSource === "ANNOUNCEMENT" &&
    input.event.correlationStatus === "UNLINKED_ANNOUNCEMENT"
  ) {
    return {
      observation: null,
      linkState: "UNLINKED_ANNOUNCEMENT",
      reasons: ["announcement_symbol_title_guessing_forbidden"],
    };
  }
  if (input.event.eventSource === "DERIVATIVE_CATALOG") {
    const exact = candidates.filter((candidate) =>
      candidate.listingEpoch === input.event.listingEpoch
    );
    if (exact.length !== 1) {
      return {
        observation: null,
        linkState: exact.length === 0
          ? "IDENTITY_NOT_FOUND"
          : "IDENTITY_EPOCH_CONFLICT",
        reasons: ["catalog_event_requires_exact_identity_epoch"],
      };
    }
    return exactIdentityOrBlocked(exact[0]!, "CATALOG_EPOCH_EXACT");
  }
  if (input.event.eventSource === "CATALOG_ABSENCE") {
    const exact = (input.previous?.observations ?? []).filter((candidate) =>
      candidate.sourceId === input.event.sourceId &&
      candidate.venueInstrumentId === input.event.venueInstrumentId &&
      candidate.listingEpoch === input.event.listingEpoch
    );
    if (exact.length !== 1) {
      return {
        observation: null,
        linkState: exact.length === 0
          ? "IDENTITY_NOT_FOUND"
          : "IDENTITY_EPOCH_CONFLICT",
        reasons: ["catalog_absence_requires_exact_prior_identity_epoch"],
      };
    }
    return exactIdentityOrBlocked(
      exact[0]!,
      "CATALOG_ABSENCE_PRIOR_EPOCH",
    );
  }
  if (candidates.length === 0) {
    return {
      observation: null,
      linkState: "IDENTITY_NOT_FOUND",
      reasons: ["structured_announcement_instrument_not_in_identity_history"],
    };
  }
  const epochMatches = candidates.filter((candidate) =>
    announcementMatchesEpoch(input.event, candidate)
  );
  if (epochMatches.length === 1) {
    return exactIdentityOrBlocked(
      epochMatches[0]!,
      "ANNOUNCEMENT_EPOCH_EXACT",
    );
  }
  if (epochMatches.length > 1 || candidates.length > 1) {
    return {
      observation: null,
      linkState: "IDENTITY_EPOCH_CONFLICT",
      reasons: ["announcement_cannot_choose_between_listing_epochs"],
    };
  }
  return {
    observation: candidates[0]!,
    linkState: "ANNOUNCEMENT_INSTRUMENT_ONLY_EPOCH_UNPROVEN",
    reasons: ["announcement_instrument_known_but_listing_epoch_unproven"],
  };
}

function exactIdentityOrBlocked(
  observation: M1MultiAssetInstrumentObservation,
  exactLinkState:
    | "CATALOG_EPOCH_EXACT"
    | "ANNOUNCEMENT_EPOCH_EXACT"
    | "CATALOG_ABSENCE_PRIOR_EPOCH",
): ResolvedIdentity {
  if (
    observation.coverageClass === "ASSET_LISTING_WATCH" &&
    observation.assetDomain === "ASSET_LISTING_WATCH" &&
    observation.canonicalInstrumentId === null
  ) {
    return {
      observation,
      linkState: exactLinkState,
      reasons: ["watch_only_identity_has_no_canonical_contract_id_by_design"],
    };
  }
  if (
    observation.identityStatus !== "EXACT" ||
    observation.canonicalInstrumentId === null ||
    observation.assetDomain === null
  ) {
    return {
      observation,
      linkState: "IDENTITY_PARTIAL_OR_UNRESOLVED",
      reasons: ["event_identity_is_not_exact"],
    };
  }
  return {
    observation,
    linkState: exactLinkState,
    reasons: [],
  };
}

const DRAFT_EVENT_CLASSES = new Set<
  (typeof M2_LISTING_VENUE_EVENT_CLASSES)[number]
>([
  "CONTRACT_ANNOUNCEMENT",
  "PRE_LAUNCH_OBSERVED",
  "TRADING_WARMUP_STARTED",
  "ESTABLISHED_TRANSITION",
  "MAINTENANCE_TRANSITION",
  "RESTRICTION_TRANSITION",
  "SUSPENSION_TRANSITION",
  "DELISTING_NOTICE",
  "DELISTING_TRANSITION",
  "OFFLINE_TRANSITION",
]);

function researchDisposition(input: {
  eventClass: (typeof M2_LISTING_VENUE_EVENT_CLASSES)[number];
  resolved: ResolvedIdentity;
}): (typeof M2_LISTING_RESEARCH_DISPOSITIONS)[number] {
  const observation = input.resolved.observation;
  if (
    input.resolved.linkState === "IDENTITY_NOT_FOUND" ||
    input.resolved.linkState === "IDENTITY_EPOCH_CONFLICT" ||
    input.resolved.linkState === "IDENTITY_PARTIAL_OR_UNRESOLVED"
  ) {
    return "BLOCKED_UNRESOLVED_LINEAGE";
  }
  if (observation?.coverageClass === "ASSET_LISTING_WATCH") {
    return "WATCH_ONLY_NO_CONTRACT_PLAN";
  }
  if (
    observation?.assetDomain === "EQUITY_SINGLE_NAME_PERPETUAL" ||
    observation?.assetDomain === "EQUITY_INDEX_ETF_PERPETUAL"
  ) {
    return "DOMAIN_HANDOFF_M2_3B";
  }
  if (
    observation?.assetDomain === "EQUITY_CFD" ||
    observation?.assetDomain === "OTHER_RWA_DERIVATIVE"
  ) {
    return "ACCOUNTING_ONLY_UNSUPPORTED_DOMAIN";
  }
  const exactLink = input.resolved.linkState === "CATALOG_EPOCH_EXACT" ||
    input.resolved.linkState === "ANNOUNCEMENT_EPOCH_EXACT";
  if (
    observation?.assetDomain === "CRYPTO_LINEAR_PERPETUAL" &&
    exactLink && DRAFT_EVENT_CLASSES.has(input.eventClass)
  ) {
    return "DRAFT_RESEARCH_EVENT";
  }
  if (input.eventClass === "FIRST_CATALOG_OBSERVATION") {
    return "BASELINE_OBSERVATION_ONLY";
  }
  return "OBSERVATION_ONLY_UNPROVEN_EVENT_OR_EPOCH";
}

function buildM2ListingVenueResearchEvent(input: {
  releaseId: string;
  upstreamLedgerId: string;
  event: M1ListingLifecycleEvent;
  currentIdentity: M1MultiAssetIdentitySnapshot;
  previousIdentity: M1MultiAssetIdentitySnapshot | null;
}): M2ListingVenueResearchEvent {
  const event = M1ListingLifecycleEventSchema.parse(input.event);
  const current = M1MultiAssetIdentitySnapshotSchema.parse(
    input.currentIdentity,
  );
  const previous = input.previousIdentity === null
    ? null
    : M1MultiAssetIdentitySnapshotSchema.parse(input.previousIdentity);
  const eventClass = classifyEvent(event);
  const resolved = resolveIdentity({ event, current, previous });
  const observation = resolved.observation;
  const disposition = researchDisposition({ eventClass, resolved });
  const publicationAnchor = event.providerPublishedAt !== null;
  const effectiveAnchor = !publicationAnchor &&
    event.providerEffectiveAt !== null;
  const exposesCompleteIdentity = observation !== null &&
    (
      (
        observation.coverageClass === "ASSET_LISTING_WATCH" &&
        observation.assetDomain === "ASSET_LISTING_WATCH" &&
        observation.canonicalInstrumentId === null
      ) ||
      (
        observation.coverageClass === "SUPPORTED_DERIVATIVE" &&
        observation.assetDomain !== null &&
        observation.assetDomain !== "ASSET_LISTING_WATCH" &&
        observation.canonicalInstrumentId !== null
      )
    );
  const reasonCodes = uniqueSorted([
    ...event.reasonCodes,
    ...resolved.reasons,
    ...(eventClass === "FIRST_CATALOG_OBSERVATION"
      ? ["first_catalog_observation_is_baseline_not_listing_proof"]
      : []),
    ...(event.eventSource === "CATALOG_ABSENCE"
      ? ["catalog_absence_never_infers_delisting"]
      : []),
    ...(disposition === "WATCH_ONLY_NO_CONTRACT_PLAN"
      ? ["watch_only_cannot_emit_contract_candidate_or_plan"]
      : []),
    "event_alone_never_assigns_direction",
  ]);
  const core = M2ListingVenueResearchEventInputSchema.parse({
    schemaVersion: M2_LISTING_VENUE_RESEARCH_EVENT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    upstreamEventId: event.eventId,
    upstreamLedgerId: input.upstreamLedgerId,
    sourceId: event.sourceId,
    venueInstrumentId: event.venueInstrumentId,
    upstreamListingEpoch: event.listingEpoch,
    canonicalListingEpoch: exposesCompleteIdentity
      ? observation.listingEpoch
      : null,
    canonicalInstrumentId: exposesCompleteIdentity
      ? observation.canonicalInstrumentId
      : null,
    coverageClass: exposesCompleteIdentity ? observation.coverageClass : null,
    assetDomain: exposesCompleteIdentity ? observation.assetDomain : null,
    previousState: event.previousState,
    currentState: event.currentState,
    eventClass,
    eventSource: event.eventSource,
    providerPublishedAt: event.providerPublishedAt,
    providerEffectiveAt: event.providerEffectiveAt,
    knowledgeTime: event.knowledgeTime,
    eventAnchorAt: event.providerPublishedAt ?? event.providerEffectiveAt ??
      event.knowledgeTime,
    eventAnchorAuthority: publicationAnchor
      ? "PROVIDER_PUBLICATION_TIME"
      : effectiveAnchor
        ? "PROVIDER_EFFECTIVE_TIME_KNOWN_AT_OBSERVATION"
        : "KNOWLEDGE_TIME_FALLBACK",
    identityLinkState: resolved.linkState,
    researchDisposition: disposition,
    sourceRecordDigests: uniqueSorted(event.sourceRecordDigests),
    announcementIds: uniqueSorted(event.announcementIds),
    directionAuthority: "NOT_ASSIGNED_EVENT_ALONE",
    candidateEmissionAllowed: false,
    signalGradeAllowed: false,
    strategyAuthorityAllowed: false,
    readyAuthorityAllowed: false,
    reasonCodes,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M2ListingVenueResearchEventSchema.parse({
    ...core,
    researchEventId:
      `listing-research-event:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

function canonicalSourceCoverage(
  rawCoverage: readonly M2ListingVenueSourceCoverage[],
  ledger: M1ListingLifecycleLedger,
): M2ListingVenueSourceCoverage[] {
  const parsed = rawCoverage.map((coverage) =>
    M2ListingVenueSourceCoverageSchema.parse(coverage)
  );
  const byVenue = new Map(parsed.map((coverage) => [coverage.sourceId, coverage]));
  if (
    byVenue.size !== M1_VENUE_SOURCE_IDS.length ||
    M1_VENUE_SOURCE_IDS.some((sourceId) => !byVenue.has(sourceId))
  ) {
    throw new Error("source coverage must account for every Venue exactly once");
  }
  for (const sourceId of M1_VENUE_SOURCE_IDS) {
    const declaredComplete = byVenue.get(sourceId)!.catalogCoverage === "COMPLETE";
    if (declaredComplete !== ledger.completeCatalogSources.includes(sourceId)) {
      throw new Error(
        `catalog completeness disagrees with M1 ledger for ${sourceId}`,
      );
    }
    const hasAnnouncement = ledger.events.some((event) =>
      event.sourceId === sourceId && event.eventSource === "ANNOUNCEMENT"
    );
    if (
      hasAnnouncement &&
      ["UNAVAILABLE", "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY"].includes(
        byVenue.get(sourceId)!.announcementCoverage,
      )
    ) {
      throw new Error(
        `observed announcement contradicts declared coverage for ${sourceId}`,
      );
    }
  }
  return M1_VENUE_SOURCE_IDS.map((sourceId) => ({
    ...byVenue.get(sourceId)!,
    evidenceIds: [...byVenue.get(sourceId)!.evidenceIds].sort(),
    reasonCodes: uniqueSorted(byVenue.get(sourceId)!.reasonCodes),
  }));
}

function determineReadiness(input: {
  evidenceClass: M1MultiAssetIdentitySnapshot["evidenceClass"];
  sourceCoverage: readonly M2ListingVenueSourceCoverage[];
  events: readonly M2ListingVenueResearchEvent[];
}): (typeof M2_LISTING_RESEARCH_READINESS_STATES)[number] {
  if (input.evidenceClass === "TEST_ONLY") {
    return "TEST_ONLY_NO_REAL_RESEARCH_READINESS";
  }
  if (input.sourceCoverage.some((coverage) =>
    coverage.catalogCoverage !== "COMPLETE" ||
    ["PARTIAL", "UNAVAILABLE"].includes(coverage.announcementCoverage)
  )) {
    return "INSUFFICIENT_SOURCE_COVERAGE";
  }
  if (input.events.some((event) =>
    event.researchDisposition === "BLOCKED_UNRESOLVED_LINEAGE"
  )) {
    return "INSUFFICIENT_EVENT_LINEAGE";
  }
  if (!input.events.some((event) =>
    event.researchDisposition === "DRAFT_RESEARCH_EVENT"
  )) {
    return "INSUFFICIENT_EVENT_DENOMINATOR";
  }
  return "M2_4A_REVIEW_READY_NO_AUTHORITY";
}

export function buildM2ListingVenueEventResearchBundle(input: {
  releaseId: string;
  generatedAt: string;
  ledger: M1ListingLifecycleLedger;
  currentIdentity: M1MultiAssetIdentitySnapshot;
  previousIdentity: M1MultiAssetIdentitySnapshot | null;
  sourceCoverage: readonly M2ListingVenueSourceCoverage[];
}): M2ListingVenueEventResearchBundle {
  const ledger = M1ListingLifecycleLedgerSchema.parse(input.ledger);
  const current = M1MultiAssetIdentitySnapshotSchema.parse(
    input.currentIdentity,
  );
  const previous = input.previousIdentity === null
    ? null
    : M1MultiAssetIdentitySnapshotSchema.parse(input.previousIdentity);
  if (
    input.releaseId !== ledger.releaseId ||
    input.releaseId !== current.releaseId ||
    ledger.currentIdentitySnapshotId !== current.snapshotId ||
    Date.parse(current.sourceCutoff) > Date.parse(ledger.sourceCutoff) ||
    Date.parse(ledger.generatedAt) > Date.parse(input.generatedAt)
  ) {
    throw new Error("listing research bundle upstream identity or time drifted");
  }
  if (
    (ledger.previousIdentitySnapshotId === null) !== (previous === null) ||
    (
      previous !== null &&
      (
        ledger.previousIdentitySnapshotId !== previous.snapshotId ||
        previous.releaseId !== input.releaseId ||
        previous.registryDigest !== current.registryDigest ||
        Date.parse(previous.sourceCutoff) >= Date.parse(current.sourceCutoff)
      )
    )
  ) {
    throw new Error("listing research bundle previous identity drifted");
  }
  if (ledger.events.some((event) =>
    Date.parse(event.knowledgeTime) > Date.parse(ledger.sourceCutoff)
  )) {
    throw new Error("listing research event reads beyond source cutoff");
  }
  const sourceCoverage = canonicalSourceCoverage(input.sourceCoverage, ledger);
  if (sourceCoverage.some((coverage) =>
    Date.parse(coverage.knowledgeTime) > Date.parse(ledger.sourceCutoff)
  )) {
    throw new Error("source coverage reads beyond listing research cutoff");
  }
  const researchEvents = ledger.events.map((event) =>
    buildM2ListingVenueResearchEvent({
      releaseId: input.releaseId,
      upstreamLedgerId: ledger.ledgerId,
      event,
      currentIdentity: current,
      previousIdentity: previous,
    })
  ).sort((left, right) =>
    left.knowledgeTime.localeCompare(right.knowledgeTime) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.upstreamEventId.localeCompare(right.upstreamEventId)
  );
  const countsByVenue = emptyVenueCounts();
  const countsByEventClass = emptyEventClassCounts();
  const countsByDisposition = emptyDispositionCounts();
  for (const event of researchEvents) {
    countsByVenue[event.sourceId] += 1;
    countsByEventClass[event.eventClass] += 1;
    countsByDisposition[event.researchDisposition] += 1;
  }
  const readiness = determineReadiness({
    evidenceClass: current.evidenceClass,
    sourceCoverage,
    events: researchEvents,
  });
  const reasonCodes = uniqueSorted([
    ...sourceCoverage.flatMap((coverage) => coverage.reasonCodes),
    ...(current.evidenceClass === "TEST_ONLY"
      ? ["test_only_identity_cannot_establish_real_research_readiness"]
      : []),
    ...(readiness === "INSUFFICIENT_SOURCE_COVERAGE"
      ? ["listing_event_source_coverage_incomplete"]
      : []),
    "m2_3a_r0_draft_uncalibrated_no_candidate_emission",
    "m2_4a_real_cohort_and_untouched_holdout_required",
  ]);
  const core = M2ListingVenueEventResearchInputSchema.parse({
    schemaVersion: M2_LISTING_VENUE_EVENT_RESEARCH_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.releaseId,
    generatedAt: input.generatedAt,
    sourceCutoff: ledger.sourceCutoff,
    upstreamLedgerId: ledger.ledgerId,
    upstreamLedgerHash: ledger.contentHash,
    currentIdentitySnapshotId: current.snapshotId,
    currentIdentitySnapshotHash: current.contentHash,
    previousIdentitySnapshotId: previous?.snapshotId ?? null,
    previousIdentitySnapshotHash: previous?.contentHash ?? null,
    evidenceClass: current.evidenceClass,
    venueDenominator: 4,
    completeCatalogSources: [...ledger.completeCatalogSources].sort(),
    sourceCoverage,
    upstreamEventCount: ledger.eventCount,
    researchEventCount: researchEvents.length,
    countsByVenue,
    countsByEventClass,
    countsByDisposition,
    researchEvents,
    researchReadiness: readiness,
    candidateEmissionAllowed: false,
    directionAuthorityAllowed: false,
    probabilityAuthorityAllowed: false,
    signalGradeAllowed: false,
    strategyAuthorityAllowed: false,
    readyAuthorityAllowed: false,
    productionRuntimeAllowed: false,
    realCohortAccepted: false,
    authority: M2_LISTING_VENUE_EVENT_RESEARCH_AUTHORITY,
    reasonCodes,
    productionChanged: false,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M2ListingVenueEventResearchBundleSchema.parse({
    ...core,
    bundleId: `listing-event-research:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
