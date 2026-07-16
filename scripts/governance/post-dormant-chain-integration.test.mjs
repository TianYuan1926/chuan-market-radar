import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../..", import.meta.url));
const outputRoot = join(root, ".tmp", "market-tests");

test("market test compilation removes stale branch output and emits the post-dormant chain", async () => {
  const sentinel = join(outputRoot, "stale-branch-sentinel.test.js");
  await mkdir(dirname(sentinel), { recursive: true });
  await writeFile(sentinel, "throw new Error('stale output executed');\n", "utf8");

  await execFileAsync("npm", ["run", "build:market-cli"], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });

  await assert.rejects(access(sentinel));
  for (const relativePath of [
    "lib/candidate-episode/canonical-read-model.test.js",
    "lib/candidate-episode/canonical-read-oracle.test.js",
    "lib/candidate-episode/canonical-read-resource.test.js",
    "lib/candidate-episode/canonical-read-route-adapter.test.js",
    "lib/candidate-episode/canonical-read-trusted-context.test.js",
    "lib/journal/review-statistics.test.js",
    "lib/api/frontend-contract.test.js",
  ]) {
    await access(join(outputRoot, relativePath));
  }

  const { stdout } = await execFileAsync("find", [
    join(outputRoot, "lib"),
    "-name",
    "*.test.js",
    "-print",
  ], { cwd: root });
  const testFileCount = stdout.split("\n").filter(Boolean).length;
  assert.ok(testFileCount >= 173, `expected at least 173 compiled tests, got ${testFileCount}`);
});

test("market test scripts reject stale output and an empty compiled test set", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const tsconfig = JSON.parse(await readFile(join(root, "tsconfig.market-test.json"), "utf8"));

  assert.match(packageJson.scripts["build:market-cli"], /rmSync\('\.tmp\/market-tests'/);
  assert.match(packageJson.scripts["test:market"], /^npm run build:market-cli/);
  assert.match(packageJson.scripts["test:market"], /test \"\$TEST_COUNT\" -gt 0/);
  assert.equal(tsconfig.compilerOptions.incremental, false);
});

test("integration contract keeps the future chain local and production closed", async () => {
  const contract = JSON.parse(await readFile(join(
    root,
    "docs/governance/wp-g0-2-post-dormant-chain-clean-gate-integration.v1.json",
  ), "utf8"));

  assert.equal(contract.productionAuthorization, false);
  assert.equal(contract.productionConnected, false);
  assert.equal(contract.businessRuntimeModified, false);
  assert.equal(contract.currentMainMergeAllowed, false);
  assert.equal(contract.cleanCompilation.zeroCoreTestsRejected, true);
  assert.equal(contract.cleanCompilation.cleanMarketResult.failed, 0);
  assert.equal(contract.postgres16Evidence.reconciliationComparedWrites, 10_000);
  assert.equal(contract.postgres16Evidence.reconciliationDifferences, 0);
  assert.equal(contract.hardBoundaries.activationObservationPassRequired, true);
  assert.equal(contract.hardBoundaries.activationObservationCurrentlyPassed, false);
  assert.equal(contract.hardBoundaries.canonicalReadAuthorized, false);
  assert.equal(contract.hardBoundaries.automaticPhaseAdvance, false);
  assert.equal(
    contract.currentProductionDecision,
    "BLOCKED_UNTIL_PASS_ACTIVATE_AND_OBSERVE_THEN_PRODUCTION_RECONCILIATION",
  );
  assert.equal(contract.nextProductionPackage, "WP-G0.2-SHADOW-VERIFY-RECONCILIATION");
  assert.ok(contract.forbiddenInThisPackage.includes(
    "origin_main_merge_before_activation_observation_and_reconciliation_pass",
  ));
});
