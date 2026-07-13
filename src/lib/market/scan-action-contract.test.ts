import assert from "node:assert/strict";
import test from "node:test";

import { scanActionDisposition } from "./scan-action-contract";

test("scan action returns success only for a newly updated snapshot", () => {
  assert.deepEqual(scanActionDisposition("updated"), {
    httpStatus: 200,
    ok: true,
    retryable: false,
  });
});

test("scan action marks lock contention as retryable conflict", () => {
  assert.deepEqual(scanActionDisposition("in_progress"), {
    httpStatus: 409,
    ok: false,
    retryable: true,
  });
});

test("scan action never treats cached or failed attempts as success", () => {
  assert.equal(scanActionDisposition("served_cache").httpStatus, 503);
  assert.equal(scanActionDisposition("served_cache").ok, false);
  assert.equal(scanActionDisposition("failed").httpStatus, 503);
  assert.equal(scanActionDisposition("failed").ok, false);
});
