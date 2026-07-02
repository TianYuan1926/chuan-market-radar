import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLevelQualityMetrics,
  buildPlanBlockerMetrics,
  buildWaitPlanMetrics,
  classifyProfessionalAuditOpportunityLane,
  classifyProfessionalAuditOpportunityQuality,
  isActionableWaitPlanNode,
  isScanActionableOpportunityNode,
  opportunityLaneScore,
  professionalAuditOpportunityQuotas,
  professionalAuditContextualPlanBlockers,
  professionalAuditPlanBlockerLabel,
  professionalAuditRadarScore,
  resolveProfessionalAuditHorizonBarsByBand,
  runProfessionalAuditRound,
  selectProfessionalAuditNodeIndexes,
  selectProfessionalAuditOpportunityCandidates,
  tradePlanBlockers,
  waitPlanFollowThroughConfirmed,
  waitPlanTriggerPrice,
  waitPlanTriggerObserved,
} from "./professional-audit-round";
import type {
  ProfessionalAuditRoundNode,
} from "./professional-audit-round";
import type { Candle } from "../market/ohlcv/types";
import type { MarketSignal } from "../analysis/types";

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

test("professionalAuditRadarScore promotes WUSDT-like quiet pre-signal setups before they become obvious", () => {
  const quietPreSignal = professionalAuditRadarScore({
    compressionPct: 54,
    confidence: 50,
    direction: "long",
    lateAtSelection: false,
    movePct: 0.11,
    nodeRole: "neutral_random",
    rangePositionPct: 49,
    symbol: "WUSDT",
    timeframeBand: "medium",
    volumeRatio: 0.82,
  });
  const genericNeutralDrift = professionalAuditRadarScore({
    compressionPct: 76,
    confidence: 56,
    direction: "long",
    lateAtSelection: false,
    movePct: 0.24,
    nodeRole: "neutral_random",
    rangePositionPct: 51,
    symbol: "GENERICUSDT",
    timeframeBand: "medium",
    volumeRatio: 1,
  });

  assert.ok(
    quietPreSignal > genericNeutralDrift + 20,
    `expected quiet pre-signal score ${quietPreSignal} to clearly beat generic drift ${genericNeutralDrift}`,
  );
});

