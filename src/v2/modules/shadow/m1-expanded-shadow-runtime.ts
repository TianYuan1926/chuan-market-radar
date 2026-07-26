import {
  M1_MICROSTRUCTURE_FACT_TYPES,
} from "../microstructure/m1-microstructure-contract";
import {
  M1_MICROSTRUCTURE_FORWARD_PROFILE,
  M1MicrostructureForwardSelectionPlanSchema,
  buildM1MicrostructureForwardCycle,
  type M1MicrostructureForwardCycle,
  type M1MicrostructureForwardCycleInput,
  type M1MicrostructureForwardSelectionPlan,
} from "./m1-microstructure-forward-shadow-contract";
import {
  M1ExpandedShadowProviderPlanSchema,
  M1ShadowProviderObservationSchema,
  evaluateM1ShadowOrderBookSequence,
  parseM1ExpandedShadowProviderMessage,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderObservation,
  type M1ShadowSequenceState,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  type M1ShadowObservationStore,
  type M1ShadowPersistenceReceipt,
} from "./m1-expanded-shadow-store";

type FactType = (typeof M1_MICROSTRUCTURE_FACT_TYPES)[number];
type ConnectionRole =
  M1ExpandedShadowProviderPlan["connections"][number]["role"];
type CoverageCellInput =
  M1MicrostructureForwardCycleInput["coverageCells"][number];

type ObservationQuality = "FRESH" | "PARTIAL" | "STALE";

type CapturedObservation = {
  observation: M1ShadowProviderObservation;
  quality: ObservationQuality;
  latencyMs: number;
  persisted: boolean;
  compressedBytes: number;
  persistedBytes: number;
  reasonCodes: string[];
};

type MutableCell = {
  pairId: string;
  selectionRole: "RESEARCH_TRIGGER" | "MATCHED_CONTROL";
  subjectId: string;
  venue: M1ShadowProviderObservation["venue"];
  factType: FactType;
  collectionTier: CoverageCellInput["collectionTier"];
  attemptCount: number;
  heartbeatObserved: boolean;
  observations: CapturedObservation[];
  sequenceGapCount: number;
  resyncCount: number;
  outOfOrderCount: number;
  droppedEventCount: number;
  reasonCodes: Set<string>;
};

type ActiveCycle = {
  cycleIndex: number;
  scheduledAt: string;
  startedAt: string;
  missedScheduleStarts: number;
  cells: Map<string, MutableCell>;
  observationIds: Set<string>;
  networkIngressBytes: number;
  networkEgressBytes: number;
  postgresWriteBytes: number;
  postgresWalBytes: number;
  latestSourceEventAtMs: number;
};

export type M1ShadowRuntimeResourceSample = Readonly<{
  redisReadBytes: number;
  redisWriteBytes: number;
  redisPeakUsedBytes: number;
  redisConfiguredMaxBytes: number;
  cosObjectCount: number;
  cosWriteBytes: number;
  cpuP95Percent: number;
  rssBytes: number;
  diskFreeBytesBefore: number;
  diskFreeBytesAfter: number;
}>;

export type M1ShadowRuntimeIngestResult = Readonly<{
  parseStatus: "DATA" | "CONTROL" | "SCHEMA_DRIFT";
  parsedObservationCount: number;
  persistedObservationCount: number;
  reasonCodes: readonly string[];
}>;

function coverageKey(input: {
  readonly pairId: string;
  readonly selectionRole: "RESEARCH_TRIGGER" | "MATCHED_CONTROL";
  readonly subjectId: string;
  readonly factType: FactType;
}): string {
  return [
    input.pairId,
    input.selectionRole,
    input.subjectId,
    input.factType,
  ].join("|");
}

function sequenceKey(
  observation: M1ShadowProviderObservation,
): string {
  return `${observation.venue}|${observation.subjectId}`;
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

function parseIso(value: string, reason: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(reason);
  }
  return parsed;
}

function nonNegativeSafeInteger(value: number, reason: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(reason);
  return value;
}

const NON_BLOCKING_CELL_REASON_CODES = new Set([
  "heartbeat_pong",
  "pre_snapshot_buffered_delta_discarded",
  "provider_duplicate_or_heartbeat_sequence",
  "provider_duplicate_or_heartbeat_sequence_ignored",
  "provider_monotonic_only_no_contiguity_proof",
  "provider_sampled_liquidation_feed_not_total_market",
  "provider_snapshot_reset_applied",
  "subscription_acknowledged",
]);

