import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const directory = "scripts/production/candidate-shadow-verify-handoff";
const shells = ["production-launch.sh", "production-entrypoint.sh", "production-runner.sh"];
const source = (file) => readFile(`${directory}/${file}`, "utf8");

test("all handoff production shells parse", async () => {
  for (const file of shells) await execFileAsync("bash", ["-n", `${directory}/${file}`]);
});

test("launcher refuses overlap and delegates one bounded outer unit", async () => {
  const [launch, entrypoint] = await Promise.all([
    source("production-launch.sh"),
    source("production-entrypoint.sh"),
  ]);
  assert.match(launch, /current_cycle_observer_still_active/u);
  assert.match(launch, /production_wip_not_zero_before_handoff/u);
  assert.equal((launch.match(/candidate-shadow-verify-handoff\/production-entrypoint\.sh/gu) ?? [])
    .length, 1);
  assert.doesNotMatch(launch,
    /candidate-(?:readonly-superwindow|shadow-verify-phase)\/production-entrypoint\.sh/u);
  assert.match(entrypoint, /RuntimeMaxSec=7200/u);
  assert.match(entrypoint, /SHADOW_VERIFY_HANDOFF_ENTRYPOINT_MODE=detached_worker/u);
  assert.equal((entrypoint.match(/systemd-run/gu) ?? []).length, 2);
});

test("outer runner is sequential and owns no direct production mutation", async () => {
  const [runner, validator] = await Promise.all([
    source("production-runner.sh"),
    source("runner.mjs"),
  ]);
  const readOnlyStart = runner.indexOf(
    "CANDIDATE_READONLY_SUPERWINDOW_ENTRYPOINT_MODE=detached_worker");
  const readOnlyValidation = runner.indexOf("validate-readonly");
  const phaseRequest = runner.indexOf("request-generator.mjs phase");
  const phaseStart = runner.indexOf("SHADOW_VERIFY_PHASE_ENTRYPOINT_MODE=detached_worker");
  assert.ok(readOnlyStart > 0 && readOnlyStart < readOnlyValidation);
  assert.ok(readOnlyValidation < phaseRequest && phaseRequest < phaseStart);
  assert.match(runner, /outer_authorization_expired_before_phase/u);
  assert.match(validator, /current_cycle_final_not_rederived_from_samples/u);
  assert.match(runner, /PASS_SHADOW_VERIFY_HANDOFF_OBSERVER_ACTIVE/u);
  assert.match(runner, /candidate-shadow-verify-phase-immediate\.v2/u);
  assert.match(runner, /PASS_CURRENT_CYCLE_READ_ONLY_VERIFICATION_SUPERWINDOW/u);
  assert.match(runner, /dualReadObservationCompleted:false/u);
  assert.match(runner, /g0Completed:false/u);
  for (const forbidden of [
    /docker\s+compose\s+(?:up|down|restart|build)/u,
    /\bCOMPOSE\b/u,
    /control-(?:transition|rollback)/u,
    /\b(?:psql|redis-cli|prisma|migrate)\b/u,
    /git\s+(?:checkout|switch|reset|pull|fetch)/u,
    /backtest:formal/u,
  ]) assert.doesNotMatch(runner, forbidden);
});

test("phase request is separate and derived only from validated R0 evidence", async () => {
  const generator = await source("request-generator.mjs");
  assert.match(generator, /projectReadOnlyRuntime/u);
  assert.match(generator, /validateReadOnlySummary/u);
  assert.match(generator, /buildPhaseRuntimeFromReadOnlySummary/u);
  assert.match(generator, /createProductionExecutionRequest/u);
  assert.doesNotMatch(generator, /automaticPhaseAdvance\s*:\s*true/u);
});
