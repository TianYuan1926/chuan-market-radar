import assert from "node:assert/strict";
import test from "node:test";
import {
  createM1ListingAnnouncementObservation,
  buildM1ListingLifecycleLedger,
  M1ListingLifecycleEventSchema,
} from "../multi-asset-universe/listing-lifecycle-contract";
import {
  normalizeBybitMultiAssetCatalog,
} from "../multi-asset-universe/adapters/four-venue-multi-asset-catalog";
import {
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  createM1MultiAssetObservation,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import { M1_VENUE_SOURCE_IDS } from "../source-capability/source-capability-contract";
import {
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2ListingVenueEventResearchBundleSchema,
  buildM2ListingVenueEventResearchBundle,
  type M2ListingVenueSourceCoverage,
} from "./m2-listing-venue-event-research";

const RELEASE_ID = "1234567890abcdef1234567890abcdef12345678";
const REGISTRY_DIGEST =
  "sha256:45832cf889c92153a29d511582c386a9089d1eeb904a3e8ecdee5772904dfd94";
const SOURCE_DIGEST =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const T0 = "2026-07-23T10:00:00.000Z";
const T1 = "2026-07-23T10:05:00.000Z";
const T2 = "2026-07-23T10:06:00.000Z";
const LIST_AT = "2026-07-23T10:00:00.000Z";

function bybitObservation(input: {
  status: "PreLaunch" | "Trading";
  receivedAt: string;
}): M1MultiAssetInstrumentObservation {
  const normalized = normalizeBybitMultiAssetCatalog({
    payload: {
      retCode: 0,
      result: {
        category: "linear",
        list: [{
          symbol: "TESTUSDT",
          contractType: "LinearPerpetual",
          status: input.status,
          baseCoin: "TEST",
          quoteCoin: "USDT",
          settleCoin: "USDT",
          launchTime: String(Date.parse(LIST_AT)),
          deliveryTime: "0",
          symbolType: "",
          isPreListing: input.status === "PreLaunch",
          priceFilter: { tickSize: "0.0001" },
          lotSizeFilter: { qtyStep: "1" },
        }],
        nextPageCursor: "",
      },
    },
    receivedAt: input.receivedAt,
  });
  assert.equal(normalized.status, "PASS");
  return normalized.observations[0]!;
}

function buildCatalogBinding(input: {
  generatedAt: string;
  sourceCutoff: string;
  observations: readonly M1MultiAssetInstrumentObservation[];
}) {
  const upstreamBindingId = "m1-shadow-upstream:m2-3a-test";
  const venueCaptures = M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const observations = input.observations.filter(
      (observation) => observation.sourceId === sourceId,
    );
    const normalizationStatus = observations.length === 0
      ? "FAIL" as const
      : observations.some((observation) =>
          observation.identityStatus !== "EXACT" &&
          observation.coverageClass !== "ASSET_LISTING_WATCH"
        )
        ? "PARTIAL" as const
        : "PASS" as const;
    return buildM1MultiAssetCatalogVenueCapture({
      releaseId: RELEASE_ID,
      registryDigest: REGISTRY_DIGEST,
      upstreamBindingId,
      upstreamBindingHash: SOURCE_DIGEST,
      evidenceClass: "TEST_ONLY",
      networkEnvironment: "TEST_HARNESS",
      sourceId,
      requestOutcomes: [{
        outcome: "SUCCESS",
        pageIndex: 1,
        requestUrlHash:
          M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId]
            .initialRequestUrlHash,
        receivedAt: input.sourceCutoff,
        httpStatus: 200,
        responseBytes: Math.max(1, observations.length * 100),
        responseHash: stableContentHash(observations),
        recordCount: observations.length,
        nextPageAvailable: false,
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }],
      rawRecordCount: observations.length,
      observations,
      normalizationStatus,
      reasonCodes: normalizationStatus === "FAIL"
        ? ["fixture_venue_has_no_catalog_rows"]
        : observations.flatMap((observation) => observation.reasonCodes),
    });
  });
  return buildM1MultiAssetCatalogCaptureBinding({
    releaseId: RELEASE_ID,
    generatedAt: input.generatedAt,
    registryDigest: REGISTRY_DIGEST,
    upstreamBindingId,
    upstreamBindingHash: SOURCE_DIGEST,
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    venueCaptures,
  });
}

