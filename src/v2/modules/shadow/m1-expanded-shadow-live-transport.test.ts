import assert from "node:assert/strict";
import test from "node:test";
import {
  buildM1ExpandedShadowProviderPlan,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderSubject,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import {
  M1ExpandedShadowLiveTransport,
  type M1ShadowFetch,
  type M1ShadowWebSocketFactory,
  type M1ShadowWebSocketLike,
} from "./m1-expanded-shadow-live-transport";

const RELEASE = "e".repeat(40);
const START_MS = Date.parse("2026-07-26T08:00:00.000Z");

const SUBJECTS: readonly M1ShadowProviderSubject[] = [
  {
    subjectId: "binance-trigger",
    venue: "BINANCE_FUTURES",
    venueInstrumentId: "BTCUSDT",
    transportSymbol: "BTCUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "binance-control",
    venue: "BINANCE_FUTURES",
    venueInstrumentId: "ETHUSDT",
    transportSymbol: "ETHUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "okx-trigger",
    venue: "OKX_SWAP",
    venueInstrumentId: "BTC-USDT-SWAP",
    transportSymbol: "BTC-USDT-SWAP",
    referenceInstrumentId: "BTC-USDT",
    instrumentFamily: "BTC-USDT",
    sizeUnit: "CONTRACT",
  },
  {
    subjectId: "okx-control",
    venue: "OKX_SWAP",
    venueInstrumentId: "ETH-USDT-SWAP",
    transportSymbol: "ETH-USDT-SWAP",
    referenceInstrumentId: "ETH-USDT",
    instrumentFamily: "ETH-USDT",
    sizeUnit: "CONTRACT",
  },
  {
    subjectId: "bybit-trigger",
    venue: "BYBIT_DERIVATIVES",
    venueInstrumentId: "SOLUSDT",
    transportSymbol: "SOLUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bybit-control",
    venue: "BYBIT_DERIVATIVES",
    venueInstrumentId: "XRPUSDT",
    transportSymbol: "XRPUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bitget-trigger",
    venue: "BITGET_FUTURES",
    venueInstrumentId: "DOGEUSDT",
    transportSymbol: "DOGEUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bitget-control",
    venue: "BITGET_FUTURES",
    venueInstrumentId: "ADAUSDT",
    transportSymbol: "ADAUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
];

function providerPlan(): M1ExpandedShadowProviderPlan {
  return buildM1ExpandedShadowProviderPlan({
    releaseId: RELEASE,
    generatedAt: "2026-07-26T07:59:00.000Z",
    subjects: SUBJECTS,
  });
}

type SocketEventName = "open" | "message" | "error" | "close";
type SocketEvent = Readonly<{
  data?: unknown;
  code?: number;
  reason?: string;
}>;

class FakeSocket implements M1ShadowWebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  readonly closeCalls: Array<{
    code?: number;
    reason?: string;
  }> = [];
  readonly #listeners = new Map<
    SocketEventName,
    Array<(event: SocketEvent) => void>
  >();

  constructor(
    readonly url: string,
    autoOpen: boolean,
  ) {
    if (autoOpen) queueMicrotask(() => this.emit("open"));
  }

  addEventListener(
    name: SocketEventName,
    listener: (event: SocketEvent) => void,
  ): void {
    const listeners = this.#listeners.get(name) ?? [];
    listeners.push(listener);
    this.#listeners.set(name, listeners);
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error("fake_socket_not_open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === 3) return;
    this.closeCalls.push({ code, reason });
    this.emit("close", { code, reason });
  }

  emit(name: SocketEventName, event: SocketEvent = {}): void {
    if (name === "open") this.readyState = 1;
    if (name === "close") this.readyState = 3;
    for (const listener of this.#listeners.get(name) ?? []) listener(event);
  }

  message(data: unknown): void {
    this.emit("message", { data });
  }
}

function socketHarness(autoOpen = true): {
  readonly sockets: FakeSocket[];
  readonly factory: M1ShadowWebSocketFactory;
} {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url) => {
      const socket = new FakeSocket(url, autoOpen);
      sockets.push(socket);
      return socket;
    },
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("fixture_wait_timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("live transport subscribes all roles and preserves unsafe integers", async () => {
  const plan = providerPlan();
  const harness = socketHarness();
  let now = START_MS + 1_000;
  const transport = new M1ExpandedShadowLiveTransport(plan, {
    webSocketFactory: harness.factory,
    now: () => now,
  });
  transport.setCaptureWindow({
    startsAt: new Date(START_MS).toISOString(),
    endsAt: new Date(START_MS + 60_000).toISOString(),
  });

  await transport.start();
  assert.equal(harness.sockets.length, plan.connections.length);
  for (const connection of plan.connections) {
    const socket = harness.sockets.find(
      (candidate) => candidate.url === connection.url,
    );
    assert.ok(socket);
    assert.deepEqual(
      socket.sent,
      connection.subscriptionFrames.map((frame) =>
        JSON.stringify(frame.body)
      ),
    );
  }

  const binance = harness.sockets.find((socket) =>
    socket.url.endsWith("/public/ws")
  )!;
  binance.message('{"u":9007199254740993,"s":"BTCUSDT"}');
  now = START_MS + 61_000;
  binance.message('{"u":2,"s":"BTCUSDT"}');
  const frames = transport.drainFrames(
    new Date(START_MS + 60_000).toISOString(),
  );
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0]!.payload, {
    u: "9007199254740993",
    s: "BTCUSDT",
  });

  const evidence = transport.consumeConnectionCycleEvidence(
    new Date(START_MS).toISOString(),
  );
  const binanceEvidence = evidence.find(
    (item) => item.role === "BINANCE_PUBLIC_HIGH_FREQUENCY",
  )!;
  assert.equal(binanceEvidence.attemptObserved, true);
  assert.equal(binanceEvidence.heartbeatObserved, false);
  assert.ok(
    binanceEvidence.reasonCodes.includes(
      "websocket_message_time_after_evaluation",
    ),
  );

  await transport.stop();
  assert.ok(
    harness.sockets.every((socket) =>
      socket.closeCalls.some((call) =>
        call.code === 1_000 &&
        call.reason === "m1-shadow-transport-stop"
      )
    ),
  );
});

