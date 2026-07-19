import { z } from "zod";
import { TARGET_VENUES } from "../../../domain/product-constitution";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import {
  M1_COLLECTOR_RUNTIME_SCHEMA_VERSION,
  type CollectorCycleTelemetry,
} from "./contracts";

const NonEmptyString = z.string().min(1);
const NonNegativeInteger = z.number().int().nonnegative();
const Instant = z.string().datetime({ offset: true });
const Venue = z.enum(TARGET_VENUES);

const ProviderFailureSchema = z.strictObject({
  kind: NonEmptyString,
  operation: z.enum(["CATALOG", "TICKER"]),
  reasonCode: NonEmptyString,
  venue: Venue,
});

const RatioSchema = z.strictObject({
  denominator: NonNegativeInteger,
  numerator: NonNegativeInteger,
  ratio: z.number().min(0).max(1).nullable(),
}).superRefine((value, context) => {
  const expected = value.denominator === 0
    ? null
    : value.numerator / value.denominator;
  if (value.numerator > value.denominator || value.ratio !== expected) {
    context.addIssue({
      code: "custom",
      message: "collector ratio must retain its exact numerator and denominator",
    });
  }
});

const VenueCoverageSchema = z.strictObject({
  accountedCount: NonNegativeInteger,
  carriedForwardCount: NonNegativeInteger,
  collectedCount: NonNegativeInteger,
  collectionCoverage: RatioSchema,
  eligibleCount: NonNegativeInteger,
  freshCount: NonNegativeInteger,
  freshCoverage: RatioSchema,
  providerObservedCount: NonNegativeInteger.nullable(),
  providerFailures: z.array(ProviderFailureSchema),
  venue: Venue,
}).superRefine((value, context) => {
  if (
    value.freshCount > value.collectedCount ||
    value.collectedCount > value.eligibleCount ||
    value.eligibleCount > value.accountedCount ||
    value.carriedForwardCount > value.accountedCount ||
    value.collectionCoverage.numerator !== value.collectedCount ||
    value.collectionCoverage.denominator !== value.eligibleCount ||
    value.freshCoverage.numerator !== value.freshCount ||
    value.freshCoverage.denominator !== value.eligibleCount ||
    value.providerFailures.some((failure) => failure.venue !== value.venue)
  ) {
    context.addIssue({
      code: "custom",
      message: "per-venue collector coverage invariant failed",
    });
  }
});

const CoverageSchema = z.strictObject({
  accountedCount: NonNegativeInteger,
  carriedForwardCount: NonNegativeInteger,
  collectedCount: NonNegativeInteger,
  collectionCoverage: RatioSchema,
  eligibleCount: NonNegativeInteger,
  freshCount: NonNegativeInteger,
  freshCoverage: RatioSchema,
  providerObservedCount: NonNegativeInteger.nullable(),
  venues: z.array(VenueCoverageSchema).length(TARGET_VENUES.length),
}).superRefine((value, context) => {
  const totals = value.venues.reduce((sum, venue) => ({
    accounted: sum.accounted + venue.accountedCount,
    carried: sum.carried + venue.carriedForwardCount,
    collected: sum.collected + venue.collectedCount,
    eligible: sum.eligible + venue.eligibleCount,
    fresh: sum.fresh + venue.freshCount,
    observed: sum.observed + (venue.providerObservedCount ?? 0),
  }), {
    accounted: 0,
    carried: 0,
    collected: 0,
    eligible: 0,
    fresh: 0,
    observed: 0,
  });
  if (
    new Set(value.venues.map((venue) => venue.venue)).size !==
      TARGET_VENUES.length ||
    totals.accounted !== value.accountedCount ||
    totals.carried !== value.carriedForwardCount ||
    totals.collected !== value.collectedCount ||
    totals.eligible !== value.eligibleCount ||
    totals.fresh !== value.freshCount ||
    (value.providerObservedCount === null
      ? value.venues.some((venue) => venue.providerObservedCount !== null)
      : totals.observed !== value.providerObservedCount) ||
    value.collectionCoverage.numerator !== value.collectedCount ||
    value.collectionCoverage.denominator !== value.eligibleCount ||
    value.freshCoverage.numerator !== value.freshCount ||
    value.freshCoverage.denominator !== value.eligibleCount
  ) {
    context.addIssue({
      code: "custom",
      message: "aggregate collector coverage must equal exact venue totals",
    });
  }
});

const RequestVenueSchema = z.strictObject({
  activeRequests: NonNegativeInteger,
  maxConcurrentObserved: NonNegativeInteger,
  quotaLimit: NonNegativeInteger,
  quotaRejected: NonNegativeInteger,
  requestsCompleted: NonNegativeInteger,
  requestsStarted: NonNegativeInteger,
  venue: Venue,
  windowMs: NonNegativeInteger,
});

