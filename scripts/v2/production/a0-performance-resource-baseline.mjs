#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  arch,
  cpus,
  platform,
  totalmem,
} from "node:os";
import { dirname, resolve } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  A0_PERFORMANCE_EVIDENCE_SCHEMA,
  assertCommit,
  canonicalJson,
  loadA0ReleaseQualificationPolicy,
  stableDigest,
} from "./a0-release-qualification-contract.mjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_GIT_OUTPUT = 4 * 1024 * 1024;

function percentile(values, percentileValue) {
  assert.ok(Array.isArray(values) && values.length > 0);
  assert.ok(percentileValue > 0 && percentileValue <= 1);
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil(sorted.length * percentileValue) - 1,
  );
  return sorted[index];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function millisecondsFromHrtime(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function cpuMilliseconds(previous) {
  const usage = process.cpuUsage(previous);
  return (usage.user + usage.system) / 1_000;
}

async function git(repositoryRoot, args) {
  const { stdout } = await execFileAsync("git", [
    "-C",
    repositoryRoot,
    ...args,
  ], {
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT,
    timeout: 30_000,
  });
  return stdout.trim();
}

export function frozenA0WorkloadAssets(count) {
  assert.equal(count, 480, "A0 workload asset count is frozen");
  return Object.freeze(
    Array.from(
      { length: count },
      (_, index) => `A${String(index + 1).padStart(4, "0")}`,
    ),
  );
}

function collectorConfig(sourceCommit) {
  return Object.freeze({
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "v2-a0-engineering-resource-baseline.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: `a0-resource-baseline:${sourceCommit}`,
    retentionMs: 30 * DAY_MS,
  });
}

function loadCollectorRuntime(repositoryRoot) {
  const compiledRoot = resolve(repositoryRoot, ".tmp/market-tests/v2");
  const harness = require(resolve(
    compiledRoot,
    "testing/m1-collector-harness.js",
  ));
  const adapter = require(resolve(
    compiledRoot,
    "modules/market-fact/collector/adapters/public-rest-adapter-runtime.js",
  ));
  const collector = require(resolve(
    compiledRoot,
    "modules/market-fact/collector/collector-runtime.js",
  ));
  return Object.freeze({
    FullScopeProviderHarness: harness.FullScopeProviderHarness,
    M1CollectorRuntime: collector.M1CollectorRuntime,
    MutableCollectorClock: harness.MutableCollectorClock,
    RecordingCollectorStore: harness.RecordingCollectorStore,
    createPublicRestCollectorAdapterRuntime:
      adapter.createPublicRestCollectorAdapterRuntime,
  });
}

function setupRuntime(runtimeModule, assets, sourceCommit) {
  const clock = new runtimeModule.MutableCollectorClock(
    "2026-01-15T00:00:00.500Z",
  );
  const provider = new runtimeModule.FullScopeProviderHarness(clock);
  for (const venue of [
    "BINANCE_FUTURES",
    "OKX_SWAP",
    "BYBIT_LINEAR_PERPETUAL",
  ]) {
    provider.assetsByVenue[venue] = [...assets];
  }
  const store = new runtimeModule.RecordingCollectorStore();
  const adapterRuntime =
    runtimeModule.createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    });
  const runtime = new runtimeModule.M1CollectorRuntime({
    adapterRuntime,
    clock,
    config: collectorConfig(sourceCommit),
    store,
  });
  return { clock, provider, runtime, store };
}

function assertCycleTruth(result, policy, expectedTrigger) {
  const expected = policy.performanceBaseline;
  assert.equal(result.telemetry.trigger, expectedTrigger);
  assert.equal(result.telemetry.state, "READY");
  assert.equal(
    result.telemetry.coverage.eligibleCount,
    expected.expectedEligibleInstrumentCount,
  );
  assert.equal(
    result.telemetry.coverage.collectedCount,
    expected.expectedEligibleInstrumentCount,
  );
  assert.equal(
    result.telemetry.coverage.usablePriceCount,
    expected.expectedEligibleInstrumentCount,
  );
  assert.equal(
    result.telemetry.coverage.freshCount,
    expected.expectedEligibleInstrumentCount,
  );
  assert.equal(result.telemetry.coverage.freshCoverage.ratio, 1);
  assert.equal(result.telemetry.coverage.priceUsabilityCoverage.ratio, 1);
  if (expectedTrigger === "STARTUP_FULL") {
    assert.equal(
      result.telemetry.coverage.providerObservedCount,
      expected.expectedObservedInstrumentCount,
    );
  } else {
    assert.equal(result.telemetry.coverage.providerObservedCount, null);
  }
}

async function measureCycle(runtime, expectedTrigger, policy) {
  const cpuStart = process.cpuUsage();
  const wallStart = process.hrtime.bigint();
  const result = await runtime.runNextCycle();
  const wallMs = millisecondsFromHrtime(wallStart);
  const cpuMs = cpuMilliseconds(cpuStart);
  assertCycleTruth(result, policy, expectedTrigger);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  const memory = process.memoryUsage();
  return Object.freeze({
    cpuMs,
    heapUsedBytes: memory.heapUsed,
    wallMs,
  });
}

