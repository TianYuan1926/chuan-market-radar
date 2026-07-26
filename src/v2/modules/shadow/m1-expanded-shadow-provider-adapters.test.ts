import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
  M1_EXPANDED_SHADOW_PROVIDER_PROFILES,
  M1ExpandedShadowProviderPlanSchema,
  M1ShadowProviderObservationSchema,
  buildM1ExpandedShadowProviderPlan,
  evaluateM1ShadowOrderBookSequence,
  parseM1ExpandedShadowProviderMessage,
  type M1ExpandedShadowProviderPlan,
  type M1ShadowProviderObservation,
  type M1ShadowProviderSubject,
} from "./adapters/m1-expanded-shadow-provider-adapters";
import { stableContentHash } from "../universe/stable-artifact";

const RELEASE = "c".repeat(40);
const RECEIVED_AT = "2026-07-26T08:00:01.000Z";

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
    venueInstrumentId: "BTCUSDT",
    transportSymbol: "BTCUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bybit-control",
    venue: "BYBIT_DERIVATIVES",
    venueInstrumentId: "ETHUSDT",
    transportSymbol: "ETHUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bitget-trigger",
    venue: "BITGET_FUTURES",
    venueInstrumentId: "BTCUSDT",
    transportSymbol: "BTCUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
  {
    subjectId: "bitget-control",
    venue: "BITGET_FUTURES",
    venueInstrumentId: "ETHUSDT",
    transportSymbol: "ETHUSDT",
    referenceInstrumentId: null,
    instrumentFamily: null,
    sizeUnit: "BASE_ASSET",
  },
];

function plan(): M1ExpandedShadowProviderPlan {
  return buildM1ExpandedShadowProviderPlan({
    releaseId: RELEASE,
    generatedAt: "2026-07-26T07:59:00.000Z",
    subjects: SUBJECTS,
  });
}

function resignProviderPlan(
  input: M1ExpandedShadowProviderPlan,
): M1ExpandedShadowProviderPlan {
  const mutable = structuredClone(input) as Record<string, unknown>;
  delete mutable.planId;
  delete mutable.contentHash;
  const contentHash = stableContentHash(mutable);
  return {
    ...mutable,
    planId: `m1-shadow-provider-plan:${contentHash.slice(7, 31)}`,
    contentHash,
  } as M1ExpandedShadowProviderPlan;
}

function parse(
  providerPlan: M1ExpandedShadowProviderPlan,
  venue: M1ShadowProviderSubject["venue"],
  payload: unknown,
  extra: {
    transportKind?: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
    subjectId?: string;
  } = {},
) {
  return parseM1ExpandedShadowProviderMessage({
    plan: providerPlan,
    venue,
    payload,
    receivedAt: RECEIVED_AT,
    ...extra,
  });
}

function onlyObservation(
  providerPlan: M1ExpandedShadowProviderPlan,
  venue: M1ShadowProviderSubject["venue"],
  payload: unknown,
  extra: {
    transportKind?: "WEBSOCKET_MESSAGE" | "REST_SNAPSHOT";
    subjectId?: string;
  } = {},
): M1ShadowProviderObservation {
  const result = parse(providerPlan, venue, payload, extra);
  assert.equal(result.status, "DATA");
  assert.equal(result.observations.length, 1);
  return result.observations[0]!;
}

test("provider plan is deterministic, four-Venue, public-only and exact-host bounded", () => {
  const first = plan();
  const second = plan();
  assert.deepEqual(first, second);
  assert.equal(
    first.providerProfileDigest,
    M1_EXPANDED_SHADOW_PROVIDER_PROFILE_DIGEST,
  );
  assert.equal(first.connections.length, 5);
  assert.deepEqual(first.allowedHosts, [
    "fapi.binance.com",
    "fstream.binance.com",
    "stream.bybit.com",
    "ws.bitget.com",
    "ws.okx.com",
  ]);
  assert.equal(first.credentialsRequired, false);
  assert.equal(first.rawBodyRetentionAllowed, false);
  assert.equal(first.automaticTradingAllowed, false);
  assert.equal(first.restSnapshots.length, 2);
  assert.ok(
    first.connections.some((item) =>
      item.url === "wss://ws.bitget.com/v3/ws/public"
    ),
  );
  assert.ok(
    first.connections.every((item) =>
      !item.url.includes("/private") && !item.url.includes("apiKey")
    ),
  );
  assert.equal(
    M1ExpandedShadowProviderPlanSchema.parse(first).contentHash,
    first.contentHash,
  );
});

