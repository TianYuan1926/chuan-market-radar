import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  M1_LISTING_LIFECYCLE_STATES,
} from "../multi-asset-universe/multi-asset-identity-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  buildM1MultiAssetShadowCycle,
  buildM1MultiAssetShadowEvidence,
  type M1MultiAssetShadowCycleInput,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

const RELEASE = "a".repeat(40);
const CONFIG_DIGEST =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BASE_TIME = Date.parse("2026-07-26T02:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
): M1MultiAssetShadowUpstreamBinding {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-26T01:58:00.000Z",
    sourceCutoff: "2026-07-26T01:57:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:fixture",
    runtimeAdapterArtifactHash: digest("1"),
    conformanceArtifactId: "source-conformance:fixture",
    conformanceArtifactHash: digest("2"),
    registryDigest: digest("3"),
    profileSetHash: digest("4"),
    evidenceClass,
    networkEnvironment: live
      ? "TENCENT_ISOLATED_READ_ONLY" as const
      : "TEST_HARNESS" as const,
    runtimeAdapterStatus: live
      ? "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY" as const
      : "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
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
        contentHash: digest(String(index + 5)),
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

const ASSET_OBSERVED_COUNTS = Object.freeze({
  CRYPTO_LINEAR_PERPETUAL: 20,
  EQUITY_SINGLE_NAME_PERPETUAL: 4,
  EQUITY_INDEX_ETF_PERPETUAL: 4,
  EQUITY_CFD: 2,
  OTHER_RWA_DERIVATIVE: 2,
  ASSET_LISTING_WATCH: 4,
  CROSS_MARKET_CONTEXT: 4,
  UNRESOLVED: 0,
} satisfies Record<
  (typeof M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS)[number],
  number
>);

const LIFECYCLE_OBSERVED_COUNTS = Object.freeze([
  4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2,
] as const);

function dimensionRow(
  observedSubjectCount: number,
  routeEligibleCount: number,
) {
  const status = observedSubjectCount === 0
    ? "OBSERVED_ZERO" as const
    : routeEligibleCount === 0
      ? "BLOCKED" as const
      : "FRESH" as const;
  return {
    observedSubjectCount,
    routeEligibleCount,
    collectedFactCount: routeEligibleCount,
    freshFactCount: routeEligibleCount,
    status,
    reasonCodes: status === "FRESH" ? [] : ["dimension_not_route_eligible"],
  };
}

function cycleInput(input: {
  index: number;
  binding?: M1MultiAssetShadowUpstreamBinding;
  equityFacts?: boolean;
  runtimeConfigDigest?: string;
  workerRunId?: string;
  scheduledOffsetMs?: number;
  durationMs?: number;
}): M1MultiAssetShadowCycleInput {
  const binding = input.binding ?? upstreamBinding();
  const equityFacts = input.equityFacts ?? true;
  const scheduledAt = BASE_TIME +
    (input.index - 1) * 60_000 +
    (input.scheduledOffsetMs ?? 0);
  const startedAt = scheduledAt + 100;
  const durationMs = input.durationMs ?? 1_900;
  const completedAt = startedAt + durationMs;
  const routeEligiblePerVenue = equityFacts ? 10 : 8;
  const venues = [...M1_VENUE_SOURCE_IDS].reverse().map((venue) => ({
    venue,
    observedSubjectCount: 10,
    exactIdentityCount: 10,
    partialIdentityCount: 0,
    unresolvedIdentityCount: 0,
    routeEligibleCount: routeEligiblePerVenue,
    routeBlockedCount: 10 - routeEligiblePerVenue,
    scheduledCount: routeEligiblePerVenue,
    notScheduledCount: 0,
    attemptedCount: routeEligiblePerVenue,
    notAttemptedCount: 0,
    collectedCount: routeEligiblePerVenue,
    freshCount: routeEligiblePerVenue,
    partialCount: 0,
    staleCount: 0,
    unavailableCount: 0,
    providerFailureCount: 0,
    reasonCodes: equityFacts ? [] : ["equity_route_blocked"],
  }));
  const assetDomains = [...M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS]
    .reverse()
    .map((assetDomain) => {
    const observed = ASSET_OBSERVED_COUNTS[assetDomain];
    const equity =
      assetDomain === "EQUITY_SINGLE_NAME_PERPETUAL" ||
      assetDomain === "EQUITY_INDEX_ETF_PERPETUAL";
    return {
      assetDomain,
      ...dimensionRow(observed, !equityFacts && equity ? 0 : observed),
    };
    });
  const lifecycleStates = [...M1_LISTING_LIFECYCLE_STATES]
    .reverse()
    .map((lifecycleState) => {
      const originalIndex = M1_LISTING_LIFECYCLE_STATES.indexOf(
        lifecycleState,
      );
      const observed = LIFECYCLE_OBSERVED_COUNTS[originalIndex]!;
      const routeEligible =
        !equityFacts && originalIndex >= 8 ? 0 : observed;
      return {
        lifecycleState,
        ...dimensionRow(observed, routeEligible),
      };
    });
  return {
    releaseId: RELEASE,
    upstreamBindingId: binding.upstreamBindingId,
    upstreamBindingHash: binding.contentHash,
    catalogCaptureBindingId: `catalog-capture:${input.index}`,
    catalogCaptureBindingHash:
      `sha256:${String((input.index % 9) + 1).repeat(64)}`,
    identitySnapshotId: `identity-snapshot:${input.index}`,
    identitySnapshotHash:
      `sha256:${String(((input.index + 1) % 9) + 1).repeat(64)}`,
    baseFactSnapshotId: `base-fact-snapshot:${input.index}`,
    baseFactSnapshotHash:
      `sha256:${String(((input.index + 2) % 9) + 1).repeat(64)}`,
    workerRunId: input.workerRunId ?? "m1-5c-fixture-run",
    runtimeConfigDigest: input.runtimeConfigDigest ?? CONFIG_DIGEST,
    cycleIndex: input.index,
    scheduledAt: iso(scheduledAt),
    startedAt: iso(startedAt),
    sourceCutoff: iso(startedAt + 900),
    completedAt: iso(completedAt),
    scheduleLagMs: 100,
    durationMs,
    missedScheduleStarts: 0,
    rssBytes: 256 * 1024 * 1024,
    checkpointStatus: "COMMITTED",
    checkpointReceiptId: `checkpoint-receipt:${input.index}`,
    checkpointReceiptHash:
      `sha256:${String(((input.index + 3) % 9) + 1).repeat(64)}`,
    persistenceStatus: "COMMITTED",
    persistenceReceiptId: `persistence-receipt:${input.index}`,
    persistenceReceiptHash:
      `sha256:${String(((input.index + 4) % 9) + 1).repeat(64)}`,
    venues,
    assetDomains,
    lifecycleStates,
    listingCheckpoint: {
      requiredCount: 2,
      bindingCount: 2,
      healthyCount: 2,
      unhealthyOrMissingCount: 0,
      status: "PASS",
      reasonCodes: [],
    },
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    productionChanged: false,
  };
}

function cycles(input: {
  binding?: M1MultiAssetShadowUpstreamBinding;
  equityFacts?: boolean;
  mutate?: (
    value: M1MultiAssetShadowCycleInput,
    index: number,
  ) => M1MultiAssetShadowCycleInput;
} = {}) {
  return Array.from({ length: 31 }, (_, offset) => {
    const index = offset + 1;
    const value = cycleInput({
      index,
      binding: input.binding,
      equityFacts: input.equityFacts,
    });
    return buildM1MultiAssetShadowCycle(
      input.mutate?.(value, index) ?? value,
    );
  });
}

test("canonicalizes the exact four-Venue, asset-domain and lifecycle denominators", () => {
  const cycle = buildM1MultiAssetShadowCycle(cycleInput({ index: 1 }));
  assert.deepEqual(
    cycle.venues.map((row) => row.venue),
    [...M1_VENUE_SOURCE_IDS],
  );
  assert.deepEqual(
    cycle.assetDomains.map((row) => row.assetDomain),
    [...M1_MULTI_ASSET_SHADOW_ASSET_DOMAIN_BUCKETS],
  );
  assert.deepEqual(
    cycle.lifecycleStates.map((row) => row.lifecycleState),
    [...M1_LISTING_LIFECYCLE_STATES],
  );
  assert.equal(cycle.aggregate.observedSubjectCount, 40);
  assert.equal(cycle.aggregate.routeEligibleCount, 40);
  assert.equal(cycle.aggregate.collectionCoverageRatio, 1);
  assert.equal(cycle.status, "PASS_ALL_REQUIRED_AXES_NO_AUTHORITY");
  assert.equal(Object.isFrozen(cycle), true);
});

test("a committed cycle requires exact Fact, persistence and checkpoint identities", () => {
  const input = cycleInput({ index: 1 });
  assert.throws(
    () =>
      buildM1MultiAssetShadowCycle({
        ...input,
        persistenceReceiptId: null,
        persistenceReceiptHash: null,
      }),
    /storage status requires exact receipt identity/u,
  );
  assert.throws(
    () =>
      buildM1MultiAssetShadowCycle({
        ...input,
        checkpointStatus: "BLOCKED",
      }),
    /storage status requires exact receipt identity/u,
  );
});

test("rejects a missing Venue instead of shrinking the denominator", () => {
  const input = cycleInput({ index: 1 });
  assert.throws(
    () => buildM1MultiAssetShadowCycle({
      ...input,
      venues: input.venues.slice(1),
    } as M1MultiAssetShadowCycleInput),
    /expected array to have >=4 items|exact frozen denominator/u,
  );
});

test("rejects denominator arithmetic that would hide unavailable collection", () => {
  const input = cycleInput({ index: 1 });
  const venues = input.venues.map((row, index) =>
    index === 0
      ? { ...row, collectedCount: row.collectedCount - 1 }
      : row
  );
  assert.throws(
    () => buildM1MultiAssetShadowCycle({ ...input, venues }),
    /venue accounting denominator does not reconcile/u,
  );
});

test("retains blocked equity subjects and refuses a false multi-asset pass", () => {
  const cycle = buildM1MultiAssetShadowCycle(cycleInput({
    index: 1,
    equityFacts: false,
  }));
  assert.equal(cycle.aggregate.observedSubjectCount, 40);
  assert.equal(cycle.aggregate.routeEligibleCount, 32);
  assert.equal(cycle.aggregate.routeBlockedCount, 8);
  assert.equal(
    cycle.axisAssessments.find(
      (axis) => axis.axisId === "EQUITY_ASSET_DOMAIN",
    )?.status,
    "BLOCKED",
  );
  assert.equal(cycle.status, "PARTIAL_EQUITY_TRADABLE_FACT_BLOCKED");
});

test("keeps test fixtures test-only even when every local denominator passes", () => {
  const binding = upstreamBinding("TEST_ONLY");
  const evidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: binding,
    cycles: cycles({ binding }),
    evaluatedAt: "2026-07-26T02:31:00.000Z",
  });
  assert.equal(evidence.baseCollectionGate, "PASS");
  assert.equal(evidence.equityTradableFactGate, "PASS");
  assert.equal(evidence.fullMultiAssetGate, "BLOCKED");
  assert.equal(evidence.status, "TEST_ONLY_NOT_LIVE_EVIDENCE");
  assert.deepEqual(evidence.reasonCodes, ["live_upstream_evidence_missing"]);
  assert.equal(evidence.candidateAuthorityGranted, false);
  assert.equal(evidence.readyAuthorityGranted, false);
});