test("professionalAuditRadarScore promotes inferred pre-move roles without promoting fakeout or late roles", () => {
  const baseInput = {
    compressionPct: 30,
    confidence: 61,
    direction: "long" as const,
    lateAtSelection: false,
    movePct: 1.8,
    rangePositionPct: 43,
    symbol: "PYTHUSDT",
    volumeRatio: 0.86,
  };
  const preMove = professionalAuditRadarScore({
    ...baseInput,
    nodeRole: "pre_move",
  });
  const neutral = professionalAuditRadarScore({
    ...baseInput,
    nodeRole: "neutral_random",
  });
  const fakeout = professionalAuditRadarScore({
    ...baseInput,
    nodeRole: "fakeout_or_invalidation",
  });

  assert.ok(
    preMove > neutral + 18,
    `expected pre-move role score ${preMove} to clearly beat neutral ${neutral}`,
  );
  assert.ok(
    preMove > fakeout + 35,
    `expected pre-move role score ${preMove} to clearly beat fakeout ${fakeout}`,
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
    early_setup: 6,
    higher_timeframe_context: 1,
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

test("opportunityLaneScore promotes RR-qualified early setups without using future outcome", () => {
  const rrQualified = opportunityLaneScore({
    compressionPct: 52,
    direction: "short",
    lateAtSelection: false,
    movePct: -3.6,
    nodeRole: "medium_swing",
    radarScore: 42,
    rangePositionPct: 64,
    rewardRisk: 3.18,
    timeframeBand: "medium",
    tradePlanStatus: "WAIT_RETEST",
    volumeRatio: 1.13,
  });
  const rrUnknown = opportunityLaneScore({
    compressionPct: 52,
    direction: "short",
    lateAtSelection: false,
    movePct: -3.6,
    nodeRole: "medium_swing",
    radarScore: 42,
    rangePositionPct: 64,
    rewardRisk: null,
    timeframeBand: "medium",
    tradePlanStatus: "BLOCKED",
    volumeRatio: 1.13,
  });

  assert.ok(
    rrQualified > rrUnknown + 12,
    `expected RR-qualified setup ${rrQualified} to clearly beat unknown-RR setup ${rrUnknown}`,
  );
});

test("opportunityLaneScore promotes soft waiting setups over hard-blocked noisy setups", () => {
  const softWaitingSetup = opportunityLaneScore({
    compressionPct: 52,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.4,
    nodeRole: "breakout_edge",
    planBlockers: ["structure_confirmation_pending"],
    radarScore: 86,
    rangePositionPct: 54,
    rewardRisk: 4.2,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 1.08,
  });
  const hardBlockedSetup = opportunityLaneScore({
    compressionPct: 52,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.4,
    nodeRole: "early_volume_expansion",
    planBlockers: ["reward_risk_below_minimum", "stop_distance_too_wide", "chase_risk"],
    radarScore: 92,
    rangePositionPct: 54,
    rewardRisk: 1.2,
    timeframeBand: "small",
    tradePlanStatus: "BLOCKED",
    volumeRatio: 1.8,
  });

  assert.ok(
    softWaitingSetup > hardBlockedSetup,
    `expected soft waiting setup ${softWaitingSetup} to outrank hard-blocked noisy setup ${hardBlockedSetup}`,
  );
});

test("opportunityLaneScore does not bury discovery candidates for strategy-only blockers", () => {
  const common = {
    compressionPct: 46,
    direction: "long" as const,
    lateAtSelection: false,
    movePct: 2.2,
    nodeRole: "early_volume_expansion" as const,
    radarScore: 74,
    rangePositionPct: 48,
    rewardRisk: null,
    timeframeBand: "small" as const,
    tradePlanStatus: "BLOCKED",
    volumeRatio: 1.32,
  };
  const plainDiscovery = opportunityLaneScore(common);
  const strategyBlockedDiscovery = opportunityLaneScore({
    ...common,
    planBlockers: [
      "reward_risk_below_minimum",
      "stop_distance_too_wide",
      "chase_risk",
      "位置/RR",
    ],
  });

  assert.equal(
    strategyBlockedDiscovery,
    plainDiscovery,
    "scanner awareness should not be reduced by RR/stop/chase blockers; strategy gate handles those later",
  );
});

test("opportunityLaneScore keeps early structural-discovery candidates visible even before strategy confirmation", () => {
  const common = {
    compressionPct: 54,
    direction: "long" as const,
    lateAtSelection: false,
    movePct: 3.1,
    nodeRole: "early_volume_expansion" as const,
    radarScore: 66,
    rangePositionPct: 52,
    rewardRisk: null,
    timeframeBand: "small" as const,
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 1.48,
  };
  const cleanEarly = opportunityLaneScore(common);
  const structurallyUnconfirmed = opportunityLaneScore({
    ...common,
    planBlockers: ["bull_structure_broken", "structure_confirmation_pending"],
  });

  assert.ok(
    structurallyUnconfirmed >= cleanEarly - 5,
    `expected early discovery score ${structurallyUnconfirmed} to stay close to clean score ${cleanEarly}`,
  );
});

test("opportunityLaneScore promotes quiet early-volume wait setups that need confirmation", () => {
  const quietWaiting = opportunityLaneScore({
    compressionPct: 58,
    direction: "short",
    lateAtSelection: false,
    movePct: -2.8,
    nodeRole: "early_volume_expansion",
    planBlockers: ["direction_pending_quiet_setup", "structure_confirmation_pending"],
    radarScore: 58,
    rangePositionPct: 60,
    rewardRisk: null,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_RETEST",
    volumeRatio: 0.92,
  });
  const generic = opportunityLaneScore({
    compressionPct: 58,
    direction: "short",
    lateAtSelection: false,
    movePct: -2.8,
    nodeRole: "neutral_random",
    radarScore: 58,
    rangePositionPct: 60,
    rewardRisk: null,
    timeframeBand: "small",
    tradePlanStatus: "BLOCKED",
    volumeRatio: 0.92,
  });

  assert.ok(
    quietWaiting > generic + 18,
    `expected quiet early-volume waiting setup ${quietWaiting} to beat generic setup ${generic}`,
  );
});

test("opportunityLaneScore promotes transition early-volume nodes before they become chase signals", () => {
  const transitionEarlyVolume = opportunityLaneScore({
    compressionPct: 56,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.4,
    nodeRole: "early_volume_expansion",
    radarScore: 58,
    rangePositionPct: 70,
    timeframeBand: "small",
    volumeRatio: 0.92,
  });
  const genericRawNoise = opportunityLaneScore({
    compressionPct: 62,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.2,
    nodeRole: "neutral_random",
    radarScore: 96,
    rangePositionPct: 50,
    timeframeBand: "small",
    volumeRatio: 1.02,
  });

  assert.ok(
    transitionEarlyVolume > genericRawNoise,
    `expected transition early-volume score ${transitionEarlyVolume} to beat generic raw noise ${genericRawNoise}`,
  );
});

test("opportunityLaneScore promotes controlled early volume and breakout edge over generic drift", () => {
  const controlledVolume = opportunityLaneScore({
    compressionPct: 50,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.4,
    nodeRole: "early_volume_expansion",
    radarScore: 58,
    rangePositionPct: 49,
    timeframeBand: "small",
    volumeRatio: 1.55,
  });
  const breakoutEdge = opportunityLaneScore({
    compressionPct: 48,
    direction: "long",
    lateAtSelection: false,
    movePct: 3,
    nodeRole: "breakout_edge",
    radarScore: 58,
    rangePositionPct: 66,
    timeframeBand: "small",
    volumeRatio: 1.24,
  });
  const genericDrift = opportunityLaneScore({
    compressionPct: 62,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.2,
    nodeRole: "neutral_random",
    radarScore: 76,
    rangePositionPct: 50,
    timeframeBand: "small",
    volumeRatio: 1,
  });

  assert.ok(
    controlledVolume > genericDrift,
    `expected controlled early volume ${controlledVolume} to beat generic drift ${genericDrift}`,
  );
  assert.ok(
    breakoutEdge > genericDrift,
    `expected breakout edge ${breakoutEdge} to beat generic drift ${genericDrift}`,
  );
});

test("selectProfessionalAuditOpportunityCandidates lets strong RR-qualified early setups compete for Top10", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    radarScore = opportunityLaneScore,
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    radarScore,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 61),
    item("GENERIC2USDT", 60),
    item("GENERIC3USDT", 59),
    item("GENERIC4USDT", 58),
    item("WIFUSDT", 74, 42),
    item("GENERIC5USDT", 57),
  ], 4);

  assert.ok(selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "WIFUSDT"));
});

test("selectProfessionalAuditOpportunityCandidates reserves a TopN slot for early-volume discovery", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      movePct?: number;
      nodeRole?: "early_volume_expansion" | "neutral_random" | "pre_move";
      radarScore?: number;
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    radarScore: options.radarScore ?? opportunityLaneScore,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 94, { nodeRole: "neutral_random" }),
    item("GENERIC2USDT", 93, { nodeRole: "neutral_random" }),
    item("GENERIC3USDT", 92, { nodeRole: "neutral_random" }),
    item("GENERIC4USDT", 91, { nodeRole: "neutral_random" }),
    item("EARLYVOLUSDT", 62, {
      movePct: 3.2,
      nodeRole: "early_volume_expansion",
      volumeRatio: 1.34,
    }),
  ], 4);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "EARLYVOLUSDT"),
    "expected early-volume discovery to survive TopN selection even when generic raw scores are higher",
  );
});

test("selectProfessionalAuditOpportunityCandidates does not spend early-volume slot on low-volume impostors", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      movePct?: number;
      nodeRole?: "early_volume_expansion" | "neutral_random";
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    lateAtSelection: false,
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    radarScore: opportunityLaneScore,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("LOWVOLUMEUSDT", 160, {
      movePct: 1.4,
      nodeRole: "early_volume_expansion",
      volumeRatio: 0.92,
    }),
    item("TRUEVOLUMEUSDT", 72, {
      movePct: 2.7,
      nodeRole: "early_volume_expansion",
      volumeRatio: 1.44,
    }),
    item("GENERICUSDT", 95, {
      movePct: 1.2,
      nodeRole: "neutral_random",
      volumeRatio: 1.4,
    }),
  ], 1);

  assert.deepEqual(
    selected.selected.map((entry) => entry.auditCase.inputSummary.symbol),
    ["TRUEVOLUMEUSDT"],
    "expected the protected early-volume slot to require actual volume expansion above the regime threshold",
  );
});

