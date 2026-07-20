import assert from "node:assert/strict";
import test from "node:test";
import {
  parseM1CollectorObservationJsonLines,
} from "./collector-shadow-evidence";

test("rejects empty, malformed and non-cycle observation evidence", () => {
  assert.throws(
    () => parseM1CollectorObservationJsonLines(""),
    /evidence is empty/u,
  );
  assert.throws(
    () => parseM1CollectorObservationJsonLines("not-json"),
    /invalid JSON/u,
  );
  assert.throws(
    () => parseM1CollectorObservationJsonLines(JSON.stringify({
      event: "M1_COLLECTOR_CYCLE",
    })),
    /strict validation/u,
  );
});
