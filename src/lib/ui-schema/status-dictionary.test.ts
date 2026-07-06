import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUIRED_UI_STATUS_KEYS,
  UI_STATUS_DICTIONARY,
  assertNoForbiddenStatusDisplay,
  forbiddenStatusDisplayMatches,
  normalizeDataStatusToUiStatus,
  uiStatusCanEnterSniper,
  uiStatusCanTrade,
  uiStatusLabel,
} from "./status-dictionary";
import {
  NON_TRADABLE_STATUSES,
  assertCanEnterSniper,
  assertCanShowTradePlan,
  isSafeObservationStatus,
} from "./status-rules";

test("status dictionary covers all required public states", () => {
  for (const key of REQUIRED_UI_STATUS_KEYS) {
    const definition = UI_STATUS_DICTIONARY[key];
    assert.equal(definition.internalStatus, key);
    assert.ok(definition.displayCn.length > 0);
    assert.ok(definition.descriptionCn.length > 0);
    assert.ok(definition.userAction.length > 0);
    assert.ok(definition.allowedPages.length > 0);
    assert.ok(Array.isArray(definition.forbiddenDisplayNames));
  }
});

test("evidence state is displayed as observation and cannot enter sniper", () => {
  assert.equal(uiStatusLabel("EVIDENCE_SIGNAL"), "证据观察");
  assert.equal(uiStatusCanTrade("EVIDENCE_SIGNAL"), false);
  assert.equal(uiStatusCanEnterSniper("EVIDENCE_SIGNAL"), false);
  assert.deepEqual(
    forbiddenStatusDisplayMatches("EVIDENCE_SIGNAL", "这是交易信号，可以进狙击目标"),
    ["交易信号", "狙击目标"],
  );
});

test("canonical user-facing labels use safe Chinese names", () => {
  assert.equal(uiStatusLabel("CANDIDATE"), "候选观察");
  assert.equal(uiStatusLabel("WAIT"), "等待条件");
  assert.equal(uiStatusLabel("OBSERVE"), "仅观察");
  assert.equal(uiStatusLabel("BLOCKED"), "风控阻断");
  assert.equal(uiStatusLabel("TRADE_PLAN_READY"), "交易计划就绪");
  assert.equal(uiStatusLabel("SERVED_CACHE"), "缓存快照");
  assert.equal(uiStatusLabel("STALE"), "数据过期");
  assert.equal(uiStatusLabel("PARTIAL"), "部分可用");
  assert.equal(uiStatusLabel("FAILED"), "数据失败");
});

test("only trade plan ready can enter sniper or show a trade plan", () => {
  for (const status of NON_TRADABLE_STATUSES) {
    assert.equal(isSafeObservationStatus(status), true);
    assert.throws(() => assertCanEnterSniper(status), /status_cannot_enter_sniper/u);
    assert.throws(() => assertCanShowTradePlan(status), /status_cannot_show_trade_plan/u);
  }

  assert.doesNotThrow(() => assertCanEnterSniper("TRADE_PLAN_READY"));
  assert.doesNotThrow(() => assertCanShowTradePlan("TRADE_PLAN_READY"));
});

test("TRADE is a decision-layer label and cannot enter the plan-ready board", () => {
  assert.equal(uiStatusCanTrade("TRADE"), true);
  assert.equal(uiStatusCanEnterSniper("TRADE"), false);
  assert.throws(() => assertCanEnterSniper("TRADE"), /status_cannot_enter_sniper/u);
  assert.doesNotThrow(() => assertCanEnterSniper("TRADE_PLAN_READY"));
});

test("cache and degraded data statuses normalize to non-live UI semantics", () => {
  assert.equal(normalizeDataStatusToUiStatus("cached"), "SERVED_CACHE");
  assert.equal(normalizeDataStatusToUiStatus("stale"), "STALE");
  assert.equal(normalizeDataStatusToUiStatus("partial"), "PARTIAL");
  assert.equal(normalizeDataStatusToUiStatus("failed"), "FAILED");
  assert.equal(normalizeDataStatusToUiStatus("unknown"), "UNKNOWN");

  for (const status of ["SERVED_CACHE", "STALE", "PARTIAL", "FAILED"] as const) {
    assert.equal(uiStatusCanTrade(status), false);
    assert.equal(uiStatusCanEnterSniper(status), false);
  }
});

test("forbidden labels are rejected for risky statuses", () => {
  assert.throws(
    () => assertNoForbiddenStatusDisplay("WAIT", "等待确认但这是交易信号"),
    /status_display_forbidden:WAIT/u,
  );
  assert.throws(
    () => assertNoForbiddenStatusDisplay("SERVED_CACHE", "刚更新，实时扫描"),
    /status_display_forbidden:SERVED_CACHE/u,
  );
});
