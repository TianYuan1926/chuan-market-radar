const profileName = process.argv[2] ?? process.env.WORKER_PROFILE ?? "scanner";
const appInternalUrl = trimTrailingSlash(process.env.APP_INTERNAL_URL ?? "http://127.0.0.1:3000");
const cronSecret = process.env.CRON_SECRET ?? "";

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function protectedPost(name, path, intervalSeconds, immediate = false) {
  return {
    immediate,
    intervalSeconds,
    method: "POST",
    name,
    path,
    protected: true,
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
    ),
  ],
  coinglass: [
    protectedPost(
      "daily-mover-ingest",
      "/api/admin/daily-movers/ingest",
      numberFromEnv("DAILY_MOVER_INTERVAL_SECONDS", 86_400),
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
  ],
  dynamic: [
    publicGet(
      "health-watch",
      "/api/health",
      numberFromEnv("HEALTH_WATCH_INTERVAL_SECONDS", 300),
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

async function waitForWeb() {
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${appInternalUrl}/api/health`, {
        headers: {
          "cache-control": "no-store",
        },
      });

      if (response.ok) {
        log("web-ready", { attempt });

        return;
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

  log(response.ok ? "task-ok" : "task-failed", {
    elapsedMs,
    path: task.path,
    status: response.status,
    task: task.name,
    bodyPreview,
  });

  if (!response.ok) {
    throw new Error(`${task.name} failed with HTTP ${response.status}`);
  }
}

async function runTaskLoop(task) {
  log("task-started", {
    intervalSeconds: task.intervalSeconds,
    path: task.path,
    task: task.name,
  });

  if (task.immediate) {
    try {
      await callTask(task);
    } catch (error) {
      log("task-error", {
        error: error instanceof Error ? error.message : "unknown error",
        task: task.name,
      });
    }
  }

  while (true) {
    await sleep(task.intervalSeconds * 1_000);

    try {
      await callTask(task);
    } catch (error) {
      log("task-error", {
        error: error instanceof Error ? error.message : "unknown error",
        task: task.name,
      });
    }
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

await waitForWeb();
await Promise.all(tasks.map(runTaskLoop));
