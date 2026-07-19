import type {
  EligibleInstrumentSnapshot,
  FactQualitySnapshot,
  PointInTimeMarketFact,
} from "../../../domain/contracts";
import type { TargetVenue } from "../../../domain/product-constitution";
import type { M1ArtifactName } from "../store/contracts";
import type { M1ArtifactAppendRequest } from "../store/postgres-artifact-store";
import type { VenueCatalogResult } from "../../universe/catalog-types";
import type { VenueTickerResult } from "../ticker-types";

export const M1_COLLECTOR_RUNTIME_SCHEMA_VERSION =
  "v2-m1-collector-runtime.v1" as const;

export const M1_COLLECTOR_DEFAULT_RECONCILIATION_INTERVAL_MS =
  24 * 60 * 60 * 1_000;

export type CollectorCycleTrigger =
  | "STARTUP_FULL"
  | "INCREMENTAL_TICKER"
  | "PERIODIC_RECONCILIATION"
  | "RECOVERY";

export type CollectorRuntimeState =
  | "COLD_START"
  | "RECONCILING"
  | "COLLECTING"
  | "PERSISTING"
  | "READY"
  | "DEGRADED"
  | "BACKPRESSURED";

export type CollectorProviderOperation = "CATALOG" | "TICKER";

export type CollectorProviderFailureEvidence = Readonly<{
  kind: string;
  operation: CollectorProviderOperation;
  reasonCode: string;
  venue: TargetVenue;
}>;

export type CollectorRatioEvidence = Readonly<{
  denominator: number;
  numerator: number;
  ratio: number | null;
}>;

export type CollectorVenueCoverage = Readonly<{
  accountedCount: number;
  carriedForwardCount: number;
  collectedCount: number;
  collectionCoverage: CollectorRatioEvidence;
  eligibleCount: number;
  freshCount: number;
  freshCoverage: CollectorRatioEvidence;
  providerObservedCount: number | null;
  providerFailures: readonly CollectorProviderFailureEvidence[];
  venue: TargetVenue;
}>;

export type CollectorCoverage = Readonly<{
  accountedCount: number;
  carriedForwardCount: number;
  collectedCount: number;
  collectionCoverage: CollectorRatioEvidence;
  eligibleCount: number;
  freshCount: number;
  freshCoverage: CollectorRatioEvidence;
  providerObservedCount: number | null;
  venues: readonly CollectorVenueCoverage[];
}>;

export type CollectorRequestVenueTelemetry = Readonly<{
  activeRequests: number;
  maxConcurrentObserved: number;
  quotaLimit: number;
  quotaRejected: number;
  requestsCompleted: number;
  requestsStarted: number;
  venue: TargetVenue;
  windowMs: number;
}>;

export type CollectorRequestTelemetry = Readonly<{
  activeRequests: number;
  cycleId: string;
  maxGlobalConcurrencyObserved: number;
  maxQueueDepthObserved: number;
  maxQueueLagMs: number;
  queueDepth: number;
  queueRejected: number;
  requestsCompleted: number;
  requestsStarted: number;
  totalQueueLagMs: number;
  venues: readonly CollectorRequestVenueTelemetry[];
}>;

export type CollectorPersistenceStatus =
  | "INSERTED"
  | "IDEMPOTENT_REPLAY"
  | "MIXED_INSERT_AND_IDEMPOTENT"
  | "FAILED"
  | "NOT_ATTEMPTED";

export type CollectorCycleTelemetry = Readonly<{
  completedAt: string;
  coverage: CollectorCoverage;
  cycleId: string;
  durationMs: number;
  factQualitySnapshotId: string | null;
  nextReconciliationAt: string | null;
  persistence: CollectorPersistenceStatus;
  previousState: CollectorRuntimeState;
  providerFailures: readonly CollectorProviderFailureEvidence[];
  reasons: readonly string[];
  recovery: Readonly<{
    attempted: boolean;
    previousFailureReasons: readonly string[];
    succeeded: boolean;
  }>;
  releaseId: string;
  request: CollectorRequestTelemetry;
  schemaVersion: typeof M1_COLLECTOR_RUNTIME_SCHEMA_VERSION;
  startedAt: string;
  state: CollectorRuntimeState;
  trigger: CollectorCycleTrigger;
  universeSnapshotId: string | null;
}>;

export type CollectorCycleArtifacts = Readonly<{
  facts: readonly PointInTimeMarketFact[];
  factQuality: FactQualitySnapshot;
  universe: EligibleInstrumentSnapshot;
}>;

export type CollectorCycleResult = Readonly<{
  artifacts: CollectorCycleArtifacts | null;
  telemetry: CollectorCycleTelemetry;
}>;

export type CollectorVenueAdapter = Readonly<{
  fetchCatalog(): Promise<VenueCatalogResult>;
  fetchTickers(): Promise<VenueTickerResult>;
  venue: TargetVenue;
}>;

export type CollectorArtifactStore = Readonly<{
  appendArtifacts(
    requests: readonly M1ArtifactAppendRequest<M1ArtifactName>[],
  ): Promise<readonly Readonly<{
    status: "INSERTED" | "IDEMPOTENT_REPLAY";
  }>[]>;
}>;

export type CollectorClock = Readonly<{
  now(): Date;
}>;

export type CollectorRequestBudget = Readonly<{
  maxConcurrentRequests: number;
  maxRequestsPerWindow: number;
  windowMs: number;
}>;

export type CollectorRequestPolicy = Readonly<{
  globalMaxConcurrentRequests: number;
  maxQueueDepth: number;
  maxQueueWaitMs: number;
  providerBudgets: Readonly<Record<TargetVenue, CollectorRequestBudget>>;
}>;

export type CollectorRequestControl = Readonly<{
  beginCycle(cycleId: string): void;
  snapshot(): CollectorRequestTelemetry;
}>;

export type CollectorAdapterRuntime = Readonly<{
  adapters: readonly CollectorVenueAdapter[];
  requestControl: CollectorRequestControl;
}>;

export type CollectorRuntimeConfig = Readonly<{
  maxFactAgeMs: number;
  maxSequenceGapMs: number;
  policyVersion: string;
  reconciliationIntervalMs: number;
  releaseId: string;
  retentionMs: number;
}>;

export class CollectorRuntimeError extends Error {
  readonly code:
    | "CYCLE_ALREADY_RUNNING"
    | "INVALID_CONFIGURATION"
    | "INVALID_RUNTIME_DEPENDENCY";

  constructor(
    code: CollectorRuntimeError["code"],
    message: string,
  ) {
    super(message);
    this.name = "CollectorRuntimeError";
    this.code = code;
  }
}
