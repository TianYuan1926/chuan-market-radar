import type {
  EligibleInstrumentSnapshot,
} from "../../../domain/contracts";
import { TARGET_VENUES, type TargetVenue } from "../../../domain/product-constitution";
import { buildEligibleInstrumentSnapshot } from "../../universe/build-eligible-snapshot";
import {
  carriedForwardCounts,
  reconcileCatalogs,
} from "../../universe/reconcile-catalogs";
import { deepFreezeArtifact } from "../../universe/stable-artifact";
import type { VenueCatalogResult } from "../../universe/catalog-types";
import { buildLastPriceFacts } from "../build-last-price-facts";
import type { VenueTickerResult } from "../ticker-types";
import { M1StoreError, type M1ArtifactName } from "../store/contracts";
import type { M1ArtifactAppendRequest } from "../store/postgres-artifact-store";
import { buildCollectorCoverage, collectorProviderFailures } from "./coverage";
import { parseCollectorCycleTelemetry } from "./collector-telemetry-schema";
import {
  CollectorRuntimeError,
  M1_COLLECTOR_RUNTIME_SCHEMA_VERSION,
  type CollectorAdapterRuntime,
  type CollectorArtifactStore,
  type CollectorClock,
  type CollectorCycleArtifacts,
  type CollectorCycleResult,
  type CollectorCycleTelemetry,
  type CollectorCycleTrigger,
  type CollectorPersistenceStatus,
  type CollectorRuntimeConfig,
  type CollectorRuntimeState,
} from "./contracts";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function validPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function maxIso(values: readonly string[]): string {
  const timestamps = values.map(Date.parse);
  if (timestamps.length === 0 || timestamps.some((value) => !Number.isFinite(value))) {
    throw new CollectorRuntimeError(
      "INVALID_RUNTIME_DEPENDENCY",
      "provider adapter returned an invalid receive time",
    );
  }
  return new Date(Math.max(...timestamps)).toISOString();
}

function persistenceStatus(
  statuses: readonly ("INSERTED" | "IDEMPOTENT_REPLAY")[],
): CollectorPersistenceStatus {
  const unique = new Set(statuses);
  if (unique.size === 1 && unique.has("INSERTED")) {
    return "INSERTED";
  }
  if (unique.size === 1 && unique.has("IDEMPOTENT_REPLAY")) {
    return "IDEMPOTENT_REPLAY";
  }
  return "MIXED_INSERT_AND_IDEMPOTENT";
}

function storeFailureReason(error: unknown): string {
  return error instanceof M1StoreError
    ? `m1_store_${error.code.toLowerCase()}`
    : "m1_store_append_failed";
}

function skippedTickerBatch(venue: TargetVenue, receivedAt: string): VenueTickerResult {
  return {
    issues: [],
    observations: [],
    ok: true,
    receivedAt,
    venue,
  };
}

export class M1CollectorRuntime {
  readonly #adapterRuntime: CollectorAdapterRuntime;
  readonly #clock: CollectorClock;
  readonly #config: CollectorRuntimeConfig;
  readonly #store: CollectorArtifactStore;
  #cycleCounter = 0;
  #inFlight = false;
  #lastCatalogAtMs: number | null = null;
  #lastFailureReasons: readonly string[] = Object.freeze([]);
  #lastUniverse: EligibleInstrumentSnapshot | null = null;
  #previousSequences: Readonly<Record<string, string>> = Object.freeze({});
  #state: CollectorRuntimeState = "COLD_START";

  constructor(input: {
    adapterRuntime: CollectorAdapterRuntime;
    clock: CollectorClock;
    config: CollectorRuntimeConfig;
    store: CollectorArtifactStore;
  }) {
    const byVenue = new Map(
      input.adapterRuntime?.adapters.map((adapter) => [adapter.venue, adapter]),
    );
    if (
      typeof input.clock?.now !== "function" ||
      typeof input.store?.appendArtifacts !== "function" ||
      typeof input.adapterRuntime?.requestControl?.beginCycle !== "function" ||
      typeof input.adapterRuntime?.requestControl?.snapshot !== "function" ||
      input.adapterRuntime.adapters.length !== TARGET_VENUES.length ||
      byVenue.size !== TARGET_VENUES.length ||
      TARGET_VENUES.some((venue) => !byVenue.has(venue))
    ) {
      throw new CollectorRuntimeError(
        "INVALID_RUNTIME_DEPENDENCY",
        "collector requires one adapter per target venue, request control and M1 Store",
      );
    }
    if (
      input.config.releaseId.trim() === "" ||
      input.config.policyVersion.trim() === "" ||
      !Number.isSafeInteger(input.config.maxFactAgeMs) ||
      input.config.maxFactAgeMs < 0 ||
      !validPositiveInteger(input.config.maxSequenceGapMs) ||
      !validPositiveInteger(input.config.reconciliationIntervalMs) ||
      !validPositiveInteger(input.config.retentionMs)
    ) {
      throw new CollectorRuntimeError(
        "INVALID_CONFIGURATION",
        "collector runtime configuration is incomplete or invalid",
      );
    }
    this.#adapterRuntime = input.adapterRuntime;
    this.#clock = input.clock;
    this.#config = input.config;
    this.#store = input.store;
  }

