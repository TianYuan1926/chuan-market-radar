import assert from "node:assert/strict";
import test from "node:test";
import { buildM0ExitReport } from "./m0-exit-validator";

test("M0 engineering exit remains closed unless every required proof passes", () => {
  const report = buildM0ExitReport(process.cwd());

  assert.equal(
    report.status,
    "PASS_M0_ENGINEERING_EXIT_PRODUCTION_UNCHANGED",
  );
  assert.equal(report.authorityOutputs, 30);
  assert.equal(report.runtimeSchemas, 30);
  assert.equal(report.productionMutationPerformed, false);
  assert.equal(
    report.productionStatus,
    "UNKNOWN_UNTIL_FRESH_READ_ONLY_VERIFICATION",
  );
  assert.ok(report.checks.length >= 10);
  assert.ok(report.checks.every((check) => check.passed));
  assert.ok(
    report.checks.some(
      (check) => check.id === "legacy_sources_match_reviewed_commit",
    ),
  );
});
