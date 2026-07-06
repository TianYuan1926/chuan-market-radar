import {
  goldenCaseFixtures,
} from "./golden-case-fixtures";
import type {
  GoldenCaseDecision,
  GoldenCaseFailure,
  GoldenCaseFixture,
  GoldenCaseRunSummary,
  GoldenCaseCategory,
  GoldenCaseDirection,
} from "./golden-case-types";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function deriveDirection(fixture: GoldenCaseFixture): GoldenCaseDirection {
  const { facts } = fixture;

  if (facts.highTimeframeConflict) {
    return facts.closePositionPct >= 50 ? "long" : "short";
  }

  if (facts.priceAction === "dumped" || facts.priceAction === "retest_failed") {
    return "short";
  }

  if (
    facts.priceAction === "accumulating" ||
    facts.priceAction === "breakout_confirmed" ||
    facts.priceAction === "pullback_reaction" ||
    facts.priceAction === "pumped"
  ) {
    return "long";
  }

  if (facts.priceAction === "breakout_failed") {
    return "short";
  }

  if (facts.fundingState === "crowded" && facts.oiState === "spiking") {
    return facts.closePositionPct >= 75 ? "long" : facts.closePositionPct <= 25 ? "short" : "neutral";
  }

  if (facts.closePositionPct >= 78 && facts.volumeState === "rising") {
    return "long";
  }

  return "neutral";
}

function deriveCategory(fixture: GoldenCaseFixture): GoldenCaseCategory {
  const { facts } = fixture;

  if (facts.highTimeframeConflict) {
    return "high_timeframe_conflict";
  }

  if (facts.priceAction === "breakout_failed") {
    return "fakeout";
  }

  if (
    facts.priceAction === "exhaustion" ||
    (facts.priceAction === "pumped" && facts.fundingState !== "neutral" && facts.oiState === "spiking") ||
    (facts.oiState === "spiking" && facts.fundingState !== "neutral" && facts.priceAction === "compression")
  ) {
    return "exhaustion";
  }

  if (facts.rewardRisk !== null && facts.rewardRisk < 3 && facts.priceAction !== "pumped" && facts.priceAction !== "dumped") {
    return "rr_gate";
  }

  if (facts.priceAction === "pumped" || facts.priceAction === "dumped") {
    return "late_move";
  }

  if (facts.waitTriggerQuality && facts.waitTriggerQuality !== "none" && facts.priceAction === "pullback_reaction") {
    return "wait_plan";
  }

  if (facts.priceAction === "breakout_confirmed") {
    return "breakout";
  }

  if (facts.priceAction === "accumulating") {
    return "accumulation";
  }

  return "compression";
}

function riskScore(fixture: GoldenCaseFixture) {
  const { facts } = fixture;
  let score = 20;

  if (facts.fundingState === "elevated") {
    score += 15;
  }

  if (facts.fundingState === "crowded") {
    score += 28;
  }

  if (facts.oiState === "spiking") {
    score += 22;
  }

  if (facts.highTimeframeConflict) {
    score += 22;
  }

  if (facts.rewardRisk === null || facts.rewardRisk < 3) {
    score += 18;
  }

  if (facts.stopDistancePct > 6) {
    score += 16;
  }

  if (facts.closePositionPct >= 90 || facts.closePositionPct <= 10) {
    score += 18;
  }

  if (facts.compressionPct >= 65 && facts.fundingState === "neutral") {
    score -= 8;
  }

  return clamp(Math.round(score));
}

function blockersFor(fixture: GoldenCaseFixture, category: GoldenCaseCategory) {
  const { facts } = fixture;
  const blockers: string[] = [];

  if (category === "compression" || category === "accumulation") {
    blockers.push("structure_confirmation_pending");
  }

  if (category === "high_timeframe_conflict") {
    blockers.push("timeframe_conflict");
  }

  if (category === "fakeout") {
    blockers.push("structure_invalidated");
  }

  if (category === "exhaustion") {
    blockers.push(facts.oiState === "spiking" && facts.priceAction === "compression" ? "crowding_risk" : "exhaustion_risk");
  }

  if (category === "late_move" || facts.closePositionPct >= 90 || facts.closePositionPct <= 10) {
    blockers.push("chase_risk");
  }

  if (facts.rewardRisk === null || facts.rewardRisk < 3) {
    blockers.push("reward_risk_below_minimum");
  }

  if (facts.stopDistancePct > 6) {
    blockers.push("stop_distance_too_wide");
  }

  if (facts.waitTriggerQuality === "invalid") {
    blockers.push("wait_trigger_invalid");
  }

  if (facts.waitTriggerQuality === "valid" && category === "wait_plan") {
    blockers.push("manual_review_required");
  }

  return [...new Set(blockers)];
}