test("selectProfessionalAuditOpportunityCandidates reserves a TopN slot for quiet compression discovery", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      compressionPct?: number;
      movePct?: number;
      nodeRole?: "neutral_random" | "pre_move";
      radarScore?: number;
      rangePositionPct?: number;
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    compressionPct: options.compressionPct,
    lateAtSelection: false,
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    radarScore: options.radarScore ?? opportunityLaneScore,
    rangePositionPct: options.rangePositionPct,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 98, { nodeRole: "neutral_random", volumeRatio: 1.4 }),
    item("GENERIC2USDT", 97, { nodeRole: "neutral_random", volumeRatio: 1.35 }),
    item("GENERIC3USDT", 96, { nodeRole: "neutral_random", volumeRatio: 1.3 }),
    item("GENERIC4USDT", 95, { nodeRole: "neutral_random", volumeRatio: 1.25 }),
    item("QUIETUSDT", 62, {
      compressionPct: 46,
      movePct: 0.8,
      nodeRole: "pre_move",
      rangePositionPct: 48,
      volumeRatio: 0.78,
    }),
  ], 4);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "QUIETUSDT"),
    "expected quiet compression discovery to survive TopN selection before it becomes obvious",
  );
});

test("selectProfessionalAuditOpportunityCandidates protects Top10 early discovery slots from non-actionable noise", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      compressionPct?: number;
      movePct?: number;
      nodeRole?: "early_volume_expansion" | "neutral_random" | "pre_move";
      planBlockers?: string[];
      radarScore?: number;
      rangePositionPct?: number;
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    compressionPct: options.compressionPct,
    lateAtSelection: false,
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    planBlockers: options.planBlockers,
    radarScore: options.radarScore ?? opportunityLaneScore,
    rangePositionPct: options.rangePositionPct,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    ...Array.from({ length: 12 }, (_, index) => item(`RRNOISE${index}USDT`, 240 - index, {
      movePct: 1.5,
      nodeRole: "neutral_random",
      planBlockers: index % 2 === 0 ? ["reward_risk_below_minimum"] : ["chase_risk"],
      volumeRatio: 1,
    })),
    item("CLEAN1USDT", 120, { nodeRole: "neutral_random", volumeRatio: 1.4 }),
    item("CLEAN2USDT", 119, { nodeRole: "neutral_random", volumeRatio: 1.35 }),
    item("CLEAN3USDT", 118, { nodeRole: "neutral_random", volumeRatio: 1.3 }),
    item("QUIET1USDT", 82, {
      compressionPct: 42,
      movePct: 0.7,
      nodeRole: "pre_move",
      rangePositionPct: 48,
      volumeRatio: 0.76,
    }),
    item("QUIET2USDT", 81, {
      compressionPct: 44,
      movePct: 0.9,
      nodeRole: "neutral_random",
      rangePositionPct: 52,
      volumeRatio: 0.82,
    }),
    item("EARLYVOL1USDT", 80, {
      movePct: 2.4,
      nodeRole: "early_volume_expansion",
      volumeRatio: 1.28,
    }),
    item("EARLYVOL2USDT", 79, {
      movePct: 3.2,
      nodeRole: "early_volume_expansion",
      volumeRatio: 1.55,
    }),
  ], 10);
  const selectedSymbols = selected.selected.map((entry) => entry.auditCase.inputSummary.symbol);

  assert.ok(selectedSymbols.includes("QUIET1USDT"));
  assert.ok(selectedSymbols.includes("QUIET2USDT"));
  assert.ok(selectedSymbols.includes("EARLYVOL1USDT"));
  assert.ok(selectedSymbols.includes("EARLYVOL2USDT"));
  assert.equal(selectedSymbols.some((symbol) => symbol.startsWith("RRNOISE")), false);
});

test("selectProfessionalAuditOpportunityCandidates keeps real early discoveries visible despite strategy-only blockers", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      compressionPct?: number;
      movePct?: number;
      nodeRole?: "early_volume_expansion" | "neutral_random";
      planBlockers?: string[];
      rangePositionPct?: number;
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    compressionPct: options.compressionPct,
    lateAtSelection: false,
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    planBlockers: options.planBlockers,
    radarScore: opportunityLaneScore,
    rangePositionPct: options.rangePositionPct,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 155, { nodeRole: "neutral_random", volumeRatio: 1 }),
    item("GENERIC2USDT", 154, { nodeRole: "neutral_random", volumeRatio: 1 }),
    item("GENERIC3USDT", 153, { nodeRole: "neutral_random", volumeRatio: 1 }),
    item("GENERIC4USDT", 152, { nodeRole: "neutral_random", volumeRatio: 1 }),
    item("REALDISCOVERYUSDT", 82, {
      compressionPct: 52,
      movePct: 2.7,
      nodeRole: "early_volume_expansion",
      planBlockers: ["reward_risk_below_minimum", "stop_distance_too_wide", "chase_risk"],
      rangePositionPct: 50,
      volumeRatio: 1.42,
    }),
    item("BROKENDISCOVERYUSDT", 200, {
      compressionPct: 50,
      movePct: 2.4,
      nodeRole: "early_volume_expansion",
      planBlockers: ["support_lost"],
      rangePositionPct: 50,
      volumeRatio: 1.5,
    }),
  ], 4);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "REALDISCOVERYUSDT"),
    "expected real early discovery to stay visible even when strategy layer blocks immediate entry",
  );
  assert.equal(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "BROKENDISCOVERYUSDT"),
    false,
    "expected structurally invalidated discovery not to be promoted by scan selection",
  );
});

test("selectProfessionalAuditOpportunityCandidates reserves slots for medium swing and trend acceleration discovery", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      movePct?: number;
      nodeRole?: "medium_swing" | "neutral_random" | "trend_acceleration";
      opportunityLane?: "early_setup" | "pullback_retest";
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    lateAtSelection: false,
    movePct: options.movePct,
    nodeRole: options.nodeRole,
    opportunityLane: options.opportunityLane ?? "early_setup" as const,
    opportunityLaneScore,
    radarScore: opportunityLaneScore,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 110, { nodeRole: "neutral_random" }),
    item("GENERIC2USDT", 109, { nodeRole: "neutral_random" }),
    item("GENERIC3USDT", 108, { nodeRole: "neutral_random" }),
    item("GENERIC4USDT", 107, { nodeRole: "neutral_random" }),
    item("GENERIC5USDT", 106, { nodeRole: "neutral_random" }),
    item("SWINGUSDT", 74, {
      movePct: 3.4,
      nodeRole: "medium_swing",
      volumeRatio: 0.86,
    }),
    item("TRENDUSDT", 73, {
      movePct: 5.2,
      nodeRole: "trend_acceleration",
      opportunityLane: "pullback_retest",
      volumeRatio: 1.42,
    }),
  ], 6);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "SWINGUSDT"),
    "expected medium swing discovery to survive TopN selection",
  );
  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "TRENDUSDT"),
    "expected trend acceleration discovery to survive TopN selection",
  );
});

