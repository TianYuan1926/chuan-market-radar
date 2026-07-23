import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY,
} from "../source-capability/adapters/four-venue-capability-registry";
import {
  M1AdaptiveCollectorPlanSchema,
  buildM1AdaptiveCollectorPlan,
  buildM1CollectorCapabilityGrant,
  type M1AdaptiveCollectorPlanInput,
  type M1AdaptiveCollectorPolicy,
  type M1CollectorCapabilityGrant,
  type M1CollectorCheckpoint,
  type M1CollectorQuotaState,
  type M1CollectorSubject,
} from "./adaptive-collector-contract";

const RELEASE = "a".repeat(40);
const GENERATED_AT = "2026-07-23T12:00:00.000Z";
const SOURCE_CUTOFF = "2026-07-23T11:59:59.000Z";
const EXPIRES_AT = "2026-07-23T13:00:00.000Z";
const RIGHTS_REVIEWED_AT = "2026-07-23T11:00:00.000Z";
const RIGHTS_EXPIRES_AT = "2026-10-23T11:00:00.000Z";
const IDENTITY_HASH = `sha256:${"b".repeat(64)}`;
const CONFORMANCE_HASH = `sha256:${"c".repeat(64)}`;
const RIGHTS_HASH = `sha256:${"e".repeat(64)}`;

function policy(
  overrides: Partial<M1AdaptiveCollectorPolicy> = {},
): M1AdaptiveCollectorPolicy {
  return {
    policyVersion: "v2-m1-adaptive-collector-policy.v1",
    maxIntentRows: 20_000,
    maxReadyIntents: 2_000,
    baselineReservedSlots: 1_000,
    maxReadyIntentsPerSource: 1_000,
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
    ...overrides,
  };
}

function subject(
  overrides: Partial<M1CollectorSubject> = {},
): M1CollectorSubject {
  return {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    assetDomain: "CRYPTO_LINEAR_PERPETUAL",
    coverageClass: "SUPPORTED_DERIVATIVE",
    canonicalInstrumentId: "scope-v2:binance:btcusdt",
    venueInstrumentId: "BTCUSDT",
    listingEpoch: "listing:btc",
    identityEpoch: "identity:btc",
    identityStatus: "EXACT",
    lifecycleState: "ESTABLISHED",
    eligibilityStatus: "ELIGIBLE",
    candidatePriority: "NONE",
    candidateEpisodeId: null,
    matchedControlForEpisodeId: null,
    deepValidationEpisodeId: null,
    observedAt: SOURCE_CUTOFF,
    reasonCodes: [],
    ...overrides,
  };
}

function liveGrant(
  sourceId: M1CollectorCapabilityGrant["sourceId"],
  capabilityId: M1CollectorCapabilityGrant["capabilityId"],
  assetDomains: M1CollectorCapabilityGrant["assetDomains"] = [
    "CRYPTO_LINEAR_PERPETUAL",
  ],
  overrides: Partial<Parameters<
    typeof buildM1CollectorCapabilityGrant
  >[0]> = {},
): M1CollectorCapabilityGrant {
  const coinGlass = sourceId === "COINGLASS_V4";
  return buildM1CollectorCapabilityGrant({
    releaseId: RELEASE,
    sourceId,
    capabilityId,
    assetDomains,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    conformanceStatus: "PASS",
    rightsStatus: coinGlass
      ? "HOBBYIST_PERSONAL_ANALYTICS_ALLOWED"
      : "PUBLIC_PERSONAL_ANALYTICS_ALLOWED",
    rightsReviewerClass: "HUMAN_EXTERNAL_REVIEW",
    rightsReviewedAt: RIGHTS_REVIEWED_AT,
    rightsExpiresAt: RIGHTS_EXPIRES_AT,
    rightsEvidenceHash: RIGHTS_HASH,
    entitlementStatus: coinGlass
      ? "HOBBYIST_CONFIRMED"
      : "PUBLIC_NO_KEY",
    jurisdictionAvailability: "AVAILABLE",
    observedAt: SOURCE_CUTOFF,
    expiresAt: EXPIRES_AT,
    evidenceIds: [`live:${sourceId}:${capabilityId}`],
    conformanceArtifactHash: CONFORMANCE_HASH,
    adapterVersion: "adapter-v1",
    ...overrides,
  });
}

