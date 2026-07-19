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
      epoch: 2,
      migrationId: "candidate-episode-v1-cycle-6",
      phase: "legacy",
      releaseId: "candidate-shadow-cycle-6-72ee2893",
      startedAt: "2026-07-16T01:38:00.099Z",
      writeFrozen: true,
    },
    counts: {
      candidateEventContractMismatches: 0,
      candidateEventNonPending: 0,
      candidateEventOrphans: 0,
      candidateEventPending: 2_957,
      candidateEventUnresolved: 2_957,
      checkpoints: 0,
      claimed: 0,
      completed: 2_957,
      episodes: 543,
      events: 2_957,
      legacyCompleted: 2_957,
      legacyPending: 2_957,
      legacyUnresolved: 2_957,
      otherUnresolved: 0,
      outbox: 8_871,
      outcomes: 0,
      pending: 5_914,
      quarantined: 0,
      resolutions: 0,
      retryWait: 0,
      unresolved: 5_914,
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

test("accepts legacy pending work while preserving the exact Candidate event mirror lane", () => {
  const result = evaluateDrainPreflight(snapshot());
  assert.equal(result.status, "PASS_LEGACY_PENDING_WITH_EVENT_MIRROR_DRAIN_PREFLIGHT");
  assert.equal(result.pending, 2_957);
  assert.equal(result.drainEpoch, 3);
  assert.equal(result.finalFrozenEpoch, 4);
  assert.equal(result.productionMutation, false);
});

test("rejects a state where no Legacy work remains even if Candidate mirrors are pending", () => {
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: {
      legacyPending: 0,
      legacyUnresolved: 0,
      outbox: 5_914,
      pending: 2_957,
      unresolved: 2_957,
    },
  })), /legacy_pending_work_missing/u);
});

test("rejects Candidate mirror drift, orphan rows, or non-pending mirror delivery", () => {
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { candidateEventPending: 2_956, candidateEventUnresolved: 2_956,
      outbox: 8_870, pending: 5_913, unresolved: 5_913 },
  })), /candidate_event_mirror_count_mismatch/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { candidateEventOrphans: 1 },
  })), /candidate_event_orphan_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { candidateEventNonPending: 1, completed: 2_958, outbox: 8_872 },
  })), /candidate_event_status_sum_mismatch/u);
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
    counts: { pending: 5_913, claimed: 1, legacyPending: 2_956 },
  })), /claimed_work_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { pending: 5_913, retryWait: 1, legacyPending: 2_956 },
  })), /retry_wait_present/u);
  assert.throws(() => evaluateDrainPreflight(snapshot({
    counts: { pending: 5_913, quarantined: 1, legacyPending: 2_956 },
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
    control: { epoch: 4 },
    counts: {
      completed: 5_914,
      episodes: 900,
      events: 5_914,
      legacyCompleted: 5_914,
      legacyPending: 0,
      legacyUnresolved: 0,
      candidateEventPending: 5_914,
      candidateEventUnresolved: 5_914,
      outbox: 11_828,
      pending: 5_914,
      unresolved: 5_914,
    },
  });
  const result = evaluateDrainCompletion(before, after);
  assert.equal(result.status, "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN");
  assert.equal(result.drained, 2_957);
  assert.equal(result.nextCycleAuthorized, false);
  assert.equal(result.candidateEventPending, 5_914);
});

test("completion rejects deletion, partial drain, projection loss, or control drift", () => {
  const before = snapshot();
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 4 },
    counts: {
      outbox: 11_827, completed: 5_914, pending: 5_913, unresolved: 5_913,
      events: 5_914, legacyCompleted: 5_914, legacyPending: 0, legacyUnresolved: 0,
      candidateEventPending: 5_913, candidateEventUnresolved: 5_913,
    },
  })), /outbox_mirror_growth_invalid/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({ control: { epoch: 4 } })),
    /outbox_mirror_growth_invalid/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 4 },
    counts: {
      completed: 5_914, pending: 5_914, unresolved: 5_914, events: 5_913,
      legacyCompleted: 5_914, legacyPending: 0, legacyUnresolved: 0,
      candidateEventPending: 5_914, candidateEventUnresolved: 5_914, outbox: 11_828,
    },
  })), /event_projection_count_mismatch/u);
  assert.throws(() => evaluateDrainCompletion(before, snapshot({
    control: { epoch: 4, releaseId: "candidate-shadow-changed-release" },
    counts: {
      completed: 5_914, pending: 5_914, unresolved: 5_914, events: 5_914,
      legacyCompleted: 5_914, legacyPending: 0, legacyUnresolved: 0,
      candidateEventPending: 5_914, candidateEventUnresolved: 5_914, outbox: 11_828,
    },
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
          approved_release_id: "candidate-shadow-cycle-6-72ee2893",
          epoch: 4,
          migration_id: "candidate-episode-v1-cycle-6",
          phase: "legacy",
          write_frozen: true,
        }] };
      }
      return { rows: [] };
    },
  };
  const result = await rollbackDrainEpoch(client, {
    approvalDigest: digest,
    expectedEpoch: 3,
    migrationId: "candidate-episode-v1-cycle-6",
    releaseId: "candidate-shadow-cycle-6-72ee2893",
  });
  assert.equal(result.epoch, 4);
  assert.equal(result.write_frozen, true);
  assert.equal(statements.some(({ statement }) => /SET LOCAL ROLE candidate_migration_role/u.test(statement)), true);
  assert.equal(statements.some(({ params }) => params[1] === 3), true);
});
