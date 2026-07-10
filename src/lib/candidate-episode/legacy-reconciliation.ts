import { createHash } from "node:crypto";

export const LEGACY_RECONCILIATION_MODE = "synthetic_dry_run" as const;
export const LEGACY_RECONCILIATION_POLICY_VERSION = "wp-g0.2-legacy-classification.v1" as const;
export const LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION = "candidate-episode.v1" as const;
export const LEGACY_TARGET_SCHEMA_VERSION = LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION;

export type LegacyClassification =
  | "deterministic_importable"
  | "partially_classifiable"
  | "legacy_unclassified"
  | "excluded";

export type ApprovedLegacyImportClassification =
  | "deterministic"
  | "partial"
  | "unclassified"
  | "excluded";

export interface LegacySyntheticFacts {
  scope?: string | null;
  episodeId?: string | null;
  canonicalInstrumentId?: string | null;
  direction?: string | null;
  firstSeenAt?: string | null;
  observationPrice?: number | null;
  observationPriceFactId?: string | null;
  releaseId?: string | null;
  status?: string | null;
}

export interface LegacySyntheticRow {
  sourceSystem: string;
  sourceSnapshotId: string;
  sourceRef: string;
  sourceVersion: string;
  facts: LegacySyntheticFacts;
  policyExcluded?: boolean;
  excludedByPolicy?: boolean;
  hasConflictingFields?: boolean;
  hasFutureLeak?: boolean;
  conflicts?: readonly string[];
}

export interface LegacyTargetRow {
  schemaVersion: typeof LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION;
  scope: string;
  episodeId: string;
  canonicalInstrumentId: string;
  direction: "unknown" | "neutral" | "long" | "short";
  firstSeenAt: string;
  observationPrice: number;
  observationPriceFactId: string;
  releaseId: string;
  status: "discovered" | "queued" | "validated" | "analyzed" | "closed";
}

export interface ClassifiedLegacyRow {
  classification: LegacyClassification;
  approvedDbClassification: ApprovedLegacyImportClassification;
  databaseClassification: ApprovedLegacyImportClassification;
  reasons: string[];
  sourceIdentity: string;
  sourceRowHash: string;
  targetIdentity: string | null;
  targetKey: string | null;
  targetRow: LegacyTargetRow | null;
  targetRowHash: string | null;
  metricEligible: false;
}

export interface LegacyInventory {
  mode: typeof LEGACY_RECONCILIATION_MODE;
  rows: ClassifiedLegacyRow[];
  sourceHash: string;
}

interface ProcessedLegacyRow {
  sourceIdentity: string;
  sourceRowHash: string;
}

interface PlannedLegacyTarget {
  targetIdentity: string;
  targetKey: string;
  targetRowHash: string;
  targetRow: LegacyTargetRow;
}

interface LegacyTargetConflict {
  targetIdentity: string;
  expectedHash: string;
  conflictingHash: string;
}

export interface LegacyDryRunState {
  mode: typeof LEGACY_RECONCILIATION_MODE;
  policyVersion: string;
  targetSchemaVersion: string;
  sourceHash: string;
  cursor: number;
  processedRows: ProcessedLegacyRow[];
  plannedTargets: PlannedLegacyTarget[];
  targetConflicts: LegacyTargetConflict[];
  conflicts: string[];
  authoritativeImports: 0;
}

export interface LegacyDryRunOptions {
  batchSize?: number;
  resumeState?: LegacyDryRunState;
}

export interface LegacyDryRunResult {
  complete: boolean;
  processedInBatch: number;
  idempotentSourceMatches: number;
  plannedTargetMatches: number;
  state: LegacyDryRunState;
}

export interface LegacyReconciliationCounts {
  sourceRows: number;
  deterministic: number;
  partial: number;
  unclassified: number;
  excluded: number;
  deterministicNotPromoted: number;
  targetPromotions: number;
  authoritativeImports: 0;
  metricEligibleLegacyRows: 0;
}

