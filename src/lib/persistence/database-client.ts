import {
  buildPersistenceSchemaSql,
  persistenceTables,
  type PersistenceScope,
} from "./persistence-contract";
import {
  createMemoryPersistenceRepository,
  createPostgresPersistenceRepository,
  type CreatePersistenceRepositoryOptions,
  type PersistenceEnv,
  type PersistenceRepository,
  type SqlClient,
} from "./persistence-store";

export type DatabaseDriver = "none" | "postgres" | "neon" | "supabase";
export type DatabaseClientStatus = "unconfigured" | "configured" | "ready" | "fallback";
export type DatabaseClientFallbackReason = "database_url_missing" | "sql_client_missing";
export type DatabaseConnectionStringEnv = "DATABASE_URL" | "POSTGRES_URL";

export type DatabaseClientDiagnostics = {
  connectionStringEnv?: DatabaseConnectionStringEnv;
  detail: string;
  driver: DatabaseDriver;
  durable: boolean;
  hasDatabaseUrl: boolean;
  reason?: DatabaseClientFallbackReason;
  scope: PersistenceScope;
  status: DatabaseClientStatus;
};

export type DatabaseAwarePersistenceRepository = {
  diagnostics: DatabaseClientDiagnostics;
  repository: PersistenceRepository;
};

export type SchemaMigrationResult = {
  ok: true;
  tableCount: number;
  tables: string[];
};

const defaultScope = "public-demo";
const validDrivers = new Set<DatabaseDriver>(["postgres", "neon", "supabase"]);

function resolveScope(scope?: string) {
  const trimmed = scope?.trim();

  return trimmed || defaultScope;
}

function normalizeDriver(value?: string): DatabaseDriver | null {
  const driver = value?.trim().toLowerCase() as DatabaseDriver | undefined;

  return driver && validDrivers.has(driver) ? driver : null;
}

function findConnectionString(env: PersistenceEnv): {
  connectionStringEnv?: DatabaseConnectionStringEnv;
  databaseUrl?: string;
} {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return {
      connectionStringEnv: "DATABASE_URL",
      databaseUrl,
    };
  }

  const postgresUrl = env.POSTGRES_URL?.trim();

  if (postgresUrl) {
    return {
      connectionStringEnv: "POSTGRES_URL",
      databaseUrl: postgresUrl,
    };
  }

  return {};
}

function inferDriver(env: PersistenceEnv, databaseUrl?: string): DatabaseDriver {
  const explicitDriver = normalizeDriver(env.DATABASE_DRIVER);

  if (explicitDriver) {
    return explicitDriver;
  }

  const connectionString = databaseUrl?.toLowerCase() ?? "";

  if (connectionString.includes("neon.tech")) {
    return "neon";
  }

  if (connectionString.includes("supabase") || env.SUPABASE_URL?.trim()) {
    return "supabase";
  }

  return "postgres";
}

function detailFor(diagnostics: Omit<DatabaseClientDiagnostics, "detail">) {
  if (diagnostics.status === "ready") {
    return `已启用 ${diagnostics.driver} SQL client，scope 为 ${diagnostics.scope}，可写入远端数据库。`;
  }

  if (diagnostics.reason === "sql_client_missing") {
    return `检测到 ${diagnostics.connectionStringEnv ?? "DATABASE_URL"}，但还没有注入服务端 SQL client，当前安全回落到内存存储。`;
  }

  return "未配置 DATABASE_URL 或 POSTGRES_URL，当前使用内存预览存储。";
}

function withDetail(
  diagnostics: Omit<DatabaseClientDiagnostics, "detail">,
): DatabaseClientDiagnostics {
  return {
    ...diagnostics,
    detail: detailFor(diagnostics),
  };
}

export function detectDatabaseClientConfig(
  env: PersistenceEnv = {},
): DatabaseClientDiagnostics {
  const scope = resolveScope(env.PERSISTENCE_SCOPE);
  const { connectionStringEnv, databaseUrl } = findConnectionString(env);

  if (!databaseUrl) {
    return withDetail({
      driver: "none",
      durable: false,
      hasDatabaseUrl: false,
      reason: "database_url_missing",
      scope,
      status: "unconfigured",
    });
  }

  return withDetail({
    connectionStringEnv,
    driver: inferDriver(env, databaseUrl),
    durable: false,
    hasDatabaseUrl: true,
    scope,
    status: "configured",
  });
}

export function createDatabaseAwarePersistenceRepository({
  client,
  env = {},
  initialJournalEvents = [],
  maxScanArchives,
  scope,
}: CreatePersistenceRepositoryOptions = {}): DatabaseAwarePersistenceRepository {
  const config = detectDatabaseClientConfig(env);
  const resolvedScope = resolveScope(scope ?? config.scope);

  if (config.hasDatabaseUrl && client) {
    const diagnostics = withDetail({
      ...config,
      durable: true,
      scope: resolvedScope,
      status: "ready",
    });

    return {
      diagnostics,
      repository: createPostgresPersistenceRepository({
        client,
        scope: resolvedScope,
      }),
    };
  }

  const diagnostics = withDetail({
    ...config,
    durable: false,
    reason: config.hasDatabaseUrl ? "sql_client_missing" : "database_url_missing",
    scope: resolvedScope,
    status: config.hasDatabaseUrl ? "fallback" : "unconfigured",
  });

  return {
    diagnostics,
    repository: createMemoryPersistenceRepository({
      initialJournalEvents,
      maxScanArchives,
      scope: resolvedScope,
    }),
  };
}

export async function runPersistenceSchemaMigration(
  client: SqlClient,
): Promise<SchemaMigrationResult> {
  const statements = buildPersistenceSchemaSql()
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.query(statement);
  }

  return {
    ok: true,
    tableCount: persistenceTables.length,
    tables: [...persistenceTables],
  };
}
