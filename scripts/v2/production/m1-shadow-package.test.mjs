import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composePath = "deploy/v2/m1-collector/compose.shadow.yml";
const dockerfilePath = "deploy/v2/m1-collector/Dockerfile";

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
  assert.equal(dockerfile.includes("COPY . ."), false);
  assert.equal(dockerfile.includes("scripts/production"), false);
  assert.equal(dockerfile.includes("deploy/workers"), false);
  assert.equal(dockerfile.includes(".env"), false);
});
