import assert from "node:assert/strict";
import test from "node:test";
import {
  B1A_BRANCH,
  B1A_REPOSITORY,
} from "./m1-reachable-runner-preflight.mjs";
import {
  buildFailureDiagnostic,
  verifyFailureDiagnostic,
} from "./m1-reachable-runner-failure-diagnostic.mjs";

const sourceCommit = "a".repeat(40);

function input(liveTap) {
  return {
    exitCode: 1,
    generatedAt: "2026-07-20T11:00:00.000Z",
    liveTap,
    ref: `refs/heads/${B1A_BRANCH}`,
    repository: B1A_REPOSITORY,
    runAttempt: 2,
    runId: "123456789",
    sourceCommit,
  };
}

test("emits only bounded diagnostic classes and digests for a failed TAP run", () => {
  const report = buildFailureDiagnostic(input([
    "TAP version 13",
    "not ok 1 - live collector",
    "  failureType: 'testCodeFailure'",
    "  error: 'fetch failed: ETIMEDOUT'",
    "  code: 'ERR_TEST_FAILURE'",
    "# tests 1",
    "# pass 0",
    "# fail 1",
    "# skipped 0",
  ].join("\n")));
  assert.deepEqual(report.diagnostic.categories, [
    "NETWORK_TIMEOUT",
    "TEST_PROCESS_FAILURE",
  ]);
  assert.deepEqual(report.diagnostic.tapIdentifiers, [
    "ERR_TEST_FAILURE",
    "testCodeFailure",
  ]);
  assert.equal("rawLog" in report, false);
  assert.equal(report.scope.rawLogIncluded, false);
  assert.equal(verifyFailureDiagnostic(report), report);
});

test("retains only allowlisted provider failure fields", () => {
  const runtime = {
    cycles: [{
      providerFailures: [{
        kind: "RATE_LIMITED",
        operation: "TICKER",
        reasonCode: "okx_ticker_rate_limited",
        secretPayload: "must-not-survive",
        venue: "OKX_SWAP",
      }],
    }],
  };
  const report = buildFailureDiagnostic(
    input(`# ${JSON.stringify(runtime)}\n# tests 1\n# pass 0\n# fail 1\n# skipped 0\n`),
  );
  assert.deepEqual(report.diagnostic.providerFailures, [{
    kind: "RATE_LIMITED",
    operation: "TICKER",
    reasonCode: "okx_ticker_rate_limited",
    venue: "OKX_SWAP",
  }]);
  assert.equal(JSON.stringify(report).includes("must-not-survive"), false);
});

test("rejects a success exit code or wrong branch binding", () => {
  assert.throws(() => buildFailureDiagnostic({ ...input("failure"), exitCode: 0 }));
  assert.throws(() => buildFailureDiagnostic({
    ...input("failure"),
    ref: "refs/heads/main",
  }));
});
