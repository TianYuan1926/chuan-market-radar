import assert from "node:assert/strict";
import test from "node:test";
import { createCandidateRuntimeDatabase } from "./candidate-runtime-database";
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

test("source consumer and monitor each require their own explicit connection identity", () => {
  const calls: Array<{ connectionString: string; purpose: string }> = [];
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
        return fakePool();
      },
      purpose,
    });
    assert.equal(bundle.configured, true);
    assert.notEqual(bundle.transactions, null);
  }

  assert.deepEqual(calls, [
    { connectionString: env.CANDIDATE_SOURCE_DATABASE_URL, purpose: "source" },
    { connectionString: env.CANDIDATE_CONSUMER_DATABASE_URL, purpose: "consumer" },
    { connectionString: env.CANDIDATE_MONITOR_DATABASE_URL, purpose: "monitor" },
  ]);
});
