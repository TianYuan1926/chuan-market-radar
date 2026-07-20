import { Pool } from "pg";
import type { M1SqlPool } from "../modules/market-fact/store/contracts";
import { M1PostgresArtifactStore } from "../modules/market-fact/store/postgres-artifact-store";
import { createLivePublicRestCollectorAdapterRuntime } from "../modules/market-fact/collector/adapters/live-public-rest-adapter-runtime";
import { createM1CollectorWorker } from "../modules/market-fact/collector/collector-worker";
import type { M1CollectorWorkerCycle } from "../modules/market-fact/collector/collector-worker-contract";
import { M1PostgresCollectorCheckpointStore } from "../modules/market-fact/collector/postgres-checkpoint-store";
import type {
  CollectorClock,
  CollectorRuntimeConfig,
} from "../modules/market-fact/collector/contracts";

export const M1_COLLECTOR_PROCESS_CONTRACT_VERSION =
  "v2-m1-collector-process.v1" as const;

export type M1CollectorProcessConfig = Readonly<{
  cycleIntervalMs: number;
  readerDatabaseUrl: string;
  runtimeConfig: CollectorRuntimeConfig;
  sourceCommit: string;
  writerDatabaseUrl: string;
}>;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`missing_required_environment:${name}`);
  }
  return value;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string): number {
  const raw = required(env, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`invalid_positive_integer_environment:${name}`);
  }
  return value;
}

function databaseIdentity(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid_database_url_environment:${name}`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.username === ""
  ) {
    throw new Error(`invalid_database_url_environment:${name}`);
  }
  return decodeURIComponent(url.username);
}

export function parseM1CollectorProcessConfig(
  env: NodeJS.ProcessEnv,
): M1CollectorProcessConfig {
  if (required(env, "V2_M1_COLLECTOR_AUTHORITY_MODE") !== "NO_AUTHORITY") {
    throw new Error("collector_authority_mode_must_be_no_authority");
  }
  if (
    required(env, "V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED") !== "false"
  ) {
    throw new Error("collector_automatic_trading_must_remain_disabled");
  }
  const sourceCommit = required(env, "V2_M1_COLLECTOR_SOURCE_COMMIT");
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error("collector_source_commit_must_be_full_sha1");
  }
  const releaseId = required(env, "V2_M1_COLLECTOR_RELEASE_ID");
  if (!releaseId.includes(sourceCommit)) {
    throw new Error("collector_release_id_must_bind_source_commit");
  }
  const writerDatabaseUrl = required(
    env,
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL",
  );
  const readerDatabaseUrl = required(
    env,
    "V2_M1_COLLECTOR_READER_DATABASE_URL",
  );
  const writerIdentity = databaseIdentity(
    writerDatabaseUrl,
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL",
  );
  const readerIdentity = databaseIdentity(
    readerDatabaseUrl,
    "V2_M1_COLLECTOR_READER_DATABASE_URL",
  );
  if (writerIdentity === readerIdentity) {
    throw new Error("collector_reader_and_writer_identities_must_differ");
  }

  return Object.freeze({
    cycleIntervalMs: positiveInteger(env, "V2_M1_COLLECTOR_CYCLE_INTERVAL_MS"),
    readerDatabaseUrl,
    runtimeConfig: Object.freeze({
      maxFactAgeMs: positiveInteger(env, "V2_M1_COLLECTOR_MAX_FACT_AGE_MS"),
      maxSequenceGapMs: positiveInteger(
        env,
        "V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS",
      ),
      policyVersion: required(env, "V2_M1_COLLECTOR_POLICY_VERSION"),
      reconciliationIntervalMs: positiveInteger(
        env,
        "V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS",
      ),
      releaseId,
      retentionMs: positiveInteger(env, "V2_M1_COLLECTOR_RETENTION_MS"),
    }),
    sourceCommit,
    writerDatabaseUrl,
  });
}

function sanitizedCycle(cycle: M1CollectorWorkerCycle) {
  return {
    authorityMode: cycle.authorityMode,
    checkpoint: {
      checkpointId: cycle.checkpoint.checkpointId,
      failureReason: cycle.checkpoint.failureReason,
      status: cycle.checkpoint.status,
    },
    coverage: cycle.runtime.coverage,
    cycleId: cycle.runtime.cycleId,
    dataQuality: cycle.dataQuality,
    missedScheduleStarts: cycle.missedScheduleStarts,
    operationalReadiness: cycle.operationalReadiness,
    providerFailures: cycle.runtime.providerFailures,
    reasons: cycle.runtime.reasons,
    releaseId: cycle.releaseId,
    resources: cycle.resources,
    runtimeState: cycle.runtime.state,
    runtimeConfigDigest: cycle.runtimeConfigDigest,
    scheduleLagMs: cycle.scheduleLagMs,
    schemaVersion: cycle.schemaVersion,
    trigger: cycle.runtime.trigger,
  };
}

function operationalErrorCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]+$/u.test(error.code)
  ) {
    return error.code;
  }
  return "COLLECTOR_PROCESS_FAILED";
}

export async function runM1CollectorProcess(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let writer: Pool | undefined;
  let reader: Pool | undefined;
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const config = parseM1CollectorProcessConfig(env);
    writer = new Pool({ connectionString: config.writerDatabaseUrl, max: 2 });
    reader = new Pool({ connectionString: config.readerDatabaseUrl, max: 2 });
    const clock: CollectorClock = Object.freeze({ now: () => new Date() });
    const worker = await createM1CollectorWorker({
      adapterRuntime: createLivePublicRestCollectorAdapterRuntime({ clock }),
      artifactStore: new M1PostgresArtifactStore(
        writer as unknown as M1SqlPool,
      ),
      checkpointRepository: new M1PostgresCollectorCheckpointStore({
        readerPool: reader as unknown as M1SqlPool,
        writerPool: writer as unknown as M1SqlPool,
      }),
      clock,
      runtimeConfig: config.runtimeConfig,
      telemetrySink: (cycle) => {
        process.stdout.write(`${JSON.stringify(sanitizedCycle(cycle))}\n`);
      },
      workerConfig: { cycleIntervalMs: config.cycleIntervalMs },
    });
    const report = await worker.run({ signal: abortController.signal });
    process.stdout.write(`${JSON.stringify({
      authorityMode: report.authorityMode,
      automaticTradingAllowed: report.automaticTradingAllowed,
      contractVersion: M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
      cycleCount: report.cycles.length,
      exitCode: report.exitCode,
      releaseId: report.releaseId,
      restore: report.restore,
      status: report.status,
      stopReason: report.stopReason,
    })}\n`);
    return report.exitCode;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      authorityMode: "NO_AUTHORITY",
      automaticTradingAllowed: false,
      contractVersion: M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
      errorCode: operationalErrorCode(error),
      status: "FAILED",
    })}\n`);
    return 1;
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await writer?.end();
    await reader?.end();
  }
}

if (require.main === module) {
  void runM1CollectorProcess().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
