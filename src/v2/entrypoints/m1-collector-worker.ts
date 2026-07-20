import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  type M1SqlPool,
  M1_STORE_IDENTITIES,
} from "../modules/market-fact/store/contracts";
import { M1PostgresArtifactStore } from "../modules/market-fact/store/postgres-artifact-store";
import { createLivePublicRestCollectorAdapterRuntime } from "../modules/market-fact/collector/adapters/live-public-rest-adapter-runtime";
import { createM1CollectorWorker } from "../modules/market-fact/collector/collector-worker";
import { serializeM1CollectorObservationLog } from "../modules/market-fact/collector/collector-observation-log";
import {
  buildM1CollectorProcessSummary,
  M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
} from "../modules/market-fact/collector/collector-process-contract";
import { M1PostgresCollectorCheckpointStore } from "../modules/market-fact/collector/postgres-checkpoint-store";
import type {
  CollectorClock,
  CollectorRuntimeConfig,
} from "../modules/market-fact/collector/contracts";

export {
  M1_COLLECTOR_PROCESS_CONTRACT_VERSION,
} from "../modules/market-fact/collector/collector-process-contract";

export type M1CollectorProcessConfig = Readonly<{
  cycleIntervalMs: number;
  maxCycles: number;
  readerDatabaseUrl: string;
  runProfile: "EARLY_30_MINUTES" | "SUSTAINED_24_HOURS";
  runtimeConfig: CollectorRuntimeConfig;
  sourceCommit: string;
  writerDatabaseUrl: string;
}>;

type SecretReader = (path: string, encoding: "utf8") => Promise<string>;

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

