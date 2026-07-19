import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIMUM_COMPARED_WRITES,
  PACKAGE_ID,
  RECONCILIATION_PASS,
  compareProjectionRow,
  evaluateReconciliationEvidence,
  hashPayload,
  hashProjectionCommand,
  loadPgRuntime,
  validateApprovalRequest,
  validateLineageRequestBinding,
} from "./runner.mjs";
import {
  LINEAGE_PASS,
  LINEAGE_SCHEMA,
} from "../candidate-lineage/runner.mjs";

test("production runner resolves pg from the approved application runtime", () => {
  const runtime = { marker: "approved-pg" };
  const loaded = loadPgRuntime({
    applicationRoot: "/approved/app",
    moduleUrl: "file:///isolated/packet/runner.mjs",
    requireFactory: (source) => (specifier) => {
      if (specifier === "pg" && source === "/approved/app/package.json") return runtime;
      const error = new Error("missing");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    },
  });
  assert.equal(loaded, runtime);
});

const releaseIds = [
  "candidate-shadow-release-cycle-1",
  "candidate-shadow-release-cycle-2",
  "candidate-shadow-release-cycle-3",
  "candidate-shadow-release-cycle-4",
  "candidate-shadow-release-cycle-5",
  "candidate-shadow-release-cycle-6",
  "candidate-shadow-release-cycle-7",
];
const sourceReleaseWindows = [
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-09T00:00:00.000Z",
    migrationId: "candidate-episode-v1",
    phase: "legacy",
    releaseId: releaseIds[0],
    startedAt: "2026-07-06T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-12T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-2",
    phase: "legacy",
    releaseId: releaseIds[1],
    startedAt: "2026-07-09T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-15T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-3",
    phase: "legacy",
    releaseId: releaseIds[2],
    startedAt: "2026-07-12T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-18T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-4",
    phase: "legacy",
    releaseId: releaseIds[3],
    startedAt: "2026-07-15T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-21T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-5",
    phase: "legacy",
    releaseId: releaseIds[4],
    startedAt: "2026-07-18T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 2,
    deadlineAt: "2026-07-24T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-6",
    phase: "legacy",
    releaseId: releaseIds[5],
    startedAt: "2026-07-21T00:00:00.000Z",
    writeFrozen: true,
  },
  {
    controlEpoch: 1,
    deadlineAt: "2026-07-27T00:00:00.000Z",
    migrationId: "candidate-episode-v1-cycle-7",
    phase: "shadow_capture",
    releaseId: releaseIds[6],
    startedAt: "2026-07-24T00:00:00.000Z",
    writeFrozen: false,
  },
];
const lineage = {
  activationCoverageSeconds: 86_400,
  activationSamples: 289,
  canonicalAuthorityChanged: false,
  completedWrites: 10_020,
  completionAdvances: 8,
  controlSnapshotSha256: "c".repeat(64),
  currentAuthorityEpoch: 1,
  currentMigrationId: "candidate-episode-v1-cycle-7",
  currentReleaseId: releaseIds[6],
  currentCycleStartedAt: sourceReleaseWindows[6].startedAt,
  g0Completed: false,
  maximumSampleGapSeconds: 600,
  minimumActivationHours: 24,
  minimumActivationSamples: 289,
  minimumComparedWrites: MINIMUM_COMPARED_WRITES,
  minimumCompletionAdvances: 2,
  minimumSamples: 7,
  minimumStabilitySeconds: 1_800,
  observationElapsedSeconds: 86_400,
  productionReconciliationExecuted: false,
  schemaVersion: LINEAGE_SCHEMA,
  shadowVerifyStarted: false,
  sourceReleaseCount: 7,
  sourceReleaseWindows,
  status: LINEAGE_PASS,
  thresholdsChanged: false,
  unifiedEvidenceSha256: "a".repeat(64),
  unifiedSamplesSha256: "b".repeat(64),
  unresolvedMaximum: 0,
  unresolvedOutbox: 0,
  validationCycle: 7,
};
const context = {
  authorityEpoch: 1,
  controlStartedAt: Date.parse(sourceReleaseWindows[6].startedAt),
  controlDeadlineAt: Date.parse(sourceReleaseWindows[6].deadlineAt),
  lineageEvidenceSha256: `sha256:${"d".repeat(64)}`,
  migrationId: sourceReleaseWindows[6].migrationId,
  releaseId: releaseIds[6],
  sourceReleaseWindows: sourceReleaseWindows.map((window) => ({
    ...window,
    startedAtMs: Date.parse(window.startedAt),
    deadlineAtMs: Date.parse(window.deadlineAt),
  })),
};
const control = {
  phase: "shadow_capture",
  authorityEpoch: 1,
  writeFrozen: false,
  releaseId: releaseIds[6],
  migrationId: sourceReleaseWindows[6].migrationId,
  currentRole: "candidate_audit_role",
  transactionReadOnly: true,
  transactionIsolation: "repeatable read",
};
const statusCounts = {
  pending: 0,
  claimed: 0,
  retryWait: 0,
  completed: 10_020,
  resolvedQuarantine: 0,
  unresolvedQuarantine: 0,
  unresolvedTotal: 0,
  outsideLineage: 0,
};
const contract = { runnerArtifact: { sha256: "e".repeat(64) } };
const request = {
  approvalExpiresAt: "2026-07-18T09:00:00.000Z",
  approvalIssuedAt: "2026-07-18T08:00:00.000Z",
  approvalRef: "candidate-reconciliation-cycle7-approval",
  approvedCommit: "1".repeat(40),
  approvedRunnerArtifactSha256: "e".repeat(64),
  authorityEpoch: 1,
  automaticPhaseAdvanceAllowed: false,
  businessDmlAllowed: false,
  canonicalReadAllowed: false,
  canonicalWriteAllowed: false,
  executeReadOnlyComparison: true,
  lineageEvidenceSha256: context.lineageEvidenceSha256,
  lineageSchemaVersion: LINEAGE_SCHEMA,
  lineageStatus: LINEAGE_PASS,
  migrationAllowed: false,
  migrationId: sourceReleaseWindows[6].migrationId,
  minimumComparedWrites: MINIMUM_COMPARED_WRITES,
  operator: "codex",
  packageId: PACKAGE_ID,
  productionRankingMutationAllowed: false,
  releaseId: releaseIds[6],
  reviewReadAllowed: false,
  schemaDdlAllowed: false,
  shadowVerifyTransitionAllowed: false,
  sourceReleaseWindows,
};

