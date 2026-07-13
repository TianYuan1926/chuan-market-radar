import { nextFixedRateRunAt } from "./worker-schedule.mjs";

const profileName = process.argv[2] ?? process.env.WORKER_PROFILE ?? "scanner";
const appInternalUrl = trimTrailingSlash(process.env.APP_INTERNAL_URL ?? "http://127.0.0.1:3000");
const cronSecret = process.env.CRON_SECRET ?? "";
const idleHeartbeatSeconds = numberFromEnv("WORKER_IDLE_HEARTBEAT_SECONDS", 300);
let shutdownRequested = false;
const sleepWaiters = new Set();

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function numberFromEnv(key, fallback) {
  const value = Number(process.env[key] ?? fallback);

  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function sleep(ms) {
  if (shutdownRequested) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      sleepWaiters.delete(done);
      resolve();
    }
    sleepWaiters.add(done);
  });
}

function protectedPost(name, path, intervalSeconds, immediate = false, options = {}) {
  return {
    immediate,
    intervalSeconds,
    method: "POST",
    name,
    path,
    protected: true,
    scheduleMode: "fixed_delay",
    ...options,
  };
}

function publicGet(name, path, intervalSeconds, immediate = true) {
  return {
    immediate,
    intervalSeconds,
    method: "GET",
    name,
    path,
    protected: false,
  };
}

const profiles = {
  scanner: [
    protectedPost(
      "scheduled-scan",
      "/api/scan",
      numberFromEnv("SCANNER_INTERVAL_SECONDS", 900),
      true,
      {
        acceptedResultStatuses: ["updated"],
        scheduleMode: "fixed_rate_skip_missed",
      },
    ),
  ],
  coinglass: [
    protectedPost(
      "daily-mover-ingest",
      "/api/admin/daily-movers/ingest",
      numberFromEnv("DAILY_MOVER_INTERVAL_SECONDS", 86_400),
      true,
    ),
    protectedPost(
      "daily-mover-kline-cache-fill",
      "/api/admin/daily-movers/klines/fill",
      numberFromEnv("KLINE_CACHE_INTERVAL_SECONDS", 21_600),
    ),
  ],
  signal: [
    protectedPost(
      "outcome-executor",
      "/api/admin/outcomes/run",
      numberFromEnv("OUTCOME_INTERVAL_SECONDS", 3_600),
    ),
    protectedPost(
      "v3-forward-map-review",
      "/api/admin/v3/forward-map-reviews/run",
      numberFromEnv("V3_FORWARD_MAP_INTERVAL_SECONDS", 21_600),
    ),
    protectedPost(
      "shadow-live-tracker",
      "/api/admin/shadow-live/run",
      numberFromEnv("SHADOW_LIVE_INTERVAL_SECONDS", 3_600),
    ),
  ],
  dynamic: [
    publicGet(
      "health-watch",
      "/api/health",
      numberFromEnv("HEALTH_WATCH_INTERVAL_SECONDS", 300),
      true,
    ),
  ],
  macro: [
    protectedPost(
      "macro-market-ingest",
      "/api/admin/macro/ingest",
      numberFromEnv("MACRO_INGEST_INTERVAL_SECONDS", 3_600),
      true,
    ),
  ],
  "candidate-shadow": [
    protectedPost(
      "candidate-shadow-capture",
      "/api/admin/candidate-shadow/run",
      numberFromEnv("CANDIDATE_SHADOW_INTERVAL_SECONDS", 30),
      true,
    ),
  ],
};

function log(message, fields = {}) {
  process.stdout.write(JSON.stringify({
    at: new Date().toISOString(),
    message,
    profile: profileName,
    ...fields,
  }) + "\n");
}

