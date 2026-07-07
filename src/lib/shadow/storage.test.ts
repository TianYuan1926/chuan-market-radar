import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDedupeAndTransitions,
  buildCheckpointPlan,
  buildEventsManifest,
  buildShadowLatest,
  buildShadowObservationEvent,
  buildShadowRunManifest,
  validateShadowStoragePayload,
  type ShadowObservationEvent,
  type ShadowRunStatus,
} from "./storage";

const nowIso = "2026-07-07T13:00:00.000Z";
const production = {
  commit: "ae6852cfa2a2c9c09faa5d41ae6f5c886f023679",
  evidenceValidate: "pass" as const,
  health: "pass" as const,
  targetUrl: "http://example.local",
};

function manifest(status: ShadowRunStatus = "prepared") {
  return buildShadowRunManifest({
    nowIso,
    production,
    runId: "shadow-test-run",
    status,
  });
}

const scan = {
  metadata: {
    activeSource: "coinglass",
    generatedAt: nowIso,
    status: "fresh",
  },
  instrumentPool: {
    candidateCount: 2,
    scannedCount: 28,
  },
  ok: true,
  signals: [
    {
      id: "wait-tia",
      symbol: "TIAUSDT",
      state: "waiting_confirmation",
      strategyStatus: "waiting",
      updatedAt: nowIso,
    },
    {
      id: "observe-sui",
      symbol: "SUIUSDT",
      state: "normal_watch",
      strategyStatus: "observe_only",
      updatedAt: nowIso,
    },
  ],
};

function event(symbol = "TIAUSDT", overrides: Partial<ShadowObservationEvent> = {}) {
  return {
    ...buildShadowObservationEvent({
      nowIso,
      runId: "shadow-test-run",
      scan,
      signal: {
        symbol,
        state: "waiting_confirmation",
        strategyStatus: "waiting",
        updatedAt: nowIso,
      },
    }).event,
    ...overrides,
  };
}

test("buildShadowRunManifest keeps phase 5.1 in baseline readiness and research-only mode", () => {
  const run = manifest("ready_to_start");

  assert.equal(run.phase, "5.1");
  assert.equal(run.mode, "baseline_readiness");
  assert.equal(run.shadowTrackingStarted, false);
  assert.equal(run.stillNotReadyForLiveTrading, true);
  assert.equal(run.boundaries.autoTradingEnabled, false);
  assert.equal(run.boundaries.mutatesProductionRanking, false);
  assert.equal(run.boundaries.mutatesStrategyWeights, false);
  assert.equal(run.boundaries.allowsParameterAutoTuning, false);
  assert.equal(run.boundaries.researchOnly, true);
  assert.equal(run.canStartShadowV1, true);
});

test("shadow observation maps production scan signals without promoting missing READY facts", () => {
  const result = buildShadowObservationEvent({
    nowIso,
    runId: "shadow-test-run",
    scan,
    signal: {
      maturity: { stage: "TRADE_PLAN_READY" },
      state: "near_trigger",
      strategyStatus: "actionable",
      symbol: "ENAUSDT",
      updatedAt: nowIso,
    },
  });

  assert.equal(result.event.decision, "WAIT");
  assert.equal(result.event.researchOnly, true);
  assert.equal(result.event.readyPlan, null);
  assert.ok(result.warnings.includes("production_ready_like_signal_missing_ready_plan_recorded_as_wait"));
  assert.ok(result.event.blockers.includes("wait_trigger_missing_from_scan_contract"));
});

test("dedupe skips same symbol and decision in the same bucket", () => {
  const first = event("TIAUSDT");
  const second = event("TIAUSDT");
  const result = applyDedupeAndTransitions({
    existingEvents: [first],
    incomingEvents: [second],
    nowIso,
    runId: "shadow-test-run",
  });

  assert.equal(result.duplicateEvents, 1);
  assert.equal(result.primaryEvents.length, 0);
  assert.equal(result.transitions.length, 0);
});

