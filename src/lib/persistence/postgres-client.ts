import pg from "pg";
import type {
  DatabaseClientFallbackReason,
  DatabaseConnectionStringEnv,
  DatabaseDriver,
} from "./database-client";
import { detectDatabaseClientConfig } from "./database-client";
import type { PersistenceEnv, SqlClient } from "./persistence-store";

export type PostgresQueryClient = {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

export type PostgresPoolFactory = (connectionString: string) => PostgresQueryClient;

export type PostgresClientInactiveReason =
  | DatabaseClientFallbackReason
  | "driver_not_postgres";

export type PostgresSqlClientBundle = {
  active: boolean;
  client?: SqlClient;
  connectionStringEnv?: DatabaseConnectionStringEnv;
  driver: DatabaseDriver;
  reason?: PostgresClientInactiveReason;
};

function findConnectionString(env: PersistenceEnv): {
  connectionString?: string;
  connectionStringEnv?: DatabaseConnectionStringEnv;
} {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      connectionStringEnv: "DATABASE_URL",
    };
  }

  const postgresUrl = env.POSTGRES_URL?.trim();

  if (postgresUrl) {
    return {
      connectionString: postgresUrl,
      connectionStringEnv: "POSTGRES_URL",
    };
  }

  return {};
}

function defaultPostgresPoolFactory(connectionString: string): PostgresQueryClient {
  const { Pool } = pg;

  return new Pool({
    connectionString,
  }) as unknown as PostgresQueryClient;
}

export function createSqlClientFromPostgres(pool: PostgresQueryClient): SqlClient {
  return {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      const result = await pool.query<T>(sql, params);

      return {
        rows: result.rows,
      };
    },
  };
}

export function createPostgresSqlClient({
  env = {},
  poolFactory = defaultPostgresPoolFactory,
}: {
  env?: PersistenceEnv;
  poolFactory?: PostgresPoolFactory;
} = {}): PostgresSqlClientBundle {
  const config = detectDatabaseClientConfig(env);
  const { connectionString, connectionStringEnv } = findConnectionString(env);

  if (!connectionString) {
    return {
      active: false,
      driver: config.driver,
      reason: "database_url_missing",
    };
  }

  if (config.driver !== "postgres") {
    return {
      active: false,
      connectionStringEnv,
      driver: config.driver,
      reason: "driver_not_postgres",
    };
  }

  return {
    active: true,
    client: createSqlClientFromPostgres(poolFactory(connectionString)),
    connectionStringEnv,
    driver: "postgres",
  };
}
