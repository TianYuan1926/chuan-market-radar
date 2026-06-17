import assert from "node:assert/strict";
import test from "node:test";

import type {
  StrategyEngineResult,
} from "../strategy/decision-engine";
import {
  generateChineseStrategyReport,
} from "./report-generator";

function result(overrides: Partial<StrategyEngineResult> = {}): StrategyEngineResult {
  return {
    stage: "COMPRESSION",
    decision: "WATCH_ONLY",
    riskGate: {
      allowed: true,
      blockedBy: [],
    },
    entryPlan: {
      mode: "none",
      waitFor: "no entry until gates are clean",
      trigger: null,
      invalidation: null,
    },
    exitPlan: {
      actions: [],
    },
    supportEvidenceIds: ["compression"],
    counterEvidenceIds: ["funding-risk"],
    ignoredExternalInputs: 0,
    ...overrides,
  };
}

test("report output includes evidence ids for traceability", () => {
  const report = generateChineseStrategyReport(result());

  assert.equal(report.decision, "WATCH_ONLY");
  assert.deepEqual(report.evidenceTrace.supportEvidenceIds, ["compression"]);
  assert.deepEqual(report.evidenceTrace.counterEvidenceIds, ["funding-risk"]);
  assert.match(report.sections.evidence, /compression/);
});

test("report generator cannot change the strategy decision", () => {
  const report = generateChineseStrategyReport(result({
    stage: "BREAKOUT_CONFIRM",
    decision: "BREAKOUT_CONFIRM_LONG",
  }));

  assert.equal(report.stage, "BREAKOUT_CONFIRM");
  assert.equal(report.decision, "BREAKOUT_CONFIRM_LONG");
});

test("report preserves conflict and invalidation states", () => {
  const conflictReport = generateChineseStrategyReport(result({
    stage: "CONFLICT",
    decision: "CONFLICT",
    riskGate: { allowed: false, blockedBy: ["high_weight_conflict"] },
  }));
  const invalidatedReport = generateChineseStrategyReport(result({
    stage: "INVALIDATED",
    decision: "INVALIDATED",
    riskGate: { allowed: false, blockedBy: ["structure_invalidated"] },
  }));

  assert.equal(conflictReport.decision, "CONFLICT");
  assert.match(conflictReport.sections.risk, /冲突/);
  assert.equal(invalidatedReport.decision, "INVALIDATED");
  assert.match(invalidatedReport.sections.risk, /失效/);
});

test("watch only report is not phrased as an entry instruction", () => {
  const report = generateChineseStrategyReport(result());
  const combined = Object.values(report.sections).join("\n");

  assert.doesNotMatch(combined, /入场|开仓|做多|追入/);
  assert.match(combined, /观察|等待/);
});
