import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildSignalUiLayers,
  buildUiInformationLayers,
  validateUiInformationLayers,
} from "../../lib/ui-schema-guard";

test("L1 decision remains one of four canonical decisions", () => {
  for (const decision of ["TRADE", "WAIT", "BLOCKED", "OBSERVE"] as const) {
    const layers = buildUiInformationLayers({
      decision,
      reason: decision === "TRADE"
        ? "交易计划已经通过风控，仍需人工复核。"
        : "当前只用于观察和筛选，不构成交易计划。",
    });

    assert.equal(layers.l1.decision, decision);
    assert.equal(validateUiInformationLayers(layers).ok, true);
  }
});

test("technical terms are stripped from L2 and stay in collapsed L4", () => {
  const layers = buildUiInformationLayers({
    decision: "WAIT",
    reason: "RSI 和 MACD 还需要确认。",
    technical: [
      { label: "RSI", value: 58 },
      { label: "MACD", value: "cross pending" },
    ],
  });

  assert.equal(layers.l2.reason, "当前值得继续观察，但还缺少触发或风控确认。");
  assert.equal(layers.l4.collapsedByDefault, true);
  assert.deepEqual(layers.l4.metrics.map((metric) => metric.label), ["RSI", "MACD"]);
});

test("evidence observation never becomes trade in UI layers", () => {
  const layers = buildSignalUiLayers({
    maturity: "EVIDENCE_SIGNAL",
    rr: 9,
    whyBlocked: null,
    operatorRead: {
      headline: "已有证据，但仍缺少触发确认。",
    },
  });

  assert.equal(layers.l1.decision, "WAIT");
  assert.equal(validateUiInformationLayers(layers).ok, true);
});

test("dashboard renders the shared four-layer block instead of raw top-level metrics only", () => {
  const source = readFileSync("src/app/dashboard/page.tsx", "utf8");

  assert.match(source, /UiInformationLayerBlock layers=\{dashboardLayers\}/u);
  assert.match(source, /dashboardDecision/u);
  assert.match(source, /候选不等于计划，缓存不等于实时/u);
});

test("UI layer block hides internal L1 enum behind Chinese labels", () => {
  const source = readFileSync("src/components/ui-information-layers.tsx", "utf8");

  assert.match(source, /DECISION_LABEL/u);
  assert.match(source, /data-decision=\{layers\.l1\.decision\}/u);
  assert.doesNotMatch(source, />\{layers\.l1\.decision\}</u);
});