test("selectProfessionalAuditOpportunityCandidates reserves slots for quiet pending early setups", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      movePct?: number;
      planBlockers?: string[];
      rewardRisk?: number;
      tradePlanStatus?: "WATCH_ONLY" | "WAIT_PULLBACK";
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    lateAtSelection: false,
    movePct: options.movePct,
    opportunityLane: "early_setup" as const,
    opportunityLaneScore,
    planBlockers: options.planBlockers,
    radarScore: opportunityLaneScore,
    rewardRisk: options.rewardRisk,
    tradePlanStatus: options.tradePlanStatus,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 155),
    item("GENERIC2USDT", 154),
    item("GENERIC3USDT", 153),
    item("GENERIC4USDT", 152),
    item("GENERIC5USDT", 151),
    item("GENERIC6USDT", 150),
    item("QUIETPENDINGUSDT", 82, {
      movePct: 0.6,
      planBlockers: ["direction_pending_quiet_setup", "structure_confirmation_pending"],
      tradePlanStatus: "WATCH_ONLY",
      volumeRatio: 0.92,
    }),
  ], 4);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "QUIETPENDINGUSDT"),
    "expected quiet pending early setup to survive TopN selection",
  );
});

test("selectProfessionalAuditOpportunityCandidates reserves slots for RR-qualified conditional wait plans", () => {
  const item = (
    symbol: string,
    opportunityLaneScore: number,
    options: {
      movePct?: number;
      opportunityLane?: "early_setup" | "pullback_retest";
      planBlockers?: string[];
      rewardRisk?: number;
      tradePlanStatus?: "WAIT_PULLBACK" | "WAIT_RETEST";
      volumeRatio?: number;
    } = {},
  ) => ({
    auditCase: {
      inputSummary: {
        symbol,
      },
      signal: {
        confidence: 60,
      },
    },
    lateAtSelection: false,
    movePct: options.movePct,
    opportunityLane: options.opportunityLane ?? "early_setup" as const,
    opportunityLaneScore,
    planBlockers: options.planBlockers,
    radarScore: opportunityLaneScore,
    rewardRisk: options.rewardRisk,
    tradePlanStatus: options.tradePlanStatus,
    volumeRatio: options.volumeRatio,
  });
  const selected = selectProfessionalAuditOpportunityCandidates([
    item("GENERIC1USDT", 160),
    item("GENERIC2USDT", 159),
    item("GENERIC3USDT", 158),
    item("GENERIC4USDT", 157),
    item("GENERIC5USDT", 156),
    item("GENERIC6USDT", 155),
    item("WAITRRUSDT", 84, {
      movePct: 3.1,
      planBlockers: ["structure_confirmation_pending"],
      rewardRisk: 3.6,
      tradePlanStatus: "WAIT_PULLBACK",
      volumeRatio: 1.08,
    }),
    item("BROKENWAITUSDT", 170, {
      movePct: 2.4,
      planBlockers: ["bull_structure_broken"],
      rewardRisk: 5.2,
      tradePlanStatus: "WAIT_PULLBACK",
      volumeRatio: 0.9,
    }),
  ], 4);

  assert.ok(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "WAITRRUSDT"),
    "expected RR-qualified conditional wait plan to survive TopN selection",
  );
  assert.equal(
    selected.selected.some((entry) => entry.auditCase.inputSummary.symbol === "BROKENWAITUSDT"),
    false,
    "expected structurally broken wait plan not to be promoted by the conditional quota",
  );
});

test("opportunityLaneScore compresses raw radar noise so real early setups are not crowded out", () => {
  const quietEarlySetup = opportunityLaneScore({
    compressionPct: 30,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.2,
    nodeRole: "pre_move",
    radarScore: 52,
    rangePositionPct: 42,
    timeframeBand: "small",
    volumeRatio: 0.86,
  });
  const noisyGenericSetup = opportunityLaneScore({
    compressionPct: 60,
    direction: "long",
    lateAtSelection: false,
    movePct: 1,
    nodeRole: "neutral_random",
    radarScore: 130,
    rangePositionPct: 42,
    timeframeBand: "small",
    volumeRatio: 0.98,
  });

  assert.ok(
    quietEarlySetup > noisyGenericSetup,
    `expected true early setup ${quietEarlySetup} to outrank noisy generic score ${noisyGenericSetup}`,
  );
});

test("opportunityLaneScore promotes medium swing and trend acceleration before they become late signals", () => {
  const mediumSwing = opportunityLaneScore({
    compressionPct: 58,
    direction: "long",
    lateAtSelection: false,
    movePct: 3.6,
    nodeRole: "medium_swing",
    radarScore: 58,
    rangePositionPct: 44,
    rewardRisk: 3.2,
    timeframeBand: "medium",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 0.88,
  });
  const trendAcceleration = opportunityLaneScore({
    compressionPct: 66,
    direction: "long",
    lateAtSelection: false,
    movePct: 5.4,
    nodeRole: "trend_acceleration",
    radarScore: 62,
    rangePositionPct: 57,
    rewardRisk: 3.4,
    timeframeBand: "medium",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 1.46,
  });
  const genericNoise = opportunityLaneScore({
    compressionPct: 64,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.1,
    nodeRole: "neutral_random",
    radarScore: 94,
    rangePositionPct: 50,
    rewardRisk: null,
    timeframeBand: "small",
    tradePlanStatus: "WATCH_ONLY",
    volumeRatio: 1.02,
  });

  assert.ok(
    mediumSwing > genericNoise,
    `expected medium swing score ${mediumSwing} to outrank generic noise ${genericNoise}`,
  );
  assert.ok(
    trendAcceleration > genericNoise,
    `expected trend acceleration score ${trendAcceleration} to outrank generic noise ${genericNoise}`,
  );
});

