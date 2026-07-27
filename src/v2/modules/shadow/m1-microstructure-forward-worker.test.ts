import assert from "node:assert/strict";
import {
  appendFile,
  mkdtemp,
  realpath,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  buildM1ExpandedShadowProviderPlan,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderObservation,
  type M1ShadowProviderSubject,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  buildM1ShadowStoreAuditReceipt,
  type M1ShadowObservationStore,
  type M1ShadowPersistenceReceipt,
} from "./m1-expanded-shadow-store";
import {
  verifyM1MicrostructureForwardCaptureStore,
  verifyM1MicrostructureForwardEvidenceStore,
} from "./m1-microstructure-forward-evidence-verifier";
import {
  captureM1MicrostructureForwardWorker,
  finalizeM1MicrostructureForwardWorker,
  type M1MicrostructureForwardTransport,
} from "./m1-microstructure-forward-worker";
import {
  buildM1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardSelectionPlan,
} from "./m1-microstructure-forward-shadow-contract";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowEvidenceSchema,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowEvidence,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

const RELEASE = "9".repeat(40);
const START_MS = Date.parse("2026-07-27T04:00:00.000Z");

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
    generatedAt: "2026-07-27T03:57:00.000Z",
    sourceCutoff: "2026-07-27T03:56:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:worker-fixture",
    runtimeAdapterArtifactHash: digest("1"),
    conformanceArtifactId: "source-conformance:worker-fixture",
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

