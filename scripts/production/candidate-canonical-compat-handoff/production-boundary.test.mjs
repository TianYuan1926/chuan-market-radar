import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const directory = "scripts/production/candidate-canonical-compat-handoff";
const shells = ["production-launch.sh", "production-entrypoint.sh", "production-runner.sh"];
const source = (file) => readFile(`${directory}/${file}`, "utf8");

test("all current Canonical Compat handoff production shells parse", async () => {
  for (const file of shells) await execFileAsync("bash", ["-n", `${directory}/${file}`]);
});

test("launcher rejects overlap and delegates exactly one bounded outer unit", async () => {
  const [launch, entrypoint] = await Promise.all([
    source("production-launch.sh"),
    source("production-entrypoint.sh"),
  ]);
  assert.match(launch, /shadow_verify_observer_still_active/u);
  assert.match(launch, /production_wip_not_zero_before_handoff/u);
  assert.match(launch, /market-radar-canonical-compat-code-presence-/u);
  assert.match(launch, /market-radar-canonical-compat-phase-/u);
  assert.match(launch, /market-radar-canonical-compat-observer-/u);
  assert.equal((launch.match(
    /candidate-canonical-compat-handoff\/production-entrypoint\.sh/gu) ?? []).length, 1);
  assert.doesNotMatch(launch,
    /candidate-canonical-compat-(?:code-presence|phase)\/production-entrypoint\.sh/u);
  assert.match(entrypoint, /RuntimeMaxSec=7200/u);
  assert.match(entrypoint,
    /CANDIDATE_CANONICAL_COMPAT_HANDOFF_ENTRYPOINT_MODE=detached_worker/u);
  assert.equal((entrypoint.match(/systemd-run/gu) ?? []).length, 2);
  assert.doesNotMatch(entrypoint, /CANDIDATE_SHADOW_VERIFY_HANDOFF_ENTRYPOINT_MODE/u);
});

test("outer runner executes exact R0 validation before creating the dynamic R2 request", async () => {
  const runner = await source("production-runner.sh");
  const codeRequest = runner.indexOf("code-presence --packet-root");
  const codeStart = runner.indexOf(
    "CANDIDATE_CANONICAL_COMPAT_CODE_PRESENCE_ENTRYPOINT_MODE=detached_worker");
  const codeValidation = runner.indexOf("validate-code-presence --summary");
  const codeCleanup = runner.indexOf('rm -rf -- "${CODE_STAGE}"', codeValidation);
  const phaseRequest = runner.indexOf("request-generator.mjs phase");
  const phaseStart = runner.indexOf("CANONICAL_COMPAT_PHASE_ENTRYPOINT_MODE=detached_worker");
  assert.ok(codeRequest > 0, "Code Presence request generation must exist");
  assert.ok(codeRequest < codeStart, "R0 request must exist before R0 execution");
  assert.ok(codeStart < codeValidation, "R0 must finish before its evidence is validated");
  assert.ok(codeValidation < codeCleanup, "R0 evidence must validate before exact staging cleanup");
  assert.ok(codeCleanup < phaseRequest, "R2 request cannot exist before current R0 PASS");
  assert.ok(phaseRequest < phaseStart, "independent R2 request must precede R2 execution");
  assert.match(runner,
    /outer_authorization_expired_before_phase[\s\S]*validate_outer_request[\s\S]*request-generator\.mjs phase/u);
  assert.match(runner, /PASS_PRODUCTION_CANONICAL_COMPAT_CODE_PRESENCE_VERIFIED/u);
  assert.match(runner, /PASS_IMMEDIATE_CANONICAL_COMPAT_OBSERVATION_ACTIVE/u);
});

test("phase request binds this run's exact Code Presence evidence path and checksum", async () => {
  const [generator, runtime] = await Promise.all([
    source("request-generator.mjs"),
    source("runner.mjs"),
  ]);
  assert.match(generator, /projectCodePresenceRuntime/u);
  assert.match(generator, /validateCodePresenceSummary/u);
  assert.match(generator, /buildPhaseRuntimeFromCodePresence/u);
  assert.match(generator, /createProductionExecutionRequest/u);
  assert.match(generator, /validateApprovalRequest/u);
  assert.match(generator, /codePresenceEvidencePath: summaryPath/u);
  assert.match(generator, /codePresenceEvidenceSha256: sha256\(codePresenceBytes\)/u);
  assert.match(runtime, /codeReleaseEvidencePath: codePresenceEvidencePath/u);
  assert.match(runtime, /codeReleaseEvidenceSha256: codePresenceEvidenceSha256/u);
  assert.match(generator, /options\.summary/u);
  assert.doesNotMatch(generator, /automaticPhaseAdvance\s*:\s*true/u);
  assert.doesNotMatch(generator, /projectReadOnlyRuntime|buildPhaseRuntimeFromReadOnlySummary/u);
});

test("outer shell owns no direct production mutation and delegates mutation to exact R2 child", async () => {
  const sources = await Promise.all(shells.map(source));
  const combined = sources.join("\n");
  for (const forbidden of [
    /docker\s+compose\s+(?:up|down|restart|build|pull)/u,
    /\bCOMPOSE\b/u,
    /control-(?:transition|rollback)/u,
    /\b(?:psql|redis-cli|prisma|migrate)\b/u,
    /git\s+(?:checkout|switch|reset|pull|fetch|merge|rebase)/u,
    /backtest:formal/u,
    /npm\s+run\s+backtest/u,
  ]) assert.doesNotMatch(combined, forbidden);

  const runner = sources[2];
  assert.match(runner,
    /candidate-canonical-compat-code-presence\/production-entrypoint\.sh/u);
  assert.match(runner, /candidate-canonical-compat-phase\/production-entrypoint\.sh/u);
  assert.match(runner,
    /stage_child "\$\{CODE_EXTRACT\}"[\s\S]*"wp-g0-2-canonical-compat-code-presence"/u);
  assert.match(runner,
    /stage_child "\$\{PHASE_EXTRACT\}"[\s\S]*"wp-g0-2-canonical-compat-phase"/u);
  assert.doesNotMatch(runner,
    /(?:cp|install|mv|sed -i)[^\n]*(?:\$\{PRODUCTION_ROOT\}|\/home\/ubuntu\/apps\/chuan-market-radar)/u);
});

test("immediate evidence proves observer active and explicitly denies every later milestone", async () => {
  const runner = await source("production-runner.sh");
  assert.match(runner, /PASS_CANONICAL_COMPAT_HANDOFF_OBSERVER_ACTIVE/u);
  assert.match(runner, /observerActive:true/u);
  assert.match(runner, /canonicalCompatObservationCompleted:false/u);
  assert.match(runner, /canonicalCutoverExecuted:false/u);
  assert.match(runner, /wpG02Completed:false/u);
  assert.match(runner, /g0Completed:false/u);
  assert.match(runner, /databasePhaseTransition:"shadow_verify_to_canonical_compat"/u);
  assert.doesNotMatch(runner, /canonicalCompatObservationCompleted:true/u);
  assert.doesNotMatch(runner, /canonicalCutoverExecuted:true/u);
  assert.doesNotMatch(runner, /wpG02Completed:true/u);
  assert.doesNotMatch(runner, /g0Completed:true/u);
  assert.doesNotMatch(runner, /PASS_(?:WP_G0_2|G0)_COMPLETED/u);
});