test("provider plan rejects missing venue denominator and inferred OKX reference identity", () => {
  assert.throws(
    () =>
      buildM1ExpandedShadowProviderPlan({
        releaseId: RELEASE,
        generatedAt: "2026-07-26T07:59:00.000Z",
        subjects: SUBJECTS.filter(
          (subject) => subject.venue !== "BITGET_FUTURES",
        ),
      }),
    /requires trigger and control/u,
  );
  assert.throws(
    () =>
      buildM1ExpandedShadowProviderPlan({
        releaseId: RELEASE,
        generatedAt: "2026-07-26T07:59:00.000Z",
        subjects: SUBJECTS.map((subject) =>
          subject.subjectId === "okx-trigger"
            ? { ...subject, referenceInstrumentId: null }
            : subject
        ),
      }),
    /OKX requires explicit point-in-time index/u,
  );
});

test("provider plan rejects re-signed endpoint, role and REST boundary drift", () => {
  const endpointDrift = structuredClone(plan());
  endpointDrift.connections[0]!.url = "wss://capture.invalid/ws";
  endpointDrift.connections[0]!.allowedHost = "capture.invalid";
  endpointDrift.allowedHosts[1] = "capture.invalid";
  assert.throws(
    () =>
      M1ExpandedShadowProviderPlanSchema.parse(
        resignProviderPlan(endpointDrift),
      ),
    /host allowlist drifted|endpoint boundary drifted/u,
  );

  const roleDrift = structuredClone(plan());
  roleDrift.connections[0]!.role = roleDrift.connections[1]!.role;
  assert.throws(
    () =>
      M1ExpandedShadowProviderPlanSchema.parse(
        resignProviderPlan(roleDrift),
      ),
    /connection role denominator drifted/u,
  );

  const restDrift = structuredClone(plan());
  restDrift.restSnapshots[0]!.url =
    "https://fapi.binance.com/fapi/v1/depth?symbol=ETHUSDT&limit=5";
  assert.throws(
    () =>
      M1ExpandedShadowProviderPlanSchema.parse(
        resignProviderPlan(restDrift),
      ),
    /REST snapshot endpoint boundary drifted/u,
  );
});

test("provider profiles preserve current routed endpoints, source epochs and sampled-feed truth", () => {
  const profiles = M1_EXPANDED_SHADOW_PROVIDER_PROFILES;
  assert.equal(
    profiles.venues.BINANCE_FUTURES.websocketEndpoints.market.url,
    "wss://fstream.binance.com/market/ws",
  );
  assert.equal(
    profiles.venues.BITGET_FUTURES.channels.LIQUIDATION_EVENT.completeness,
    "PROVIDER_SAMPLED_MAX_SIDE_PER_SECOND",
  );
  assert.equal(
    profiles.venues.OKX_SWAP.channels.LIQUIDATION_EVENT.completeness,
    "PROVIDER_SAMPLED_LIQUIDATION_FEED",
  );
  assert.equal(
    profiles.venues.BYBIT_DERIVATIVES.channels.ORDER_BOOK_DELTA
      .sequenceAssurance,
    "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
  );
  assert.match(
    profiles.venues.BITGET_FUTURES.jsonIntegerPolicy,
    /LOSSLESS_INTEGER_DECODE_REQUIRED/u,
  );
  assert.ok(
    JSON.stringify(profiles).includes("officialDocumentation"),
  );
  assert.ok(!JSON.stringify(profiles).includes("kline_"));
});

