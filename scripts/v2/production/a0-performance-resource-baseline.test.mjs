import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateA0PerformanceMetrics,
  frozenA0WorkloadAssets,
} from "./a0-performance-resource-baseline.mjs";
import {
  loadA0ReleaseQualificationPolicy,
} from "./a0-release-qualification-contract.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function passingMetrics(policy) {
  const budgets = policy.performanceBaseline.budgets;
  return {
    cold: {
      cpuMs: { max: budgets.coldCpuP95Ms, p50: 1, p95: budgets.coldCpuP95Ms },
      latencyMs: {
        max: budgets.coldLatencyP95Ms,
        p50: 1,
        p95: budgets.coldLatencyP95Ms,
      },
      sampleCount: policy.performanceBaseline.measuredColdCycles,
    },
    eventLoopDelayP99Ms: budgets.eventLoopDelayP99Ms,
    incremental: {
      cpuMs: {
        max: budgets.incrementalCpuP95Ms,
        p50: 1,
        p95: budgets.incrementalCpuP95Ms,
      },
      latencyMs: {
        max: budgets.incrementalLatencyP95Ms,
        p50: 1,
        p95: budgets.incrementalLatencyP95Ms,
      },
      sampleCount: policy.performanceBaseline.measuredIncrementalCycles,
    },
    incrementalInstrumentThroughputPerSecondP05:
      budgets.minimumIncrementalInstrumentThroughputPerSecond,
    maximumHeapUsedMiB: budgets.maximumHeapUsedMiB,
    maximumRssMiB: budgets.maximumRssMiB,
  };
}

test("A0 performance evaluator passes exact boundaries and blocks any exceeded axis", async () => {
  const { policy } = await loadA0ReleaseQualificationPolicy(repositoryRoot);
  const sampleAccounting = {
    cold: policy.performanceBaseline.measuredColdCycles,
    incremental: policy.performanceBaseline.measuredIncrementalCycles,
  };
  const metrics = passingMetrics(policy);
  assert.equal(
    evaluateA0PerformanceMetrics({
      metrics,
      policy,
      sampleAccounting,
    }).status,
    "PASS",
  );

  for (const mutate of [
    (value) => {
      value.cold.latencyMs.p95 += 0.001;
    },
    (value) => {
      value.incremental.cpuMs.p95 += 0.001;
    },
    (value) => {
      value.maximumRssMiB += 0.001;
    },
    (value) => {
      value.incrementalInstrumentThroughputPerSecondP05 -= 0.001;
    },
  ]) {
    const failed = structuredClone(metrics);
    mutate(failed);
    assert.equal(
      evaluateA0PerformanceMetrics({
        metrics: failed,
        policy,
        sampleAccounting,
      }).status,
      "BLOCKED",
    );
  }
});

test("A0 performance evaluator rejects missing samples and workload assets cannot shrink", async () => {
  const { policy } = await loadA0ReleaseQualificationPolicy(repositoryRoot);
  const metrics = passingMetrics(policy);
  const missing = evaluateA0PerformanceMetrics({
    metrics,
    policy,
    sampleAccounting: {
      cold: policy.performanceBaseline.measuredColdCycles,
      incremental: policy.performanceBaseline.measuredIncrementalCycles - 1,
    },
  });
  assert.equal(missing.status, "BLOCKED");
  assert.equal(missing.checks.measuredCycleIdentityExact, false);
  assert.equal(missing.checks.measuredCycleFloorMet, false);

  const assets = frozenA0WorkloadAssets(480);
  assert.equal(assets.length, 480);
  assert.equal(new Set(assets).size, 480);
  assert.equal(assets[0], "A0001");
  assert.equal(assets.at(-1), "A0480");
  assert.throws(() => frozenA0WorkloadAssets(479), /frozen/u);
});

test("A0 benchmark never injects per-cycle garbage-collection pauses", async () => {
  const source = await readFile(
    resolve(
      repositoryRoot,
      "scripts/v2/production/a0-performance-resource-baseline.mjs",
    ),
    "utf8",
  );
  assert.equal(
    (source.match(/globalThis\.gc\?\.\(\)/gu) ?? []).length,
    1,
  );
  assert.ok(source.includes(
    "SINGLE_PRE_MEASUREMENT_FORCED_GC_IF_AVAILABLE",
  ));
});
