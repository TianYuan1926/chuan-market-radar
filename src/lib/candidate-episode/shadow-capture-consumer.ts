import type { OpenOrRefreshEpisodeCommand } from "./candidate-episode-service";
import type { CandidateEpisodeService } from "./candidate-episode-service";
import type { CandidateOutboxClaim, CandidateOutboxService } from "./outbox-service";
import {
  hashShadowCandidatePayload,
  SHADOW_CANDIDATE_PAYLOAD_VERSION,
  SHADOW_CANDIDATE_SOURCE_TYPE,
  validateShadowCandidateObservation,
  type ShadowCandidateObservationV1,
} from "./shadow-capture-source";

export type ShadowCaptureMetricName =
  | "shadow_projection_success_total"
  | "shadow_projection_failure_total"
  | "outbox_attempt_exhausted_total"
  | "outbox_payload_hash_conflict_total"
  | "outbox_stale_fence_rejection_total";

export type ShadowCaptureMetric = Readonly<{
  name: ShadowCaptureMetricName;
  value: 1;
  releaseId: string;
  migrationId: string;
  authorityEpoch: number;
  payloadVersion: string;
  failureClass: string;
}>;

export type RunShadowCaptureBatchCommand = Readonly<{
  scope: "production_radar";
  runtimeId: string;
  now: string;
  limit: number;
  migrationId: string;
  authorityEpoch: number;
  signal?: AbortSignal;
}>;

type ConsumerDependencies = Readonly<{
  outbox: Pick<
    CandidateOutboxService,
    "claimShadowCandidates" | "complete" | "retryOrQuarantine" | "quarantine"
  >;
  episodes: Pick<CandidateEpisodeService, "openOrRefreshEpisode">;
  onMetric?: (metric: ShadowCaptureMetric) => void;
}>;

type ItemStatus = "completed" | "retry_wait" | "quarantined" | "lease_lost";
type ItemResult = { outboxId: string; status: ItemStatus; failureClass?: string };

class PermanentShadowPayloadError extends Error {
  constructor(readonly failureClass: string, message: string) {
    super(message);
    this.name = "PermanentShadowPayloadError";
  }
}

export class ShadowCaptureHardStopError extends Error {
  constructor(readonly failureClass: string, message: string) {
    super(message);
    this.name = "ShadowCaptureHardStopError";
  }
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

function transientFailureClass(code: string | null) {
  return code && /^[0-9A-Z]{5}$/.test(code)
    ? `database_${code.toLowerCase()}`
    : "temporary_projection_failure";
}

function abortIfRequested(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("shadow capture aborted", "AbortError");
}

function addMilliseconds(iso: string, milliseconds: number) {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) throw new Error("shadow_capture_now_invalid");
  return new Date(value + milliseconds).toISOString();
}

function retryDelayMs(attemptCount: number) {
  return Math.min(15 * 60_000, 60_000 * (2 ** Math.max(0, attemptCount - 1)));
}

function parseClaimPayload(claim: CandidateOutboxClaim): ShadowCandidateObservationV1 {
  if (claim.sourceType !== SHADOW_CANDIDATE_SOURCE_TYPE) {
    throw new PermanentShadowPayloadError("unsupported_source_type", "unsupported source type");
  }
  if (claim.payloadVersion !== SHADOW_CANDIDATE_PAYLOAD_VERSION) {
    throw new PermanentShadowPayloadError("unsupported_payload", "unsupported payload version");
  }
  try {
    validateShadowCandidateObservation(claim.payload);
  } catch {
    throw new PermanentShadowPayloadError("invalid_payload", "invalid shadow candidate payload");
  }
  if (hashShadowCandidatePayload(claim.payload) !== claim.payloadHash) {
    throw new ShadowCaptureHardStopError(
      "payload_hash_conflict",
      "shadow candidate payload hash conflict",
    );
  }
  return claim.payload;
}

function projectionCommand(
  claim: CandidateOutboxClaim,
  payload: ShadowCandidateObservationV1,
): OpenOrRefreshEpisodeCommand {
  return {
    scope: claim.scope,
    canonicalInstrumentId: payload.canonicalInstrumentId,
    venueContext: payload.venueContext,
    firstSeenAt: payload.firstSeenAt,
    lastSeenAt: payload.lastSeenAt,
    observationPrice: payload.observationPrice,
    observationPriceFactId: payload.observationPriceFactId,
    discoveryReasons: [...payload.discoveryReasons],
    priorityTier: payload.priorityTier,
    maturity: payload.maturity,
    directionState: payload.directionState,
    expiresAt: payload.expiresAt,
    releaseId: payload.releaseId,
    sourceScanCycleId: payload.sourceScanCycleId,
    runtimeId: claim.runtimeId,
    idempotencyKey: `shadow-projection:${claim.outboxId}`,
  };
}