test("dedupe records transitions when decision changes", () => {
  const previous = event("TIAUSDT", { decision: "OBSERVE", dedupeKey: "TIAUSDT:OBSERVE:production_scan:2026-07-07T13:00:00.000Z" });
  const next = event("TIAUSDT", {
    decision: "WAIT",
    dedupeKey: "TIAUSDT:WAIT:production_scan:2026-07-07T13:00:00.000Z",
  });
  const result = applyDedupeAndTransitions({
    existingEvents: [previous],
    incomingEvents: [next],
    nowIso,
    runId: "shadow-test-run",
  });

  assert.equal(result.duplicateEvents, 0);
  assert.equal(result.primaryEvents.length, 1);
  assert.equal(result.transitions.length, 1);
  assert.equal(result.transitions[0]?.fromDecision, "OBSERVE");
  assert.equal(result.transitions[0]?.toDecision, "WAIT");
});

test("different run ids do not dedupe each other", () => {
  const previous = event("TIAUSDT", { runId: "old-run" });
  const next = event("TIAUSDT", { runId: "new-run" });
  const result = applyDedupeAndTransitions({
    existingEvents: [previous],
    incomingEvents: [next],
    nowIso,
    runId: "new-run",
  });

  assert.equal(result.duplicateEvents, 0);
  assert.equal(result.primaryEvents.length, 1);
});

test("checkpoint plan creates only pending 1h 4h 24h checkpoints", () => {
  const events = [event("TIAUSDT"), event("SUIUSDT")];
  const plan = buildCheckpointPlan("shadow-test-run", nowIso, events);

  assert.equal(plan.checkpoints.length, 6);
  assert.deepEqual(plan.checkpoints.map((item) => item.checkpointType).slice(0, 3), ["1h", "4h", "24h"]);
  for (const checkpoint of plan.checkpoints) {
    assert.equal(checkpoint.status, "pending");
    assert.equal(checkpoint.priceAtCheckpoint, null);
    assert.equal(checkpoint.maxFavorableMove, null);
    assert.equal(checkpoint.maxAdverseMove, null);
  }
});

test("validator rejects baseline fake start and future outcome fill, but allows 5.1-R live manifest", () => {
  const run = manifest("ready_to_start");
  const events = [event("TIAUSDT")];
  const checkpointPlan = buildCheckpointPlan(run.runId, nowIso, events);
  const latest = buildShadowLatest({
    checkpointPlan,
    duplicateEvents: 0,
    events,
    manifest: run,
    scan,
    transitions: [],
    warnings: [],
  });
  const eventsManifest = buildEventsManifest({
    duplicateEvents: 0,
    events,
    eventsPath: run.storage.eventsPath,
    generatedAt: nowIso,
    runId: run.runId,
    transitions: [],
  });

  const valid = validateShadowStoragePayload({ checkpointPlan, events, eventsManifest, latest, manifest: run });
  assert.equal(valid.ok, true);

  const invalid = validateShadowStoragePayload({
    checkpointPlan: {
      ...checkpointPlan,
      checkpoints: [{
        ...checkpointPlan.checkpoints[0]!,
        priceAtCheckpoint: 1.2 as never,
      }],
    },
    events,
    eventsManifest,
    latest: {
      ...latest,
      shadowTrackingStarted: true as never,
    },
    manifest: {
      ...run,
      shadowTrackingStarted: true as never,
    },
  });

  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("manifest_shadow_tracking_started_true"));
  assert.ok(invalid.errors.includes(`checkpoint_future_outcome_filled:${events[0]?.eventId}:1h`));

  const liveRun = buildShadowRunManifest({
    mode: "shadow_v1_live_observation",
    nowIso,
    phase: "5.1-R",
    production,
    runId: "shadow-v1-test-run",
    shadowTrackingStarted: true,
    status: "running",
  });
  const liveEvents = [event("TIAUSDT", { runId: liveRun.runId })];
  const liveCheckpointPlan = buildCheckpointPlan(liveRun.runId, nowIso, liveEvents);
  const liveLatest = buildShadowLatest({
    checkpointPlan: liveCheckpointPlan,
    duplicateEvents: 0,
    events: liveEvents,
    manifest: liveRun,
    scan,
    transitions: [],
    warnings: [],
  });
  const liveEventsManifest = buildEventsManifest({
    duplicateEvents: 0,
    events: liveEvents,
    eventsPath: liveRun.storage.eventsPath,
    generatedAt: nowIso,
    runId: liveRun.runId,
    transitions: [],
  });

  const validLive = validateShadowStoragePayload({
    checkpointPlan: liveCheckpointPlan,
    events: liveEvents,
    eventsManifest: liveEventsManifest,
    latest: liveLatest,
    manifest: liveRun,
  });

  assert.equal(validLive.ok, true);
});
