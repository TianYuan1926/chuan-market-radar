import assert from "node:assert/strict";
import test from "node:test";
import {
  MINIMUM_COMPARED_WRITES,
  compareProjectionRow,
  evaluateReconciliationEvidence,
  hashPayload,
  hashProjectionCommand,
  validateApprovalRequest,
} from "./runner.mjs";

const releaseId = "candidate-shadow-release-20260712";
const context = {
  authorityEpoch: 1,
  controlStartedAt: Date.parse("2026-07-12T00:00:00.000Z"),
  controlDeadlineAt: Date.parse("2026-07-15T00:00:00.000Z"),
  observationEvidenceSha256: `sha256:${"a".repeat(64)}`,
  releaseId,
};
const control = {
  phase: "shadow_capture",
  authorityEpoch: 1,
  writeFrozen: false,
  releaseId,
};
const observation = {
  status: "PASS_ACTIVATE_AND_OBSERVE",
  releaseId,
  authorityEpoch: 1,
  coverageHours: 24,
  sampleCount: 289,
};
const statusCounts = {
  pending: 0,
  claimed: 0,
  retryWait: 0,
  completed: MINIMUM_COMPARED_WRITES,
  resolvedQuarantine: 0,
  unresolvedQuarantine: 0,
  unresolvedTotal: 0,
};

