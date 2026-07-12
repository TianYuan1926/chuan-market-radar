import pg from "pg";
import {
  createPostgresTransactionAdapter,
  type PostgresTransactionPool,
} from "./transaction-adapter";

export type CandidateRuntimeDatabasePurpose = "source" | "consumer" | "monitor";
export type CandidateRuntimeDatabaseEnv = Record<string, string | undefined>;

const connectionEnvByPurpose = Object.freeze({
  source: "CANDIDATE_SOURCE_DATABASE_URL",
  consumer: "CANDIDATE_CONSUMER_DATABASE_URL",
  monitor: "CANDIDATE_MONITOR_DATABASE_URL",
} as const);

export const transactionRoleByPurpose = Object.freeze({
  source: "candidate_application_writer_role",
  consumer: "candidate_shadow_executor_role",
  monitor: "candidate_audit_role",
} as const satisfies Record<CandidateRuntimeDatabasePurpose, string>);

type CandidatePoolFactory = (
  connectionString: string,
  purpose: CandidateRuntimeDatabasePurpose,
) => PostgresTransactionPool;

function defaultPoolFactory(
  connectionString: string,
  purpose: CandidateRuntimeDatabasePurpose,
): PostgresTransactionPool {
  const { Pool } = pg;
  return new Pool({
    application_name: `market-radar-candidate-${purpose}`,
    connectionString,
    max: purpose === "monitor" ? 2 : 4,
  }) as unknown as PostgresTransactionPool;
}

export function createCandidateRuntimeDatabase({
  env = process.env,
  poolFactory = defaultPoolFactory,
  purpose,
}: {
  env?: CandidateRuntimeDatabaseEnv;
  poolFactory?: CandidatePoolFactory;
  purpose: CandidateRuntimeDatabasePurpose;
}) {
  const connectionStringEnv = connectionEnvByPurpose[purpose];
  const connectionString = env[connectionStringEnv]?.trim();
  if (!connectionString) {
    return {
      configured: false,
      connectionStringEnv,
      reason: "candidate_database_url_missing",
      transactions: null,
    } as const;
  }

  const pool = poolFactory(connectionString, purpose);
  return {
    configured: true,
    connectionStringEnv,
    reason: null,
    transactionRole: transactionRoleByPurpose[purpose],
    transactions: createPostgresTransactionAdapter(pool, {
      role: transactionRoleByPurpose[purpose],
    }),
  } as const;
}