test("Binance parser covers all six families and both raw and combined bookTicker shapes", () => {
  const providerPlan = plan();
  const trade = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "aggTrade",
    E: 1_753_516_800_100,
    s: "BTCUSDT",
    a: 12345,
    p: "118000.5",
    q: "0.25",
    f: 100,
    l: 105,
    T: 1_753_516_800_090,
    m: true,
  });
  assert.equal(trade.factType, "PUBLIC_TRADE");
  assert.equal(trade.payload.kind, "PUBLIC_TRADE");
  assert.equal(
    trade.payload.kind === "PUBLIC_TRADE"
      ? trade.payload.aggressorSide
      : null,
    "SELL",
  );

  const rawBbo = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    u: 400900217,
    s: "BTCUSDT",
    b: "117999.9",
    B: "4",
    a: "118000.1",
    A: "5",
  });
  assert.equal(rawBbo.factType, "TOP_OF_BOOK");
  const combinedBbo = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    stream: "btcusdt@bookTicker",
    data: {
      u: 400900218,
      s: "BTCUSDT",
      b: "117999.8",
      B: "6",
      a: "118000.2",
      A: "7",
    },
  });
  assert.equal(combinedBbo.sequenceEnd, "400900218");

  const snapshot = onlyObservation(
    providerPlan,
    "BINANCE_FUTURES",
    {
      lastUpdateId: 400900218,
      E: 1_753_516_800_110,
      bids: [["117999.8", "6"]],
      asks: [["118000.2", "7"]],
    },
    {
      transportKind: "REST_SNAPSHOT",
      subjectId: "binance-trigger",
    },
  );
  assert.equal(snapshot.factType, "ORDER_BOOK_SNAPSHOT");
  assert.equal(snapshot.snapshotReset, true);

  const delta = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "depthUpdate",
    E: 1_753_516_800_120,
    T: 1_753_516_800_119,
    s: "BTCUSDT",
    U: 400900219,
    u: 400900220,
    pu: 400900218,
    b: [["117999.8", "0"]],
    a: [["118000.3", "8"]],
  });
  assert.equal(delta.factType, "ORDER_BOOK_DELTA");
  assert.equal(delta.previousSequence, "400900218");

  const reference = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "markPriceUpdate",
    E: 1_753_516_800_130,
    s: "BTCUSDT",
    p: "118000.0",
    i: "118001.0",
    r: "0.0001",
    T: 1_753_520_000_000,
  });
  assert.equal(reference.factType, "MARK_INDEX_REFERENCE");

  const liquidation = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "forceOrder",
    E: 1_753_516_800_140,
    o: {
      s: "BTCUSDT",
      S: "SELL",
      o: "LIMIT",
      f: "IOC",
      q: "0.5",
      p: "117900",
      ap: "117905",
      X: "FILLED",
      l: "0.5",
      z: "0.5",
      T: 1_753_516_800_139,
    },
    s: "BTCUSDT",
  });
  assert.equal(liquidation.factType, "LIQUIDATION_EVENT");
  assert.equal(
    liquidation.payload.kind === "LIQUIDATION_EVENT"
      ? liquidation.payload.liquidatedSide
      : null,
    "LONG",
  );
});

test("OKX parser keeps mark/index lineage separate and labels liquidation as sampled", () => {
  const providerPlan = plan();
  const trade = onlyObservation(providerPlan, "OKX_SWAP", {
    arg: { channel: "trades", instId: "BTC-USDT-SWAP" },
    data: [{
      instId: "BTC-USDT-SWAP",
      tradeId: "242720720",
      px: "118000",
      sz: "4",
      side: "buy",
      ts: "1753516800100",
      count: "2",
      source: "0",
      seqId: "987654321012345678",
    }],
  });
  assert.equal(trade.factType, "PUBLIC_TRADE");
  assert.equal(trade.sequenceEnd, "987654321012345678");

  const book = onlyObservation(providerPlan, "OKX_SWAP", {
    arg: { channel: "books", instId: "BTC-USDT-SWAP" },
    action: "snapshot",
    data: [{
      instId: "BTC-USDT-SWAP",
      asks: [["118001", "5", "0", "1"]],
      bids: [["117999", "4", "0", "1"]],
      ts: "1753516800110",
      seqId: "987654321012345679",
      prevSeqId: "987654321012345678",
    }],
  });
  assert.equal(book.factType, "ORDER_BOOK_SNAPSHOT");

  const mark = onlyObservation(providerPlan, "OKX_SWAP", {
    arg: { channel: "mark-price", instId: "BTC-USDT-SWAP" },
    data: [{
      instId: "BTC-USDT-SWAP",
      instType: "SWAP",
      markPx: "118000",
      ts: "1753516800120",
    }],
  });
  assert.equal(mark.factType, "MARK_INDEX_REFERENCE");
  assert.equal(
    mark.payload.kind === "MARK_INDEX_REFERENCE"
      ? mark.payload.indexPrice
      : "unexpected",
    null,
  );
  const index = onlyObservation(providerPlan, "OKX_SWAP", {
    arg: { channel: "index-tickers", instId: "BTC-USDT" },
    data: [{
      instId: "BTC-USDT",
      idxPx: "118001",
      ts: "1753516800130",
    }],
  });
  assert.equal(index.subjectId, "okx-trigger");

  const result = parse(providerPlan, "OKX_SWAP", {
    arg: {
      channel: "liquidation-orders",
      instType: "SWAP",
      instFamily: "BTC-USDT",
    },
    data: [{
      instId: "BTC-USDT-SWAP",
      instType: "SWAP",
      details: [{
        bkPx: "117900",
        posSide: "long",
        side: "sell",
        sz: "4",
        ts: "1753516800140",
      }],
    }],
  });
  assert.equal(result.status, "DATA");
  assert.deepEqual(result.reasonCodes, [
    "provider_sampled_liquidation_feed_not_total_market",
  ]);
  assert.equal(
    result.observations[0]?.sourceCompleteness,
    "PROVIDER_SAMPLED_LIQUIDATION_FEED",
  );
});

