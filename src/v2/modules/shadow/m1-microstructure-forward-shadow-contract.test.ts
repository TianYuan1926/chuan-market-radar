import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_MICROSTRUCTURE_FACT_TYPES,
} from "../microstructure/m1-microstructure-contract";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  M1_MICROSTRUCTURE_FORWARD_COLLECTION_TIER,
  M1MicrostructureForwardEvidenceSchema,
  buildM1MicrostructureForwardCycle,
  buildM1MicrostructureForwardEvidence,
  buildM1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardCycleInput,
  type M1MicrostructureForwardHostRecovery,
  type M1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardSelectionPlanInput,
} from "./m1-microstructure-forward-shadow-contract";

const RELEASE = "a".repeat(40);
const CONFIG_DIGEST =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BASE_TIME = Date.parse("2026-07-26T03:00:00.000Z");

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
    generatedAt: "2026-07-26T02:57:00.000Z",
    sourceCutoff: "2026-07-26T02:56:59.000Z",
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

function multiAssetEvidence(input: {
  binding: M1MultiAssetShadowUpstreamBinding;
  fullPass?: boolean;
}): M1MultiAssetShadowEvidence {
  const live = input.binding.evidenceClass === "LIVE_READ_ONLY";
  const fullPass = input.fullPass ?? true;
  const axisPassCycleCounts = {
    BITGET_VENUE: 31,
    LISTING_LIFECYCLE: 31,
    EQUITY_ASSET_DOMAIN: fullPass ? 31 : 0,
    DATA_MAXIMIZATION: 31,
  };
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    evaluatedAt: "2026-07-26T03:31:00.000Z",
    upstreamBindingId: input.binding.upstreamBindingId,
    upstreamBindingHash: input.binding.contentHash,
    evidenceClass: input.binding.evidenceClass,
    networkEnvironment: input.binding.networkEnvironment,
    workerRunId: "m1-5c-fixture-run",
    runtimeConfigDigest: CONFIG_DIGEST,
    cycleCount: 31 as const,
    observationMs: 1_800_000,
    cycleIds: Array.from(
      { length: 31 },
      (_, index) => `m1-5c-cycle-${index + 1}`,
    ),
    cycleContentHashes: Array.from(
      { length: 31 },
      (_, index) => digest(((index % 9) + 1).toString()),
    ),
    minimumCollectionCoverageRatio: 1,
    minimumFreshCoverageRatio: 1,
    maximumCycleDurationMs: 2_000,
    maximumScheduleLagMs: 100,
    maximumRssBytes: 256 * 1024 * 1024,
    providerFailureCount: 0,
    missedScheduleStartCount: 0,
    committedCheckpointCycleCount: 31,
    committedPersistenceCycleCount: 31,
    axisPassCycleCounts,
    baseCollectionGate: "PASS" as const,
    equityTradableFactGate: fullPass ? "PASS" as const : "BLOCKED" as const,
    fullMultiAssetGate:
      live && fullPass ? "PASS" as const : "BLOCKED" as const,
    status: !live
      ? "TEST_ONLY_NOT_LIVE_EVIDENCE" as const
      : fullPass
        ? "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY" as const
        : "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS" as const,
    reasonCodes: !live
      ? ["live_upstream_evidence_missing"]
      : fullPass
        ? []
        : ["equity_tradable_fact_missing"],
    rawBodyRetained: false as const,
    secretMaterialPresent: false as const,
    runtimeAuthorityGranted: false as const,
    factAuthorityGranted: false as const,
    candidateAuthorityGranted: false as const,
    strategyAuthorityGranted: false as const,
    readyAuthorityGranted: false as const,
    automaticTradingAllowed: false as const,
    productionChanged: false as const,
  };
  const contentHash = stableContentHash(core);
  return M1MultiAssetShadowEvidenceSchema.parse({
    ...core,
    evidenceId:
      `m1-multi-asset-shadow-evidence:${contentHash.slice(7, 31)}`,
    contentHash,
  });
}

