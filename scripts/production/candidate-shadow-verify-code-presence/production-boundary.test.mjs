import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const files = [
  "scripts/production/candidate-shadow-verify-code-presence/production-entrypoint.sh",
  "scripts/production/candidate-shadow-verify-code-presence/production-runner.sh",
];

test("verify-only shell entrypoints are syntactically valid", async () => {
  for (const file of files) await execFileAsync("bash", ["-n", file]);
});

test("runner has no Git, image, container, database, environment, or phase mutation path", async () => {
  const source = await readFile(files[1], "utf8");
  for (const forbidden of [
    /git\s+-C\s+[^\n]+\s+(?:checkout|switch|reset|clean|fetch|pull)/u,
    /docker[^\n]+(?:build|tag|rmi|rm|stop|restart)/u,
    /compose[^\n]+(?:up|down|build|restart)/u,
    /\bpsql\b|transition_migration_control|UPDATE\s|INSERT\s|DELETE\s/iu,
    /\.env(?:\.production)?[^\n]*(?:>|tee|sed\s+-i)/u,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /servicesMutated:\[\]/u);
  assert.match(source, /gitMutation:false/u);
  assert.match(source, /test ! -e \/run\/market-radar\/candidate-read-authority\.json/u);
  assert.match(source, /candidate_read_control_unavailable/u);
  assert.match(source, /candidate_read_trusted_context_invalid/u);
});