function testGrant(
  sourceId: M1CollectorCapabilityGrant["sourceId"],
  capabilityId: M1CollectorCapabilityGrant["capabilityId"],
): M1CollectorCapabilityGrant {
  return buildM1CollectorCapabilityGrant({
    releaseId: RELEASE,
    sourceId,
    capabilityId,
    assetDomains: ["CRYPTO_LINEAR_PERPETUAL"],
    evidenceClass: "TEST_ONLY",
    networkEnvironment: "TEST_HARNESS",
    conformanceStatus: "PASS",
    rightsStatus: "PENDING_REVIEW",
    rightsReviewerClass: "NOT_REVIEWED",
    rightsReviewedAt: null,
    rightsExpiresAt: null,
    rightsEvidenceHash: null,
    entitlementStatus: "PUBLIC_NO_KEY",
    jurisdictionAvailability: "AVAILABLE",
    observedAt: SOURCE_CUTOFF,
    expiresAt: EXPIRES_AT,
    evidenceIds: [`test:${sourceId}:${capabilityId}`],
    conformanceArtifactHash: CONFORMANCE_HASH,
    adapterVersion: "adapter-test-v1",
  });
}

function quota(
  sourceId: M1CollectorQuotaState["sourceId"],
  capabilityId: M1CollectorQuotaState["capabilityId"],
  overrides: Partial<M1CollectorQuotaState> = {},
): M1CollectorQuotaState {
  return {
    scopeEpoch: "SCOPE_EPOCH_V2_MULTI_ASSET_4V",
    releaseId: RELEASE,
    sourceId,
    capabilityId,
    evidenceClass: "LIVE_READ_ONLY",
    networkEnvironment: "TENCENT_ISOLATED_READ_ONLY",
    status: "READY",
    windowStartedAt: "2026-07-23T11:59:00.000Z",
    windowEndsAt: "2026-07-23T12:01:00.000Z",
    requestLimit: 100,
    requestsUsed: 0,
    requestsReserved: 0,
    observedAt: SOURCE_CUTOFF,
    retryAfter: null,
    evidenceIds: [`quota:${sourceId}:${capabilityId}`],
    ...overrides,
  };
}

function input(
  overrides: Partial<M1AdaptiveCollectorPlanInput> = {},
): M1AdaptiveCollectorPlanInput {
  return {
    releaseId: RELEASE,
    generatedAt: GENERATED_AT,
    sourceCutoff: SOURCE_CUTOFF,
    registryDigest:
      M1_FOUR_VENUE_SOURCE_CAPABILITY_REGISTRY.registryDigest,
    identitySnapshotHash: IDENTITY_HASH,
    subjects: [subject()],
    capabilityGrants: [],
    quotaStates: [],
    checkpoints: [],
    policy: policy(),
    ...overrides,
  };
}

function findIntent(
  plan: ReturnType<typeof buildM1AdaptiveCollectorPlan>,
  values: {
    subjectId: string;
    sourceId: string;
    tier: string;
    capabilityId: string;
  },
) {
  const found = plan.intents.find((intent) =>
    intent.subjectId === values.subjectId &&
    intent.collectionSourceId === values.sourceId &&
    intent.tier === values.tier &&
    intent.capabilityId === values.capabilityId
  );
  assert.ok(found, `missing intent ${JSON.stringify(values)}`);
  return found;
}

test("no live grants account the baseline without creating runtime authority", () => {
  const plan = buildM1AdaptiveCollectorPlan(input());

  assert.equal(plan.subjectDenominatorsByTier.T0_CATALOG_EVENT, 1);
  assert.equal(plan.subjectDenominatorsByTier.T1_WIDE_MARKET, 1);
  assert.equal(plan.subjectDenominatorsByTier.T2_CANDIDATE_BURST, 0);
  assert.equal(plan.readyForRuntimeAdapterCount, 0);
  assert.equal(plan.capabilityEvidenceClass, "NO_GRANTS");
  assert.equal(plan.runtimeExecutionAllowed, false);
  assert.equal(plan.factAuthorityGranted, false);
  assert.equal(plan.candidateAuthorityGranted, false);
  assert.equal(plan.strategyAuthorityGranted, false);
  assert.equal(plan.readyAuthorityGranted, false);
  assert.ok(plan.intents.length > 0);
  assert.equal(Object.isFrozen(plan), true);
});