function multiAssetEvidence(
  upstream: M1MultiAssetShadowUpstreamBinding,
): M1MultiAssetShadowEvidence {
  const live = upstream.evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_EVIDENCE_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    evaluatedAt: "2026-07-27T03:58:00.000Z",
    upstreamBindingId: upstream.upstreamBindingId,
    upstreamBindingHash: upstream.contentHash,
    evidenceClass: upstream.evidenceClass,
    networkEnvironment: upstream.networkEnvironment,
    workerRunId: "m1-5c-worker-fixture",
    runtimeConfigDigest: digest("a"),
    cycleCount: 31 as const,
    observationMs: 1_800_000,
    cycleIds: Array.from(
      { length: 31 },
      (_, index) => `m1-5c-worker-fixture:${index + 1}`,
    ),
    cycleContentHashes: Array.from(
      { length: 31 },
      (_, index) => digest(String(index % 9 + 1)),
    ),
    minimumCollectionCoverageRatio: 1,
    minimumFreshCoverageRatio: 1,
    maximumCycleDurationMs: 2_000,
    maximumScheduleLagMs: 100,
    maximumRssBytes: 128 * 1024 * 1024,
    providerFailureCount: 0,
    missedScheduleStartCount: 0,
    committedCheckpointCycleCount: 31,
    committedPersistenceCycleCount: 31,
    axisPassCycleCounts: {
      BITGET_VENUE: 31,
      LISTING_LIFECYCLE: 31,
      EQUITY_ASSET_DOMAIN: 31,
      DATA_MAXIMIZATION: 31,
    },
    baseCollectionGate: "PASS" as const,
    equityTradableFactGate: "PASS" as const,
    fullMultiAssetGate: live ? "PASS" as const : "BLOCKED" as const,
    status: live
      ? "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY" as const
      : "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
    reasonCodes: live ? [] : ["live_upstream_evidence_missing"],
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

type FixtureSymbol = readonly [
  venueInstrumentId: string,
  referenceInstrumentId: string | null,
  instrumentFamily: string | null,
  sizeUnit: "BASE_ASSET" | "CONTRACT",
];

const SYMBOLS = {
  BINANCE_FUTURES: [
    ["BTCUSDT", null, null, "BASE_ASSET"],
    ["ETHUSDT", null, null, "BASE_ASSET"],
  ],
  OKX_SWAP: [
    ["BTC-USDT-SWAP", "BTC-USDT", "BTC-USDT", "CONTRACT"],
    ["ETH-USDT-SWAP", "ETH-USDT", "ETH-USDT", "CONTRACT"],
  ],
  BYBIT_DERIVATIVES: [
    ["SOLUSDT", null, null, "BASE_ASSET"],
    ["XRPUSDT", null, null, "BASE_ASSET"],
  ],
  BITGET_FUTURES: [
    ["DOGEUSDT", null, null, "BASE_ASSET"],
    ["ADAUSDT", null, null, "BASE_ASSET"],
  ],
} as const satisfies Record<
  (typeof M1_VENUE_SOURCE_IDS)[number],
  readonly [FixtureSymbol, FixtureSymbol]
>;

function selectionPlan(
  upstream: M1MultiAssetShadowUpstreamBinding,
): M1MicrostructureForwardSelectionPlan {
  return buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: upstream,
    plan: {
      releaseId: RELEASE,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      generatedAt: "2026-07-27T03:58:00.000Z",
      selectionCutoff: "2026-07-27T03:59:00.000Z",
      windowStartsAt: "2026-07-27T04:00:00.000Z",
      windowEndsAt: "2026-07-27T04:31:00.000Z",
      universeSnapshotId: "universe:m1-5d-worker-fixture",
      universeSnapshotHash: digest("b"),
      rotationOrdinal: 1,
      deterministicSeedHash: digest("c"),
      selectionAlgorithm:
        "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
      pairs: M1_VENUE_SOURCE_IDS.map((venue, venueIndex) => {
        const [triggerSymbol, controlSymbol] = SYMBOLS[venue];
        const subject = (
          role: "trigger" | "control",
          symbol: FixtureSymbol,
        ) => ({
          subjectId: `${role}-${venue}`,
          venue,
          assetDomain: "CRYPTO_LINEAR_PERPETUAL" as const,
          lifecycleState: "ESTABLISHED" as const,
          canonicalInstrumentId: `scope-v2:${venue}:${role}:${symbol[0]}`,
          venueInstrumentId: symbol[0],
          listingEpoch: `listing:${venue}:${symbol[0]}`,
          identityEpoch: `identity:${venue}:${symbol[0]}`,
          regime: "TRANSITION" as const,
          liquiditySegment: "MEDIUM" as const,
          featureSnapshotId: `feature:${venue}:${role}:${symbol[0]}`,
          featureSnapshotHash: role === "trigger" ? digest("d") : digest("e"),
          selectedAt: "2026-07-27T03:58:30.000Z",
        });
        return {
          pairId: `pair-${venue}`,
          hypothesisFamily: [
            "COMPRESSION_ENERGY",
            "QUIET_ACCUMULATION_DISTRIBUTION",
            "FLOW_PRICE_DIVERGENCE_ABSORPTION",
            "LIQUIDITY_SHIFT",
          ][venueIndex] as
            | "COMPRESSION_ENERGY"
            | "QUIET_ACCUMULATION_DISTRIBUTION"
            | "FLOW_PRICE_DIVERGENCE_ABSORPTION"
            | "LIQUIDITY_SHIFT",
          hypothesisDirection:
            venueIndex % 2 === 0 ? "LONG" as const : "SHORT" as const,
          trigger: subject("trigger", triggerSymbol),
          matchedControl: subject("control", controlSymbol),
          matchingPolicy:
            "SAME_VENUE_DOMAIN_LIFECYCLE_REGIME_LIQUIDITY_POINT_IN_TIME" as const,
          outcomeKnownAtSelection: false as const,
          candidateEpisodeUsedForSelection: false as const,
        };
      }),
      outcomeFieldsRead: false,
      futureDataRead: false,
      candidateStoreRead: false,
      automaticSelectionWeightMutationAllowed: false,
      candidateAuthorityGranted: false,
      strategyAuthorityGranted: false,
      readyAuthorityGranted: false,
    },
  });
}

