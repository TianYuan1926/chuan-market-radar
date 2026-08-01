import assert from "node:assert/strict";
import test from "node:test";
import {
  buildM1RuntimeAdapterProfileSet,
  type M1RuntimeAdapterProfile,
} from "../collector/runtime-adapter-profile";
import {
  buildM1ListingWatchEvidenceBinding,
} from "../market-fact/multi-asset-base-fact-contract";
import {
  advanceM1ListingHistory,
  parseM1ListingHistoryPage,
  type M1ListingHistoryPage,
} from "../multi-asset-universe/listing-history-runtime";
import type {
  M1ListingWatchRefreshBatch,
  M1ListingWatchRefreshResult,
} from "../multi-asset-universe/m1-listing-watch-live-runtime";
import {
  M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE,
  buildM1MultiAssetCatalogCaptureBinding,
  buildM1MultiAssetCatalogVenueCapture,
  buildM1MultiAssetIdentitySnapshot,
  createM1MultiAssetObservation,
  deriveM1CanonicalInstrumentId,
  deriveM1IdentityEpoch,
  deriveM1ListingEpoch,
  type M1MultiAssetIdentitySnapshot,
  type M1MultiAssetInstrumentObservation,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
} from "../source-conformance/source-conformance-contract";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "../shadow/m1-multi-asset-shadow-contract";
import {
  omitArtifactFields,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M2ListingVenueEventEvidenceJoinSchema,
  buildM2ListingVenueEventEvidenceJoin,
  buildM2ListingWatchRefreshEvidence,
} from "./m2-listing-venue-event-evidence-join";
import {
  buildM2ListingVenueEventRuntimeEvidence,
  verifyM2ListingVenueEventRuntimeEvidenceSet,
} from "./m2-listing-venue-event-runtime-evidence";

const CONFORMANCE_RELEASE = "a".repeat(40);
const RELEASE_ID = "b".repeat(40);
const PROFILE_GENERATED_AT = "2026-07-24T02:00:00.000Z";
const UPSTREAM_CUTOFF = "2026-07-24T02:09:59.000Z";
const FIRST_OBSERVED_AT = "2026-07-24T02:00:00.000Z";
const CATALOG_CUTOFF = "2026-07-24T02:18:00.000Z";
const LISTING_CUTOFF = "2026-07-24T02:19:00.000Z";
const GENERATED_AT = "2026-07-24T02:21:00.000Z";

function conformanceArtifact() {
  const probes = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS.map(
    (definition, index) =>
      M1SourceConformanceProbeObservationSchema.parse({
        probeId: definition.probeId,
        sourceId: definition.sourceId,
        capabilityId: definition.capabilityId,
        gate: definition.gate,
        definitionDigest: definition.definitionDigest,
        evidenceClass: "LIVE_READ_ONLY",
        outcome: "PASS",
        attemptStartedAt: "2026-07-24T01:59:58.000Z",
        receivedAt: "2026-07-24T01:59:59.000Z",
        latencyMs: 1_000,
        httpStatus: 200,
        responseBodyDigest:
          `sha256:${(index + 1).toString(16).padStart(64, "0")}`,
        responseBytes: 1_000,
        topLevelKeys: ["data"],
        recordKeys: ["id"],
        observedRecordCount: 1,
        providerServerTime: null,
        absoluteClockSkewMs: null,
        paginationStatus:
          definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
            ? "BOUNDED_COMPLETE"
            : definition.paginationExpectation === "MUST_TERMINATE"
              ? "COMPLETE"
              : "NOT_APPLICABLE",
        credentialDisposition: definition.requiresReadOnlyApiKey
          ? "READ_ONLY_KEY_USED_NOT_RETAINED"
          : "PUBLIC_NO_CREDENTIAL",
        failure: null,
        reasonCodes: [],
        rawBodyRetained: false,
        secretMaterialPresent: false,
      }),
  );
  return buildM1SourceConformanceArtifact({
    releaseId: CONFORMANCE_RELEASE,
    generatedAt: "2026-07-24T01:59:59.000Z",
    sourceCutoff: "2026-07-24T01:59:59.000Z",
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    probes,
  });
}

function profileSet() {
  return buildM1RuntimeAdapterProfileSet({
    runtimeReleaseId: RELEASE_ID,
    generatedAt: PROFILE_GENERATED_AT,
    conformanceArtifact: conformanceArtifact(),
  });
}

