import assert from "node:assert/strict";
import test from "node:test";
import {
  FullScopeProviderHarness,
  MutableCollectorClock,
  RecordingCollectorStore,
} from "../../../testing/m1-collector-harness";
import type { PublicJsonTransport } from "../../universe/public-json-transport";
import { createPublicRestCollectorAdapterRuntime } from "./adapters/public-rest-adapter-runtime";
import type { M1CollectorCheckpoint } from "./checkpoint-contract";
import {
  createM1CollectorWorker,
  type CollectorWorkerScheduler,
  type CollectorWorkerTelemetrySink,
} from "./collector-worker";
import type {
  CollectorCheckpointRepository,
  M1RestoredCollectorCheckpoint,
  M1StoredCollectorCheckpoint,
} from "./postgres-checkpoint-store";
import type { CollectorRuntimeConfig } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1_000;

function runtimeConfig(): CollectorRuntimeConfig {
  return {
    maxFactAgeMs: 5_000,
    maxSequenceGapMs: 60_000,
    policyVersion: "m1-full-linear-usdt-perpetual.v1",
    reconciliationIntervalMs: DAY_MS,
    releaseId: "m1-5-worker-test",
    retentionMs: 730 * DAY_MS,
  };
}

class MemoryCheckpointRepository implements CollectorCheckpointRepository {
  readonly appended: M1CollectorCheckpoint[] = [];
  failNext = false;
  restored: M1RestoredCollectorCheckpoint | null = null;

  async appendCheckpoint(checkpoint: M1CollectorCheckpoint): Promise<Readonly<{
    status: "INSERTED";
    stored: M1StoredCollectorCheckpoint;
  }>> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("injected checkpoint failure");
    }
    this.appended.push(checkpoint);
    return {
      status: "INSERTED",
      stored: {
        checkpoint,
        idempotencyKey: `test:${checkpoint.checkpointId}`,
        persistedAt: checkpoint.generatedAt,
        writerIdentity: "test-checkpoint-writer",
      },
    };
  }

  async loadLatest(): Promise<M1RestoredCollectorCheckpoint | null> {
    return this.restored;
  }
}

class AdvancingScheduler implements CollectorWorkerScheduler {
  readonly #clock: MutableCollectorClock;

  constructor(clock: MutableCollectorClock) {
    this.#clock = clock;
  }

  async sleep(ms: number, signal: AbortSignal): Promise<"ABORTED" | "ELAPSED"> {
    if (signal.aborted) {
      return "ABORTED";
    }
    this.#clock.advance(ms);
    return "ELAPSED";
  }
}

async function setup(input: {
  checkpointRepository?: MemoryCheckpointRepository;
  store?: RecordingCollectorStore;
  telemetrySink?: CollectorWorkerTelemetrySink;
  transport?: PublicJsonTransport;
} = {}) {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  const checkpointRepository = input.checkpointRepository ??
    new MemoryCheckpointRepository();
  const store = input.store ?? new RecordingCollectorStore();
  const worker = await createM1CollectorWorker({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({
      clock,
      transport: input.transport ?? provider.transport,
    }),
    artifactStore: store,
    checkpointRepository,
    clock,
    runtimeConfig: runtimeConfig(),
    scheduler: new AdvancingScheduler(clock),
    telemetrySink: input.telemetrySink ?? (() => undefined),
    workerConfig: { cycleIntervalMs: 1_000 },
    workerRunId: "worker-run:test",
  });
  return { checkpointRepository, clock, provider, store, worker };
}

test("runs fixed-rate no-authority cycles and only becomes ready after checkpoint", async () => {
  const { checkpointRepository, worker } = await setup();
  const report = await worker.run({ maxCycles: 2 });

  assert.equal(report.status, "COMPLETED");
  assert.equal(report.exitCode, 0);
  assert.equal(report.restore.status, "COLD_START");
  assert.equal(report.startupReadiness, "NOT_READY");
  assert.equal(report.authorityMode, "NO_AUTHORITY");
  assert.equal(report.automaticTradingAllowed, false);
  assert.equal(report.cycles.length, 2);
  assert.ok(report.cycles.every(
    (cycle) => cycle.operationalReadiness === "READY",
  ));
  assert.ok(report.cycles.every(
    (cycle) => cycle.checkpoint.status === "INSERTED",
  ));
  assert.equal(checkpointRepository.appended.length, 2);
  await assert.rejects(
    () => worker.run({ maxCycles: 1 }),
    /single-use/u,
  );
});