function summarizeSamples(samples) {
  const walls = samples.map((sample) => sample.wallMs);
  const cpus = samples.map((sample) => sample.cpuMs);
  return Object.freeze({
    sampleCount: samples.length,
    latencyMs: {
      max: round(Math.max(...walls)),
      p50: round(percentile(walls, 0.5)),
      p95: round(percentile(walls, 0.95)),
    },
    cpuMs: {
      max: round(Math.max(...cpus)),
      p50: round(percentile(cpus, 0.5)),
      p95: round(percentile(cpus, 0.95)),
    },
  });
}

export function evaluateA0PerformanceMetrics({
  metrics,
  policy,
  sampleAccounting,
}) {
  const expected = policy.performanceBaseline;
  const budgets = expected.budgets;
  const checks = Object.freeze({
    coldCpuP95WithinBudget:
      metrics.cold.cpuMs.p95 <= budgets.coldCpuP95Ms,
    coldLatencyP95WithinBudget:
      metrics.cold.latencyMs.p95 <= budgets.coldLatencyP95Ms,
    eventLoopDelayWithinBudget:
      metrics.eventLoopDelayP99Ms <= budgets.eventLoopDelayP99Ms,
    heapWithinBudget:
      metrics.maximumHeapUsedMiB <= budgets.maximumHeapUsedMiB,
    incrementalCpuP95WithinBudget:
      metrics.incremental.cpuMs.p95 <= budgets.incrementalCpuP95Ms,
    incrementalLatencyP95WithinBudget:
      metrics.incremental.latencyMs.p95 <=
        budgets.incrementalLatencyP95Ms,
    measuredCycleFloorMet:
      sampleAccounting.cold + sampleAccounting.incremental >=
        expected.minimumMeasuredCycles,
    measuredCycleIdentityExact:
      sampleAccounting.cold === expected.measuredColdCycles &&
      sampleAccounting.incremental === expected.measuredIncrementalCycles,
    rssWithinBudget:
      metrics.maximumRssMiB <= budgets.maximumRssMiB,
    throughputWithinBudget:
      metrics.incrementalInstrumentThroughputPerSecondP05 >=
        budgets.minimumIncrementalInstrumentThroughputPerSecond,
  });
  return Object.freeze({
    checks,
    status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED",
  });
}

