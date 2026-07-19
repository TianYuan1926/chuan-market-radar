import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const files = [
  "scripts/production/candidate-readonly-superwindow/production-launch.sh",
  "scripts/production/candidate-readonly-superwindow/production-entrypoint.sh",
  "scripts/production/candidate-readonly-superwindow/production-runner.sh",
];

test("all production shells parse and preserve the read-only boundary", async () => {
  for (const file of files) await execFileAsync("bash", ["-n", file]);
  const source = await readFile(files[2], "utf8");
  for (const forbidden of [
    /docker\s+compose\s+(?:up|down|restart)/u,
    /git\s+(?:checkout|switch|reset|pull|fetch)/u,
    /psql\b/u,
    /ALTER\s+TABLE/iu,
    /UPDATE\s+candidate/iu,
    /DELETE\s+FROM/iu,
    /CANDIDATE_SHADOW_VERIFY_PHASE/u,
    /backtest:formal/u,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /code-presence[\s\S]+Lineage[\s\S]+Reconciliation request/u);
  assert.match(source, /safe_remove_stage/u);
  assert.match(source, /child_archive_path_invalid/u);
  assert.match(source, /productionMutationAllowed:false/u);
  assert.match(source, /g0Completed:false/u);
  assert.match(source, /snapshot_audit_file/u);
  assert.match(source, /production-lease-execution\.json/u);
  assert.match(source, /manifestSha256/u);
  assert.match(source, /requestSha256/u);
  assert.match(source, /evidenceSha256/u);
  assert.match(source, /sourceReleaseCount == 7/u);
  assert.match(source, /candidate-episode-v1-cycle-7/u);
  assert.doesNotMatch(source, /sourceReleaseCount == 5/u);
  assert.doesNotMatch(source, /candidate-episode-v1-cycle-5/u);
});

test("entrypoint starts one bounded unit and never starts child units", async () => {
  const entrypoint = await readFile(files[1], "utf8");
  assert.equal((entrypoint.match(/systemd-run/g) ?? []).length, 2);
  assert.match(entrypoint, /RuntimeMaxSec=4800/u);
  assert.doesNotMatch(entrypoint, /CANDIDATE_LINEAGE_CAPTURE_ENTRYPOINT_MODE=launcher/u);
  assert.doesNotMatch(entrypoint, /CANDIDATE_RECONCILIATION_ENTRYPOINT_MODE=launcher/u);
});
