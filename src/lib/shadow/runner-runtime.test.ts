import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShadowRunnerRuntimeId,
  deriveShadowRunnerRuntimeStatus,
  isHeartbeatFresh,
} from "./runner-runtime";

const nowMs = Date.parse("2026-07-09T10:00:00.000Z");
const currentHostname = "shadow-runner-1";

test("runner runtime marks manifest running with dead same-host pid as crashed", () => {
  const status = deriveShadowRunnerRuntimeStatus({
    currentHostname,
    lock: {
      hostname: currentHostname,
      pid: 737,
      runId: "shadow-v1",
      startedAt: "2026-07-09T09:00:00.000Z",
    },
    lockPidAlive: false,
    manifestStatus: "running",
    nowMs,
    runnerState: {
      heartbeatAt: "2026-07-09T09:30:00.000Z",
      runId: "shadow-v1",
      status: "running",
    },
  });

  assert.equal(status.status, "crashed");
  assert.equal(status.reason, "lock_pid_dead");
  assert.equal(status.recoverable, true);
  assert.equal(status.heartbeatFresh, false);
});

test("runner runtime marks stale heartbeat as stale even when manifest is running", () => {
  const runtimeId = buildShadowRunnerRuntimeId({
    hostname: currentHostname,
    pid: 100,
    startedAt: "2026-07-09T09:00:00.000Z",
  });
  const status = deriveShadowRunnerRuntimeStatus({
    currentHostname,
    heartbeatStaleMs: 10 * 60 * 1000,
    lock: {
      heartbeatAt: "2026-07-09T09:40:00.000Z",
      hostname: currentHostname,
      pid: 100,
      runId: "shadow-v1",
      runtimeId,
      startedAt: "2026-07-09T09:00:00.000Z",
    },
    lockPidAlive: true,
    manifestStatus: "running",
    nowMs,
    runnerState: {
      heartbeatAt: "2026-07-09T09:40:00.000Z",
      runId: "shadow-v1",
      runtimeId,
      status: "running",
    },
  });

  assert.equal(status.status, "stale");
  assert.equal(status.reason, "heartbeat_stale");
  assert.equal(status.recoverable, true);
  assert.equal(status.sameRuntime, true);
});

test("runner runtime accepts remote/container runner when heartbeat is fresh", () => {
  const runtimeId = buildShadowRunnerRuntimeId({
    hostname: "shadow-runner-container",
    pid: 1,
    startedAt: "2026-07-09T09:59:00.000Z",
  });
  const status = deriveShadowRunnerRuntimeStatus({
    currentHostname,
    heartbeatStaleMs: 10 * 60 * 1000,
    lock: {
      heartbeatAt: "2026-07-09T09:59:30.000Z",
      hostname: "shadow-runner-container",
      pid: 1,
      runId: "shadow-v1",
      runtimeId,
      startedAt: "2026-07-09T09:59:00.000Z",
    },
    lockPidAlive: null,
    manifestStatus: "running",
    nowMs,
    runnerState: {
      heartbeatAt: "2026-07-09T09:59:30.000Z",
      hostname: "shadow-runner-container",
      runId: "shadow-v1",
      runtimeId,
      status: "running",
    },
  });

  assert.equal(status.status, "running");
  assert.equal(status.reason, "remote_runner_heartbeat_fresh");
  assert.equal(status.recoverable, false);
  assert.equal(status.sameRuntime, true);
});

test("runner heartbeat freshness is strictly bounded by stale window", () => {
  assert.equal(isHeartbeatFresh("2026-07-09T09:55:00.000Z", nowMs, 5 * 60 * 1000), true);
  assert.equal(isHeartbeatFresh("2026-07-09T09:54:59.999Z", nowMs, 5 * 60 * 1000), false);
  assert.equal(isHeartbeatFresh(undefined, nowMs, 5 * 60 * 1000), false);
});
