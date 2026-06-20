import {
  runPersistenceSchemaMigration,
  type DatabaseConnectionStringEnv,
  type DatabaseDriver,
  type SchemaMigrationResult,
} from "./database-client";
import { isCronRequestAuthorized } from "../api/cron-auth";
import {
  createConfiguredSqlClient,
  type RuntimeSqlClientBundle,
  type RuntimeSqlClientInactiveReason,
} from "./configured-sql-client";
import type { PersistenceEnv, SqlClient } from "./persistence-store";

export type AdminMigrationError =
  | "database_unavailable"
  | "migration_failed"
  | "migration_secret_missing"
  | "unauthorized";

export type AdminPersistenceMigrationResponse = {
  body: AdminPersistenceMigrationResponseBody;
  status: number;
};

export type AdminPersistenceMigrationResponseBody =
  | {
      ok: true;
      database: {
        connectionStringEnv?: DatabaseConnectionStringEnv;
        driver: DatabaseDriver;
        status: "ready";
      };
      migration: SchemaMigrationResult;
    }
  | {
      ok: false;
      detail: string;
      driver?: DatabaseDriver;
      error: AdminMigrationError;
      reason?: RuntimeSqlClientInactiveReason;
    };

export type RunAdminPersistenceMigrationOptions = {
  authorization?: string | null;
  clientBundle?: RuntimeSqlClientBundle;
  env?: PersistenceEnv;
  migrate?: (client: SqlClient) => Promise<SchemaMigrationResult>;
};

function errorResponse(
  status: number,
  body: Extract<AdminPersistenceMigrationResponseBody, { ok: false }>,
): AdminPersistenceMigrationResponse {
  return {
    body,
    status,
  };
}

function migrationFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown migration error";
}

export async function runAdminPersistenceMigration({
  authorization,
  clientBundle,
  env = {},
  migrate = runPersistenceSchemaMigration,
}: RunAdminPersistenceMigrationOptions = {}): Promise<AdminPersistenceMigrationResponse> {
  if (!env.CRON_SECRET?.trim()) {
    return errorResponse(503, {
      ok: false,
      detail: "Set CRON_SECRET before enabling the database migration endpoint.",
      error: "migration_secret_missing",
    });
  }

  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return errorResponse(401, {
      ok: false,
      detail: "The migration request must include the correct Bearer token.",
      error: "unauthorized",
    });
  }

  const bundle = clientBundle ?? createConfiguredSqlClient({ env });

  if (!bundle.active || !bundle.client) {
    return errorResponse(503, {
      ok: false,
      detail: "SQL client is not active, so schema migration was not attempted.",
      driver: bundle.driver,
      error: "database_unavailable",
      reason: bundle.reason,
    });
  }

  try {
    const migration = await migrate(bundle.client);

    return {
      body: {
        ok: true,
        database: {
          connectionStringEnv: bundle.connectionStringEnv,
          driver: bundle.driver,
          status: "ready",
        },
        migration,
      },
      status: 200,
    };
  } catch (error) {
    return errorResponse(500, {
      ok: false,
      detail: migrationFailureMessage(error),
      driver: bundle.driver,
      error: "migration_failed",
    });
  }
}
