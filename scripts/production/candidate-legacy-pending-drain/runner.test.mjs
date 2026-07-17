import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateLegacyPendingDrainError,
  evaluateDrainCompletion,
  evaluateDrainPreflight,
  rollbackDrainEpoch,
  validateDrainSnapshot,
} from "./runner.mjs";

const digest = `sha256:${"a".repeat(64)}`;

function snapshot(overrides = {}) {
  const value = {
    candidateWorkerAbsent: true,
    control: {
      approvalDigest: digest,
      deadlineAt: "2026-07-19T01:38:00.099Z",
      epoch: 4,
      migrationId: "candidate-episode-v1",
      phase: "legacy",
      releaseId: "candidate-shadow-e5eb90026d8b",
      startedAt: "2026-07-16T01:38:00.099Z",
      writeFrozen: true,
    },
    counts: {
      checkpoints: 0,
      claimed: 0,
      completed: 2_957,
      episodes: 543,
      events: 2_957,
      outbox: 5_914,
      outcomes: 0,
      pending: 2_957,
      quarantined: 0,
      resolutions: 0,
      retryWait: 0,
      unresolved: 2_957,
    },
    databaseNow: "2026-07-17T10:40:00.000Z",
    migrationCount: 10,
    scannerPaused: true,
    sourceWriteReachable: false,
  };
  return {
    ...value,
    ...overrides,
    control: { ...value.control, ...(overrides.control ?? {}) },
    counts: { ...value.counts, ...(overrides.counts ?? {}) },
  };
}

test("accepts exact production-shaped pending-only frozen legacy state", () => {
  const result = evaluateDrainPreflight(snapshot());
  assert.equal(result.status, "PASS_LEGACY_PENDING_ONLY_DRAIN_PREFLIGHT");
  assert.equal(result.pending, 2_957);
  assert.equal(result.drainEpoch, 5);
  assert.equal(result.finalFrozenEpoch, 6);
  assert.equal(result.productionMutation, false);
});

test("rejects schema drift and a non-frozen or non-legacy control", () => {
  assert.throws(() => validateDrainSnapshot(snapshot({ migrationCount: 9 })),
    (error) => error instanceof CandidateLegacyPendingDrainError
      && error.reason === "migration_count_not_10");
  assert.throws(() => validateDrainSnapshot(snapshot({ control: { phase: "shadow_capture" } })),
    /control_phase_invalid/u);
  assert.throws(() => validateDrainSnapshot(snapshot({ control: { writeFrozen: false } })),
    /control_write_frozen_invalid/u);
});

test("rejects source reachability, an active candidate worker, or a running scanner", () => {
  assert.throws(() => evaluateDrainPreflight(snapshot({ sourceWriteReachable: true })),
    /candidate_source_write_reachable/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({ candidateWorkerAbsent: false })),
    /candidate_worker_state_invalid/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({ scannerPaused: false })),
    /scanner_not_paused/u);
});

test("rejects claimed retry quarantined resolution or mixed unresolved state", () => {
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { pending: 2_956, claimed: 1 },
  })), /claimed_work_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { pending: 2_956, retryWait: 1 },
  })), /retry_wait_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { pending: 2_956, quarantined: 1 },
  })), /quarantined_work_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({ counts: { resolutions: 1 } })),
    /quarantine_resolution_present/u);
});

test("rejects an expired or too-short non-resettable deadline", () => {
  assert.throws(() => evaluateDrainPreflight(snapshot({
    databaseNow: "2026-07-19T01:20:00.099Z",
  })), /control_deadline_remaining_insufficient/u);
});

test("accepts full drain with exact event projection and final frozen epoch", () => {
  const before = snapshot();
  const after = snapshot({
    control: { epoch: 6 },
    counts: {
      completed: 5_914,
      episodes: 900,
      events: 5_914,
      pending: 0,
      unresolved: 0,
    },
  });
  const result = evaluateDrainCompletion(before, after);
  assert.equal(result.status, "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN");
  assert.equal(result.drained, 2_957);
  assert.equal(result.nextCycleAuthorized, false);
});

test("completion rejects deletion, partial drain, projection loss, or control drift", () => {
  const before = snapshot();
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 6 },
    counts: { outbox: 5_913, completed: 5_913, pending: 0, unresolved: 0, events: 5_914 },
  })), /outbox_total_changed/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({ control: { epoch: 6 } })),
    /outbox_not_fully_completed/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 6 },
    counts: { completed: 5_914, pending: 0, unresolved: 0, events: 5_913 },
  })), /event_projection_count_mismatch/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 6, releaseId: "candidate-shadow-changed-release" },
    counts: { completed: 5_914, pending: 0, unresolved: 0, events: 5_914 },
  })), /control_release_changed/u);
});

test("unknown fields are rejected instead of ignored", () => {
  assert.throws(() => evaluateDrainPreflight({ ...snapshot(), lowerThreshold: true }),
    /snapshot_shape_invalid/u);
});

test("rollback freeze advances an odd drain epoch without requiring a false success state", async () => {
  const statements = [];
  const client = {
    async query(statement, params = []) {
      statements.push({ statement, params });
      if (/transition_migration_control_v1/u.test(statement)) {
        return { rows: [{
          approved_release_id: "candidate-shadow-e5eb90026d8b",
          epoch: 6,
          migration_id: "candidate-episode-v1",
          phase: "legacy",
          write_frozen: true,
        }] };
      }
      return { rows: [] };
    },
  };
  const result = await rollbackDrainEpoch(client, {
    approvalDigest: digest,
    expectedEpoch: 5,
    migrationId: "candidate-episode-v1",
    releaseId: "candidate-shadow-e5eb90026d8b",
  });
  assert.equal(result.epoch, 6);
  assert.equal(result.write_frozen, true);
  assert.equal(statements.some(({ statement }) => /SET LOCAL ROLE candidate_migration_role/u.test(statement)), true);
  assert.equal(statements.some(({ params }) => params[1] === 5), true);
});
