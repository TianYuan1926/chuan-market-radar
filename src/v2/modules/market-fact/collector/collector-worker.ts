import { randomUUID } from "node:crypto";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../../universe/stable-artifact";
import {
  buildM1CollectorCheckpoint,
  CollectorCheckpointError,
} from "./checkpoint-contract";
import type { CollectorCheckpointRepository } from "./postgres-checkpoint-store";
import { M1CollectorRuntime } from "./collector-runtime";
import {
  M1_COLLECTOR_WORKER_SCHEMA_VERSION,
  type CollectorWorkerStopReason,
  type M1CollectorWorkerCycle,
  type M1CollectorWorkerRunReport,
  parseM1CollectorWorkerCycle,
} from "./collector-worker-contract";
import type {
  CollectorAdapterRuntime,
  CollectorArtifactStore,
  CollectorClock,
  CollectorRuntimeConfig,
} from "./contracts";

export type CollectorWorkerScheduler = Readonly<{
  sleep(ms: number, signal: AbortSignal): Promise<"ABORTED" | "ELAPSED">;
}>;

export type CollectorWorkerResourceSampler = Readonly<{
  sample(): Readonly<{
    heapUsedBytes: number;
    rssBytes: number;
  }>;
}>;

export type CollectorWorkerTelemetrySink = (
  cycle: M1CollectorWorkerCycle,
) => Promise<void> | void;

export type CollectorWorkerConfig = Readonly<{
  cycleIntervalMs: number;
}>;