export interface LegacyReconciliationResult {
  counts: LegacyReconciliationCounts;
  countIdentity: boolean;
  deterministicIdentity: boolean;
  conflictingTargetRows: number;
  sourceHash: string;
  targetHash: string;
  pass: boolean;
}

const DETERMINISTIC_SOURCE = "immutable_scan_archive";
const PARTIAL_SOURCES = new Set(["journal_events", "shadow_events", "shadow_outcomes"]);
const EXCLUDED_SOURCES = new Set([
  "scan_asset_states",
  "review_aggregate",
  "review_aggregates",
  "review_api_aggregate",
  "api_aggregate",
  "api_aggregates",
  "latest_report",
  "historical_report",
  "historical_reports",
]);
const DIRECTIONS = new Set(["unknown", "neutral", "long", "short"]);
const STATUSES = new Set(["discovered", "queued", "validated", "analyzed", "closed"]);

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical_hash_rejects_non_finite_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("canonical_hash_rejects_unsupported_value");
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoInstant(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function sourceIdentity(row: LegacySyntheticRow): string {
  return canonicalSha256({
    sourceRef: row.sourceRef,
    sourceSnapshotId: row.sourceSnapshotId,
    sourceSystem: row.sourceSystem,
  });
}

function sourceHashInput(row: LegacySyntheticRow) {
  return {
    sourceSystem: row.sourceSystem,
    sourceSnapshotId: row.sourceSnapshotId,
    sourceRef: row.sourceRef,
    sourceVersion: row.sourceVersion,
    facts: row.facts,
    policyExcluded: row.policyExcluded ?? row.excludedByPolicy ?? false,
    hasConflictingFields: row.hasConflictingFields ?? false,
    hasFutureLeak: row.hasFutureLeak ?? false,
    conflicts: [...(row.conflicts ?? [])].sort(),
  };
}

function missingFactReasons(facts: LegacySyntheticFacts): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(facts.scope)) reasons.push("missing_scope");
  if (!nonEmpty(facts.episodeId)) reasons.push("missing_episode_id");
  if (!nonEmpty(facts.canonicalInstrumentId)) reasons.push("missing_canonical_instrument_id");
  if (!nonEmpty(facts.direction)) reasons.push("missing_direction");
  if (!nonEmpty(facts.firstSeenAt)) reasons.push("missing_first_seen_at");
  if (facts.observationPrice === null || facts.observationPrice === undefined) {
    reasons.push("missing_observation_price");
  }
  if (!nonEmpty(facts.observationPriceFactId)) reasons.push("missing_observation_price_fact_id");
  if (!nonEmpty(facts.releaseId)) reasons.push("missing_release_id");
  if (!nonEmpty(facts.status)) reasons.push("missing_status");
  return reasons;
}

function missingSourceIdentityReasons(row: LegacySyntheticRow): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(row.sourceSnapshotId)) reasons.push("missing_source_snapshot_id");
  if (!nonEmpty(row.sourceRef)) reasons.push("missing_source_ref");
  return reasons;
}

function invalidFactReasons(facts: LegacySyntheticFacts): string[] {
  const reasons: string[] = [];
  if (nonEmpty(facts.scope) && facts.scope !== "production_radar") reasons.push("invalid_scope");
  if (nonEmpty(facts.direction) && !DIRECTIONS.has(facts.direction)) reasons.push("invalid_direction");
  if (nonEmpty(facts.firstSeenAt) && !isValidIsoInstant(facts.firstSeenAt)) {
    reasons.push("invalid_first_seen_at");
  }
  if (
    facts.observationPrice !== null &&
    facts.observationPrice !== undefined &&
    (!Number.isFinite(facts.observationPrice) || facts.observationPrice <= 0)
  ) {
    reasons.push("invalid_observation_price");
  }
  if (nonEmpty(facts.status) && !STATUSES.has(facts.status)) reasons.push("invalid_status");
  return reasons;
}

