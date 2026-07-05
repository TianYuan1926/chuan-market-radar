import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MATURITY_DISPLAY_META,
  canAttachTradePlan,
  canEnterSniper,
  definitionForMaturity,
  nonMisleadingNoTradeReason,
  semanticStateForMaturity,
} from "./signal-state-semantics";

test("only a clean TRADE_PLAN_READY can enter sniper board", () => {
  assert.equal(canEnterSniper({ maturity: "TRADE_PLAN_READY", rr: 3, whyBlocked: null }), true);
  assert.equal(canEnterSniper({ maturity: "TRADE_PLAN_READY", rr: 2.99, whyBlocked: null }), false);
  assert.equal(canEnterSniper({ maturity: "TRADE_PLAN_READY", rr: 3, whyBlocked: "风控门禁拦截" }), false);
  assert.equal(canEnterSniper({ maturity: "EVIDENCE_SIGNAL", rr: 4, whyBlocked: null }), false);
  assert.equal(canEnterSniper({ maturity: "DEEP_SCAN_CANDIDATE", rr: 4, whyBlocked: null }), false);
});

test("evidence signal is an observation state, not a trade state", () => {
  const definition = definitionForMaturity("EVIDENCE_SIGNAL");

  assert.equal(MATURITY_DISPLAY_META.EVIDENCE_SIGNAL.label, "证据观察");
  assert.equal(semanticStateForMaturity("EVIDENCE_SIGNAL"), "EVIDENCE_SIGNAL");
  assert.equal(definition.canTrade, false);
  assert.equal(definition.canEnterSniper, false);
  assert.equal(canAttachTradePlan("EVIDENCE_SIGNAL"), false);
  assert.match(definition.boundary, /不能.*狙击榜/u);
});

test("candidate and waiting states always return a non-misleading no-trade reason", () => {
  assert.match(nonMisleadingNoTradeReason("LIGHT_SCAN_MARK"), /调度|主信号区/u);
  assert.match(nonMisleadingNoTradeReason("DEEP_SCAN_CANDIDATE"), /验证|交易信号/u);
  assert.match(nonMisleadingNoTradeReason("COOLDOWN"), /冷却/u);
});

test("blocked-like maturity stages map to blocked semantic state", () => {
  assert.equal(semanticStateForMaturity("BLOCKED"), "BLOCKED");
  assert.equal(semanticStateForMaturity("INVALIDATED"), "BLOCKED");
  assert.equal(definitionForMaturity("BLOCKED").canTrade, false);
  assert.equal(definitionForMaturity("INVALIDATED").canEnterSniper, false);
});
