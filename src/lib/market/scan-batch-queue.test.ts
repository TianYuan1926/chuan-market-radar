import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScanBatchPlan,
  normalizeScanAssets,
  scanWindowCursor,
} from "./scan-batch-queue";

test("normalizeScanAssets removes quote suffixes, blanks, and duplicates", () => {
  assert.deepEqual(
    normalizeScanAssets([" btc ", "ETHUSDT", "sui/usdt", "", "BTC", "ondo-usdt"]),
    ["BTC", "ETH", "SUI", "ONDO"],
  );
});

test("scanWindowCursor advances once per cadence window within the UTC day", () => {
  assert.equal(scanWindowCursor(new Date("2026-06-12T00:00:00.000Z"), 15), 0);
  assert.equal(scanWindowCursor(new Date("2026-06-12T00:14:59.000Z"), 15), 0);
  assert.equal(scanWindowCursor(new Date("2026-06-12T00:15:00.000Z"), 15), 1);
  assert.equal(scanWindowCursor(new Date("2026-06-12T01:00:00.000Z"), 30), 2);
});

test("buildScanBatchPlan selects the current low-rate batch and reports coverage", () => {
  const plan = buildScanBatchPlan({
    assets: ["BTC", "ETH", "SOL", "ENA", "SUI", "ONDO", "TIA"],
    batchSize: 3,
    cadenceMinutes: 15,
    now: new Date("2026-06-12T00:15:00.000Z"),
  });

  assert.deepEqual(plan.assets, ["ENA", "SUI", "ONDO"]);
  assert.equal(plan.batchIndex, 1);
  assert.equal(plan.totalBatches, 3);
  assert.equal(plan.nextBatchIndex, 2);
  assert.equal(plan.requestsPlanned, 3);
  assert.equal(plan.coveragePercent, 43);
});

test("buildScanBatchPlan caps invalid batch size to one request", () => {
  const plan = buildScanBatchPlan({
    assets: ["BTC", "ETH"],
    batchSize: 0,
    cadenceMinutes: 15,
    now: new Date("2026-06-12T00:00:00.000Z"),
  });

  assert.deepEqual(plan.assets, ["BTC"]);
  assert.equal(plan.batchSize, 1);
  assert.equal(plan.totalBatches, 2);
});