const systemScheduler: CollectorWorkerScheduler = Object.freeze({
  sleep: (ms, signal) => new Promise((resolve) => {
    if (signal.aborted) {
      resolve("ABORTED");
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve("ELAPSED");
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve("ABORTED");
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }),
});

const processResourceSampler: CollectorWorkerResourceSampler = Object.freeze({
  sample: () => {
    const memory = process.memoryUsage();
    return {
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
    };
  },
});

function nowMs(clock: CollectorClock): number {
  const value = clock.now().getTime();
  if (!Number.isFinite(value)) {
    throw new Error("collector worker clock returned an invalid instant");
  }
  return value;
}

function checkpointFailureReason(error: unknown): string {
  return error instanceof CollectorCheckpointError
    ? error.code.toLowerCase()
    : "checkpoint_append_failed";
}

function runStatus(stopReason: CollectorWorkerStopReason): {
  exitCode: 0 | 1;
  status: M1CollectorWorkerRunReport["status"];
} {
  if (stopReason === "MAX_CYCLES_REACHED") {
    return { exitCode: 0, status: "COMPLETED" };
  }
  if (stopReason === "STOP_REQUESTED") {
    return { exitCode: 0, status: "STOPPED" };
  }
  return { exitCode: 1, status: "FAILED" };
}

export class M1CollectorWorker {
  readonly #checkpointRepository: CollectorCheckpointRepository;
  readonly #clock: CollectorClock;
  readonly #config: CollectorWorkerConfig;
  readonly #resourceSampler: CollectorWorkerResourceSampler;
  readonly #restore: M1CollectorWorkerRunReport["restore"];
  readonly #runtime: M1CollectorRuntime;
  readonly #runtimeConfig: CollectorRuntimeConfig;
  readonly #scheduler: CollectorWorkerScheduler;
  readonly #stopController = new AbortController();
  readonly #telemetrySink: CollectorWorkerTelemetrySink;
  readonly #workerRunId: string;
  #hasRun = false;
  #running = false;

  constructor(input: {
    checkpointRepository: CollectorCheckpointRepository;
    clock: CollectorClock;
    config: CollectorWorkerConfig;
    resourceSampler?: CollectorWorkerResourceSampler;
    restore: M1CollectorWorkerRunReport["restore"];
    runtime: M1CollectorRuntime;
    runtimeConfig: CollectorRuntimeConfig;
    scheduler?: CollectorWorkerScheduler;
    telemetrySink: CollectorWorkerTelemetrySink;
    workerRunId?: string;
  }) {
    if (
      !Number.isSafeInteger(input.config.cycleIntervalMs) ||
      input.config.cycleIntervalMs <= 0
    ) {
      throw new Error("collector worker cycle interval must be a positive integer");
    }
    this.#checkpointRepository = input.checkpointRepository;
    this.#clock = input.clock;
    this.#config = input.config;
    this.#resourceSampler = input.resourceSampler ?? processResourceSampler;
    this.#restore = input.restore;
    this.#runtime = input.runtime;
    this.#runtimeConfig = input.runtimeConfig;
    this.#scheduler = input.scheduler ?? systemScheduler;
    this.#telemetrySink = input.telemetrySink;
    this.#workerRunId = input.workerRunId ??
      `collector-worker:${randomUUID()}`;
  }

  requestStop(): void {
    this.#stopController.abort();
  }

  async run(input: {
    maxCycles?: number;
    signal?: AbortSignal;
  } = {}): Promise<M1CollectorWorkerRunReport> {
    if (this.#running) {
      throw new Error("collector worker refuses overlapping run loops");
    }
    if (this.#hasRun) {
      throw new Error("collector worker instances are single-use");
    }
    const maxCycles = input.maxCycles ?? Number.POSITIVE_INFINITY;
    if (
      maxCycles !== Number.POSITIVE_INFINITY &&
      (!Number.isSafeInteger(maxCycles) || maxCycles <= 0)
    ) {
      throw new Error("collector worker maxCycles must be a positive integer");
    }
    this.#hasRun = true;
    const forwardStop = () => this.requestStop();
    input.signal?.addEventListener("abort", forwardStop, { once: true });
    if (input.signal?.aborted) {
      this.requestStop();
    }
    this.#running = true;
    const runStartedMs = nowMs(this.#clock);
    let nextScheduledMs = runStartedMs;
    let missedScheduleStarts = 0;
    const cycles: M1CollectorWorkerCycle[] = [];
    let stopReason: CollectorWorkerStopReason = "MAX_CYCLES_REACHED";

    try {
      while (cycles.length < maxCycles) {
        if (this.#stopController.signal.aborted) {
          stopReason = "STOP_REQUESTED";
          break;
        }
        const waitMs = Math.max(0, nextScheduledMs - nowMs(this.#clock));
        if (waitMs > 0) {
          const slept = await this.#scheduler.sleep(
            waitMs,
            this.#stopController.signal,
          );
          if (slept === "ABORTED") {
            stopReason = "STOP_REQUESTED";
            break;
          }
        }

        const startedMs = Math.max(nextScheduledMs, nowMs(this.#clock));
        let result;
        try {
          result = await this.#runtime.runNextCycle();
        } catch {
          stopReason = "RUNTIME_ERROR";
          break;
        }
        const dataQuality = result.artifacts?.factQuality.quality.status ??
          "UNAVAILABLE";
        let checkpointId: string | null = null;
        let checkpointPersistedAt: string | null = null;
        let checkpointStatus: M1CollectorWorkerCycle["checkpoint"]["status"] =
          "NOT_ATTEMPTED";
        let failureReason: string | null = null;

        if (
          result.durableState === null ||
          result.telemetry.persistence === "FAILED"
        ) {
          stopReason = "ARTIFACT_PERSISTENCE_FAILED";
        } else {
          try {
            const checkpoint = buildM1CollectorCheckpoint({
              result,
              runtimeConfig: this.#runtimeConfig,
            });
            checkpointId = checkpoint.checkpointId;
            const appended = await this.#checkpointRepository.appendCheckpoint(
              checkpoint,
            );
            checkpointStatus = appended.status;
            checkpointPersistedAt = appended.stored.persistedAt;
          } catch (error) {
            checkpointStatus = "FAILED";
            failureReason = checkpointFailureReason(error);
            stopReason = "CHECKPOINT_PERSISTENCE_FAILED";
          }
        }

        const completedMs = Math.max(startedMs, nowMs(this.#clock));
        const checkpointPersisted =
          checkpointStatus === "INSERTED" ||
          checkpointStatus === "IDEMPOTENT_REPLAY";
        const cycle = parseM1CollectorWorkerCycle({
          authorityMode: "NO_AUTHORITY",
          automaticTradingAllowed: false,
          checkpoint: {
            checkpointId,
            failureReason,
            persistedAt: checkpointPersistedAt,
            status: checkpointStatus,
          },
          completedAt: new Date(completedMs).toISOString(),
          cycleIndex: cycles.length + 1,
          dataQuality,
          missedScheduleStarts,
          operationalReadiness:
            result.telemetry.state === "READY" &&
            result.telemetry.persistence !== "FAILED" &&
            checkpointPersisted &&
            dataQuality === "FRESH"
              ? "READY"
              : "NOT_READY",
          releaseId: this.#runtimeConfig.releaseId,
          resources: this.#resourceSampler.sample(),
          runtime: result.telemetry,
          runtimeConfigDigest: stableContentHash(this.#runtimeConfig),
          scheduleLagMs: startedMs - nextScheduledMs,
          scheduledAt: new Date(nextScheduledMs).toISOString(),
          schemaVersion: M1_COLLECTOR_WORKER_SCHEMA_VERSION,
          startedAt: new Date(startedMs).toISOString(),
          workerRunId: this.#workerRunId,
        });
        cycles.push(cycle);
        try {
          await this.#telemetrySink(cycle);
        } catch {
          stopReason = "RUNTIME_ERROR";
          break;
        }

        if (
          stopReason === "ARTIFACT_PERSISTENCE_FAILED" ||
          stopReason === "CHECKPOINT_PERSISTENCE_FAILED"
        ) {
          break;
        }
        if (this.#stopController.signal.aborted) {
          stopReason = "STOP_REQUESTED";
          break;
        }
        if (cycles.length >= maxCycles) {
          stopReason = "MAX_CYCLES_REACHED";
          break;
        }

        nextScheduledMs += this.#config.cycleIntervalMs;
        missedScheduleStarts = 0;
        const afterCycleMs = nowMs(this.#clock);
        while (nextScheduledMs < afterCycleMs) {
          nextScheduledMs += this.#config.cycleIntervalMs;
          missedScheduleStarts += 1;
        }
      }
    } finally {
      this.#running = false;
      input.signal?.removeEventListener("abort", forwardStop);
    }

    const outcome = runStatus(stopReason);
    return deepFreezeArtifact({
      authorityMode: "NO_AUTHORITY" as const,
      automaticTradingAllowed: false as const,
      completedAt: new Date(Math.max(runStartedMs, nowMs(this.#clock))).toISOString(),
      cycles,
      exitCode: outcome.exitCode,
      releaseId: this.#runtimeConfig.releaseId,
      restore: this.#restore,
      startedAt: new Date(runStartedMs).toISOString(),
      startupReadiness: "NOT_READY" as const,
      status: outcome.status,
      stopReason,
      workerRunId: this.#workerRunId,
    });
  }
}

export async function createM1CollectorWorker(input: {
  adapterRuntime: CollectorAdapterRuntime;
  artifactStore: CollectorArtifactStore;
  checkpointRepository: CollectorCheckpointRepository;
  clock: CollectorClock;
  resourceSampler?: CollectorWorkerResourceSampler;
  runtimeConfig: CollectorRuntimeConfig;
  scheduler?: CollectorWorkerScheduler;
  telemetrySink: CollectorWorkerTelemetrySink;
  workerConfig: CollectorWorkerConfig;
  workerRunId?: string;
}): Promise<M1CollectorWorker> {
  const restored = await input.checkpointRepository.loadLatest(
    input.runtimeConfig,
  );
  return new M1CollectorWorker({
    checkpointRepository: input.checkpointRepository,
    clock: input.clock,
    config: input.workerConfig,
    resourceSampler: input.resourceSampler,
    restore: restored === null
      ? { checkpointId: null, status: "COLD_START" }
      : {
        checkpointId: restored.stored.checkpoint.checkpointId,
        status: "RESTORED",
      },
    runtime: new M1CollectorRuntime({
      adapterRuntime: input.adapterRuntime,
      clock: input.clock,
      config: input.runtimeConfig,
      restoredState: restored?.durableState,
      store: input.artifactStore,
    }),
    runtimeConfig: input.runtimeConfig,
    scheduler: input.scheduler,
    telemetrySink: input.telemetrySink,
    workerRunId: input.workerRunId,
  });
}