function buildTargetRow(facts: LegacySyntheticFacts): LegacyTargetRow {
  return {
    schemaVersion: LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION,
    scope: facts.scope as string,
    episodeId: facts.episodeId as string,
    canonicalInstrumentId: facts.canonicalInstrumentId as string,
    direction: facts.direction as LegacyTargetRow["direction"],
    firstSeenAt: facts.firstSeenAt as string,
    observationPrice: facts.observationPrice as number,
    observationPriceFactId: facts.observationPriceFactId as string,
    releaseId: facts.releaseId as string,
    status: facts.status as LegacyTargetRow["status"],
  };
}

export function toApprovedLegacyImportClassification(
  classification: LegacyClassification,
): ApprovedLegacyImportClassification {
  switch (classification) {
    case "deterministic_importable":
      return "deterministic";
    case "partially_classifiable":
      return "partial";
    case "legacy_unclassified":
      return "unclassified";
    case "excluded":
      return "excluded";
  }
}

export function classifyLegacyRow(row: LegacySyntheticRow): ClassifiedLegacyRow {
  const sourceRowHash = canonicalSha256(sourceHashInput(row));
  const identity = sourceIdentity(row);
  const missingSourceIdentity = missingSourceIdentityReasons(row);
  const missingReasons = missingFactReasons(row.facts);
  const invalidReasons = invalidFactReasons(row.facts);
  const explicitConflicts = [...(row.conflicts ?? [])].sort().map((reason) => `conflict:${reason}`);
  let classification: LegacyClassification;
  let reasons: string[];

  if (row.policyExcluded || row.excludedByPolicy || EXCLUDED_SOURCES.has(row.sourceSystem)) {
    classification = "excluded";
    reasons = [row.policyExcluded || row.excludedByPolicy ? "explicit_policy_exclusion" : "source_policy_excluded"];
  } else if (row.sourceVersion !== "v1") {
    classification = "legacy_unclassified";
    reasons = ["unsupported_source_version"];
  } else if (row.sourceSystem !== DETERMINISTIC_SOURCE && !PARTIAL_SOURCES.has(row.sourceSystem)) {
    classification = "legacy_unclassified";
    reasons = ["unsupported_source"];
  } else if (
    row.hasConflictingFields ||
    row.hasFutureLeak ||
    explicitConflicts.length > 0 ||
    invalidReasons.length > 0
  ) {
    classification = "legacy_unclassified";
    reasons = [
      ...(row.hasConflictingFields ? ["conflicting_fields"] : []),
      ...(row.hasFutureLeak ? ["future_leak"] : []),
      ...invalidReasons,
      ...explicitConflicts,
    ];
  } else if (
    PARTIAL_SOURCES.has(row.sourceSystem) ||
    missingSourceIdentity.length > 0 ||
    missingReasons.length > 0
  ) {
    classification = "partially_classifiable";
    reasons = [
      ...(PARTIAL_SOURCES.has(row.sourceSystem) ? ["source_semantics_partial"] : []),
      ...missingSourceIdentity,
      ...missingReasons,
    ];
  } else {
    classification = "deterministic_importable";
    reasons = [];
  }

  const targetRow = classification === "deterministic_importable" ? buildTargetRow(row.facts) : null;
  const targetIdentity = targetRow
    ? canonicalSha256({ episodeId: targetRow.episodeId, scope: targetRow.scope })
    : null;
  const approvedDbClassification = toApprovedLegacyImportClassification(classification);

  return {
    classification,
    approvedDbClassification,
    databaseClassification: approvedDbClassification,
    reasons,
    sourceIdentity: identity,
    sourceRowHash,
    targetIdentity,
    targetKey: targetIdentity,
    targetRow,
    targetRowHash: targetRow ? canonicalSha256(targetRow) : null,
    metricEligible: false,
  };
}

