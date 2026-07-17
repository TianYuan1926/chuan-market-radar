import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entrypoint = await readFile(
  new URL("./production-entrypoint.sh", import.meta.url),
  "utf8",
);

test("entrypoint validates the staged request before starting one bounded transient unit", () => {
  const validate = entrypoint.indexOf("validate_request");
  const prepare = entrypoint.indexOf("prepare_admin_url");
  const start = entrypoint.indexOf("systemd-run --unit");
  assert.ok(validate > 0 && validate < prepare && prepare < start);
  for (const token of [
    "validate-request", "prepare-admin-url", "RuntimeMaxSec=5400", "Restart=no",
    "runner_unit_already_exists", "DETACHED_PENDING_DRAIN_STARTED",
  ]) assert.match(entrypoint, new RegExp(token.replaceAll("-", "\\-")));
});

test("entrypoint removes credentials and staging after detached execution", () => {
  assert.match(entrypoint, /rm -rf -- "\$\{SECURE_ROOT\}"/u);
  assert.match(entrypoint, /rm -rf -- "\$\{ACTUAL_ROOT\}"/u);
  assert.match(entrypoint, /temporaryArtifactCleanupRequired/u);
  assert.match(entrypoint, /CANDIDATE_PENDING_DRAIN_ENTRYPOINT_MODE=detached_worker/u);
  assert.match(entrypoint, /launcher_cleanup_on_failure/u);
  assert.match(entrypoint, /LAUNCHER_HANDOFF/u);
});

test("entrypoint never reads generic database credentials or prints the generated URL", () => {
  assert.doesNotMatch(entrypoint, /DATABASE_URL=/u);
  assert.doesNotMatch(entrypoint, /cat.*migration-admin\.url/u);
  assert.match(entrypoint, /postgres-admin\.env/u);
  assert.match(entrypoint, /--network none --read-only --cap-drop ALL/u);
});
