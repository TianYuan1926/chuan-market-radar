import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1SourceConformanceArtifactSchema,
  M1SourceConformanceProbeObservationSchema,
  buildM1SourceConformanceArtifact,
  type M1SourceConformanceArtifact,
  type M1SourceConformanceProbeId,
} from "../source-conformance/source-conformance-contract";
import {
  M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS,
  M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
} from "../source-conformance/adapters/exact-source-conformance-runner";
import {
  buildM1AdaptiveCollectorPlan,
  buildM1CollectorCapabilityGrant,
  type M1AdaptiveCollectorPolicy,
  type M1CollectorCapabilityGrant,
  type M1CollectorQuotaState,
  type M1CollectorSubject,
} from "./adaptive-collector-contract";
import {
  M1RuntimeAdapterBatchPlanSchema,
  M1RuntimeAdapterProfileSetSchema,
  buildM1RuntimeAdapterBatchPlan,
  buildM1RuntimeAdapterProfileSet,
  type M1RuntimeAdapterBatchPolicy,
} from "./runtime-adapter-profile";

const CONFORMANCE_RELEASE = "a".repeat(40);
const RUNTIME_RELEASE = "b".repeat(40);
const GENERATED_AT = "2026-07-24T02:00:00.000Z";
const SOURCE_CUTOFF = "2026-07-24T01:59:59.000Z";
const RIGHTS_REVIEWED_AT = "2026-07-24T00:00:00.000Z";
const RIGHTS_EXPIRES_AT = "2026-10-24T00:00:00.000Z";
const GRANT_EXPIRES_AT = "2026-07-24T03:00:00.000Z";
const RIGHTS_HASH = `sha256:${"e".repeat(64)}`;
const IDENTITY_HASH = `sha256:${"f".repeat(64)}`;

function digest(index: number): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}

function conformanceArtifact(input: {
  evidenceClass?: "LIVE_READ_ONLY" | "TEST_ONLY";
  failedProbeId?: M1SourceConformanceProbeId;
} = {}): M1SourceConformanceArtifact {
  const evidenceClass = input.evidenceClass ?? "LIVE_READ_ONLY";
  const probes = M1_EXACT_SOURCE_ENDPOINT_DEFINITIONS.map(
    (definition, index) => {
      const failed = definition.probeId === input.failedProbeId;
      return M1SourceConformanceProbeObservationSchema.parse({
        probeId: definition.probeId,
        sourceId: definition.sourceId,
        capabilityId: definition.capabilityId,
        gate: definition.gate,
        definitionDigest: definition.definitionDigest,
        evidenceClass,
        outcome: failed ? "FAIL" : "PASS",
        attemptStartedAt: "2026-07-24T01:59:58.000Z",
        receivedAt: SOURCE_CUTOFF,
        latencyMs: 1_000,
        httpStatus: 200,
        responseBodyDigest: digest(index + 1),
        responseBytes: 1_000 + index,
        topLevelKeys: ["data"],
        recordKeys: ["id"],
        observedRecordCount: 1,
        providerServerTime: null,
        absoluteClockSkewMs: null,
        paginationStatus: failed
          ? "INCOMPLETE"
          : definition.paginationExpectation === "BOUNDED_HEAD_WINDOW"
            ? "BOUNDED_COMPLETE"
            : definition.paginationExpectation === "MUST_TERMINATE"
              ? "COMPLETE"
              : "NOT_APPLICABLE",
        credentialDisposition: definition.requiresReadOnlyApiKey
          ? "READ_ONLY_KEY_USED_NOT_RETAINED"
          : "PUBLIC_NO_CREDENTIAL",
        failure: failed ? "SCHEMA_DRIFT_UNAVAILABLE" : null,
        reasonCodes: failed ? ["schema_drift_unavailable"] : [],
        rawBodyRetained: false,
        secretMaterialPresent: false,
      });
    },
  );
  return buildM1SourceConformanceArtifact({
    releaseId: CONFORMANCE_RELEASE,
    generatedAt: SOURCE_CUTOFF,
    sourceCutoff: SOURCE_CUTOFF,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    probePlanDigest: M1_EXACT_SOURCE_PROBE_PLAN_DIGEST,
    evidenceClass,
    networkEnvironment: evidenceClass === "LIVE_READ_ONLY"
      ? "TENCENT_ISOLATED_READ_ONLY"
      : "TEST_HARNESS",
    probes,
  });
}