function snapshot(input: {
  generatedAt: string;
  sourceCutoff: string;
  observations: readonly M1MultiAssetInstrumentObservation[];
  previous?: M1MultiAssetIdentitySnapshot | null;
}) {
  return buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    registryDigest: REGISTRY_DIGEST,
    catalogCaptureBinding: buildCatalogBinding(input),
    observations: input.observations,
    previous: input.previous,
  });
}

function announcement(input: {
  id?: string;
  linked?: boolean;
  effectiveAt?: string | null;
  knowledgeTime?: string;
  kind?: "LISTING" | "DELISTING" | "PRODUCT_UPDATE" | "OTHER";
}) {
  const linked = input.linked ?? true;
  return createM1ListingAnnouncementObservation({
    sourceId: "BYBIT_DERIVATIVES",
    announcementId: input.id ?? "announcement-1",
    announcementUrl: "https://announcements.bybit.com/test-event",
    titleDigest: SOURCE_DIGEST,
    announcementKind: input.kind ?? "LISTING",
    productScope: "DERIVATIVE",
    providerPublishedAt: "2026-07-23T09:55:00.000Z",
    providerEffectiveAt: input.effectiveAt === undefined
      ? LIST_AT
      : input.effectiveAt,
    knowledgeTime: input.knowledgeTime ?? T1,
    structuredVenueInstrumentIds: linked ? ["TESTUSDT"] : [],
    instrumentLinkAuthority: linked
      ? "PROVIDER_STRUCTURED_FIELD"
      : "UNLINKED_NO_SYMBOL_GUESSING",
    sourceCapability: "LISTING_ANNOUNCEMENT",
    sourceRecordDigest: SOURCE_DIGEST,
    reasonCodes: [],
  });
}

function coverageFor(
  ledger: ReturnType<typeof buildM1ListingLifecycleLedger>,
): M2ListingVenueSourceCoverage[] {
  return M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const completeCatalog = ledger.completeCatalogSources.includes(sourceId);
    const hasAnnouncement = ledger.events.some((event) =>
      event.sourceId === sourceId && event.eventSource === "ANNOUNCEMENT"
    );
    return {
      sourceId,
      catalogCoverage: completeCatalog ? "COMPLETE" : "PARTIAL",
      announcementCoverage: hasAnnouncement
        ? "PARTIAL"
        : "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
      knowledgeTime: ledger.sourceCutoff,
      evidenceIds: [`coverage:${sourceId}`],
      reasonCodes: [
        ...(completeCatalog ? [] : ["test_catalog_coverage_partial"]),
        ...(hasAnnouncement
          ? ["test_announcement_window_partial"]
          : ["test_announcement_capability_not_bound"]),
      ],
    } satisfies M2ListingVenueSourceCoverage;
  });
}

function transitionScenario(extraAnnouncements = [announcement({})]) {
  const previous = snapshot({
    generatedAt: T0,
    sourceCutoff: T0,
    observations: [bybitObservation({ status: "PreLaunch", receivedAt: T0 })],
  });
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [bybitObservation({ status: "Trading", receivedAt: T1 })],
    previous,
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: extraAnnouncements,
  });
  return { previous, current, ledger };
}

function bundleFor(
  scenario: ReturnType<typeof transitionScenario>,
  sourceCoverage = coverageFor(scenario.ledger),
) {
  return buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger: scenario.ledger,
    currentIdentity: scenario.current,
    previousIdentity: scenario.previous,
    sourceCoverage,
  });
}

test("maps exact announcement and lifecycle transition into lossless draft research events", () => {
  const bundle = bundleFor(transitionScenario());

  assert.equal(bundle.upstreamEventCount, 2);
  assert.equal(bundle.researchEventCount, 2);
  assert.equal(bundle.countsByDisposition.DRAFT_RESEARCH_EVENT, 2);
  assert.equal(bundle.countsByEventClass.CONTRACT_ANNOUNCEMENT, 1);
  assert.equal(bundle.countsByEventClass.TRADING_WARMUP_STARTED, 1);
  assert.equal(bundle.researchReadiness, "TEST_ONLY_NO_REAL_RESEARCH_READINESS");
  assert.ok(bundle.researchEvents.every((event) =>
    event.directionAuthority === "NOT_ASSIGNED_EVENT_ALONE" &&
    !event.candidateEmissionAllowed && !event.signalGradeAllowed &&
    !event.strategyAuthorityAllowed && !event.readyAuthorityAllowed
  ));
  const announcementEvent = bundle.researchEvents.find((event) =>
    event.eventClass === "CONTRACT_ANNOUNCEMENT"
  )!;
  assert.equal(announcementEvent.providerPublishedAt, "2026-07-23T09:55:00.000Z");
  assert.equal(announcementEvent.providerEffectiveAt, LIST_AT);
  assert.equal(announcementEvent.knowledgeTime, T1);
  assert.equal(announcementEvent.eventAnchorAt, "2026-07-23T09:55:00.000Z");
  assert.equal(announcementEvent.eventAnchorAuthority, "PROVIDER_PUBLICATION_TIME");
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.researchEvents[0]));
});