test("test-only capability evidence can never become runtime-ready", () => {
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [testGrant("BINANCE_FUTURES", "MARK_PRICE")],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "TEST_ONLY_NO_RUNTIME");
  assert.equal(mark.plannedRequestTokens, 0);
  assert.equal(plan.readyForRuntimeAdapterCount, 0);
  assert.equal(plan.capabilityEvidenceClass, "TEST_ONLY_OR_MIXED");
});

test("a current live grant, rights decision and quota can reach adapter-ready only", () => {
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "READY_FOR_RUNTIME_ADAPTER");
  assert.equal(mark.plannedRequestTokens, 1);
  assert.equal(mark.runtimeExecutionAllowed, false);
  assert.equal(plan.readyForRuntimeAdapterCount, 1);
  assert.equal(plan.runtimeExecutionAllowed, false);
});

test("four venues and spot-only listing watch remain in the T0 denominator", () => {
  const subjects = [
    subject(),
    subject({
      subjectId: "okx-eth",
      sourceId: "OKX_SWAP",
      canonicalInstrumentId: "scope-v2:okx:eth-usdt-swap",
      venueInstrumentId: "ETH-USDT-SWAP",
      listingEpoch: "listing:okx-eth",
      identityEpoch: "identity:okx-eth",
    }),
    subject({
      subjectId: "bybit-sol",
      sourceId: "BYBIT_DERIVATIVES",
      canonicalInstrumentId: "scope-v2:bybit:solusdt",
      venueInstrumentId: "SOLUSDT",
      listingEpoch: "listing:bybit-sol",
      identityEpoch: "identity:bybit-sol",
    }),
    subject({
      subjectId: "bitget-xrp",
      sourceId: "BITGET_FUTURES",
      canonicalInstrumentId: "scope-v2:bitget:xrpusdt",
      venueInstrumentId: "XRPUSDT",
      listingEpoch: "listing:bitget-xrp",
      identityEpoch: "identity:bitget-xrp",
    }),
    subject({
      subjectId: "binance-new-asset-watch",
      assetDomain: "ASSET_LISTING_WATCH",
      coverageClass: "ASSET_LISTING_WATCH",
      canonicalInstrumentId: null,
      venueInstrumentId: "NEWCOINUSDT",
      listingEpoch: "listing:newcoin",
      identityEpoch: "identity:newcoin-watch",
      identityStatus: "UNRESOLVED",
      lifecycleState: "ANNOUNCED_WAITING_CATALOG",
      eligibilityStatus: "NOT_EVALUATED",
      reasonCodes: ["no_supported_derivative_observed"],
    }),
  ];
  const plan = buildM1AdaptiveCollectorPlan(input({ subjects }));

  assert.equal(plan.subjectCount, 5);
  assert.equal(plan.subjectDenominatorsByTier.T0_CATALOG_EVENT, 5);
  assert.equal(plan.subjectDenominatorsByTier.T1_WIDE_MARKET, 4);
  assert.equal(
    plan.intents.some((intent) =>
      intent.subjectId === "binance-new-asset-watch" &&
      intent.tier !== "T0_CATALOG_EVENT"
    ),
    false,
  );
});

test("a broad four-venue universe keeps every T0/T1 subject in bounded accounting", () => {
  const venues = [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_DERIVATIVES",
    "BITGET_FUTURES",
  ] as const;
  const subjects = Array.from({ length: 400 }, (_, index) => {
    const sourceId = venues[index % venues.length]!;
    const token = `ASSET${index}`;
    return subject({
      subjectId: `${sourceId.toLowerCase()}-${token.toLowerCase()}`,
      sourceId,
      canonicalInstrumentId: `scope-v2:${sourceId}:${token}`,
      venueInstrumentId: `${token}USDT`,
      listingEpoch: `listing:${sourceId}:${token}`,
      identityEpoch: `identity:${sourceId}:${token}`,
    });
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects,
    policy: policy({ maxIntentRows: 100_000 }),
  }));

  assert.equal(plan.subjectCount, 400);
  assert.equal(plan.subjectDenominatorsByTier.T0_CATALOG_EVENT, 400);
  assert.equal(plan.subjectDenominatorsByTier.T1_WIDE_MARKET, 400);
  assert.equal(plan.readyForRuntimeAdapterCount, 0);
  assert.ok(plan.intentCount > 400);
});

