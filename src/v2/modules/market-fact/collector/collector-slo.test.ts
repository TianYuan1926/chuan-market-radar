import assert from "node:assert/strict";
import test from "node:test";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
  RecordingCollectorStore,
} from "../../../testing/m1-collector-harness";
import { stableContentHash } from "../../universe/stable-artifact";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";
import { buildM1CollectorCheckpoint } from "./checkpoint-contract";
import { M1CollectorRuntime } from "./collector-runtime";
import {
  M1_COLLECTOR_WORKER_SCHEMA_VERSION,
  type M1CollectorWorkerCycle,
  parseM1CollectorWorkerCycle,
} from "./collector-worker-contract";
import {
  type CollectorSloPolicy,
  evaluateM1CollectorSlo,
} from "./collector-slo";
import type { CollectorRuntimeConfig } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RELEASE_ID = "m1-5-slo-test";

function runtimeConfig(): CollectorRuntimeConfig {
  return {
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "m1-full-linear-usdt-perpetual.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: RELEASE_ID,
    retentionMs: 730 * DAY_MS,
  };
}

function policy(overrides: Partial<CollectorSloPolicy> = {}): CollectorSloPolicy {
  return {
    maxMissedScheduleStarts: 0,
    maxP95CycleDurationMs: 5_000,
    maxProviderFailureCycleRatio: 0,
    maxRssBytes: 512 * 1024 * 1024,
    maxScheduleLagMs: 100,
    minCheckpointRatio: 1,
    minCollectionCoverageRatio: 1,
    minCycles: 2,
    minFreshCoverageRatio: 1,
    minObservationMs: 1_000,
    minOperationalReadyRatio: 1,
    ...overrides,
  };
}

function workerCycle(input: {
  cycleIndex: number;
  result: Awaited<ReturnType<M1CollectorRuntime["runNextCycle"]>>;
}): M1CollectorWorkerCycle {
  const checkpoint = buildM1CollectorCheckpoint({
    result: input.result,
    runtimeConfig: runtimeConfig(),
  });
  const telemetry = input.result.telemetry;
  const dataQuality = input.result.artifacts?.factQuality.quality.status ??
    "UNAVAILABLE";
  return parseM1CollectorWorkerCycle({
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    checkpoint: {
      checkpointId: checkpoint.checkpointId,
      failureReason: null,
      persistedAt: checkpoint.generatedAt,
      status: "INSERTED",
    },
    completedAt: telemetry.completedAt,
    cycleIndex: input.cycleIndex,
    dataQuality,
    missedScheduleStarts: 0,
    operationalReadiness: telemetry.state === "READY" && dataQuality === "FRESH"
      ? "READY"
      : "NOT_READY",
    releaseId: RELEASE_ID,
    resources: { heapUsedBytes: 32_000_000, rssBytes: 64_000_000 },
    runtime: telemetry,
    runtimeConfigDigest: stableContentHash(runtimeConfig()),
    scheduleLagMs: 0,
    scheduledAt: telemetry.startedAt,
    schemaVersion: M1_COLLECTOR_WORKER_SCHEMA_VERSION,
    startedAt: telemetry.startedAt,
    workerRunId: "worker-run:slo",
  });
}

async function readyCycles(): Promise<readonly M1CollectorWorkerCycle[]> {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const runtime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    }),
    clock,
    config: runtimeConfig(),
    store: new RecordingCollectorStore(),
  });
  const first = await runtime.runNextCycle();
  clock.advance(1_000);
  const second = await runtime.runNextCycle();
  return [
    workerCycle({ cycleIndex: 1, result: first }),
    workerCycle({ cycleIndex: 2, result: second }),
  ];
}

function withIncompleteCollection(
  cycle: M1CollectorWorkerCycle,
): M1CollectorWorkerCycle {
  const venue = cycle.runtime.coverage.venues[0]!;
  assert.ok(venue.collectedCount > 0);
  const collectedCount = venue.collectedCount - 1;
  const freshCount = Math.min(venue.freshCount, collectedCount);
  const venues = cycle.runtime.coverage.venues.map((item, index) =>
    index === 0
      ? {
        ...item,
        collectedCount,
        collectionCoverage: {
          denominator: item.eligibleCount,
          numerator: collectedCount,
          ratio: collectedCount / item.eligibleCount,
        },
        freshCount,
        freshCoverage: {
          denominator: item.eligibleCount,
          numerator: freshCount,
          ratio: freshCount / item.eligibleCount,
        },
      }
      : item
  );
  const aggregateCollected = cycle.runtime.coverage.collectedCount - 1;
  const aggregateFresh = cycle.runtime.coverage.freshCount - 1;
  return parseM1CollectorWorkerCycle({
    ...cycle,
    dataQuality: "PARTIAL",
    operationalReadiness: "NOT_READY",
    runtime: {
      ...cycle.runtime,
      coverage: {
        ...cycle.runtime.coverage,
        collectedCount: aggregateCollected,
        collectionCoverage: {
          denominator: cycle.runtime.coverage.eligibleCount,
          numerator: aggregateCollected,
          ratio: aggregateCollected / cycle.runtime.coverage.eligibleCount,
        },
        freshCount: aggregateFresh,
        freshCoverage: {
          denominator: cycle.runtime.coverage.eligibleCount,
          numerator: aggregateFresh,
          ratio: aggregateFresh / cycle.runtime.coverage.eligibleCount,
        },
        venues,
      },
      reasons: [
        "collection_coverage_incomplete",
        "fresh_coverage_incomplete",
      ],
      state: "DEGRADED",
    },
  });
}

