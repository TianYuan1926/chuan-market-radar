import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const files = [
  "scripts/production/candidate-canonical-compat-code-presence/production-entrypoint.sh",
  "scripts/production/candidate-canonical-compat-code-presence/production-runner.sh",
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
  assert.match(source, /cat \/run\/market-radar\/candidate-read-authority\.json/u);
  assert.match(source, /\.phase == "shadow_verify"/u);
  assert.match(source, /\.readSource == "legacy"/u);
  assert.match(source, /\.differenceCount == 0/u);
});

test("outer handoff can run the read-only child synchronously without merging mutation authority", async () => {
  const source = await readFile(files[0], "utf8");
  assert.match(source,
    /CANDIDATE_CANONICAL_COMPAT_CODE_PRESENCE_ENTRYPOINT_MODE:-launcher/u);
  assert.match(source, /\$\{ENTRYPOINT_MODE\}" == "launcher"/u);
  assert.match(source, /\$\{ENTRYPOINT_MODE\}" == "detached_worker"/u);
  assert.match(source, /TRANSPORT_MANIFEST_OVERRIDE="\$\{MANIFEST_FILE\}"/u);
  assert.match(source, /bash "\$\{RUNNER\}"/u);
  assert.equal((source.match(/systemd-run/gu) ?? []).length, 1);
});
