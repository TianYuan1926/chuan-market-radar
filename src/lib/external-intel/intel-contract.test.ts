import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExternalIntelContract,
  buildExternalIntelSourcePlan,
  externalEventToEvidenceCandidate,
  normalizeExternalEvent,
} from "./intel-contract";

test("external intel source plan only contains safe context-only sources", () => {
  const sources = buildExternalIntelSourcePlan();

  assert.equal(sources.length >= 7, true);
  assert.equal(sources.every((source) => source.allowedUse === "context_only"), true);
  assert.equal(sources.every((source) => source.canCreateTradeSignal === false), true);
  assert.equal(sources.every((source) => source.requiresLogin === false), true);
  assert.equal(sources.every((source) => source.avoidsPaywall === true), true);
  assert.equal(sources.every((source) => source.mustRespectRobots === true), true);
});

test("normalizeExternalEvent sanitizes text and never stores raw bodies", () => {
  const event = normalizeExternalEvent({
    id: "evt-1",
    sourceId: "dex_screener_public_api",
    kind: "DEX_VOLUME_SPIKE",
    symbol: "tia/usdt",
    title: "  TIA DEX volume spike  ",
    summary: "x".repeat(500),
    observedAt: "2026-06-24T08:00:00.000Z",
    impact: "bullish_context",
    confidence: 220,
  });

  assert.equal(event.symbol, "TIAUSDT");
  assert.equal(event.tokenIdentity?.symbol, "TIAUSDT");
  assert.equal(event.tokenIdentity?.mappingStatus, "partial");
  assert.equal(event.allowedUse, "context_only");
  assert.equal(event.canCreateTradeSignal, false);
  assert.equal(event.rawBodyStored, false);
  assert.equal(event.confidence, 100);
  assert.equal(event.summary.length <= 280, true);
});

test("external events become context evidence candidates instead of trade signals", () => {
  const event = normalizeExternalEvent({
    id: "evt-risk",
    sourceId: "okx_announcements",
    kind: "DELIST_RISK",
    symbol: "ABCUSDT",
    title: "OKX delist warning",
    observedAt: "2026-06-24T08:00:00.000Z",
    impact: "risk_context",
  });
  const candidate = externalEventToEvidenceCandidate(event);

  assert.equal(candidate.family, "EXTERNAL_EVENT");
  assert.equal(candidate.direction, "RISK");
  assert.equal(candidate.symbol, "ABCUSDT");
  assert.equal(candidate.tokenIdentity?.symbol, "ABCUSDT");
  assert.equal(candidate.canCreateTradeSignal, false);
  assert.equal(candidate.riskOnly, true);
});

test("buildExternalIntelContract reports empty until collectors produce normalized events", () => {
  const empty = buildExternalIntelContract();

  assert.equal(empty.status, "empty");
  assert.match(empty.reason ?? "", /collector 尚未产生事件/);

  const live = buildExternalIntelContract({
    events: [
      {
        id: "evt-2",
        sourceId: "binance_announcements",
        kind: "LISTING_EVENT",
        symbol: "TIAUSDT",
        title: "Binance listing context",
        summary: "Official listing context.",
        sourceUrl: "https://example.com/listing",
        observedAt: "2026-06-24T08:00:00.000Z",
        impact: "neutral_context",
        confidence: 70,
        allowedUse: "context_only",
        canCreateTradeSignal: false,
        rawBodyStored: false,
      },
    ],
  });

  assert.equal(live.status, "live");
  assert.equal(live.data.events.length, 1);
  assert.equal(live.data.evidenceCandidates[0]?.canCreateTradeSignal, false);
});

test("buildExternalIntelContract reports failed collector runs without fake events", () => {
  const failed = buildExternalIntelContract({
    latestRuns: [{
      id: "failed-run",
      sourceId: "dex_screener_public_api",
      startedAt: "2026-06-24T08:00:00.000Z",
      finishedAt: "2026-06-24T08:00:01.000Z",
      status: "failed",
      rowsRead: 0,
      rowsAccepted: 0,
      error: "HTTP 429",
    }],
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.data.events.length, 0);
  assert.match(failed.reason ?? "", /不使用旧数据或假事件/);
});
