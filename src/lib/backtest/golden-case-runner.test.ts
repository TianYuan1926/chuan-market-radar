import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";
import {
  goldenCaseFixtures,
} from "./golden-case-fixtures";
import {
  evaluateGoldenCase,
  runGoldenCases,
} from "./golden-case-runner";

describe("golden case runner", () => {
  it("passes the canonical fixed cases", () => {
    const summary = runGoldenCases();

    assert.equal(summary.status, "passed");
    assert.equal(summary.failed, 0);
    assert.equal(summary.passed, goldenCaseFixtures.length);
    assert.equal(summary.total, 16);
  });

  it("blocks RR below 3:1 from becoming trade plan ready", () => {
    const fixture = goldenCaseFixtures.find((item) => item.id === "rr-below-minimum");

    assert.ok(fixture);

    const decision = evaluateGoldenCase(fixture);

    assert.equal(decision.status, "BLOCKED");
    assert.equal(decision.maturity, "EVIDENCE_SIGNAL");
    assert.ok(decision.blockers.includes("reward_risk_below_minimum"));
  });

  it("does not turn high-timeframe conflict into a ready plan", () => {
    const fixture = goldenCaseFixtures.find((item) => item.id === "low-tf-bull-high-tf-resistance");

    assert.ok(fixture);

    const decision = evaluateGoldenCase(fixture);

    assert.equal(decision.status, "WAIT_PULLBACK");
    assert.notEqual(decision.maturity, "TRADE_PLAN_READY");
    assert.ok(decision.blockers.includes("timeframe_conflict"));
  });

  it("allows only the quality breakout fixture to become trade plan ready", () => {
    const ready = goldenCaseFixtures
      .map((fixture) => ({
        decision: evaluateGoldenCase(fixture),
        fixture,
      }))
      .filter(({ decision }) => decision.maturity === "TRADE_PLAN_READY");

    assert.deepEqual(ready.map(({ fixture }) => fixture.id), ["quality-breakout"]);
    assert.equal(ready[0]?.decision.status, "READY_LONG");
  });
});
