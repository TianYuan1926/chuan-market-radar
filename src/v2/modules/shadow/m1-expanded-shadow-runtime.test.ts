import assert from "node:assert/strict";
import test from "node:test";
import {
  type M1SqlPool,
  type M1SqlQueryResult,
  type M1SqlTransactionClient,
} from "../market-fact/store/contracts";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  buildM1MicrostructureForwardSelectionPlan,
  type M1MicrostructureForwardSelectionPlan,
} from "./m1-microstructure-forward-shadow-contract";
import {
  buildM1ExpandedShadowProviderPlan,
  parseM1ExpandedShadowProviderMessage,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderObservation,
  type M1ShadowProviderSubject,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  M1ExpandedShadowCaptureRuntime,
} from "./m1-expanded-shadow-runtime";
import {
  M1_EXPANDED_SHADOW_DATABASE_NAME,
  M1_EXPANDED_SHADOW_POSTGRES_SCHEMA_SQL,
  M1PostgresShadowObservationStore,
  buildM1ShadowStoreAuditReceipt,
  type M1ShadowObservationStore,
  type M1ShadowPersistenceReceipt,
} from "./m1-expanded-shadow-store";
import {
  M1ShadowJsonFrameError,
  parseM1ShadowLosslessJsonFrame,
} from "./m1-shadow-lossless-json";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";

