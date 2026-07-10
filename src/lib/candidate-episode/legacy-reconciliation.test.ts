import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLegacyRow,
  dryRunLegacyBackfill,
  inventoryLegacyRows,
  reconcileLegacyBackfill,
  toApprovedLegacyImportClassification,
  type LegacySyntheticRow,
} from "./legacy-reconciliation";

function deterministicRow(overrides: Partial<LegacySyntheticRow> = {}): LegacySyntheticRow {
  return {
    sourceSystem: "immutable_scan_archive",
    sourceSnapshotId: "synthetic-snapshot-001",
    sourceRef: "archive/row-001",
    sourceVersion: "v1",
    facts: {
      scope: "production_radar",
      episodeId: "018f0000-0000-7000-8000-000000000001",
      canonicalInstrumentId: "binance-futures:BTCUSDT",
      direction: "long",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      observationPrice: 60_000,
      observationPriceFactId: "price-fact-001",
      releaseId: "release-synthetic-001",
      status: "discovered",
    },
    ...overrides,
  };
}

const fixture: LegacySyntheticRow[] = [
  deterministicRow(),
  deterministicRow({
    sourceSystem: "journal_events",
    sourceRef: "journal/row-002",
    facts: {
      scope: "production_radar",
      episodeId: "018f0000-0000-7000-8000-000000000002",
      canonicalInstrumentId: "binance-futures:ETHUSDT",
      direction: null,
      firstSeenAt: null,
      observationPrice: null,
      observationPriceFactId: null,
      releaseId: null,
      status: null,
    },
  }),
  deterministicRow({
    sourceSystem: "unknown_legacy_feed",
    sourceRef: "unknown/row-003",
  }),
  deterministicRow({
    sourceSystem: "scan_asset_states",
    sourceRef: "scan-state/row-004",
  }),
];

test("classifies all frozen legacy classes and maps them to the approved DB enum", () => {
  const classes = fixture.map((row) => classifyLegacyRow(row).classification);

  assert.deepEqual(classes, [
    "deterministic_importable",
    "partially_classifiable",
    "legacy_unclassified",
    "excluded",
  ]);
  assert.deepEqual(classes.map(toApprovedLegacyImportClassification), [
    "deterministic",
    "partial",
    "unclassified",
    "excluded",
  ]);
});

test("never guesses missing direction, firstSeen, price, release, or status", () => {
  const classified = classifyLegacyRow(fixture[1]);

  assert.equal(classified.classification, "partially_classifiable");
  assert.equal(classified.targetRow, null);
  assert.deepEqual(classified.reasons, [
    "source_semantics_partial",
    "missing_direction",
    "missing_first_seen_at",
    "missing_observation_price",
    "missing_observation_price_fact_id",
    "missing_release_id",
    "missing_status",
  ]);
});

test("quarantines rows that lack a stable snapshot-backed source identity", () => {
  const missingSnapshot = classifyLegacyRow(
    deterministicRow({ sourceSnapshotId: "" }),
  );
  const missingReference = classifyLegacyRow(deterministicRow({ sourceRef: "" }));

  assert.equal(missingSnapshot.classification, "partially_classifiable");
  assert.equal(missingSnapshot.targetRow, null);
  assert.deepEqual(missingSnapshot.reasons, ["missing_source_snapshot_id"]);
  assert.equal(missingReference.classification, "partially_classifiable");
  assert.equal(missingReference.targetRow, null);
  assert.deepEqual(missingReference.reasons, ["missing_source_ref"]);
});