export function inventoryLegacyRows(rows: readonly LegacySyntheticRow[]): LegacyInventory {
  const classifiedRows = rows
    .map(classifyLegacyRow)
    .sort(
      (left, right) =>
        left.sourceIdentity.localeCompare(right.sourceIdentity) ||
        left.sourceRowHash.localeCompare(right.sourceRowHash),
    );
  const sourceConflicts = new Set<string>();

  for (let index = 1; index < classifiedRows.length; index += 1) {
    const previous = classifiedRows[index - 1];
    const current = classifiedRows[index];
    if (current.sourceIdentity === previous.sourceIdentity && current.sourceRowHash !== previous.sourceRowHash) {
      sourceConflicts.add(current.sourceIdentity);
    }
  }

  const inventoryRows = classifiedRows.map((row): ClassifiedLegacyRow => {
    if (!sourceConflicts.has(row.sourceIdentity)) return row;
    return {
      ...row,
      classification: "legacy_unclassified",
      approvedDbClassification: "unclassified",
      databaseClassification: "unclassified",
      reasons: [...row.reasons, "source_identity_conflict"],
      targetIdentity: null,
      targetKey: null,
      targetRow: null,
      targetRowHash: null,
      metricEligible: false,
    };
  });

  return {
    mode: LEGACY_RECONCILIATION_MODE,
    rows: inventoryRows,
    sourceHash: canonicalSha256(
      inventoryRows.map(({ sourceIdentity: rowIdentity, sourceRowHash }) => ({
        sourceIdentity: rowIdentity,
        sourceRowHash,
      })),
    ),
  };
}

function initialDryRunState(inventory: LegacyInventory): LegacyDryRunState {
  return {
    mode: LEGACY_RECONCILIATION_MODE,
    policyVersion: LEGACY_RECONCILIATION_POLICY_VERSION,
    targetSchemaVersion: LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION,
    sourceHash: inventory.sourceHash,
    cursor: 0,
    processedRows: [],
    plannedTargets: [],
    targetConflicts: [],
    conflicts: [],
    authoritativeImports: 0,
  };
}

function validateResumeState(inventory: LegacyInventory, state: LegacyDryRunState): void {
  if (state.sourceHash !== inventory.sourceHash) throw new Error("resume_source_hash_mismatch");
  if (state.policyVersion !== LEGACY_RECONCILIATION_POLICY_VERSION) {
    throw new Error("resume_policy_version_mismatch");
  }
  if (state.targetSchemaVersion !== LEGACY_RECONCILIATION_TARGET_SCHEMA_VERSION) {
    throw new Error("resume_target_schema_version_mismatch");
  }
  if (!Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor > inventory.rows.length) {
    throw new Error("resume_cursor_invalid");
  }
  if (state.authoritativeImports !== 0) throw new Error("resume_authoritative_imports_forbidden");
}

function sourceProcessKey(row: Pick<ClassifiedLegacyRow, "sourceIdentity" | "sourceRowHash">): string {
  return canonicalSha256({ sourceIdentity: row.sourceIdentity, sourceRowHash: row.sourceRowHash });
}

function conflictKey(conflict: LegacyTargetConflict): string {
  return canonicalSha256(conflict);
}