function profileSet(
  artifact = conformanceArtifact(),
) {
  return buildM1RuntimeAdapterProfileSet({
    runtimeReleaseId: RUNTIME_RELEASE,
    generatedAt: GENERATED_AT,
    conformanceArtifact: artifact,
  });
}

function policy(): M1AdaptiveCollectorPolicy {
  return {
    policyVersion: "v2-m1-adaptive-collector-policy.v1",
    maxIntentRows: 100_000,
    maxReadyIntents: 10_000,
    baselineReservedSlots: 8_000,
    maxReadyIntentsPerSource: 4_000,
    maxBurstIntentsPerSubject: 100,
    maxConsecutiveFailures: 5,
    baseRetryBackoffMs: 1_000,
    maxRetryBackoffMs: 60_000,
    cadencesMs: {
      T0_CATALOG_EVENT: 300_000,
      T1_WIDE_MARKET: 5_000,
      T2_CANDIDATE_BURST: 1_000,
      T3_DEEP_VALIDATION: 15_000,
    },
    fairnessCursorSource: "BINANCE_FUTURES",
    fullT0T1AccountingRequired: true,
    t2MatchedControlRequired: true,
    dropDeferredIntentsAllowed: false,
    unboundedRetentionAllowed: false,
    automaticFactAuthorityAllowed: false,
    automaticCandidateAuthorityAllowed: false,
    automaticStrategyAuthorityAllowed: false,
  };
}

function batchPolicy(): M1RuntimeAdapterBatchPolicy {
  return {
    policyVersion: "v2-m1-runtime-adapter-batch-policy.v1",
    maxBatchCount: 100,
    maxCoveredIntentsPerBatch: 10_000,
    maxListingHistoryPagesPerSegment: 64,
    maxTotalRequestTokens: 1_000,
    crossSourceConcurrency: 5,
    perSourceConcurrency: 1,
    fullReadyIntentAccountingRequired: true,
    failedCapabilityBatchAllowed: false,
    staleFallbackAllowed: false,
    automaticRuntimeExecutionAllowed: false,
    automaticFactAuthorityAllowed: false,
  };
}

function subject(input: {
  index: number;
  sourceId:
    | "BINANCE_FUTURES"
    | "OKX_SWAP"
    | "BYBIT_DERIVATIVES"
    | "BITGET_FUTURES";
  assetDomain?: M1CollectorSubject["assetDomain"];
}): M1CollectorSubject {
  const token = `ASSET${input.index}`;
  return {
    subjectId: `${input.sourceId.toLowerCase()}-${token.toLowerCase()}`,
    sourceId: input.sourceId,
    assetDomain: input.assetDomain ?? "CRYPTO_LINEAR_PERPETUAL",
    coverageClass: "SUPPORTED_DERIVATIVE",
    canonicalInstrumentId: `scope-v2:${input.sourceId}:${token}`,
    venueInstrumentId: `${token}USDT`,
    listingEpoch: `listing:${input.sourceId}:${token}`,
    identityEpoch: `identity:${input.sourceId}:${token}`,
    identityStatus: "EXACT",
    lifecycleState: "ESTABLISHED",
    eligibilityStatus: "ELIGIBLE",
    candidatePriority: "NONE",
    candidateEpisodeId: null,
    matchedControlForEpisodeId: null,
    deepValidationEpisodeId: null,
    observedAt: SOURCE_CUTOFF,
    reasonCodes: [],
  };
}

