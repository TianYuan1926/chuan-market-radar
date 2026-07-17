import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const path = new URL("./production-runner.sh", import.meta.url);
const runner = await readFile(path, "utf8");

function shellFunction(name) {
  const match = runner.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`, "u"));
  assert.ok(match, `${name} must be defined as a standalone shell function`);
  return match[0];
}

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
  const lock = runner.indexOf("wait_for_scan_lock_absent ||");
  const preflight = runner.indexOf('database_runner preflight');
  const open = runner.indexOf('database_runner open');
  const worker = runner.indexOf('up -d --no-deps --no-build candidate-shadow-worker');
  assert.ok(stop > 0 && stop < lock && lock < preflight && preflight < open && open < worker);
});

test("scanner lock and baseline health waits cover the real production TTL and cadence", () => {
  assert.match(runner, /wait_for_scan_lock_absent\(\)/u);
  assert.match(runner, /local deadline=\$\(\(SECONDS \+ 660\)\)/u);
  assert.match(runner, /wait_baseline_health\(\)[\s\S]*local deadline=\$\(\(SECONDS \+ 1200\)\)/u);
});

test("scanner lock wait polls without deleting Redis state", () => {
  const directory = mkdtempSync(join(tmpdir(), "pending-drain-lock-wait-"));
  const fakeDocker = join(directory, "docker");
  const fakeSleep = join(directory, "sleep");
  const counter = join(directory, "counter");
  writeFileSync(fakeDocker, `#!/bin/sh
count=0
[ ! -f "$LOCK_COUNTER" ] || count=$(cat "$LOCK_COUNTER")
count=$((count + 1))
printf '%s\\n' "$count" > "$LOCK_COUNTER"
[ "$count" -ne 1 ] || printf 'scan:lock:composite\\n'
`, { mode: 0o700 });
  writeFileSync(fakeSleep, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  chmodSync(fakeDocker, 0o700);
  chmodSync(fakeSleep, 0o700);
  try {
    const output = execFileSync("bash", ["-c", `${shellFunction("wait_for_scan_lock_absent")}
DOCKER=("${fakeDocker}")
REDIS_CONTAINER=redis
wait_for_scan_lock_absent
cat "${counter}"
`], {
      encoding: "utf8",
      env: { ...process.env, LOCK_COUNTER: counter, PATH: `${directory}:${process.env.PATH}` },
    });
    assert.equal(output.trim(), "2");
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("rollback status is single-valued and an incomplete rollback retains the lease", () => {
  const statusFunction = shellFunction("rollback_result_status");
  const output = execFileSync("bash", ["-c", `${statusFunction}
rollback_result_status false true
rollback_result_status true true
rollback_result_status true false
`], { encoding: "utf8" });
  assert.deepEqual(output.trim().split("\n"), [
    "ROLLBACK_INCOMPLETE_LEASE_RETAINED",
    "ROLLBACK_PASS",
    "SAFE_STOP_PRE_MUTATION",
  ]);
  assert.doesNotMatch(runner, /lease_event release --outcome ROLLBACK_FAIL/u);
  assert.match(runner, /leaseRetained/u);
  assert.match(runner, /leaseReleased/u);
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