test("M1 lifecycle events preserve publication time only for announcements", () => {
  const scenario = transitionScenario();
  const announcementEvent = scenario.ledger.events.find((event) =>
    event.eventSource === "ANNOUNCEMENT"
  )!;
  const catalogEvent = scenario.ledger.events.find((event) =>
    event.eventSource === "DERIVATIVE_CATALOG"
  )!;

  assert.equal(announcementEvent.providerPublishedAt, "2026-07-23T09:55:00.000Z");
  assert.equal(catalogEvent.providerPublishedAt, null);
  assert.equal(
    M1ListingLifecycleEventSchema.safeParse({
      ...announcementEvent,
      providerPublishedAt: null,
    }).success,
    false,
  );
  assert.equal(
    M1ListingLifecycleEventSchema.safeParse({
      ...catalogEvent,
      providerPublishedAt: "2026-07-23T09:59:00.000Z",
    }).success,
    false,
  );
});

test("is deterministic under source coverage input ordering", () => {
  const scenario = transitionScenario();
  const first = bundleFor(scenario);
  const second = bundleFor(scenario, coverageFor(scenario.ledger).reverse());

  assert.equal(first.bundleId, second.bundleId);
  assert.equal(first.contentHash, second.contentHash);
});

test("never guesses an instrument from an unlinked announcement", () => {
  const scenario = transitionScenario([
    announcement({ id: "unlinked", linked: false }),
  ]);
  const bundle = bundleFor(scenario);
  const event = bundle.researchEvents.find((candidate) =>
    candidate.upstreamEventId === scenario.ledger.events.find((upstream) =>
      upstream.announcementIds.includes("unlinked")
    )?.eventId
  )!;

  assert.equal(event.identityLinkState, "UNLINKED_ANNOUNCEMENT");
  assert.equal(event.canonicalInstrumentId, null);
  assert.equal(
    event.researchDisposition,
    "OBSERVATION_ONLY_UNPROVEN_EVENT_OR_EPOCH",
  );
  assert.ok(
    event.reasonCodes.includes("announcement_symbol_title_guessing_forbidden"),
  );
});

test("requires provider effective time to bind an announcement to a listing epoch", () => {
  const scenario = transitionScenario([
    announcement({
      id: "wrong-epoch",
      effectiveAt: "2026-08-01T00:00:00.000Z",
    }),
  ]);
  const event = bundleFor(scenario).researchEvents.find((candidate) =>
    candidate.announcementIds.includes("wrong-epoch")
  )!;

  assert.equal(
    event.identityLinkState,
    "ANNOUNCEMENT_INSTRUMENT_ONLY_EPOCH_UNPROVEN",
  );
  assert.equal(
    event.researchDisposition,
    "OBSERVATION_ONLY_UNPROVEN_EVENT_OR_EPOCH",
  );
});

test("treats a first active catalog observation as baseline, not listing proof", () => {
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [bybitObservation({ status: "Trading", receivedAt: T1 })],
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous: null,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [],
  });
  const bundle = buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger,
    currentIdentity: current,
    previousIdentity: null,
    sourceCoverage: coverageFor(ledger),
  });

  assert.equal(bundle.researchEvents[0]?.eventClass, "FIRST_CATALOG_OBSERVATION");
  assert.equal(
    bundle.researchEvents[0]?.researchDisposition,
    "BASELINE_OBSERVATION_ONLY",
  );
});

test("catalog disappearance stays unresolved and never becomes a delisting event", () => {
  const previous = snapshot({
    generatedAt: T0,
    sourceCutoff: T0,
    observations: [bybitObservation({ status: "Trading", receivedAt: T0 })],
  });
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [],
    previous,
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [],
  });
  const bundle = buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger,
    currentIdentity: current,
    previousIdentity: previous,
    sourceCoverage: coverageFor(ledger),
  });
  const event = bundle.researchEvents[0]!;

  assert.equal(event.eventClass, "CATALOG_ABSENCE_UNRESOLVED");
  assert.equal(event.currentState, "UNRESOLVED");
  assert.notEqual(event.eventClass, "DELISTING_TRANSITION");
  assert.equal(
    event.researchDisposition,
    "OBSERVATION_ONLY_UNPROVEN_EVENT_OR_EPOCH",
  );
});