function planInput(
  binding: M1MultiAssetShadowUpstreamBinding,
): M1MicrostructureForwardSelectionPlanInput {
  const pairs = M1_VENUE_SOURCE_IDS.map((venue, index) => {
    const selectedAt = "2026-07-26T02:58:30.000Z";
    const subjectBase = {
      venue,
      assetDomain: "CRYPTO_LINEAR_PERPETUAL" as const,
      lifecycleState: "ESTABLISHED" as const,
      listingEpoch: `listing:${venue}:v1`,
      identityEpoch: `identity:${venue}:v1`,
      regime: "TRANSITION" as const,
      liquiditySegment: "MEDIUM" as const,
      selectedAt,
    };
    return {
      pairId: `pair-${venue}`,
      hypothesisFamily: [
        "COMPRESSION_ENERGY",
        "QUIET_ACCUMULATION_DISTRIBUTION",
        "FLOW_PRICE_DIVERGENCE_ABSORPTION",
        "LIQUIDITY_SHIFT",
      ][index] as
        | "COMPRESSION_ENERGY"
        | "QUIET_ACCUMULATION_DISTRIBUTION"
        | "FLOW_PRICE_DIVERGENCE_ABSORPTION"
        | "LIQUIDITY_SHIFT",
      hypothesisDirection: index % 2 === 0 ? "LONG" as const : "SHORT" as const,
      trigger: {
        ...subjectBase,
        subjectId: `trigger-${venue}`,
        canonicalInstrumentId: `scope-v2:${venue}:trigger`,
        venueInstrumentId: `TRIGGER-${index}`,
        featureSnapshotId: `feature:trigger:${venue}`,
        featureSnapshotHash: digest("5"),
      },
      matchedControl: {
        ...subjectBase,
        subjectId: `control-${venue}`,
        canonicalInstrumentId: `scope-v2:${venue}:control`,
        venueInstrumentId: `CONTROL-${index}`,
        featureSnapshotId: `feature:control:${venue}`,
        featureSnapshotHash: digest("6"),
      },
      matchingPolicy:
        "SAME_VENUE_DOMAIN_LIFECYCLE_REGIME_LIQUIDITY_POINT_IN_TIME" as const,
      outcomeKnownAtSelection: false as const,
      candidateEpisodeUsedForSelection: false as const,
    };
  });
  return {
    releaseId: RELEASE,
    upstreamBindingId: binding.upstreamBindingId,
    upstreamBindingHash: binding.contentHash,
    generatedAt: "2026-07-26T02:58:00.000Z",
    selectionCutoff: "2026-07-26T02:59:00.000Z",
    windowStartsAt: "2026-07-26T03:00:00.000Z",
    windowEndsAt: "2026-07-26T03:31:00.000Z",
    universeSnapshotId: "universe:scope-v2:20260726t025800z",
    universeSnapshotHash: digest("7"),
    rotationOrdinal: 17,
    deterministicSeedHash: digest("8"),
    selectionAlgorithm:
      "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
    pairs: [...pairs].reverse(),
    outcomeFieldsRead: false,
    futureDataRead: false,
    candidateStoreRead: false,
    automaticSelectionWeightMutationAllowed: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
  };
}

function coverageCells(
  plan: M1MicrostructureForwardSelectionPlan,
  mutate?: (
    cell: M1MicrostructureForwardCycleInput["coverageCells"][number],
  ) => M1MicrostructureForwardCycleInput["coverageCells"][number],
) {
  const cells = plan.pairs.flatMap((pair) =>
    ([
      ["RESEARCH_TRIGGER", pair.trigger] as const,
      ["MATCHED_CONTROL", pair.matchedControl] as const,
    ]).flatMap(([selectionRole, subject]) =>
      M1_MICROSTRUCTURE_FACT_TYPES.map((factType) => {
        const observedEmpty = factType === "LIQUIDATION_EVENT";
        const cell = {
          pairId: pair.pairId,
          selectionRole,
          subjectId: subject.subjectId,
          venue: subject.venue,
          factType,
          collectionTier: M1_MICROSTRUCTURE_FORWARD_COLLECTION_TIER[factType],
          disposition: observedEmpty
            ? "OBSERVED_EMPTY" as const
            : "OBSERVED_NONEMPTY" as const,
          attemptCount: 1,
          heartbeatObserved: true,
          recordCount: observedEmpty ? 0 : 10,
          freshRecordCount: observedEmpty ? 0 : 10,
          partialRecordCount: 0,
          staleRecordCount: 0,
          persistedRecordCount: observedEmpty ? 0 : 10,
          sequenceGapCount: 0,
          resyncCount: 0,
          outOfOrderCount: 0,
          droppedEventCount: 0,
          lateEventCount: 0,
          eventLatencyP95Ms: observedEmpty ? null : 125,
          bytesReceived: observedEmpty ? 0 : 1_000,
          compressedBytes: observedEmpty ? 0 : 500,
          reasonCodes: [],
        };
        return mutate?.(cell) ?? cell;
      })
    )
  );
  return [...cells].reverse();
}