function uuid(index, family) {
  return `${family.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function fixtureRow(index = 1) {
  const outboxId = uuid(index, 1);
  const eventId = uuid(index, 2);
  const episodeId = uuid(index, 3);
  const instant = new Date(Date.parse("2026-07-12T01:00:00.000Z") + index).toISOString();
  const instrument = `BINANCE:ASSET${index}USDT:PERP`;
  const scanId = `scan-${index}`;
  const payload = {
    schemaVersion: "shadow-candidate-observation.v1",
    canonicalInstrumentId: instrument,
    venueContext: {
      schemaVersion: "shadow-venue-context.v1",
      venue: "BINANCE",
      venueInstrumentId: `ASSET${index}USDT`,
      contractType: "perpetual",
      settlementAsset: "USDT",
      resolutionStatus: "resolved",
      identityEvidenceIds: [`instrument:${instrument}`, `scan:${scanId}`],
    },
    firstSeenAt: instant,
    lastSeenAt: instant,
    observationPrice: "1.25",
    observationPriceFactId: `ticker:BINANCE:ASSET${index}USDT:${instant}`,
    discoveryReasons: ["light_scan_candidate"],
    priorityTier: "B",
    maturity: "light_candidate",
    directionState: "unknown",
    expiresAt: null,
    releaseId,
    sourceScanCycleId: scanId,
  };
  const row = {
    outbox_id: outboxId,
    source_type: "legacy_scan_candidate",
    source_id: `${scanId}:${instrument}`,
    source_version: instant,
    source_payload_version: "shadow-candidate-observation.v1",
    source_payload: payload,
    source_payload_hash: hashPayload(payload),
    source_idempotency_key: `shadow-capture:${scanId}:${instrument}`,
    source_status: "completed",
    source_created_at: instant,
    source_completed_at: new Date(Date.parse(instant) + 1_000).toISOString(),
    event_id: eventId,
    event_episode_id: episodeId,
    event_stream_version: 1,
    event_type: "DISCOVERED",
    event_time: instant,
    event_source_scan_cycle_id: scanId,
    event_release_id: releaseId,
    event_runtime_id: `${releaseId.replace("candidate-shadow-release", "candidate-shadow:candidate-shadow-release")}:worker-1`,
    event_idempotency_key: `shadow-projection:${outboxId}`,
    event_command_hash: null,
    event_payload_version: "candidate-event.v1",
    event_payload: { canonicalInstrumentId: instrument, eventType: "DISCOVERED" },
    episode_id: episodeId,
    episode_canonical_instrument_id: instrument,
    episode_first_seen_at: instant,
    episode_last_seen_at: instant,
  };
  row.event_runtime_id = `candidate-shadow:${releaseId}:worker-1`;
  row.event_command_hash = hashProjectionCommand({
    scope: "production_radar",
    canonicalInstrumentId: payload.canonicalInstrumentId,
    venueContext: payload.venueContext,
    firstSeenAt: payload.firstSeenAt,
    lastSeenAt: payload.lastSeenAt,
    observationPrice: payload.observationPrice,
    observationPriceFactId: payload.observationPriceFactId,
    discoveryReasons: payload.discoveryReasons,
    priorityTier: payload.priorityTier,
    maturity: payload.maturity,
    directionState: payload.directionState,
    expiresAt: payload.expiresAt,
    releaseId: payload.releaseId,
    sourceScanCycleId: payload.sourceScanCycleId,
    runtimeId: row.event_runtime_id,
    idempotencyKey: row.event_idempotency_key,
  });
  return row;
}

const contract = { runnerArtifact: { sha256: "b".repeat(64) } };
const request = {
  activationEvidenceSha256: `sha256:${"a".repeat(64)}`,
  activationObservationStatus: "PASS_ACTIVATE_AND_OBSERVE",
  approvalExpiresAt: "2026-07-12T09:00:00.000Z",
  approvalIssuedAt: "2026-07-12T08:00:00.000Z",
  approvalRef: "candidate-reconciliation-approval",
  approvedCommit: "1".repeat(40),
  approvedRunnerArtifactSha256: "b".repeat(64),
  authorityEpoch: 1,
  automaticPhaseAdvanceAllowed: false,
  businessDmlAllowed: false,
  canonicalReadAllowed: false,
  canonicalWriteAllowed: false,
  executeReadOnlyComparison: true,
  migrationAllowed: false,
  migrationId: "candidate-episode-v1",
  minimumCleanWindowHours: 24,
  minimumComparedWrites: 10_000,
  operator: "codex",
  packageId: "WP-G0.2-SHADOW-VERIFY-RECONCILIATION",
  productionRankingMutationAllowed: false,
  releaseId,
  reviewReadAllowed: false,
  schemaDdlAllowed: false,
  shadowVerifyTransitionAllowed: false,
};

test("approval authorizes only a read-only comparison and preserves the 24h/10000 gates", () => {
  assert.equal(validateApprovalRequest(request, contract, {
    now: new Date("2026-07-12T08:30:00.000Z"),
  }), request);
  for (const key of [
    "automaticPhaseAdvanceAllowed", "businessDmlAllowed", "canonicalReadAllowed",
    "canonicalWriteAllowed", "migrationAllowed", "productionRankingMutationAllowed",
    "reviewReadAllowed", "schemaDdlAllowed", "shadowVerifyTransitionAllowed",
  ]) {
    assert.throws(
      () => validateApprovalRequest({ ...request, [key]: true }, contract, {
        now: new Date("2026-07-12T08:30:00.000Z"),
      }),
      new RegExp(`${key}_must_be_false`),
    );
  }
  assert.throws(
    () => validateApprovalRequest({ ...request, minimumComparedWrites: 9_999 }, contract, {
      now: new Date("2026-07-12T08:30:00.000Z"),
    }),
    /compared_writes_threshold_changed/,
  );
});

test("one compared write requires exact immutable source, projection command and target identity", () => {
  const row = fixtureRow();
  assert.deepEqual(compareProjectionRow(row, context).differences, []);
  assert.match(compareProjectionRow(row, context).digest, /^[0-9a-f]{64}$/);

  const payloadDrift = structuredClone(row);
  payloadDrift.source_payload.priorityTier = "A";
  assert.ok(compareProjectionRow(payloadDrift, context).differences.includes("source_payload_hash_mismatch"));

  const commandDrift = structuredClone(row);
  commandDrift.event_command_hash = `sha256:${"0".repeat(64)}`;
  assert.ok(compareProjectionRow(commandDrift, context).differences.includes("projection_command_hash_mismatch"));

  const missingEvent = structuredClone(row);
  missingEvent.event_id = null;
  missingEvent.event_stream_version = null;
  missingEvent.episode_first_seen_at = null;
  assert.ok(compareProjectionRow(missingEvent, context).differences.includes("projection_event_missing"));
  assert.ok(compareProjectionRow(missingEvent, context).differences.includes("event_stream_version_invalid"));
});

test("PASS requires 10000 exact writes and produces order-independent immutable evidence", () => {
  const rows = Array.from({ length: MINIMUM_COMPARED_WRITES }, (_, index) => fixtureRow(index + 1));
  const first = evaluateReconciliationEvidence({ context, control, observation, rows, statusCounts });
  const reversed = evaluateReconciliationEvidence({
    context,
    control,
    observation,
    rows: [...rows].reverse(),
    statusCounts,
  });
  assert.equal(first.status, "PASS_RECONCILIATION_ELIGIBLE_FOR_SEPARATE_SHADOW_VERIFY_APPROVAL");
  assert.equal(first.comparedWrites, 10_000);
  assert.equal(first.comparisonDifferences, 0);
  assert.equal(first.automaticPhaseAdvance, false);
  assert.equal(first.phaseTransitionExecuted, false);
  assert.equal(first.productionRankingInputsUsed, false);
  assert.equal(first.futureOutcomeInputsUsed, false);
  assert.equal(first.evidenceHash, reversed.evidenceHash);
});

test("9999 writes, unresolved delivery state, observation drift or any row difference fail closed", () => {
  const rows = Array.from({ length: MINIMUM_COMPARED_WRITES }, (_, index) => fixtureRow(index + 1));
  const below = evaluateReconciliationEvidence({
    context,
    control,
    observation,
    rows: rows.slice(1),
    statusCounts: { ...statusCounts, completed: 9_999 },
  });
  assert.ok(below.violations.includes("compared_writes_below_10000"));

  const unresolved = evaluateReconciliationEvidence({
    context,
    control,
    observation,
    rows,
    statusCounts: { ...statusCounts, retryWait: 1, unresolvedTotal: 1 },
  });
  assert.ok(unresolved.violations.includes("retry_wait_outbox_present"));
  assert.ok(unresolved.violations.includes("unresolved_outbox_present"));

  const staleObservation = evaluateReconciliationEvidence({
    context,
    control,
    observation: { ...observation, coverageHours: 23.99 },
    rows,
    statusCounts,
  });
  assert.ok(staleObservation.violations.includes("observation_window_too_short"));

  const driftedRows = [...rows];
  driftedRows[500] = { ...driftedRows[500], event_release_id: "candidate-shadow-other-release" };
  const drift = evaluateReconciliationEvidence({
    context,
    control,
    observation,
    rows: driftedRows,
    statusCounts,
  });
  assert.equal(drift.comparisonDifferences, 1);
  assert.ok(drift.violations.includes("comparison_differences_present"));
});

test("future outcome or ranking fields cannot enter the exact source payload", () => {
  const row = fixtureRow();
  row.source_payload.futureMfe = 200;
  const result = compareProjectionRow(row, context);
  assert.ok(result.differences.includes("source_payload_keys_mismatch"));
  assert.ok(result.differences.includes("source_payload_hash_mismatch"));
});