test("skips missed fixed-rate starts instead of stacking overlapping catch-up cycles", async () => {
  const clock = new MutableCollectorClock("2026-01-15T00:00:00.500Z");
  const provider = new FullScopeProviderHarness(clock);
  let delayed = false;
  const transport: PublicJsonTransport = async (request) => {
    if (!delayed) {
      delayed = true;
      clock.advance(2_500);
    }
    return provider.transport(request);
  };
  const checkpointRepository = new MemoryCheckpointRepository();
  const worker = await createM1CollectorWorker({
    adapterRuntime: createPublicRestCollectorAdapterRuntime({ clock, transport }),
    artifactStore: new RecordingCollectorStore(),
    checkpointRepository,
    clock,
    runtimeConfig: runtimeConfig(),
    scheduler: new AdvancingScheduler(clock),
    telemetrySink: () => undefined,
    workerConfig: { cycleIntervalMs: 1_000 },
    workerRunId: "worker-run:missed-start",
  });

  const report = await worker.run({ maxCycles: 2 });

  assert.equal(report.cycles.length, 2);
  assert.equal(report.cycles[0]?.missedScheduleStarts, 0);
  assert.equal(report.cycles[1]?.missedScheduleStarts, 2);
  assert.equal(report.cycles[1]?.scheduleLagMs, 0);
});

test("fails closed and stops when checkpoint persistence fails", async () => {
  const checkpointRepository = new MemoryCheckpointRepository();
  checkpointRepository.failNext = true;
  const { worker } = await setup({ checkpointRepository });

  const report = await worker.run({ maxCycles: 3 });

  assert.equal(report.status, "FAILED");
  assert.equal(report.exitCode, 1);
  assert.equal(report.stopReason, "CHECKPOINT_PERSISTENCE_FAILED");
  assert.equal(report.cycles.length, 1);
  assert.equal(report.cycles[0]?.checkpoint.status, "FAILED");
  assert.equal(report.cycles[0]?.operationalReadiness, "NOT_READY");
});

test("does not attempt a checkpoint after artifact persistence failure", async () => {
  const checkpointRepository = new MemoryCheckpointRepository();
  const store = new RecordingCollectorStore();
  store.failNext = true;
  const { worker } = await setup({ checkpointRepository, store });

  const report = await worker.run({ maxCycles: 3 });

  assert.equal(report.status, "FAILED");
  assert.equal(report.stopReason, "ARTIFACT_PERSISTENCE_FAILED");
  assert.equal(report.cycles.length, 1);
  assert.equal(report.cycles[0]?.checkpoint.status, "NOT_ATTEMPTED");
  assert.equal(checkpointRepository.appended.length, 0);
});

test("drains the current durable boundary before honoring a stop request", async () => {
  const abortController = new AbortController();
  const { worker } = await setup({
    telemetrySink: () => abortController.abort(),
  });

  const report = await worker.run({
    maxCycles: 5,
    signal: abortController.signal,
  });

  assert.equal(report.status, "STOPPED");
  assert.equal(report.stopReason, "STOP_REQUESTED");
  assert.equal(report.cycles.length, 1);
  assert.equal(report.cycles[0]?.checkpoint.status, "INSERTED");
});

test("refuses overlapping worker run loops", async () => {
  let releaseRequest: (() => void) | undefined;
  let blocked = true;
  const base = await setup();
  const transport: PublicJsonTransport = async (request) => {
    if (blocked) {
      blocked = false;
      await new Promise<void>((resolve) => {
        releaseRequest = resolve;
      });
    }
    return base.provider.transport(request);
  };
  const { worker } = await setup({ transport });
  const first = worker.run({ maxCycles: 1 });
  await new Promise<void>((resolve) => setImmediate(resolve));

  await assert.rejects(
    () => worker.run({ maxCycles: 1 }),
    /refuses overlapping run loops/u,
  );
  assert.ok(releaseRequest);
  releaseRequest();
  const report = await first;
  assert.equal(report.status, "COMPLETED");
});