test("opportunityLaneScore promotes quiet direction-pending pre-ignition setups without future data", () => {
  const quietPending = opportunityLaneScore({
    compressionPct: 38,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.1,
    nodeRole: "pre_move",
    planBlockers: ["direction_pending_quiet_setup", "structure_confirmation_pending"],
    radarScore: 48,
    rangePositionPct: 46,
    rewardRisk: 3.4,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 0.78,
  });
  const genericHigherRaw = opportunityLaneScore({
    compressionPct: 58,
    direction: "long",
    lateAtSelection: false,
    movePct: 2.2,
    nodeRole: "neutral_random",
    radarScore: 96,
    rangePositionPct: 48,
    rewardRisk: null,
    timeframeBand: "small",
    tradePlanStatus: "WATCH_ONLY",
    volumeRatio: 1.02,
  });

  assert.ok(
    quietPending > genericHigherRaw,
    `expected quiet pending setup ${quietPending} to outrank generic raw-score noise ${genericHigherRaw}`,
  );
});

test("opportunityLaneScore does not punish quiet neutral compression as generic noise", () => {
  const quietNeutralCompression = opportunityLaneScore({
    compressionPct: 48,
    direction: "short",
    lateAtSelection: false,
    movePct: -0.9,
    nodeRole: "neutral_random",
    radarScore: 50,
    rangePositionPct: 59,
    timeframeBand: "small",
    volumeRatio: 0.78,
  });
  const genericNeutralNoise = opportunityLaneScore({
    compressionPct: 64,
    direction: "short",
    lateAtSelection: false,
    movePct: -0.9,
    nodeRole: "neutral_random",
    radarScore: 50,
    rangePositionPct: 59,
    timeframeBand: "small",
    volumeRatio: 1.02,
  });

  assert.ok(
    quietNeutralCompression > genericNeutralNoise + 20,
    `expected quiet neutral compression ${quietNeutralCompression} to beat generic noise ${genericNeutralNoise}`,
  );
});

test("waitPlanTriggerObserved requires a structural reaction, not just a level touch", () => {
  const weakTouch = {
    close: 96.05,
    closeTime: "2026-01-01T00:14:59.999Z",
    high: 98,
    low: 95.8,
    open: 96,
    openTime: "2026-01-01T00:00:00.000Z",
    volume: 100,
  };
  const confirmedReaction = {
    ...weakTouch,
    close: 97.2,
    high: 97.4,
    low: 95.8,
    open: 96.1,
  };

  assert.equal(waitPlanTriggerObserved({
    candle: weakTouch,
    direction: "long",
    stopDistance: 4,
    triggerPrice: 96,
  }), false);
  assert.equal(waitPlanTriggerObserved({
    candle: confirmedReaction,
    direction: "long",
    stopDistance: 4,
    triggerPrice: 96,
  }), true);
});

test("waitPlanTriggerPrice anchors wait entries closer to the structural level", () => {
  assert.equal(waitPlanTriggerPrice({
    direction: "long",
    entry: 100,
    structuralStop: 94,
  }), 95.32);
  assert.equal(waitPlanTriggerPrice({
    direction: "short",
    entry: 100,
    structuralStop: 106,
  }), 104.68);
});

test("waitPlanTriggerPrice uses the explicit planned entry when the strategy provides one", () => {
  assert.equal(waitPlanTriggerPrice({
    direction: "long",
    entry: 100,
    plannedEntryPrice: 98.25,
    structuralStop: 96,
  }), 98.25);
  assert.equal(waitPlanTriggerPrice({
    direction: "short",
    entry: 100,
    plannedEntryPrice: 102.5,
    structuralStop: 104,
  }), 102.5);
});

test("waitPlanTriggerObserved rejects weak reactions that previously created premature wait entries", () => {
  const weakReaction = {
    close: 96.5,
    closeTime: "2026-01-01T00:14:59.999Z",
    high: 97,
    low: 95.8,
    open: 96.1,
    openTime: "2026-01-01T00:00:00.000Z",
    volume: 100,
  };

  assert.equal(waitPlanTriggerObserved({
    candle: weakReaction,
    direction: "long",
    stopDistance: 4,
    triggerPrice: 96,
  }), false);
});

test("waitPlanFollowThroughConfirmed requires a second confirmation after the first wait trigger", () => {
  const initialTrigger = {
    close: 97.35,
    closeTime: "2026-01-01T00:14:59.999Z",
    high: 97.6,
    low: 95.8,
    open: 96.2,
    openTime: "2026-01-01T00:00:00.000Z",
    volume: 100,
  };
  const weakFollowThrough = {
    close: 96.1,
    closeTime: "2026-01-01T00:29:59.999Z",
    high: 97.1,
    low: 95.9,
    open: 96.6,
    openTime: "2026-01-01T00:15:00.000Z",
    volume: 110,
  };
  const confirmedFollowThrough = {
    close: 96.82,
    closeTime: "2026-01-01T00:44:59.999Z",
    high: 97,
    low: 96,
    open: 96.2,
    openTime: "2026-01-01T00:30:00.000Z",
    volume: 120,
  };

  assert.equal(waitPlanFollowThroughConfirmed({
    direction: "long",
    future: [initialTrigger, weakFollowThrough],
    initialTriggerIndex: 0,
    stopDistance: 4,
    structuralStop: 94,
    triggerPrice: 96,
  }), null);
  assert.equal(waitPlanFollowThroughConfirmed({
    direction: "long",
    future: [initialTrigger, weakFollowThrough, confirmedFollowThrough],
    initialTriggerIndex: 0,
    stopDistance: 4,
    structuralStop: 94,
    triggerPrice: 96,
  }), 2);
});