function validateRuntimeBindings(input: {
  readonly providerPlan: M1ExpandedShadowProviderPlan;
  readonly selectionPlan: M1MicrostructureForwardSelectionPlan;
}): void {
  if (input.providerPlan.releaseId !== input.selectionPlan.releaseId) {
    throw new Error("shadow_runtime_release_identity_drifted");
  }
  const selected = input.selectionPlan.pairs.flatMap((pair) => [
    {
      subjectId: pair.trigger.subjectId,
      venue: pair.trigger.venue,
      venueInstrumentId: pair.trigger.venueInstrumentId,
    },
    {
      subjectId: pair.matchedControl.subjectId,
      venue: pair.matchedControl.venue,
      venueInstrumentId: pair.matchedControl.venueInstrumentId,
    },
  ]).sort((left, right) => left.subjectId.localeCompare(right.subjectId));
  const providers = input.providerPlan.subjects.map((subject) => ({
    subjectId: subject.subjectId,
    venue: subject.venue,
    venueInstrumentId: subject.venueInstrumentId,
  })).sort((left, right) => left.subjectId.localeCompare(right.subjectId));
  if (JSON.stringify(selected) !== JSON.stringify(providers)) {
    throw new Error("shadow_runtime_provider_subject_denominator_drifted");
  }
}

function emptyCellMap(
  plan: M1MicrostructureForwardSelectionPlan,
): Map<string, MutableCell> {
  const map = new Map<string, MutableCell>();
  for (const pair of plan.pairs) {
    for (const [selectionRole, subject] of [
      ["RESEARCH_TRIGGER", pair.trigger] as const,
      ["MATCHED_CONTROL", pair.matchedControl] as const,
    ]) {
      for (const factType of M1_MICROSTRUCTURE_FACT_TYPES) {
        const key = coverageKey({
          pairId: pair.pairId,
          selectionRole,
          subjectId: subject.subjectId,
          factType,
        });
        map.set(key, {
          pairId: pair.pairId,
          selectionRole,
          subjectId: subject.subjectId,
          venue: subject.venue,
          factType,
          collectionTier: factType === "TOP_OF_BOOK" ||
              factType === "MARK_INDEX_REFERENCE"
            ? "T1_WIDE_MARKET"
            : "T2_RESEARCH_BURST",
          attemptCount: 0,
          heartbeatObserved: false,
          observations: [],
          sequenceGapCount: 0,
          resyncCount: 0,
          outOfOrderCount: 0,
          droppedEventCount: 0,
          reasonCodes: new Set(
            factType === "LIQUIDATION_EVENT" &&
                ["OKX_SWAP", "BITGET_FUTURES"].includes(subject.venue)
              ? ["provider_sampled_liquidation_feed_not_total_market"]
              : [],
          ),
        });
      }
    }
  }
  return map;
}

function cellsForConnection(
  cycle: ActiveCycle,
  providerPlan: M1ExpandedShadowProviderPlan,
  role: ConnectionRole,
): MutableCell[] {
  const connection = providerPlan.connections.find(
    (candidate) => candidate.role === role,
  );
  if (connection === undefined) {
    throw new Error("shadow_runtime_unknown_connection_role");
  }
  const subjectIds = new Set(connection.subjectIds);
  const factTypes = new Set(connection.factTypes);
  return [...cycle.cells.values()].filter((cell) =>
    subjectIds.has(cell.subjectId) && factTypes.has(cell.factType)
  );
}

function cellForObservation(
  cycle: ActiveCycle,
  observation: M1ShadowProviderObservation,
): MutableCell {
  const matches = [...cycle.cells.values()].filter((cell) =>
    cell.subjectId === observation.subjectId &&
    cell.factType === observation.factType
  );
  if (matches.length !== 1) {
    throw new Error("shadow_runtime_observation_cell_identity_unresolved");
  }
  return matches[0]!;
}

function receiptById(
  receipt: M1ShadowPersistenceReceipt,
): Map<string, M1ShadowPersistenceReceipt["records"][number]> {
  return new Map(receipt.records.map((record) => [
    record.observationId,
    record,
  ]));
}

