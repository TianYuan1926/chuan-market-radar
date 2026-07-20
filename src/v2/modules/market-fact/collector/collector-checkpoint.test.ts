import assert from "node:assert/strict";
import test from "node:test";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
  RecordingCollectorStore,
} from "../../../testing/m1-collector-harness";
import {
  buildM1CollectorCheckpoint,
  CollectorCheckpointError,
  restoreCollectorDurableState,
  validateM1CollectorCheckpoint,
} from "./checkpoint-contract";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";
import { M1CollectorRuntime } from "./collector-runtime";
import type { CollectorRuntimeConfig } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

function config(overrides: Partial<CollectorRuntimeConfig> = {}): CollectorRuntimeConfig {
  return {
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "m1-full-linear-usdt-perpetual.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: "m1-5-checkpoint-test",
    retentionMs: 730 * DAY_MS,
    ...overrides,
  };
}

async function persistedCycle() {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const runtimeConfig = config();
  const runtime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    }),
    clock,
    config: runtimeConfig,
    store: new RecordingCollectorStore(),
  });
  const result = await runtime.runNextCycle();
  return { clock, provider, result, runtimeConfig };
}

test("builds one content-addressed no-authority checkpoint from a persisted cycle", async () => {
  const { result, runtimeConfig } = await persistedCycle();
  const checkpoint = buildM1CollectorCheckpoint({ result, runtimeConfig });

  assert.equal(checkpoint.authorityMode, "NO_AUTHORITY");
  assert.equal(checkpoint.automaticTradingAllowed, false);
  assert.equal(checkpoint.runtimeState, "READY");
  assert.equal(checkpoint.nextCycleOrdinal, 1);
  assert.equal(checkpoint.universeSnapshotId, result.artifacts?.universe.snapshotId);
  assert.equal(
    checkpoint.factQualitySnapshotId,
    result.artifacts?.factQuality.snapshotId,
  );
  assert.ok(checkpoint.checkpointDigest.startsWith("sha256:"));
  assert.equal(Object.isFrozen(checkpoint), true);
});

test("rejects checkpoint sequence, digest and authority tampering", async () => {
  const { result, runtimeConfig } = await persistedCycle();
  const checkpoint = buildM1CollectorCheckpoint({ result, runtimeConfig });

  assert.throws(
    () => validateM1CollectorCheckpoint({
      ...checkpoint,
      sequenceState: {
        ...checkpoint.sequenceState,
        "unknown:instrument": "1",
      },
    }),
    CollectorCheckpointError,
  );
  assert.throws(
    () => validateM1CollectorCheckpoint({
      ...checkpoint,
      checkpointDigest: `sha256:${"0".repeat(64)}`,
    }),
    CollectorCheckpointError,
  );
  assert.throws(
    () => validateM1CollectorCheckpoint({
      ...checkpoint,
      automaticTradingAllowed: true,
    }),
    CollectorCheckpointError,
  );
});

test("restores exact universe, sequence, schedule and ordinal for ticker-only continuation", async () => {
  const { clock, result, runtimeConfig } = await persistedCycle();
  assert.ok(result.artifacts);
  const checkpoint = buildM1CollectorCheckpoint({ result, runtimeConfig });
  const durableState = restoreCollectorDurableState({
    checkpoint,
    factQuality: result.artifacts.factQuality,
    runtimeConfig,
    universe: result.artifacts.universe,
  });
  const providerAfterRestart = new FullScopeProviderHarness(clock);
  const restoredRuntime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: providerAfterRestart.transport,
    }),
    clock,
    config: runtimeConfig,
    restoredState: durableState,
    store: new RecordingCollectorStore(),
  });
  clock.advance(1_000);

  const continued = await restoredRuntime.runNextCycle();

  assert.equal(continued.telemetry.trigger, "INCREMENTAL_TICKER");
  assert.equal(continued.telemetry.state, "READY");
  assert.ok(continued.telemetry.cycleId.endsWith(":1"));
  assert.equal(
    providerAfterRestart.calls.filter((call) => call.operation === "CATALOG").length,
    0,
  );
  assert.equal(
    providerAfterRestart.calls.filter((call) => call.operation === "TICKER").length,
    3,
  );
});

test("fails closed when a checkpoint is applied to another release or config", async () => {
  const { result, runtimeConfig } = await persistedCycle();
  assert.ok(result.artifacts);
  const checkpoint = buildM1CollectorCheckpoint({ result, runtimeConfig });

  assert.throws(
    () => restoreCollectorDurableState({
      checkpoint,
      factQuality: result.artifacts!.factQuality,
      runtimeConfig: config({ releaseId: "another-release" }),
      universe: result.artifacts!.universe,
    }),
    (error: unknown) =>
      error instanceof CollectorCheckpointError &&
      error.code === "CHECKPOINT_CONFIGURATION_MISMATCH",
  );
  assert.throws(
    () => restoreCollectorDurableState({
      checkpoint,
      factQuality: result.artifacts!.factQuality,
      runtimeConfig: config({ maxFactAgeMs: 9_999 }),
      universe: result.artifacts!.universe,
    }),
    (error: unknown) =>
      error instanceof CollectorCheckpointError &&
      error.code === "CHECKPOINT_CONFIGURATION_MISMATCH",
  );
});

test("refuses to build a checkpoint after artifact persistence failure", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const store = new RecordingCollectorStore();
  store.failNext = true;
  const runtimeConfig = config();
  const runtime = new M1CollectorRuntime({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: provider.transport,
    }),
    clock,
    config: runtimeConfig,
    store,
  });
  const result = await runtime.runNextCycle();

  assert.equal(result.durableState, null);
  assert.throws(
    () => buildM1CollectorCheckpoint({ result, runtimeConfig }),
    CollectorCheckpointError,
  );
});