test("candidate priority adds T2 depth without removing the T0/T1 denominator", () => {
  const candidate = subject({
    candidatePriority: "P0",
    candidateEpisodeId: "episode-btc",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate],
  }));

  assert.equal(plan.subjectDenominatorsByTier.T0_CATALOG_EVENT, 1);
  assert.equal(plan.subjectDenominatorsByTier.T1_WIDE_MARKET, 1);
  assert.equal(plan.subjectDenominatorsByTier.T2_CANDIDATE_BURST, 1);
  assert.ok(
    plan.intents.some((intent) =>
      intent.subjectId === candidate.subjectId &&
      intent.tier === "T1_WIDE_MARKET"
    ),
  );
});

test("candidate and control identities must be exact eligible established derivatives", () => {
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      subjects: [
        subject({
          lifecycleState: "TRADING_WARMUP",
          candidatePriority: "P0",
          candidateEpisodeId: "episode-warmup",
        }),
      ],
    })),
    /candidate and control subjects require an exact eligible established/u,
  );
});

test("a T2 candidate without a matched control is explicitly blocked", () => {
  const candidate = subject({
    candidatePriority: "P0",
    candidateEpisodeId: "episode-btc",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate],
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "PUBLIC_TRADE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "PUBLIC_TRADE")],
  }));
  const publicTrade = findIntent(plan, {
    subjectId: candidate.subjectId,
    sourceId: "BINANCE_FUTURES",
    tier: "T2_CANDIDATE_BURST",
    capabilityId: "PUBLIC_TRADE",
  });

  assert.equal(publicTrade.disposition, "CONTROL_MISSING");
  assert.equal(publicTrade.plannedRequestTokens, 0);
});

test("candidate and matched control can become adapter-ready together", () => {
  const candidate = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-candidate",
    canonicalInstrumentId: "scope-v2:bitget:candidate",
    venueInstrumentId: "CANDIDATEUSDT",
    listingEpoch: "listing:bitget-candidate",
    identityEpoch: "identity:bitget-candidate",
    candidatePriority: "P0",
    candidateEpisodeId: "episode-bitget",
  });
  const control = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-control",
    canonicalInstrumentId: "scope-v2:bitget:control",
    venueInstrumentId: "CONTROLUSDT",
    listingEpoch: "listing:bitget-control",
    identityEpoch: "identity:bitget-control",
    matchedControlForEpisodeId: "episode-bitget",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate, control],
    capabilityGrants: [
      liveGrant("BITGET_FUTURES", "PUBLIC_TRADE"),
    ],
    quotaStates: [quota("BITGET_FUTURES", "PUBLIC_TRADE")],
  }));

  for (const item of [candidate, control]) {
    const intent = findIntent(plan, {
      subjectId: item.subjectId,
      sourceId: "BITGET_FUTURES",
      tier: "T2_CANDIDATE_BURST",
      capabilityId: "PUBLIC_TRADE",
    });
    assert.equal(intent.disposition, "READY_FOR_RUNTIME_ADAPTER");
  }
});

test("bounded quota cannot be overbooked by candidate and control intents", () => {
  const candidate = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-candidate",
    canonicalInstrumentId: "scope-v2:bitget:candidate",
    venueInstrumentId: "CANDIDATEUSDT",
    listingEpoch: "listing:bitget-candidate",
    identityEpoch: "identity:bitget-candidate",
    candidatePriority: "P0",
    candidateEpisodeId: "episode-bitget",
  });
  const control = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-control",
    canonicalInstrumentId: "scope-v2:bitget:control",
    venueInstrumentId: "CONTROLUSDT",
    listingEpoch: "listing:bitget-control",
    identityEpoch: "identity:bitget-control",
    matchedControlForEpisodeId: "episode-bitget",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate, control],
    capabilityGrants: [
      liveGrant("BITGET_FUTURES", "PUBLIC_TRADE"),
    ],
    quotaStates: [
      quota("BITGET_FUTURES", "PUBLIC_TRADE", { requestLimit: 1 }),
    ],
  }));
  const candidateIntent = findIntent(plan, {
    subjectId: candidate.subjectId,
    sourceId: "BITGET_FUTURES",
    tier: "T2_CANDIDATE_BURST",
    capabilityId: "PUBLIC_TRADE",
  });
  const controlIntent = findIntent(plan, {
    subjectId: control.subjectId,
    sourceId: "BITGET_FUTURES",
    tier: "T2_CANDIDATE_BURST",
    capabilityId: "PUBLIC_TRADE",
  });

  assert.equal(controlIntent.disposition, "READY_FOR_RUNTIME_ADAPTER");
  assert.equal(candidateIntent.disposition, "QUOTA_EXHAUSTED");
  assert.equal(
    plan.plannedRequestTokensBySource.BITGET_FUTURES,
    1,
  );
});