test("allows a no-authority live PASS only after all independent axes pass", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const evidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: binding,
    cycles: cycles({ binding }),
    evaluatedAt: "2026-07-26T02:31:00.000Z",
  });
  assert.equal(evidence.baseCollectionGate, "PASS");
  assert.equal(evidence.equityTradableFactGate, "PASS");
  assert.equal(evidence.fullMultiAssetGate, "PASS");
  assert.equal(
    evidence.status,
    "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY",
  );
  assert.equal(evidence.observationMs, 1_800_000);
  assert.equal(evidence.cycleCount, 31);
  assert.equal(evidence.productionChanged, false);
  assert.equal(
    M1MultiAssetShadowEvidenceSchema.parse(evidence).contentHash,
    evidence.contentHash,
  );
});

test("reports live equity absence as a blocker rather than a partial success", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const evidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: binding,
    cycles: cycles({ binding, equityFacts: false }),
    evaluatedAt: "2026-07-26T02:31:00.000Z",
  });
  assert.equal(evidence.baseCollectionGate, "PASS");
  assert.equal(evidence.equityTradableFactGate, "BLOCKED");
  assert.equal(evidence.fullMultiAssetGate, "BLOCKED");
  assert.equal(
    evidence.status,
    "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS",
  );
  assert.deepEqual(evidence.reasonCodes, ["equity_tradable_fact_missing"]);
});

