import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidateRuntimeDatabase,
  transactionRoleByPurpose,
} from "./candidate-runtime-database";
import type { PostgresTransactionPool } from "./transaction-adapter";

function fakePool(): PostgresTransactionPool {
  return {
    async connect() {
      return {
        async query<T>() { return { rows: [] as T[] }; },
        release() {},
      };
    },
  };
}

test("candidate runtime identities never fall back to the legacy application DATABASE_URL", () => {
  let factoryCalled = false;
  const bundle = createCandidateRuntimeDatabase({
    env: { DATABASE_URL: "postgresql://legacy-app.invalid/database" },
    poolFactory() {
      factoryCalled = true;
      return fakePool();
    },
    purpose: "source",
  });

  assert.equal(bundle.configured, false);
  assert.equal(bundle.connectionStringEnv, "CANDIDATE_SOURCE_DATABASE_URL");
  assert.equal(bundle.transactions, null);
  assert.equal(factoryCalled, false);
});

test("source consumer and monitor require separate identities and fixed transaction roles", async () => {
  const calls: Array<{ connectionString: string; purpose: string }> = [];
  const queries: Record<string, string[]> = { consumer: [], monitor: [], source: [] };
  const env = {
    CANDIDATE_SOURCE_DATABASE_URL: "postgresql://source.invalid/database",
    CANDIDATE_CONSUMER_DATABASE_URL: "postgresql://consumer.invalid/database",
    CANDIDATE_MONITOR_DATABASE_URL: "postgresql://monitor.invalid/database",
  };

  for (const purpose of ["source", "consumer", "monitor"] as const) {
    const bundle = createCandidateRuntimeDatabase({
      env,
      poolFactory(connectionString, receivedPurpose) {
        calls.push({ connectionString, purpose: receivedPurpose });
        return {
          async connect() {
            return {
              async query<T>(sql: string) {
                queries[receivedPurpose].push(sql);
                return { rows: [] as T[] };
              },
              release() {},
            };
          },
        };
      },
      purpose,
    });
    assert.equal(bundle.configured, true);
    assert.notEqual(bundle.transactions, null);
    assert.equal(bundle.transactionRole, transactionRoleByPurpose[purpose]);
    await bundle.transactions.withTransaction({}, async () => undefined);
  }

  assert.deepEqual(calls, [
    { connectionString: env.CANDIDATE_SOURCE_DATABASE_URL, purpose: "source" },
    { connectionString: env.CANDIDATE_CONSUMER_DATABASE_URL, purpose: "consumer" },
    { connectionString: env.CANDIDATE_MONITOR_DATABASE_URL, purpose: "monitor" },
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(queries).map(([purpose, sql]) => [
      purpose,
      sql.find((statement) => statement.startsWith("SET LOCAL ROLE")),
    ])),
    {
      consumer: 'SET LOCAL ROLE "candidate_shadow_executor_role"',
      monitor: 'SET LOCAL ROLE "candidate_audit_role"',
      source: 'SET LOCAL ROLE "candidate_application_writer_role"',
    },
  );
});
