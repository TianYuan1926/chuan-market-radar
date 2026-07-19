import type {
  EligibleInstrumentSnapshot,
  InstrumentAccountingRecord,
  QualityAssessment,
} from "../../domain/contracts";
import { TARGET_VENUES } from "../../domain/product-constitution";
import type { DataQualityState } from "../../domain/states";
import { EligibleInstrumentSnapshotSchema } from "../../runtime-schema/foundation-schemas";
import { RUNTIME_OBJECT_SCHEMA_VERSIONS } from "../../runtime-schema/schema-versions";
import {
  unavailableAccounting,
  type VenueCatalogResult,
} from "./catalog-types";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "./stable-artifact";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function deactivateIdentityConflicts(
  accounting: readonly InstrumentAccountingRecord[],
): InstrumentAccountingRecord[] {
  const counts = new Map<string, number>();
  for (const record of accounting) {
    if (record.canonicalInstrumentId !== null) {
      counts.set(
        record.canonicalInstrumentId,
        (counts.get(record.canonicalInstrumentId) ?? 0) + 1,
      );
    }
  }

  return accounting.map((record) => {
    if (
      record.canonicalInstrumentId === null ||
      counts.get(record.canonicalInstrumentId) === 1
    ) {
      return record;
    }
    return {
      ...record,
      canonicalInstrumentId: null,
      eligible: false,
      status: "UNRESOLVED" as const,
      statusReasons: uniqueSorted([
        ...record.statusReasons,
        "canonical_identity_conflict",
      ]),
      underlyingGroupId: null,
    };
  });
}

function failureQualityStatus(
  catalogs: readonly VenueCatalogResult[],
): DataQualityState {
  const failures = catalogs.filter((catalog) => !catalog.ok);
  if (failures.length !== catalogs.length) {
    return "PARTIAL";
  }
  const kinds = new Set(failures.map((catalog) => catalog.failure.kind));
  if (kinds.size === 1) {
    return failures[0]?.failure.kind ?? "UNAVAILABLE";
  }
  return "UNAVAILABLE";
}

function qualityAssessment(
  catalogs: readonly VenueCatalogResult[],
  accounting: readonly InstrumentAccountingRecord[],
  generatedAt: string,
  sourceCutoff: string,
): QualityAssessment {
  const reasons: string[] = [];
  for (const catalog of catalogs) {
    if (!catalog.ok) {
      reasons.push(`${catalog.venue}:${catalog.failure.reasonCode}`);
    }
    if (catalog.ok && catalog.accounting.length === 0) {
      reasons.push(`${catalog.venue}:catalog_empty`);
    }
  }
  for (const record of accounting) {
    if (record.status === "UNRESOLVED" || record.status === "UNAVAILABLE") {
      reasons.push(...record.statusReasons.map((reason) =>
        `${record.venue}:${reason}`));
    }
  }

  const hasFailure = catalogs.some((catalog) => !catalog.ok);
  const hasEmptyCatalog = catalogs.some(
    (catalog) => catalog.ok && catalog.accounting.length === 0,
  );
  const hasUnresolved = accounting.some(
    (record) => record.status === "UNRESOLVED" || record.status === "UNAVAILABLE",
  );
  let status: DataQualityState = "FRESH";
  const hasMeasuredCatalog = catalogs.some(
    (catalog) => catalog.ok && catalog.accounting.length > 0,
  );
  if (hasFailure && hasMeasuredCatalog) {
    status = failureQualityStatus(catalogs);
  } else if (hasFailure) {
    status = catalogs.every((catalog) => !catalog.ok)
      ? failureQualityStatus(catalogs)
      : "UNAVAILABLE";
  } else if (accounting.length === 0) {
    status = "UNAVAILABLE";
  } else if (hasEmptyCatalog || hasUnresolved) {
    status = "PARTIAL";
  }

  return {
    status,
    ageMs: status === "UNAVAILABLE" || !hasMeasuredCatalog
      ? null
      : Math.max(0, Date.parse(generatedAt) - Date.parse(sourceCutoff)),
    reasonCodes: status === "FRESH"
      ? []
      : uniqueSorted(reasons.length > 0 ? reasons : ["catalog_not_fresh"]),
  };
}

export function buildEligibleInstrumentSnapshot(input: {
  catalogs: readonly VenueCatalogResult[];
  generatedAt: string;
  policyVersion: string;
  releaseId: string;
  sourceCutoff: string;
}): EligibleInstrumentSnapshot {
  const byVenue = new Map(input.catalogs.map((catalog) => [catalog.venue, catalog]));
  if (
    input.catalogs.length !== TARGET_VENUES.length ||
    byVenue.size !== TARGET_VENUES.length ||
    TARGET_VENUES.some((venue) => !byVenue.has(venue))
  ) {
    throw new Error("one and only one catalog result is required per target venue");
  }
  if (Date.parse(input.sourceCutoff) > Date.parse(input.generatedAt)) {
    throw new Error("universe sourceCutoff cannot exceed generatedAt");
  }

  const catalogs = TARGET_VENUES.map((venue) => byVenue.get(venue)!);
  const rawAccounting = catalogs.flatMap((catalog) =>
    catalog.ok
      ? [...catalog.accounting]
      : [...unavailableAccounting(
        catalog.accounting,
        catalog.failure.reasonCode,
      )]);
  const accounting = deactivateIdentityConflicts(rawAccounting);
  const quality = qualityAssessment(
    catalogs,
    accounting,
    input.generatedAt,
    input.sourceCutoff,
  );
  const content = {
    accounting,
    policyVersion: input.policyVersion,
    quality,
    sourceCutoff: input.sourceCutoff,
  };
  const digest = stableSha256(content);

  return deepFreezeArtifact(EligibleInstrumentSnapshotSchema.parse({
    schemaVersion: RUNTIME_OBJECT_SCHEMA_VERSIONS.EligibleInstrumentSnapshot,
    releaseId: input.releaseId,
    producerModule: "universe_registry",
    generatedAt: input.generatedAt,
    sourceCutoff: input.sourceCutoff,
    contentHash: stableContentHash(content),
    snapshotId: `universe:${digest.slice(0, 24)}`,
    policyVersion: input.policyVersion,
    observedCount: accounting.length,
    eligibleCount: accounting.filter((record) => record.eligible).length,
    accounting,
    quality,
  }));
}
