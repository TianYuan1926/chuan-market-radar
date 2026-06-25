export type WorkerHeartbeatStatus = "starting" | "ok" | "error";

export type WorkerHeartbeatInput = {
  detail?: string;
  elapsedMs?: number;
  status: WorkerHeartbeatStatus;
  task?: string;
  updatedAt?: string;
  worker: string;
};

export type WorkerHeartbeat = Required<Pick<WorkerHeartbeatInput, "status" | "updatedAt" | "worker">> & {
  detail?: string;
  elapsedMs?: number;
  source: "worker-heartbeat.v1";
  task?: string;
};

export type RuntimeProbeStatus = "healthy" | "degraded" | "down" | "unconfigured";

export type RuntimeRedisProbe = {
  checkedAt: string;
  detail: string;
  status: RuntimeProbeStatus;
};

export type RuntimeWorkerProbe = {
  ageSec: number | null;
  detail: string;
  key: string;
  lastSeenAt: string | null;
  name: string;
  status: Exclude<RuntimeProbeStatus, "unconfigured">;
  task: string | null;
};

export type RuntimeProbeReport = {
  generatedAt: string;
  redis: RuntimeRedisProbe;
  staleAfterSeconds: number;
  workers: RuntimeWorkerProbe[];
};

export type RuntimeHeartbeatClient = {
  connect?: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  isOpen?: boolean;
  quit?: () => Promise<unknown>;
  set: (key: string, value: string, options?: Record<string, unknown>) => Promise<unknown>;
};

export type RuntimeHeartbeatEnv = Record<string, string | undefined>;

const heartbeatPrefix = "chuan:runtime:heartbeat:";
const defaultTtlSeconds = 1_800;
const defaultStaleSeconds = 900;

export const defaultRuntimeWorkers = [
  "scanner-worker",
  "websocket-light-worker",
  "coinglass-worker",
  "signal-worker",
  "dynamic-scan-scheduler",
  "macro-worker",
] as const;

export function normalizeRuntimeWorkerKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");

  if (normalized === "scanner") return "scanner-worker";
  if (normalized === "coinglass") return "coinglass-worker";
  if (normalized === "signal") return "signal-worker";
  if (normalized === "dynamic") return "dynamic-scan-scheduler";
  if (normalized === "macro") return "macro-worker";
  if (normalized === "ws-light-scan" || normalized === "websocket-light") return "websocket-light-worker";

  return normalized || "unknown-worker";
}