function listingWatchSubject(
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
): M1CollectorSubject {
  return {
    subjectId: `${sourceId.toLowerCase()}-listing-watch`,
    sourceId,
    assetDomain: "ASSET_LISTING_WATCH",
    coverageClass: "ASSET_LISTING_WATCH",
    canonicalInstrumentId: null,
    venueInstrumentId: "PROVIDER_LISTING_FEED",
    listingEpoch: `listing:${sourceId}:watch`,
    identityEpoch: `identity:${sourceId}:watch`,
    identityStatus: "UNRESOLVED",
    lifecycleState: "UNRESOLVED",
    eligibilityStatus: "NOT_EVALUATED",
    candidatePriority: "NONE",
    candidateEpisodeId: null,
    matchedControlForEpisodeId: null,
    deepValidationEpisodeId: null,
    observedAt: SOURCE_CUTOFF,
    reasonCodes: ["listing_watch_not_a_tradable_derivative"],
  };
}

function registryAssetDomains(
  sourceId: M1CollectorCapabilityGrant["sourceId"],
  capabilityId: M1CollectorCapabilityGrant["capabilityId"],
) {
  const row = M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.rows.find(
    (candidate) =>
      candidate.sourceId === sourceId &&
      candidate.capabilityId === capabilityId,
  );
  assert.ok(row);
  return row.assetDomains;
}

function liveGrant(
  sourceId: M1CollectorCapabilityGrant["sourceId"],
  capabilityId: M1CollectorCapabilityGrant["capabilityId"],
): M1CollectorCapabilityGrant {
  return buildM1CollectorCapabilityGrant({
    releaseId: RUNTIME_RELEASE,
    sourceId,
    capabilityId,
    assetDomains: registryAssetDomains(sourceId, capabilityId),
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    conformanceStatus: "PASS",
    rightsStatus: sourceId === "COINGLASS_V4"
      ? "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED"
      : "PUBLIC_PERSONAL_ANALYTICS_ALLOWED",
    rightsReviewerClass: "HUMAN_EXTERNAL_REVIEW",
    rightsReviewedAt: RIGHTS_REVIEWED_AT,
    rightsExpiresAt: RIGHTS_EXPIRES_AT,
    rightsEvidenceHash: RIGHTS_HASH,
    entitlementStatus: sourceId === "COINGLASS_V4"
      ? "HOBBYIST_CONFIRMED"
      : "PUBLIC_NO_KEY",
    jurisdictionAvailability: "AVAILABLE",
    observedAt: SOURCE_CUTOFF,
    expiresAt: GRANT_EXPIRES_AT,
    evidenceIds: [`live:${sourceId}:${capabilityId}`],
    conformanceArtifactHash: conformanceArtifact().contentHash,
    adapterVersion: "m1.4b-runtime-profile.v1",
  });
}

function quota(
  sourceId: M1CollectorQuotaState["sourceId"],
  capabilityId: M1CollectorQuotaState["capabilityId"],
): M1CollectorQuotaState {
  return {
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RUNTIME_RELEASE,
    sourceId,
    capabilityId,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    status: "READY",
    windowStartedAt: "2026-07-24T01:59:00.000Z",
    windowEndsAt: "2026-07-24T02:01:00.000Z",
    requestLimit: 10_000,
    requestsUsed: 0,
    requestsReserved: 0,
    observedAt: SOURCE_CUTOFF,
    retryAfter: null,
    evidenceIds: [`quota:${sourceId}:${capabilityId}`],
  };
}