const RequestSchema = z.strictObject({
  activeRequests: NonNegativeInteger,
  cycleId: NonEmptyString,
  maxGlobalConcurrencyObserved: NonNegativeInteger,
  maxQueueDepthObserved: NonNegativeInteger,
  maxQueueLagMs: NonNegativeInteger,
  queueDepth: NonNegativeInteger,
  queueRejected: NonNegativeInteger,
  requestsCompleted: NonNegativeInteger,
  requestsStarted: NonNegativeInteger,
  totalQueueLagMs: NonNegativeInteger,
  venues: z.array(RequestVenueSchema).length(TARGET_VENUES.length),
}).superRefine((value, context) => {
  const totals = value.venues.reduce((sum, venue) => ({
    active: sum.active + venue.activeRequests,
    completed: sum.completed + venue.requestsCompleted,
    started: sum.started + venue.requestsStarted,
  }), { active: 0, completed: 0, started: 0 });
  if (
    new Set(value.venues.map((venue) => venue.venue)).size !==
      TARGET_VENUES.length ||
    totals.active !== value.activeRequests ||
    totals.completed !== value.requestsCompleted ||
    totals.started !== value.requestsStarted ||
    value.requestsCompleted > value.requestsStarted ||
    value.maxQueueLagMs > value.totalQueueLagMs
  ) {
    context.addIssue({
      code: "custom",
      message: "collector request telemetry totals are inconsistent",
    });
  }
});

export const CollectorCycleTelemetrySchema = z.strictObject({
  completedAt: Instant,
  coverage: CoverageSchema,
  cycleId: NonEmptyString,
  durationMs: NonNegativeInteger,
  factQualitySnapshotId: NonEmptyString.nullable(),
  nextReconciliationAt: Instant.nullable(),
  persistence: z.enum([
    "INSERTED",
    "IDEMPOTENT_REPLAY",
    "MIXED_INSERT_AND_IDEMPOTENT",
    "FAILED",
    "NOT_ATTEMPTED",
  ]),
  previousState: z.enum([
    "COLD_START",
    "RECONCILING",
    "COLLECTING",
    "PERSISTING",
    "READY",
    "DEGRADED",
    "BACKPRESSURED",
  ]),
  providerFailures: z.array(ProviderFailureSchema),
  reasons: z.array(NonEmptyString),
  recovery: z.strictObject({
    attempted: z.boolean(),
    previousFailureReasons: z.array(NonEmptyString),
    succeeded: z.boolean(),
  }),
  releaseId: NonEmptyString,
  request: RequestSchema,
  schemaVersion: z.literal(M1_COLLECTOR_RUNTIME_SCHEMA_VERSION),
  startedAt: Instant,
  state: z.enum([
    "COLD_START",
    "RECONCILING",
    "COLLECTING",
    "PERSISTING",
    "READY",
    "DEGRADED",
    "BACKPRESSURED",
  ]),
  trigger: z.enum([
    "STARTUP_FULL",
    "INCREMENTAL_TICKER",
    "PERIODIC_RECONCILIATION",
    "RECOVERY",
  ]),
  universeSnapshotId: NonEmptyString.nullable(),
}).superRefine((value, context) => {
  const duration = Date.parse(value.completedAt) - Date.parse(value.startedAt);
  const ready = value.state === "READY";
  const canonicalFailure = (failure: {
    kind: string;
    operation: string;
    reasonCode: string;
    venue: string;
  }) => `${failure.venue}:${failure.operation}:${failure.kind}:${failure.reasonCode}`;
  const aggregateFailures = value.providerFailures
    .map(canonicalFailure)
    .sort();
  const venueFailures = value.coverage.venues
    .flatMap((venue) => venue.providerFailures)
    .map(canonicalFailure)
    .sort();
  if (
    duration !== value.durationMs ||
    JSON.stringify(aggregateFailures) !== JSON.stringify(venueFailures) ||
    value.request.cycleId !== value.cycleId ||
    value.request.activeRequests !== 0 ||
    value.request.queueDepth !== 0 ||
    (value.recovery.succeeded && (!value.recovery.attempted || !ready)) ||
    (ready && (
      value.reasons.length !== 0 ||
      value.providerFailures.length !== 0 ||
      value.persistence === "FAILED" ||
      value.persistence === "NOT_ATTEMPTED" ||
      value.request.queueRejected !== 0 ||
      value.request.venues.some((venue) => venue.quotaRejected !== 0) ||
      value.coverage.eligibleCount === 0 ||
      value.coverage.freshCount !== value.coverage.eligibleCount ||
      value.factQualitySnapshotId === null ||
      value.universeSnapshotId === null
    ))
  ) {
    context.addIssue({
      code: "custom",
      message: "completed collector telemetry violates runtime truth invariants",
    });
  }
});

export function parseCollectorCycleTelemetry(
  input: unknown,
): CollectorCycleTelemetry {
  return deepFreezeArtifact(
    CollectorCycleTelemetrySchema.parse(input) as CollectorCycleTelemetry,
  );
}