function upstream(
  profiles = profileSet(),
): M1MultiAssetShadowUpstreamBinding {
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE_ID,
    generatedAt: UPSTREAM_CUTOFF,
    sourceCutoff: UPSTREAM_CUTOFF,
    runtimeAdapterArtifactId: "runtime-adapter-live:m2-3a-r1-fixture",
    runtimeAdapterArtifactHash: `sha256:${"1".repeat(64)}`,
    conformanceArtifactId: profiles.conformanceArtifactId,
    conformanceArtifactHash: profiles.conformanceArtifactHash,
    registryDigest: profiles.registryDigest,
    profileSetHash: profiles.contentHash,
    evidenceClass: "TEST_ONLY" as const,
    networkEnvironment: "TEST_HARNESS" as const,
    runtimeAdapterStatus: "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
    liveConformantProfileCount: 15 as const,
    routeEligibleProfileCount: 14 as const,
    registryBlockedProfileCount: 1 as const,
    listingCheckpointCommittedCount: 2 as const,
    listingGapCount: 0 as const,
    acceptanceAxes: M1_MULTI_ASSET_SHADOW_AXIS_IDS.map(
      (axisId, index) => ({
        axisId,
        routeGateStatus: "PASS" as const,
        axisEvidenceId: `axis:${axisId}`,
        contentHash: stableContentHash({ axisId, index }),
      }),
    ),
    authorityGranted: false as const,
    productionChanged: false as const,
    secretMaterialPresent: false as const,
  };
  const contentHash = stableContentHash(core);
  return M1MultiAssetShadowUpstreamBindingSchema.parse({
    ...core,
    upstreamBindingId: `m1-shadow-upstream:${contentHash.slice(7, 31)}`,
    contentHash,
  });
}

function listingProfile(
  profiles: ReturnType<typeof profileSet>,
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
): M1RuntimeAdapterProfile {
  const profile = profiles.profiles.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.capabilityId === "LISTING_ANNOUNCEMENT",
  );
  assert.ok(profile);
  return profile;
}

function bybitPayload() {
  return {
    retCode: 0,
    result: {
      total: 1,
      list: [{
        title: "New derivative product",
        type: { key: "new_crypto" },
        tags: ["Derivatives"],
        url: "https://announcements.bybit.com/en-US/article/r1-event",
        publishTime: Date.parse("2026-07-24T02:05:00.000Z"),
      }],
    },
    time: Date.parse(LISTING_CUTOFF),
  };
}

function bitgetPayload() {
  return {
    code: "00000",
    requestTime: Date.parse(LISTING_CUTOFF),
    data: [{
      annId: "r1-bitget-event",
      annTitle: "New futures product",
      annUrl: "https://www.bitget.com/support/articles/r1-bitget-event",
      cTime: String(Date.parse("2026-07-24T02:06:00.000Z")),
      annType: "coin_listings",
      annSubType: "futures",
    }],
  };
}

function listingPage(input: {
  profile: M1RuntimeAdapterProfile;
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES";
}): M1ListingHistoryPage {
  const payload = input.sourceId === "BYBIT_DERIVATIVES"
    ? bybitPayload()
    : bitgetPayload();
  return parseM1ListingHistoryPage({
    profile: input.profile,
    mode: "BOOTSTRAP",
    pageOrdinal: 1,
    requestToken: input.sourceId === "BYBIT_DERIVATIVES"
      ? "page:1"
      : "ROOT",
    receivedAt: LISTING_CUTOFF,
    responseBodyHash: stableContentHash(payload),
    payload,
  });
}

function committedListingResult(input: {
  profiles: ReturnType<typeof profileSet>;
  upstream: M1MultiAssetShadowUpstreamBinding;
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES";
}): M1ListingWatchRefreshResult {
  const profile = listingProfile(input.profiles, input.sourceId);
  const page = listingPage({ profile, sourceId: input.sourceId });
  const advance = advanceM1ListingHistory({
    profile,
    mode: "BOOTSTRAP",
    priorCheckpoint: null,
    pages: [page],
    segmentStop: "SOURCE_TERMINAL",
    generatedAt: LISTING_CUTOFF,
    sourceCutoff: LISTING_CUTOFF,
  });
  assert.equal(advance.status, "COMMITTED");
  const checkpoint = advance.checkpoint;
  const binding = buildM1ListingWatchEvidenceBinding({
    schemaVersion: "v2-m1-listing-watch-evidence-binding.v3",
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE_ID,
    upstreamBindingId: input.upstream.upstreamBindingId,
    upstreamBindingHash: input.upstream.contentHash,
    sourceId: input.sourceId,
    evidenceId: checkpoint.checkpointId,
    evidenceHash: checkpoint.contentHash,
    sourceCutoff: checkpoint.sourceCutoff,
    status: "COMMITTED_NO_GAP",
    checkpointGapCount: 0,
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
  });
  return {
    sourceId: input.sourceId,
    status: "COMMITTED",
    requestCount: 1,
    responseBytes: 1_000,
    priorCheckpointId: null,
    priorCheckpointHash: null,
    pages: [page],
    advance,
    checkpoint,
    binding,
    reasonCodes: [],
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  };
}