  get state(): CollectorRuntimeState {
    return this.#state;
  }

  async runNextCycle(): Promise<CollectorCycleResult> {
    if (this.#inFlight) {
      throw new CollectorRuntimeError(
        "CYCLE_ALREADY_RUNNING",
        "collector refuses overlapping cycles",
      );
    }
    const previousState = this.#state;
    const previousFailureReasons = this.#lastFailureReasons;
    const startedMs = this.#nowMs();
    const startedAt = new Date(startedMs).toISOString();
    const trigger = this.#nextTrigger(startedMs);
    const cycleId = `collector:${this.#config.releaseId}:${startedAt}:${this.#cycleCounter}`;
    this.#cycleCounter += 1;
    this.#inFlight = true;

    try {
      this.#adapterRuntime.requestControl.beginCycle(cycleId);
      let currentCatalogs: readonly VenueCatalogResult[] | null = null;
      let providerObservedByVenue: Readonly<Record<TargetVenue, number>> | null = null;
      let carriedByVenue: Readonly<Record<TargetVenue, number>>;
      let universe: EligibleInstrumentSnapshot;
      let candidateCatalogAtMs = this.#lastCatalogAtMs;

      if (trigger === "INCREMENTAL_TICKER") {
        if (this.#lastUniverse === null) {
          throw new CollectorRuntimeError(
            "INVALID_RUNTIME_DEPENDENCY",
            "incremental collection requires a durable Universe checkpoint",
          );
        }
        universe = this.#lastUniverse;
        carriedByVenue = carriedForwardCounts(universe);
        this.#state = "COLLECTING";
      } else {
        this.#state = "RECONCILING";
        currentCatalogs = await Promise.all(
          this.#adapterRuntime.adapters.map((adapter) => adapter.fetchCatalog()),
        );
        const reconciled = reconcileCatalogs({
          current: currentCatalogs,
          previous: this.#lastUniverse,
        });
        providerObservedByVenue = reconciled.providerObservedByVenue;
        carriedByVenue = reconciled.carriedForwardByVenue;
        const catalogCutoff = maxIso(currentCatalogs.map(
          (catalog) => catalog.receivedAt,
        ));
        const generatedAt = this.#nowAtOrAfter(catalogCutoff);
        universe = buildEligibleInstrumentSnapshot({
          catalogs: reconciled.catalogs,
          generatedAt,
          policyVersion: this.#config.policyVersion,
          releaseId: this.#config.releaseId,
          sourceCutoff: catalogCutoff,
        });
        candidateCatalogAtMs = Date.parse(catalogCutoff);
        this.#state = "COLLECTING";
      }

      const eligibleVenues = new Set(universe.accounting
        .filter((record) => record.eligible)
        .map((record) => record.venue));
      const tickerStart = this.#nowAtOrAfter(universe.sourceCutoff);
      const tickerBatches = await Promise.all(
        this.#adapterRuntime.adapters.map((adapter) =>
          eligibleVenues.has(adapter.venue)
            ? adapter.fetchTickers()
            : Promise.resolve(skippedTickerBatch(adapter.venue, tickerStart))),
      );
      const factCutoff = maxIso([
        universe.sourceCutoff,
        ...tickerBatches.map((batch) => batch.receivedAt),
      ]);
      const normalizedAt = this.#nowAtOrAfter(factCutoff);
      const generatedAt = this.#nowAtOrAfter(normalizedAt);
      const builtFacts = buildLastPriceFacts({
        batches: tickerBatches,
        generatedAt,
        maxAgeMs: this.#config.maxFactAgeMs,
        maxSequenceGapMs: this.#config.maxSequenceGapMs,
        normalizedAt,
        previousSequences: this.#previousSequences,
        releaseId: this.#config.releaseId,
        sourceCutoff: factCutoff,
        universe,
      });
      const coverage = buildCollectorCoverage({
        carriedForwardByVenue: carriedByVenue,
        catalogs: currentCatalogs,
        facts: builtFacts.facts,
        providerObservedByVenue,
        tickerBatches,
        universe,
      });
      const artifacts: CollectorCycleArtifacts = deepFreezeArtifact({
        facts: builtFacts.facts,
        factQuality: builtFacts.qualitySnapshot,
        universe,
      });
      this.#state = "PERSISTING";

      const requests: M1ArtifactAppendRequest<M1ArtifactName>[] = [
        {
          artifactName: "EligibleInstrumentSnapshot",
          artifact: universe,
          retainUntil: this.#retainUntil(universe.generatedAt),
        },
        ...builtFacts.facts.map((fact): M1ArtifactAppendRequest<M1ArtifactName> => ({
          artifactName: "PointInTimeMarketFact",
          artifact: fact,
          retainUntil: this.#retainUntil(fact.generatedAt),
        })),
        {
          artifactName: "FactQualitySnapshot",
          artifact: builtFacts.qualitySnapshot,
          retainUntil: this.#retainUntil(builtFacts.qualitySnapshot.generatedAt),
        },
      ];
      let persistence: CollectorPersistenceStatus;
      let persistenceFailureReason: string | null = null;
      try {
        const appended = await this.#store.appendArtifacts(requests);
        if (appended.length !== requests.length) {
          persistence = "FAILED";
          persistenceFailureReason = "m1_store_append_result_mismatch";
        } else {
          persistence = persistenceStatus(appended.map((result) => result.status));
        }
      } catch (error) {
        persistence = "FAILED";
        persistenceFailureReason = storeFailureReason(error);
      }

      const providerFailures = collectorProviderFailures({
        catalogs: currentCatalogs,
        tickerBatches,
      });
      const request = this.#adapterRuntime.requestControl.snapshot();
      const requestRejected = request.queueRejected > 0 ||
        request.venues.some((venue) => venue.quotaRejected > 0);
      const reasons = uniqueSorted([
        ...providerFailures.map((failure) => failure.reasonCode),
        ...universe.quality.reasonCodes,
        ...builtFacts.qualitySnapshot.quality.reasonCodes,
        ...(coverage.eligibleCount === 0 ? ["eligible_universe_empty"] : []),
        ...(coverage.freshCount !== coverage.eligibleCount
          ? ["fresh_coverage_incomplete"]
          : []),
        ...(persistenceFailureReason === null ? [] : [persistenceFailureReason]),
        ...(requestRejected ? ["collector_request_rejected"] : []),
      ]);
      const ready =
        persistence !== "FAILED" &&
        coverage.eligibleCount > 0 &&
        coverage.freshCount === coverage.eligibleCount &&
        universe.quality.status === "FRESH" &&
        builtFacts.qualitySnapshot.quality.status === "FRESH" &&
        providerFailures.length === 0 &&
        !requestRejected;
      const backpressured = requestRejected || providerFailures.some(
        (failure) =>
          failure.kind === "RATE_LIMITED" ||
          failure.reasonCode.startsWith("collector_backpressure_"),
      );
      const finalState: CollectorRuntimeState = ready
        ? "READY"
        : backpressured
          ? "BACKPRESSURED"
          : "DEGRADED";

      if (persistence !== "FAILED") {
        this.#lastUniverse = universe;
        this.#previousSequences = builtFacts.nextSequences;
        if (trigger !== "INCREMENTAL_TICKER") {
          this.#lastCatalogAtMs = candidateCatalogAtMs;
        }
      }
      this.#state = finalState;
      this.#lastFailureReasons = ready ? Object.freeze([]) : Object.freeze(reasons);
      const completedMs = Math.max(startedMs, this.#nowMs());
      const telemetry: CollectorCycleTelemetry = parseCollectorCycleTelemetry({
        completedAt: new Date(completedMs).toISOString(),
        coverage,
        cycleId,
        durationMs: completedMs - startedMs,
        factQualitySnapshotId: builtFacts.qualitySnapshot.snapshotId,
        nextReconciliationAt: this.#lastCatalogAtMs === null
          ? null
          : new Date(
            this.#lastCatalogAtMs + this.#config.reconciliationIntervalMs,
          ).toISOString(),
        persistence,
        previousState,
        providerFailures,
        reasons: ready ? [] : reasons,
        recovery: {
          attempted: trigger === "RECOVERY",
          previousFailureReasons,
          succeeded: trigger === "RECOVERY" && ready,
        },
        releaseId: this.#config.releaseId,
        request,
        schemaVersion: M1_COLLECTOR_RUNTIME_SCHEMA_VERSION,
        startedAt,
        state: finalState,
        trigger,
        universeSnapshotId: universe.snapshotId,
      });
      return deepFreezeArtifact({ artifacts, telemetry });
    } catch (error) {
      this.#state = "DEGRADED";
      this.#lastFailureReasons = Object.freeze(["collector_internal_error"]);
      throw error;
    } finally {
      this.#inFlight = false;
    }
  }

  #nextTrigger(nowMs: number): CollectorCycleTrigger {
    if (this.#state === "DEGRADED" || this.#state === "BACKPRESSURED") {
      return "RECOVERY";
    }
    if (this.#lastUniverse === null) {
      return "STARTUP_FULL";
    }
    if (
      this.#lastCatalogAtMs === null ||
      nowMs - this.#lastCatalogAtMs >= this.#config.reconciliationIntervalMs
    ) {
      return "PERIODIC_RECONCILIATION";
    }
    return "INCREMENTAL_TICKER";
  }

  #retainUntil(generatedAt: string): string {
    return new Date(
      Date.parse(generatedAt) + this.#config.retentionMs,
    ).toISOString();
  }

  #nowAtOrAfter(value: string): string {
    return new Date(Math.max(Date.parse(value), this.#nowMs())).toISOString();
  }

  #nowMs(): number {
    const value = this.#clock.now().getTime();
    if (!Number.isFinite(value)) {
      throw new CollectorRuntimeError(
        "INVALID_RUNTIME_DEPENDENCY",
        "collector clock returned an invalid instant",
      );
    }
    return value;
  }
}
