import assert from "node:assert/strict";
import test from "node:test";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
  RecordingCollectorStore,
} from "../../../testing/m1-collector-harness";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";
import { M1CollectorRuntime } from "./collector-runtime";
import { CollectorCycleTelemetrySchema } from "./collector-telemetry-schema";
import type { CollectorRuntimeConfig } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

function config(): CollectorRuntimeConfig {
  return {
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "m1-full-linear-usdt-perpetual.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: "m1-4-test-release",
    retentionMs: 730 * DAY_MS,
  };
}

function setup(overrides: Partial<CollectorRuntimeConfig> = {}) {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const store = new RecordingCollectorStore();
  const adapterRuntime = createPublicRestCollectorAdapterRuntime({
    clock,
    transport: provider.transport,
  });
  const runtime = new M1CollectorRuntime({
    adapterRuntime,
    clock,
    config: { ...config(), ...overrides },
    store,
  });
  return { clock, provider, runtime, store };
}

test("collects the complete multi-instrument denominator and persists one atomic M1 slice", async () => {
  const { provider, runtime, store } = setup();
  const result = await runtime.runNextCycle();

  assert.equal(result.telemetry.trigger, "STARTUP_FULL");
  assert.equal(result.telemetry.state, "READY");
  assert.equal(result.telemetry.persistence, "INSERTED");
  assert.equal(result.telemetry.coverage.providerObservedCount, 21);
  assert.equal(result.telemetry.coverage.accountedCount, 21);
  assert.equal(result.telemetry.coverage.eligibleCount, 15);
  assert.equal(result.telemetry.coverage.collectedCount, 15);
  assert.equal(result.telemetry.coverage.freshCount, 15);
  assert.deepEqual(result.telemetry.coverage.freshCoverage, {
    denominator: 15,
    numerator: 15,
    ratio: 1,
  });
  assert.ok(result.artifacts);
  assert.equal(result.artifacts.universe.accounting.length, 21);
  assert.equal(result.artifacts.facts.length, 15);
  assert.equal(store.calls.length, 1);
  assert.equal(store.calls[0]?.length, 17);
  assert.equal(provider.calls.filter((call) => call.operation === "CATALOG").length, 4);
  assert.equal(provider.calls.filter((call) => call.operation === "TICKER").length, 3);
  assert.ok(result.telemetry.request.maxGlobalConcurrencyObserved <= 2);
  assert.ok(result.telemetry.request.maxQueueDepthObserved >= 1);
  assert.ok(result.telemetry.request.venues.every(
    (venue) => venue.maxConcurrentObserved <= 1,
  ));
  assert.equal(Object.isFrozen(result.telemetry), true);
  assert.equal(Object.isFrozen(result.telemetry.coverage.venues), true);
});

test("runs ticker-only incrementally without pretending that catalog was observed again", async () => {
  const { clock, provider, runtime } = setup();
  const first = await runtime.runNextCycle();
  const catalogCalls = provider.calls.filter(
    (call) => call.operation === "CATALOG",
  ).length;
  clock.advance(1_000);

  const second = await runtime.runNextCycle();

  assert.equal(second.telemetry.trigger, "INCREMENTAL_TICKER");
  assert.equal(second.telemetry.state, "READY");
  assert.equal(second.telemetry.coverage.providerObservedCount, null);
  assert.equal(second.telemetry.persistence, "MIXED_INSERT_AND_IDEMPOTENT");
  assert.equal(second.artifacts?.universe.snapshotId, first.artifacts?.universe.snapshotId);
  assert.equal(
    provider.calls.filter((call) => call.operation === "CATALOG").length,
    catalogCalls,
  );
  assert.equal(provider.calls.filter((call) => call.operation === "TICKER").length, 6);
});

