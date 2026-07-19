import assert from "node:assert/strict";
import test from "node:test";
import { computeThreeVenuePriceDispersion } from "./decimal-dispersion";

test("computes the exact three-venue spread over median without float drift", () => {
  assert.equal(
    computeThreeVenuePriceDispersion(["42000.00", "42001.00", "41999.50"]),
    "0.000035714286",
  );
  assert.equal(
    computeThreeVenuePriceDispersion(["100", "100.0", "100.00"]),
    "0",
  );
});

test("is order invariant and deterministically rounded", () => {
  const prices = ["0.00001234", "0.00001250", "0.00001200"];
  const expected = computeThreeVenuePriceDispersion(prices);

  assert.equal(expected, "0.040518638574");
  assert.equal(
    computeThreeVenuePriceDispersion([prices[2]!, prices[0]!, prices[1]!]),
    expected,
  );
  for (let index = 0; index < 100; index += 1) {
    assert.equal(computeThreeVenuePriceDispersion(prices), expected);
  }
});

test("rejects incomplete, zero, negative, exponential and excessive precision input", () => {
  assert.equal(computeThreeVenuePriceDispersion(["1", "2"]), null);
  assert.equal(computeThreeVenuePriceDispersion(["0", "1", "2"]), null);
  assert.equal(computeThreeVenuePriceDispersion(["-1", "1", "2"]), null);
  assert.equal(computeThreeVenuePriceDispersion(["1e2", "100", "101"]), null);
  assert.equal(
    computeThreeVenuePriceDispersion(["1".repeat(129), "100", "101"]),
    null,
  );
  assert.equal(computeThreeVenuePriceDispersion(["1", "2", "3"], 19), null);
});