function forwardCycleInput(input: {
  plan: M1MicrostructureForwardSelectionPlan;
  index: number;
  mutateCell?: (
    cell: M1MicrostructureForwardCycleInput["coverageCells"][number],
  ) => M1MicrostructureForwardCycleInput["coverageCells"][number];
  workerRunId?: string;
  scheduledOffsetMs?: number;
}): M1MicrostructureForwardCycleInput {
  const scheduledAt =
    BASE_TIME +
    (input.index - 1) * 60_000 +
    (input.scheduledOffsetMs ?? 0);
  const startedAt = scheduledAt + 100;
  const completedAt = startedAt + 2_000;
  const cells = coverageCells(input.plan, input.mutateCell);
  const rawPayloadBytes = cells.reduce(
    (total, cell) => total + cell.bytesReceived,
    0,
  );
  const compressedPayloadBytes = cells.reduce(
    (total, cell) => total + cell.compressedBytes,
    0,
  );
  const persistedRows = cells.reduce(
    (total, cell) => total + cell.persistedRecordCount,
    0,
  );
  return {
    releaseId: RELEASE,
    upstreamBindingId: input.plan.upstreamBindingId,
    upstreamBindingHash: input.plan.upstreamBindingHash,
    planId: input.plan.planId,
    planHash: input.plan.contentHash,
    workerRunId: input.workerRunId ?? "m1-5d-fixture-run",
    runtimeConfigDigest: CONFIG_DIGEST,
    cycleIndex: input.index,
    scheduledAt: iso(scheduledAt),
    startedAt: iso(startedAt),
    sourceCutoff: iso(startedAt + 1_000),
    completedAt: iso(completedAt),
    scheduleLagMs: 100,
    durationMs: 2_000,
    missedScheduleStarts: 0,
    coverageCells: cells,
    resources: {
      redisReadBytes: 10_000,
      redisWriteBytes: 5_000,
      redisPeakUsedBytes: 64 * 1024 * 1024,
      redisConfiguredMaxBytes: 256 * 1024 * 1024,
      postgresInsertedRows: persistedRows,
      postgresWriteBytes: compressedPayloadBytes,
      postgresWalBytes: compressedPayloadBytes * 2,
      cosObjectCount: 1,
      cosWriteBytes: compressedPayloadBytes,
      networkIngressBytes: rawPayloadBytes,
      networkEgressBytes: 1_000,
      rawPayloadBytes,
      compressedPayloadBytes,
      persistedPayloadBytes: compressedPayloadBytes,
      cpuP95Percent: 35,
      rssBytes: 300 * 1024 * 1024,
      diskFreeBytesBefore: 20 * 1024 * 1024 * 1024,
      diskFreeBytesAfter: 20 * 1024 * 1024 * 1024 - compressedPayloadBytes,
    },
    rawBodyRetained: false,
    secretMaterialPresent: false,
    runtimeAuthorityGranted: false,
    factAuthorityGranted: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    capacityAuthorityGranted: false,
    productionChanged: false,
  };
}

function forwardCycles(input: {
  plan: M1MicrostructureForwardSelectionPlan;
  mutateCell?: (
    cell: M1MicrostructureForwardCycleInput["coverageCells"][number],
    cycleIndex: number,
  ) => M1MicrostructureForwardCycleInput["coverageCells"][number];
  mutateInput?: (
    cycle: M1MicrostructureForwardCycleInput,
    cycleIndex: number,
  ) => M1MicrostructureForwardCycleInput;
}) {
  return Array.from({ length: 31 }, (_, offset) => {
    const cycleIndex = offset + 1;
    const cycle = forwardCycleInput({
      plan: input.plan,
      index: cycleIndex,
      mutateCell: input.mutateCell === undefined
        ? undefined
        : (cell) => input.mutateCell!(cell, cycleIndex),
    });
    return buildM1MicrostructureForwardCycle({
      plan: input.plan,
      cycle: input.mutateInput?.(cycle, cycleIndex) ?? cycle,
    });
  });
}

