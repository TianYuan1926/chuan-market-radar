import assert from "node:assert/strict";
import test from "node:test";
import {
  buildA0RuntimeSmokeEvidence,
} from "./a0-runtime-smoke-evidence.mjs";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FAILURE = `${JSON.stringify({
  authorityMode: "NO_AUTHORITY",
  automaticTradingAllowed: false,
  contractVersion: "v2-m1-collector-process.v1",
  errorCode: "COLLECTOR_PROCESS_FAILED",
  status: "FAILED",
})}\n`;

test("A0 runtime smoke accepts only the exact no-authority fail-closed result", () => {
  const evidence = buildA0RuntimeSmokeEvidence({
    entrypointExitCode: 1,
    entrypointStderr: FAILURE,
    nodeVersion: "v22.23.1\n",
    sourceCommit: SOURCE_COMMIT,
  });
  assert.equal(
    evidence.status,
    "PASS_RUNTIME_LOADS_AND_FAILS_CLOSED_BEFORE_NETWORK_OR_DATABASE",
  );
  assert.equal(evidence.productionMutation, false);
  assert.equal(evidence.execution.networkMode, "NONE");

  assert.throws(
    () => buildA0RuntimeSmokeEvidence({
      entrypointExitCode: 0,
      entrypointStderr: FAILURE,
      nodeVersion: "v22.23.1",
      sourceCommit: SOURCE_COMMIT,
    }),
  );
  assert.throws(
    () => buildA0RuntimeSmokeEvidence({
      entrypointExitCode: 1,
      entrypointStderr: FAILURE.replace("FAILED", "READY"),
      nodeVersion: "v22.23.1",
      sourceCommit: SOURCE_COMMIT,
    }),
  );
  assert.throws(
    () => buildA0RuntimeSmokeEvidence({
      entrypointExitCode: 1,
      entrypointStderr: FAILURE,
      nodeVersion: "v24.15.0",
      sourceCommit: SOURCE_COMMIT,
    }),
  );
});
