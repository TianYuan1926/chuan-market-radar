import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CandidateCheckpointExecutor,
  CandidateCheckpointScheduler,
  type CandidateCheckpointClaim,
  type PrevalidatedEvidenceGradeV1Outcome,
} from "./checkpoint-outcome-service";
import type {
  PostgresTransactionAdapter,
  QueryResult,
  TransactionContext,
  TransactionOptions,
} from "./transaction-adapter";

type QueryCall = { params: unknown[]; sql: string; transaction: number };

function adapter(
  respond: (sql: string, params: unknown[]) => unknown[] = () => [],
): {
  calls: QueryCall[];
  options: TransactionOptions[];
  value: PostgresTransactionAdapter;
} {
  const calls: QueryCall[] = [];
  const options: TransactionOptions[] = [];
  let transaction = 0;
  const value: PostgresTransactionAdapter = {
    async withTransaction<T>(
      transactionOptions: TransactionOptions,
      work: (tx: TransactionContext) => Promise<T>,
    ) {
      options.push(transactionOptions);
      transaction += 1;
      const currentTransaction = transaction;
      const tx: TransactionContext = {
        async query<R = unknown>(sql: string, params: unknown[] = []) {
          calls.push({ sql, params, transaction: currentTransaction });
          return { rows: respond(sql, params) as R[] } satisfies QueryResult<R>;
        },
        async withSavepoint<R>(nested: (context: TransactionContext) => Promise<R>) {
          return nested(tx);
        },
      };
      return work(tx);
    },
  };

  return { calls, options, value };
}

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++];
}

const scheduleCommand = {
  scope: "production_radar" as const,
  episodeId: "018f0000-0000-7000-8000-000000000001",
  sourceEventId: "018f0000-0000-7000-8000-000000000002",
  observedAt: "2026-07-10T08:15:00.000Z",
  releaseId: "release-wp-g0-2",
  runtimeId: "checkpoint-scheduler-rehearsal",
};

