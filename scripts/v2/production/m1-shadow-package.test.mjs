import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composePath = "deploy/v2/m1-collector/compose.shadow.yml";
const dockerfilePath = "deploy/v2/m1-collector/Dockerfile";
const workflowPath =
  ".github/workflows/v2-m1-5-b1-reachable-runner-preflight.yml";
const validatorPath =
  "scripts/v2/production/m1-reachable-runner-preflight.mjs";
const earlyShadowValidatorPath =
  "scripts/v2/production/m1-early-shadow-runner-evidence.mjs";
const earlyShadowRunnerPath =
  "scripts/v2/production/m1-tencent-early-shadow-runner.mjs";
const nodeBaseImage =
  "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
const postgresImage =
  "postgres:16-bookworm@sha256:92620daddcd947f8d5ab5ba66e848702fe443d87fed30c4cea8e389fd78dfc55";

test("M1 shadow service is bounded, no-authority and receives no Legacy secret", async () => {
  const compose = await readFile(composePath, "utf8");
  for (const required of [
    'profiles: ["v2-m1-shadow"]',
    'restart: "no"',
    "read_only: true",
    'cap_drop: ["ALL"]',
    "no-new-privileges:true",
    "V2_M1_COLLECTOR_AUTHORITY_MODE: NO_AUTHORITY",
    'V2_M1_COLLECTOR_AUTOMATIC_TRADING_ALLOWED: "false"',
    "V2_M1_COLLECTOR_MAX_CYCLES:",
    "V2_M1_COLLECTOR_RUN_PROFILE:",
    "V2_M1_COLLECTOR_DATABASE_HOST: v2-m1-postgres",
    "V2_M1_COLLECTOR_WRITER_DATABASE_URL_FILE:",
    "V2_M1_COLLECTOR_READER_DATABASE_URL_FILE:",
    "internal: true",
  ]) {
    assert.ok(compose.includes(required), `missing shadow boundary: ${required}`);
  }
  for (const forbidden of [
    "<<: *app-env",
    "CRON_SECRET",
    "COINGLASS_API_KEY",
    "CHUAN_SESSION_SECRET",
    "REDIS_URL",
    "ports:",
    "privileged:",
  ]) {
    assert.equal(
      compose.includes(forbidden),
      false,
      `forbidden shadow capability: ${forbidden}`,
    );
  }
});

test("M1 collector image contains only compiled V2 runtime and runs as non-root", async () => {
  const dockerfile = await readFile(dockerfilePath, "utf8");

  assert.ok(dockerfile.includes("USER node"));
  assert.ok(dockerfile.includes("HEALTHCHECK NONE"));
  assert.ok(dockerfile.includes("/app/.tmp/market-tests/v2"));
  assert.equal(
    dockerfile.split("\n").filter((line) => line.startsWith(`FROM ${nodeBaseImage}`)).length,
    3,
  );
  assert.equal(
    dockerfile.split("\n").some((line) =>
      /^FROM node:22-bookworm-slim AS /u.test(line)),
    false,
  );
  assert.equal(dockerfile.includes("COPY . ."), false);
  assert.equal(dockerfile.includes("scripts/production"), false);
  assert.equal(dockerfile.includes("deploy/workers"), false);
  assert.equal(dockerfile.includes(".env"), false);
});

test("M1 reachable-runner workflow is one-shot, pinned and no-authority", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const validator = await readFile(validatorPath, "utf8");
  for (const required of [
    "codex/market-radar-v2-implementation",
    "paths:",
    workflowPath,
    "permissions:\n  contents: read",
    "runs-on: ubuntu-24.04",
    "timeout-minutes: 20",
    "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    "actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f",
    nodeBaseImage,
    postgresImage,
    "--network none",
    "--read-only",
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    "V2_M1_LIVE_REHEARSAL=1",
    "V2_M1_REHEARSAL_SOURCE_COMMIT=$GITHUB_SHA",
    "m1-reachable-runner-failure-diagnostic.mjs",
    "::error title=M1 B1-A Failure Evidence::",
    "Fail closed after diagnostic publication",
    "steps.live.outputs.status != '0'",
    "steps.live.outputs.status == '0'",
    "if: always()",
  ]) {
    assert.ok(workflow.includes(required), `missing preflight boundary: ${required}`);
  }
  for (const forbidden of [
    "workflow_dispatch:",
    "pull_request:",
    "schedule:",
    "contents: write",
    "id-token:",
    "secrets.",
    "self-hosted",
    "ssh ",
    "scp ",
    "rsync ",
    "cloud.tencent.com",
    "DEPLOY_PRODUCTION",
    "DATABASE_URL: ${{",
  ]) {
    assert.equal(
      workflow.includes(forbidden),
      false,
      `forbidden preflight capability: ${forbidden}`,
    );
  }
  for (const required of [
    '"PASS_REACHABLE_DOCKER_RUNNER_PREFLIGHT"',
    '"INSUFFICIENT_EVIDENCE"',
    "productionMutation: false",
    "productionSecretsUsed: false",
    "productionNetworkUsed: false",
    "automaticTradingAllowed: false",
  ]) {
    assert.ok(validator.includes(required), `missing evidence truth: ${required}`);
  }
});

test("M1 early-shadow package keeps capture truth separate from business truth", async () => {
  const [runner, validator] = await Promise.all([
    readFile(earlyShadowRunnerPath, "utf8"),
    readFile(earlyShadowValidatorPath, "utf8"),
  ]);
  const packageSource = `${runner}\n${validator}`;
  for (const required of [
    "PASS_31_CYCLE_CAPTURE",
    "CAPTURE_COMPLETE_BUSINESS_FAIL",
    "PASS_EARLY_SHADOW_BUSINESS_GATE",
    "earlyShadowSloPassed",
    "m1ExitClaimed: false",
    "productionMutation: false",
    "productionDependenciesUsed: false",
    "productionSecretsUsed: false",
  ]) {
    assert.ok(validator.includes(required), `missing early-shadow truth: ${required}`);
  }
  for (const required of [
    "EARLY_30_MINUTES",
    "V2_M1_COLLECTOR_MAX_CYCLES=31",
    "V2_M1_COLLECTOR_CYCLE_INTERVAL_MS=60000",
    "m1-collector-early-shadow-report.js",
    "writeContentAddressedObject",
  ]) {
    assert.ok(
      packageSource.includes(required),
      `missing early-shadow runner contract: ${required}`,
    );
  }
});
