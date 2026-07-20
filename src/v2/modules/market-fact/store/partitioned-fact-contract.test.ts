import assert from "node:assert/strict";
import test from "node:test";
import { evaluateM1FactStorageCapacity } from "./partitioned-fact-contract";

const policy = {
  maxPartitionBytes: 1_000,
  maxTotalBytes: 3_000,
  requiredCoverageStart: "2026-07-20T00:00:00.000Z",
  requiredCoverageEnd: "2026-07-22T00:00:00.000Z",
} as const;

function partition(day: 20 | 21, bytes = 500) {
  const next = day + 1;
  return {
    partitionName: `point_in_time_market_fact_ledger_p202607${day}`,
    lowerBound: `2026-07-${day}T00:00:00.000Z`,
    upperBound: `2026-07-${next}T00:00:00.000Z`,
    totalBytes: bytes,
    estimatedRows: 100,
    createdAt: "2026-07-19T00:00:00.000Z",
    releaseId: "m1-6-contract-test",
  };
}

test("passes only for a contiguous bounded partition window", () => {
  const report = evaluateM1FactStorageCapacity({
    partitions: [partition(21), partition(20)],
    policy,
  });

  assert.equal(report.status, "PASS");
  assert.equal(report.partitionCount, 2);
  assert.equal(report.estimatedRows, 200);
  assert.deepEqual(report.reasonCodes, []);
});

test("keeps empty partition evidence insufficient", () => {
  const report = evaluateM1FactStorageCapacity({ partitions: [], policy });

  assert.equal(report.status, "INSUFFICIENT_EVIDENCE");
  assert.deepEqual(report.reasonCodes, [
    "market_fact_partition_inventory_empty",
  ]);
});

test("blocks gaps, missing write horizon and exceeded watermarks", () => {
  const report = evaluateM1FactStorageCapacity({
    partitions: [partition(20, 1_500)],
    policy,
  });

  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(report.reasonCodes, [
    "market_fact_partition_capacity_watermark_exceeded",
    "market_fact_required_partition_window_missing",
  ]);
});