function providerPlan(
  selection: M1MicrostructureForwardSelectionPlan,
): M1ExpandedShadowProviderPlan {
  const subjects = selection.pairs.flatMap((pair) =>
    [pair.trigger, pair.matchedControl].map((selected) => {
      const symbol = SYMBOLS[selected.venue].find(
        (candidate) => candidate[0] === selected.venueInstrumentId,
      )!;
      return {
        subjectId: selected.subjectId,
        venue: selected.venue,
        venueInstrumentId: selected.venueInstrumentId,
        transportSymbol: symbol[0],
        referenceInstrumentId: symbol[1],
        instrumentFamily: symbol[2],
        sizeUnit: symbol[3],
      } as M1ShadowProviderSubject;
    })
  );
  return buildM1ExpandedShadowProviderPlan({
    releaseId: RELEASE,
    generatedAt: "2026-07-27T03:59:00.000Z",
    subjects,
  });
}

class EmptyStore implements M1ShadowObservationStore {
  initialized = false;
  readonly records: Array<{
    workerRunId: string;
    cycleIndex: number;
    observationId: string;
    contentHash: string;
    compressedBytes: number;
  }> = [];

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async persistBatch(input: {
    readonly workerRunId: string;
    readonly cycleIndex: number;
    readonly observations: readonly M1ShadowProviderObservation[];
  }): Promise<M1ShadowPersistenceReceipt> {
    if (!this.initialized) throw new Error("fixture_store_not_initialized");
    const records = input.observations.map((observation) => {
      this.records.push({
        workerRunId: input.workerRunId,
        cycleIndex: input.cycleIndex,
        observationId: observation.observationId,
        contentHash: observation.contentHash,
        compressedBytes: 10,
      });
      return {
        observationId: observation.observationId,
        compressedBytes: 10,
        persistedBytes: 10,
      };
    });
    return {
      records,
      insertedRows: records.length,
      postgresWriteBytes: records.length * 10,
      postgresWalBytes: records.length * 20,
    };
  }

  async countRunRows(workerRunId: string): Promise<number> {
    return this.records.filter((record) =>
      record.workerRunId === workerRunId
    ).length;
  }

  async auditRun(workerRunId: string, auditedAt: string) {
    return buildM1ShadowStoreAuditReceipt({
      workerRunId,
      auditedAt,
      records: this.records
        .filter((record) => record.workerRunId === workerRunId)
        .map((record) => ({
          cycleIndex: record.cycleIndex,
          observationId: record.observationId,
          contentHash: record.contentHash,
          compressedBytes: record.compressedBytes,
        })),
    });
  }
}

class EmptyHealthyTransport implements M1MicrostructureForwardTransport {
  started = false;

  constructor(readonly plan: M1ExpandedShadowProviderPlan) {}

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  setCaptureWindow(): void {}

  clearCaptureWindow(): void {}

  drainFrames() {
    return [];
  }

  consumeTransportFailures() {
    return [];
  }

  consumeConnectionCycleEvidence() {
    return this.plan.connections.map((connection) => ({
      role: connection.role,
      attemptObserved: true,
      heartbeatObserved: true,
      networkEgressBytes: 0,
      reasonCodes: [],
    }));
  }

  async captureRestSnapshots() {
    return this.plan.restSnapshots.map((request) => ({
      requestId: request.requestId,
      responseObserved: true,
      networkEgressBytes: 0,
      frame: null,
      failureReasonCode: null,
    }));
  }
}

function resources() {
  return {
    redisReadBytes: 0,
    redisWriteBytes: 0,
    redisPeakUsedBytes: 0,
    redisConfiguredMaxBytes: 0,
    cosObjectCount: 0,
    cosWriteBytes: 0,
    cpuP95Percent: 1,
    rssBytes: 64 * 1024 * 1024,
    diskFreeBytesBefore: 10 * 1024 * 1024 * 1024,
    diskFreeBytesAfter: 10 * 1024 * 1024 * 1024,
  };
}