function hostRecovery(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY",
  exact = true,
): M1MicrostructureForwardHostRecovery {
  if (evidenceClass === "TEST_ONLY") {
    return {
      status: "NOT_EXECUTED_TEST_ONLY",
      topologyBeforeHash: digest("1"),
      topologyAfterHash: digest("2"),
      nonTargetServiceCountBefore: 11,
      nonTargetServiceCountAfter: 11,
      temporaryContainerCountAfter: 0,
      temporaryNetworkCountAfter: 0,
      temporaryVolumeCountAfter: 0,
      stagingPathCountAfter: 0,
      productionChanged: false,
      reasonCodes: ["test_only_no_host_recovery"],
    };
  }
  return {
    status: exact ? "RESTORED_EXACT" : "FAILED",
    topologyBeforeHash: digest("3"),
    topologyAfterHash: exact ? digest("3") : digest("4"),
    nonTargetServiceCountBefore: 11,
    nonTargetServiceCountAfter: 11,
    temporaryContainerCountAfter: exact ? 0 : 1,
    temporaryNetworkCountAfter: 0,
    temporaryVolumeCountAfter: 0,
    stagingPathCountAfter: 0,
    productionChanged: false,
    reasonCodes: exact ? [] : ["temporary_container_remains"],
  };
}

test("freezes a deterministic pre-window matched-control plan across all four Venues", () => {
  const binding = upstreamBinding();
  const first = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const second = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: {
      ...planInput(binding),
      pairs: [...planInput(binding).pairs].reverse(),
    },
  });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.pairCount, 4);
  assert.deepEqual(first.venuePairCounts, {
    BINANCE_FUTURES: 1,
    OKX_SWAP: 1,
    BYBIT_DERIVATIVES: 1,
    BITGET_FUTURES: 1,
  });
  assert.equal(first.outcomeFieldsRead, false);
  assert.equal(first.candidateStoreRead, false);
  assert.equal(Object.isFrozen(first), true);
});

test("rejects selection after the frozen point-in-time cutoff", () => {
  const binding = upstreamBinding();
  const input = planInput(binding);
  const firstPair = input.pairs[0]!;
  assert.throws(
    () => buildM1MicrostructureForwardSelectionPlan({
      upstreamBinding: binding,
      plan: {
        ...input,
        pairs: [{
          ...firstPair,
          trigger: {
            ...firstPair.trigger,
            selectedAt: "2026-07-26T02:59:30.000Z",
          },
          matchedControl: {
            ...firstPair.matchedControl,
            selectedAt: "2026-07-26T02:59:30.000Z",
          },
        }, ...input.pairs.slice(1)],
      },
    }),
    /post-cutoff knowledge/u,
  );
});

test("rejects a control matched from a different liquidity segment", () => {
  const binding = upstreamBinding();
  const input = planInput(binding);
  const firstPair = input.pairs[0]!;
  assert.throws(
    () => buildM1MicrostructureForwardSelectionPlan({
      upstreamBinding: binding,
      plan: {
        ...input,
        pairs: [{
          ...firstPair,
          matchedControl: {
            ...firstPair.matchedControl,
            liquiditySegment: "THIN",
          },
        }, ...input.pairs.slice(1)],
      },
    }),
    /matched-control liquiditySegment/u,
  );
});

test("accounts for every pair-role-fact cell and treats healthy empty events honestly", () => {
  const binding = upstreamBinding();
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const cycle = buildM1MicrostructureForwardCycle({
    plan,
    cycle: forwardCycleInput({ plan, index: 1 }),
  });
  assert.equal(cycle.expectedCoverageCellCount, 48);
  assert.equal(cycle.observedEmptyCellCount, 8);
  assert.equal(cycle.observedNonemptyCellCount, 40);
  assert.equal(cycle.unavailableCellCount, 0);
  assert.equal(cycle.captureQualityGate, "PASS");
  assert.equal(cycle.candidateAuthorityGranted, false);
});