test("does not turn a short healthy probe into an SLO pass", async () => {
  const cycles = await readyCycles();
  const report = evaluateM1CollectorSlo({
    cycles,
    evaluatedAt: cycles.at(-1)!.completedAt,
    policy: policy({ minCycles: 30, minObservationMs: 30 * 60 * 1_000 }),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "INSUFFICIENT_EVIDENCE");
  assert.ok(report.reasons.includes("minimum_cycle_count_not_met"));
  assert.ok(report.reasons.includes("minimum_observation_window_not_met"));
  assert.equal(report.authorityMode, "NO_AUTHORITY");
});

test("passes only after all evidence and thresholds are satisfied", async () => {
  const cycles = await readyCycles();
  const report = evaluateM1CollectorSlo({
    cycles,
    evaluatedAt: cycles.at(-1)!.completedAt,
    policy: policy(),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "PASS");
  assert.equal(report.metrics.cycleCount, 2);
  assert.equal(report.metrics.operationalReadyRatio, 1);
  assert.equal(report.metrics.checkpointRatio, 1);
  assert.equal(report.metrics.minCollectionCoverageRatio, 1);
  assert.equal(report.metrics.minFreshCoverageRatio, 1);
  assert.deepEqual(report.reasons, []);
});

test("fails hard on a zero eligible denominator even before a long window", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  for (const venue of [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_LINEAR_PERPETUAL",
  ] as const) {
    provider.setFailure(`${venue}:CATALOG`, {
      kind: "TRANSPORT_ERROR",
      reasonCode: `${venue.toLowerCase()}_catalog_unreachable`,
    });
  }
  const runtime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    }),
    clock,
    config: runtimeConfig(),
    store: new RecordingCollectorStore(),
  });
  const cycle = workerCycle({
    cycleIndex: 1,
    result: await runtime.runNextCycle(),
  });

  const report = evaluateM1CollectorSlo({
    cycles: [cycle],
    evaluatedAt: cycle.completedAt,
    policy: policy({ minCycles: 30, minObservationMs: 30 * 60 * 1_000 }),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "FAIL");
  assert.ok(report.reasons.includes("eligible_denominator_zero"));
});

test("fails a complete window when resource thresholds are exceeded", async () => {
  const cycles = await readyCycles();
  const report = evaluateM1CollectorSlo({
    cycles,
    evaluatedAt: cycles.at(-1)!.completedAt,
    policy: policy({ maxRssBytes: 1 }),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "FAIL");
  assert.ok(report.reasons.includes("rss_above_slo"));
});

test("fails when any eligible instrument is omitted from collection", async () => {
  const cycles = await readyCycles();
  const incomplete = [cycles[0]!, withIncompleteCollection(cycles[1]!)];
  const report = evaluateM1CollectorSlo({
    cycles: incomplete,
    evaluatedAt: incomplete.at(-1)!.completedAt,
    policy: policy(),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "FAIL");
  assert.ok(report.reasons.includes("collection_coverage_below_slo"));
  assert.ok((report.metrics.minCollectionCoverageRatio ?? 1) < 1);
});

test("fails closed when one observation window mixes runtime configurations", async () => {
  const cycles = await readyCycles();
  const mixed = [
    cycles[0]!,
    {
      ...cycles[1]!,
      runtimeConfigDigest: `sha256:${"0".repeat(64)}`,
    },
  ];
  const report = evaluateM1CollectorSlo({
    cycles: mixed,
    evaluatedAt: mixed.at(-1)!.completedAt,
    policy: policy(),
    releaseId: RELEASE_ID,
  });

  assert.equal(report.conclusion, "FAIL");
  assert.ok(report.reasons.includes("mixed_runtime_configuration"));
});
