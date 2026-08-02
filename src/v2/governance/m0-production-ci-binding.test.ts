import assert from "node:assert/strict";
import test from "node:test";
import { validateM0ProductionCiBinding } from "./m0-exit-validator";

const exactScripts = {
  "ci:production":
    "bash scripts/v2/production/run-exact-toolchain.sh ci:production:exact",
  "ci:production:exact": [
    "npm run ci:forbidden-files",
    "npm run ci:secret-patterns",
    "npm run v2:a0:materials:verify",
    "npm run test:recurrence-gate",
    "npm run test:production-dispatch",
    "npm run typecheck",
    "npm run lint",
    "npm run test:market",
    "npm run test:v2-foundation",
    "npm run test:v2-ops",
    "npm run v2:m0:verify",
    "npm run build",
    "npm run backtest:golden",
    "npm run security:check",
  ].join(" && "),
  "v2:m0:verify":
    "npm run build:market-cli && npm run v2:m0:verify:compiled",
  "v2:m0:verify:compiled":
    "node .tmp/market-tests/v2/governance/m0-exit-validator.js",
} as const;

test("M0 accepts only the exact-toolchain wrapper and complete quality chain", () => {
  assert.match(
    validateM0ProductionCiBinding(exactScripts),
    /14 locked production gates/u,
  );
});

test("M0 rejects a production CI wrapper that bypasses the locked target", () => {
  assert.throws(
    () =>
      validateM0ProductionCiBinding({
        ...exactScripts,
        "ci:production": "npm run ci:production:exact",
      }),
    /not bound to the exact-toolchain production target/u,
  );
});

test("M0 rejects removal of a V2 production quality gate", () => {
  assert.throws(
    () =>
      validateM0ProductionCiBinding({
        ...exactScripts,
        "ci:production:exact": exactScripts["ci:production:exact"].replace(
          " && npm run test:v2-foundation",
          "",
        ),
      }),
    /differs from the locked production quality chain/u,
  );
});

test("M0 rejects reordering that could move verification before V2 tests", () => {
  assert.throws(
    () =>
      validateM0ProductionCiBinding({
        ...exactScripts,
        "ci:production:exact": exactScripts["ci:production:exact"].replace(
          "npm run test:v2-foundation && npm run test:v2-ops",
          "npm run test:v2-ops && npm run test:v2-foundation",
        ),
      }),
    /differs from the locked production quality chain/u,
  );
});

test("M0 rejects a verifier that no longer rebuilds its authority", () => {
  assert.throws(
    () =>
      validateM0ProductionCiBinding({
        ...exactScripts,
        "v2:m0:verify": "npm run v2:m0:verify:compiled",
      }),
    /not the self-building M0 verifier/u,
  );
});

test("M0 rejects compiled verifier target drift", () => {
  assert.throws(
    () =>
      validateM0ProductionCiBinding({
        ...exactScripts,
        "v2:m0:verify:compiled": "node scripts/placeholder.mjs",
      }),
    /does not execute the compiled M0 authority/u,
  );
});
