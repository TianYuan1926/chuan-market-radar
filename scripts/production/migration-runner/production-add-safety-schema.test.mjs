import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = "scripts/production/migration-runner/production-add-safety-schema.sh";

test("production add-safety-schema is locked to reviewed main and migration 009 only", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /AUTHORIZED_SOURCE_COMMIT=b86f3282fa0d9cedab60b8a5bcb9166011fb7926/);
  assert.match(source, /migration-schema-only/);
  assert.match(source, /009_candidate_shadow_capture_safety/);
  assert.match(source, /schemaMigration\.applied == \["009_candidate_shadow_capture_safety"\]/);
  assert.equal((source.match(/migration-runner\.mjs execute/g) ?? []).length, 1);
});

test("production add-safety-schema requires recovery and dormant-runtime gates", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /capacity-gate-result\.json/);
  assert.match(source, /offhost-backup-verification\.json/);
  assert.match(source, /require_feature_flags_off/);
  assert.match(source, /\.controlRows == 0/);
  assert.match(source, /runtimeDeployment:false/);
  assert.doesNotMatch(source, /docker compose .*up|CANDIDATE_EPISODE_[A-Z_]+=true/);
});

test("production add-safety-schema verifies exact post-migration shape", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /\.tables == 9/);
  assert.match(source, /\.columns == 166/);
  assert.match(source, /\.functions == 26/);
  assert.match(source, /\.triggerObjects == 11/);
  assert.match(source, /\.triggerEventRows == 16/);
  assert.match(source, /\.appliedLedgerRows == 9/);
});