test("rejects a missing fact family cell instead of shrinking coverage", () => {
  const binding = upstreamBinding();
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const input = forwardCycleInput({ plan, index: 1 });
  const shortened = {
    ...input,
    coverageCells: input.coverageCells.slice(1),
  };
  const persistedRows = shortened.coverageCells.reduce(
    (total, cell) => total + cell.persistedRecordCount,
    0,
  );
  const raw = shortened.coverageCells.reduce(
    (total, cell) => total + cell.bytesReceived,
    0,
  );
  const compressed = shortened.coverageCells.reduce(
    (total, cell) => total + cell.compressedBytes,
    0,
  );
  assert.throws(
    () => buildM1MicrostructureForwardCycle({
      plan,
      cycle: {
        ...shortened,
        resources: {
          ...shortened.resources,
          postgresInsertedRows: persistedRows,
          rawPayloadBytes: raw,
          compressedPayloadBytes: compressed,
          persistedPayloadBytes: compressed,
        },
      },
    }),
    /exact pair-role-subject-fact denominator/u,
  );
});

test("distinguishes unavailable from observed-empty and blocks the cycle", () => {
  const binding = upstreamBinding();
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  let changed = false;
  const cycle = buildM1MicrostructureForwardCycle({
    plan,
    cycle: forwardCycleInput({
      plan,
      index: 1,
      mutateCell: (cell) => {
        if (changed || cell.factType !== "LIQUIDATION_EVENT") return cell;
        changed = true;
        return {
          ...cell,
          disposition: "UNAVAILABLE",
          heartbeatObserved: false,
          reasonCodes: ["provider_unavailable"],
        };
      },
    }),
  });
  assert.equal(cycle.observedEmptyCellCount, 7);
  assert.equal(cycle.unavailableCellCount, 1);
  assert.equal(cycle.captureQualityGate, "BLOCKED");
});

test("rejects resource evidence that does not reconcile to captured facts", () => {
  const binding = upstreamBinding();
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const input = forwardCycleInput({ plan, index: 1 });
  assert.throws(
    () => buildM1MicrostructureForwardCycle({
      plan,
      cycle: {
        ...input,
        resources: {
          ...input.resources,
          rawPayloadBytes: input.resources.rawPayloadBytes + 1,
        },
      },
    }),
    /resource evidence must reconcile/u,
  );
});

test("keeps complete local fixtures test-only with no Candidate or capacity authority", () => {
  const binding = upstreamBinding("TEST_ONLY");
  const multiAsset = multiAssetEvidence({ binding });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles: forwardCycles({ plan }),
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("TEST_ONLY"),
  });
  assert.equal(evidence.captureQualityGate, "PASS");
  assert.equal(evidence.releaseAdmissionGate, "BLOCKED");
  assert.equal(evidence.status, "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE");
  assert.equal(evidence.candidateAuthorityGranted, false);
  assert.equal(evidence.capacityAuthorityGranted, false);
});

test("blocks an all-empty healthy transport run instead of accepting an empty shell", () => {
  const binding = upstreamBinding("TEST_ONLY");
  const selectionPlan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const cycles = forwardCycles({
    plan: selectionPlan,
    mutateCell: (cell) => ({
      ...cell,
      disposition: "OBSERVED_EMPTY",
      recordCount: 0,
      freshRecordCount: 0,
      partialRecordCount: 0,
      staleRecordCount: 0,
      persistedRecordCount: 0,
      eventLatencyP95Ms: null,
      bytesReceived: 0,
      compressedBytes: 0,
    }),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAssetEvidence({
      binding,
      fullPass: true,
    }),
    plan: selectionPlan,
    cycles,
    evaluatedAt: "2026-07-26T03:32:00.000Z",
    hostRecovery: hostRecovery("TEST_ONLY"),
  });
  assert.equal(evidence.captureQualityGate, "BLOCKED");
  assert.equal(evidence.observedRequiredNonemptySubjectFactCount, 0);
  assert.equal(evidence.expectedRequiredNonemptySubjectFactCount, 40);
  assert.ok(Object.values(evidence.venueFactFamilyPass).every((pass) => !pass));
});

test("allows live no-authority PASS only with full upstream, quality and exact recovery", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles: forwardCycles({ plan }),
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("LIVE_READ_ONLY"),
  });
  assert.equal(evidence.captureQualityGate, "PASS");
  assert.equal(evidence.upstreamMultiAssetGate, "PASS");
  assert.equal(evidence.resourceEvidenceGate, "PASS");
  assert.equal(evidence.releaseAdmissionGate, "PASS");
  assert.equal(
    evidence.status,
    "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY",
  );
  assert.equal(evidence.matchedControlCoverageRatio, 1);
  assert.equal(evidence.observationMs, 1_800_000);
  assert.equal(evidence.productionChanged, false);
});