test("Bybit parser preserves monotonic-only book assurance and all-liquidation semantics", () => {
  const providerPlan = plan();
  const trade = onlyObservation(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "publicTrade.BTCUSDT",
    type: "snapshot",
    ts: 1_753_516_800_100,
    data: [{
      T: 1_753_516_800_090,
      s: "BTCUSDT",
      S: "Buy",
      v: "0.001",
      p: "118000",
      i: "20f43950-d8dd-5b31-9112-a178eb6023af",
      BT: false,
      RPI: true,
      seq: "1783284617",
    }],
  });
  assert.equal(trade.factType, "PUBLIC_TRADE");

  const snapshot = onlyObservation(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "orderbook.50.BTCUSDT",
    type: "snapshot",
    ts: 1_753_516_800_110,
    cts: 1_753_516_800_109,
    data: {
      s: "BTCUSDT",
      b: [["117999", "4"]],
      a: [["118001", "5"]],
      u: "1000",
      seq: "2000",
    },
  });
  assert.equal(
    snapshot.sequenceAssurance,
    "MONOTONIC_SEQUENCE_WITH_SNAPSHOT_RESET",
  );

  const ticker = parse(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "tickers.BTCUSDT",
    type: "snapshot",
    ts: 1_753_516_800_120,
    data: {
      symbol: "BTCUSDT",
      markPrice: "118000",
      indexPrice: "118001",
      bid1Price: "117999",
      bid1Size: "4",
      ask1Price: "118001",
      ask1Size: "5",
    },
  });
  assert.equal(ticker.status, "DATA");
  assert.deepEqual(
    ticker.observations.map((observation) => observation.factType).sort(),
    ["MARK_INDEX_REFERENCE", "TOP_OF_BOOK"],
  );

  const liquidation = onlyObservation(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "allLiquidation.BTCUSDT",
    type: "snapshot",
    ts: 1_753_516_800_130,
    data: [{
      T: 1_753_516_800_129,
      s: "BTCUSDT",
      S: "Buy",
      v: "2",
      p: "117900",
    }],
  });
  assert.equal(
    liquidation.payload.kind === "LIQUIDATION_EVENT"
      ? liquidation.payload.liquidatedSide
      : null,
    "LONG",
  );
});

test("Bitget UTA parser covers all families and never promotes sampled liquidation to total flow", () => {
  const providerPlan = plan();
  const trade = onlyObservation(providerPlan, "BITGET_FUTURES", {
    action: "update",
    arg: {
      instType: "usdt-futures",
      topic: "publicTrade",
      symbol: "BTCUSDT",
    },
    data: [{
      p: "118000",
      S: "buy",
      T: "1753516800100",
      v: "0.00118",
      i: "1260903622036942849",
      L: "1234568787787878787",
      isRPI: "no",
    }],
    ts: 1_753_516_800_101,
  });
  assert.equal(trade.sequenceEnd, "1260903622036942849");

  const ticker = parse(providerPlan, "BITGET_FUTURES", {
    action: "snapshot",
    arg: {
      instType: "usdt-futures",
      topic: "ticker",
      symbol: "BTCUSDT",
    },
    data: [{
      bid1Price: "117999",
      bid1Size: "4",
      ask1Price: "118001",
      ask1Size: "5",
      markPrice: "118000",
      indexPrice: "118001",
    }],
    ts: 1_753_516_800_110,
  });
  assert.equal(ticker.status, "DATA");
  assert.equal(ticker.observations.length, 2);

  const snapshot = onlyObservation(providerPlan, "BITGET_FUTURES", {
    action: "snapshot",
    arg: {
      instType: "usdt-futures",
      topic: "books",
      symbol: "BTCUSDT",
    },
    data: [{
      a: [["118001", "5"]],
      b: [["117999", "4"]],
      pseq: "0",
      seq: "1304314508780744705",
      maxDepth: "1000",
      ts: "1753516800120",
    }],
    ts: 1_753_516_800_121,
  });
  assert.equal(snapshot.factType, "ORDER_BOOK_SNAPSHOT");
  assert.equal(snapshot.sequenceEnd, "1304314508780744705");

  const liquidationResult = parse(providerPlan, "BITGET_FUTURES", {
    action: "update",
    arg: {
      instType: "usdt-futures",
      topic: "liquidation",
    },
    data: [{
      symbol: "BTCUSDT",
      side: "buy",
      price: "117900",
      amount: "250000",
      ts: "1753516800130",
    }],
    ts: 1_753_516_800_131,
  });
  assert.equal(liquidationResult.status, "DATA");
  assert.equal(
    liquidationResult.observations[0]?.sourceCompleteness,
    "PROVIDER_SAMPLED_MAX_SIDE_PER_SECOND",
  );
  assert.deepEqual(liquidationResult.reasonCodes, [
    "provider_sampled_liquidation_feed_not_total_market",
  ]);
});