export function runtimeWorkerHeartbeatKey(worker: string) {
  return `${heartbeatPrefix}${normalizeRuntimeWorkerKey(worker)}`;
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function runtimeProbeReadTimeoutMs(env: RuntimeHeartbeatEnv = {}) {
  return Math.max(300, Math.min(10_000, positiveInt(env.RUNTIME_PROBE_READ_TIMEOUT_MS, 1_500)));
}

async function withRuntimeProbeTimeout<T>(
  env: RuntimeHeartbeatEnv,
  read: () => Promise<T>,
): Promise<T> {
  const timeoutMs = runtimeProbeReadTimeoutMs(env);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      read(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`runtime probe read timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function runtimeHeartbeatTtlSeconds(env: RuntimeHeartbeatEnv = {}) {
  return positiveInt(env.WORKER_HEARTBEAT_TTL_SECONDS, defaultTtlSeconds);
}

export function runtimeHeartbeatStaleSeconds(env: RuntimeHeartbeatEnv = {}) {
  return positiveInt(env.WORKER_HEARTBEAT_STALE_SECONDS, defaultStaleSeconds);
}

async function ensureConnected(client: RuntimeHeartbeatClient) {
  if (client.connect && !client.isOpen) {
    await client.connect();
  }
}

function safeParseHeartbeat(raw: string | null): WorkerHeartbeat | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkerHeartbeat>;

    if (
      parsed?.source === "worker-heartbeat.v1" &&
      typeof parsed.worker === "string" &&
      typeof parsed.updatedAt === "string" &&
      (parsed.status === "starting" || parsed.status === "ok" || parsed.status === "error")
    ) {
      return parsed as WorkerHeartbeat;
    }
  } catch {
    return null;
  }

  return null;
}

export async function writeWorkerHeartbeat(
  client: RuntimeHeartbeatClient,
  input: WorkerHeartbeatInput,
  env: RuntimeHeartbeatEnv = {},
) {
  await ensureConnected(client);

  const heartbeat: WorkerHeartbeat = {
    detail: input.detail,
    elapsedMs: input.elapsedMs,
    source: "worker-heartbeat.v1",
    status: input.status,
    task: input.task,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    worker: normalizeRuntimeWorkerKey(input.worker),
  };

  await client.set(
    runtimeWorkerHeartbeatKey(heartbeat.worker),
    JSON.stringify(heartbeat),
    { EX: runtimeHeartbeatTtlSeconds(env) },
  );

  return heartbeat;
}

function heartbeatAgeSec(heartbeat: WorkerHeartbeat, now: Date) {
  const updatedAtMs = new Date(heartbeat.updatedAt).getTime();

  if (!Number.isFinite(updatedAtMs)) return null;

  return Math.max(0, Math.floor((now.getTime() - updatedAtMs) / 1_000));
}

function workerProbeFromHeartbeat({
  heartbeat,
  now,
  staleAfterSeconds,
  worker,
}: {
  heartbeat: WorkerHeartbeat | null;
  now: Date;
  staleAfterSeconds: number;
  worker: string;
}): RuntimeWorkerProbe {
  if (!heartbeat) {
    return {
      ageSec: null,
      detail: "未收到心跳",
      key: worker,
      lastSeenAt: null,
      name: worker,
      status: "down",
      task: null,
    };
  }

  const ageSec = heartbeatAgeSec(heartbeat, now);
  const stale = ageSec === null || ageSec > staleAfterSeconds;
  const status: RuntimeWorkerProbe["status"] = stale
    ? "down"
    : heartbeat.status === "ok"
      ? "healthy"
      : "degraded";

  const detailParts = [
    heartbeat.status === "ok" ? "心跳正常" : heartbeat.status === "starting" ? "启动中" : "最近任务异常",
    heartbeat.task ? `task=${heartbeat.task}` : null,
    typeof heartbeat.elapsedMs === "number" ? `elapsed=${heartbeat.elapsedMs}ms` : null,
    heartbeat.detail,
  ].filter(Boolean);

  return {
    ageSec,
    detail: stale ? `心跳过期 ${ageSec ?? "unknown"}s` : detailParts.join(" · "),
    key: worker,
    lastSeenAt: heartbeat.updatedAt,
    name: worker,
    status,
    task: heartbeat.task ?? null,
  };
}

export async function readWorkerHeartbeatReport({
  client,
  env = {},
  now = new Date(),
  workers = [...defaultRuntimeWorkers],
}: {
  client?: RuntimeHeartbeatClient | null;
  env?: RuntimeHeartbeatEnv;
  now?: Date;
  workers?: readonly string[];
}): Promise<RuntimeProbeReport> {
  const generatedAt = now.toISOString();
  const staleAfterSeconds = runtimeHeartbeatStaleSeconds(env);

  if (!env.REDIS_URL?.trim() && !client) {
    return {
      generatedAt,
      redis: {
        checkedAt: generatedAt,
        detail: "REDIS_URL 未配置，不能读取运行心跳。",
        status: "unconfigured",
      },
      staleAfterSeconds,
      workers: workers.map((worker) => workerProbeFromHeartbeat({
        heartbeat: null,
        now,
        staleAfterSeconds,
        worker: normalizeRuntimeWorkerKey(worker),
      })),
    };
  }

  if (!client) {
    return {
      generatedAt,
      redis: {
        checkedAt: generatedAt,
        detail: "未提供 Redis client，跳过运行心跳读取。",
        status: "degraded",
      },
      staleAfterSeconds,
      workers: workers.map((worker) => workerProbeFromHeartbeat({
        heartbeat: null,
        now,
        staleAfterSeconds,
        worker: normalizeRuntimeWorkerKey(worker),
      })),
    };
  }

  try {
    await ensureConnected(client);
    const normalizedWorkers = workers.map(normalizeRuntimeWorkerKey);
    const heartbeats = await Promise.all(
      normalizedWorkers.map(async (worker) => safeParseHeartbeat(await client.get(runtimeWorkerHeartbeatKey(worker)))),
    );

    return {
      generatedAt,
      redis: {
        checkedAt: generatedAt,
        detail: "Redis 可读，运行心跳探针可用。",
        status: "healthy",
      },
      staleAfterSeconds,
      workers: normalizedWorkers.map((worker, index) => workerProbeFromHeartbeat({
        heartbeat: heartbeats[index],
        now,
        staleAfterSeconds,
        worker,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown redis error";

    return {
      generatedAt,
      redis: {
        checkedAt: generatedAt,
        detail: `Redis 心跳读取失败：${message}`,
        status: "down",
      },
      staleAfterSeconds,
      workers: workers.map((worker) => workerProbeFromHeartbeat({
        heartbeat: null,
        now,
        staleAfterSeconds,
        worker: normalizeRuntimeWorkerKey(worker),
      })),
    };
  }
}

export async function writeConfiguredWorkerHeartbeat(
  input: WorkerHeartbeatInput,
  env: RuntimeHeartbeatEnv = process.env,
) {
  if (!env.REDIS_URL?.trim()) {
    return {
      ok: false,
      reason: "REDIS_URL missing",
    } as const;
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: env.REDIS_URL }) as unknown as RuntimeHeartbeatClient;

  try {
    const heartbeat = await writeWorkerHeartbeat(client, input, env);

    return {
      heartbeat,
      ok: true,
    } as const;
  } finally {
    try {
      await client.quit?.();
    } catch {
      // Heartbeat write result is already known; quit errors are not user-facing health state.
    }
  }
}

export async function readConfiguredRuntimeProbeReport(
  env: RuntimeHeartbeatEnv = process.env,
  now = new Date(),
) {
  if (!env.REDIS_URL?.trim()) {
    return readWorkerHeartbeatReport({ env, now });
  }

  const { createClient } = await import("redis");
  const client = createClient({ url: env.REDIS_URL }) as unknown as RuntimeHeartbeatClient;

  try {
    return await withRuntimeProbeTimeout(env, () => readWorkerHeartbeatReport({
      client,
      env,
      now,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown redis error";
    const generatedAt = now.toISOString();
    const staleAfterSeconds = runtimeHeartbeatStaleSeconds(env);

    return {
      generatedAt,
      redis: {
        checkedAt: generatedAt,
        detail: `Redis 心跳读取失败：${message}`,
        status: "down" as const,
      },
      staleAfterSeconds,
      workers: defaultRuntimeWorkers.map((worker) => workerProbeFromHeartbeat({
        heartbeat: null,
        now,
        staleAfterSeconds,
        worker,
      })),
    };
  } finally {
    try {
      await client.quit?.();
    } catch {
      // Probe status is captured by readWorkerHeartbeatReport; quit errors should not crash health.
    }
  }
}
