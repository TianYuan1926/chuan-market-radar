import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { TARGET_VENUES } from "../../../domain/product-constitution";
import {
  buildM1CollectorEarlyShadowEvidence,
  parseM1CollectorEarlyShadowProcessOutput,
  verifyM1CollectorEarlyShadowEvidence,
} from "./collector-early-shadow-evidence";
import { serializeM1CollectorObservationLog } from "./collector-observation-log";
import {
  M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
  parseM1CollectorProcessSummary,
} from "./collector-process-contract";
import {
  M1_COLLECTOR_WORKER_SCHEMA_VERSION,
  type M1CollectorWorkerCycle,
  parseM1CollectorWorkerCycle,
} from "./collector-worker-contract";
import {
  M1_COLLECTOR_RUNTIME_SCHEMA_VERSION,
} from "./contracts";

const RELEASE_ID = `m1-5-b1b-test:${"a".repeat(40)}`;
const RUNTIME_CONFIG_DIGEST = `sha256:${"b".repeat(64)}`;
const START_MS = Date.parse("2026-07-21T00:00:00.000Z");

function ratio(numerator: number, denominator: number) {
  return { denominator, numerator, ratio: numerator / denominator };
}

function buildCycle(index: number): M1CollectorWorkerCycle {
  const scheduledMs = START_MS + (index - 1) * 60_000;
  const startedMs = scheduledMs + 100;
  const completedMs = startedMs + 1_000;
  const startedAt = new Date(startedMs).toISOString();
  const completedAt = new Date(completedMs).toISOString();
  const venueCoverage = TARGET_VENUES.map((venue, venueIndex) => {
    const eligibleCount = venueIndex === 2 ? 1 : 2;
    return {
      accountedCount: eligibleCount,
      carriedForwardCount: 0,
      collectedCount: eligibleCount,
      collectionCoverage: ratio(eligibleCount, eligibleCount),
      eligibleCount,
      freshCount: eligibleCount,
      freshCoverage: ratio(eligibleCount, eligibleCount),
      providerFailures: [],
      providerObservedCount: eligibleCount,
      venue,
    };
  });
  const eligibleCount = venueCoverage.reduce(
    (sum, venue) => sum + venue.eligibleCount,
    0,
  );
  const cycleId = `collector-cycle:test:${index}`;
  return parseM1CollectorWorkerCycle({
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    checkpoint: {
      checkpointId: `checkpoint:test:${index}`,
      failureReason: null,
      persistedAt: completedAt,
      status: "INSERTED",
    },
    completedAt,
    cycleIndex: index,
    dataQuality: "FRESH",
    missedScheduleStarts: 0,
    operationalReadiness: "READY",
    releaseId: RELEASE_ID,
    resources: {
      heapUsedBytes: 32 * 1024 * 1024,
      rssBytes: 64 * 1024 * 1024,
    },
    runtime: {
      completedAt,
      coverage: {
        accountedCount: eligibleCount,
        carriedForwardCount: 0,
        collectedCount: eligibleCount,
        collectionCoverage: ratio(eligibleCount, eligibleCount),
        eligibleCount,
        freshCount: eligibleCount,
        freshCoverage: ratio(eligibleCount, eligibleCount),
        providerObservedCount: eligibleCount,
        venues: venueCoverage,
      },
      cycleId,
      durationMs: 1_000,
      factQualitySnapshotId: `fact-quality:test:${index}`,
      nextReconciliationAt: "2026-07-22T00:00:00.000Z",
      persistence: "INSERTED",
      previousState: index === 1 ? "COLD_START" : "READY",
      providerFailures: [],
      reasons: [],
      recovery: {
        attempted: false,
        previousFailureReasons: [],
        succeeded: false,
      },
      releaseId: RELEASE_ID,
      request: {
        activeRequests: 0,
        cycleId,
        maxGlobalConcurrencyObserved: 3,
        maxQueueDepthObserved: 0,
        maxQueueLagMs: 0,
        queueDepth: 0,
        queueRejected: 0,
        requestsCompleted: 3,
        requestsStarted: 3,
        totalQueueLagMs: 0,
        venues: TARGET_VENUES.map((venue) => ({
          activeRequests: 0,
          maxConcurrentObserved: 1,
          quotaLimit: 60,
          quotaRejected: 0,
          requestsCompleted: 1,
          requestsStarted: 1,
          venue,
          windowMs: 60_000,
        })),
      },
      schemaVersion: M1_COLLECTOR_RUNTIME_SCHEMA_VERSION,
      startedAt,
      state: "READY",
      trigger: index === 1 ? "STARTUP_FULL" : "INCREMENTAL_TICKER",
      universeSnapshotId: `universe:test:${index}`,
    },
    runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
    scheduleLagMs: 100,
    scheduledAt: new Date(scheduledMs).toISOString(),
    schemaVersion: M1_COLLECTOR_WORKER_SCHEMA_VERSION,
    startedAt,
    workerRunId: "collector-worker:test-atomic-run",
  });
}

