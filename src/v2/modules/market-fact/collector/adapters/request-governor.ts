import { TARGET_VENUES, type TargetVenue } from "../../../../domain/product-constitution";
import { deepFreezeArtifact } from "../../../universe/stable-artifact";
import type {
  PublicJsonRequest,
  PublicJsonResult,
  PublicJsonTransport,
} from "../../../universe/public-json-transport";
import {
  CollectorRuntimeError,
  type CollectorClock,
  type CollectorRequestControl,
  type CollectorRequestPolicy,
  type CollectorRequestTelemetry,
} from "../contracts";

const VENUE_HOSTS: Readonly<Record<TargetVenue, string>> = Object.freeze({
  BINANCE_FUTURES: "fapi.binance.com",
  OKX_SWAP: "www.okx.com",
  BYBIT_LINEAR_PERPETUAL: "api.bybit.com",
});

type QuotaState = {
  used: number;
  windowStartedAtMs: number;
};

type MutableVenueTelemetry = {
  maxConcurrentObserved: number;
  quotaRejected: number;
  requestsCompleted: number;
  requestsStarted: number;
};

type QueuedRequest = {
  enqueuedAtMs: number;
  request: PublicJsonRequest;
  resolve(result: PublicJsonResult): void;
  venue: TargetVenue;
};

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function failedResult(
  kind: "INVALID" | "RATE_LIMITED" | "TRANSPORT_ERROR" | "UNAVAILABLE",
  reasonCode: string,
  nowMs: number,
): PublicJsonResult {
  return {
    failure: { kind, reasonCode },
    ok: false,
    receivedAt: new Date(nowMs).toISOString(),
    status: null,
  };
}

export class CollectorRequestGovernor implements CollectorRequestControl {
  readonly #clock: CollectorClock;
  readonly #delegate: PublicJsonTransport;
  readonly #policy: CollectorRequestPolicy;
  readonly #activeByVenue = new Map<TargetVenue, number>();
  readonly #quotaByVenue = new Map<TargetVenue, QuotaState>();
  readonly #venueTelemetry = new Map<TargetVenue, MutableVenueTelemetry>();
  readonly #queue: QueuedRequest[] = [];
  #activeGlobal = 0;
  #cycleId = "collector-cycle-not-started";
  #maxGlobalConcurrencyObserved = 0;
  #maxQueueDepthObserved = 0;
  #maxQueueLagMs = 0;
  #queueRejected = 0;
  #requestsCompleted = 0;
  #requestsStarted = 0;
  #totalQueueLagMs = 0;