async function postHeartbeat({
  detail,
  elapsedMs,
  status,
  task,
}) {
  if (!cronSecret.trim()) {
    return;
  }

  try {
    await fetch(`${appInternalUrl}/api/admin/runtime/heartbeat`, {
      body: JSON.stringify({
        detail,
        elapsedMs,
        status,
        task,
        worker: profileName,
      }),
      headers: {
        authorization: `Bearer ${cronSecret}`,
        "cache-control": "no-store",
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    log("heartbeat-error", {
      error: error instanceof Error ? error.message : "unknown error",
      task,
    });
  }
}

async function waitForWeb() {
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (shutdownRequested) return false;
    try {
      const response = await fetch(`${appInternalUrl}/api/health`, {
        headers: {
          "cache-control": "no-store",
        },
      });

      if (response.ok) {
        log("web-ready", { attempt });

        return true;
      }

      log("web-not-ready", { attempt, status: response.status });
    } catch (error) {
      log("web-wait-error", {
        attempt,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }

    await sleep(5_000);
  }

  throw new Error(`web did not become ready at ${appInternalUrl}`);
}

async function callTask(task) {
  if (task.protected && !cronSecret.trim()) {
    throw new Error(`${task.name} requires CRON_SECRET`);
  }

  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json",
  };

  if (task.protected) {
    headers.authorization = `Bearer ${cronSecret}`;
  }

  const startedAt = Date.now();
  const response = await fetch(`${appInternalUrl}${task.path}`, {
    headers,
    method: task.method,
  });
  const elapsedMs = Date.now() - startedAt;
  const text = await response.text();
  const bodyPreview = text.slice(0, 500);
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const resultStatus = typeof body?.status === "string" ? body.status : null;
  const acceptedStatuses = task.acceptedResultStatuses ?? null;
  const resultAccepted = !acceptedStatuses || acceptedStatuses.includes(resultStatus);
  const succeeded = response.ok && resultAccepted;
  const snapshotId = typeof body?.metadata?.id === "string" ? body.metadata.id : null;
  const generatedAt = typeof body?.metadata?.generatedAt === "string"
    ? body.metadata.generatedAt
    : null;
  const completedAt = typeof body?.metadata?.runtime?.scanCompletedAt === "string"
    ? body.metadata.runtime.scanCompletedAt
    : null;

  log(succeeded ? "task-ok" : "task-failed", {
    completedAt,
    elapsedMs,
    generatedAt,
    path: task.path,
    resultStatus,
    snapshotId,
    status: response.status,
    task: task.name,
    bodyPreview,
  });

  if (!response.ok) {
    throw new Error(`${task.name} failed with HTTP ${response.status}`);
  }

  if (!resultAccepted) {
    throw new Error(`${task.name} returned non-success result status ${resultStatus ?? "missing"}`);
  }

  return {
    completedAt,
    elapsedMs,
    generatedAt,
    resultStatus,
    snapshotId,
  };
}

async function runTaskLoop(task) {
  const intervalMs = task.intervalSeconds * 1_000;
  const scheduleMode = task.scheduleMode ?? "fixed_delay";
  let previousScheduledAtMs = Date.now();

  log("task-started", {
    intervalSeconds: task.intervalSeconds,
    path: task.path,
    scheduleMode,
    task: task.name,
  });
  await postHeartbeat({
    detail: `interval=${task.intervalSeconds}s;schedule=${scheduleMode}`,
    status: "starting",
    task: task.name,
  });

  async function executeTask() {
    try {
      const result = await callTask(task);
      await postHeartbeat({
        detail: [
          `result=${result.resultStatus ?? "none"}`,
          `snapshot=${result.snapshotId ?? "none"}`,
          `generatedAt=${result.generatedAt ?? "none"}`,
          `completedAt=${result.completedAt ?? "none"}`,
        ].join(";"),
        elapsedMs: result.elapsedMs,
        status: "ok",
        task: task.name,
      });
    } catch (error) {
      await postHeartbeat({
        detail: error instanceof Error ? error.message : "unknown error",
        status: "error",
        task: task.name,
      });
      log("task-error", {
        error: error instanceof Error ? error.message : "unknown error",
        task: task.name,
      });
    }
  }

  async function sleepUntilNextRun(targetAtMs) {
    let remainingMs = Math.max(0, targetAtMs - Date.now());

    while (remainingMs > 0) {
      await sleep(Math.min(remainingMs, idleHeartbeatSeconds * 1_000));
      if (shutdownRequested) return;
      remainingMs = Math.max(0, targetAtMs - Date.now());

      if (remainingMs > 0) {
        await postHeartbeat({
          detail: `idle;nextRunAt=${new Date(targetAtMs).toISOString()};remaining=${Math.ceil(remainingMs / 1_000)}s`,
          status: "ok",
          task: task.name,
        });
      }
    }
  }

  if (task.immediate && !shutdownRequested) {
    await executeTask();
  }

  while (!shutdownRequested) {
    const nowMs = Date.now();
    const nextRunAtMs = scheduleMode === "fixed_rate_skip_missed"
      ? nextFixedRateRunAt({
        intervalMs,
        nowMs,
        previousScheduledAtMs,
      })
      : nowMs + intervalMs;

    await sleepUntilNextRun(nextRunAtMs);
    if (shutdownRequested) return;
    previousScheduledAtMs = nextRunAtMs;

    await executeTask();
  }
}

const tasks = profiles[profileName];

if (!tasks) {
  throw new Error(`Unknown worker profile: ${profileName}`);
}

process.on("unhandledRejection", (error) => {
  log("unhandled-rejection", {
    error: error instanceof Error ? error.message : "unknown error",
  });
  process.exitCode = 1;
});

function requestShutdown(signal) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log("shutdown-requested", { signal });
  for (const wake of [...sleepWaiters]) wake();
}

process.once("SIGTERM", () => requestShutdown("SIGTERM"));
process.once("SIGINT", () => requestShutdown("SIGINT"));

const webReady = await waitForWeb();
if (webReady && !shutdownRequested) {
  await postHeartbeat({
    detail: "web dependency ready",
    status: "starting",
    task: "boot",
  });
  await Promise.all(tasks.map(runTaskLoop));
}

if (shutdownRequested) {
  await postHeartbeat({
    detail: "graceful shutdown complete; no task left in flight",
    status: "ok",
    task: "shutdown",
  });
  log("worker-stopped", { reason: "graceful-shutdown" });
}
