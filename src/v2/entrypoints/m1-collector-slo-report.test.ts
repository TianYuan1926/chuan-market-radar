import assert from "node:assert/strict";
import test from "node:test";
import { runM1CollectorSloReport } from "./m1-collector-slo-report";

test("SLO CLI rejects incomplete, unknown and empty evidence inputs", async () => {
  await assert.rejects(
    () => runM1CollectorSloReport({ args: [] }),
    /options_rejected/u,
  );
  await assert.rejects(
    () => runM1CollectorSloReport({
      args: [
        "--input", "cycles.jsonl",
        "--profile", "WEAKENED",
        "--release-id", "release:test",
      ],
    }),
    /profile_rejected/u,
  );
  await assert.rejects(
    () => runM1CollectorSloReport({
      args: [
        "--input", "cycles.jsonl",
        "--profile", "EARLY_30_MINUTES",
        "--release-id", "release:test",
      ],
      evaluatedAt: "2026-01-15T00:31:00.000Z",
      readText: async () => "",
    }),
    /evidence is empty/u,
  );
});
