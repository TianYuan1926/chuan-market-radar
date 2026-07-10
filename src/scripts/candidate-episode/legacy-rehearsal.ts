import rawFixture from "../../lib/candidate-episode/fixtures/legacy-synthetic.v1.json";
import {
  LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION,
  canonicalSha256,
  dryRunLegacyBackfill,
  inventoryLegacyRows,
  reconcileLegacyBackfill,
  type ClassifiedLegacyRow,
  type LegacySyntheticFacts,
  type LegacySyntheticRow,
} from "../../lib/candidate-episode/legacy-reconciliation";

const OUTPUT_SCHEMA_VERSION = "wp-g0.2-legacy-rehearsal-output.v1" as const;
const FIXTURE_SCHEMA_VERSION = "legacy-synthetic-fixture.v1" as const;
const MODES = ["inventory", "classify", "backfill-dry-run", "reconcile"] as const;

export type LegacyRehearsalMode = (typeof MODES)[number];

interface SyntheticFixtureRow extends LegacySyntheticRow {
  syntheticOnly: true;
}

interface SyntheticFixture {
  fixtureId: string;
  schemaVersion: typeof FIXTURE_SCHEMA_VERSION;
  provenance: {
    syntheticOnly: true;
    containsProductionData: false;
    authoritativeImportedCount: 0;
    externalReadsAllowed: [];
  };
  rows: SyntheticFixtureRow[];
}

interface DistributionEntry {
  value: string;
  count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, error: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(error);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(error);
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function validateSyntheticFacts(value: unknown): asserts value is LegacySyntheticFacts {
  assertRecord(value, "fixture_facts_invalid");
  assertExactKeys(
    value,
    [
      "scope",
      "episodeId",
      "canonicalInstrumentId",
      "direction",
      "firstSeenAt",
      "observationPrice",
      "observationPriceFactId",
      "releaseId",
      "status",
    ],
    "fixture_facts_keys_invalid",
  );

  const episodeId = value.episodeId;
  const canonicalInstrumentId = value.canonicalInstrumentId;
  const direction = value.direction;
  const firstSeenAt = value.firstSeenAt;
  const observationPriceFactId = value.observationPriceFactId;
  const releaseId = value.releaseId;
  const status = value.status;
  if (
    value.scope !== "production_radar" ||
    !isNullableString(episodeId) ||
    !isNullableString(canonicalInstrumentId) ||
    !isNullableString(direction) ||
    !isNullableString(firstSeenAt) ||
    !isNullableString(observationPriceFactId) ||
    !isNullableString(releaseId) ||
    !isNullableString(status) ||
    (value.observationPrice !== null && typeof value.observationPrice !== "number")
  ) {
    throw new Error("fixture_facts_types_invalid");
  }

  if (
    (episodeId !== null && !episodeId.startsWith("synthetic-episode-")) ||
    (canonicalInstrumentId !== null && !canonicalInstrumentId.startsWith("synthetic:")) ||
    (observationPriceFactId !== null &&
      !observationPriceFactId.startsWith("synthetic-price-fact-")) ||
    (releaseId !== null && !releaseId.startsWith("synthetic-release-")) ||
    (firstSeenAt !== null && !firstSeenAt.startsWith("2000-"))
  ) {
    throw new Error("fixture_row_identity_not_synthetic");
  }
}

export function validateSyntheticFixture(value: unknown): SyntheticFixture {
  assertRecord(value, "fixture_invalid");
  assertExactKeys(
    value,
    ["fixtureId", "schemaVersion", "provenance", "rows"],
    "fixture_keys_invalid",
  );
  if (value.schemaVersion !== FIXTURE_SCHEMA_VERSION || typeof value.fixtureId !== "string") {
    throw new Error("fixture_identity_invalid");
  }

  assertRecord(value.provenance, "fixture_provenance_invalid");
  assertExactKeys(
    value.provenance,
    [
      "syntheticOnly",
      "containsProductionData",
      "authoritativeImportedCount",
      "externalReadsAllowed",
    ],
    "fixture_provenance_keys_invalid",
  );
  if (value.provenance.syntheticOnly !== true) throw new Error("fixture_not_synthetic_only");
  if (value.provenance.containsProductionData !== false) {
    throw new Error("fixture_contains_production_data");
  }
  if (value.provenance.authoritativeImportedCount !== 0) {
    throw new Error("fixture_authoritative_imports_forbidden");
  }
  if (
    !Array.isArray(value.provenance.externalReadsAllowed) ||
    value.provenance.externalReadsAllowed.length !== 0
  ) {
    throw new Error("fixture_external_reads_forbidden");
  }
  if (!Array.isArray(value.rows) || value.rows.length === 0) {
    throw new Error("fixture_rows_invalid");
  }

  for (const row of value.rows) {
    assertRecord(row, "fixture_row_invalid");
    assertExactKeys(
      row,
      [
        "syntheticOnly",
        "sourceSystem",
        "sourceSnapshotId",
        "sourceRef",
        "sourceVersion",
        "facts",
      ],
      "fixture_row_keys_invalid",
    );
    if (
      row.syntheticOnly !== true ||
      typeof row.sourceSystem !== "string" ||
      typeof row.sourceSnapshotId !== "string" ||
      typeof row.sourceRef !== "string" ||
      typeof row.sourceVersion !== "string"
    ) {
      throw new Error("fixture_row_types_invalid");
    }
    if (
      !row.sourceSnapshotId.startsWith("synthetic-snapshot-") ||
      !row.sourceRef.startsWith("synthetic/")
    ) {
      throw new Error("fixture_row_identity_not_synthetic");
    }
    validateSyntheticFacts(row.facts);
  }

  return value as unknown as SyntheticFixture;
}

function distribution(values: readonly string[]): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ value, count }));
}

