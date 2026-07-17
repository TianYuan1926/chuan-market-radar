import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("./production-runner.sh", import.meta.url);
const runner = await readFile(path, "utf8");

test("production runner dry-run performs no mutation", () => {
  const output = execFileSync("bash", [path.pathname], {
    encoding: "utf8",
    env: {
      ...process.env,
      CANDIDATE_PENDING_DRAIN_MODE: "dry_run",
      CONFIRM_CANDIDATE_PENDING_DRAIN: "false",
    },
  });
  assert.match(output, /DRY-RUN: no production Git, environment, database, Redis or service mutation/);
});

test("scanner is stopped and lock checked before the database epoch is opened", () => {
  const stop = runner.indexOf('stop scanner-worker');
  const lock = runner.indexOf("scanner_lock_still_present");
  const preflight = runner.indexOf('database_runner preflight');
  const open = runner.indexOf('database_runner open');
  const worker = runner.indexOf('up -d --no-deps --no-build candidate-shadow-worker');
  assert.ok(stop > 0 && stop < lock && lock < preflight && preflight < open && open < worker);
});

test("success and failure both stop the worker, freeze control, and restore baseline", () => {
  for (const token of [
    "database_runner rollback", "database_runner close", "restore_baseline",
    "ROLLBACK_PASS", "PASS_LEGACY_PENDING_DRAINED_AND_REFROZEN",
    "CANDIDATE_EPISODE_DRAIN_ONLY=true", "wait_baseline_health",
    "baselineScannerImageId", "baselineWebImageId", "cycle2Started:false",
    "BASELINE_SCAN_COMPLETED_AT", "completed_at",
  ]) assert.match(runner, new RegExp(token.replaceAll("-", "\\-")));
  assert.ok(runner.indexOf('stop candidate-shadow-worker')
    < runner.indexOf('database_runner rollback'));
  assert.ok(runner.indexOf('database_runner close') < runner.indexOf('database_runner verify'));
});

test("runner contains no destructive or scope-expanding commands", () => {
  for (const forbidden of [
    "git reset --hard", "docker volume rm", "DROP TABLE", "TRUNCATE", "DELETE FROM",
    "backtest:formal", "npm run backtest:formal",
  ]) assert.doesNotMatch(runner, new RegExp(forbidden.replaceAll("*", "\\*"), "u"));
});
