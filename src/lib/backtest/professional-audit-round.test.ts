import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProfessionalAuditOpportunityLane,
  opportunityLaneScore,
  professionalAuditOpportunityQuotas,
  professionalAuditPlanBlockerLabel,
  professionalAuditRadarScore,
  resolveProfessionalAuditHorizonBarsByBand,
  selectProfessionalAuditNodeIndexes,
  selectProfessionalAuditOpportunityCandidates,
} from "./professional-audit-round";
import type { Candle } from "../market/ohlcv/types";

function candle(index: number, close: number, volume = 100): Candle {
  const time = Date.UTC(2026, 0, 1, 0, index * 15);

  return {
    close,
    closeTime: new Date(time + 15 * 60_000 - 1).toISOString(),
    high: close * 1.01,
    low: close * 0.99,
    open: close * 0.998,
    openTime: new Date(time).toISOString(),
    volume,
  };
}

function sidewaysSeries(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 9) * 0.015;

    return candle(index, 1 + wave, 100 + Math.cos(index / 5) * 12);
  });
}

test("resolveProfessionalAuditHorizonBarsByBand keeps small medium large validation windows distinct", () => {
  assert.deepEqual(resolveProfessionalAuditHorizonBarsByBand(), {
    large: 384,
    medium: 96,
    small: 16,
  });
});

test("resolveProfessionalAuditHorizonBarsByBand accepts explicit per-band overrides", () => {
  assert.deepEqual(resolveProfessionalAuditHorizonBarsByBand({
    large: 480,
    medium: 120,
    small: 20,
  }), {
    large: 480,
    medium: 120,
    small: 20,
  });
});

test("professionalAuditRadarScore rewards early pullback and retest opportunities over late extensions", () => {
  const earlyPullback = professionalAuditRadarScore({
    compressionPct: 34,
    confidence: 61,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.2,
    rangePositionPct: 36,
    symbol: "ARBUSDT",
    volumeRatio: 1.62,
  });
  const lateBreakout = professionalAuditRadarScore({
    compressionPct: 72,
    confidence: 78,
    direction: "long",
    lateAtSelection: true,
    movePct: 13.8,
    rangePositionPct: 92,
    symbol: "ARBUSDT",
    volumeRatio: 2.4,
  });

  assert.ok(
    earlyPullback > lateBreakout,
    `expected early pullback score ${earlyPullback} to beat late breakout score ${lateBreakout}`,
  );
});

test("professionalAuditRadarScore does not let high-volatility meme chase dominate early setups", () => {
  const memeChase = professionalAuditRadarScore({
    compressionPct: 66,
    confidence: 82,
    direction: "long",
    lateAtSelection: true,
    movePct: 18.5,
    rangePositionPct: 95,
    symbol: "1000PEPEUSDT",
    volumeRatio: 3.8,
  });
  const memeEarlySetup = professionalAuditRadarScore({
    compressionPct: 28,
    confidence: 62,
    direction: "long",
    lateAtSelection: false,
    movePct: 4.4,
    rangePositionPct: 33,
    symbol: "1000PEPEUSDT",
    volumeRatio: 1.7,
  });

  assert.ok(
    memeEarlySetup > memeChase,
    `expected meme early setup score ${memeEarlySetup} to beat meme chase score ${memeChase}`,
  );
});

test("professionalAuditRadarScore handles short retest opportunities directionally", () => {
  const shortRetest = professionalAuditRadarScore({
    compressionPct: 39,
    confidence: 60,
    direction: "short",
    lateAtSelection: false,
    movePct: -3.8,
    rangePositionPct: 67,
    symbol: "TIAUSDT",
    volumeRatio: 1.45,
  });
  const alreadyDumpedShort = professionalAuditRadarScore({
    compressionPct: 70,
    confidence: 75,
    direction: "short",
    lateAtSelection: true,
    movePct: -14.2,
    rangePositionPct: 8,
    symbol: "TIAUSDT",
    volumeRatio: 2.3,
  });

  assert.ok(
    shortRetest > alreadyDumpedShort,
    `expected short retest score ${shortRetest} to beat already dumped score ${alreadyDumpedShort}`,
  );
});

