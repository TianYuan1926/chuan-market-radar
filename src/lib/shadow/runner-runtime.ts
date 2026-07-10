export type ShadowRunnerLock = {
  heartbeatAt?: string;
  hostname?: string;
  mode?: string;
  pid: number | null;
  runId: string;
  runtimeId?: string;
  startedAt: string;
  updatedAt?: string;
};

export type ShadowRunnerState = {
  heartbeatAt?: string;
  hostname?: string;
  lastCaptureAt?: string;
  lastCheckpointSweepAt?: string;
  lastError?: string;
  pid?: number;
  runId?: string;
  runtimeId?: string;
  status?: string;
  updatedAt?: string;
};

export type ShadowRunnerDerivedStatus =
  | "crashed"
  | "paused"
  | "running"
  | "stale"
  | "stopped"
  | "unknown";

export type ShadowRunnerRuntimeStatus = {
  heartbeatAgeMs: number | null;
  heartbeatFresh: boolean;
  lockPidAlive: boolean | null;
  manifestStatus: string;
  reason: string;
  recoverable: boolean;
  runId: string;
  sameRuntime: boolean;
  status: ShadowRunnerDerivedStatus;
};

export function isLocalShadowRunnerHealthy(runtime: ShadowRunnerRuntimeStatus): boolean {
  return runtime.status === "running"
    && runtime.heartbeatFresh
    && runtime.lockPidAlive === true
    && runtime.reason === "pid_alive_heartbeat_fresh";
}

export const DEFAULT_SHADOW_RUNNER_HEARTBEAT_STALE_MS = 10 * 60 * 1000;

export function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function heartbeatAgeMs(heartbeatAt: string | undefined, nowMs: number): number | null {
  const parsed = parseIsoMs(heartbeatAt);
  if (parsed === null) return null;
  return Math.max(0, nowMs - parsed);
}

export function isHeartbeatFresh(
  heartbeatAt: string | undefined,
  nowMs: number,
  staleMs = DEFAULT_SHADOW_RUNNER_HEARTBEAT_STALE_MS,
): boolean {
  const age = heartbeatAgeMs(heartbeatAt, nowMs);
  return age !== null && age <= staleMs;
}

export function buildShadowRunnerRuntimeId({
  hostname,
  pid,
  startedAt,
}: {
  hostname: string;
  pid: number;
  startedAt: string;
}) {
  return `${hostname}:${pid}:${startedAt}`;
}

export function deriveShadowRunnerRuntimeStatus({
  currentHostname,
  heartbeatStaleMs = DEFAULT_SHADOW_RUNNER_HEARTBEAT_STALE_MS,
  lock,
  lockPidAlive,
  manifestStatus,
  nowMs,
  runnerState,
}: {
  currentHostname: string;
  heartbeatStaleMs?: number;
  lock: ShadowRunnerLock | null;
  lockPidAlive: boolean | null;
  manifestStatus: string;
  nowMs: number;
  runnerState: ShadowRunnerState | null;
}): ShadowRunnerRuntimeStatus {
  const runId = lock?.runId || runnerState?.runId || "";
  const heartbeatAt = runnerState?.heartbeatAt || lock?.heartbeatAt;
  const age = heartbeatAgeMs(heartbeatAt, nowMs);
  const heartbeatFresh = age !== null && age <= heartbeatStaleMs;
  const sameRuntime = Boolean(
    lock?.runtimeId &&
    runnerState?.runtimeId &&
    lock.runtimeId === runnerState.runtimeId,
  );

  if (!runId && !manifestStatus) {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: "runner_artifacts_missing",
      recoverable: false,
      runId,
      sameRuntime,
      status: "unknown",
    };
  }

  if (manifestStatus === "paused") {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: "manifest_paused",
      recoverable: false,
      runId,
      sameRuntime,
      status: "paused",
    };
  }

  if (manifestStatus === "completed" || manifestStatus === "aborted") {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: `manifest_${manifestStatus}`,
      recoverable: false,
      runId,
      sameRuntime,
      status: "stopped",
    };
  }

  if (!lock?.pid) {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: manifestStatus === "running" ? "manifest_running_without_lock" : "lock_missing",
      recoverable: manifestStatus === "running",
      runId,
      sameRuntime,
      status: manifestStatus === "running" ? "stale" : "unknown",
    };
  }

  const lockBelongsToThisHost = !lock.hostname || lock.hostname === currentHostname;
  if (lockBelongsToThisHost && lockPidAlive === false) {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: "lock_pid_dead",
      recoverable: true,
      runId,
      sameRuntime,
      status: "crashed",
    };
  }

  if (heartbeatFresh) {
    return {
      heartbeatAgeMs: age,
      heartbeatFresh,
      lockPidAlive,
      manifestStatus,
      reason: lockBelongsToThisHost ? "pid_alive_heartbeat_fresh" : "remote_runner_heartbeat_fresh",
      recoverable: false,
      runId,
      sameRuntime,
      status: "running",
    };
  }

  return {
    heartbeatAgeMs: age,
    heartbeatFresh,
    lockPidAlive,
    manifestStatus,
    reason: heartbeatAt ? "heartbeat_stale" : "heartbeat_missing",
    recoverable: true,
    runId,
    sameRuntime,
    status: "stale",
  };
}
