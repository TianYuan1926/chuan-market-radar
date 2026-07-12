import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CandidateOutboxService } from "./outbox-service";
import type {
  PostgresTransactionAdapter,
  TransactionContext,
  TransactionOptions,
} from "./transaction-adapter";

type QueryCall = { params: unknown[]; sql: string };

function adapter(rows: unknown[][]) {
  const calls: QueryCall[] = [];
  const tx: TransactionContext = {
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      return { rows: (rows.shift() ?? []) as T[] };
    },
    async withSavepoint<T>(work: (nested: TransactionContext) => Promise<T>) {
      return work(tx);
    },
  };
  const transactions: PostgresTransactionAdapter = {
    async withTransaction<T>(
      _options: TransactionOptions,
      work: (context: TransactionContext) => Promise<T>,
    ) {
      return work(tx);
    },
  };
  return { calls, transactions };
}

const row = {
  outbox_id: "018f47d6-2c40-7e30-8a20-000000000001",
  scope: "production_radar",
  source_type: "candidate_episode_event",
  source_id: "018f47d6-2c40-7e30-8a20-000000000002",
  source_version: "1",
  payload_version: "candidate-event.v1",
  payload: { fixture: true },
  payload_hash: `sha256:${"a".repeat(64)}`,
  idempotency_key: "outbox:test:1",
  status: "claimed",
  attempt_count: 1,
  max_attempts: 8,
  next_attempt_at: null,
  claimed_by_runtime_id: "runtime-a",
  claim_expires_at: "2026-07-10T01:05:00.000Z",
  fencing_token: 1,
  error_class: null,
  error_message_redacted: null,
  created_at: "2026-07-10T00:00:00.000Z",
  completed_at: null,
  quarantined_at: null,
};

test("outbox claim carries durable authority epoch and database fence", async () => {
  const subject = adapter([[row]]);
  const service = new CandidateOutboxService(subject.transactions);
  const claims = await service.claimDue({
    scope: "production_radar",
    runtimeId: "runtime-a",
    now: "2026-07-10T01:00:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 4,
  });

  assert.equal(claims[0]?.fencingToken, 1);
  assert.equal(claims[0]?.authorityEpoch, 4);
  assert.match(subject.calls[0]!.sql, /claim_outbox_v1/);
  assert.deepEqual(subject.calls[0]!.params.slice(-2), ["candidate-episode-v1", 4]);
});

test("outbox retry and completion use the claimed runtime, fence, epoch, and payload hash", async () => {
  const subject = adapter([[row], [{ ...row, status: "retry_wait" }], [{
    ...row,
    status: "completed",
    completed_at: "2026-07-10T01:02:00.000Z",
  }]]);
  const service = new CandidateOutboxService(subject.transactions);
  const claim = {
    ...(await service.claimDue({
      scope: "production_radar",
      runtimeId: "runtime-a",
      now: "2026-07-10T01:00:00.000Z",
      limit: 10,
      migrationId: "candidate-episode-v1",
      authorityEpoch: 4,
    }))[0]!,
    status: "claimed" as const,
  };
  await service.retry(claim, {
    now: "2026-07-10T01:01:00.000Z",
    nextAttemptAt: "2026-07-10T01:02:00.000Z",
  });
  await service.complete(claim, { now: "2026-07-10T01:02:00.000Z" });

  assert.match(subject.calls[1]!.sql, /retry_outbox_v1/);
  assert.deepEqual(subject.calls[1]!.params.slice(-2), ["candidate-episode-v1", 4]);
  assert.match(subject.calls[2]!.sql, /complete_outbox_v1/);
  assert.equal(subject.calls[2]!.params[5], row.payload_hash);
  assert.deepEqual(subject.calls[2]!.params.slice(-2), ["candidate-episode-v1", 4]);
});

test("outbox service remains dormant outside production API and worker paths", async () => {
  const roots = [join(process.cwd(), "src", "app", "api"), join(process.cwd(), "deploy", "workers")];
  for (const root of roots) {
    const files = await readdir(root, { recursive: true });
    for (const relative of files.filter((file) => file.endsWith(".ts") || file.endsWith(".mjs"))) {
      const source = await readFile(join(root, relative), "utf8");
      assert.doesNotMatch(
        source,
        /candidate-episode\/(?:outbox-service|shadow-capture-source|shadow-capture-consumer)|Candidate(?:OutboxService|ShadowCaptureSourceWriter|ShadowCaptureConsumer)/,
      );
    }
  }
});

test("shadow candidate methods use the source-filtered claim and bounded quarantine procedures", async () => {
  const subject = adapter([
    [[row]].flat(),
    [{ ...row, status: "retry_wait", error_class: "temporary_database_failure" }],
    [{ ...row, status: "quarantined", quarantined_at: "2026-07-10T01:03:00.000Z" }],
  ]);
  const service = new CandidateOutboxService(subject.transactions);
  const claim = (await service.claimShadowCandidates({
    scope: "production_radar",
    runtimeId: "runtime-a",
    now: "2026-07-10T01:00:00.000Z",
    limit: 10,
    migrationId: "candidate-episode-v1",
    authorityEpoch: 4,
  }))[0]!;
  const retry = await service.retryOrQuarantine(claim, {
    now: "2026-07-10T01:01:00.000Z",
    nextAttemptAt: "2026-07-10T01:02:00.000Z",
    errorClass: "temporary_database_failure",
    errorMessageRedacted: "temporary projection failure",
  });
  const quarantine = await service.quarantine(claim, {
    now: "2026-07-10T01:03:00.000Z",
    errorClass: "unsupported_payload",
    errorMessageRedacted: "unsupported shadow payload",
  });

  assert.equal(claim.maxAttempts, 8);
  assert.equal(retry.status, "retry_wait");
  assert.equal(quarantine.status, "quarantined");
  assert.match(subject.calls[0]!.sql, /claim_shadow_candidate_outbox_v2/);
  assert.match(subject.calls[1]!.sql, /retry_or_quarantine_outbox_v2/);
  assert.match(subject.calls[2]!.sql, /quarantine_outbox_v2/);
});