test("professionalAuditRadarScore promotes quiet accumulation before the move", () => {
  const quietSetup = professionalAuditRadarScore({
    compressionPct: 31,
    confidence: 58,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.4,
    rangePositionPct: 42,
    symbol: "HYPEUSDT",
    volumeRatio: 0.82,
  });
  const obviousMomentum = professionalAuditRadarScore({
    compressionPct: 62,
    confidence: 72,
    direction: "long",
    lateAtSelection: true,
    movePct: 11.6,
    rangePositionPct: 89,
    symbol: "HYPEUSDT",
    volumeRatio: 2.2,
  });

  assert.ok(
    quietSetup > obviousMomentum,
    `expected quiet setup score ${quietSetup} to beat obvious momentum score ${obviousMomentum}`,
  );
});

test("professionalAuditRadarScore rewards controlled volume impulse without chasing", () => {
  const controlledImpulse = professionalAuditRadarScore({
    compressionPct: 46,
    confidence: 59,
    direction: "long",
    lateAtSelection: false,
    movePct: 4.8,
    rangePositionPct: 58,
    symbol: "AAVEUSDT",
    volumeRatio: 4.6,
  });
  const exhaustedImpulse = professionalAuditRadarScore({
    compressionPct: 70,
    confidence: 78,
    direction: "long",
    lateAtSelection: true,
    movePct: 15.2,
    rangePositionPct: 94,
    symbol: "AAVEUSDT",
    volumeRatio: 5.1,
  });

  assert.ok(
    controlledImpulse > exhaustedImpulse,
    `expected controlled impulse score ${controlledImpulse} to beat exhausted impulse score ${exhaustedImpulse}`,
  );
});

test("professionalAuditRadarScore rewards controlled breakout-edge setup before full extension", () => {
  const controlledBreakoutEdge = professionalAuditRadarScore({
    compressionPct: 32,
    confidence: 58,
    direction: "long",
    lateAtSelection: false,
    movePct: 2.1,
    rangePositionPct: 74,
    symbol: "SEIUSDT",
    volumeRatio: 1.35,
  });
  const quietMiddle = professionalAuditRadarScore({
    compressionPct: 31,
    confidence: 62,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.4,
    rangePositionPct: 42,
    symbol: "SEIUSDT",
    volumeRatio: 0.82,
  });
  const lateExtension = professionalAuditRadarScore({
    compressionPct: 60,
    confidence: 76,
    direction: "long",
    lateAtSelection: true,
    movePct: 11.2,
    rangePositionPct: 91,
    symbol: "SEIUSDT",
    volumeRatio: 2.4,
  });

  assert.ok(
    controlledBreakoutEdge >= 95,
    `expected controlled breakout-edge ${controlledBreakoutEdge} to reach a competitive pre-breakout score; quiet middle was ${quietMiddle}`,
  );
  assert.ok(
    controlledBreakoutEdge > lateExtension,
    `expected controlled breakout-edge ${controlledBreakoutEdge} to beat late extension ${lateExtension}`,
  );
});

test("professionalAuditOpportunityQuotas reserves Top10 slots for early pullback and higher timeframe lanes", () => {
  assert.deepEqual(professionalAuditOpportunityQuotas(10), {
    early_setup: 4,
    higher_timeframe_context: 3,
    pullback_retest: 3,
    risk_review: 0,
  });
});

