import assert from "node:assert/strict";
import test from "node:test";
import {
  readWorkerHeartbeatReport,
  runtimeWorkerHeartbeatKey,
  writeWorkerHeartbeat,
  type RuntimeHeartbeatClient,
} from "./worker-heartbeat";

function createMemoryClient(): RuntimeHeartbeatClient & { values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    get: async (key) => values.get(key) ?? null,
    isOpen: true,
    set: async (key, value) => {
      values.set(key, value);
      return "OK";
    },
    values,
  };
}

test("writeWorkerHeartbeat normalizes worker names and stores a Redis heartbeat payload", async () => {
  const client = createMemoryClient();
  const heartbeat = await writeWorkerHeartbeat(client, {
    elapsedMs: 82,
    status: "ok",
    task: "scheduled-scan",
    updatedAt: "2026-06-22T00:00:00.000Z",
    worker: "scanner",
  });

  assert.equal(heartbeat.worker, "scanner-worker");
  assert.equal(heartbeat.source, "worker-heartbeat.v1");
  assert.equal(client.values.has(runtimeWorkerHeartbeatKey("scanner-worker")), true);
});

test("readWorkerHeartbeatReport marks recent ok heartbeats healthy", async () => {
  const client = createMemoryClient();
  await writeWorkerHeartbeat(client, {
    elapsedMs: 120,
    status: "ok",
    task: "health-watch",
    updatedAt: "2026-06-22T00:00:10.000Z",
    worker: "dynamic",
  });

  const report = await readWorkerHeartbeatReport({
    client,
    env: {
      REDIS_URL: "redis://test",
      WORKER_HEARTBEAT_STALE_SECONDS: "60",
    },
    now: new Date("2026-06-22T00:00:20.000Z"),
    workers: ["dynamic-scan-scheduler"],
  });

  assert.equal(report.redis.status, "healthy");
  assert.equal(report.workers[0]?.status, "healthy");
  assert.equal(report.workers[0]?.ageSec, 10);
  assert.match(report.workers[0]?.detail ?? "", /task=health-watch/);
});

test("readWorkerHeartbeatReport marks stale or missing heartbeats down without pretending they are online", async () => {
  const client = createMemoryClient();
  await writeWorkerHeartbeat(client, {
    status: "ok",
    updatedAt: "2026-06-22T00:00:00.000Z",
    worker: "signal",
  });

  const report = await readWorkerHeartbeatReport({
    client,
    env: {
      REDIS_URL: "redis://test",
      WORKER_HEARTBEAT_STALE_SECONDS: "30",
    },
    now: new Date("2026-06-22T00:02:00.000Z"),
    workers: ["signal-worker", "macro-worker"],
  });

  assert.equal(report.workers[0]?.status, "down");
  assert.match(report.workers[0]?.detail ?? "", /心跳过期/);
  assert.equal(report.workers[1]?.status, "down");
  assert.equal(report.workers[1]?.detail, "未收到心跳");
});

test("readWorkerHeartbeatReport exposes an explicit unconfigured Redis probe when REDIS_URL is missing", async () => {
  const report = await readWorkerHeartbeatReport({
    env: {},
    now: new Date("2026-06-22T00:00:00.000Z"),
    workers: ["scanner-worker"],
  });

  assert.equal(report.redis.status, "unconfigured");
  assert.equal(report.workers[0]?.status, "down");
});
