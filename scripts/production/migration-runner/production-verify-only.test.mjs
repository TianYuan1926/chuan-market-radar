import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/production/migration-runner/production-verify-only.sh";

test("production verify-only shell is syntactically valid", async () => {
  await execFileAsync("sh", ["-n", scriptPath]);
});

test("production verify-only exposes no migration execute path", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /\[ "\$COMMAND" = verify \]/);
  assert.doesNotMatch(source, /migration-runner\.mjs\s+execute/);
  assert.doesNotMatch(source, /docker\s+compose|force-recreate|restart:/);
  assert.doesNotMatch(source, /CANDIDATE_EPISODE_[A-Z_]+=true/);
  assert.match(source, /\.execute == false/);
  assert.match(source, /\.roleBootstrapEnabled == false/);
  assert.match(source, /\.schemaMigrationEnabled == false/);
  assert.match(source, /\.result\.schemaChanged == false/);
  assert.match(source, /migrationExecuteRun: false/);
});

test("production verify-only keeps schema flags health and worktree fail closed", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /candidate_feature_flag_enabled_before_verify/);
  assert.match(source, /candidate_feature_flag_enabled_after_verify/);
  assert.match(source, /health_before_not_ready_fresh/);
  assert.match(source, /health_after_not_ready_fresh/);
  assert.match(source, /production_worktree_dirty/);
  assert.match(source, /catalog_contract_failed/);
  assert.match(source, /runtime_boundary_not_clean/);
  assert.match(source, /web_image_changed/);
});
