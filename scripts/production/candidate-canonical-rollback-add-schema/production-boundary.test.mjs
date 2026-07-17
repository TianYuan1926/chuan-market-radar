import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const file = (name) => readFile(resolve(import.meta.dirname, name), "utf8");

test("production runner defaults to a no-mutation dry run", () => {
  const result = spawnSync("bash", [resolve(import.meta.dirname, "production-runner.sh")], {
    cwd: root, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout,
    /DRY-RUN: no production database, service, source, environment or data changed/u);
});

test("production execution is database-only and lease fenced", async () => {
  const source = await file("production-runner.sh");
  assert.match(source, /database_runner preflight/u);
  assert.match(source, /lease_event consume/u);
  assert.match(source, /immediately_before_schema_transaction/u);
  assert.match(source, /database_runner execute/u);
  assert.match(source, /database_runner verify/u);
  assert.match(source, /container_identity_changed_before_execute/u);
  assert.match(source, /non_target_container_identity_changed/u);
  assert.match(source, /evidence_secret_pattern_detected/u);
  assert.match(source, /dst=\/app\/packet,readonly/u);
  assert.match(source, /\/app\/packet\/\$\{RUNNER#/u);
  assert.doesNotMatch(source, /dst=\/packet,readonly/u);
  assert.doesNotMatch(source,
    /docker compose (?:up|build|down)|\b(?:git pull|git checkout|git reset|redis-cli)\b|backtest:formal/u);
});

test("entrypoint is session independent and exact-mode only", async () => {
  const source = await file("production-entrypoint.sh");
  assert.match(source, /CANONICAL_ROLLBACK_ADD_SCHEMA_MODE=production_add_schema/u);
  assert.match(source, /CONFIRM_CANONICAL_ROLLBACK_ADD_SCHEMA=true/u);
  assert.doesNotMatch(source, /git (?:pull|checkout|reset)|docker compose/u);
});