test("equity market collection stays blocked without session and corporate-action grants", () => {
  const stock = subject({
    sourceId: "BYBIT_DERIVATIVES",
    subjectId: "bybit-stock",
    assetDomain: "EQUITY_SINGLE_NAME_PERPETUAL",
    canonicalInstrumentId: "scope-v2:bybit:aapl",
    venueInstrumentId: "AAPLPERP",
    listingEpoch: "listing:bybit-aapl",
    identityEpoch: "identity:bybit-aapl",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [stock],
    capabilityGrants: [
      liveGrant(
        "BYBIT_DERIVATIVES",
        "MARK_PRICE",
        ["EQUITY_SINGLE_NAME_PERPETUAL"],
      ),
    ],
    quotaStates: [quota("BYBIT_DERIVATIVES", "MARK_PRICE")],
  }));
  const mark = findIntent(plan, {
    subjectId: stock.subjectId,
    sourceId: "BYBIT_DERIVATIVES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "EQUITY_REFERENCE_BLOCKED");
  assert.equal(mark.plannedRequestTokens, 0);
});

test("blocked registry capabilities cannot be promoted by a forged live grant", () => {
  assert.throws(
    () => liveGrant(
      "BYBIT_DERIVATIVES",
      "EQUITY_CORPORATE_ACTION",
      ["EQUITY_SINGLE_NAME_PERPETUAL"],
    ),
    /live grant cannot promote a blocked registry disposition/u,
  );
});

test("an automated or missing rights review cannot create an allowed live grant", () => {
  assert.throws(
    () => liveGrant("BINANCE_FUTURES", "MARK_PRICE", undefined, {
      rightsReviewerClass: "NOT_REVIEWED",
      rightsReviewedAt: null,
      rightsExpiresAt: null,
      rightsEvidenceHash: null,
    }),
    /allowed rights require current external human review evidence/u,
  );
});

test("CoinGlass rate limiting remains explicit with no stale promotion", () => {
  const candidate = subject({
    candidatePriority: "P0",
    candidateEpisodeId: "episode-btc",
    deepValidationEpisodeId: "deep-btc",
  });
  const control = subject({
    subjectId: "binance-control",
    canonicalInstrumentId: "scope-v2:binance:control",
    venueInstrumentId: "CONTROLUSDT",
    listingEpoch: "listing:control",
    identityEpoch: "identity:control",
    matchedControlForEpisodeId: "episode-btc",
  });
  const grant = liveGrant(
    "COINGLASS_V4",
    "OPEN_INTEREST_HISTORY",
  );
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate, control],
    capabilityGrants: [grant],
    quotaStates: [
      quota("COINGLASS_V4", "OPEN_INTEREST_HISTORY", {
        status: "RATE_LIMITED",
        retryAfter: "2026-07-23T12:02:00.000Z",
      }),
    ],
  }));
  const intent = findIntent(plan, {
    subjectId: candidate.subjectId,
    sourceId: "COINGLASS_V4",
    tier: "T3_DEEP_VALIDATION",
    capabilityId: "OPEN_INTEREST_HISTORY",
  });

  assert.equal(intent.disposition, "RATE_LIMITED");
  assert.equal(intent.plannedRequestTokens, 0);
  assert.ok(intent.reasonCodes.includes(
    "provider_rate_limited_no_stale_fallback",
  ));
});

