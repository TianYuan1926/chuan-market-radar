import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "../analysis/types";
import { buildLegacyCandidateDiagnosticRead } from "./legacy-read-diagnostic";

const policy = {
  scope: "production_radar",
  asOf: "2026-07-12T01:00:00.000Z",
  releaseId: "candidate-shadow-release-test",
  checkpointKind: "1h",
  evidenceGradeVersion: "eg.v1",
  observationCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
  dueCohort: {
    from: "2026-07-12T00:00:00.000Z",
    toExclusive: "2026-07-12T00:30:00.000Z",
  },
} as const;

function event(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "legacy-event-1",
    symbol: "BTCUSDT",
    title: "legacy",
    result: "watching",
    note: "diagnostic only",
    rankDelta: 0,
    createdAt: "2026-07-12T00:05:00.000Z",
    direction: "neutral",
    outcomeMetrics: {
      entryPrice: 100,
      evaluatedCandles: 60,
      firstTargetPrice: 110,
      invalidationPrice: 95,
      mfePercent: 10,
      maePercent: -5,
      validationWindowHours: 24,
      validationWindowLabel: "24h",
    },
    ...overrides,
  };
}

test("legacy adapter preserves only diagnostic overlap and cannot prove canonical parity", () => {
  const result = buildLegacyCandidateDiagnosticRead({ events: [event()], policy });
  assert.equal(result.status, "diagnostic_only");
  assert.equal(result.authority, "legacy_projection_non_authoritative");
  assert.equal(result.canProveCanonicalParity, false);
  assert.equal(result.canAuthorizeCutover, false);
  assert.equal(result.canCreateTradePlan, false);
  assert.equal(result.canMutateLiveRanking, false);
  assert.deepEqual(result.observations, [{
    legacyEventId: "legacy-event-1",
    rawInstrument: "BTCUSDT",
    observedAt: "2026-07-12T00:05:00.000Z",
    explicitDirection: "neutral",
  }]);
  assert.ok(result.unsupportedCanonicalFields.includes("episodeId"));
  assert.ok(result.unsupportedCanonicalFields.includes("authoritativeReviewDenominators"));
  assert.equal(JSON.stringify(result).includes("mfePercent"), false);
  assert.equal(JSON.stringify(result).includes("entryPrice"), false);
});

test("legacy empty remains non-authoritative and invalid rows are explicit partial", () => {
  const empty = buildLegacyCandidateDiagnosticRead({
    events: [event({ createdAt: "2026-07-11T00:00:00.000Z" })],
    policy,
  });
  assert.equal(empty.status, "empty");
  assert.equal(empty.canProveCanonicalParity, false);
  assert.ok(empty.blockers.includes("legacy_authoritative_denominators_unavailable"));

  const partial = buildLegacyCandidateDiagnosticRead({
    events: [event({ createdAt: "invalid" })],
    policy,
  });
  assert.equal(partial.status, "partial");
  assert.ok(partial.blockers.includes("legacy_event_timestamp_invalid:legacy-event-1"));
});

test("invalid policy returns unavailable rather than broadening the cohort", () => {
  const result = buildLegacyCandidateDiagnosticRead({
    events: [event()],
    policy: { ...policy, releaseId: "" },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.observations, null);
  assert.equal(result.contentHash, null);
});