export async function runA0PerformanceResourceBaseline({
  outputPath,
  repositoryRoot,
  sourceCommit,
  verifyCleanSource = true,
}) {
  assertCommit(sourceCommit);
  const root = resolve(repositoryRoot);
  const policyBinding = await loadA0ReleaseQualificationPolicy(root);
  const { policy } = policyBinding;
  if (verifyCleanSource) {
    assert.equal(await git(root, ["rev-parse", "HEAD"]), sourceCommit);
    assert.equal(
      await git(root, ["status", "--porcelain", "--untracked-files=all"]),
      "",
      "performance baseline requires an exact clean source",
    );
    assert.equal(process.version, `v${policy.runtimeArtifact.nodeVersion}`);
    const { stdout } = await execFileAsync("npm", ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(stdout.trim(), policy.runtimeArtifact.npmVersion);
  }
  const sourceTree = await git(root, [
    "rev-parse",
    `${sourceCommit}^{tree}`,
  ]);
  assertCommit(sourceTree, "source tree");
  const assets = frozenA0WorkloadAssets(
    policy.performanceBaseline.assetCountPerVenue,
  );
  const workloadCore = {
    workloadVersion: policy.performanceBaseline.workloadVersion,
    assets,
    config: collectorConfig(sourceCommit),
    expectedObservedInstrumentCount:
      policy.performanceBaseline.expectedObservedInstrumentCount,
    expectedEligibleInstrumentCount:
      policy.performanceBaseline.expectedEligibleInstrumentCount,
    cycleIntervalMs: policy.performanceBaseline.cycleIntervalMs,
    warmupIncrementalCycles:
      policy.performanceBaseline.warmupIncrementalCycles,
    measuredColdCycles: policy.performanceBaseline.measuredColdCycles,
    measuredIncrementalCycles:
      policy.performanceBaseline.measuredIncrementalCycles,
    garbageCollectionMode:
      "SINGLE_PRE_MEASUREMENT_FORCED_GC_IF_AVAILABLE",
  };
  const workloadDigest = stableDigest(workloadCore);
  const runtimeModule = loadCollectorRuntime(root);
  globalThis.gc?.();
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));

  const coldSamples = [];
  const memorySamples = [];
  for (
    let index = 0;
    index < policy.performanceBaseline.measuredColdCycles;
    index += 1
  ) {
    const setup = setupRuntime(runtimeModule, assets, sourceCommit);
    const sample = await measureCycle(
      setup.runtime,
      "STARTUP_FULL",
      policy,
    );
    coldSamples.push(sample);
    memorySamples.push(sample.heapUsedBytes);
  }

  const incrementalSetup = setupRuntime(runtimeModule, assets, sourceCommit);
  await incrementalSetup.runtime.runNextCycle();
  for (
    let index = 0;
    index < policy.performanceBaseline.warmupIncrementalCycles;
    index += 1
  ) {
    incrementalSetup.clock.advance(
      policy.performanceBaseline.cycleIntervalMs,
    );
    const result = await incrementalSetup.runtime.runNextCycle();
    assertCycleTruth(result, policy, "INCREMENTAL_MARK_PRICE");
  }
  const incrementalSamples = [];
  for (
    let index = 0;
    index < policy.performanceBaseline.measuredIncrementalCycles;
    index += 1
  ) {
    incrementalSetup.clock.advance(
      policy.performanceBaseline.cycleIntervalMs,
    );
    const sample = await measureCycle(
      incrementalSetup.runtime,
      "INCREMENTAL_MARK_PRICE",
      policy,
    );
    incrementalSamples.push(sample);
    memorySamples.push(sample.heapUsedBytes);
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  delay.disable();

  const cold = summarizeSamples(coldSamples);
  const incremental = summarizeSamples(incrementalSamples);
  const throughputSamples = incrementalSamples.map((sample) =>
    policy.performanceBaseline.expectedEligibleInstrumentCount /
      (sample.wallMs / 1_000)
  );
  const metrics = Object.freeze({
    cold,
    incremental,
    eventLoopDelayP99Ms: round(delay.percentile(99) / 1_000_000),
    incrementalInstrumentThroughputPerSecondP05: round(
      percentile(throughputSamples, 0.05),
    ),
    maximumHeapUsedMiB: round(
      Math.max(...memorySamples) / (1024 * 1024),
    ),
    maximumRssMiB: round(
      process.resourceUsage().maxRSS / 1024,
    ),
  });
  const sampleAccounting = Object.freeze({
    cold: coldSamples.length,
    incremental: incrementalSamples.length,
    warmupIncremental:
      policy.performanceBaseline.warmupIncrementalCycles,
  });
  const evaluation = evaluateA0PerformanceMetrics({
    metrics,
    policy,
    sampleAccounting,
  });
  const evidenceCore = {
    schemaVersion: A0_PERFORMANCE_EVIDENCE_SCHEMA,
    status: evaluation.status === "PASS"
      ? "PASS_FROZEN_ENGINEERING_RESOURCE_BASELINE"
      : "BLOCKED_FROZEN_ENGINEERING_RESOURCE_BASELINE",
    evidenceClass: policy.performanceBaseline.evidenceClass,
    sourceCommit,
    sourceTree,
    policyDigest: policyBinding.digest,
    workload: {
      workloadVersion: policy.performanceBaseline.workloadVersion,
      workloadDigest,
      venueCount: policy.performanceBaseline.venueCount,
      assetCountPerVenue:
        policy.performanceBaseline.assetCountPerVenue,
      expectedObservedInstrumentCount:
        policy.performanceBaseline.expectedObservedInstrumentCount,
      expectedEligibleInstrumentCount:
        policy.performanceBaseline.expectedEligibleInstrumentCount,
      cycleIntervalMs: policy.performanceBaseline.cycleIntervalMs,
      garbageCollectionMode:
        "SINGLE_PRE_MEASUREMENT_FORCED_GC_IF_AVAILABLE",
      providerMode: "FROZEN_IN_MEMORY_PUBLIC_JSON_TRANSPORT",
      storeMode: "FROZEN_IN_MEMORY_ATOMIC_ARTIFACT_STORE",
      liveMarketDataUsed: false,
    },
    sampleAccounting,
    metrics,
    budgets: policy.performanceBaseline.budgets,
    checks: evaluation.checks,
    runner: {
      platform: platform(),
      architecture: arch(),
      logicalCpuCount: cpus().length,
      totalMemoryMiB: Math.round(totalmem() / (1024 * 1024)),
      nodeVersion: process.version.slice(1),
    },
    claims: {
      collectorCoreEngineeringBaseline: true,
      liveProviderCapacity: false,
      liveDatabaseCapacity: false,
      fourVenueScopeV2Capacity: false,
      productionRead: false,
      productionMutation: false,
      automaticTradingAllowed: false,
    },
  };
  const evidence = {
    ...evidenceCore,
    evidenceHash: stableDigest(evidenceCore),
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true, mode: 0o700 });
  await writeFile(resolve(outputPath), canonicalJson(evidence), {
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze(evidence);
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    assert.ok(separator > 2 && argument.startsWith("--"), "invalid argument");
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  return values;
}

const entryPath = process.argv[1] === undefined
  ? ""
  : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const values = parseArguments(process.argv.slice(2));
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const outputPath = values.get("output");
  const sourceCommit = values.get("source-commit");
  assert.ok(outputPath, "--output is required");
  assertCommit(sourceCommit);
  const evidence = await runA0PerformanceResourceBaseline({
    outputPath,
    repositoryRoot,
    sourceCommit,
  });
  process.stdout.write(`${JSON.stringify({
    evidenceHash: evidence.evidenceHash,
    metrics: evidence.metrics,
    status: evidence.status,
  })}\n`);
  if (!evidence.status.startsWith("PASS_")) process.exitCode = 1;
}
