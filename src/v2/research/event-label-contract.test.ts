import assert from "node:assert/strict";
import test from "node:test";
import {
  EARLY_CAPTURE_CONTRACT,
  EXPANSION_THRESHOLD_DEFINITIONS,
  classifyCapture,
} from "./event-label-contract";

test("keeps event labels evaluation-only with three denominators", () => {
  assert.equal(EARLY_CAPTURE_CONTRACT.evaluationOnly, true);
  assert.equal(EARLY_CAPTURE_CONTRACT.liveModuleReadAllowed, false);
  assert.deepEqual(EARLY_CAPTURE_CONTRACT.requiredDenominators, [
    "candidate",
    "event",
    "matched_non_event",
  ]);
  assert.equal(EXPANSION_THRESHOLD_DEFINITIONS.length, 3);
});

test("classifies early, near-start, late and unavailable without ambiguity", () => {
  assert.equal(
    classifyCapture({
      dataAvailable: true,
      horizon: "60M",
      leadTimeSeconds: 900,
      moveConsumedFraction: 0.2,
    }),
    "EARLY_CAPTURE",
  );
  assert.equal(
    classifyCapture({
      dataAvailable: true,
      horizon: "60M",
      leadTimeSeconds: 120,
      moveConsumedFraction: 0.2,
    }),
    "NEAR_START",
  );
  assert.equal(
    classifyCapture({
      dataAvailable: true,
      horizon: "60M",
      leadTimeSeconds: -1,
      moveConsumedFraction: 0.2,
    }),
    "LATE",
  );
  assert.equal(
    classifyCapture({
      dataAvailable: false,
      horizon: "60M",
      leadTimeSeconds: 900,
      moveConsumedFraction: 0.2,
    }),
    "DATA_UNAVAILABLE",
  );
});