export class CandidateShadowCaptureConsumer {
  private readonly onMetric: (metric: ShadowCaptureMetric) => void;

  constructor(private readonly dependencies: ConsumerDependencies) {
    this.onMetric = dependencies.onMetric ?? (() => undefined);
  }

  async runBatch(command: RunShadowCaptureBatchCommand) {
    abortIfRequested(command.signal);
    const claims = await this.dependencies.outbox.claimShadowCandidates(command);
    const itemStatuses: ItemResult[] = [];

    for (const claim of claims) {
      abortIfRequested(command.signal);
      let payload: ShadowCandidateObservationV1 | null = null;
      let projected = false;
      try {
        payload = parseClaimPayload(claim);
        await this.dependencies.episodes.openOrRefreshEpisode(projectionCommand(claim, payload));
        projected = true;
        await this.dependencies.outbox.complete(claim, { now: command.now });
        itemStatuses.push({ outboxId: claim.outboxId, status: "completed" });
        this.metric(claim, payload.releaseId, "shadow_projection_success_total", "none");
      } catch (error) {
        const code = errorCode(error);
        if (projected && code === "40001") {
          itemStatuses.push({ outboxId: claim.outboxId, status: "lease_lost" });
          this.metric(
            claim,
            payload?.releaseId ?? "unavailable",
            "outbox_stale_fence_rejection_total",
            "stale_fence",
          );
          continue;
        }

        if (error instanceof ShadowCaptureHardStopError || code === "23505") {
          await this.dependencies.outbox.quarantine(claim, {
            now: command.now,
            errorClass: error instanceof ShadowCaptureHardStopError
              ? error.failureClass
              : "projection_idempotency_conflict",
            errorMessageRedacted: "hard shadow projection conflict",
          });
          this.metric(
            claim,
            payload?.releaseId ?? "unavailable",
            "outbox_payload_hash_conflict_total",
            error instanceof ShadowCaptureHardStopError
              ? error.failureClass
              : "projection_idempotency_conflict",
          );
          throw new ShadowCaptureHardStopError(
            error instanceof ShadowCaptureHardStopError
              ? error.failureClass
              : "projection_idempotency_conflict",
            "shadow capture halted after a hard conflict",
          );
        }

        if (error instanceof PermanentShadowPayloadError || code === "23514") {
          const failureClass = error instanceof PermanentShadowPayloadError
            ? error.failureClass
            : "projection_constraint_failure";
          await this.dependencies.outbox.quarantine(claim, {
            now: command.now,
            errorClass: failureClass,
            errorMessageRedacted: "permanent shadow projection rejection",
          });
          itemStatuses.push({ outboxId: claim.outboxId, status: "quarantined" });
          this.metric(
            claim,
            payload?.releaseId ?? "unavailable",
            "shadow_projection_failure_total",
            failureClass,
          );
          continue;
        }

        const failureClass = transientFailureClass(code);
        const decision = await this.dependencies.outbox.retryOrQuarantine(claim, {
          now: command.now,
          nextAttemptAt: addMilliseconds(command.now, retryDelayMs(claim.attemptCount)),
          errorClass: failureClass,
          errorMessageRedacted: "temporary shadow projection failure",
        });
        itemStatuses.push({
          outboxId: claim.outboxId,
          status: decision.status,
          failureClass,
        });
        this.metric(
          claim,
          payload?.releaseId ?? "unavailable",
          decision.status === "quarantined"
            ? "outbox_attempt_exhausted_total"
            : "shadow_projection_failure_total",
          failureClass,
        );
      }
    }

    return {
      claimed: claims.length,
      completed: itemStatuses.filter((item) => item.status === "completed").length,
      retryWait: itemStatuses.filter((item) => item.status === "retry_wait").length,
      quarantined: itemStatuses.filter((item) => item.status === "quarantined").length,
      leaseLost: itemStatuses.filter((item) => item.status === "lease_lost").length,
      items: itemStatuses,
    };
  }

  private metric(
    claim: CandidateOutboxClaim,
    releaseId: string,
    name: ShadowCaptureMetricName,
    failureClass: string,
  ) {
    this.onMetric({
      name,
      value: 1,
      releaseId,
      migrationId: claim.migrationId,
      authorityEpoch: claim.authorityEpoch,
      payloadVersion: claim.payloadVersion,
      failureClass,
    });
  }
}