function sortedDistribution(entries: readonly DistributionEntry[]): DistributionEntry[] {
  return [...entries].sort((left, right) => left.value.localeCompare(right.value));
}

function inventoryDetails(rows: readonly ClassifiedLegacyRow[]) {
  return {
    kind: "inventory" as const,
    rows: rows.map((row) => ({
      sourceIdentity: row.sourceIdentity,
      sourceRowHash: row.sourceRowHash,
    })),
  };
}

function classifyDetails(rows: readonly ClassifiedLegacyRow[]) {
  return {
    kind: "classify" as const,
    rows: rows.map((row) => ({
      classification: row.classification,
      databaseClassification: row.databaseClassification,
      metricEligible: row.metricEligible,
      reasons: row.reasons,
      sourceIdentity: row.sourceIdentity,
      sourceRowHash: row.sourceRowHash,
      targetIdentity: row.targetIdentity,
      targetRowHash: row.targetRowHash,
    })),
  };
}

function detailsForMode(
  mode: LegacyRehearsalMode,
  inventory: ReturnType<typeof inventoryLegacyRows>,
  dryRun: ReturnType<typeof dryRunLegacyBackfill>,
  reconciliation: ReturnType<typeof reconcileLegacyBackfill>,
) {
  switch (mode) {
    case "inventory":
      return inventoryDetails(inventory.rows);
    case "classify":
      return classifyDetails(inventory.rows);
    case "backfill-dry-run":
      return {
        kind: "backfill-dry-run" as const,
        complete: dryRun.complete,
        processedInBatch: dryRun.processedInBatch,
        plannedTargets: dryRun.state.plannedTargets,
        targetConflicts: dryRun.state.targetConflicts,
      };
    case "reconcile":
      return {
        kind: "reconcile" as const,
        countIdentity: reconciliation.countIdentity,
        deterministicIdentity: reconciliation.deterministicIdentity,
        pass: reconciliation.pass,
      };
  }
}