function listingBatch(input: {
  profiles: ReturnType<typeof profileSet>;
  upstream: M1MultiAssetShadowUpstreamBinding;
}): M1ListingWatchRefreshBatch {
  const results = (
    ["BITGET_FUTURES", "BYBIT_DERIVATIVES"] as const
  ).map((sourceId) => committedListingResult({ ...input, sourceId }));
  return batchFromResults(results);
}

function batchFromResults(
  results: readonly M1ListingWatchRefreshResult[],
): M1ListingWatchRefreshBatch {
  const bindings = results.flatMap((result) =>
    result.binding === null ? [] : [result.binding]
  );
  const checkpoints = results.flatMap((result) =>
    result.checkpoint === null ? [] : [result.checkpoint]
  );
  return {
    results,
    bindings,
    checkpoints,
    allCommitted: results.every((result) => result.status === "COMMITTED"),
    requestCount: results.reduce(
      (total, result) => total + result.requestCount,
      0,
    ),
    responseBytes: results.reduce(
      (total, result) => total + result.responseBytes,
      0,
    ),
    rawBodyRetained: false,
    secretMaterialPresent: false,
    authorityGranted: false,
    productionChanged: false,
  };
}

function instrument(
  sourceId: (typeof M1_VENUE_SOURCE_IDS)[number],
): M1MultiAssetInstrumentObservation {
  const venueInstrumentId = sourceId === "OKX_SWAP"
    ? "BTC-USDT-SWAP"
    : "BTCUSDT";
  const listingEpoch = deriveM1ListingEpoch({
    sourceId,
    venueInstrumentId,
    providerListTime: FIRST_OBSERVED_AT,
    firstObservedAt: FIRST_OBSERVED_AT,
  });
  const identityEpoch = deriveM1IdentityEpoch({
    sourceId,
    venueInstrumentId,
    listingEpoch,
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    underlyingReferenceId: "BTC",
  });
  return createM1MultiAssetObservation({
    coverageClass: "SUPPORTED_DERIVATIVE",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    sourceId,
    venueInstrumentId,
    providerTransportSymbol: venueInstrumentId,
    providerReferenceInstrumentId: sourceId === "OKX_SWAP"
      ? "BTC-USDT"
      : null,
    providerInstrumentFamily: sourceId === "OKX_SWAP" ? "SWAP" : null,
    providerRoutingAuthority: sourceId === "OKX_SWAP"
      ? "PROVIDER_CATALOG_EXPLICIT"
      : "VENUE_INSTRUMENT_ID_EXACT",
    canonicalInstrumentId: deriveM1CanonicalInstrumentId({
      sourceId,
      venueInstrumentId,
      identityEpoch,
    }),
    underlyingGroupId:
      `${M1_SCOPE_EPOCH}:CRYPTO_LINEAR_PERPETUAL:BTC:USDT`,
    underlyingReferenceId: "BTC",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    contractMechanism: "LINEAR_PERPETUAL",
    contractMultiplier: "1",
    priceTick: "0.01",
    quantityStep: "0.001",
    listingEpoch,
    identityEpoch,
    identityStatus: "EXACT",
    classificationAuthority: "PROVIDER_EXPLICIT_CATEGORY",
    classificationEvidenceIds: [],
    providerStatus: "TRADING",
    lifecycleState: "ESTABLISHED",
    providerListTime: FIRST_OBSERVED_AT,
    providerDelistTime: null,
    firstObservedAt: FIRST_OBSERVED_AT,
    statusEffectiveAt: FIRST_OBSERVED_AT,
    knowledgeTime: CATALOG_CUTOFF,
    jurisdictionAvailability: "UNVERIFIED",
    sourceCapability: "DERIVATIVE_INSTRUMENT_CATALOG",
    sourceRecordDigest: stableContentHash({ sourceId, venueInstrumentId }),
    reasonCodes: [],
  });
}