test("T3 collection preserves the same capability denominator for matched controls", () => {
  const candidate = subject({
    candidatePriority: "P0",
    candidateEpisodeId: "episode-btc",
    deepValidationEpisodeId: "deep-btc",
  });
  const control = subject({
    subjectId: "binance-control",
    canonicalInstrumentId: "scope-v2:binance:control",
    venueInstrumentId: "CONTROLUSDT",
    listingEpoch: "listing:control",
    identityEpoch: "identity:control",
    matchedControlForEpisodeId: "episode-btc",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [candidate, control],
    capabilityGrants: [
      liveGrant("COINGLASS_V4", "OPEN_INTEREST_HISTORY"),
    ],
    quotaStates: [
      quota("COINGLASS_V4", "OPEN_INTEREST_HISTORY"),
    ],
  }));

  assert.equal(plan.subjectDenominatorsByTier.T3_DEEP_VALIDATION, 2);
  for (const item of [candidate, control]) {
    const intent = findIntent(plan, {
      subjectId: item.subjectId,
      sourceId: "COINGLASS_V4",
      tier: "T3_DEEP_VALIDATION",
      capabilityId: "OPEN_INTEREST_HISTORY",
    });
    assert.equal(intent.disposition, "READY_FOR_RUNTIME_ADAPTER");
  }
});

test("a live capability without current quota evidence remains unavailable", () => {
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "QUOTA_UNVERIFIED");
});

test("test-only quota evidence cannot unlock a live source capability", () => {
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [
      quota("BINANCE_FUTURES", "MARK_PRICE", {
        evidenceClass: "TEST_ONLY",
        networkEnvironment: "TEST_HARNESS",
      }),
    ],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "QUOTA_UNVERIFIED");
  assert.ok(mark.reasonCodes.includes(
    "test_only_quota_cannot_enter_runtime_planning",
  ));
});

test("fairness cursor and bounded capacity defer rather than drop excess work", () => {
  const bitget = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-btc",
    canonicalInstrumentId: "scope-v2:bitget:btc",
    venueInstrumentId: "BTCUSDT",
    listingEpoch: "listing:bitget-btc",
    identityEpoch: "identity:bitget-btc",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [subject(), bitget],
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
      liveGrant("BITGET_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [
      quota("BINANCE_FUTURES", "MARK_PRICE"),
      quota("BITGET_FUTURES", "MARK_PRICE"),
    ],
    policy: policy({
      maxReadyIntents: 1,
      baselineReservedSlots: 1,
      maxReadyIntentsPerSource: 1,
      fairnessCursorSource: "BITGET_FUTURES",
    }),
  }));
  const binance = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });
  const bitgetIntent = findIntent(plan, {
    subjectId: "bitget-btc",
    sourceId: "BITGET_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(bitgetIntent.disposition, "READY_FOR_RUNTIME_ADAPTER");
  assert.equal(binance.disposition, "BACKPRESSURE_DEFERRED");
  assert.equal(plan.intents.length, plan.intentCount);
});

test("baseline reserve is honored before cross-source candidate burst", () => {
  const candidate = subject({
    sourceId: "BITGET_FUTURES",
    subjectId: "bitget-candidate",
    canonicalInstrumentId: "scope-v2:bitget:candidate",
    venueInstrumentId: "CANDIDATEUSDT",
    listingEpoch: "listing:bitget-candidate",
    identityEpoch: "identity:bitget-candidate",
    candidatePriority: "P0",
    candidateEpisodeId: "episode-bitget",
  });
  const plan = buildM1AdaptiveCollectorPlan(input({
    subjects: [subject(), candidate],
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
      liveGrant("BITGET_FUTURES", "PUBLIC_TRADE"),
    ],
    quotaStates: [
      quota("BINANCE_FUTURES", "MARK_PRICE"),
      quota("BITGET_FUTURES", "PUBLIC_TRADE"),
    ],
    policy: policy({
      maxReadyIntents: 1,
      baselineReservedSlots: 1,
      maxReadyIntentsPerSource: 1,
      fairnessCursorSource: "BITGET_FUTURES",
    }),
  }));
  const baseline = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });
  const burst = findIntent(plan, {
    subjectId: candidate.subjectId,
    sourceId: "BITGET_FUTURES",
    tier: "T2_CANDIDATE_BURST",
    capabilityId: "PUBLIC_TRADE",
  });

  assert.equal(baseline.disposition, "READY_FOR_RUNTIME_ADAPTER");
  assert.equal(burst.disposition, "CONTROL_MISSING");
  assert.equal(plan.readyForRuntimeAdapterCount, 1);
});