test("wait plan metrics only audit actionable non-late non-risk-review wait plans", () => {
  const waitNode = (overrides: Partial<ProfessionalAuditRoundNode>): ProfessionalAuditRoundNode => ({
    capturedByRadar: true,
    coinType: "midcap_trend",
    coinTypeLabel: "中盘趋势",
    confidence: 70,
    direction: "long",
    findingCount: 0,
    hit: false,
    lateAtSelection: false,
    maePct: 1,
    maturity: "EVIDENCE_SIGNAL",
    mfePct: 2,
    moveAtSelectionPct: 2,
    nodeIndex: 1,
    nodeRole: "pullback_retest",
    observedAt: "2026-01-01T00:00:00.000Z",
    opportunityLane: "pullback_retest",
    opportunityLaneLabel: "回踩/反抽确认机会",
    opportunityLaneScore: 80,
    opportunityQuality: "watch_only",
    opportunityQualityLabel: "值得观察但不能做",
    planBlockers: ["reaction_not_confirmed"],
    qualityHit: false,
    radarRank: 1,
    radarScore: 120,
    rewardRisk: 4,
    selectedAsOpportunity: true,
    selectedLane: "pullback_retest",
    symbol: "TESTUSDT",
    timeframeBand: "medium",
    topN: 10,
    tradePlanStatus: "WAIT_PULLBACK",
    validationWindowBars: 96,
    validationWindowHours: 24,
    validationWindowLabel: "24h",
    volumeRatio: 1.2,
    waitPlanEvaluation: {
      barsToTrigger: 4,
      diagnosticFlags: ["stop_first_after_trigger", "adverse_pressure_dominates_after_trigger"],
      label: "等待触发后先到止损",
      maxAdverseAfterTriggerPct: 1.1,
      maxFavorableAfterTriggerPct: 0.5,
      outcome: "bad_wait",
      postTriggerRewardRisk: 4.1,
      reason: "test",
      status: "triggered_sl_first",
      stopHit: true,
      targetHit: false,
      triggerObservedAt: "2026-01-01T01:00:00.000Z",
      triggerPrice: 1,
      triggerQualityScore: 78,
    },
    ...overrides,
  });
  const actionable = waitNode({ symbol: "ACTIONUSDT" });
  const riskReview = waitNode({
    lateAtSelection: true,
    nodeRole: "late_extension",
    opportunityLane: "risk_review",
    opportunityLaneLabel: "风险复盘教材",
    symbol: "RISKUSDT",
  });
  const lateButNotRiskReview = waitNode({
    lateAtSelection: true,
    symbol: "LATEUSDT",
  });
  const rrBelow = waitNode({
    rewardRisk: 2.4,
    symbol: "RRLOWUSDT",
  });

  assert.equal(isActionableWaitPlanNode(actionable), true);
  assert.equal(isActionableWaitPlanNode(riskReview), false);
  assert.equal(isActionableWaitPlanNode(lateButNotRiskReview), false);
  assert.equal(isActionableWaitPlanNode(rrBelow), false);

  const metrics = buildWaitPlanMetrics([
    actionable,
    riskReview,
    lateButNotRiskReview,
    rrBelow,
  ]);

  assert.equal(metrics.totalWaitPlans, 1);
  assert.equal(metrics.stopFirstCount, 1);
  assert.equal(metrics.badWaitRatePct, 100);
  assert.equal(metrics.avgTriggerQualityScore, 78);
  assert.equal(metrics.diagnosticBreakdown[0]?.code, "adverse_pressure_dominates_after_trigger");
  assert.equal(metrics.diagnosticBreakdown.find((item) => item.code === "stop_first_after_trigger")?.label, "触发后先打结构止损");
});

test("opportunityLaneScore keeps pullback retest ranking from being compressed by early setup noise caps", () => {
  const pullbackRetest = opportunityLaneScore({
    compressionPct: 48,
    direction: "long",
    lateAtSelection: false,
    movePct: 4.1,
    nodeRole: "pullback_retest",
    radarScore: 118,
    rangePositionPct: 44,
    timeframeBand: "medium",
    volumeRatio: 0.92,
  });

  assert.ok(
    pullbackRetest > 135,
    `expected pullback retest score ${pullbackRetest} to preserve its structural radar strength`,
  );
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

test("classifyProfessionalAuditOpportunityQuality separates early setups, watch-only, late, fakeout and ready plans", () => {
  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 36,
    direction: "long",
    lateAtSelection: false,
    movePct: 1.8,
    nodeRole: "pre_move",
    opportunityLane: "early_setup",
    planBlockers: ["structure_confirmation_pending"],
    rangePositionPct: 42,
    rewardRisk: 3.4,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 0.88,
  }), "premium_early_setup");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 44,
    direction: "short",
    lateAtSelection: false,
    movePct: -2.4,
    nodeRole: "breakout_edge",
    opportunityLane: "early_setup",
    planBlockers: ["structure_confirmation_pending"],
    rangePositionPct: 58,
    rewardRisk: 2.4,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_RETEST",
    volumeRatio: 1.12,
  }), "premium_early_setup");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 68,
    direction: "long",
    lateAtSelection: false,
    movePct: 6.4,
    nodeRole: "medium_swing",
    opportunityLane: "pullback_retest",
    planBlockers: ["reaction_not_confirmed"],
    rangePositionPct: 88,
    rewardRisk: 2.7,
    timeframeBand: "medium",
    tradePlanStatus: "WAIT_PULLBACK",
    volumeRatio: 3.1,
  }), "watch_only");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 58,
    direction: "long",
    lateAtSelection: false,
    maturity: "TRADE_PLAN_READY",
    movePct: 3.2,
    nodeRole: "pullback_retest",
    opportunityLane: "pullback_retest",
    planBlockers: [],
    rangePositionPct: 52,
    rewardRisk: 3.6,
    timeframeBand: "medium",
    tradePlanStatus: "TRADE_PLAN_READY",
    volumeRatio: 1.2,
  }), "trade_plan_ready");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 74,
    direction: "long",
    lateAtSelection: true,
    movePct: 13,
    nodeRole: "late_extension",
    opportunityLane: "risk_review",
    planBlockers: [],
    rangePositionPct: 92,
    rewardRisk: 1.4,
    timeframeBand: "small",
    tradePlanStatus: "BLOCKED",
    volumeRatio: 3.4,
  }), "late_move");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 61,
    direction: "short",
    lateAtSelection: false,
    movePct: -5.1,
    nodeRole: "fakeout_or_invalidation",
    opportunityLane: "risk_review",
    planBlockers: ["support_lost"],
    rangePositionPct: 8,
    rewardRisk: 3.2,
    timeframeBand: "small",
    tradePlanStatus: "WAIT_RETEST",
    volumeRatio: 1.7,
  }), "fakeout_risk");

  assert.equal(classifyProfessionalAuditOpportunityQuality({
    compressionPct: 82,
    direction: "long",
    lateAtSelection: false,
    movePct: 0.4,
    nodeRole: "neutral_random",
    opportunityLane: "early_setup",
    planBlockers: ["neutral_direction"],
    rangePositionPct: 5,
    rewardRisk: null,
    timeframeBand: "small",
    tradePlanStatus: "WATCH_ONLY",
    volumeRatio: 0.18,
  }), "noise");
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