test("scheduler derives 1h, 4h and 24h checkpoints from immutable observation time in one transaction", async () => {
  const db = adapter((_sql, params) => [{
    result_checkpoint_id: params[1],
    created: true,
  }]);
  const scheduler = new CandidateCheckpointScheduler(db.value, {
    generateId: ids(
      "018f0000-0000-7000-8000-000000000011",
      "018f0000-0000-7000-8000-000000000012",
      "018f0000-0000-7000-8000-000000000013",
      "018f0000-0000-7000-8000-000000000014",
      "018f0000-0000-7000-8000-000000000015",
      "018f0000-0000-7000-8000-000000000016",
    ),
  });

  const result = await scheduler.scheduleForObservation(scheduleCommand);

  assert.deepEqual(result.map(({ checkpointKind, dueAt, windowStart, windowEnd }) => ({
    checkpointKind,
    dueAt,
    windowStart,
    windowEnd,
  })), [
    {
      checkpointKind: "1h",
      dueAt: "2026-07-10T09:15:00.000Z",
      windowStart: scheduleCommand.observedAt,
      windowEnd: "2026-07-10T09:15:00.000Z",
    },
    {
      checkpointKind: "4h",
      dueAt: "2026-07-10T12:15:00.000Z",
      windowStart: scheduleCommand.observedAt,
      windowEnd: "2026-07-10T12:15:00.000Z",
    },
    {
      checkpointKind: "24h",
      dueAt: "2026-07-11T08:15:00.000Z",
      windowStart: scheduleCommand.observedAt,
      windowEnd: "2026-07-11T08:15:00.000Z",
    },
  ]);
  assert.equal(db.options.length, 1);
  assert.equal(db.options[0].isolation, "serializable");
  assert.deepEqual(new Set(db.calls.map((call) => call.transaction)), new Set([1]));
  assert.equal(db.calls.length, 3);
  assert.ok(db.calls.every((call) => (
    /^SELECT \* FROM candidate_authority\.schedule_checkpoint_v1\(/.test(call.sql)
    && call.params.length === 14
  )));
  assert.deepEqual(db.calls.map((call) => call.params[5]), ["1h", "4h", "24h"]);
});

test("scheduler keeps idempotency keys and command hashes stable when generated ids change", async () => {
  const db = adapter((_sql, params) => [{ result_checkpoint_id: params[1], created: false }]);
  const scheduler = new CandidateCheckpointScheduler(db.value, {
    generateId: ids(...Array.from({ length: 12 }, (_, index) => `generated-${index + 1}`)),
  });

  await scheduler.scheduleForObservation(scheduleCommand);
  await scheduler.scheduleForObservation(scheduleCommand);

  for (let index = 0; index < 3; index += 1) {
    assert.notEqual(db.calls[index].params[1], db.calls[index + 3].params[1]);
    assert.equal(db.calls[index].params[12], db.calls[index + 3].params[12]);
    assert.equal(db.calls[index].params[13], db.calls[index + 3].params[13]);
    assert.match(String(db.calls[index].params[12]), /^checkpoint:schedule:v1:/);
    assert.match(String(db.calls[index].params[13]), /^sha256:[a-f0-9]{64}$/);
  }
});

const claimedRow = {
  checkpoint_id: "018f0000-0000-7000-8000-000000000021",
  scope: "production_radar",
  episode_id: scheduleCommand.episodeId,
  source_event_id: scheduleCommand.sourceEventId,
  checkpoint_kind: "1h",
  due_at: "2026-07-10T09:15:00.000Z",
  window_start: scheduleCommand.observedAt,
  window_end: "2026-07-10T09:15:00.000Z",
  finalize_by: "2026-07-11T09:15:00.000Z",
  status: "claimed",
  attempt_count: 1,
  max_attempts: 5,
  claimed_by_runtime_id: "checkpoint-executor-rehearsal",
  claim_expires_at: "2026-07-10T09:25:00.000Z",
  fencing_token: "7",
  release_id: "release-wp-g0-2",
};

test("executor claims through claim_checkpoints_v1 and exposes the database fencing token", async () => {
  const db = adapter((sql) => sql.includes("claim_checkpoints_v1") ? [claimedRow] : []);
  const executor = new CandidateCheckpointExecutor(db.value, {
    generateId: ids(),
  });

  const claims = await executor.claimDue({
    scope: "production_radar",
    runtimeId: "checkpoint-executor-rehearsal",
    now: "2026-07-10T09:20:00.000Z",
    limit: 20,
  });

  assert.equal(claims[0].fencingToken, 7);
  assert.equal(claims[0].attemptCount, 1);
  assert.deepEqual(db.calls[0], {
    sql: "SELECT * FROM candidate_authority.claim_checkpoints_v1($1, $2, $3, $4, $5)",
    params: [
      "production_radar",
      "checkpoint-executor-rehearsal",
      "2026-07-10T09:20:00.000Z",
      300,
      20,
    ],
    transaction: 1,
  });
});

test("retry uses retry_checkpoint_v1 with attempt-and-fence idempotency and creates no Outcome", async () => {
  const db = adapter((sql) => sql.includes("retry_checkpoint_v1") ? [claimedRow] : []);
  const executor = new CandidateCheckpointExecutor(db.value, {
    generateId: ids("018f0000-0000-7000-8000-000000000022"),
  });
  const claim = (await new CandidateCheckpointExecutor(
    adapter(() => [claimedRow]).value,
    { generateId: ids() },
  ).claimDue({
    scope: "production_radar",
    runtimeId: "checkpoint-executor-rehearsal",
    now: "2026-07-10T09:20:00.000Z",
    limit: 1,
  }))[0];

  await executor.retry(claim, {
    now: "2026-07-10T09:20:00.000Z",
    errorClass: "HISTORICAL_SOURCE_TIMEOUT",
    errorMessageRedacted: "historical source timed out",
  });

  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /^SELECT \* FROM candidate_authority\.retry_checkpoint_v1\(/);
  assert.doesNotMatch(db.calls[0].sql, /record_outcome_v1/);
  assert.equal(db.calls[0].params.length, 11);
  assert.equal(db.calls[0].params[3], 7);
  assert.equal(db.calls[0].params[5], "2026-07-10T09:21:00.000Z");
  assert.equal(
    db.calls[0].params[9],
    `checkpoint:retry:v1:production_radar:${claimedRow.checkpoint_id}:1:7`,
  );
});

test("executor rejects an absent fencing token before opening a transaction", async () => {
  const db = adapter();
  const executor = new CandidateCheckpointExecutor(db.value, { generateId: ids() });
  const claim = {
    checkpointId: claimedRow.checkpoint_id,
    scope: "production_radar",
    episodeId: claimedRow.episode_id,
    sourceEventId: claimedRow.source_event_id,
    checkpointKind: "1h",
    dueAt: claimedRow.due_at,
    windowStart: claimedRow.window_start,
    windowEnd: claimedRow.window_end,
    finalizeBy: claimedRow.finalize_by,
    attemptCount: 1,
    maxAttempts: 5,
    runtimeId: claimedRow.claimed_by_runtime_id,
    claimExpiresAt: claimedRow.claim_expires_at,
    fencingToken: 0,
    releaseId: claimedRow.release_id,
  } satisfies CandidateCheckpointClaim;

  await assert.rejects(
    executor.retry(claim, {
      now: "2026-07-10T09:20:00.000Z",
      errorClass: "HISTORICAL_SOURCE_TIMEOUT",
      errorMessageRedacted: "historical source timed out",
    }),
    /fencing token/i,
  );
  assert.equal(db.options.length, 0);
});

const prevalidatedOutcome: PrevalidatedEvidenceGradeV1Outcome = {
  evidenceGradeVersion: "eg.v1",
  status: "recorded",
  contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  observationPrice: 100,
  observationPriceFactId: "fact-observation-price-1",
  windowStart: scheduleCommand.observedAt,
  windowEnd: "2026-07-10T09:15:00.000Z",
  historicalSource: "binance-futures-klines",
  historicalInstrumentId: "BTCUSDT",
  candleInterval: "1m",
  expectedCandles: 60,
  actualCandles: 60,
  missingCandles: 0,
  duplicateCandles: 0,
  coverageRatio: 1,
  candleSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  mfe: 2.5,
  mae: 0.75,
  returnAtClose: 1.25,
  evidenceGrade: true,
  evidenceGradeReasons: [],
  validatedAt: "2026-07-10T09:20:00.000Z",
  releaseId: "release-wp-g0-2",
  runnerVersion: "checkpoint-executor.v1",
  recordedAt: "2026-07-10T09:20:00.000Z",
};

test("recordOutcome sends prevalidated eg.v1 terminal data through record_outcome_v1 in one transaction", async () => {
  const outcomeRow = {
    outcome_id: "018f0000-0000-7000-8000-000000000023",
    checkpoint_id: claimedRow.checkpoint_id,
    status: "recorded",
    content_hash: prevalidatedOutcome.contentHash,
    evidence_grade: true,
    evidence_grade_version: "eg.v1",
  };
  const db = adapter((sql) => sql.includes("record_outcome_v1") ? [outcomeRow] : []);
  const executor = new CandidateCheckpointExecutor(db.value, {
    generateId: ids(
      "018f0000-0000-7000-8000-000000000023",
      "018f0000-0000-7000-8000-000000000024",
    ),
  });
  const claim: CandidateCheckpointClaim = {
    checkpointId: claimedRow.checkpoint_id,
    scope: "production_radar",
    episodeId: claimedRow.episode_id,
    sourceEventId: claimedRow.source_event_id,
    checkpointKind: "1h",
    dueAt: claimedRow.due_at,
    windowStart: claimedRow.window_start,
    windowEnd: claimedRow.window_end,
    finalizeBy: claimedRow.finalize_by,
    attemptCount: 1,
    maxAttempts: 5,
    runtimeId: claimedRow.claimed_by_runtime_id,
    claimExpiresAt: claimedRow.claim_expires_at,
    fencingToken: 7,
    releaseId: claimedRow.release_id,
  };

  const result = await executor.recordOutcome(claim, prevalidatedOutcome);

  assert.deepEqual(result, {
    outcomeId: outcomeRow.outcome_id,
    checkpointId: outcomeRow.checkpoint_id,
    status: "recorded",
    contentHash: prevalidatedOutcome.contentHash,
    evidenceGrade: true,
    evidenceGradeVersion: "eg.v1",
  });
  assert.equal(db.options.length, 1);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /^SELECT \* FROM candidate_authority\.record_outcome_v1\(/);
  assert.equal(db.calls[0].params.length, 32);
  assert.deepEqual(db.calls[0].params.slice(0, 7), [
    "production_radar",
    "018f0000-0000-7000-8000-000000000023",
    claimedRow.checkpoint_id,
    claimedRow.claimed_by_runtime_id,
    7,
    "recorded",
    prevalidatedOutcome.contentHash,
  ]);
  assert.equal(
    db.calls[0].params[30],
    `checkpoint:outcome:v1:production_radar:${claimedRow.checkpoint_id}`,
  );
});

test("recordOutcome rejects non-eg.v1 input before opening a transaction", async () => {
  const db = adapter();
  const executor = new CandidateCheckpointExecutor(db.value, { generateId: ids() });
  const claim = {
    checkpointId: claimedRow.checkpoint_id,
    scope: "production_radar",
    episodeId: claimedRow.episode_id,
    sourceEventId: claimedRow.source_event_id,
    checkpointKind: "1h",
    dueAt: claimedRow.due_at,
    windowStart: claimedRow.window_start,
    windowEnd: claimedRow.window_end,
    finalizeBy: claimedRow.finalize_by,
    attemptCount: 1,
    maxAttempts: 5,
    runtimeId: claimedRow.claimed_by_runtime_id,
    claimExpiresAt: claimedRow.claim_expires_at,
    fencingToken: 7,
    releaseId: claimedRow.release_id,
  } satisfies CandidateCheckpointClaim;

  await assert.rejects(
    executor.recordOutcome(claim, {
      ...prevalidatedOutcome,
      evidenceGradeVersion: "eg.v2",
    } as unknown as PrevalidatedEvidenceGradeV1Outcome),
    /prevalidated eg\.v1/i,
  );
  assert.equal(db.options.length, 0);
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  }));
  return files.flat().filter((file) => /\.[cm]?[jt]sx?$/.test(file));
}

test("dormant checkpoint and Outcome wrappers are not wired into production API or Shadow", async () => {
  const roots = [
    path.join(process.cwd(), "src", "app", "api"),
    path.join(process.cwd(), "src", "lib", "shadow"),
  ];
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const imports = await Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(file, "utf8"),
  })));

  assert.deepEqual(
    imports
      .filter(({ source }) => /checkpoint-outcome-service/.test(source))
      .map(({ file }) => file),
    [],
  );
});