test("a fresh checkpoint prevents early duplicate collection", () => {
  const checkpoint: M1CollectorCheckpoint = {
    intentKey:
      "T1_WIDE_MARKET:BINANCE_FUTURES:MARK_PRICE:binance-btc",
    lastCompletedAt: "2026-07-23T11:59:58.000Z",
    lastAttemptAt: "2026-07-23T11:59:58.000Z",
    consecutiveFailures: 0,
    inFlightLeaseUntil: null,
    lastFailureClass: "NONE",
  };
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
    checkpoints: [checkpoint],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "NOT_DUE");
});

test("an active lease prevents overlapping intent execution", () => {
  const checkpoint: M1CollectorCheckpoint = {
    intentKey:
      "T1_WIDE_MARKET:BINANCE_FUTURES:MARK_PRICE:binance-btc",
    lastCompletedAt: null,
    lastAttemptAt: "2026-07-23T11:59:59.000Z",
    consecutiveFailures: 0,
    inFlightLeaseUntil: "2026-07-23T12:01:00.000Z",
    lastFailureClass: "NONE",
  };
  const plan = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
    checkpoints: [checkpoint],
  }));
  const mark = findIntent(plan, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  });

  assert.equal(mark.disposition, "CHECKPOINT_INFLIGHT");
});

test("retry backoff and the failure circuit stay explicit", () => {
  const backoffCheckpoint: M1CollectorCheckpoint = {
    intentKey:
      "T1_WIDE_MARKET:BINANCE_FUTURES:MARK_PRICE:binance-btc",
    lastCompletedAt: null,
    lastAttemptAt: "2026-07-23T11:59:59.500Z",
    consecutiveFailures: 1,
    inFlightLeaseUntil: null,
    lastFailureClass: "TRANSPORT",
  };
  const backoff = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
    checkpoints: [backoffCheckpoint],
  }));
  assert.equal(findIntent(backoff, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  }).disposition, "BACKOFF_DEFERRED");

  const circuit = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
    checkpoints: [{
      ...backoffCheckpoint,
      consecutiveFailures: 5,
      lastAttemptAt: "2026-07-23T11:50:00.000Z",
    }],
  }));
  assert.equal(findIntent(circuit, {
    subjectId: "binance-btc",
    sourceId: "BINANCE_FUTURES",
    tier: "T1_WIDE_MARKET",
    capabilityId: "MARK_PRICE",
  }).disposition, "RETRY_CIRCUIT_OPEN");
});

test("expired, rights-blocked and jurisdiction-blocked grants fail closed", () => {
  const cases = [
    {
      expected: "CAPABILITY_EXPIRED",
      grant: liveGrant("BINANCE_FUTURES", "MARK_PRICE", undefined, {
        expiresAt: GENERATED_AT,
      }),
    },
    {
      expected: "RIGHTS_BLOCKED",
      grant: liveGrant("BINANCE_FUTURES", "MARK_PRICE", undefined, {
        rightsStatus: "PENDING_REVIEW",
      }),
    },
    {
      expected: "JURISDICTION_BLOCKED",
      grant: liveGrant("BINANCE_FUTURES", "MARK_PRICE", undefined, {
        jurisdictionAvailability: "RESTRICTED",
      }),
    },
  ] as const;

  for (const item of cases) {
    const plan = buildM1AdaptiveCollectorPlan(input({
      capabilityGrants: [item.grant],
      quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
    }));
    assert.equal(findIntent(plan, {
      subjectId: "binance-btc",
      sourceId: "BINANCE_FUTURES",
      tier: "T1_WIDE_MARKET",
      capabilityId: "MARK_PRICE",
    }).disposition, item.expected);
  }
});