export function runLegacyRehearsal(
  mode: LegacyRehearsalMode,
  fixtureValue: unknown = rawFixture,
) {
  const fixture = validateSyntheticFixture(fixtureValue);
  const inventory = inventoryLegacyRows(fixture.rows);
  const dryRun = dryRunLegacyBackfill(inventory);
  const reconciliation = reconcileLegacyBackfill(inventory, dryRun.state);

  if (
    fixture.provenance.authoritativeImportedCount !== 0 ||
    dryRun.state.authoritativeImports !== 0 ||
    reconciliation.counts.authoritativeImports !== 0 ||
    reconciliation.counts.targetPromotions !== 0
  ) {
    throw new Error("authoritative_imports_must_remain_zero");
  }

  const targetRows = inventory.rows.filter((row) => row.targetIdentity !== null);
  const nonTargetRows = inventory.rows.length - targetRows.length;

  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    mode,
    ok: reconciliation.pass,
    safety: {
      syntheticOnly: true,
      containsProductionData: false,
      externalReads: [] as never[],
      authoritativeImportedCount: 0 as const,
    },
    fixture: {
      fixtureId: fixture.fixtureId,
      schemaVersion: fixture.schemaVersion,
      rowCount: fixture.rows.length,
    },
    distributions: {
      source: distribution(fixture.rows.map((row) => row.sourceSystem)),
      classification: distribution(inventory.rows.map((row) => row.classification)),
      target: sortedDistribution([
        { value: "authoritative_import", count: 0 },
        { value: "not_planned", count: nonTargetRows },
        { value: "planned_dry_run_only", count: targetRows.length },
      ]),
      hash: sortedDistribution([
        {
          value: "source_identity_unique",
          count: new Set(inventory.rows.map((row) => row.sourceIdentity)).size,
        },
        {
          value: "source_row_hash_unique",
          count: new Set(inventory.rows.map((row) => row.sourceRowHash)).size,
        },
        {
          value: "target_identity_unique",
          count: new Set(
            targetRows.map((row) => row.targetIdentity).filter((value): value is string => value !== null),
          ).size,
        },
        {
          value: "target_row_hash_unique",
          count: new Set(
            targetRows.map((row) => row.targetRowHash).filter((value): value is string => value !== null),
          ).size,
        },
      ]),
      reason: distribution(inventory.rows.flatMap((row) => row.reasons)),
    },
    hashes: {
      fixture: canonicalSha256(fixture),
      source: reconciliation.sourceHash,
      target: reconciliation.targetHash,
    },
    reconciliation,
    details: detailsForMode(mode, inventory, dryRun, reconciliation),
    target: {
      schemaVersion: LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION,
      plannedDryRunOnly: dryRun.state.plannedTargets.length,
      targetConflicts: dryRun.state.targetConflicts.length,
      authoritativeImportedCount: 0 as const,
    },
  };
}

function parseMode(args: readonly string[]): LegacyRehearsalMode {
  if (args.length !== 1) throw new Error("cli_requires_exactly_one_mode");
  const mode = args[0];
  if (!MODES.includes(mode as LegacyRehearsalMode)) throw new Error(`unsupported_mode:${mode}`);
  return mode as LegacyRehearsalMode;
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortForJson(value[key])]),
  );
}

export function deterministicJson(value: unknown): string {
  return JSON.stringify(sortForJson(value), null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_cli_error";
}

export function main(args: readonly string[]): void {
  try {
    const output = runLegacyRehearsal(parseMode(args));
    process.stdout.write(`${deterministicJson(output)}\n`);
  } catch (error) {
    process.stderr.write(
      `${deterministicJson({
        ok: false,
        error: errorMessage(error),
        allowedModes: MODES,
      })}\n`,
    );
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1]?.replaceAll("\\", "/") ?? "";
if (entryPath.endsWith("/legacy-rehearsal.js") || entryPath.endsWith("/legacy-rehearsal.ts")) {
  main(process.argv.slice(2));
}