test("keeps M1.5D capture truth separate when the M1.5C multi-asset Gate is blocked", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding, fullPass: false });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles: forwardCycles({ plan }),
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("LIVE_READ_ONLY"),
  });
  assert.equal(evidence.captureQualityGate, "PASS");
  assert.equal(evidence.upstreamMultiAssetGate, "BLOCKED");
  assert.equal(evidence.releaseAdmissionGate, "BLOCKED");
  assert.equal(evidence.status, "BLOCKED_UPSTREAM_MULTI_ASSET_GATE");
});

test("blocks forward evidence on a single sequence gap without hiding other cells", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  let changed = false;
  const cycles = forwardCycles({
    plan,
    mutateCell: (cell, cycleIndex) => {
      if (
        changed ||
        cycleIndex !== 7 ||
        cell.factType !== "ORDER_BOOK_DELTA"
      ) {
        return cell;
      }
      changed = true;
      return {
        ...cell,
        sequenceGapCount: 1,
        resyncCount: 1,
        reasonCodes: ["sequence_gap_resynced"],
      };
    },
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles,
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("LIVE_READ_ONLY"),
  });
  assert.equal(evidence.sequenceGapCount, 1);
  assert.equal(evidence.captureQualityGate, "BLOCKED");
  assert.equal(evidence.status, "BLOCKED_FORWARD_COVERAGE_OR_QUALITY");
});

test("blocks live evidence when isolated host topology is not restored exactly", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles: forwardCycles({ plan }),
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("LIVE_READ_ONLY", false),
  });
  assert.equal(evidence.captureQualityGate, "PASS");
  assert.equal(evidence.resourceEvidenceGate, "BLOCKED");
  assert.equal(evidence.status, "BLOCKED_HOST_RECOVERY");
});

test("rejects stitched forward runs even when every cycle hash is valid", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const cycles = forwardCycles({
    plan,
    mutateInput: (cycle, cycleIndex) =>
      cycleIndex === 15
        ? { ...cycle, workerRunId: "stitched-forward-run" }
        : cycle,
  });
  assert.throws(
    () => buildM1MicrostructureForwardEvidence({
      upstreamBinding: binding,
      multiAssetShadowEvidence: multiAsset,
      plan,
      cycles,
      evaluatedAt: "2026-07-26T03:31:10.000Z",
      hostRecovery: hostRecovery("LIVE_READ_ONLY"),
    }),
    /stitched, overlapping, non-contiguous/u,
  );
});

test("strict plan input rejects outcome material and Candidate shortcuts", () => {
  const binding = upstreamBinding();
  const input = planInput(binding);
  assert.throws(
    () => buildM1MicrostructureForwardSelectionPlan({
      upstreamBinding: binding,
      plan: {
        ...input,
        outcomeClass: "UP_EXPANSION",
      } as M1MicrostructureForwardSelectionPlanInput,
    }),
    /Unrecognized key/u,
  );
});

test("evidence schema rejects a recomputed false PASS conclusion", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const multiAsset = multiAssetEvidence({ binding, fullPass: false });
  const plan = buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: binding,
    plan: planInput(binding),
  });
  const evidence = buildM1MicrostructureForwardEvidence({
    upstreamBinding: binding,
    multiAssetShadowEvidence: multiAsset,
    plan,
    cycles: forwardCycles({ plan }),
    evaluatedAt: "2026-07-26T03:31:10.000Z",
    hostRecovery: hostRecovery("LIVE_READ_ONLY"),
  });
  const core = Object.fromEntries(
    Object.entries(evidence).filter(
      ([key]) => key !== "evidenceId" && key !== "contentHash",
    ),
  );
  const forgedCore = {
    ...core,
    releaseAdmissionGate: "PASS" as const,
    status: "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY" as const,
  };
  const contentHash = stableContentHash(forgedCore);
  assert.throws(
    () => M1MicrostructureForwardEvidenceSchema.parse({
      ...forgedCore,
      evidenceId:
        `m1-micro-forward-evidence:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
    /Gate or status overstates observed metrics/u,
  );
});