function catalogAndIdentity(input: {
  upstream: M1MultiAssetShadowUpstreamBinding;
  failedCatalogSource?: (typeof M1_VENUE_SOURCE_IDS)[number];
}): Readonly<{
  catalog: ReturnType<typeof buildM1MultiAssetCatalogCaptureBinding>;
  identity: M1MultiAssetIdentitySnapshot;
}> {
  const observations = M1_VENUE_SOURCE_IDS
    .filter((sourceId) => sourceId !== input.failedCatalogSource)
    .map(instrument);
  const venueCaptures = M1_VENUE_SOURCE_IDS.map((sourceId) => {
    const sourceObservations = observations.filter(
      (observation) => observation.sourceId === sourceId,
    );
    const failed = sourceId === input.failedCatalogSource;
    return buildM1MultiAssetCatalogVenueCapture({
      releaseId: RELEASE_ID,
      registryDigest: input.upstream.registryDigest,
      upstreamBindingId: input.upstream.upstreamBindingId,
      upstreamBindingHash: input.upstream.contentHash,
      evidenceClass: "TEST_ONLY",
      networkEnvironment: "TEST_HARNESS",
      sourceId,
      requestOutcomes: failed
        ? [{
          outcome: "FAILED",
          pageIndex: 1,
          requestUrlHash:
            M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId]
              .initialRequestUrlHash,
          receivedAt: CATALOG_CUTOFF,
          httpStatus: 503,
          providerFailureKind: "UNAVAILABLE",
          reasonCode: "fixture_catalog_unavailable",
          rawBodyRetained: false,
          secretMaterialPresent: false,
        }]
        : [{
          outcome: "SUCCESS",
          pageIndex: 1,
          requestUrlHash:
            M1_MULTI_ASSET_CATALOG_CAPTURE_PROFILE.sources[sourceId]
              .initialRequestUrlHash,
          receivedAt: CATALOG_CUTOFF,
          httpStatus: 200,
          responseBytes: 1_000,
          responseHash: stableContentHash(sourceObservations),
          recordCount: sourceObservations.length,
          nextPageAvailable: false,
          rawBodyRetained: false,
          secretMaterialPresent: false,
        }],
      rawRecordCount: sourceObservations.length,
      observations: sourceObservations,
      normalizationStatus: failed ? "FAIL" : "PASS",
      reasonCodes: failed ? ["fixture_catalog_unavailable"] : [],
    });
  });
  const catalog = buildM1MultiAssetCatalogCaptureBinding({
    releaseId: RELEASE_ID,
    generatedAt: CATALOG_CUTOFF,
    registryDigest: input.upstream.registryDigest,
    upstreamBindingId: input.upstream.upstreamBindingId,
    upstreamBindingHash: input.upstream.contentHash,
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    venueCaptures,
  });
  const identity = buildM1MultiAssetIdentitySnapshot({
    releaseId: RELEASE_ID,
    generatedAt: CATALOG_CUTOFF,
    sourceCutoff: CATALOG_CUTOFF,
    registryDigest: input.upstream.registryDigest,
    catalogCaptureBinding: catalog,
    observations,
    previous: null,
  });
  return { catalog, identity };
}

function scenario(input: {
  failedCatalogSource?: (typeof M1_VENUE_SOURCE_IDS)[number];
  batchTransform?: (
    batch: M1ListingWatchRefreshBatch,
  ) => M1ListingWatchRefreshBatch;
} = {}) {
  const profiles = profileSet();
  const upstreamBinding = upstream(profiles);
  const catalog = catalogAndIdentity({
    upstream: upstreamBinding,
    failedCatalogSource: input.failedCatalogSource,
  });
  const baseBatch = listingBatch({ profiles, upstream: upstreamBinding });
  return {
    upstream: upstreamBinding,
    registry: M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
    catalog: catalog.catalog,
    identity: catalog.identity,
    batch: input.batchTransform?.(baseBatch) ?? baseBatch,
  };
}

function buildScenario(value = scenario()) {
  return buildM2ListingVenueEventEvidenceJoin({
    upstreamBinding: value.upstream,
    registry: value.registry,
    catalogCaptureBinding: value.catalog,
    currentIdentity: value.identity,
    previousIdentity: null,
    listingRefreshBatch: value.batch,
    generatedAt: GENERATED_AT,
  });
}

