import assert from "node:assert/strict";
import { test } from "node:test";

import { dataStatusToHealthLevel } from "./contracts/frontend-health-level";

test("only live frontend resources map to ready health", () => {
  assert.equal(dataStatusToHealthLevel("live"), "ready");
  assert.equal(dataStatusToHealthLevel("cached"), "degraded");
  assert.equal(dataStatusToHealthLevel("stale"), "degraded");
  assert.equal(dataStatusToHealthLevel("partial"), "degraded");
  assert.equal(dataStatusToHealthLevel("empty"), "degraded");
  assert.equal(dataStatusToHealthLevel("failed"), "blocked");
  assert.equal(dataStatusToHealthLevel("error"), "blocked");
});