test("builds stable row, source, and target hashes independent of object and input order", () => {
  const reorderedFacts = {
    status: "discovered" as const,
    releaseId: "release-synthetic-001",
    observationPriceFactId: "price-fact-001",
    observationPrice: 60_000,
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    direction: "long" as const,
    canonicalInstrumentId: "binance-futures:BTCUSDT",
    episodeId: "018f0000-0000-7000-8000-000000000001",
    scope: "production_radar",
  };
  const equivalent = deterministicRow({ facts: reorderedFacts });
  const first = inventoryLegacyRows(fixture);
  const second = inventoryLegacyRows([fixture[3], fixture[2], fixture[1], equivalent]);

  assert.equal(classifyLegacyRow(fixture[0]).sourceRowHash, classifyLegacyRow(equivalent).sourceRowHash);
  assert.equal(classifyLegacyRow(fixture[0]).targetRowHash, classifyLegacyRow(equivalent).targetRowHash);
  assert.equal(first.sourceHash, second.sourceHash);
  assert.deepEqual(
    first.rows.map((row) => row.sourceIdentity),
    second.rows.map((row) => row.sourceIdentity),
  );
});

test("dry-run preserves count identity and excludes non-deterministic rows from targets and metrics", () => {
  const inventory = inventoryLegacyRows(fixture);
  const dryRun = dryRunLegacyBackfill(inventory);
  const reconciliation = reconcileLegacyBackfill(inventory, dryRun.state);

  assert.deepEqual(reconciliation.counts, {
    sourceRows: 4,
    deterministic: 1,
    partial: 1,
    unclassified: 1,
    excluded: 1,
    deterministicNotPromoted: 1,
    targetPromotions: 0,
    authoritativeImports: 0,
    metricEligibleLegacyRows: 0,
  });
  assert.equal(reconciliation.countIdentity, true);
  assert.equal(reconciliation.conflictingTargetRows, 0);
  assert.equal(reconciliation.pass, true);
  assert.equal(dryRun.state.plannedTargets.length, 1);
  assert.equal(dryRun.state.authoritativeImports, 0);
});

test("resumes in stable batches and replays idempotently with zero conflicts", () => {
  const duplicateTargetFixture = [
    ...fixture,
    deterministicRow({ sourceRef: "archive/row-005" }),
  ];
  const inventory = inventoryLegacyRows(duplicateTargetFixture);
  const firstBatch = dryRunLegacyBackfill(inventory, { batchSize: 2 });
  const finalBatch = dryRunLegacyBackfill(inventory, {
    batchSize: 20,
    resumeState: firstBatch.state,
  });
  const replay = dryRunLegacyBackfill(inventory, {
    batchSize: 20,
    resumeState: { ...finalBatch.state, cursor: 0 },
  });
  const reconciliation = reconcileLegacyBackfill(inventory, replay.state);

  assert.equal(firstBatch.complete, false);
  assert.equal(finalBatch.complete, true);
  assert.equal(replay.idempotentSourceMatches, duplicateTargetFixture.length);
  assert.equal(replay.state.plannedTargets.length, 1);
  assert.equal(replay.plannedTargetMatches, 2);
  assert.equal(reconciliation.conflictingTargetRows, 0);
  assert.equal(reconciliation.pass, true);
  assert.equal(reconciliation.targetHash, reconcileLegacyBackfill(inventory, finalBatch.state).targetHash);
});

test("refuses resume when source, policy, or schema identity drifts", () => {
  const inventory = inventoryLegacyRows(fixture);
  const firstBatch = dryRunLegacyBackfill(inventory, { batchSize: 1 });

  assert.throws(
    () =>
      dryRunLegacyBackfill(inventoryLegacyRows([...fixture, deterministicRow({ sourceRef: "new-row" })]), {
        resumeState: firstBatch.state,
      }),
    /resume_source_hash_mismatch/,
  );
  assert.throws(
    () =>
      dryRunLegacyBackfill(inventory, {
        resumeState: { ...firstBatch.state, policyVersion: "changed-policy" },
      }),
    /resume_policy_version_mismatch/,
  );
  assert.throws(
    () =>
      dryRunLegacyBackfill(inventory, {
        resumeState: { ...firstBatch.state, targetSchemaVersion: "changed-schema" },
      }),
    /resume_target_schema_version_mismatch/,
  );
});