  constructor(input: {
    clock: CollectorClock;
    delegate: PublicJsonTransport;
    policy: CollectorRequestPolicy;
  }) {
    if (
      typeof input.clock?.now !== "function" ||
      typeof input.delegate !== "function" ||
      !positiveSafeInteger(input.policy.globalMaxConcurrentRequests) ||
      !positiveSafeInteger(input.policy.maxQueueDepth) ||
      !positiveSafeInteger(input.policy.maxQueueWaitMs) ||
      TARGET_VENUES.some((venue) => {
        const budget = input.policy.providerBudgets[venue];
        return budget === undefined ||
          !positiveSafeInteger(budget.maxConcurrentRequests) ||
          !positiveSafeInteger(budget.maxRequestsPerWindow) ||
          !positiveSafeInteger(budget.windowMs);
      })
    ) {
      throw new CollectorRuntimeError(
        "INVALID_CONFIGURATION",
        "collector request policy requires positive safe integer limits",
      );
    }
    this.#clock = input.clock;
    this.#delegate = input.delegate;
    this.#policy = input.policy;
    for (const venue of TARGET_VENUES) {
      this.#activeByVenue.set(venue, 0);
      this.#quotaByVenue.set(venue, {
        used: 0,
        windowStartedAtMs: this.#nowMs(),
      });
      this.#venueTelemetry.set(venue, {
        maxConcurrentObserved: 0,
        quotaRejected: 0,
        requestsCompleted: 0,
        requestsStarted: 0,
      });
    }
  }

  beginCycle(cycleId: string): void {
    if (this.#activeGlobal !== 0 || this.#queue.length !== 0) {
      throw new CollectorRuntimeError(
        "CYCLE_ALREADY_RUNNING",
        "request telemetry cannot reset while provider work is in flight",
      );
    }
    if (cycleId.trim() === "") {
      throw new CollectorRuntimeError(
        "INVALID_CONFIGURATION",
        "collector cycle id cannot be empty",
      );
    }
    this.#cycleId = cycleId;
    this.#maxGlobalConcurrencyObserved = 0;
    this.#maxQueueDepthObserved = 0;
    this.#maxQueueLagMs = 0;
    this.#queueRejected = 0;
    this.#requestsCompleted = 0;
    this.#requestsStarted = 0;
    this.#totalQueueLagMs = 0;
    for (const venue of TARGET_VENUES) {
      this.#venueTelemetry.set(venue, {
        maxConcurrentObserved: 0,
        quotaRejected: 0,
        requestsCompleted: 0,
        requestsStarted: 0,
      });
    }
  }

  transportFor(venue: TargetVenue): PublicJsonTransport {
    return async (request) => this.#submit(venue, request);
  }

  snapshot(): CollectorRequestTelemetry {
    return deepFreezeArtifact({
      activeRequests: this.#activeGlobal,
      cycleId: this.#cycleId,
      maxGlobalConcurrencyObserved: this.#maxGlobalConcurrencyObserved,
      maxQueueDepthObserved: this.#maxQueueDepthObserved,
      maxQueueLagMs: this.#maxQueueLagMs,
      queueDepth: this.#queue.length,
      queueRejected: this.#queueRejected,
      requestsCompleted: this.#requestsCompleted,
      requestsStarted: this.#requestsStarted,
      totalQueueLagMs: this.#totalQueueLagMs,
      venues: TARGET_VENUES.map((venue) => {
        const telemetry = this.#venueTelemetry.get(venue)!;
        const budget = this.#policy.providerBudgets[venue];
        return {
          activeRequests: this.#activeByVenue.get(venue) ?? 0,
          maxConcurrentObserved: telemetry.maxConcurrentObserved,
          quotaLimit: budget.maxRequestsPerWindow,
          quotaRejected: telemetry.quotaRejected,
          requestsCompleted: telemetry.requestsCompleted,
          requestsStarted: telemetry.requestsStarted,
          venue,
          windowMs: budget.windowMs,
        };
      }),
    });
  }

  async #submit(
    venue: TargetVenue,
    request: PublicJsonRequest,
  ): Promise<PublicJsonResult> {
    const nowMs = this.#nowMs();
    if (request.allowedHost !== VENUE_HOSTS[venue]) {
      return failedResult(
        "INVALID",
        "collector_adapter_host_mismatch",
        nowMs,
      );
    }
    if (!this.#hasCapacity(venue) && this.#queue.length >= this.#policy.maxQueueDepth) {
      this.#queueRejected += 1;
      return failedResult(
        "UNAVAILABLE",
        "collector_backpressure_queue_full",
        nowMs,
      );
    }
    if (!this.#reserveQuota(venue, nowMs)) {
      this.#venueTelemetry.get(venue)!.quotaRejected += 1;
      return failedResult(
        "RATE_LIMITED",
        "collector_provider_quota_exhausted",
        nowMs,
      );
    }
    if (this.#hasCapacity(venue)) {
      return this.#execute(venue, request, 0);
    }
    return new Promise<PublicJsonResult>((resolve) => {
      this.#queue.push({ enqueuedAtMs: nowMs, request, resolve, venue });
      this.#maxQueueDepthObserved = Math.max(
        this.#maxQueueDepthObserved,
        this.#queue.length,
      );
    });
  }

  #reserveQuota(venue: TargetVenue, nowMs: number): boolean {
    const budget = this.#policy.providerBudgets[venue];
    const quota = this.#quotaByVenue.get(venue)!;
    if (
      nowMs < quota.windowStartedAtMs ||
      nowMs - quota.windowStartedAtMs >= budget.windowMs
    ) {
      quota.windowStartedAtMs = nowMs;
      quota.used = 0;
    }
    if (quota.used >= budget.maxRequestsPerWindow) {
      return false;
    }
    quota.used += 1;
    return true;
  }

  #hasCapacity(venue: TargetVenue): boolean {
    return this.#activeGlobal < this.#policy.globalMaxConcurrentRequests &&
      (this.#activeByVenue.get(venue) ?? 0) <
        this.#policy.providerBudgets[venue].maxConcurrentRequests;
  }

  async #execute(
    venue: TargetVenue,
    request: PublicJsonRequest,
    queueLagMs: number,
  ): Promise<PublicJsonResult> {
    this.#activeGlobal += 1;
    this.#activeByVenue.set(venue, (this.#activeByVenue.get(venue) ?? 0) + 1);
    this.#requestsStarted += 1;
    const venueTelemetry = this.#venueTelemetry.get(venue)!;
    venueTelemetry.requestsStarted += 1;
    venueTelemetry.maxConcurrentObserved = Math.max(
      venueTelemetry.maxConcurrentObserved,
      this.#activeByVenue.get(venue)!,
    );
    this.#maxGlobalConcurrencyObserved = Math.max(
      this.#maxGlobalConcurrencyObserved,
      this.#activeGlobal,
    );
    this.#maxQueueLagMs = Math.max(this.#maxQueueLagMs, queueLagMs);
    this.#totalQueueLagMs += queueLagMs;

    try {
      return await this.#delegate(request);
    } catch {
      return failedResult(
        "TRANSPORT_ERROR",
        "collector_transport_threw",
        this.#nowMs(),
      );
    } finally {
      this.#activeGlobal -= 1;
      this.#activeByVenue.set(venue, this.#activeByVenue.get(venue)! - 1);
      this.#requestsCompleted += 1;
      venueTelemetry.requestsCompleted += 1;
      this.#drain();
    }
  }

  #drain(): void {
    while (this.#activeGlobal < this.#policy.globalMaxConcurrentRequests) {
      const index = this.#queue.findIndex((entry) => this.#hasCapacity(entry.venue));
      if (index < 0) {
        return;
      }
      const [entry] = this.#queue.splice(index, 1);
      if (entry === undefined) {
        return;
      }
      const queueLagMs = Math.max(0, this.#nowMs() - entry.enqueuedAtMs);
      if (queueLagMs > this.#policy.maxQueueWaitMs) {
        this.#maxQueueLagMs = Math.max(this.#maxQueueLagMs, queueLagMs);
        this.#totalQueueLagMs += queueLagMs;
        this.#queueRejected += 1;
        entry.resolve(failedResult(
          "UNAVAILABLE",
          "collector_backpressure_queue_timeout",
          this.#nowMs(),
        ));
        continue;
      }
      void this.#execute(entry.venue, entry.request, queueLagMs)
        .then(entry.resolve);
    }
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