test("duplicate quota state, cross-release grant and future knowledge are rejected", () => {
  const markQuota = quota("BINANCE_FUTURES", "MARK_PRICE");
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      quotaStates: [markQuota, markQuota],
    })),
    /duplicate adaptive collector quota state/u,
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      capabilityGrants: [
        liveGrant("BINANCE_FUTURES", "MARK_PRICE", undefined, {
          releaseId: "d".repeat(40),
        }),
      ],
    })),
    /capability grant lineage mismatch/u,
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      subjects: [subject({
        observedAt: "2026-07-23T12:00:01.000Z",
      })],
    })),
    /subject knowledge exceeds source cutoff/u,
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      quotaStates: [
        quota("BINANCE_FUTURES", "MARK_PRICE", {
          releaseId: "f".repeat(40),
        }),
      ],
    })),
    /quota lineage exceeds cutoff/u,
  );
});

test("duplicate identity, orphan controls and future checkpoint history are rejected", () => {
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      subjects: [
        subject(),
        subject({
          subjectId: "duplicate-canonical",
          venueInstrumentId: "BTCUSDT-DUPLICATE",
          canonicalInstrumentId: "scope-v2:binance:btcusdt",
          listingEpoch: "listing:duplicate",
          identityEpoch: "identity:duplicate",
        }),
      ],
    })),
    /canonical instrument subjects must be unique/u,
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      subjects: [
        subject({
          subjectId: "orphan-control",
          candidatePriority: "NONE",
          candidateEpisodeId: null,
          matchedControlForEpisodeId: "missing-episode",
        }),
      ],
    })),
    /matched control has no candidate episode/u,
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      checkpoints: [{
        intentKey:
          "T1_WIDE_MARKET:BINANCE_FUTURES:MARK_PRICE:binance-btc",
        lastCompletedAt: null,
        lastAttemptAt: "2026-07-23T12:00:01.000Z",
        consecutiveFailures: 0,
        inFlightLeaseUntil: null,
        lastFailureClass: "NONE",
      }],
    })),
    /checkpoint contains future history/u,
  );
});

test("bounded plan overflow fails instead of truncating the denominator", () => {
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      policy: policy({ maxIntentRows: 1 }),
    })),
    /intent denominator .* exceeds the bounded plan limit/u,
  );
});

test("unbounded or authority-granting policy cannot enter the contract", () => {
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      policy: {
        ...policy(),
        unboundedRetentionAllowed: true,
      } as unknown as M1AdaptiveCollectorPolicy,
    })),
  );
  assert.throws(
    () => buildM1AdaptiveCollectorPlan(input({
      policy: {
        ...policy(),
        automaticFactAuthorityAllowed: true,
      } as unknown as M1AdaptiveCollectorPolicy,
    })),
  );
});

test("plan construction is deterministic and hash tampering is rejected", () => {
  const planA = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
  }));
  const planB = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
  }));

  assert.deepEqual(planA, planB);
  const subjectLineageChanged = buildM1AdaptiveCollectorPlan(input({
    subjects: [subject({ reasonCodes: ["lineage_changed"] })],
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [quota("BINANCE_FUTURES", "MARK_PRICE")],
  }));
  const quotaLineageChanged = buildM1AdaptiveCollectorPlan(input({
    capabilityGrants: [
      liveGrant("BINANCE_FUTURES", "MARK_PRICE"),
    ],
    quotaStates: [
      quota("BINANCE_FUTURES", "MARK_PRICE", {
        evidenceIds: ["quota:alternate-evidence"],
      }),
    ],
  }));
  assert.notEqual(planA.subjectInputHash, subjectLineageChanged.subjectInputHash);
  assert.notEqual(planA.contentHash, subjectLineageChanged.contentHash);
  assert.notEqual(planA.quotaStateSetHash, quotaLineageChanged.quotaStateSetHash);
  assert.notEqual(planA.contentHash, quotaLineageChanged.contentHash);
  assert.equal(M1AdaptiveCollectorPlanSchema.safeParse({
    ...planA,
    readyForRuntimeAdapterCount: planA.readyForRuntimeAdapterCount + 1,
  }).success, false);
  assert.equal(M1AdaptiveCollectorPlanSchema.safeParse({
    ...planA,
    contentHash: `sha256:${"f".repeat(64)}`,
  }).success, false);
  assert.equal(M1AdaptiveCollectorPlanSchema.safeParse({
    ...planA,
    runtimeExecutionAllowed: true,
  }).success, false);
  assert.equal(M1AdaptiveCollectorPlanSchema.safeParse({
    ...planA,
    policyHash: `sha256:${"f".repeat(64)}`,
  }).success, false);
});