export function dryRunLegacyBackfill(
  inventory: LegacyInventory,
  options: LegacyDryRunOptions = {},
): LegacyDryRunResult {
  const priorState = options.resumeState ?? initialDryRunState(inventory);
  validateResumeState(inventory, priorState);
  const batchSize = options.batchSize ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batch_size_must_be_positive_integer");
  }

  const start = priorState.cursor;
  const end = Math.min(start + batchSize, inventory.rows.length);
  const processedRows = [...priorState.processedRows];
  const plannedTargets = [...priorState.plannedTargets];
  const targetConflicts = [...priorState.targetConflicts];
  const processedKeys = new Set(processedRows.map(sourceProcessKey));
  const knownConflictKeys = new Set(targetConflicts.map(conflictKey));
  let idempotentSourceMatches = 0;
  let plannedTargetMatches = 0;

  for (const row of inventory.rows.slice(start, end)) {
    const processKey = sourceProcessKey(row);
    if (processedKeys.has(processKey)) {
      idempotentSourceMatches += 1;
    } else {
      processedRows.push({ sourceIdentity: row.sourceIdentity, sourceRowHash: row.sourceRowHash });
      processedKeys.add(processKey);
    }

    if (!row.targetIdentity || !row.targetRow || !row.targetRowHash) continue;
    const existingTarget = plannedTargets.find(
      (target) => target.targetIdentity === row.targetIdentity,
    );
    if (!existingTarget) {
      plannedTargets.push({
        targetIdentity: row.targetIdentity,
        targetKey: row.targetIdentity,
        targetRowHash: row.targetRowHash,
        targetRow: row.targetRow,
      });
    } else if (existingTarget.targetRowHash === row.targetRowHash) {
      plannedTargetMatches += 1;
    } else {
      const conflict = {
        targetIdentity: row.targetIdentity,
        expectedHash: existingTarget.targetRowHash,
        conflictingHash: row.targetRowHash,
      };
      const key = conflictKey(conflict);
      if (!knownConflictKeys.has(key)) {
        targetConflicts.push(conflict);
        knownConflictKeys.add(key);
      }
    }
  }

  processedRows.sort((left, right) => sourceProcessKey(left).localeCompare(sourceProcessKey(right)));
  plannedTargets.sort((left, right) => left.targetIdentity.localeCompare(right.targetIdentity));
  targetConflicts.sort((left, right) => conflictKey(left).localeCompare(conflictKey(right)));
  const conflicts = targetConflicts.map((conflict) => `target_hash_conflict:${conflict.targetIdentity}`);

  return {
    complete: end === inventory.rows.length,
    processedInBatch: end - start,
    idempotentSourceMatches,
    plannedTargetMatches,
    state: {
      ...priorState,
      cursor: end,
      processedRows,
      plannedTargets,
      targetConflicts,
      conflicts,
      authoritativeImports: 0,
    },
  };
}

export function reconcileLegacyBackfill(
  inventory: LegacyInventory,
  state: LegacyDryRunState,
): LegacyReconciliationResult {
  validateResumeState(inventory, state);
  const deterministic = inventory.rows.filter(
    (row) => row.classification === "deterministic_importable",
  ).length;
  const partial = inventory.rows.filter(
    (row) => row.classification === "partially_classifiable",
  ).length;
  const unclassified = inventory.rows.filter(
    (row) => row.classification === "legacy_unclassified",
  ).length;
  const excluded = inventory.rows.filter((row) => row.classification === "excluded").length;
  const counts: LegacyReconciliationCounts = {
    sourceRows: inventory.rows.length,
    deterministic,
    partial,
    unclassified,
    excluded,
    deterministicNotPromoted: deterministic,
    targetPromotions: 0,
    authoritativeImports: 0,
    metricEligibleLegacyRows: 0,
  };
  const countIdentity =
    counts.sourceRows === counts.deterministic + counts.partial + counts.unclassified + counts.excluded;
  const deterministicIdentity =
    counts.deterministic === counts.targetPromotions + counts.deterministicNotPromoted;
  const expectedProcessKeys = new Set(inventory.rows.map(sourceProcessKey));
  const processedProcessKeys = new Set(state.processedRows.map(sourceProcessKey));
  const fullyProcessed =
    expectedProcessKeys.size === processedProcessKeys.size &&
    [...expectedProcessKeys].every((key) => processedProcessKeys.has(key));
  const conflictingTargetRows = state.targetConflicts.length;
  const targetHash = canonicalSha256(
    state.plannedTargets.map(({ targetIdentity: identity, targetRowHash }) => ({
      targetIdentity: identity,
      targetRowHash,
    })),
  );

  return {
    counts,
    countIdentity,
    deterministicIdentity,
    conflictingTargetRows,
    sourceHash: inventory.sourceHash,
    targetHash,
    pass:
      countIdentity &&
      deterministicIdentity &&
      fullyProcessed &&
      state.cursor === inventory.rows.length &&
      conflictingTargetRows === 0 &&
      state.authoritativeImports === 0 &&
      counts.metricEligibleLegacyRows === 0,
  };
}