test("keeps a vanished instrument in the accounting denominator as a tombstone", async () => {
  const { clock, provider, runtime } = setup({
    reconciliationIntervalMs: 1_000,
  });
  await runtime.runNextCycle();
  provider.assetsByVenue.BINANCE_FUTURES =
    provider.assetsByVenue.BINANCE_FUTURES.filter((asset) => asset !== "DOGE");
  clock.advance(1_001);

  const reconciled = await runtime.runNextCycle();
  const carried = reconciled.artifacts?.universe.accounting.find(
    (record) =>
      record.venue === "BINANCE_FUTURES" &&
      record.venueInstrumentId === "DOGEUSDT",
  );

  assert.equal(reconciled.telemetry.trigger, "PERIODIC_RECONCILIATION");
  assert.equal(reconciled.telemetry.coverage.providerObservedCount, 20);
  assert.equal(reconciled.telemetry.coverage.accountedCount, 21);
  assert.equal(reconciled.telemetry.coverage.eligibleCount, 14);
  assert.equal(reconciled.telemetry.coverage.carriedForwardCount, 1);
  assert.equal(reconciled.telemetry.state, "READY");
  assert.ok(carried);
  assert.equal(carried.eligible, false);
  assert.equal(carried.status, "DELISTING");
  assert.ok(
    carried.statusReasons.includes(
      "collector_carried_missing_from_complete_catalog",
    ),
  );
});

test("retains the complete prior Bybit denominator when a later catalog page fails", async () => {
  const { clock, provider, runtime } = setup({
    reconciliationIntervalMs: 1_000,
  });
  await runtime.runNextCycle();
  provider.setFailure("BYBIT_LINEAR_PERPETUAL:CATALOG_PAGE_2", {
    kind: "TRANSPORT_ERROR",
    reasonCode: "provider_request_failed",
  });
  clock.advance(1_001);

  const result = await runtime.runNextCycle();
  const bybit = result.artifacts?.universe.accounting.filter(
    (record) => record.venue === "BYBIT_LINEAR_PERPETUAL",
  ) ?? [];

  assert.equal(result.telemetry.trigger, "PERIODIC_RECONCILIATION");
  assert.equal(result.telemetry.state, "DEGRADED");
  assert.equal(result.telemetry.coverage.providerObservedCount, 17);
  assert.equal(result.telemetry.coverage.accountedCount, 21);
  assert.equal(result.telemetry.coverage.eligibleCount, 10);
  assert.equal(result.telemetry.coverage.carriedForwardCount, 4);
  assert.equal(bybit.length, 7);
  assert.ok(bybit.every((record) => !record.eligible));
  assert.ok(result.telemetry.providerFailures.some(
    (failure) => failure.reasonCode === "bybit_pagination_incomplete",
  ));
});

test("persists truthful null facts on provider failure and recovers through full reconciliation", async () => {
  const { clock, provider, runtime } = setup();
  await runtime.runNextCycle();
  clock.advance(1_000);
  provider.setFailure("BINANCE_FUTURES:TICKER", {
    kind: "RATE_LIMITED",
    reasonCode: "provider_http_429",
  });

  const failed = await runtime.runNextCycle();
  assert.equal(failed.telemetry.trigger, "INCREMENTAL_TICKER");
  assert.equal(failed.telemetry.state, "BACKPRESSURED");
  assert.equal(failed.telemetry.persistence, "MIXED_INSERT_AND_IDEMPOTENT");
  assert.equal(failed.telemetry.coverage.eligibleCount, 15);
  assert.equal(failed.telemetry.coverage.collectedCount, 10);
  assert.equal(failed.telemetry.coverage.freshCount, 10);
  assert.equal(
    failed.artifacts?.facts.filter((fact) => fact.value === null).length,
    5,
  );

  provider.clearFailures();
  clock.advance(60_001);
  const gapDetected = await runtime.runNextCycle();
  assert.equal(gapDetected.telemetry.trigger, "RECOVERY");
  assert.equal(gapDetected.telemetry.state, "DEGRADED");
  assert.equal(gapDetected.telemetry.recovery.attempted, true);
  assert.equal(gapDetected.telemetry.recovery.succeeded, false);
  assert.ok(
    gapDetected.telemetry.recovery.previousFailureReasons.includes(
      "provider_http_429",
    ),
  );
  assert.ok(gapDetected.telemetry.reasons.includes("ticker_sequence_gap"));

  clock.advance(1_000);
  const recovered = await runtime.runNextCycle();
  assert.equal(recovered.telemetry.trigger, "RECOVERY");
  assert.equal(recovered.telemetry.state, "READY");
  assert.equal(recovered.telemetry.recovery.succeeded, true);
});