test("formal Worker runs 31 cycles, re-audits its database and blocks canonical file tampering", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "m1-micro-forward-worker-"),
  );
  const root = path.join(await realpath(temporary), "evidence");
  let currentMs = START_MS;
  const now = () => new Date(currentMs);
  const upstream = upstreamBinding();
  const selection = selectionPlan(upstream);
  const provider = providerPlan(selection);
  const store = new EmptyStore();
  try {
    const capture = await captureM1MicrostructureForwardWorker({
      upstreamBinding: upstream,
      multiAssetShadowEvidence: multiAssetEvidence(upstream),
      selectionPlan: selection,
      providerPlan: provider,
      evidenceRoot: root,
      workerRunId: "m1-5d-formal-worker-test",
      observationStore: store,
      transportImplementation: new EmptyHealthyTransport(provider),
      now,
      sleepImplementation: async (milliseconds) => {
        currentMs += milliseconds;
      },
      resourceImplementation: async () => resources(),
      captureDurationMs: 1_000,
    });
    assert.equal(capture.cycles.length, 31);
    assert.equal(capture.storeAudit.rowCount, 0);
    assert.equal(
      capture.cycles.at(-1)!.scheduledAt,
      new Date(START_MS + 30 * 60_000).toISOString(),
    );
    const independentlyVerified =
      await verifyM1MicrostructureForwardCaptureStore({
        evidenceRoot: root,
        observationStore: store,
        expectedReleaseId: RELEASE,
        expectedWorkerRunId: "m1-5d-formal-worker-test",
        verifiedAt: now().toISOString(),
      });
    assert.equal(
      independentlyVerified.verification.status,
      "PASS_CAPTURE_AND_DATABASE_INTEGRITY_NO_AUTHORITY",
    );
    const finalized = await finalizeM1MicrostructureForwardWorker({
      capture: independentlyVerified.capture,
      captureVerification: independentlyVerified.verification,
      evaluatedAt: now().toISOString(),
      hostRecovery: {
        status: "NOT_EXECUTED_TEST_ONLY",
        topologyBeforeHash: digest("f"),
        topologyAfterHash: digest("0"),
        nonTargetServiceCountBefore: 0,
        nonTargetServiceCountAfter: 0,
        temporaryContainerCountAfter: 0,
        temporaryNetworkCountAfter: 0,
        temporaryVolumeCountAfter: 0,
        stagingPathCountAfter: 0,
        productionChanged: false,
        reasonCodes: ["test_only_no_host_recovery"],
      },
    });
    assert.equal(
      finalized.evidence.status,
      "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE",
    );
    const finalAudit = await verifyM1MicrostructureForwardEvidenceStore({
      evidenceRoot: root,
      expectedReleaseId: RELEASE,
      expectedWorkerRunId: "m1-5d-formal-worker-test",
      verifiedAt: now().toISOString(),
    });
    assert.equal(finalAudit.verification.verifiedFileCount, 39);
    assert.equal(
      finalAudit.verification.verificationStatus,
      "PASS_FINAL_EVIDENCE_INTEGRITY_NO_AUTHORITY",
    );
    assert.equal(finalAudit.verification.componentAcceptanceGate, "BLOCKED");

    await appendFile(
      path.join(root, "cycle-01", "cycle.json"),
      " ",
    );
    await assert.rejects(
      () =>
        verifyM1MicrostructureForwardEvidenceStore({
          evidenceRoot: root,
          expectedReleaseId: RELEASE,
          expectedWorkerRunId: "m1-5d-formal-worker-test",
          verifiedAt: now().toISOString(),
        }),
      /not canonical JSON/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("injected transport, clock, resources or non-PostgreSQL store cannot masquerade as LIVE", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "m1-micro-forward-live-injection-"),
  );
  const upstream = upstreamBinding("LIVE_READ_ONLY");
  const selection = selectionPlan(upstream);
  const provider = providerPlan(selection);
  try {
    await assert.rejects(
      () =>
        captureM1MicrostructureForwardWorker({
          upstreamBinding: upstream,
          multiAssetShadowEvidence: multiAssetEvidence(upstream),
          selectionPlan: selection,
          providerPlan: provider,
          evidenceRoot: path.join(temporary, "evidence"),
          workerRunId: "m1-5d-live-injection-test",
          observationStore: new EmptyStore(),
          transportImplementation: new EmptyHealthyTransport(provider),
        }),
      /must remain TEST_ONLY/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
