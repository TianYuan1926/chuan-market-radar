import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const path = "scripts/production/candidate-cycle-continuation/production-runner.sh";

test("runner preserves rollback images and performs control continuation before service verification", async () => {
  await execFileAsync("bash", ["-n", path]);
  const { stdout } = await execFileAsync("bash", [path], {
    env: { ...process.env, CANDIDATE_CYCLE_CONTINUATION_MODE: "dry_run" },
  });
  assert.match(stdout, /DRY-RUN: no production Git, image, environment, database control or service mutation/u);
  const source = await readFile(path, "utf8");
  for (const token of [
    "rollbackWebImageRef", "rollbackWorkerImageRef", "control-preflight", "control-continue",
    "render-disabled-env", "control-rollback", "candidate-shadow-worker", "production-check.sh",
    "observation-checkpoint", "systemd-run", "RuntimeMaxSec=260000",
  ]) assert.match(source, new RegExp(token, "u"));
  assert.ok(source.indexOf("control-continue") < source.indexOf("control-continuation-redacted.json"));
  assert.doesNotMatch(source, /docker compose down|docker volume rm|git reset --hard|DROP TABLE|TRUNCATE/u);
});

test("rollback never reactivates the expired old cycle", async () => {
  const source = await readFile(path, "utf8");
  assert.match(source, /freezing new cycle and restoring Legacy authority/u);
  assert.doesNotMatch(source, /transition.*currentMigrationId.*shadow_capture/su);
});
