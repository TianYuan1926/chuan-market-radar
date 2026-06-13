import { neon } from "@neondatabase/serverless";
import type {
  DatabaseConnectionStringEnv,
  DatabaseDriver,
  DatabaseClientFallbackReason,
} from "./database-client";
import { detectDatabaseClientConfig } from "./database-client";
import type { PersistenceEnv, SqlClient } from "./persistence-store";

export type NeonQueryFunction = {
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<T[] | { rows: T[] }>;
};

export type NeonQueryFactory = (connectionString: string) => NeonQueryFunction;

export type NeonClientInactiveReason = DatabaseClientFallbackReason | "driver_not_neon";

export type NeonSqlClientBundle = {
  active: boolean;
  client?: SqlClient;
  connectionStringEnv?: DatabaseConnectionStringEnv;
  driver: DatabaseDriver;
  reason?: NeonClientInactiveReason;
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

function defaultNeonFactory(connectionString: string): NeonQueryFunction {
  return neon(connectionString) as unknown as NeonQueryFunction;
}

export function createSqlClientFromNeon(neonQuery: NeonQueryFunction): SqlClient {
  return {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      const result = await neonQuery.query<T>(sql, params);

      return {
        rows: Array.isArray(result) ? result : result.rows,
      };
    },
  };
}

export function createNeonSqlClient({
  env = {},
  neonFactory = defaultNeonFactory,
}: {
  env?: PersistenceEnv;
  neonFactory?: NeonQueryFactory;
} = {}): NeonSqlClientBundle {
  const config = detectDatabaseClientConfig(env);
  const { connectionString, connectionStringEnv } = findConnectionString(env);

  if (!connectionString) {
    return {
      active: false,
      driver: config.driver,
      reason: "database_url_missing",
    };
  }

  if (config.driver !== "neon") {
    return {
      active: false,
      connectionStringEnv,
      driver: config.driver,
      reason: "driver_not_neon",
    };
  }

  return {
    active: true,
    client: createSqlClientFromNeon(neonFactory(connectionString)),
    connectionStringEnv,
    driver: "neon",
  };
}
