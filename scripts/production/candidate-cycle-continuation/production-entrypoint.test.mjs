import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const path = "scripts/production/candidate-cycle-continuation/production-entrypoint.sh";

test("entrypoint is valid Bash and launches a bounded detached systemd unit", async () => {
  await execFileAsync("bash", ["-n", path]);
  const source = await readFile(path, "utf8");
  for (const token of [
    "systemd-run", "RuntimeMaxSec=5400", "Restart=no", "detached_worker",
    "validate-request", "activationEvidencePath", "prepare-admin-url",
  ]) assert.match(source, new RegExp(token, "u"));
  assert.doesNotMatch(source, /ssh |scp |docker compose down|docker volume rm/u);
});