function uuid(index, family) {
  return `${family.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function fixtureRow(index, releaseIndex, baseTime) {
  const releaseId = releaseIds[releaseIndex];
  const outboxId = uuid(index, 1);
  const eventId = uuid(index, 2);
  const episodeId = uuid(index, 3);
  const instant = new Date(Date.parse(baseTime) + index).toISOString();
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
    event_runtime_id: `candidate-shadow:${releaseId}:worker-1`,
    event_idempotency_key: `shadow-projection:${outboxId}`,
    event_command_hash: null,
    event_payload_version: "candidate-event.v1",
    event_payload: { canonicalInstrumentId: instrument, eventType: "DISCOVERED" },
    episode_id: episodeId,
    episode_canonical_instrument_id: instrument,
    episode_first_seen_at: instant,
    episode_last_seen_at: instant,
  };
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

const releaseCounts = [1_670, 0, 1_670, 0, 1_670, 0, 5_010];
let rowOffset = 0;
const rows = sourceReleaseWindows.flatMap((window, releaseIndex) => {
  const count = releaseCounts[releaseIndex];
  const firstIndex = rowOffset + 1;
  rowOffset += count;
  return Array.from({ length: count }, (_, index) => fixtureRow(
    firstIndex + index,
    releaseIndex,
    new Date(Date.parse(window.startedAt) + 3_600_000).toISOString(),
  ));
});

test("approval authorizes only current-cycle read-only comparison with exact Lineage v3", () => {
  assert.equal(validateApprovalRequest(request, contract, {
    now: new Date("2026-07-18T08:30:00.000Z"),
  }), request);
  for (const key of [
    "automaticPhaseAdvanceAllowed", "businessDmlAllowed", "canonicalReadAllowed",
    "canonicalWriteAllowed", "migrationAllowed", "productionRankingMutationAllowed",
    "reviewReadAllowed", "schemaDdlAllowed", "shadowVerifyTransitionAllowed",
  ]) {
    assert.throws(() => validateApprovalRequest({ ...request, [key]: true }, contract, {
      now: new Date("2026-07-18T08:30:00.000Z"),
    }), new RegExp(`${key}_must_be_false`));
  }
  assert.throws(() => validateApprovalRequest({ ...request, minimumComparedWrites: 9_999 }, contract, {
    now: new Date("2026-07-18T08:30:00.000Z"),
  }), /compared_writes_threshold_changed/);
  assert.throws(() => validateApprovalRequest({ ...request, lineageStatus: "PASS_ACTIVATE_AND_OBSERVE" }, contract, {
    now: new Date("2026-07-18T08:30:00.000Z"),
  }), /lineage_status_not_pass/);
});

test("Lineage file must match request windows and current-cycle identity exactly", () => {
  assert.equal(validateLineageRequestBinding(lineage, request), lineage);
  assert.throws(() => validateLineageRequestBinding({
    ...lineage,
    currentAuthorityEpoch: 3,
  }, request), /lineage_current_identity_mismatch/);
  assert.throws(() => validateLineageRequestBinding(lineage, {
    ...request,
    sourceReleaseWindows: request.sourceReleaseWindows.map((window, index) => (
      index === 0 ? { ...window, controlEpoch: 8 } : window
    )),
  }), /lineage_request_windows_mismatch/);
});

test("each row is compared inside its immutable release window", () => {
  assert.deepEqual(compareProjectionRow(rows[0], context).differences, []);
  assert.deepEqual(compareProjectionRow(rows.at(-1), context).differences, []);
  const outside = structuredClone(rows[0]);
  outside.source_created_at = "2026-07-18T01:00:00.000Z";
  assert.ok(compareProjectionRow(outside, context).differences.includes(
    "source_created_outside_release_window"));
});

test("one write requires immutable source, projection command and target identity", () => {
  const row = rows[0];
  assert.match(compareProjectionRow(row, context).digest, /^[0-9a-f]{64}$/u);
  const payloadDrift = structuredClone(row);
  payloadDrift.source_payload.priorityTier = "A";
  assert.ok(compareProjectionRow(payloadDrift, context).differences.includes(
    "source_payload_hash_mismatch"));
  const commandDrift = structuredClone(row);
  commandDrift.event_command_hash = `sha256:${"0".repeat(64)}`;
  assert.ok(compareProjectionRow(commandDrift, context).differences.includes(
    "projection_command_hash_mismatch"));
  const missingEvent = structuredClone(row);
  missingEvent.event_id = null;
  missingEvent.event_stream_version = null;
  missingEvent.episode_first_seen_at = null;
  assert.ok(compareProjectionRow(missingEvent, context).differences.includes("projection_event_missing"));
});

test("PASS requires 10020 exact writes across all seven cycles and is order independent", () => {
  const first = evaluateReconciliationEvidence({ context, control, lineage, rows, statusCounts });
  const reversed = evaluateReconciliationEvidence({
    context,
    control,
    lineage,
    rows: [...rows].reverse(),
    statusCounts,
  });
  assert.equal(first.status, RECONCILIATION_PASS);
  assert.equal(first.comparedWrites, 10_020);
  assert.equal(first.sourceReleaseCount, 7);
  assert.equal(first.verificationMigrationId, "candidate-episode-v1-cycle-7");
  assert.equal(first.comparisonDifferences, 0);
  assert.equal(first.phaseTransitionExecuted, false);
  assert.equal(first.shadowVerifyTransitionExecuted, false);
  assert.equal(first.canonicalReadEnabled, false);
  assert.equal(first.canonicalWriteEnabled, false);
  assert.equal(first.reviewReadEnabled, false);
  assert.equal(first.g0Completed, false);
  assert.equal(first.productionRankingInputsUsed, false);
  assert.equal(first.futureOutcomeInputsUsed, false);
  assert.deepEqual(first.databaseIdentity, {
    currentRole: "candidate_audit_role",
    transactionReadOnly: true,
    transactionIsolation: "repeatable read",
  });
  assert.equal(first.lineageIdentityBinding, "file_hash_request_database_exact_match");
  assert.equal(first.evidenceHash, reversed.evidenceHash);
});

test("PASS requires read-only repeatable-read audit role", () => {
  for (const [field, value, violation] of [
    ["currentRole", "postgres", "database_audit_role_not_active"],
    ["transactionReadOnly", false, "database_transaction_not_read_only"],
    ["transactionIsolation", "read committed", "database_transaction_isolation_invalid"],
  ]) {
    const result = evaluateReconciliationEvidence({
      context,
      control: { ...control, [field]: value },
      lineage,
      rows,
      statusCounts,
    });
    assert.ok(result.violations.includes(violation));
  }
});

test("9999 writes, unresolved state, lineage count drift or row drift fail closed", () => {
  const below = evaluateReconciliationEvidence({
    context,
    control,
    lineage: { ...lineage, completedWrites: 10_000 },
    rows: rows.slice(0, 9_999),
    statusCounts: { ...statusCounts, completed: 9_999 },
  });
  assert.ok(below.violations.includes("compared_writes_below_10000"));

  const unresolved = evaluateReconciliationEvidence({
    context,
    control,
    lineage,
    rows,
    statusCounts: { ...statusCounts, retryWait: 1, unresolvedTotal: 1 },
  });
  assert.ok(unresolved.violations.includes("retry_wait_outbox_present"));
  assert.ok(unresolved.violations.includes("unresolved_outbox_present"));

  const countDrift = evaluateReconciliationEvidence({
    context,
    control,
    lineage: { ...lineage, completedWrites: 10_021 },
    rows,
    statusCounts,
  });
  assert.ok(countDrift.violations.includes("lineage_completed_count_mismatch"));

  const driftedRows = [...rows];
  driftedRows[500] = { ...driftedRows[500], event_release_id: releaseIds[1] };
  const drift = evaluateReconciliationEvidence({
    context,
    control,
    lineage,
    rows: driftedRows,
    statusCounts,
  });
  assert.equal(drift.comparisonDifferences, 1);
  assert.ok(drift.violations.includes("comparison_differences_present"));
});

test("future outcome or ranking fields cannot enter the source payload", () => {
  const row = structuredClone(rows[0]);
  row.source_payload.futureMfe = 200;
  const result = compareProjectionRow(row, context);
  assert.ok(result.differences.includes("source_payload_keys_mismatch"));
  assert.ok(result.differences.includes("source_payload_hash_mismatch"));
});