const RELEASE = "d".repeat(40);
const CONFIG_DIGEST =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const START = Date.parse("2026-07-26T08:00:00.000Z");

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function upstreamBinding(): M1MultiAssetShadowUpstreamBinding {
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-26T07:57:00.000Z",
    sourceCutoff: "2026-07-26T07:56:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:fixture",
    runtimeAdapterArtifactHash: digest("1"),
    conformanceArtifactId: "source-conformance:fixture",
    conformanceArtifactHash: digest("2"),
    registryDigest: digest("3"),
    profileSetHash: digest("4"),
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

function selectionPlan(): M1MicrostructureForwardSelectionPlan {
  const upstream = upstreamBinding();
  return buildM1MicrostructureForwardSelectionPlan({
    upstreamBinding: upstream,
    plan: {
      releaseId: RELEASE,
      upstreamBindingId: upstream.upstreamBindingId,
      upstreamBindingHash: upstream.contentHash,
      generatedAt: "2026-07-26T07:58:00.000Z",
      selectionCutoff: "2026-07-26T07:59:00.000Z",
      windowStartsAt: "2026-07-26T08:00:00.000Z",
      windowEndsAt: "2026-07-26T08:31:00.000Z",
      universeSnapshotId: "universe:m1-shadow-runtime-fixture",
      universeSnapshotHash: digest("7"),
      rotationOrdinal: 1,
      deterministicSeedHash: digest("8"),
      selectionAlgorithm:
        "POINT_IN_TIME_DETERMINISTIC_HASH_ROTATION_WITH_MATCHED_CONTROL",
      pairs: M1_VENUE_SOURCE_IDS.map((venue, venueIndex) => {
        const [triggerSymbol, controlSymbol] = SYMBOLS[venue];
        const subject = (
          selectionRole: "trigger" | "control",
          symbol: FixtureSymbol,
        ) => ({
          subjectId: `${selectionRole}-${venue}`,
          venue,
          assetDomain: "CRYPTO_LINEAR_PERPETUAL" as const,
          lifecycleState: "ESTABLISHED" as const,
          canonicalInstrumentId:
            `scope-v2:${venue}:${selectionRole}:${symbol[0]}`,
          venueInstrumentId: symbol[0],
          listingEpoch: `listing:${venue}:${symbol[0]}`,
          identityEpoch: `identity:${venue}:${symbol[0]}`,
          regime: "TRANSITION" as const,
          liquiditySegment: "MEDIUM" as const,
          featureSnapshotId:
            `feature:${venue}:${selectionRole}:${symbol[0]}`,
          featureSnapshotHash:
            selectionRole === "trigger" ? digest("5") : digest("6"),
          selectedAt: "2026-07-26T07:58:30.000Z",
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
    generatedAt: "2026-07-26T07:59:00.000Z",
    subjects,
  });
}

class MemoryStore implements M1ShadowObservationStore {
  initialized = false;
  fail = false;
  readonly rows = new Set<string>();
  readonly auditRecords: Array<{
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
    if (!this.initialized || this.fail) throw new Error("fixture_store_failed");
    const records = input.observations.map((observation) => {
      const key =
        `${input.workerRunId}|${input.cycleIndex}|${observation.observationId}`;
      if (this.rows.has(key)) throw new Error("fixture_duplicate");
      this.rows.add(key);
      this.auditRecords.push({
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
    return [...this.rows].filter((key) => key.startsWith(`${workerRunId}|`))
      .length;
  }

  async auditRun(workerRunId: string, auditedAt: string) {
    const prefix = `${workerRunId}|`;
    const includedIds = new Set(
      [...this.rows]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.split("|").at(-1)!),
    );
    return buildM1ShadowStoreAuditReceipt({
      workerRunId,
      auditedAt,
      records: this.auditRecords.filter((record) =>
        includedIds.has(record.observationId)
      ),
    });
  }
}

function resources() {
  return {
    redisReadBytes: 0,
    redisWriteBytes: 0,
    redisPeakUsedBytes: 0,
    redisConfiguredMaxBytes: 256 * 1024 * 1024,
    cosObjectCount: 0,
    cosWriteBytes: 0,
    cpuP95Percent: 20,
    rssBytes: 128 * 1024 * 1024,
    diskFreeBytesBefore: 10 * 1024 * 1024 * 1024,
    diskFreeBytesAfter: 10 * 1024 * 1024 * 1024 - 1_024,
  };
}

function markHealthyConnections(runtime: M1ExpandedShadowCaptureRuntime): void {
  for (const role of [
    "BINANCE_PUBLIC_HIGH_FREQUENCY",
    "BINANCE_MARKET_REGULAR",
    "OKX_PUBLIC",
    "BYBIT_LINEAR_PUBLIC",
    "BITGET_UTA_PUBLIC",
  ] as const) {
    runtime.markConnectionAttempt({
      role,
      heartbeatObserved: true,
      networkEgressBytes: 100,
    });
  }
}

test("lossless frame parser preserves unsafe integer sequence fields and rejects duplicate keys", () => {
  const parsed = parseM1ShadowLosslessJsonFrame(
    '{"seq":1304314508780744705,"ts":1753516800120,"price":1.25}',
  ) as Record<string, unknown>;
  assert.equal(parsed.seq, "1304314508780744705");
  assert.equal(parsed.ts, 1_753_516_800_120);
  assert.equal(parsed.price, 1.25);
  assert.throws(
    () => parseM1ShadowLosslessJsonFrame('{"seq":1,"seq":2}'),
    (error) =>
      error instanceof M1ShadowJsonFrameError &&
      error.reason === "DUPLICATE_JSON_KEY",
  );
});

test("capture runtime keeps local cycle accounting exact and authority-free", async () => {
  const selection = selectionPlan();
  const providers = providerPlan(selection);
  const store = new MemoryStore();
  const runtime = new M1ExpandedShadowCaptureRuntime({
    providerPlan: providers,
    selectionPlan: selection,
    runtimeConfigDigest: CONFIG_DIGEST,
    workerRunId: "m1-shadow-runtime-test",
    store,
  });
  await runtime.initialize();
  runtime.beginCycle({
    cycleIndex: 1,
    scheduledAt: new Date(START).toISOString(),
    startedAt: new Date(START + 100).toISOString(),
  });
  markHealthyConnections(runtime);
  const result = await runtime.ingestProviderMessage({
    role: "BINANCE_MARKET_REGULAR",
    payload: {
      e: "aggTrade",
      E: START + 900,
      s: "BTCUSDT",
      a: 12345,
      p: "118000.5",
      q: "0.25",
      T: START + 900,
      m: false,
    },
    receivedAt: new Date(START + 1_000).toISOString(),
    rawFrameBytes: 180,
  });
  assert.equal(result.persistedObservationCount, 1);
  for (
    const [requestIndex, request] of providers.restSnapshots.entries()
  ) {
    runtime.markRestSnapshotAttempt({
      requestId: request.requestId,
      responseObserved: true,
      networkEgressBytes: 40,
    });
    const snapshot = await runtime.ingestProviderMessage({
      role: "BINANCE_PUBLIC_HIGH_FREQUENCY",
      transportKind: "REST_SNAPSHOT",
      subjectId: request.subjectId,
      payload: {
        lastUpdateId: 12_400 + requestIndex,
        E: START + 950,
        bids: [["117999.5", "1.25"]],
        asks: [["118000.5", "1.10"]],
      },
      receivedAt: new Date(START + 1_000).toISOString(),
      rawFrameBytes: 200,
    });
    assert.equal(snapshot.persistedObservationCount, 1);
  }
  const cycle = runtime.finalizeCycle({
    completedAt: new Date(START + 2_100).toISOString(),
    resources: resources(),
  });
  assert.equal(
    cycle.captureQualityGate,
    "PASS",
    JSON.stringify({
      reasonCodes: cycle.reasonCodes,
      abnormalCells: cycle.coverageCells.filter((cell) =>
        !["OBSERVED_NONEMPTY", "OBSERVED_EMPTY"].includes(cell.disposition)
      ),
    }),
  );
  assert.equal(cycle.totalRecordCount, 3);
  assert.equal(cycle.persistedRecordCount, 3);
  assert.equal(cycle.observedNonemptyCellCount, 3);
  assert.equal(cycle.observedEmptyCellCount, 45);
  assert.equal(cycle.resources.postgresInsertedRows, 3);
  assert.equal(cycle.resources.postgresWriteBytes, 30);
  assert.equal(cycle.resources.postgresWalBytes, 60);
  assert.equal(cycle.resources.networkIngressBytes, 580);
  assert.equal(cycle.resources.networkEgressBytes, 580);
  assert.equal(cycle.factAuthorityGranted, false);
  assert.equal(cycle.readyAuthorityGranted, false);
  assert.equal(await runtime.persistedRunRowCount(), 3);
});

test("capture runtime blocks provider schema drift and persistence failure without stale promotion", async () => {
  const selection = selectionPlan();
  const providers = providerPlan(selection);
  const store = new MemoryStore();
  const runtime = new M1ExpandedShadowCaptureRuntime({
    providerPlan: providers,
    selectionPlan: selection,
    runtimeConfigDigest: CONFIG_DIGEST,
    workerRunId: "m1-shadow-runtime-failure-test",
    store,
  });
  await runtime.initialize();
  runtime.beginCycle({
    cycleIndex: 1,
    scheduledAt: new Date(START).toISOString(),
    startedAt: new Date(START + 100).toISOString(),
  });
  markHealthyConnections(runtime);
  const drift = await runtime.ingestProviderMessage({
    role: "BYBIT_LINEAR_PUBLIC",
    payload: {
      topic: "publicTrade.SOLUSDT",
      data: [{ broken: true }],
    },
    receivedAt: new Date(START + 1_000).toISOString(),
    rawFrameBytes: 50,
  });
  assert.equal(drift.parseStatus, "SCHEMA_DRIFT");
  store.fail = true;
  const persistence = await runtime.ingestProviderMessage({
    role: "BINANCE_MARKET_REGULAR",
    payload: {
      e: "aggTrade",
      E: START + 900,
      s: "BTCUSDT",
      a: 12346,
      p: "118000.5",
      q: "0.25",
      T: START + 900,
      m: false,
    },
    receivedAt: new Date(START + 1_000).toISOString(),
    rawFrameBytes: 180,
  });
  assert.equal(persistence.persistedObservationCount, 0);
  assert.ok(persistence.reasonCodes.includes("shadow_persistence_failed"));
  const cycle = runtime.finalizeCycle({
    completedAt: new Date(START + 2_100).toISOString(),
    resources: resources(),
  });
  assert.equal(cycle.captureQualityGate, "BLOCKED");
  assert.ok(cycle.degradedCellCount > 0);
  assert.equal(cycle.persistedRecordCount, 0);
  assert.ok(
    cycle.coverageCells.some((cell) =>
      cell.reasonCodes.includes("provider_schema_drift_unavailable")
    ),
  );
});

test("runtime rejects provider subject denominator drift before any network work", () => {
  const selection = selectionPlan();
  const providers = providerPlan(selection);
  const modifiedSelectionCore = {
    ...selection,
    pairs: selection.pairs.map((pair, index) =>
      index === 0
        ? {
          ...pair,
          trigger: {
            ...pair.trigger,
            venueInstrumentId: "DIFFERENTUSDT",
          },
        }
        : pair
    ),
  };
  const resignedCore = Object.fromEntries(
    Object.entries(modifiedSelectionCore).filter(
      ([key]) => key !== "planId" && key !== "contentHash",
    ),
  ) as Omit<typeof modifiedSelectionCore, "planId" | "contentHash">;
  const resignedHash = stableContentHash(resignedCore);
  const modifiedSelection = {
    ...resignedCore,
    planId: `m1-micro-forward-plan:${resignedHash.slice(7, 31)}`,
    contentHash: resignedHash,
  };
  assert.throws(
    () =>
      new M1ExpandedShadowCaptureRuntime({
        providerPlan: providers,
        selectionPlan: modifiedSelection,
        runtimeConfigDigest: CONFIG_DIGEST,
        workerRunId: "m1-shadow-runtime-drift-test",
        store: new MemoryStore(),
      }),
    /provider_subject_denominator_drifted/u,
  );
});

function observationFixture(): M1ShadowProviderObservation {
  const selection = selectionPlan();
  const providers = providerPlan(selection);
  const parsed = parseM1ExpandedShadowProviderMessage({
    plan: providers,
    venue: "BINANCE_FUTURES",
    payload: {
      e: "aggTrade",
      E: START + 900,
      s: "BTCUSDT",
      a: 12345,
      p: "118000.5",
      q: "0.25",
      T: START + 900,
      m: false,
    },
    receivedAt: new Date(START + 1_000).toISOString(),
  });
  assert.equal(parsed.status, "DATA");
  return parsed.observations[0]!;
}

class FakeTransactionClient implements M1SqlTransactionClient {
  released = false;
  walCallCount = 0;
  readonly calls: Array<{
    text: string;
    values: readonly unknown[] | undefined;
  }> = [];

  async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<M1SqlQueryResult<Row>> {
    this.calls.push({ text, values });
    if (text.includes("pg_current_wal_insert_lsn")) {
      this.walCallCount += 1;
      return {
        rows: [{
          wal_lsn: this.walCallCount === 1 ? "0/100" : "0/180",
        } as unknown as Row],
        rowCount: 1,
      };
    }
    if (text.includes("pg_wal_lsn_diff")) {
      return {
        rows: [{ wal_bytes: "128" } as unknown as Row],
        rowCount: 1,
      };
    }
    if (text.includes("INSERT INTO")) {
      return {
        rows: [{ observation_id: values?.[2] } as unknown as Row],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: null };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements M1SqlPool {
  readonly transaction = new FakeTransactionClient();
  readonly calls: Array<{
    text: string;
    values: readonly unknown[] | undefined;
  }> = [];

  constructor(
    readonly databaseName: string = M1_EXPANDED_SHADOW_DATABASE_NAME,
  ) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<M1SqlQueryResult<Row>> {
    this.calls.push({ text, values });
    if (text.includes("current_database()")) {
      return {
        rows: [{
          database_name: this.databaseName,
          server_version_num: "160000",
          in_recovery: false,
        } as unknown as Row],
        rowCount: 1,
      };
    }
    if (text.includes("count(*)")) {
      return {
        rows: [{ row_count: "1" } as unknown as Row],
        rowCount: 1,
      };
    }
    if (text.includes("ORDER BY cycle_index, observation_id")) {
      const observation = observationFixture();
      return {
        rows: [{
          cycle_index: "1",
          observation_id: observation.observationId,
          content_hash: observation.contentHash,
          payload_gzip_bytes: "128",
        } as unknown as Row],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: null };
  }

  async connect(): Promise<M1SqlTransactionClient> {
    return this.transaction;
  }
}

test("PostgreSQL store enforces isolated database identity and persists only compressed no-authority observations", async () => {
  const rejected = new M1PostgresShadowObservationStore(
    new FakePool("market_radar_production"),
  );
  await assert.rejects(
    () => rejected.initialize(),
    /isolation_identity_rejected/u,
  );

  const pool = new FakePool();
  const store = new M1PostgresShadowObservationStore(pool);
  await store.initialize();
  assert.ok(
    pool.calls.some((call) =>
      call.text === M1_EXPANDED_SHADOW_POSTGRES_SCHEMA_SQL
    ),
  );
  const observation = observationFixture();
  const receipt = await store.persistBatch({
    workerRunId: "m1-shadow-postgres-test",
    cycleIndex: 1,
    observations: [observation],
  });
  assert.equal(receipt.insertedRows, 1);
  assert.equal(receipt.postgresWalBytes, 128);
  assert.ok(receipt.postgresWriteBytes > 0);
  const insert = pool.transaction.calls.find((call) =>
    call.text.includes("INSERT INTO")
  );
  assert.ok(insert);
  assert.ok(Buffer.isBuffer(insert.values?.[9]));
  assert.equal(insert.values?.[11], undefined);
  assert.ok(
    M1_EXPANDED_SHADOW_POSTGRES_SCHEMA_SQL.includes(
      "automatic_trading_allowed boolean NOT NULL CHECK (automatic_trading_allowed = false)",
    ),
  );
  assert.equal(await store.countRunRows("m1-shadow-postgres-test"), 1);
  const audit = await store.auditRun(
    "m1-shadow-postgres-test",
    "2026-07-26T08:01:00.000Z",
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.observedCycleCount, 1);
  assert.equal(audit.firstCycleIndex, 1);
  assert.equal(audit.lastCycleIndex, 1);
  assert.equal(audit.compressedPayloadBytes, 128);
  assert.equal(audit.factAuthorityGranted, false);
  assert.equal(audit.candidateAuthorityGranted, false);
  assert.equal(audit.automaticTradingAllowed, false);
  assert.equal(pool.transaction.released, true);
});