function catalogAdaptivePlan(input: {
  includeEquity?: boolean;
} = {}) {
  const venues = [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ] as const;
  const subjects = Array.from({ length: 400 }, (_, index) =>
    subject({
      index,
      sourceId: venues[index % venues.length]!,
      assetDomain: input.includeEquity && index === 399
        ? "EQUITY_SINGLE_NAME_PERPETUAL"
        : "CRYPTO_LINEAR_PERPETUAL",
    })
  );
  const grants = venues.map((sourceId) =>
    liveGrant(sourceId, "DERIVATIVE_INSTRUMENT_CATALOG")
  );
  const quotas = venues.map((sourceId) =>
    quota(sourceId, "DERIVATIVE_INSTRUMENT_CATALOG")
  );
  return buildM1AdaptiveCollectorPlan({
    releaseId: RUNTIME_RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    identitySnapshotHash: IDENTITY_HASH,
    subjects,
    capabilityGrants: grants,
    quotaStates: quotas,
    checkpoints: [],
    policy: policy(),
  });
}

function listingAdaptivePlan(
  sourceId: "BYBIT_DERIVATIVES" | "BITGET_FUTURES",
) {
  const capabilityIds = [
    "SPOT_INSTRUMENT_CATALOG",
    "LISTING_ANNOUNCEMENT",
  ] as const;
  return buildM1AdaptiveCollectorPlan({
    releaseId: RUNTIME_RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    identitySnapshotHash: IDENTITY_HASH,
    subjects: [listingWatchSubject(sourceId)],
    capabilityGrants: capabilityIds.map((capabilityId) =>
      liveGrant(sourceId, capabilityId)
    ),
    quotaStates: capabilityIds.map((capabilityId) =>
      quota(sourceId, capabilityId)
    ),
    checkpoints: [],
    policy: policy(),
  });
}

test("builds fifteen exact REST profiles only from live-passed conformance", () => {
  const profiles = profileSet();

  assert.equal(
    profiles.status,
    "COMPLETE_15_OF_15_LIVE_CONFORMANCE_PASS",
  );
  assert.equal(profiles.profileCount, 15);
  assert.equal(
    profiles.schedulerRouteStatus,
    "PARTIAL_LIVE_PROFILES_ROUTE_ELIGIBLE",
  );
  assert.equal(profiles.schedulerRouteEligibleProfileCount, 14);
  assert.equal(profiles.registryBlockedProfileCount, 1);
  assert.deepEqual(
    profiles.registryBlockedProbeIds,
    ["BINANCE_SPOT_CATALOG"],
  );
  assert.equal(profiles.restProfileCount, 15);
  assert.equal(profiles.webSocketProfileCount, 0);
  assert.deepEqual(profiles.missingProbeIds, []);
  assert.equal(profiles.bitgetVenueProfileCount, 4);
  assert.equal(profiles.listingLifecycleProfileCount, 6);
  assert.equal(profiles.equityCatalogProfileCount, 4);
  assert.equal(profiles.runtimeExecutionAllowed, false);
  assert.equal(profiles.factAuthorityGranted, false);
  assert.equal(profiles.candidateAuthorityGranted, false);
  assert.equal(profiles.readyAuthorityGranted, false);
  assert.equal(Object.isFrozen(profiles), true);

  const binanceSpot = profiles.profiles.find((profile) =>
    profile.probeId === "BINANCE_SPOT_CATALOG"
  );
  assert.ok(binanceSpot);
  assert.equal(binanceSpot.liveConformancePassed, true);
  assert.equal(binanceSpot.registryDisposition, "UNAVAILABLE");
  assert.equal(binanceSpot.schedulerRouteEligible, false);
  assert.equal(binanceSpot.noAuthorityShadowEligible, false);

  const bybitHistory = profiles.profiles.find(
    (profile) => profile.probeId === "BYBIT_LISTING_ANNOUNCEMENT",
  );
  assert.ok(bybitHistory);
  assert.equal(
    bybitHistory.historyResponsibility,
    "BYBIT_PROVIDER_AVAILABLE_HISTORY_CHECKPOINTED",
  );
  assert.equal(bybitHistory.conformancePaginationScope, "BOUNDED_HEAD_WINDOW");
  assert.equal(bybitHistory.maxRequestsPerSegment, 64);
});