function blockSource(
  batch: M1ListingWatchRefreshBatch,
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
  keepPages: boolean,
): M1ListingWatchRefreshBatch {
  const results = batch.results.map((result) => {
    if (result.sourceId !== sourceId) {
      return result;
    }
    return {
      ...result,
      status: "BLOCKED" as const,
      pages: keepPages ? result.pages : [],
      advance: null,
      checkpoint: null,
      binding: null,
      reasonCodes: ["fixture_listing_refresh_blocked"],
    };
  });
  return batchFromResults(results);
}

test("joins exact catalog, checkpoint and capability evidence without granting authority", () => {
  const value = scenario();
  const result = buildScenario(value);

  assert.equal(result.refreshEvidence.allCommitted, true);
  assert.equal(
    result.refreshEvidence.sourceRefreshBatchHash,
    stableContentHash(value.batch),
  );
  assert.equal(result.evidenceJoin.completeCatalogSourceCount, 4);
  assert.equal(
    result.evidenceJoin.completeOrQualifiedAnnouncementSourceCount,
    4,
  );
  assert.equal(
    result.evidenceJoin.status,
    "TEST_ONLY_UPSTREAM_EVIDENCE_JOIN_NO_RUNTIME_AUTHORITY",
  );
  assert.equal(result.lifecycleLedger.eventCount, 6);
  assert.equal(result.researchBundle.researchEventCount, 6);
  assert.equal(
    result.researchBundle.researchReadiness,
    "TEST_ONLY_NO_REAL_RESEARCH_READINESS",
  );
  assert.deepEqual(
    result.evidenceJoin.sourceCoverage.map((item) => [
      item.sourceId,
      item.catalogCoverage,
      item.announcementCoverage,
    ]),
    [
      [
        "BINANCE_FUTURES",
        "COMPLETE",
        "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
      ],
      [
        "OKX_SWAP",
        "COMPLETE",
        "NOT_SUPPORTED_BY_QUALIFIED_CAPABILITY",
      ],
      ["BYBIT_DERIVATIVES", "COMPLETE", "COMPLETE_PROVIDER_SCOPE"],
      ["BITGET_FUTURES", "COMPLETE", "COMPLETE_PROVIDER_SCOPE"],
    ],
  );
  assert.equal(result.evidenceJoin.candidateEmissionAllowed, false);
  assert.equal(result.evidenceJoin.directionAuthorityAllowed, false);
  assert.equal(result.evidenceJoin.probabilityAuthorityAllowed, false);
  assert.equal(result.evidenceJoin.signalGradeAllowed, false);
  assert.equal(result.evidenceJoin.strategyAuthorityAllowed, false);
  assert.equal(result.evidenceJoin.readyAuthorityAllowed, false);
  assert.equal(result.evidenceJoin.productionRuntimeAllowed, false);
  assert.equal(result.evidenceJoin.productionChanged, false);
  assert.equal(Object.isFrozen(result.evidenceJoin), true);
});

test("binds persisted runtime evidence to the independently verified M1.5C source set", () => {
  const value = scenario();
  const result = buildScenario(value);
  const sourceAudit = {
    m15cStoreVerificationId: "m1-5c-store-verification:fixture",
    m15cStoreVerificationHash: stableContentHash({ fixture: "verification" }),
    m15cEvidenceId: "m1-5c-evidence:fixture",
    m15cEvidenceHash: stableContentHash({ fixture: "evidence" }),
    workerRunId: "m1-5c-worker:fixture",
    currentCycleIndex: 31 as const,
    previousCycleIndex: 30 as const,
    sourceListingRefreshBatchHash: stableContentHash(value.batch),
    catalogCaptureBindingId: value.catalog.captureBindingId,
    catalogCaptureBindingHash: value.catalog.contentHash,
    currentIdentitySnapshotId: value.identity.snapshotId,
    currentIdentitySnapshotHash: value.identity.contentHash,
    previousIdentitySnapshotId: null,
    previousIdentitySnapshotHash: null,
  };
  const runtimeEvidence = buildM2ListingVenueEventRuntimeEvidence({
    sourceAudit,
    result,
  });
  const verified = verifyM2ListingVenueEventRuntimeEvidenceSet({
    sourceAudit,
    result,
    runtimeEvidence,
  });

  assert.equal(verified.contentHash, runtimeEvidence.contentHash);
  assert.equal(verified.candidateEmissionAllowed, false);
  assert.equal(verified.readyAuthorityAllowed, false);
  assert.equal(verified.productionRuntimeAllowed, false);

  assert.throws(
    () =>
      buildM2ListingVenueEventRuntimeEvidence({
        sourceAudit: {
          ...sourceAudit,
          sourceListingRefreshBatchHash: stableContentHash({ drift: true }),
        },
        result,
      }),
    /artifacts do not reconcile/u,
  );

  assert.throws(
    () =>
      verifyM2ListingVenueEventRuntimeEvidenceSet({
        sourceAudit: {
          ...sourceAudit,
          sourceListingRefreshBatchHash: stableContentHash({ drift: true }),
        },
        result,
        runtimeEvidence,
      }),
    /artifacts do not reconcile/u,
  );
});