test("unsafe native integer, schema drift and observation tampering fail closed", () => {
  const providerPlan = plan();
  const unsafe = parse(providerPlan, "BITGET_FUTURES", {
    action: "snapshot",
    arg: {
      instType: "usdt-futures",
      topic: "books",
      symbol: "BTCUSDT",
    },
    data: [{
      a: [["118001", "5"]],
      b: [["117999", "4"]],
      pseq: 0,
      seq: Number("1304314508780744705"),
      maxDepth: "1000",
      ts: "1753516800120",
    }],
    ts: 1_753_516_800_121,
  });
  assert.equal(unsafe.status, "SCHEMA_DRIFT");

  const drift = parse(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "publicTrade.BTCUSDT",
    data: [{ broken: true }],
  });
  assert.equal(drift.status, "SCHEMA_DRIFT");
  assert.deepEqual(drift.reasonCodes, [
    "provider_schema_drift_unavailable",
  ]);

  const observation = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "aggTrade",
    E: 1_753_516_800_100,
    s: "BTCUSDT",
    a: 12345,
    p: "118000.5",
    q: "0.25",
    T: 1_753_516_800_090,
    m: false,
  });
  assert.equal(
    M1ShadowProviderObservationSchema.safeParse({
      ...observation,
      sourceEventId: "tampered",
    }).success,
    false,
  );
});

test("sequence evaluator resyncs exact-contiguity gaps without pretending monotonic-only proof", () => {
  const providerPlan = plan();
  const snapshot = onlyObservation(
    providerPlan,
    "BINANCE_FUTURES",
    {
      lastUpdateId: 100,
      bids: [["117999", "4"]],
      asks: [["118001", "5"]],
    },
    {
      transportKind: "REST_SNAPSHOT",
      subjectId: "binance-trigger",
    },
  );
  const reset = evaluateM1ShadowOrderBookSequence({
    state: null,
    observation: snapshot,
  });
  assert.equal(reset.status, "RESET");

  const contiguous = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "depthUpdate",
    E: 1_753_516_800_120,
    s: "BTCUSDT",
    U: 99,
    u: 102,
    pu: 98,
    b: [["117999", "0"]],
    a: [["118002", "6"]],
  });
  const apply = evaluateM1ShadowOrderBookSequence({
    state: reset.nextState,
    observation: contiguous,
  });
  assert.equal(apply.status, "APPLY");

  const gapped = onlyObservation(providerPlan, "BINANCE_FUTURES", {
    e: "depthUpdate",
    E: 1_753_516_800_130,
    s: "BTCUSDT",
    U: 110,
    u: 111,
    pu: 109,
    b: [],
    a: [["118003", "7"]],
  });
  const gap = evaluateM1ShadowOrderBookSequence({
    state: apply.nextState,
    observation: gapped,
  });
  assert.equal(gap.status, "GAP");
  assert.equal(gap.gapCount, 1);
  assert.equal(gap.nextState.snapshotEstablished, false);

  const bybitSnapshot = onlyObservation(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "orderbook.50.BTCUSDT",
    type: "snapshot",
    ts: 1_753_516_800_140,
    data: {
      s: "BTCUSDT",
      b: [["117999", "4"]],
      a: [["118001", "5"]],
      u: "1000",
      seq: "2000",
    },
  });
  const bybitReset = evaluateM1ShadowOrderBookSequence({
    state: null,
    observation: bybitSnapshot,
  });
  const bybitDelta = onlyObservation(providerPlan, "BYBIT_DERIVATIVES", {
    topic: "orderbook.50.BTCUSDT",
    type: "delta",
    ts: 1_753_516_800_150,
    data: {
      s: "BTCUSDT",
      b: [["117998", "3"]],
      a: [],
      u: "1015",
      seq: "2015",
    },
  });
  const monotonic = evaluateM1ShadowOrderBookSequence({
    state: bybitReset.nextState,
    observation: bybitDelta,
  });
  assert.equal(monotonic.status, "APPLY");
  assert.deepEqual(monotonic.reasonCodes, [
    "provider_monotonic_only_no_contiguity_proof",
  ]);
});