test("isScanActionableOpportunityNode excludes structurally untradeable scan samples from scan score denominators", () => {
  assert.equal(isScanActionableOpportunityNode({
    opportunityLane: "early_setup",
    planBlockers: ["structure_confirmation_pending"],
  }), true);
  assert.equal(isScanActionableOpportunityNode({
    opportunityLane: "early_setup",
    planBlockers: ["reward_risk_below_minimum"],
  }), true);
  assert.equal(isScanActionableOpportunityNode({
    opportunityLane: "pullback_retest",
    planBlockers: ["bull_structure_broken"],
  }), false);
  assert.equal(isScanActionableOpportunityNode({
    opportunityLane: "pullback_retest",
    planBlockers: ["chase_risk"],
  }), true);
  assert.equal(isScanActionableOpportunityNode({
    opportunityLane: "risk_review",
    planBlockers: [],
  }), false);
});

test("professionalAuditPlanBlockerLabel maps rr blockers to readable Chinese", () => {
  assert.equal(professionalAuditPlanBlockerLabel("reward_risk_below_minimum"), "结构盈亏比低于 3:1");
  assert.equal(professionalAuditPlanBlockerLabel("reward_risk_2.40R_below_3R"), "结构盈亏比不足或未知");
  assert.equal(professionalAuditPlanBlockerLabel("support_lost"), "支撑位失守");
  assert.equal(professionalAuditPlanBlockerLabel("trade_plan_not_ready"), "交易计划未就绪");
  assert.equal(professionalAuditPlanBlockerLabel("no_recent_touch"), "近期没有触碰关键位");
  assert.equal(professionalAuditPlanBlockerLabel("no_relevant_level"), "缺少可验证关键位");
  assert.equal(professionalAuditPlanBlockerLabel("位置/RR"), "结构盈亏比不足或未知");
  assert.equal(professionalAuditPlanBlockerLabel("周期冲突"), "多周期结构冲突");
});

test("tradePlanBlockers does not count neutral watch-only samples as reward-risk unknown", () => {
  const blockers = tradePlanBlockers({
    direction: "neutral",
    maturity: {
      canAttachTradePlan: false,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "证据融合信号",
      reasons: ["has_structured_evidence"],
      stage: "EVIDENCE_SIGNAL",
    },
    strategyV3: {
      tradePlan: {
        blockedBy: ["neutral_direction"],
        rewardRisk: null,
        status: "WATCH_ONLY",
      },
    },
  } as unknown as MarketSignal);

  assert.deepEqual(blockers, ["neutral_direction"]);
});

test("professionalAuditContextualPlanBlockers separates quiet direction-pending setups from useless neutral signals", () => {
  const signal = {
    direction: "neutral",
    maturity: {
      canAttachTradePlan: false,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "证据融合信号",
      reasons: ["has_structured_evidence"],
      stage: "EVIDENCE_SIGNAL",
    },
    strategyV3: {
      tradePlan: {
        blockedBy: ["neutral_direction"],
        rewardRisk: null,
        status: "WATCH_ONLY",
      },
    },
  } as unknown as MarketSignal;
  const blockers = professionalAuditContextualPlanBlockers(signal, {
    compressionPct: 54,
    lateAtSelection: false,
    movePct: 0.11,
    nodeRole: "neutral_random",
    opportunityLane: "early_setup",
    rangePositionPct: 49,
    volumeRatio: 0.82,
  });
  const genericBlockers = professionalAuditContextualPlanBlockers(signal, {
    compressionPct: 82,
    lateAtSelection: false,
    movePct: 0.11,
    nodeRole: "neutral_random",
    opportunityLane: "early_setup",
    rangePositionPct: 49,
    volumeRatio: 0.82,
  });

  assert.equal(blockers.includes("neutral_direction"), false);
  assert.ok(blockers.includes("direction_pending_quiet_setup"));
  assert.ok(blockers.includes("structure_confirmation_pending"));
  assert.deepEqual(genericBlockers, ["neutral_direction"]);
});

test("professionalAuditContextualPlanBlockers turns untouched early setups into wait-for-reaction blockers", () => {
  const signal = {
    direction: "long",
    maturity: {
      canAttachTradePlan: true,
      canEnterMainSignalArea: true,
      canRequestAiReview: true,
      label: "证据融合信号",
      reasons: ["has_structured_evidence"],
      stage: "EVIDENCE_SIGNAL",
    },
    strategyV3: {
      tradePlan: {
        blockedBy: ["no_recent_touch"],
        isPlanEligible: false,
        rewardRisk: 3.4,
        status: "WAIT_PULLBACK",
      },
    },
  } as unknown as MarketSignal;
  const blockers = professionalAuditContextualPlanBlockers(signal, {
    compressionPct: 54,
    lateAtSelection: false,
    movePct: 2.1,
    nodeRole: "breakout_edge",
    opportunityLane: "early_setup",
    rangePositionPct: 52,
    volumeRatio: 0.94,
  });

  assert.equal(blockers.includes("no_recent_touch"), false);
  assert.ok(blockers.includes("reaction_not_confirmed"));
  assert.ok(blockers.includes("structure_confirmation_pending"));
});