test("is deterministic when caller-owned batch arrays arrive in a different order", () => {
  const value = scenario();
  const first = buildScenario(value);
  const second = buildScenario({
    ...value,
    batch: {
      ...value.batch,
      results: [...value.batch.results].reverse(),
      bindings: [...value.batch.bindings].reverse(),
      checkpoints: [...value.batch.checkpoints].reverse(),
    },
  });

  assert.equal(
    first.refreshEvidence.contentHash,
    second.refreshEvidence.contentHash,
  );
  assert.equal(first.lifecycleLedger.contentHash, second.lifecycleLedger.contentHash);
  assert.equal(first.researchBundle.contentHash, second.researchBundle.contentHash);
  assert.equal(first.evidenceJoin.contentHash, second.evidenceJoin.contentHash);
});

test("seals a partial announcement source instead of dropping the whole denominator", () => {
  const result = buildScenario(scenario({
    batchTransform: (batch) => blockSource(batch, "BYBIT_DERIVATIVES", true),
  }));
  const bybit = result.evidenceJoin.sourceCoverage.find(
    (item) => item.sourceId === "BYBIT_DERIVATIVES",
  )!;

  assert.equal(bybit.announcementCoverage, "PARTIAL");
  assert.ok(bybit.reasonCodes.includes("listing_watch_refresh_blocked"));
  assert.equal(result.refreshEvidence.blockedSourceCount, 1);
  assert.equal(result.lifecycleLedger.announcementCount, 1);
  assert.equal(
    result.lifecycleLedger.events.some(
      (event) =>
        event.sourceId === "BYBIT_DERIVATIVES" &&
        event.eventSource === "ANNOUNCEMENT",
    ),
    false,
  );
});

test("seals an unavailable announcement source when no page artifact exists", () => {
  const result = buildScenario(scenario({
    batchTransform: (batch) => blockSource(batch, "BITGET_FUTURES", false),
  }));
  const bitget = result.evidenceJoin.sourceCoverage.find(
    (item) => item.sourceId === "BITGET_FUTURES",
  )!;

  assert.equal(bitget.announcementCoverage, "UNAVAILABLE");
  assert.equal(result.refreshEvidence.results.length, 2);
  assert.equal(result.refreshEvidence.allCommitted, false);
});

test("derives catalog unavailability from exact capture facts", () => {
  const result = buildScenario(scenario({
    failedCatalogSource: "OKX_SWAP",
  }));
  const okx = result.evidenceJoin.sourceCoverage.find(
    (item) => item.sourceId === "OKX_SWAP",
  )!;

  assert.equal(okx.catalogCoverage, "UNAVAILABLE");
  assert.equal(result.evidenceJoin.completeCatalogSourceCount, 3);
  assert.equal(
    result.lifecycleLedger.completeCatalogSources.includes("OKX_SWAP"),
    false,
  );
});

test("rejects a batch that hides either listing source result", () => {
  const value = scenario();
  const oneResult = batchFromResults([value.batch.results[0]!]);

  assert.throws(
    () => buildScenario({ ...value, batch: oneResult }),
    /preserve both source results/u,
  );
});

test("rejects batch accounting written independently of result evidence", () => {
  const value = scenario();
  const tampered = {
    ...value.batch,
    requestCount: value.batch.requestCount + 1,
  };

  assert.throws(
    () => buildScenario({ ...value, batch: tampered }),
    /denominator or boundary drifted/u,
  );
});