test("keeps asset-only listings WATCH_ONLY without inventing a contract id", () => {
  const watch = createM1MultiAssetObservation({
    coverageClass: "ASSET_LISTING_WATCH",
    assetDomain: "ASSET_LISTING_WATCH",
    sourceId: "BYBIT_DERIVATIVES",
    venueInstrumentId: "NEWCOIN",
    canonicalInstrumentId: null,
    underlyingGroupId: null,
    underlyingReferenceId: null,
    baseAsset: "NEWCOIN",
    quoteAsset: null,
    settlementAsset: null,
    contractMechanism: "NONE_ASSET_WATCH",
    contractMultiplier: null,
    priceTick: null,
    quantityStep: null,
    listingEpoch: "listing:watch:newcoin:1",
    identityEpoch: "identity:watch:newcoin:1",
    identityStatus: "PARTIAL",
    classificationAuthority: "PROVIDER_EXPLICIT_CATEGORY",
    classificationEvidenceIds: [],
    providerStatus: "ANNOUNCED",
    lifecycleState: "ANNOUNCED_WAITING_CATALOG",
    providerListTime: null,
    providerDelistTime: null,
    firstObservedAt: T1,
    statusEffectiveAt: null,
    knowledgeTime: T1,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: SOURCE_DIGEST,
    reasonCodes: ["asset_listing_has_no_supported_contract"],
  });
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [watch],
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous: null,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [],
  });
  const bundle = buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger,
    currentIdentity: current,
    previousIdentity: null,
    sourceCoverage: coverageFor(ledger),
  });
  const event = bundle.researchEvents[0]!;

  assert.equal(event.researchDisposition, "WATCH_ONLY_NO_CONTRACT_PLAN");
  assert.equal(event.coverageClass, "ASSET_LISTING_WATCH");
  assert.equal(event.canonicalInstrumentId, null);
  assert.equal(event.candidateEmissionAllowed, false);
});

test("routes equity listing events to M2.3B instead of crypto research", () => {
  const equity = createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    sourceId: "BYBIT_DERIVATIVES",
    venueInstrumentId: "AAPLUSDT",
    canonicalInstrumentId: "canonical:aapl:epoch-1",
    underlyingGroupId: "underlying:aapl:usd",
    underlyingReferenceId: "NASDAQ:AAPL",
    baseAsset: "AAPL",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    contractMechanism: "LINEAR_PERPETUAL",
    contractMultiplier: "1",
    priceTick: "0.01",
    quantityStep: "0.01",
    listingEpoch: "listing:aapl:1",
    identityEpoch: "identity:aapl:1",
    identityStatus: "EXACT",
    classificationAuthority: "OFFICIAL_PRODUCT_MAPPING",
    classificationEvidenceIds: ["official-mapping:aapl"],
    providerStatus: "PreLaunch",
    lifecycleState: "PRE_LAUNCH_OR_PREOPEN",
    providerListTime: T1,
    providerDelistTime: null,
    firstObservedAt: T1,
    statusEffectiveAt: T1,
    knowledgeTime: T1,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: SOURCE_DIGEST,
    reasonCodes: [],
  });
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [equity],
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous: null,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [],
  });
  const bundle = buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger,
    currentIdentity: current,
    previousIdentity: null,
    sourceCoverage: coverageFor(ledger),
  });

  assert.equal(bundle.researchEvents[0]?.researchDisposition, "DOMAIN_HANDOFF_M2_3B");
});