test("opportunityLaneScore promotes explicit early setup nodes over generic neutral nodes", () => {
  const preMove = opportunityLaneScore({
    compressionPct: 30,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.4,
    nodeRole: "pre_move",
    radarScore: 72,
    rangePositionPct: 42,
    timeframeBand: "small",
    volumeRatio: 0.9,
  });
  const generic = opportunityLaneScore({
    compressionPct: 30,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.4,
    nodeRole: "neutral_random",
    radarScore: 72,
    rangePositionPct: 42,
    timeframeBand: "small",
    volumeRatio: 0.9,
  });

  assert.ok(preMove > generic + 20, `expected pre-move score ${preMove} to clearly beat generic score ${generic}`);
});

test("classifyProfessionalAuditOpportunityLane honors target node roles without turning late extensions into opportunities", () => {
  assert.equal(classifyProfessionalAuditOpportunityLane({
    compressionPct: 28,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.2,
    nodeRole: "pre_move",
    rangePositionPct: 44,
    timeframeBand: "small",
    volumeRatio: 0.92,
  }), "early_setup");
  assert.equal(classifyProfessionalAuditOpportunityLane({
    compressionPct: 44,
    direction: "long",
    lateAtSelection: false,
    movePct: 4.2,
    nodeRole: "pullback_retest",
    rangePositionPct: 48,
    timeframeBand: "medium",
    volumeRatio: 0.88,
  }), "pullback_retest");
  assert.equal(classifyProfessionalAuditOpportunityLane({
    compressionPct: 70,
    direction: "long",
    lateAtSelection: true,
    movePct: 14,
    nodeRole: "pre_move",
    rangePositionPct: 92,
    timeframeBand: "small",
    volumeRatio: 3,
  }), "risk_review");
});

test("selectProfessionalAuditNodeIndexes does not let future horizon candles change scan points", () => {
  const candles = sidewaysSeries(260);
  const alteredFuture = candles.map((item, index) =>
    index >= candles.length - 16
      ? {
        ...item,
        close: item.close * 1.8,
        high: item.high * 2.2,
        low: item.low * 0.7,
        volume: item.volume * 12,
      }
      : item
  );
  const horizons = resolveProfessionalAuditHorizonBarsByBand();
  const original = selectProfessionalAuditNodeIndexes(candles, 10, horizons);
  const altered = selectProfessionalAuditNodeIndexes(alteredFuture, 10, horizons);

  assert.deepEqual(
    altered.map((item) => ({ band: item.band, index: item.index, role: item.role })),
    original.map((item) => ({ band: item.band, index: item.index, role: item.role })),
  );
});

test("selectProfessionalAuditOpportunityCandidates excludes risk review from actionable top slots", () => {
  const item = (
    symbol: string,
    opportunityLane: "early_setup" | "higher_timeframe_context" | "pullback_retest" | "risk_review",
    opportunityLaneScore: number,
    confidence = 60,
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence,
      },
    },
    opportunityLane,
    opportunityLaneScore,
    radarScore: opportunityLaneScore,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("LATEUSDT", "risk_review", 999, 99),
    item("EARLY1USDT", "early_setup", 80),
    item("EARLY2USDT", "early_setup", 70),
    item("PULL1USDT", "pullback_retest", 75),
    item("PULL2USDT", "pullback_retest", 65),
    item("HTF1USDT", "higher_timeframe_context", 60),
  ], 4);

  assert.equal(selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "LATEUSDT"), false);
  assert.equal(selected.selected.length, 4);
  assert.ok(selected.ranked.findIndex((entry) => entry.auditCase.inputSummary.symbol === "LATEUSDT") > 3);
});

test("professionalAuditPlanBlockerLabel maps rr blockers to readable Chinese", () => {
  assert.equal(professionalAuditPlanBlockerLabel("reward_risk_below_minimum"), "结构盈亏比低于 3:1");
  assert.equal(professionalAuditPlanBlockerLabel("reward_risk_2.40R_below_3R"), "结构盈亏比不足或未知");
  assert.equal(professionalAuditPlanBlockerLabel("support_lost"), "支撑位失守");
  assert.equal(professionalAuditPlanBlockerLabel("trade_plan_not_ready"), "交易计划未就绪");
});