function degradedCycle(input: {
  collectionDeficit?: number;
  cycle: M1CollectorWorkerCycle;
  freshDeficit: number;
}): M1CollectorWorkerCycle {
  const collectionDeficit = input.collectionDeficit ?? 0;
  const venue = input.cycle.runtime.coverage.venues[0]!;
  const collectedCount = venue.collectedCount - collectionDeficit;
  const freshCount = venue.freshCount - input.freshDeficit;
  assert.ok(freshCount >= 0 && freshCount <= collectedCount);
  const venues = input.cycle.runtime.coverage.venues.map((item, index) =>
    index === 0
      ? {
        ...item,
        collectedCount,
        collectionCoverage: ratio(collectedCount, item.eligibleCount),
        freshCount,
        freshCoverage: ratio(freshCount, item.eligibleCount),
      }
      : item
  );
  const aggregate = input.cycle.runtime.coverage;
  const aggregateCollected = aggregate.collectedCount - collectionDeficit;
  const aggregateFresh = aggregate.freshCount - input.freshDeficit;
  const reasons = [
    ...(collectionDeficit > 0 ? ["collection_coverage_incomplete"] : []),
    ...(input.freshDeficit > 0 ? ["fresh_coverage_incomplete"] : []),
  ];
  return parseM1CollectorWorkerCycle({
    ...input.cycle,
    dataQuality: "PARTIAL",
    operationalReadiness: "NOT_READY",
    runtime: {
      ...input.cycle.runtime,
      coverage: {
        ...aggregate,
        collectedCount: aggregateCollected,
        collectionCoverage: ratio(
          aggregateCollected,
          aggregate.eligibleCount,
        ),
        freshCount: aggregateFresh,
        freshCoverage: ratio(aggregateFresh, aggregate.eligibleCount),
        venues,
      },
      reasons,
      state: "DEGRADED",
    },
  });
}

function processOutput(cycles: readonly M1CollectorWorkerCycle[]): string {
  const summary = parseM1CollectorProcessSummary({
    authorityMode: "NO_AUTHORITY",
    automaticTradingAllowed: false,
    contractVersion: M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
    cycleCount: 31,
    exitCode: 0,
    releaseId: RELEASE_ID,
    restore: { checkpointId: null, status: "COLD_START" },
    runProfile: "EARLY_30_MINUTES",
    status: "COMPLETED",
    stopReason: "MAX_CYCLES_REACHED",
  });
  return `${cycles.map(serializeM1CollectorObservationLog).join("\n")}\n${JSON.stringify(summary)}\n`;
}

function completeCycles(): readonly M1CollectorWorkerCycle[] {
  return Array.from({ length: 31 }, (_, index) => buildCycle(index + 1));
}

test("builds one content-addressed 31-cycle business PASS without claiming M1 exit", () => {
  const output = processOutput(completeCycles());
  const evidence = buildM1CollectorEarlyShadowEvidence({
    evaluatedAt: "2026-07-21T00:30:02.000Z",
    processOutput: output,
    releaseId: RELEASE_ID,
  });

  assert.equal(evidence.status, "CAPTURE_COMPLETE_BUSINESS_PASS");
  assert.equal(evidence.businessGate.conclusion, "PASS");
  assert.equal(evidence.businessGate.earlyShadowSloPassed, true);
  assert.equal(evidence.businessGate.m1ExitClaimed, false);
  assert.equal(evidence.capture.cycleCount, 31);
  assert.equal(evidence.capture.operationalReadyCycleCount, 31);
  assert.equal(evidence.capture.aggregate.minimumCollectionCoverageRatio, 1);
  assert.equal(evidence.capture.aggregate.minimumFreshCoverageRatio, 1);
  assert.equal(evidence.slo.metrics.observationMs, 30 * 60 * 1_000 + 1_000);
  assert.equal(evidence.sourceArtifacts.processOutputDigest,
    `sha256:${createHash("sha256").update(output).digest("hex")}`,
  );
  assert.equal(verifyM1CollectorEarlyShadowEvidence(evidence), evidence);
});