test("rejects stitched worker runs and runtime configurations", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const stitched = cycles({
    binding,
    mutate: (value, index) =>
      index === 16
        ? { ...value, workerRunId: "stitched-run" }
        : value,
  });
  assert.throws(
    () => buildM1MultiAssetShadowEvidence({
      upstreamBinding: binding,
      cycles: stitched,
      evaluatedAt: "2026-07-26T02:31:00.000Z",
    }),
    /stitched, overlapping, non-contiguous/u,
  );
});

test("rejects a cadence gap even when all individual cycles are valid", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const gapped = cycles({
    binding,
    mutate: (value, index) =>
      index === 20
        ? cycleInput({
            index,
            binding,
            scheduledOffsetMs: 1_000,
          })
        : value,
  });
  assert.throws(
    () => buildM1MultiAssetShadowEvidence({
      upstreamBinding: binding,
      cycles: gapped,
      evaluatedAt: "2026-07-26T02:31:00.000Z",
    }),
    /stitched, overlapping, non-contiguous/u,
  );
});

test("blocks a live package when the frozen runtime SLO is exceeded", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const slow = cycles({
    binding,
    mutate: (value, index) =>
      index === 8
        ? cycleInput({
            index,
            binding,
            durationMs: 30_001,
          })
        : value,
  });
  const evidence = buildM1MultiAssetShadowEvidence({
    upstreamBinding: binding,
    cycles: slow,
    evaluatedAt: "2026-07-26T02:31:00.000Z",
  });
  assert.equal(evidence.baseCollectionGate, "BLOCKED");
  assert.equal(
    evidence.status,
    "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION",
  );
});

test("rejects a blocked live upstream even with a recomputed content hash", () => {
  const valid = upstreamBinding("LIVE_READ_ONLY");
  const core = Object.fromEntries(
    Object.entries(valid).filter(
      ([key]) => key !== "upstreamBindingId" && key !== "contentHash",
    ),
  );
  const blockedCore = {
    ...core,
    runtimeAdapterStatus:
      "BLOCKED_ROUTE_SEGMENT_NO_STALE_PROMOTION" as const,
  };
  const contentHash = stableContentHash(blockedCore);
  assert.throws(
    () => M1MultiAssetShadowUpstreamBindingSchema.parse({
      ...blockedCore,
      upstreamBindingId:
        `m1-shadow-upstream:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
    /cannot promote blocked or mixed evidence/u,
  );
});
