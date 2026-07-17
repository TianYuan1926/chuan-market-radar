import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  executeDatabaseCommand,
  loadPgRuntime,
  parseArgs,
  readProductionRequest,
} from "./db-runner.mjs";

test("database runner resolves pg from the target image before the mounted packet", () => {
  const attempted = [];
  const approvedRuntime = { Pool: class ApprovedPool {} };
  const runtime = loadPgRuntime({
    applicationRoot: "/app",
    moduleUrl: "file:///packet/scripts/production/db-runner.mjs",
    requireFactory: (base) => (specifier) => {
      attempted.push({ base: String(base), specifier });
      if (String(base) === "/app/package.json") return approvedRuntime;
      const error = new Error("not found");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    },
  });
  assert.equal(runtime, approvedRuntime);
  assert.deepEqual(attempted, [{ base: "/app/package.json", specifier: "pg" }]);
});

test("CLI accepts only the six bounded database commands", () => {
  assert.deepEqual(parseArgs(["open", "--request", "request.json"]), {
    args: { request: "request.json" }, command: "open",
  });
  assert.throws(() => parseArgs(["delete", "--request", "request.json"]), /command_invalid/u);
  assert.throws(() => parseArgs(["open", "request.json"]), /arguments_invalid/u);
});

test("request parser rejects a package that changes counts or skips an epoch", async () => {
  const root = await mkdtemp(join(tmpdir(), "candidate-drain-request-test-"));
  const request = {
    schemaVersion: "candidate-legacy-pending-drain-production-request.v1",
    packageId: "WP-G0.2-LEGACY-PENDING-DRAIN-PRODUCTION",
    migrationId: "candidate-episode-v1",
    currentPhase: "legacy",
    currentWriteFrozen: true,
    sourceEpoch: 4,
    drainEpoch: 6,
    finalEpoch: 7,
    releaseId: "candidate-shadow-e5eb90026d8b",
    controlApprovalDigest: `sha256:${"a".repeat(64)}`,
    expectedCounts: { outbox: 5_914, completed: 2_957, pending: 2_957, unresolved: 2_957 },
  };
  try {
    const path = join(root, "request.json");
    await writeFile(path, JSON.stringify(request));
    await assert.rejects(() => readProductionRequest(path), /request_epoch_sequence_invalid/u);
    request.drainEpoch = 5;
    request.finalEpoch = 6;
    request.expectedCounts.pending = 2_956;
    await writeFile(path, JSON.stringify(request));
    await assert.rejects(() => readProductionRequest(path), /request_counts_invalid/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollback is idempotent when the control is already frozen legacy", async () => {
  const request = {
    controlApprovalDigest: `sha256:${"a".repeat(64)}`,
    drainEpoch: 5,
    migrationId: "candidate-episode-v1",
    releaseId: "candidate-shadow-e5eb90026d8b",
  };
  const values = {
    database_now: new Date("2026-07-17T10:40:00Z"), migration_count: 10,
    migration_id: "candidate-episode-v1", phase: "legacy", epoch: 6,
    started_at: new Date("2026-07-16T01:38:00Z"), deadline_at: new Date("2026-07-19T01:38:00Z"),
    write_frozen: true, approved_release_id: request.releaseId,
    approval_digest: request.controlApprovalDigest,
    episodes: 900, events: 5_914, checkpoints: 0, outcomes: 0,
    outbox: 5_914, completed: 5_914, pending: 0, claimed: 0,
    retry_wait: 0, quarantined: 0, unresolved: 0, resolutions: 0,
    legacy_completed: 5_914, legacy_pending: 0, legacy_unresolved: 0,
    candidate_event_pending: 0, candidate_event_unresolved: 0, other_unresolved: 0,
  };
  const client = { query: async () => ({ rows: [values] }) };
  const result = await executeDatabaseCommand({
    beforeSnapshot: null, client, command: "rollback", request,
    runtime: { candidateWorkerAbsent: true, scannerPaused: true, sourceWriteReachable: false },
  });
  assert.equal(result.status, "PASS_DRAIN_ALREADY_FROZEN");
  assert.equal(result.control.epoch, 6);
});