test("buildPlanBlockerMetrics classifies blockers and separates likely false kills from guardrails", () => {
  const auditNode = (overrides: Partial<ProfessionalAuditRoundNode>): ProfessionalAuditRoundNode => ({
    capturedByRadar: true,
    coinType: "midcap_trend",
    coinTypeLabel: "中盘趋势",
    confidence: 70,
    direction: "long",
    findingCount: 0,
    hit: false,
    lateAtSelection: false,
    maePct: 1,
    maturity: "EVIDENCE_SIGNAL",
    mfePct: 4,
    moveAtSelectionPct: 1.2,
    nodeIndex: 1,
    nodeRole: "pre_move",
    observedAt: "2026-01-01T00:00:00.000Z",
    opportunityLane: "early_setup",
    opportunityLaneLabel: "启动前机会",
    opportunityLaneScore: 82,
    opportunityQuality: "premium_early_setup",
    opportunityQualityLabel: "优质启动前",
    planBlockers: ["reward_risk_below_minimum"],
    qualityHit: true,
    radarRank: 3,
    radarScore: 120,
    rewardRisk: 2.8,
    selectedAsOpportunity: true,
    selectedLane: "early_setup",
    symbol: "TESTUSDT",
    timeframeBand: "small",
    topN: 10,
    tradePlanStatus: "WAIT_PULLBACK",
    validationWindowBars: 16,
    validationWindowHours: 4,
    validationWindowLabel: "4h",
    volumeRatio: 1.4,
    waitPlanEvaluation: {
      barsToTrigger: null,
      diagnosticFlags: [],
      label: "不是等待型计划",
      maxAdverseAfterTriggerPct: null,
      maxFavorableAfterTriggerPct: null,
      outcome: "not_applicable",
      postTriggerRewardRisk: null,
      reason: "test",
      status: "not_wait_plan",
      stopHit: false,
      targetHit: false,
      triggerObservedAt: null,
      triggerPrice: null,
      triggerQualityScore: null,
    },
    ...overrides,
  });

  const metrics = buildPlanBlockerMetrics([
    auditNode({ symbol: "RRUSDT" }),
    auditNode({
      lateAtSelection: true,
      nodeRole: "late_extension",
      opportunityLane: "risk_review",
      opportunityLaneLabel: "风险复盘教材",
      planBlockers: ["chase_risk"],
      qualityHit: false,
      symbol: "LATEUSDT",
      tradePlanStatus: "BLOCKED",
    }),
  ]);
  const rrMetric = metrics.find((metric) => metric.blocker === "reward_risk_below_minimum");
  const chaseMetric = metrics.find((metric) => metric.blocker === "chase_risk");

  assert.equal(rrMetric?.category, "rr");
  assert.equal(rrMetric?.diagnosis, "needs_level_audit");
  assert.equal(rrMetric?.qualityHitCount, 1);
  assert.equal(rrMetric?.conditionalWaitCount, 1);
  assert.equal(rrMetric?.sampleContexts[0]?.symbol, "RRUSDT");
  assert.equal(chaseMetric?.category, "risk");
  assert.equal(chaseMetric?.diagnosis, "reasonable_guardrail");
  assert.equal(chaseMetric?.lateCount, 1);
  assert.equal(chaseMetric?.riskReviewCount, 1);
});

test("buildLevelQualityMetrics splits RR stop and target blockers into actionable diagnostics", () => {
  const metrics = buildLevelQualityMetrics([
    {
      blocker: "reward_risk_below_minimum",
      capturedCount: 1,
      category: "rr",
      conditionalWaitCount: 1,
      count: 3,
      diagnosis: "needs_level_audit",
      label: "结构盈亏比低于 3:1",
      lateCount: 0,
      qualityHitCount: 2,
      riskReviewCount: 0,
      sampleContexts: [{
        capturedByRadar: true,
        hit: true,
        lateAtSelection: false,
        nodeRole: "pre_move",
        opportunityLane: "early_setup",
        qualityHit: true,
        rewardRisk: 2.4,
        symbol: "RRUSDT",
        tradePlanStatus: "WAIT_PULLBACK",
      }],
      sampleSymbols: ["RRUSDT"],
    },
    {
      blocker: "stop_distance_too_wide",
      capturedCount: 0,
      category: "stop_target",
      conditionalWaitCount: 0,
      count: 2,
      diagnosis: "needs_level_audit",
      label: "止损距离过宽",
      lateCount: 0,
      qualityHitCount: 0,
      riskReviewCount: 0,
      sampleContexts: [],
      sampleSymbols: ["WIDEUSDT"],
    },
    {
      blocker: "位置/RR",
      capturedCount: 0,
      category: "rr",
      conditionalWaitCount: 0,
      count: 1,
      diagnosis: "needs_level_audit",
      label: "结构盈亏比不足或未知",
      lateCount: 0,
      qualityHitCount: 0,
      riskReviewCount: 0,
      sampleContexts: [],
      sampleSymbols: ["TARGETUSDT"],
    },
  ]);

  assert.equal(metrics[0]?.blocker, "reward_risk_below_minimum");
  assert.equal(metrics[0]?.primaryReason, "rr_below_minimum");
  assert.equal(metrics[0]?.qualityHitRatePct, 66.67);
  assert.match(metrics[0]?.nextAction ?? "", /不降低 3:1/);
  assert.equal(metrics.find((metric) => metric.blocker === "stop_distance_too_wide")?.primaryReason, "stop_too_wide");
  assert.equal(metrics.find((metric) => metric.blocker === "位置/RR")?.primaryReason, "target_projection_too_near");
});

test("runProfessionalAuditRound reports scan analysis and strategy core capability scorecards", () => {
  const candlesBySymbol = new Map<string, Candle[]>([
    ["TIAUSDT", sidewaysSeries(260)],
    ["ARBUSDT", sidewaysSeries(260).map((item, index) => ({
      ...item,
      close: item.close * (1 + Math.sin(index / 13) * 0.01),
      high: item.high * (1 + Math.sin(index / 13) * 0.01),
      low: item.low * (1 + Math.sin(index / 13) * 0.01),
      open: item.open * (1 + Math.sin(index / 13) * 0.01),
    }))],
  ]);
  const report = runProfessionalAuditRound({
    candlesBySymbol,
    options: {
      candidateUniverseSize: 2,
      generatedAt: "2026-01-10T00:00:00.000Z",
      nodesPerSymbol: 2,
      symbols: [{
        coinType: "layer1_layer2",
        coinTypeLabel: "L1 / L2",
        symbol: "TIAUSDT",
      }],
      topN: 1,
    },
  });

  assert.deepEqual(report.coreCapabilityMetrics.map((item) => item.id), ["scan", "analysis", "strategy"]);
  for (const metric of report.coreCapabilityMetrics) {
    assert.ok(["fail", "pass", "watch"].includes(metric.status));
    assert.equal(typeof metric.score, "number");
    assert.equal(typeof metric.summary, "string");
    assert.ok(metric.summary.length > 0);
  }
  assert.ok(report.findings.some((item) => item.id.startsWith("PBA-CORE-")));
  assert.equal(report.waitPlanMetrics.label, "等待型计划后验");
  assert.ok(Array.isArray(report.pressureTestMetrics));
  assert.ok(report.pressureTestMetrics.length > 0);
  assert.ok(Array.isArray(report.marketRegimeMetrics));
  assert.ok(Array.isArray(report.ruleStabilityMetrics));
  assert.ok(Array.isArray(report.levelQualityMetrics));
  if (report.planBlockerMetrics[0]) {
    assert.equal(typeof report.planBlockerMetrics[0].category, "string");
    assert.equal(typeof report.planBlockerMetrics[0].diagnosis, "string");
    assert.equal(typeof report.planBlockerMetrics[0].qualityHitCount, "number");
    assert.ok(Array.isArray(report.planBlockerMetrics[0].sampleContexts));
  }
  assert.ok(report.auditRound?.nodes.every((node) => node.waitPlanEvaluation.status));
});
