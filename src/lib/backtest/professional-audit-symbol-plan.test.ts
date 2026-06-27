import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditCandidateUniverse,
  buildAuditSymbolPlan,
} from "./professional-audit-symbol-plan";

const symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "AAVEUSDT",
  "UNIUSDT",
  "1000PEPEUSDT",
  "WIFUSDT",
  "FETUSDT",
  "TAOUSDT",
  "GALAUSDT",
  "PIXELUSDT",
  "BNBUSDT",
  "CAKEUSDT",
  "HYPEUSDT",
  "JUPUSDT",
  "ONDOUSDT",
  "INJUSDT",
  "BICOUSDT",
  "CELRUSDT",
  "SUIUSDT",
  "APTUSDT",
];

test("buildAuditSymbolPlan selects ten unique altcoins and excludes BTC ETH", () => {
  const plan = buildAuditSymbolPlan({
    roundSeed: "round-a",
    symbols,
    targetCount: 10,
  });

  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map((item) => item.symbol)).size, 10);
  assert.equal(plan.some((item) => item.symbol === "BTCUSDT" || item.symbol === "ETHUSDT"), false);
});

test("buildAuditSymbolPlan avoids previous round symbols when alternatives exist", () => {
  const previous = buildAuditSymbolPlan({
    roundSeed: "round-a",
    symbols,
    targetCount: 10,
  });
  const next = buildAuditSymbolPlan({
    avoidedSymbols: previous.map((item) => item.symbol),
    roundSeed: "round-b",
    symbols,
    targetCount: 10,
  });
  const overlap = next.filter((item) => previous.some((prev) => prev.symbol === item.symbol));

  assert.equal(next.length, 10);
  assert.equal(overlap.length, 0, `expected a fresh target set, got overlap: ${overlap.map((item) => item.symbol).join(", ")}`);
});

test("buildAuditCandidateUniverse keeps audit targets inside larger candidate pool", () => {
  const plan = buildAuditSymbolPlan({
    roundSeed: "round-c",
    symbols,
    targetCount: 10,
  });
  const universe = buildAuditCandidateUniverse({
    auditPlan: plan,
    symbols,
    targetCount: 18,
  });

  assert.equal(universe.length, 18);
  for (const target of plan) {
    assert.equal(universe.includes(target.symbol), true);
  }
});