test("live transport bounds frames and exposes every dropped denominator", async () => {
  const plan = providerPlan();
  const harness = socketHarness();
  const transport = new M1ExpandedShadowLiveTransport(plan, {
    webSocketFactory: harness.factory,
    now: () => START_MS + 1_000,
    maximumQueuedFrames: 1,
    maximumQueuedBytes: 64,
    maximumFrameBytes: 32,
  });
  transport.setCaptureWindow({
    startsAt: new Date(START_MS).toISOString(),
    endsAt: new Date(START_MS + 60_000).toISOString(),
  });
  await transport.start();

  const socket = harness.sockets[0]!;
  socket.message('{"n":1}');
  socket.message('{"n":2}');
  socket.message('{"a":1,"a":2}');
  socket.message({ not: "text" });
  socket.message(JSON.stringify({ body: "x".repeat(64) }));

  const failures = transport.consumeTransportFailures();
  assert.deepEqual(
    failures.map((failure) => failure.reasonCode).sort(),
    [
      "transport_bounded_queue_overflow",
      "transport_frame_size_limit_exceeded",
      "transport_lossless_json_decode_failed",
      "transport_non_text_frame_rejected",
    ],
  );
  assert.equal(
    failures.reduce(
      (total, failure) => total + failure.droppedEventCount,
      0,
    ),
    4,
  );
  await transport.stop();
});

test("REST snapshots enforce response, decode, HTTP and timeout truth", async () => {
  const plan = providerPlan();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const successfulFetch: M1ShadowFetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      async text() {
        return '{"lastUpdateId":9007199254740993,"bids":[],"asks":[]}';
      },
    };
  };
  const success = new M1ExpandedShadowLiveTransport(plan, {
    webSocketFactory: socketHarness(false).factory,
    fetch: successfulFetch,
    now: () => START_MS + 2_000,
  });
  const captures = await success.captureRestSnapshots();
  assert.equal(captures.length, 2);
  assert.ok(captures.every((capture) => capture.failureReasonCode === null));
  assert.ok(captures.every((capture) => capture.frame?.transportKind ===
    "REST_SNAPSHOT"));
  assert.equal(
    (captures[0]!.frame!.payload as { lastUpdateId: unknown }).lastUpdateId,
    "9007199254740993",
  );
  assert.ok(
    requests.every(({ url, init }) =>
      new URL(url).hostname === "fapi.binance.com" &&
      init.redirect === "error" &&
      init.credentials === "omit" &&
      init.cache === "no-store"
    ),
  );

  const httpFailure = new M1ExpandedShadowLiveTransport(plan, {
    webSocketFactory: socketHarness(false).factory,
    fetch: async () => ({
      ok: false,
      status: 429,
      async text() {
        return "";
      },
    }),
  });
  assert.ok(
    (await httpFailure.captureRestSnapshots()).every((capture) =>
      capture.responseObserved &&
      capture.failureReasonCode === "rest_snapshot_http_429"
    ),
  );

  const timeoutFetch: M1ShadowFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal!.addEventListener(
        "abort",
        () => reject(new Error("fixture_aborted")),
        { once: true },
      );
    });
  const timeout = new M1ExpandedShadowLiveTransport(plan, {
    webSocketFactory: socketHarness(false).factory,
    fetch: timeoutFetch,
    restTimeoutMs: 5,
  });
  assert.ok(
    (await timeout.captureRestSnapshots()).every((capture) =>
      !capture.responseObserved &&
      capture.failureReasonCode === "rest_snapshot_timeout"
    ),
  );
});

test("live transport rejects concurrent start and stop settles startup", async () => {
  const harness = socketHarness(false);
  const transport = new M1ExpandedShadowLiveTransport(providerPlan(), {
    webSocketFactory: harness.factory,
    connectionTimeoutMs: 5_000,
  });
  const firstStart = transport.start();
  await assert.rejects(
    transport.start(),
    /shadow_transport_already_started/u,
  );
  await transport.stop();
  await assert.rejects(firstStart, /shadow_transport_start_stopped/u);
  assert.equal(harness.sockets.length, 5);
});

test("live transport reconnects an established role with bounded backoff", async () => {
  const harness = socketHarness();
  const transport = new M1ExpandedShadowLiveTransport(providerPlan(), {
    webSocketFactory: harness.factory,
    reconnectBaseMs: 1,
    reconnectMaximumMs: 1,
  });
  await transport.start();
  const initialSocketCount = harness.sockets.length;
  harness.sockets[0]!.close(1_011, "fixture-reconnect");
  await waitFor(() => harness.sockets.length === initialSocketCount + 1);
  assert.equal(harness.sockets.at(-1)!.readyState, 1);
  await transport.stop();
});