function databaseConnection(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid_database_url_environment:${name}`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.username === "" ||
    url.hostname === "" ||
    url.pathname === "" ||
    url.pathname === "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`invalid_database_url_environment:${name}`);
  }
  return {
    database: decodeURIComponent(url.pathname.slice(1)),
    host: url.hostname,
    identity: decodeURIComponent(url.username),
    passwordPresent: url.password !== "",
    port: url.port === "" ? "5432" : url.port,
    protocol: url.protocol,
  };
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
  const writerConnection = databaseConnection(
    writerDatabaseUrl,
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL",
  );
  const readerConnection = databaseConnection(
    readerDatabaseUrl,
    "V2_M1_COLLECTOR_READER_DATABASE_URL",
  );
  const expectedDatabaseHost = required(
    env,
    "V2_M1_COLLECTOR_DATABASE_HOST",
  ).toLowerCase();
  const expectedDatabaseName = required(
    env,
    "V2_M1_COLLECTOR_DATABASE_NAME",
  );
  if (writerConnection.identity === readerConnection.identity) {
    throw new Error("collector_reader_and_writer_identities_must_differ");
  }
  if (
    writerConnection.host !== expectedDatabaseHost ||
    readerConnection.host !== expectedDatabaseHost ||
    writerConnection.database !== expectedDatabaseName ||
    readerConnection.database !== expectedDatabaseName ||
    writerConnection.protocol !== readerConnection.protocol ||
    writerConnection.port !== readerConnection.port ||
    (env.NODE_ENV === "production" &&
      (!writerConnection.passwordPresent || !readerConnection.passwordPresent))
  ) {
    throw new Error("collector_database_endpoint_binding_rejected");
  }
  const runProfile = required(env, "V2_M1_COLLECTOR_RUN_PROFILE");
  if (
    runProfile !== "EARLY_30_MINUTES" &&
    runProfile !== "SUSTAINED_24_HOURS"
  ) {
    throw new Error("collector_shadow_run_profile_rejected");
  }
  const cycleIntervalMs = positiveInteger(
    env,
    "V2_M1_COLLECTOR_CYCLE_INTERVAL_MS",
  );
  const maxCycles = positiveInteger(env, "V2_M1_COLLECTOR_MAX_CYCLES");
  const expectedCycles = runProfile === "EARLY_30_MINUTES" ? 31 : 1_441;
  const maxFactAgeMs = positiveInteger(
    env,
    "V2_M1_COLLECTOR_MAX_FACT_AGE_MS",
  );
  const maxSequenceGapMs = positiveInteger(
    env,
    "V2_M1_COLLECTOR_MAX_SEQUENCE_GAP_MS",
  );
  const reconciliationIntervalMs = positiveInteger(
    env,
    "V2_M1_COLLECTOR_RECONCILIATION_INTERVAL_MS",
  );
  const retentionMs = positiveInteger(env, "V2_M1_COLLECTOR_RETENTION_MS");
  if (
    cycleIntervalMs !== 60_000 ||
    maxCycles !== expectedCycles ||
    maxFactAgeMs > 120_000 ||
    maxSequenceGapMs > 10 * 60_000 ||
    reconciliationIntervalMs > 60 * 60_000 ||
    retentionMs > 30 * 24 * 60 * 60_000
  ) {
    throw new Error("collector_shadow_runtime_bounds_rejected");
  }

  return Object.freeze({
    cycleIntervalMs,
    maxCycles,
    readerDatabaseUrl,
    runProfile,
    runtimeConfig: Object.freeze({
      maxFactAgeMs,
      maxSequenceGapMs,
      policyVersion: required(env, "V2_M1_COLLECTOR_POLICY_VERSION"),
      reconciliationIntervalMs,
      releaseId,
      retentionMs,
    }),
    sourceCommit,
    writerDatabaseUrl,
  });
}

async function databaseUrlFromEnvironment(input: {
  directName: string;
  env: NodeJS.ProcessEnv;
  fileName: string;
  readSecret: SecretReader;
}): Promise<string> {
  const direct = input.env[input.directName]?.trim();
  const secretPath = input.env[input.fileName]?.trim();
  if ((direct === undefined) === (secretPath === undefined)) {
    throw new Error(
      `exactly_one_database_secret_source_required:${input.directName}`,
    );
  }
  if (direct !== undefined) {
    return direct;
  }
  try {
    const value = (await input.readSecret(secretPath!, "utf8")).trim();
    if (value === "") {
      throw new Error("empty secret");
    }
    return value;
  } catch {
    throw new Error(`database_secret_file_unavailable:${input.fileName}`);
  }
}

export async function loadM1CollectorProcessConfig(
  env: NodeJS.ProcessEnv,
  readSecret: SecretReader = readFile,
): Promise<M1CollectorProcessConfig> {
  const [writerDatabaseUrl, readerDatabaseUrl] = await Promise.all([
    databaseUrlFromEnvironment({
      directName: "V2_M1_COLLECTOR_WRITER_DATABASE_URL",
      env,
      fileName: "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE",
      readSecret,
    }),
    databaseUrlFromEnvironment({
      directName: "V2_M1_COLLECTOR_READER_DATABASE_URL",
      env,
      fileName: "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE",
      readSecret,
    }),
  ]);
  return parseM1CollectorProcessConfig({
    ...env,
    V2_M1_COLLECTOR_READER_DATABASE_URL: readerDatabaseUrl,
    V2_M1_COLLECTOR_WRITER_DATABASE_URL: writerDatabaseUrl,
  });
}

export async function verifyM1CollectorDatabaseIdentities(input: {
  readerPool: M1SqlPool;
  writerPool: M1SqlPool;
}): Promise<void> {
  const [writer, reader] = await Promise.all([
    input.writerPool.query<{ current_user: string; session_user: string }>(
      "SELECT current_user, session_user",
    ),
    input.readerPool.query<{ current_user: string; session_user: string }>(
      "SELECT current_user, session_user",
    ),
  ]);
  const writerIdentity = writer.rows[0];
  const readerIdentity = reader.rows[0];
  if (
    writer.rows.length !== 1 ||
    reader.rows.length !== 1 ||
    writerIdentity?.current_user !== M1_STORE_IDENTITIES.writer ||
    readerIdentity?.current_user !== M1_STORE_IDENTITIES.reader ||
    writerIdentity.session_user === readerIdentity.session_user ||
    writerIdentity.session_user === writerIdentity.current_user ||
    readerIdentity.session_user === readerIdentity.current_user
  ) {
    throw new Error("collector_database_identity_verification_failed");
  }
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
    const config = await loadM1CollectorProcessConfig(env);
    writer = new Pool({
      application_name: "market-radar-v2-m1-collector-writer",
      connectionString: config.writerDatabaseUrl,
      max: 2,
      options: `-c role=${M1_STORE_IDENTITIES.writer}`,
    });
    reader = new Pool({
      application_name: "market-radar-v2-m1-collector-reader",
      connectionString: config.readerDatabaseUrl,
      max: 2,
      options: `-c role=${M1_STORE_IDENTITIES.reader}`,
    });
    await verifyM1CollectorDatabaseIdentities({
      readerPool: reader as unknown as M1SqlPool,
      writerPool: writer as unknown as M1SqlPool,
    });
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
        process.stdout.write(`${serializeM1CollectorObservationLog(cycle)}\n`);
      },
      workerConfig: { cycleIntervalMs: config.cycleIntervalMs },
    });
    const report = await worker.run({
      maxCycles: config.maxCycles,
      signal: abortController.signal,
    });
    process.stdout.write(`${JSON.stringify(buildM1CollectorProcessSummary({
      report,
      runProfile: config.runProfile,
    }))}\n`);
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
