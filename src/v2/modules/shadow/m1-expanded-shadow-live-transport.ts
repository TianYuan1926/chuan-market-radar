import {
  M1ExpandedShadowProviderPlanSchema,
  type M1ExpandedShadowProviderPlan,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  M1ShadowJsonFrameError,
  parseM1ShadowLosslessJsonFrame,
} from "./m1-shadow-lossless-json";

type ConnectionPlan = M1ExpandedShadowProviderPlan["connections"][number];
export type M1ShadowConnectionRole = ConnectionPlan["role"];

export type M1ShadowTransportFrame = Readonly<{
  role: M1ShadowConnectionRole;
  payload: unknown;
  receivedAt: string;
  rawFrameBytes: number;
  transportKind: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
  subjectId?: string;
  restRequestId?: string;
}>;

export type M1ShadowTransportFailure = Readonly<{
  role: M1ShadowConnectionRole;
  reasonCode: string;
  rawFrameBytes: number;
  droppedEventCount: number;
}>;

export type M1ShadowConnectionCycleEvidence = Readonly<{
  role: M1ShadowConnectionRole;
  attemptObserved: boolean;
  heartbeatObserved: boolean;
  networkEgressBytes: number;
  reasonCodes: readonly string[];
}>;

export type M1ShadowRestSnapshotCapture = Readonly<{
  requestId: string;
  responseObserved: boolean;
  networkEgressBytes: number;
  frame: M1ShadowTransportFrame | null;
  failureReasonCode: string | null;
}>;

type WebSocketEventName = "open" | "message" | "error" | "close";
type WebSocketEvent = Readonly<{
  data?: unknown;
  code?: number;
  reason?: string;
}>;

export type M1ShadowWebSocketLike = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  addEventListener(
    name: WebSocketEventName,
    listener: (event: WebSocketEvent) => void,
  ): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

export type M1ShadowWebSocketFactory = (
  url: string,
) => M1ShadowWebSocketLike;

export type M1ShadowFetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
};

export type M1ShadowFetch = (
  url: string,
  init: RequestInit,
) => Promise<M1ShadowFetchResponse>;

export type M1ExpandedShadowLiveTransportOptions = Readonly<{
  webSocketFactory?: M1ShadowWebSocketFactory;
  fetch?: M1ShadowFetch;
  now?: () => number;
  connectionTimeoutMs?: number;
  restTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaximumMs?: number;
  maximumQueuedFrames?: number;
  maximumQueuedBytes?: number;
  maximumFrameBytes?: number;
}>;

type MutableConnectionState = {
  plan: ConnectionPlan;
  socket: M1ShadowWebSocketLike | null;
  open: boolean;
  openAttemptCount: number;
  consecutiveFailureCount: number;
  lastMessageAtMs: number | null;
  lastFailureReason: string | null;
  pendingEgressBytes: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setTimeout> | null;
};

type MutableFailure = {
  rawFrameBytes: number;
  droppedEventCount: number;
};

const OPEN_STATE = 1;
const NORMAL_CLOSE_CODE = 1_000;
const NORMAL_CLOSE_REASON = "m1-shadow-transport-stop";

function positiveSafeInteger(
  value: number,
  reason: string,
): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(reason);
  return value;
}

function nonNegativeSafeInteger(
  value: number,
  reason: string,
): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(reason);
  return value;
}

function exactHost(urlValue: string, expectedHost: string): URL {
  const url = new URL(urlValue);
  if (
    url.protocol !== "wss:" && url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("shadow_transport_endpoint_boundary_rejected");
  }
  return url;
}

function defaultWebSocketFactory(url: string): M1ShadowWebSocketLike {
  if (typeof WebSocket !== "function") {
    throw new Error("shadow_transport_global_websocket_unavailable");
  }
  return new WebSocket(url) as unknown as M1ShadowWebSocketLike;
}

function defaultFetch(
  url: string,
  init: RequestInit,
): Promise<M1ShadowFetchResponse> {
  if (typeof fetch !== "function") {
    throw new Error("shadow_transport_global_fetch_unavailable");
  }
  return fetch(url, init);
}

function rawText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString("utf8");
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).toString("utf8");
  }
  return null;
}

function decodeProviderFrame(raw: string): unknown {
  if (raw === "ping" || raw === "pong") return raw;
  return parseM1ShadowLosslessJsonFrame(raw);
}