export class M1ExpandedShadowCaptureRuntime {
  readonly #providerPlan: M1ExpandedShadowProviderPlan;
  readonly #selectionPlan: M1MicrostructureForwardSelectionPlan;
  readonly #runtimeConfigDigest: string;
  readonly #workerRunId: string;
  readonly #store: M1ShadowObservationStore;
  readonly #sequenceStates = new Map<string, M1ShadowSequenceState>();
  #activeCycle: ActiveCycle | null = null;

  constructor(input: {
    readonly providerPlan: M1ExpandedShadowProviderPlan;
    readonly selectionPlan: M1MicrostructureForwardSelectionPlan;
    readonly runtimeConfigDigest: string;
    readonly workerRunId: string;
    readonly store: M1ShadowObservationStore;
  }) {
    this.#providerPlan = M1ExpandedShadowProviderPlanSchema.parse(
      input.providerPlan,
    );
    this.#selectionPlan = M1MicrostructureForwardSelectionPlanSchema.parse(
      input.selectionPlan,
    );
    if (!/^sha256:[0-9a-f]{64}$/u.test(input.runtimeConfigDigest)) {
      throw new Error("shadow_runtime_config_digest_invalid");
    }
    if (!/^[a-z0-9][a-z0-9._:-]{7,160}$/u.test(input.workerRunId)) {
      throw new Error("shadow_runtime_worker_run_id_invalid");
    }
    validateRuntimeBindings({
      providerPlan: this.#providerPlan,
      selectionPlan: this.#selectionPlan,
    });
    this.#runtimeConfigDigest = input.runtimeConfigDigest;
    this.#workerRunId = input.workerRunId;
    this.#store = input.store;
  }

  async initialize(): Promise<void> {
    await this.#store.initialize();
  }

  beginCycle(input: {
    readonly cycleIndex: number;
    readonly scheduledAt: string;
    readonly startedAt: string;
    readonly missedScheduleStarts?: number;
  }): void {
    if (this.#activeCycle !== null) {
      throw new Error("shadow_runtime_cycle_already_active");
    }
    if (
      !Number.isInteger(input.cycleIndex) ||
      input.cycleIndex < 1 ||
      input.cycleIndex > M1_MICROSTRUCTURE_FORWARD_PROFILE.cycleCount
    ) {
      throw new Error("shadow_runtime_cycle_index_invalid");
    }
    const scheduledAtMs = parseIso(
      input.scheduledAt,
      "shadow_runtime_scheduled_at_invalid",
    );
    const startedAtMs = parseIso(
      input.startedAt,
      "shadow_runtime_started_at_invalid",
    );
    if (startedAtMs < scheduledAtMs) {
      throw new Error("shadow_runtime_cycle_started_before_schedule");
    }
    this.#activeCycle = {
      cycleIndex: input.cycleIndex,
      scheduledAt: input.scheduledAt,
      startedAt: input.startedAt,
      missedScheduleStarts: nonNegativeSafeInteger(
        input.missedScheduleStarts ?? 0,
        "shadow_runtime_missed_start_count_invalid",
      ),
      cells: emptyCellMap(this.#selectionPlan),
      observationIds: new Set(),
      networkIngressBytes: 0,
      networkEgressBytes: 0,
      postgresWriteBytes: 0,
      postgresWalBytes: 0,
      latestSourceEventAtMs: startedAtMs,
    };
  }

  #cycle(): ActiveCycle {
    if (this.#activeCycle === null) {
      throw new Error("shadow_runtime_cycle_not_active");
    }
    return this.#activeCycle;
  }

  markConnectionAttempt(input: {
    readonly role: ConnectionRole;
    readonly heartbeatObserved: boolean;
    readonly networkEgressBytes?: number;
  }): void {
    const cycle = this.#cycle();
    for (const cell of cellsForConnection(cycle, this.#providerPlan, input.role)) {
      cell.attemptCount += 1;
      cell.heartbeatObserved ||= input.heartbeatObserved;
    }
    cycle.networkEgressBytes += nonNegativeSafeInteger(
      input.networkEgressBytes ?? 0,
      "shadow_runtime_network_egress_invalid",
    );
  }

  markConnectionHeartbeat(role: ConnectionRole): void {
    const cycle = this.#cycle();
    for (const cell of cellsForConnection(cycle, this.#providerPlan, role)) {
      cell.heartbeatObserved = true;
    }
  }

  markRestSnapshotAttempt(input: {
    readonly requestId: string;
    readonly responseObserved: boolean;
    readonly networkEgressBytes?: number;
    readonly failureReasonCode?: string;
  }): void {
    const cycle = this.#cycle();
    const request = this.#providerPlan.restSnapshots.find(
      (candidate) => candidate.requestId === input.requestId,
    );
    if (request === undefined) {
      throw new Error("shadow_runtime_unknown_rest_snapshot_request");
    }
    const cells = [...cycle.cells.values()].filter((cell) =>
      cell.subjectId === request.subjectId &&
      cell.venue === request.venue &&
      cell.factType === request.factType
    );
    if (cells.length !== 1) {
      throw new Error("shadow_runtime_rest_snapshot_cell_unresolved");
    }
    const cell = cells[0]!;
    cell.attemptCount += 1;
    cell.heartbeatObserved ||= input.responseObserved;
    if (input.failureReasonCode !== undefined) {
      if (
        !/^[a-z0-9][a-z0-9._:-]{2,160}$/u.test(input.failureReasonCode)
      ) {
        throw new Error("shadow_runtime_failure_reason_invalid");
      }
      cell.reasonCodes.add(input.failureReasonCode);
    }
    cycle.networkEgressBytes += nonNegativeSafeInteger(
      input.networkEgressBytes ?? 0,
      "shadow_runtime_network_egress_invalid",
    );
  }

  recordConnectionFailure(input: {
    readonly role: ConnectionRole;
    readonly reasonCode: string;
    readonly droppedEventCount?: number;
  }): void {
    if (!/^[a-z0-9][a-z0-9._:-]{2,160}$/u.test(input.reasonCode)) {
      throw new Error("shadow_runtime_failure_reason_invalid");
    }
    const cycle = this.#cycle();
    const dropped = nonNegativeSafeInteger(
      input.droppedEventCount ?? 0,
      "shadow_runtime_dropped_event_count_invalid",
    );
    const cells = cellsForConnection(cycle, this.#providerPlan, input.role);
    for (const cell of cells) {
      cell.reasonCodes.add(input.reasonCode);
    }
    if (dropped > 0) {
      cells[0]!.droppedEventCount += dropped;
    }
  }

  recordTransportFailure(input: {
    readonly role: ConnectionRole;
    readonly reasonCode: string;
    readonly rawFrameBytes: number;
    readonly droppedEventCount: number;
  }): void {
    const cycle = this.#cycle();
    cycle.networkIngressBytes += nonNegativeSafeInteger(
      input.rawFrameBytes,
      "shadow_runtime_raw_frame_bytes_invalid",
    );
    this.recordConnectionFailure({
      role: input.role,
      reasonCode: input.reasonCode,
      droppedEventCount: input.droppedEventCount,
    });
  }

  async ingestProviderMessage(input: {
    readonly role: ConnectionRole;
    readonly payload: unknown;
    readonly receivedAt: string;
    readonly rawFrameBytes: number;
    readonly transportKind?: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
    readonly subjectId?: string;
  }): Promise<M1ShadowRuntimeIngestResult> {
    const cycle = this.#cycle();
    const connection = this.#providerPlan.connections.find(
      (candidate) => candidate.role === input.role,
    );
    if (connection === undefined) {
      throw new Error("shadow_runtime_unknown_connection_role");
    }
    cycle.networkIngressBytes += nonNegativeSafeInteger(
      input.rawFrameBytes,
      "shadow_runtime_raw_frame_bytes_invalid",
    );
    const result = parseM1ExpandedShadowProviderMessage({
      plan: this.#providerPlan,
      venue: connection.venue,
      payload: input.payload,
      receivedAt: input.receivedAt,
      transportKind: input.transportKind,
      subjectId: input.subjectId,
    });
    if (result.heartbeatObserved) this.markConnectionHeartbeat(input.role);
    if (result.status === "SCHEMA_DRIFT") {
      this.recordConnectionFailure({
        role: input.role,
        reasonCode: result.reasonCodes[0],
      });
      return {
        parseStatus: result.status,
        parsedObservationCount: 0,
        persistedObservationCount: 0,
        reasonCodes: result.reasonCodes,
      };
    }
    if (result.status === "CONTROL") {
      return {
        parseStatus: result.status,
        parsedObservationCount: 0,
        persistedObservationCount: 0,
        reasonCodes: result.reasonCodes,
      };
    }

    const accepted: M1ShadowProviderObservation[] = [];
    const ingestReasonCodes = new Set(result.reasonCodes);
    const capturedById = new Map<string, CapturedObservation>();
    for (const rawObservation of result.observations) {
      const observation = M1ShadowProviderObservationSchema.parse(
        rawObservation,
      );
      const cell = cellForObservation(cycle, observation);
      for (const reasonCode of result.reasonCodes) {
        cell.reasonCodes.add(reasonCode);
      }
      if (cycle.observationIds.has(observation.observationId)) {
        cell.reasonCodes.add("duplicate_observation_id_ignored");
        continue;
      }
      cycle.observationIds.add(observation.observationId);
      const latencyMs =
        parseIso(observation.receivedAt, "shadow_received_at_invalid") -
        parseIso(observation.sourceEventAt, "shadow_source_event_at_invalid");
      let quality: ObservationQuality =
        latencyMs > M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms
          ? "STALE"
          : "FRESH";
      const reasonCodes: string[] = [];
      if (latencyMs < 0) {
        quality = "PARTIAL";
        reasonCodes.push("provider_event_time_after_receive_time");
      } else if (
        latencyMs >
          M1_MICROSTRUCTURE_FORWARD_PROFILE.maxEventLatencyP95Ms
      ) {
        reasonCodes.push("provider_event_latency_slo_exceeded");
      }
      cycle.latestSourceEventAtMs = Math.max(
        cycle.latestSourceEventAtMs,
        Date.parse(observation.sourceEventAt),
      );
      if (
        observation.factType === "ORDER_BOOK_SNAPSHOT" ||
        observation.factType === "ORDER_BOOK_DELTA"
      ) {
        const stateKey = sequenceKey(observation);
        const prior = this.#sequenceStates.get(stateKey) ?? null;
        const decision = evaluateM1ShadowOrderBookSequence({
          state: prior,
          observation,
        });
        if (decision.status !== "IGNORE_DUPLICATE") {
          this.#sequenceStates.set(stateKey, decision.nextState);
        }
        for (const reasonCode of decision.reasonCodes) {
          reasonCodes.push(reasonCode);
          ingestReasonCodes.add(reasonCode);
        }
        cell.sequenceGapCount += decision.gapCount;
        cell.outOfOrderCount += decision.outOfOrderCount;
        if (
          decision.status === "RESET" &&
          prior?.snapshotEstablished === true
        ) {
          cell.resyncCount += 1;
        }
        if (
          decision.status === "GAP" ||
          decision.status === "OUT_OF_ORDER"
        ) {
          quality = "PARTIAL";
        }
        if (decision.status === "IGNORE_DUPLICATE") {
          cell.reasonCodes.add(
            "provider_duplicate_or_heartbeat_sequence_ignored",
          );
          continue;
        }
      }
      const captured: CapturedObservation = {
        observation,
        quality,
        latencyMs: Math.max(0, latencyMs),
        persisted: false,
        compressedBytes: 0,
        persistedBytes: 0,
        reasonCodes,
      };
      cell.observations.push(captured);
      accepted.push(observation);
      capturedById.set(observation.observationId, captured);
    }

    let receipt: M1ShadowPersistenceReceipt;
    try {
      receipt = await this.#store.persistBatch({
        workerRunId: this.#workerRunId,
        cycleIndex: cycle.cycleIndex,
        observations: accepted,
      });
    } catch {
      for (const observation of accepted) {
        const cell = cellForObservation(cycle, observation);
        const captured = capturedById.get(observation.observationId)!;
        captured.quality = "PARTIAL";
        captured.reasonCodes.push("shadow_persistence_failed");
        cell.reasonCodes.add("shadow_persistence_failed");
      }
      return {
        parseStatus: result.status,
        parsedObservationCount: accepted.length,
        persistedObservationCount: 0,
        reasonCodes: [...new Set([
          ...ingestReasonCodes,
          "shadow_persistence_failed",
        ])],
      };
    }
    const records = receiptById(receipt);
    if (
      receipt.insertedRows !== accepted.length ||
      records.size !== accepted.length
    ) {
      throw new Error("shadow_runtime_persistence_receipt_denominator_drifted");
    }
    for (const observation of accepted) {
      const persisted = records.get(observation.observationId);
      if (persisted === undefined) {
        throw new Error("shadow_runtime_persistence_receipt_missing_observation");
      }
      const captured = capturedById.get(observation.observationId)!;
      captured.persisted = true;
      captured.compressedBytes = persisted.compressedBytes;
      captured.persistedBytes = persisted.persistedBytes;
    }
    cycle.postgresWriteBytes += receipt.postgresWriteBytes;
    cycle.postgresWalBytes += receipt.postgresWalBytes;
    return {
      parseStatus: result.status,
      parsedObservationCount: accepted.length,
      persistedObservationCount: accepted.length,
      reasonCodes: [...ingestReasonCodes],
    };
  }

  finalizeCycle(input: {
    readonly completedAt: string;
    readonly resources: M1ShadowRuntimeResourceSample;
  }): M1MicrostructureForwardCycle {
    const cycle = this.#cycle();
    const scheduledAtMs = Date.parse(cycle.scheduledAt);
    const startedAtMs = Date.parse(cycle.startedAt);
    const completedAtMs = parseIso(
      input.completedAt,
      "shadow_runtime_completed_at_invalid",
    );
    if (completedAtMs < startedAtMs) {
      throw new Error("shadow_runtime_cycle_completed_before_start");
    }
    const coverageCells: CoverageCellInput[] = [...cycle.cells.values()]
      .map((cell) => {
        const recordCount = cell.observations.length;
        const freshRecordCount = cell.observations.filter(
          (record) => record.quality === "FRESH",
        ).length;
        const partialRecordCount = cell.observations.filter(
          (record) => record.quality === "PARTIAL",
        ).length;
        const staleRecordCount = cell.observations.filter(
          (record) => record.quality === "STALE",
        ).length;
        const persistedRecordCount = cell.observations.filter(
          (record) => record.persisted,
        ).length;
        const lateEventCount = staleRecordCount;
        const reasons = new Set(cell.reasonCodes);
        for (const observation of cell.observations) {
          for (const reason of observation.reasonCodes) reasons.add(reason);
        }
        const degraded =
          partialRecordCount > 0 ||
          cell.sequenceGapCount > 0 ||
          cell.outOfOrderCount > 0 ||
          cell.droppedEventCount > 0 ||
          persistedRecordCount !== recordCount ||
          [...reasons].some((reason) =>
            !NON_BLOCKING_CELL_REASON_CODES.has(reason)
          );
        const disposition: CoverageCellInput["disposition"] =
          recordCount > 0
            ? degraded
              ? "PARTIAL"
              : staleRecordCount > 0
                ? "STALE"
                : "OBSERVED_NONEMPTY"
            : cell.attemptCount > 0 && cell.heartbeatObserved &&
                !degraded
              ? "OBSERVED_EMPTY"
              : cell.heartbeatObserved
                ? "PARTIAL"
                : "UNAVAILABLE";
        if (disposition === "UNAVAILABLE" && reasons.size === 0) {
          reasons.add("provider_stream_unavailable");
        }
        if (disposition === "PARTIAL" && reasons.size === 0) {
          reasons.add("provider_stream_partial");
        }
        return {
          pairId: cell.pairId,
          selectionRole: cell.selectionRole,
          subjectId: cell.subjectId,
          venue: cell.venue,
          factType: cell.factType,
          collectionTier: cell.collectionTier,
          disposition,
          attemptCount: cell.attemptCount,
          heartbeatObserved: cell.heartbeatObserved,
          recordCount,
          freshRecordCount,
          partialRecordCount,
          staleRecordCount,
          persistedRecordCount,
          sequenceGapCount: cell.sequenceGapCount,
          resyncCount: cell.resyncCount,
          outOfOrderCount: cell.outOfOrderCount,
          droppedEventCount: cell.droppedEventCount,
          lateEventCount,
          eventLatencyP95Ms: percentile95(
            cell.observations.map((record) => record.latencyMs),
          ),
          bytesReceived: cell.observations.reduce(
            (total, record) =>
              total + record.observation.providerPayloadBytes,
            0,
          ),
          compressedBytes: cell.observations.reduce(
            (total, record) => total + record.compressedBytes,
            0,
          ),
          reasonCodes: [...reasons].sort(),
        };
      })
      .sort((left, right) =>
        coverageKey(left).localeCompare(coverageKey(right))
      );
    const rawPayloadBytes = coverageCells.reduce(
      (total, cell) => total + cell.bytesReceived,
      0,
    );
    const compressedPayloadBytes = coverageCells.reduce(
      (total, cell) => total + cell.compressedBytes,
      0,
    );
    const persistedRecordCount = coverageCells.reduce(
      (total, cell) => total + cell.persistedRecordCount,
      0,
    );
    const persistedPayloadBytes = [...cycle.cells.values()].reduce(
      (total, cell) =>
        total +
        cell.observations.reduce(
          (cellTotal, record) => cellTotal + record.persistedBytes,
          0,
        ),
      0,
    );
    const sourceCutoffMs = Math.min(
      completedAtMs,
      Math.max(startedAtMs, cycle.latestSourceEventAtMs),
    );
    const built = buildM1MicrostructureForwardCycle({
      plan: this.#selectionPlan,
      cycle: {
        releaseId: this.#providerPlan.releaseId,
        upstreamBindingId: this.#selectionPlan.upstreamBindingId,
        upstreamBindingHash: this.#selectionPlan.upstreamBindingHash,
        planId: this.#selectionPlan.planId,
        planHash: this.#selectionPlan.contentHash,
        workerRunId: this.#workerRunId,
        runtimeConfigDigest: this.#runtimeConfigDigest,
        cycleIndex: cycle.cycleIndex,
        scheduledAt: cycle.scheduledAt,
        startedAt: cycle.startedAt,
        sourceCutoff: new Date(sourceCutoffMs).toISOString(),
        completedAt: input.completedAt,
        scheduleLagMs: startedAtMs - scheduledAtMs,
        durationMs: completedAtMs - startedAtMs,
        missedScheduleStarts: cycle.missedScheduleStarts,
        coverageCells,
        resources: {
          redisReadBytes: nonNegativeSafeInteger(
            input.resources.redisReadBytes,
            "shadow_runtime_redis_read_bytes_invalid",
          ),
          redisWriteBytes: nonNegativeSafeInteger(
            input.resources.redisWriteBytes,
            "shadow_runtime_redis_write_bytes_invalid",
          ),
          redisPeakUsedBytes: nonNegativeSafeInteger(
            input.resources.redisPeakUsedBytes,
            "shadow_runtime_redis_peak_invalid",
          ),
          redisConfiguredMaxBytes: nonNegativeSafeInteger(
            input.resources.redisConfiguredMaxBytes,
            "shadow_runtime_redis_max_invalid",
          ),
          postgresInsertedRows: persistedRecordCount,
          postgresWriteBytes: cycle.postgresWriteBytes,
          postgresWalBytes: cycle.postgresWalBytes,
          cosObjectCount: nonNegativeSafeInteger(
            input.resources.cosObjectCount,
            "shadow_runtime_cos_object_count_invalid",
          ),
          cosWriteBytes: nonNegativeSafeInteger(
            input.resources.cosWriteBytes,
            "shadow_runtime_cos_write_bytes_invalid",
          ),
          networkIngressBytes: cycle.networkIngressBytes,
          networkEgressBytes: cycle.networkEgressBytes,
          rawPayloadBytes,
          compressedPayloadBytes,
          persistedPayloadBytes,
          cpuP95Percent: input.resources.cpuP95Percent,
          rssBytes: nonNegativeSafeInteger(
            input.resources.rssBytes,
            "shadow_runtime_rss_invalid",
          ),
          diskFreeBytesBefore: nonNegativeSafeInteger(
            input.resources.diskFreeBytesBefore,
            "shadow_runtime_disk_before_invalid",
          ),
          diskFreeBytesAfter: nonNegativeSafeInteger(
            input.resources.diskFreeBytesAfter,
            "shadow_runtime_disk_after_invalid",
          ),
        },
        rawBodyRetained: false,
        secretMaterialPresent: false,
        runtimeAuthorityGranted: false,
        factAuthorityGranted: false,
        candidateAuthorityGranted: false,
        strategyAuthorityGranted: false,
        readyAuthorityGranted: false,
        capacityAuthorityGranted: false,
        productionChanged: false,
      },
    });
    this.#activeCycle = null;
    return built;
  }

  async persistedRunRowCount(): Promise<number> {
    return this.#store.countRunRows(this.#workerRunId);
  }
}