test("test-only source evidence creates zero runtime profiles", () => {
  const profiles = profileSet(conformanceArtifact({
    evidenceClass: "TEST_ONLY",
  }));

  assert.equal(profiles.status, "TEST_ONLY_NO_RUNTIME_PROFILES");
  assert.equal(profiles.profileCount, 0);
  assert.equal(profiles.missingProbeIds.length, 15);
  assert.equal(profiles.runtimeExecutionAllowed, false);
});

test("failed live capability remains absent instead of borrowing another PASS", () => {
  const profiles = profileSet(conformanceArtifact({
    failedProbeId: "BITGET_DERIVATIVE_CATALOG",
  }));

  assert.equal(
    profiles.status,
    "PARTIAL_LIVE_CONFORMANCE_PASS_FAILED_CAPABILITIES_ABSENT",
  );
  assert.equal(profiles.profileCount, 14);
  assert.deepEqual(
    profiles.missingProbeIds,
    ["BITGET_DERIVATIVE_CATALOG"],
  );
  assert.equal(
    profiles.profiles.some((profile) =>
      profile.probeId === "BITGET_DERIVATIVE_CATALOG"
    ),
    false,
  );
});

test("current endpoint semantics must match the conformance probe plan", () => {
  const artifact = structuredClone(conformanceArtifact());
  artifact.probePlanDigest = `sha256:${"0".repeat(64)}`;
  assert.throws(
    () => buildM1RuntimeAdapterProfileSet({
      runtimeReleaseId: RUNTIME_RELEASE,
      generatedAt: GENERATED_AT,
      conformanceArtifact: artifact,
    }),
    /content hash mismatch|probe plan/u,
  );
});

test("batches four hundred source-wide catalog intents into four endpoint batches", () => {
  const adaptivePlan = catalogAdaptivePlan();
  const plan = buildM1RuntimeAdapterBatchPlan({
    generatedAt: GENERATED_AT,
    adaptivePlan,
    profileSet: profileSet(),
    policy: batchPolicy(),
  });

  assert.equal(plan.readyIntentCount, 400);
  assert.equal(plan.batchedReadyIntentCount, 400);
  assert.equal(plan.batchCount, 4);
  assert.equal(plan.maximumHttpRequests, 67);
  assert.equal(plan.maximumRequestTokens, 67);
  assert.equal(plan.snapshotReadyIntentCount, 400);
  assert.equal(plan.snapshotPerIntentTokenUpperBound, 400);
  assert.equal(plan.snapshotRequestTokens, 67);
  assert.equal(plan.snapshotRequestTokenSavings, 333);
  assert.equal(plan.listingHistoryRequestTokens, 0);
  assert.equal(plan.readyIntentAccountingStatus, "COMPLETE_EXACTLY_ONCE");
  assert.equal(plan.acceptanceIntentDenominators.bitgetVenue, 100);
  assert.equal(plan.runtimeExecutionAllowed, false);
  assert.equal(plan.factAuthorityGranted, false);
  assert.equal(plan.webSocketRuntimeProfileCount, 0);
  assert.equal(Object.isFrozen(plan), true);
});

test("Bitget remains an independent venue acceptance axis", () => {
  const plan = buildM1RuntimeAdapterBatchPlan({
    generatedAt: GENERATED_AT,
    adaptivePlan: catalogAdaptivePlan(),
    profileSet: profileSet(),
    policy: batchPolicy(),
  });
  const bitgetBatch = plan.batches.find((batch) =>
    batch.sourceId === "BITGET_FUTURES"
  );

  assert.ok(bitgetBatch);
  assert.equal(bitgetBatch.acceptanceAxes.bitgetVenue, true);
  assert.equal(bitgetBatch.acceptanceAxes.listingLifecycle, false);
  assert.equal(bitgetBatch.acceptanceAxes.equityAssetDomain, false);
  assert.equal(plan.acceptanceBatchCounts.bitgetVenue, 1);
  assert.equal(plan.acceptanceAccounting,
    "INDEPENDENT_OVERLAPPING_AXES_NO_CROSS_PASS");
});

