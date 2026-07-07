import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnrichmentGateReport,
  enrichShadowScanSignals,
} from "./enrichment";
import type { ShadowScanSignalInput } from "./storage";

function unifiedDecision(decision: "OBSERVE" | "WAIT" | "BLOCKED" | "TRADE_PLAN_READY") {
  return {
    blockers: decision === "BLOCKED" ? [{ reason: "高周期压制", unblockCondition: "突破压力后重评" }] : [],
    blockerReasons: decision === "BLOCKED" ? ["高周期压制"] : [],
    decision,
    readyPlan: decision === "TRADE_PLAN_READY" ? { entry: 1, stop: 0.9, targets: [1.3], riskReward: 3 } : undefined,
    reasons: [`${decision}_reason`],
    waitPlan: decision === "WAIT"
      ? {
        confirmation: "放量突破后确认",
        invalidation: "跌回箱体",
        trigger: "突破前高",
        whyNotNow: "还没有确认突破",
      }
      : undefined,
  };
}

test("enrichment keeps scan embedded unifiedDecision as first priority", () => {
  const signals: ShadowScanSignalInput[] = [{
    symbol: "TIAUSDT",
    unifiedDecision: unifiedDecision("WAIT"),
  }];
  const result = enrichShadowScanSignals(signals, {
    radarContract: {
      contract: {
        radarSignals: {
          data: [{
            symbol: "TIAUSDT",
            unifiedDecision: unifiedDecision("BLOCKED"),
          }],
        },
      },
    },
  });

  assert.equal(result.report.gate, "pass");
  assert.equal(result.signals[0]?.shadowEnrichment?.source, "scan_embedded_unified_decision");
  assert.equal(result.signals[0]?.unifiedDecision, signals[0]?.unifiedDecision);
});

test("enrichment fills missing scan decision from production radar contract", () => {
  const signals: ShadowScanSignalInput[] = [{ symbol: "ARBUSDT" }];
  const result = enrichShadowScanSignals(signals, {
    radarContract: {
      contract: {
        radarSignals: {
          data: [{
            symbol: "ARBUSDT",
            maturity: { stage: "DEEP_SCAN_CANDIDATE" },
            unifiedDecision: unifiedDecision("WAIT"),
          }],
        },
      },
    },
  });

  assert.equal(result.report.gate, "pass");
  assert.equal(result.signals[0]?.shadowEnrichment?.source, "production_contract_enrichment");
  assert.equal(result.signals[0]?.waitPlan?.trigger, "突破前高");
});

test("enrichment gate fails when overall coverage is below 80 percent", () => {
  const signals: ShadowScanSignalInput[] = [
    { symbol: "AUSDT", unifiedDecision: unifiedDecision("OBSERVE") },
    { symbol: "BUSDT" },
    { symbol: "CUSDT" },
    { symbol: "DUSDT" },
    { symbol: "EUSDT" },
  ].map((signal) => signal.unifiedDecision
    ? {
      ...signal,
      shadowEnrichment: {
        source: "scan_embedded_unified_decision",
        sourceContract: "/api/scan",
        status: "complete",
        warnings: [],
      },
    } as ShadowScanSignalInput
    : signal);

  const report = buildEnrichmentGateReport(signals);

  assert.equal(report.gate, "partial");
  assert.ok(report.errors.some((item) => item.startsWith("overall_enrichment_coverage_below_required")));
});

test("enrichment gate requires WAIT/BLOCKED/READY decision details to be complete", () => {
  const incompleteWait: ShadowScanSignalInput = {
    shadowEnrichment: {
      source: "scan_embedded_unified_decision",
      sourceContract: "/api/scan",
      status: "complete",
      warnings: [],
    },
    symbol: "WAITUSDT",
    unifiedDecision: {
      decision: "WAIT",
      waitPlan: {
        confirmation: "",
        invalidation: "",
        trigger: "",
        whyNotNow: "",
      },
    },
  };
  const completeBlocked: ShadowScanSignalInput = {
    shadowEnrichment: {
      source: "scan_embedded_unified_decision",
      sourceContract: "/api/scan",
      status: "complete",
      warnings: [],
    },
    symbol: "BLOCKUSDT",
    unifiedDecision: unifiedDecision("BLOCKED"),
  };

  const report = buildEnrichmentGateReport([incompleteWait, completeBlocked]);

  assert.equal(report.nonObserveCoverage, 0.5);
  assert.equal(report.gate, "partial");
  assert.ok(report.nonObserveMissingSymbols.includes("WAITUSDT"));
});
