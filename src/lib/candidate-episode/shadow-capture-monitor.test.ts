import assert from "node:assert/strict";
import test from "node:test";
import type { PostgresTransactionAdapter } from "./transaction-adapter";
import type { TransactionContext } from "./transaction-adapter";
import { CandidateShadowCaptureMonitor } from "./shadow-capture-monitor";

function monitor(row: Record<string, unknown>) {
  let options: unknown;
  let sql = "";
  const transactions: PostgresTransactionAdapter = {
    async withTransaction(received, work) {
      options = received;
      return work({
        async query<T>(receivedSql: string) {
          sql = receivedSql;
          return { rows: [row] as T[] };
        },
        async withSavepoint<T>(work: (tx: TransactionContext) => Promise<T>) {
          return work(this);
        },
      });
    },
  };
  return {
    service: new CandidateShadowCaptureMonitor(transactions),
    evidence: () => ({ options, sql }),
  };
}

const healthy = {
  phase: "shadow_capture",
  authority_epoch: "1",
  deadline_at: "2099-07-15T00:00:00.000Z",
  deadline_expired: false,
  pending_total: "0",
  claimed_total: "0",
  retry_wait_total: "0",
  completed_total: "100",
  quarantined_total: "0",
  unresolved_quarantine_total: "0",
  unresolved_total: "0",
  oldest_unresolved_age_seconds: null,
};

test("monitor is read-only and reports a clean shadow queue", async () => {
  const harness = monitor(healthy);
  const result = await harness.service.read("production_radar", "candidate-episode-v1");
  assert.equal(result.status, "ready");
  assert.equal(result.metrics.outboxCompletedTotal, 100);
  assert.equal((harness.evidence().options as { readOnly: boolean }).readOnly, true);
  assert.match(harness.evidence().sql, /candidate_outbox_quarantine_resolutions/);
  assert.doesNotMatch(harness.evidence().sql, /payload\s*(?:,|FROM)/i);
});

test("unresolved quarantine and old pending work are blocking, retries stay partial", async () => {
  const blocked = monitor({
    ...healthy,
    retry_wait_total: "1",
    unresolved_quarantine_total: "1",
    unresolved_total: "2",
    oldest_unresolved_age_seconds: "601",
  });
  const blockedResult = await blocked.service.read("production_radar", "candidate-episode-v1");
  assert.equal(blockedResult.status, "blocked");
  assert.deepEqual(blockedResult.blockers, [
    "unresolved_quarantine",
    "oldest_pending_critical",
  ]);
  assert.deepEqual(blockedResult.warnings, ["retry_wait_present"]);

  const partial = monitor({
    ...healthy,
    retry_wait_total: "1",
    unresolved_total: "1",
    oldest_unresolved_age_seconds: "301",
  });
  assert.equal(
    (await partial.service.read("production_radar", "candidate-episode-v1")).status,
    "partial",
  );
});
