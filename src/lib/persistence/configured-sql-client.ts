import type {
  DatabaseClientFallbackReason,
  DatabaseConnectionStringEnv,
  DatabaseDriver,
} from "./database-client";
import { detectDatabaseClientConfig } from "./database-client";
import { createNeonSqlClient } from "./neon-client";
import { createPostgresSqlClient } from "./postgres-client";
import type { PersistenceEnv, SqlClient } from "./persistence-store";

export type RuntimeSqlClientInactiveReason =
  | DatabaseClientFallbackReason
  | "driver_not_neon"
  | "driver_not_postgres"
  | "driver_not_supported";

export type RuntimeSqlClientBundle = {
  active: boolean;
  client?: SqlClient;
  connectionStringEnv?: DatabaseConnectionStringEnv;
  driver: DatabaseDriver;
  reason?: RuntimeSqlClientInactiveReason;
};

export function createConfiguredSqlClient({
  env = {},
}: {
  env?: PersistenceEnv;
} = {}): RuntimeSqlClientBundle {
  const config = detectDatabaseClientConfig(env);

  if (!config.hasDatabaseUrl) {
    return {
      active: false,
      driver: config.driver,
      reason: "database_url_missing",
    };
  }

  if (config.driver === "neon") {
    return createNeonSqlClient({ env });
  }

  if (config.driver === "postgres") {
    return createPostgresSqlClient({ env });
  }

  return {
    active: false,
    connectionStringEnv: config.connectionStringEnv,
    driver: config.driver,
    reason: "driver_not_supported",
  };
}
