import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SESSION_SCRIPT = "scripts/v2/production/m1-production-storage-p0r-session.sh";

test("session plan fixes the no-echo in-memory ingress and exact runtime identity boundary", () => {
  const plan = JSON.parse(execFileSync("bash", [SESSION_SCRIPT, "plan"], { encoding: "utf8" }));
  assert.equal(plan.schemaVersion, "v2-m1-production-storage-p0r-session.v2");
  assert.equal(plan.rawStsResponsePersisted, false);
  assert.equal(plan.terminalEchoDisabledDuringSecretInput, true);
  assert.equal(plan.readyMarkerAfterEchoDisabled, true);
  assert.equal(plan.boundedSecretInput, true);
  assert.equal(plan.inputCompletion, "NEWLINE_THEN_EOT_FROM_PREARMED_LOCAL_TTY_BRIDGE");
  assert.equal(plan.localTtyBridgeRequired, true);
  assert.equal(plan.browserStateReadAfterResponseAllowed, false);
  assert.equal(plan.credentialCompileImmediate, true);
  assert.equal(plan.callerClockOverrideAllowed, false);
  assert.equal(plan.credentialOutputExclusive, true);
  assert.equal(plan.ageIdentityOutputExclusive, true);
  assert.equal(plan.credentialAndIdentityOnlyInDevShm, true);
  assert.equal(plan.credentialAndIdentityOwnerUid, 0);
  assert.equal(plan.containerSelection, "EXACT_COMPOSE_PROJECT_AND_SERVICE_LABELS");
  assert.equal(plan.composeInterpolationRequired, false);
  assert.equal(plan.sessionPidStartTokenAndSourceBound, true);
  assert.equal(plan.runnerStartsAutomaticallyAfterBothSecrets, true);
  assert.equal(plan.abandonedSessionCleansSecrets, true);
  assert.equal(plan.secondaryFailureCleansAllSessionSecrets, true);
  assert.equal(plan.cancelledReadyAbortsPrimaryWait, true);
  assert.equal(plan.successRequiresVerifiedSecretCleanup, true);
  assert.equal(plan.productionDatabaseMutation, false);
  assert.equal(plan.productionServiceMutation, false);
  assert.equal(plan.productionRepositoryMutation, false);
});

test("session source retires tee and Compose interpolation while preserving exact cleanup", async () => {
  const source = await readFile(SESSION_SCRIPT, "utf8");
  for (const required of [
    "receive-credentials-and-run",
    "receive-age-identity",
    "stty -echo",
    "timeout --foreground 600s",
    "com.docker.compose.project=chuan-market-radar",
    "com.docker.compose.service=web",
    "P0R_SESSION_SHA256",
    "P0R_COS_PROVISIONING_PLAN_SHA256",
    "P0R_COS_PROVISIONING_TOOL_SHA256",
    "P0R_RUNNER_SHA256",
    "EXPECTED_BINDING_KEYS",
    "P0R binding set is not exact",
    "CLEANUP_SCOPE=\"all\"",
    "cleanup_session_secrets_best_effort",
    "cleanup_session_secrets_verified",
    "P0R session secret cleanup verification failed",
    "owner is invalid",
    '"COS credential file" 65536 0',
    '"age identity file" 8192 0',
    "require_absent \"${OUTPUT_DIRECTORY}\"",
    "WAITING_P0R_AGE_IDENTITY",
    "NEWLINE_THEN_EOT_FROM_PREARMED_LOCAL_TTY_BRIDGE",
    "kill -0",
    "/proc/${SESSION_PID}/stat",
    "P0R credential session start token mismatch",
    "P0R session source identity is invalid",
    "P0R session was cancelled before age identity handoff",
    "runnerStartsAutomaticallyAfterBothSecrets",
  ]) assert.ok(source.includes(required), `missing session invariant: ${required}`);

  for (const forbidden of [
    ".sts-response.json",
    " tee ",
    "docker compose",
    "cat ${",
    "base64",
    "pbpaste",
    "PRESS_ENTER_THEN_CTRL_D_ONCE",
    "source \"${BINDINGS_FILE}\"",
  ]) assert.equal(source.includes(forbidden), false, `forbidden session operation: ${forbidden}`);

  assert.ok(
    source.indexOf("stty -echo") <
      source.lastIndexOf("NEWLINE_THEN_EOT_FROM_PREARMED_LOCAL_TTY_BRIDGE"),
    "the READY contract must be emitted only after terminal echo is disabled",
  );
});

test("the two exact bridge-controlled remote entry commands remain bounded", () => {
  const runId = "p0r-20260727t142908z-03d9dbeef09a8b47290dd5638115449f";
  const source = `/home/ubuntu/.cache/market-radar-v2/p0r/staging/${runId}`;
  for (const command of [
    `cd ${source} && ./m1-production-storage-p0r-session.sh receive-credentials-and-run`,
    `cd ${source} && ./m1-production-storage-p0r-session.sh receive-age-identity`,
  ]) {
    assert.ok(Buffer.byteLength(command, "utf8") <= 200, command);
  }
});

test("session shell parses without touching production", () => {
  execFileSync("bash", ["-n", SESSION_SCRIPT]);
});