export function evaluateGoldenCase(fixture: GoldenCaseFixture): GoldenCaseDecision {
  const category = deriveCategory(fixture);
  const direction = deriveDirection(fixture);
  const blockers = blockersFor(fixture, category);
  const risk = riskScore(fixture);
  const rrQualified = fixture.facts.rewardRisk !== null && fixture.facts.rewardRisk >= 3;
  const planReady = category === "breakout" &&
    rrQualified &&
    risk < 60 &&
    !fixture.facts.highTimeframeConflict &&
    fixture.facts.waitTriggerQuality !== "invalid";

  if (planReady) {
    return {
      blockers: [],
      category,
      direction,
      maturity: "TRADE_PLAN_READY",
      riskScore: risk,
      status: direction === "short" ? "READY_SHORT" : "READY_LONG",
      summary: "结构、资金质量、结构盈亏比和风险门控通过；仍然只允许人工复核，不自动执行。",
    };
  }

  if (category === "late_move" || category === "fakeout") {
    return {
      blockers,
      category,
      direction,
      maturity: "REVIEW_ONLY",
      riskScore: risk,
      status: category === "late_move" && fixture.id.includes("rsi") ? "WATCH_ONLY" : "BLOCKED",
      summary: "该样本更适合复盘或等待新位置，不能进入交易计划。",
    };
  }

  if (category === "exhaustion") {
    return {
      blockers,
      category,
      direction,
      maturity: fixture.id === "oi-spike-price-stalls" ? "EVIDENCE_SIGNAL" : "REVIEW_ONLY",
      riskScore: risk,
      status: fixture.facts.priceAction === "pumped" && blockers.includes("reward_risk_below_minimum")
        ? "BLOCKED"
        : "WATCH_ONLY",
      summary: "拥挤或衰竭风险优先，禁止追单。",
    };
  }

  if (category === "rr_gate") {
    return {
      blockers,
      category,
      direction,
      maturity: "EVIDENCE_SIGNAL",
      riskScore: risk,
      status: "BLOCKED",
      summary: "结构方向不等于能交易；结构盈亏比低于 3:1 必须拦截。",
    };
  }

  return {
    blockers,
    category,
    direction,
    maturity: "EVIDENCE_SIGNAL",
    riskScore: risk,
    status: direction === "short" || direction === "neutral" ? "WAIT_RETEST" : "WAIT_PULLBACK",
    summary: "样本只达到候选或证据层，必须等待结构确认或人工复核。",
  };
}

function checkFixture(fixture: GoldenCaseFixture, decision: GoldenCaseDecision) {
  const failures: GoldenCaseFailure[] = [];
  const { expected } = fixture;

  for (const field of ["category", "direction", "maturity", "status"] as const) {
    if (decision[field] !== expected[field]) {
      failures.push({
        actual: decision[field],
        expected: expected[field],
        field,
        message: `${fixture.id} expected ${field}=${expected[field]}, got ${decision[field]}`,
      });
    }
  }

  const actualAllowTradePlan = decision.maturity === "TRADE_PLAN_READY" &&
    (decision.status === "READY_LONG" || decision.status === "READY_SHORT");

  if (actualAllowTradePlan !== expected.allowTradePlan) {
    failures.push({
      actual: actualAllowTradePlan,
      expected: expected.allowTradePlan,
      field: "allowTradePlan",
      message: `${fixture.id} expected allowTradePlan=${expected.allowTradePlan}, got ${actualAllowTradePlan}`,
    });
  }

  for (const blocker of expected.requiredBlockers ?? []) {
    if (!decision.blockers.includes(blocker)) {
      failures.push({
        actual: decision.blockers,
        expected: blocker,
        field: "requiredBlockers",
        message: `${fixture.id} missing blocker ${blocker}`,
      });
    }
  }

  if (typeof expected.minRiskScore === "number" && decision.riskScore < expected.minRiskScore) {
    failures.push({
      actual: decision.riskScore,
      expected: `>= ${expected.minRiskScore}`,
      field: "riskScore",
      message: `${fixture.id} expected riskScore >= ${expected.minRiskScore}, got ${decision.riskScore}`,
    });
  }

  if (typeof expected.maxRiskScore === "number" && decision.riskScore > expected.maxRiskScore) {
    failures.push({
      actual: decision.riskScore,
      expected: `<= ${expected.maxRiskScore}`,
      field: "riskScore",
      message: `${fixture.id} expected riskScore <= ${expected.maxRiskScore}, got ${decision.riskScore}`,
    });
  }

  return failures;
}

export function runGoldenCases(fixtures: GoldenCaseFixture[] = goldenCaseFixtures): GoldenCaseRunSummary {
  const results = fixtures.map((fixture) => {
    const decision = evaluateGoldenCase(fixture);
    const failures = checkFixture(fixture, decision);

    return {
      decision,
      failures,
      fixture,
      passed: failures.length === 0,
    };
  });
  const passed = results.filter((result) => result.passed).length;

  return {
    failed: results.length - passed,
    generatedAt: new Date().toISOString(),
    passed,
    results,
    schemaVersion: "golden-case-run.v1",
    status: passed === results.length ? "passed" : "failed",
    total: results.length,
  };
}