test("keeps complete capture separate from a freshness business FAIL", () => {
  const cycles = [...completeCycles()];
  cycles[20] = degradedCycle({ cycle: cycles[20]!, freshDeficit: 1 });
  const evidence = buildM1CollectorEarlyShadowEvidence({
    evaluatedAt: "2026-07-21T00:30:02.000Z",
    processOutput: processOutput(cycles),
    releaseId: RELEASE_ID,
  });

  assert.equal(evidence.status, "CAPTURE_COMPLETE_BUSINESS_FAIL");
  assert.equal(evidence.businessGate.conclusion, "FAIL");
  assert.equal(evidence.businessGate.earlyShadowSloPassed, false);
  assert.equal(evidence.capture.notReadyCycleCount, 1);
  assert.ok(evidence.businessGate.reasons.includes("fresh_coverage_below_slo"));
  assert.ok(
    evidence.businessGate.reasons.includes(
      "operational_ready_ratio_below_slo",
    ),
  );
});

test("fails the business Gate when collection omits one eligible instrument", () => {
  const cycles = [...completeCycles()];
  cycles[10] = degradedCycle({
    collectionDeficit: 1,
    cycle: cycles[10]!,
    freshDeficit: 1,
  });
  const evidence = buildM1CollectorEarlyShadowEvidence({
    evaluatedAt: "2026-07-21T00:30:02.000Z",
    processOutput: processOutput(cycles),
    releaseId: RELEASE_ID,
  });

  assert.equal(evidence.businessGate.conclusion, "FAIL");
  assert.ok(
    evidence.businessGate.reasons.includes("collection_coverage_below_slo"),
  );
  assert.ok(evidence.capture.aggregate.minimumCollectionCoverageRatio < 1);
});

test("rejects short, stitched, non-canonical and cadence-drifted process output", () => {
  const cycles = [...completeCycles()];
  assert.throws(
    () => parseM1CollectorEarlyShadowProcessOutput(
      processOutput(cycles.slice(0, 30)),
    ),
    /exactly 31 observations/u,
  );

  const stitched = [...cycles];
  stitched[15] = parseM1CollectorWorkerCycle({
    ...stitched[15]!,
    workerRunId: "collector-worker:second-run",
  });
  assert.throws(
    () => buildM1CollectorEarlyShadowEvidence({
      evaluatedAt: "2026-07-21T00:30:02.000Z",
      processOutput: processOutput(stitched),
      releaseId: RELEASE_ID,
    }),
    /stitched worker runs/u,
  );

  const cadenceDrift = [...cycles];
  cadenceDrift[4] = parseM1CollectorWorkerCycle({
    ...cadenceDrift[4]!,
    missedScheduleStarts: 1,
  });
  assert.throws(
    () => buildM1CollectorEarlyShadowEvidence({
      evaluatedAt: "2026-07-21T00:30:02.000Z",
      processOutput: processOutput(cadenceDrift),
      releaseId: RELEASE_ID,
    }),
    /scheduled cadence/u,
  );

  assert.throws(
    () => parseM1CollectorEarlyShadowProcessOutput(
      `diagnostic noise\n${processOutput(cycles)}`,
    ),
    /exactly 31 observations/u,
  );
});

test("rejects report-level status or content-address inflation", () => {
  const evidence = buildM1CollectorEarlyShadowEvidence({
    evaluatedAt: "2026-07-21T00:30:02.000Z",
    processOutput: processOutput(completeCycles()),
    releaseId: RELEASE_ID,
  });
  assert.throws(
    () => verifyM1CollectorEarlyShadowEvidence({
      ...evidence,
      status: "CAPTURE_COMPLETE_BUSINESS_FAIL",
    }),
    /content address|overstate/u,
  );
  assert.throws(
    () => verifyM1CollectorEarlyShadowEvidence({
      ...evidence,
      evidenceDigest: `sha256:${"0".repeat(64)}`,
    }),
    /content address/u,
  );
});
