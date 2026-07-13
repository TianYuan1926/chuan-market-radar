import assert from "node:assert/strict";
import test from "node:test";

import { nextFixedRateRunAt } from "./worker-schedule.mjs";

test("nextFixedRateRunAt keeps cadence anchored to the prior scheduled slot", () => {
  assert.equal(nextFixedRateRunAt({
    intervalMs: 900_000,
    nowMs: 75_000,
    previousScheduledAtMs: 0,
  }), 900_000);
});

test("nextFixedRateRunAt skips missed slots without burst catch-up", () => {
  assert.equal(nextFixedRateRunAt({
    intervalMs: 900_000,
    nowMs: 1_850_000,
    previousScheduledAtMs: 0,
  }), 2_700_000);
});

test("nextFixedRateRunAt never returns a slot at or before now", () => {
  assert.equal(nextFixedRateRunAt({
    intervalMs: 900_000,
    nowMs: 900_000,
    previousScheduledAtMs: 0,
  }), 1_800_000);
});

test("nextFixedRateRunAt rejects invalid scheduling inputs", () => {
  assert.throws(() => nextFixedRateRunAt({
    intervalMs: 0,
    nowMs: 1,
    previousScheduledAtMs: 0,
  }), /intervalMs/);
});