test("rejects checkpoint and binding cross-source substitution", () => {
  const value = scenario();
  const bitget = value.batch.results.find(
    (result) => result.sourceId === "BITGET_FUTURES",
  )!;
  const bybit = value.batch.results.find(
    (result) => result.sourceId === "BYBIT_DERIVATIVES",
  )!;
  const tamperedResults = value.batch.results.map((result) =>
    result.sourceId === "BITGET_FUTURES"
      ? { ...bitget, binding: bybit.binding }
      : result
  );
  const tampered = batchFromResults(tamperedResults);

  assert.throws(
    () => buildScenario({ ...value, batch: tampered }),
    /checkpoint binding is not exact/u,
  );
});

test("rejects catalog content that is not bound to the exact upstream release", () => {
  const value = scenario();
  const tampered = structuredClone(value.catalog);
  tampered.upstreamBindingHash = `sha256:${"0".repeat(64)}`;

  assert.throws(
    () =>
      buildM2ListingVenueEventEvidenceJoin({
        upstreamBinding: value.upstream,
        registry: value.registry,
        catalogCaptureBinding: tampered,
        currentIdentity: value.identity,
        previousIdentity: null,
        listingRefreshBatch: value.batch,
        generatedAt: GENERATED_AT,
      }),
    /catalog capture binding identity or status disagrees|content hash mismatch/u,
  );
});

test("rejects a hand-edited capability registry absence claim", () => {
  const value = scenario();
  const registry = structuredClone(value.registry);
  const row = registry.rows.find(
    (candidate) =>
      candidate.sourceId === "BINANCE_FUTURES" &&
      candidate.capabilityId === "LISTING_ANNOUNCEMENT",
  )!;
  row.reasonCodes = ["caller_relabelled_provider_capability"];

  assert.throws(
    () => buildScenario({ ...value, registry }),
    /registry_digest_mismatch|Invalid input/u,
  );
});

test("rejects evidence generation before the newest upstream fact", () => {
  const value = scenario();

  assert.throws(
    () =>
      buildM2ListingVenueEventEvidenceJoin({
        upstreamBinding: value.upstream,
        registry: value.registry,
        catalogCaptureBinding: value.catalog,
        currentIdentity: value.identity,
        previousIdentity: null,
        listingRefreshBatch: value.batch,
        generatedAt: "2026-07-24T02:10:00.000Z",
      }),
    /generated before source cutoff/u,
  );
});

test("refresh evidence rejects future generation and preserves no-authority flags", () => {
  const value = scenario();
  assert.throws(
    () =>
      buildM2ListingWatchRefreshEvidence({
        upstreamBinding: value.upstream,
        refreshBatch: value.batch,
        generatedAt: "2026-07-24T02:10:00.000Z",
      }),
    /generated before source cutoff/u,
  );

  const evidence = buildM2ListingWatchRefreshEvidence({
    upstreamBinding: value.upstream,
    refreshBatch: value.batch,
    generatedAt: GENERATED_AT,
  });
  assert.equal(evidence.authorityGranted, false);
  assert.equal(evidence.productionChanged, false);
  assert.equal(evidence.secretMaterialPresent, false);
  assert.equal(evidence.rawBodyRetained, false);
});

test("schema rejects rehashed denominator inflation", () => {
  const result = buildScenario();
  const tampered = structuredClone(result.evidenceJoin);
  tampered.completeCatalogSourceCount = 3;
  const core = omitArtifactFields(tampered, ["evidenceJoinId", "contentHash"]);
  tampered.contentHash = stableContentHash(core);
  tampered.evidenceJoinId =
    `listing-event-evidence-join:${tampered.contentHash.slice(7, 31)}`;

  assert.equal(
    M2ListingVenueEventEvidenceJoinSchema.safeParse(tampered).success,
    false,
  );
});

test("schema rejects rehashed authority escalation", () => {
  const result = buildScenario();
  const tampered = structuredClone(result.evidenceJoin) as unknown as Record<
    string,
    unknown
  >;
  tampered.candidateEmissionAllowed = true;
  const core = omitArtifactFields(tampered, ["evidenceJoinId", "contentHash"]);
  tampered.contentHash = stableContentHash(core);
  tampered.evidenceJoinId =
    `listing-event-evidence-join:${
      String(tampered.contentHash).slice(7, 31)
    }`;

  assert.equal(
    M2ListingVenueEventEvidenceJoinSchema.safeParse(tampered).success,
    false,
  );
});
