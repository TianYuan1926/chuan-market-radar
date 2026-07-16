import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "scripts/production/candidate-cycle-continuation/production-entrypoint.sh",
  "scripts/production/candidate-cycle-continuation/production-runner.sh",
  "scripts/production/candidate-cycle-continuation/observation-runner.sh",
];

test("production packet never mutates scanner Redis migrations or canonical authority", async () => {
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const forbidden of [
    "scanner-worker", "redis-cli FLUSH", "npm run migration", "prisma migrate",
    "CANDIDATE_EPISODE_CANONICAL_READ=true", "CANDIDATE_EPISODE_CANONICAL_WRITE=true",
    "backtest:formal",
  ]) assert.doesNotMatch(source, new RegExp(forbidden, "u"));
  assert.match(source, /service_allowlist=web,candidate-shadow-worker/u);
});

test("observer retains evidence before exact temporary cleanup", async () => {
  const source = await readFile(files[2], "utf8");
  assert.ok(source.indexOf("retain_evidence") < source.lastIndexOf("cleanup_temporary_artifacts"));
  assert.match(source, /PASS_ACCUMULATION_READY_FOR_FRESH_VERIFICATION_CYCLE/u);
  assert.match(source, /automatic_rollback/u);
});