function roleOrder(
  plan: M1ExpandedShadowProviderPlan,
): Map<M1ShadowConnectionRole, number> {
  return new Map(
    plan.connections.map((connection, index) => [connection.role, index]),
  );
}

export class M1ExpandedShadowLiveTransport {
  readonly #plan: M1ExpandedShadowProviderPlan;
  readonly #webSocketFactory: M1ShadowWebSocketFactory;
  readonly #fetch: M1ShadowFetch;
  readonly #now: () => number;
  readonly #connectionTimeoutMs: number;
  readonly #restTimeoutMs: number;
  readonly #reconnectBaseMs: number;
  readonly #reconnectMaximumMs: number;
  readonly #maximumQueuedFrames: number;
  readonly #maximumQueuedBytes: number;
  readonly #maximumFrameBytes: number;
  readonly #connections =
    new Map<M1ShadowConnectionRole, MutableConnectionState>();
  readonly #failures =
    new Map<string, MutableFailure>();
  #queuedFrames: M1ShadowTransportFrame[] = [];
  #queuedBytes = 0;
  #captureStartsAtMs: number | null = null;
  #captureEndsAtMs: number | null = null;
  #started = false;
  #starting = false;
  #stopping = false;

  constructor(
    providerPlan: M1ExpandedShadowProviderPlan,
    options: M1ExpandedShadowLiveTransportOptions = {},
  ) {
    this.#plan = M1ExpandedShadowProviderPlanSchema.parse(providerPlan);
    this.#webSocketFactory =
      options.webSocketFactory ?? defaultWebSocketFactory;
    this.#fetch = options.fetch ?? defaultFetch;
    this.#now = options.now ?? Date.now;
    this.#connectionTimeoutMs = positiveSafeInteger(
      options.connectionTimeoutMs ?? 10_000,
      "shadow_transport_connection_timeout_invalid",
    );
    this.#restTimeoutMs = positiveSafeInteger(
      options.restTimeoutMs ?? 5_000,
      "shadow_transport_rest_timeout_invalid",
    );
    this.#reconnectBaseMs = positiveSafeInteger(
      options.reconnectBaseMs ?? 1_000,
      "shadow_transport_reconnect_base_invalid",
    );
    this.#reconnectMaximumMs = positiveSafeInteger(
      options.reconnectMaximumMs ?? 30_000,
      "shadow_transport_reconnect_maximum_invalid",
    );
    if (this.#reconnectBaseMs > this.#reconnectMaximumMs) {
      throw new Error("shadow_transport_reconnect_range_invalid");
    }
    this.#maximumQueuedFrames = positiveSafeInteger(
      options.maximumQueuedFrames ?? 100_000,
      "shadow_transport_queue_count_invalid",
    );
    this.#maximumQueuedBytes = positiveSafeInteger(
      options.maximumQueuedBytes ?? 128 * 1024 * 1024,
      "shadow_transport_queue_bytes_invalid",
    );
    this.#maximumFrameBytes = positiveSafeInteger(
      options.maximumFrameBytes ?? 2 * 1024 * 1024,
      "shadow_transport_frame_bytes_invalid",
    );
    for (const connection of this.#plan.connections) {
      exactHost(connection.url, connection.allowedHost);
      this.#connections.set(connection.role, {
        plan: connection,
        socket: null,
        open: false,
        openAttemptCount: 0,
        consecutiveFailureCount: 0,
        lastMessageAtMs: null,
        lastFailureReason: null,
        pendingEgressBytes: 0,
        reconnectTimer: null,
        heartbeatTimer: null,
      });
    }
    for (const request of this.#plan.restSnapshots) {
      exactHost(request.url, request.allowedHost);
    }
  }

  get providerPlan(): M1ExpandedShadowProviderPlan {
    return this.#plan;
  }

  setCaptureWindow(input: {
    readonly startsAt: string;
    readonly endsAt: string;
  }): void {
    const startsAtMs = Date.parse(input.startsAt);
    const endsAtMs = Date.parse(input.endsAt);
    if (
      !Number.isFinite(startsAtMs) ||
      !Number.isFinite(endsAtMs) ||
      startsAtMs >= endsAtMs
    ) {
      throw new Error("shadow_transport_capture_window_invalid");
    }
    this.#captureStartsAtMs = startsAtMs;
    this.#captureEndsAtMs = endsAtMs;
    this.#queuedFrames = [];
    this.#queuedBytes = 0;
  }

  clearCaptureWindow(): void {
    this.#captureStartsAtMs = null;
    this.#captureEndsAtMs = null;
    this.#queuedFrames = [];
    this.#queuedBytes = 0;
  }

  #captureActive(receivedAtMs: number): boolean {
    return this.#captureStartsAtMs !== null &&
      this.#captureEndsAtMs !== null &&
      receivedAtMs >= this.#captureStartsAtMs &&
      receivedAtMs <= this.#captureEndsAtMs;
  }

  #recordFailure(
    role: M1ShadowConnectionRole,
    reasonCode: string,
    rawFrameBytes: number,
    droppedEventCount: number,
  ): void {
    const key = `${role}|${reasonCode}`;
    const prior = this.#failures.get(key) ?? {
      rawFrameBytes: 0,
      droppedEventCount: 0,
    };
    prior.rawFrameBytes += nonNegativeSafeInteger(
      rawFrameBytes,
      "shadow_transport_failure_bytes_invalid",
    );
    prior.droppedEventCount += nonNegativeSafeInteger(
      droppedEventCount,
      "shadow_transport_failure_count_invalid",
    );
    this.#failures.set(key, prior);
  }

  #enqueue(
    role: M1ShadowConnectionRole,
    raw: string,
    receivedAtMs: number,
  ): void {
    const rawFrameBytes = Buffer.byteLength(raw, "utf8");
    const state = this.#connections.get(role)!;
    state.lastMessageAtMs = receivedAtMs;
    if (!this.#captureActive(receivedAtMs)) return;
    if (rawFrameBytes > this.#maximumFrameBytes) {
      this.#recordFailure(
        role,
        "transport_frame_size_limit_exceeded",
        rawFrameBytes,
        1,
      );
      return;
    }
    let payload: unknown;
    try {
      payload = decodeProviderFrame(raw);
    } catch (error) {
      this.#recordFailure(
        role,
        error instanceof M1ShadowJsonFrameError
          ? "transport_lossless_json_decode_failed"
          : "transport_frame_decode_failed",
        rawFrameBytes,
        1,
      );
      return;
    }
    if (
      this.#queuedFrames.length >= this.#maximumQueuedFrames ||
      this.#queuedBytes + rawFrameBytes > this.#maximumQueuedBytes
    ) {
      this.#recordFailure(
        role,
        "transport_bounded_queue_overflow",
        rawFrameBytes,
        1,
      );
      return;
    }
    this.#queuedFrames.push({
      role,
      payload,
      receivedAt: new Date(receivedAtMs).toISOString(),
      rawFrameBytes,
      transportKind: "WEBSOCKET_MESSAGE",
    });
    this.#queuedBytes += rawFrameBytes;
  }

  #scheduleHeartbeat(state: MutableConnectionState): void {
    if (
      this.#stopping ||
      !state.open ||
      state.plan.heartbeatMode === "PROTOCOL_PING_PONG"
    ) return;
    if (state.heartbeatTimer !== null) clearTimeout(state.heartbeatTimer);
    state.heartbeatTimer = setTimeout(() => {
      state.heartbeatTimer = null;
      if (!state.open || state.socket?.readyState !== OPEN_STATE) return;
      const body = state.plan.heartbeatMode === "TEXT_PING_PONG"
        ? "ping"
        : JSON.stringify({ op: "ping" });
      try {
        state.socket.send(body);
        state.pendingEgressBytes += Buffer.byteLength(body, "utf8");
      } catch {
        state.lastFailureReason = "websocket_heartbeat_send_failed";
        try {
          state.socket.close();
        } catch {
          // The connection state remains unavailable and will reconnect.
        }
      }
      this.#scheduleHeartbeat(state);
    }, state.plan.heartbeatIntervalMs);
    state.heartbeatTimer.unref?.();
  }

  #scheduleReconnect(state: MutableConnectionState): void {
    if (this.#stopping || !this.#started || state.reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(
      this.#reconnectMaximumMs,
      this.#reconnectBaseMs *
        2 ** Math.min(state.consecutiveFailureCount, 10),
    );
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      void this.#connect(state).catch(() => {
        this.#scheduleReconnect(state);
      });
    }, delay);
    state.reconnectTimer.unref?.();
  }

  #connect(state: MutableConnectionState): Promise<void> {
    state.openAttemptCount += 1;
    state.lastFailureReason = null;
    const socket = this.#webSocketFactory(state.plan.url);
    state.socket = socket;
    return new Promise((resolve, reject) => {
      let settled = false;
      let failureCounted = false;
      const countFailure = () => {
        if (failureCounted || this.#stopping) return;
        failureCounted = true;
        state.consecutiveFailureCount += 1;
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        state.lastFailureReason = "websocket_open_timeout";
        countFailure();
        try {
          socket.close();
        } catch {
          // Reconnect state is handled below.
        }
        reject(new Error("shadow_transport_websocket_open_timeout"));
      }, this.#connectionTimeoutMs);
      timeout.unref?.();
      socket.addEventListener("open", () => {
        if (settled || this.#stopping) return;
        try {
          for (const frame of state.plan.subscriptionFrames) {
            const body = JSON.stringify(frame.body);
            socket.send(body);
            state.pendingEgressBytes += Buffer.byteLength(body, "utf8");
          }
        } catch {
          settled = true;
          clearTimeout(timeout);
          state.lastFailureReason = "websocket_subscription_send_failed";
          countFailure();
          reject(new Error("shadow_transport_subscription_send_failed"));
          return;
        }
        settled = true;
        clearTimeout(timeout);
        state.open = true;
        state.consecutiveFailureCount = 0;
        state.lastFailureReason = null;
        this.#scheduleHeartbeat(state);
        resolve();
      });
      socket.addEventListener("message", (event) => {
        const text = rawText(event.data);
        if (text === null) {
          this.#recordFailure(
            state.plan.role,
            "transport_non_text_frame_rejected",
            0,
            1,
          );
          return;
        }
        this.#enqueue(state.plan.role, text, this.#now());
      });
      socket.addEventListener("error", () => {
        state.lastFailureReason = "websocket_transport_error";
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          countFailure();
          reject(new Error("shadow_transport_websocket_error"));
        }
      });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        state.open = false;
        state.socket = null;
        if (state.heartbeatTimer !== null) {
          clearTimeout(state.heartbeatTimer);
          state.heartbeatTimer = null;
        }
        if (!settled) {
          settled = true;
          state.lastFailureReason = this.#stopping
            ? "websocket_start_stopped"
            : "websocket_connection_closed";
          reject(new Error(
            this.#stopping
              ? "shadow_transport_start_stopped"
              : "shadow_transport_websocket_closed",
          ));
        }
        if (!this.#stopping) {
          state.lastFailureReason ??= "websocket_connection_closed";
          countFailure();
          this.#scheduleReconnect(state);
        }
      });
    });
  }

  async start(): Promise<void> {
    if (this.#started || this.#starting) {
      throw new Error("shadow_transport_already_started");
    }
    this.#starting = true;
    this.#stopping = false;
    try {
      await Promise.all(
        [...this.#connections.values()].map((state) => this.#connect(state)),
      );
      this.#started = true;
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.#starting = false;
    }
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#started = false;
    for (const state of this.#connections.values()) {
      if (state.reconnectTimer !== null) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      if (state.heartbeatTimer !== null) {
        clearTimeout(state.heartbeatTimer);
        state.heartbeatTimer = null;
      }
      if (state.socket !== null) {
        try {
          state.socket.close(NORMAL_CLOSE_CODE, NORMAL_CLOSE_REASON);
        } catch {
          // Stop is best effort; state is still made unavailable below.
        }
      }
      state.socket = null;
      state.open = false;
    }
    this.clearCaptureWindow();
  }

  drainFrames(cutoffAt: string): readonly M1ShadowTransportFrame[] {
    const cutoffMs = Date.parse(cutoffAt);
    if (!Number.isFinite(cutoffMs)) {
      throw new Error("shadow_transport_drain_cutoff_invalid");
    }
    const drained: M1ShadowTransportFrame[] = [];
    const retained: M1ShadowTransportFrame[] = [];
    let retainedBytes = 0;
    for (const frame of this.#queuedFrames) {
      if (Date.parse(frame.receivedAt) <= cutoffMs) {
        drained.push(frame);
      } else {
        retained.push(frame);
        retainedBytes += frame.rawFrameBytes;
      }
    }
    this.#queuedFrames = retained;
    this.#queuedBytes = retainedBytes;
    return drained;
  }

  consumeTransportFailures(): readonly M1ShadowTransportFailure[] {
    const failures = [...this.#failures.entries()].map(([key, value]) => {
      const separator = key.indexOf("|");
      return {
        role: key.slice(0, separator) as M1ShadowConnectionRole,
        reasonCode: key.slice(separator + 1),
        rawFrameBytes: value.rawFrameBytes,
        droppedEventCount: value.droppedEventCount,
      };
    }).sort((left, right) =>
      left.role.localeCompare(right.role) ||
      left.reasonCode.localeCompare(right.reasonCode)
    );
    this.#failures.clear();
    return failures;
  }

  consumeConnectionCycleEvidence(
    evaluatedAt: string,
  ): readonly M1ShadowConnectionCycleEvidence[] {
    const evaluatedAtMs = Date.parse(evaluatedAt);
    if (!Number.isFinite(evaluatedAtMs)) {
      throw new Error("shadow_transport_health_time_invalid");
    }
    const order = roleOrder(this.#plan);
    return [...this.#connections.values()].map((state) => {
      const maximumHeartbeatAgeMs = Math.max(
        30_000,
        state.plan.heartbeatIntervalMs * 2,
      );
      const heartbeatAgeMs = state.lastMessageAtMs === null
        ? null
        : evaluatedAtMs - state.lastMessageAtMs;
      const heartbeatObserved = state.open &&
        heartbeatAgeMs !== null &&
        heartbeatAgeMs >= 0 &&
        heartbeatAgeMs <= maximumHeartbeatAgeMs;
      const reasons = [
        ...(!state.open ? ["websocket_connection_unavailable"] : []),
        ...(heartbeatAgeMs !== null && heartbeatAgeMs < 0
          ? ["websocket_message_time_after_evaluation"]
          : []),
        ...(state.lastFailureReason === null
          ? []
          : [state.lastFailureReason]),
      ];
      const evidence = {
        role: state.plan.role,
        attemptObserved: state.openAttemptCount > 0,
        heartbeatObserved,
        networkEgressBytes: state.pendingEgressBytes,
        reasonCodes: [...new Set(reasons)].sort(),
      };
      state.pendingEgressBytes = 0;
      return evidence;
    }).sort((left, right) =>
      order.get(left.role)! - order.get(right.role)!
    );
  }

  async captureRestSnapshots(): Promise<
    readonly M1ShadowRestSnapshotCapture[]
  > {
    return Promise.all(this.#plan.restSnapshots.map(async (request) => {
      const url = exactHost(request.url, request.allowedHost);
      const networkEgressBytes = Buffer.byteLength(
        `GET ${url.pathname}${url.search}`,
        "utf8",
      );
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.#restTimeoutMs,
      );
      timeout.unref?.();
      try {
        const response = await this.#fetch(request.url, {
          method: "GET",
          headers: { accept: "application/json" },
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          return {
            requestId: request.requestId,
            responseObserved: true,
            networkEgressBytes,
            frame: null,
            failureReasonCode: `rest_snapshot_http_${response.status}`,
          };
        }
        const raw = await response.text();
        const rawFrameBytes = Buffer.byteLength(raw, "utf8");
        if (rawFrameBytes > this.#maximumFrameBytes) {
          return {
            requestId: request.requestId,
            responseObserved: true,
            networkEgressBytes,
            frame: null,
            failureReasonCode: "rest_snapshot_frame_size_limit_exceeded",
          };
        }
        const payload = decodeProviderFrame(raw);
        return {
          requestId: request.requestId,
          responseObserved: true,
          networkEgressBytes,
          frame: {
            role: "BINANCE_PUBLIC_HIGH_FREQUENCY",
            payload,
            receivedAt: new Date(this.#now()).toISOString(),
            rawFrameBytes,
            transportKind: "REST_SNAPSHOT",
            subjectId: request.subjectId,
            restRequestId: request.requestId,
          },
          failureReasonCode: null,
        };
      } catch (error) {
        return {
          requestId: request.requestId,
          responseObserved: false,
          networkEgressBytes,
          frame: null,
          failureReasonCode: error instanceof M1ShadowJsonFrameError
            ? "rest_snapshot_lossless_json_decode_failed"
            : controller.signal.aborted
              ? "rest_snapshot_timeout"
              : "rest_snapshot_request_failed",
        };
      } finally {
        clearTimeout(timeout);
      }
    }));
  }
}
