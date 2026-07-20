import assert from "node:assert/strict";
import test from "node:test";
import { runM1CollectorEarlyShadowReport } from "./m1-collector-early-shadow-report";

test("early-shadow report CLI fails closed on ambiguous options and bad input", async () => {
  let readAttempted = false;
  await assert.rejects(
    runM1CollectorEarlyShadowReport({
      args: ["--input", "/tmp/evidence.jsonl"],
      readText: async () => {
        readAttempted = true;
        return "";
      },
    }),
    /options_rejected/u,
  );
  assert.equal(readAttempted, false);

  await assert.rejects(
    runM1CollectorEarlyShadowReport({
      args: [
        "--input",
        "/tmp/evidence.jsonl",
        "--release-id",
        `m1-5-b1b:${"a".repeat(40)}`,
      ],
      evaluatedAt: "2026-07-21T00:31:00.000Z",
      readText: async () => "not-json\n",
    }),
    /must contain exactly 31 observations/u,
  );
});