test("preserves partial identity as an explicit blocked row instead of dropping it", () => {
  const partial = createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    sourceId: "BYBIT_DERIVATIVES",
    venueInstrumentId: "PARTIALUSDT",
    canonicalInstrumentId: null,
    underlyingGroupId: null,
    underlyingReferenceId: "PARTIAL",
    baseAsset: "PARTIAL",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    contractMechanism: "LINEAR_PERPETUAL",
    contractMultiplier: null,
    priceTick: "0.001",
    quantityStep: "1",
    listingEpoch: "listing:partial:1",
    identityEpoch: "identity:partial:1",
    identityStatus: "PARTIAL",
    classificationAuthority: "PROVIDER_NEGATIVE_RWA_FLAG",
    classificationEvidenceIds: [],
    providerStatus: "PreLaunch",
    lifecycleState: "PRE_LAUNCH_OR_PREOPEN",
    providerListTime: T1,
    providerDelistTime: null,
    firstObservedAt: T1,
    statusEffectiveAt: T1,
    knowledgeTime: T1,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: SOURCE_DIGEST,
    reasonCodes: ["contract_multiplier_missing"],
  });
  const current = snapshot({
    generatedAt: T1,
    sourceCutoff: T1,
    observations: [partial],
  });
  const ledger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current,
    previous: null,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [],
  });
  const bundle = buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger,
    currentIdentity: current,
    previousIdentity: null,
    sourceCoverage: coverageFor(ledger),
  });
  const event = bundle.researchEvents[0]!;

  assert.equal(event.identityLinkState, "IDENTITY_PARTIAL_OR_UNRESOLVED");
  assert.equal(event.researchDisposition, "BLOCKED_UNRESOLVED_LINEAGE");
  assert.equal(event.canonicalInstrumentId, null);
  assert.equal(bundle.researchEventCount, bundle.upstreamEventCount);
});

test("rejects source coverage denominators and catalog completeness drift", () => {
  const scenario = transitionScenario();
  const coverage = coverageFor(scenario.ledger);

  assert.throws(() => bundleFor(scenario, coverage.slice(1)));
  const drifted = structuredClone(coverage);
  drifted.find((item) => item.sourceId === "BINANCE_FUTURES")!
    .catalogCoverage = "COMPLETE";
  assert.throws(() => bundleFor(scenario, drifted));
});

test("rejects announcements declared unavailable and source coverage after cutoff", () => {
  const scenario = transitionScenario();
  const unavailable = structuredClone(coverageFor(scenario.ledger));
  unavailable.find((item) => item.sourceId === "BYBIT_DERIVATIVES")!
    .announcementCoverage = "UNAVAILABLE";
  assert.throws(() => bundleFor(scenario, unavailable));

  const futureCoverage = structuredClone(coverageFor(scenario.ledger));
  futureCoverage[0]!.knowledgeTime = "2026-07-23T10:05:01.000Z";
  assert.throws(() => bundleFor(scenario, futureCoverage));
});

test("rejects upstream release drift and event knowledge after the research cutoff", () => {
  const scenario = transitionScenario();
  assert.throws(() => buildM2ListingVenueEventResearchBundle({
    releaseId: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger: scenario.ledger,
    currentIdentity: scenario.current,
    previousIdentity: scenario.previous,
    sourceCoverage: coverageFor(scenario.ledger),
  }));

  const futureAnnouncement = announcement({
    id: "future-knowledge",
    knowledgeTime: "2026-07-23T10:06:30.000Z",
  });
  const futureLedger = buildM1ListingLifecycleLedger({
    releaseId: RELEASE_ID,
    generatedAt: T2,
    sourceCutoff: T1,
    current: scenario.current,
    previous: scenario.previous,
    completeCatalogSources: ["BYBIT_DERIVATIVES"],
    announcements: [futureAnnouncement],
  });
  assert.throws(() => buildM2ListingVenueEventResearchBundle({
    releaseId: RELEASE_ID,
    generatedAt: "2026-07-23T10:07:00.000Z",
    ledger: futureLedger,
    currentIdentity: scenario.current,
    previousIdentity: scenario.previous,
    sourceCoverage: coverageFor(futureLedger),
  }));
});

test("schema detects denominator and content-address tampering", () => {
  const bundle = bundleFor(transitionScenario());
  const countTamper = structuredClone(bundle);
  countTamper.countsByVenue.BYBIT_DERIVATIVES += 1;
  assert.equal(
    M2ListingVenueEventResearchBundleSchema.safeParse(countTamper).success,
    false,
  );

  const hashTamper = structuredClone(bundle);
  hashTamper.reasonCodes.push("post_hash_mutation");
  assert.equal(
    M2ListingVenueEventResearchBundleSchema.safeParse(hashTamper).success,
    false,
  );

  const semanticTamper = structuredClone(bundle);
  semanticTamper.researchReadiness = "M2_4A_REVIEW_READY_NO_AUTHORITY";
  const semanticHash = stableContentHash(
    omitArtifactFields(semanticTamper, ["bundleId", "contentHash"]),
  );
  semanticTamper.contentHash = semanticHash;
  semanticTamper.bundleId =
    `listing-event-research:${semanticHash.slice(7, 31)}`;
  assert.equal(
    M2ListingVenueEventResearchBundleSchema.safeParse(semanticTamper).success,
    false,
  );
});