test("does not advance its checkpoint when durable storage rejects a cycle", async () => {
  const { clock, runtime, store } = setup();
  store.failNext = true;
  const failed = await runtime.runNextCycle();

  assert.equal(failed.telemetry.trigger, "STARTUP_FULL");
  assert.equal(failed.telemetry.persistence, "FAILED");
  assert.equal(failed.telemetry.state, "DEGRADED");
  assert.ok(failed.telemetry.reasons.includes("m1_store_append_failed"));

  clock.advance(60_001);
  const recovered = await runtime.runNextCycle();
  assert.equal(recovered.telemetry.trigger, "RECOVERY");
  assert.equal(recovered.telemetry.recovery.succeeded, true);
  assert.equal(recovered.telemetry.state, "READY");
});

test("treats an incomplete store acknowledgement as a failed persistence boundary", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const runtime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    }),
    clock,
    config: config(),
    store: { appendArtifacts: async () => [] },
  });

  const result = await runtime.runNextCycle();
  assert.equal(result.telemetry.persistence, "FAILED");
  assert.equal(result.telemetry.state, "DEGRADED");
  assert.ok(
    result.telemetry.reasons.includes("m1_store_append_result_mismatch"),
  );
});

test("keeps a cold all-provider outage unavailable instead of reporting an empty healthy market", async () => {
  const { provider, runtime, store } = setup();
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

  const result = await runtime.runNextCycle();
  assert.equal(result.telemetry.state, "DEGRADED");
  assert.equal(result.telemetry.coverage.accountedCount, 0);
  assert.equal(result.telemetry.coverage.eligibleCount, 0);
  assert.equal(result.telemetry.coverage.freshCoverage.ratio, null);
  assert.equal(result.artifacts?.facts.length, 0);
  assert.equal(result.artifacts?.factQuality.quality.status, "UNAVAILABLE");
  assert.equal(store.calls[0]?.length, 2);
});

test("rejects overlapping collector cycles", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  let releaseFirst: (() => void) | undefined;
  let blockFirst = true;
  const adapterRuntime = createPublicRestCollectorAdapterRuntime({
    clock,
    transport: async (request) => {
      if (blockFirst) {
        blockFirst = false;
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return provider.transport(request);
    },
  });
  const runtime = new M1CollectorRuntime({
    adapterRuntime,
    clock,
    config: config(),
    store: new RecordingCollectorStore(),
  });
  const first = runtime.runNextCycle();
  await new Promise<void>((resolve) => setImmediate(resolve));

  await assert.rejects(
    () => runtime.runNextCycle(),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CYCLE_ALREADY_RUNNING",
  );
  assert.ok(releaseFirst);
  releaseFirst();
  const completed = await first;
  assert.equal(completed.telemetry.state, "READY");
});

test("rejects telemetry whose aggregate denominator or READY truth was altered", async () => {
  const { runtime } = setup();
  const result = await runtime.runNextCycle();

  assert.equal(CollectorCycleTelemetrySchema.safeParse({
    ...result.telemetry,
    coverage: {
      ...result.telemetry.coverage,
      freshCount: result.telemetry.coverage.freshCount - 1,
    },
  }).success, false);
  assert.equal(CollectorCycleTelemetrySchema.safeParse({
    ...result.telemetry,
    reasons: ["injected_false_ready_reason"],
  }).success, false);
});