test("listing history keeps a checkpointed budget separate from snapshot savings", () => {
  const plan = buildM1RuntimeAdapterBatchPlan({
    generatedAt: GENERATED_AT,
    adaptivePlan: listingAdaptivePlan("BYBIT_DERIVATIVES"),
    profileSet: profileSet(),
    policy: batchPolicy(),
  });
  const historyBatch = plan.batches.find((batch) =>
    batch.operation === "LISTING_HISTORY_SEGMENT"
  );

  assert.ok(historyBatch);
  assert.equal(plan.readyIntentCount, 2);
  assert.equal(plan.snapshotReadyIntentCount, 1);
  assert.equal(plan.snapshotPerIntentTokenUpperBound, 1);
  assert.equal(plan.snapshotRequestTokens, 1);
  assert.equal(plan.snapshotRequestTokenSavings, 0);
  assert.equal(plan.listingHistoryRequestTokens, 64);
  assert.equal(plan.maximumRequestTokens, 65);
  assert.equal(
    historyBatch.requestBudgetClass,
    "LISTING_HISTORY_CHECKPOINTED",
  );
  assert.equal(plan.acceptanceIntentDenominators.listingLifecycle, 2);
  assert.equal(plan.listingCandidateEmissionAllowed, false);
  assert.equal(plan.candidateAuthorityGranted, false);
});

test("equity contracts enter catalog accounting but never tradable fact authority", () => {
  const plan = buildM1RuntimeAdapterBatchPlan({
    generatedAt: GENERATED_AT,
    adaptivePlan: catalogAdaptivePlan({ includeEquity: true }),
    profileSet: profileSet(),
    policy: batchPolicy(),
  });

  assert.equal(plan.acceptanceIntentDenominators.equityAssetDomain, 1);
  assert.equal(plan.equityTradableFactBatchCount, 0);
  assert.equal(
    plan.batches.some((batch) =>
      batch.acceptanceAxes.equityAssetDomain &&
      batch.equityUsageBoundary ===
        "CATALOG_ACCOUNTING_ONLY_SESSION_CORPORATE_ACTION_FX_BASIS_BLOCKED"
    ),
    true,
  );
});

test("a ready intent cannot use a profile whose exact capability failed live", () => {
  const profiles = profileSet(conformanceArtifact({
    failedProbeId: "BITGET_DERIVATIVE_CATALOG",
  }));

  assert.throws(
    () => buildM1RuntimeAdapterBatchPlan({
      generatedAt: GENERATED_AT,
      adaptivePlan: catalogAdaptivePlan(),
      profileSet: profiles,
      policy: batchPolicy(),
    }),
    /no live-passed route-eligible runtime profile/u,
  );
});

test("batch plan rejects content and denominator tampering", () => {
  const plan = buildM1RuntimeAdapterBatchPlan({
    generatedAt: GENERATED_AT,
    adaptivePlan: catalogAdaptivePlan(),
    profileSet: profileSet(),
    policy: batchPolicy(),
  });
  const tampered = structuredClone(plan);
  tampered.readyIntentCount -= 1;

  assert.equal(M1RuntimeAdapterBatchPlanSchema.safeParse(tampered).success, false);

  const profileTamper = structuredClone(profileSet());
  profileTamper.profiles[0]!.runtimeExecutionAllowed =
    true as unknown as false;
  assert.equal(
    M1RuntimeAdapterProfileSetSchema.safeParse(profileTamper).success,
    false,
  );
});

test("source conformance artifacts remain independently schema-valid", () => {
  assert.equal(
    M1SourceConformanceArtifactSchema.safeParse(conformanceArtifact()).success,
    true,
  );
});
