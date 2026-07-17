import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const file = (name) => readFile(resolve(root,
  `scripts/production/candidate-shadow-verify-phase/${name}`), "utf8");

test("production runner defaults to a no-mutation dry run", () => {
  const result = spawnSync("bash", [
    resolve(root, "scripts/production/candidate-shadow-verify-phase/production-runner.sh"),
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN: no production environment, phase, manifest, service or data changed/u);
});

test("production mutation is Web-only and excludes source sync, builds and migrations", async () => {
  const source = await file("production-runner.sh");
  const webRecreates = source.match(/"\$\{COMPOSE\[@\]\}" up -d --no-deps --no-build --force-recreate web/gu) ?? [];
  assert.equal(webRecreates.length, 3);
  assert.match(source, /control-preflight/u);
  assert.match(source, /control-transition/u);
  assert.match(source, /control-rollback/u);
  assert.match(source, /CANDIDATE_EPISODE_DUAL_READ: "true"/u);
  assert.match(source, /wait_health "\$\{phase\}"/u);
  assert.match(source, /non-web-identity\.txt/u);
  assert.doesNotMatch(source, /docker compose build|\bcompose\b[^\n]*\bbuild\b|git (?:checkout|pull|reset)|npm run backtest:formal/u);
  assert.doesNotMatch(source, /\b(?:psql|redis-cli|prisma|migrate)\b/u);
});

test("session-independent entrypoint keeps staging for the 24-hour observer", async () => {
  const source = await file("production-entrypoint.sh");
  assert.match(source, /SHADOW_VERIFY_PHASE_ENTRYPOINT_MODE=detached_worker/u);
  assert.match(source, /RuntimeMaxSec=5400/u);
  assert.match(source, /prepare-admin-url/u);
  assert.match(source, /if \[\[ "\$\{RUNNER_EXIT\}" -ne 0 \]\]/u);
  assert.doesNotMatch(source, /git (?:checkout|pull|reset)|docker compose build/u);
});

test("observer requires exactly 289 database-clock samples over 24 hours", async () => {
  const [observer, production, snapshot] = await Promise.all([
    file("observation-runner.sh"),
    file("production-runner.sh"),
    file("full-snapshot-observer.cjs"),
  ]);
  assert.match(observer, /sample_number<=289/u);
  assert.match(observer, /sample_number \* 300/u);
  assert.match(observer, /sampledAt:\.\[1\]\.databaseNow/u);
  assert.match(observer, /observation_sampling_schedule_overrun/u);
  assert.doesNotMatch(observer, /OBSERVATION_DURATION_SECONDS|OBSERVATION_POLL_SECONDS/u);
  assert.match(production, /RuntimeMaxSec=90000/u);
  assert.match(snapshot, /PAGE_LIMIT = 1000/u);
  assert.match(snapshot, /MAXIMUM_PAGES = 10000/u);
  assert.match(snapshot, /isolation: "serializable"/u);
  assert.match(snapshot, /readOnly: true/u);
  assert.match(snapshot, /candidate_audit_role/u);
});
