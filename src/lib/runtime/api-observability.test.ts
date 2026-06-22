import assert from "node:assert/strict";
import test from "node:test";
import {
  readApiObservabilityReport,
  recordCoinGlassApiRequest,
  recordDataSourceLatency,
  type ApiObservabilityRedisClient,
} from "./api-observability";

function createMemoryClient(): ApiObservabilityRedisClient & { values: Map<string, string> } {
  const values = new Map<string, string>();

  return {
    expire: async () => true,
    get: async (key) => values.get(key) ?? null,
    incr: async (key) => {
      const next = Number(values.get(key) ?? "0") + 1;
      values.set(key, String(next));
      return next;
    },
    isOpen: true,
    set: async (key, value) => {
      values.set(key, value);
      return "OK";
    },
    values,
  };
}

test("CoinGlass API usage increments a real Redis day counter", async () => {
  const client = createMemoryClient();

  await recordCoinGlassApiRequest(client, {
    count: 2,
    now: new Date("2026-06-22T03:10:00.000Z"),
  });
  await recordCoinGlassApiRequest(client, {
    now: new Date("2026-06-22T03:11:00.000Z"),
  });

  const report = await readApiObservabilityReport({
    client,
    env: {
      COINGLASS_DAILY_REQUEST_BUDGET: "10",
      COINGLASS_MINUTE_REQUEST_LIMIT: "30",
      COINGLASS_REQUEST_INTERVAL_MS: "500",
      REDIS_URL: "redis://test",
    },
    now: new Date("2026-06-22T03:12:00.000Z"),
  });

  assert.equal(report.apiUsage.status, "ready");
  assert.equal(report.apiUsage.usedToday, 3);
  assert.equal(report.apiUsage.remainingToday, 7);
  assert.equal(report.apiUsage.source, "redis");
  assert.equal(report.apiUsage.day, "2026-06-22");
});

test("CoinGlass API usage is explicitly unconfigured when Redis is absent", async () => {
  const report = await readApiObservabilityReport({
    env: {
      COINGLASS_DAILY_REQUEST_BUDGET: "3000",
    },
    now: new Date("2026-06-22T03:12:00.000Z"),
  });

  assert.equal(report.apiUsage.status, "unconfigured");
  assert.equal(report.apiUsage.usedToday, 0);
  assert.equal(report.apiUsage.remainingToday, 3000);
  assert.match(report.apiUsage.detail, /REDIS_URL/);
});

test("data source latency reads recorded probes and keeps missing sources partial", async () => {
  const client = createMemoryClient();

  await recordDataSourceLatency(client, {
    checkedAt: "2026-06-22T03:10:00.000Z",
    elapsedMs: 184,
    source: "coinglass",
  });
  await recordDataSourceLatency(client, {
    checkedAt: "2026-06-22T03:10:01.000Z",
    elapsedMs: 42,
    source: "binance",
  });

  const report = await readApiObservabilityReport({
    client,
    env: { REDIS_URL: "redis://test" },
    now: new Date("2026-06-22T03:12:00.000Z"),
  });

  assert.equal(report.dataSourceLatency.status, "partial");
  assert.equal(report.dataSourceLatency.probes.find((probe) => probe.name === "CoinGlass")?.latencyMs, 184);
  assert.equal(report.dataSourceLatency.probes.find((probe) => probe.name === "Binance")?.latencyMs, 42);
  assert.equal(report.dataSourceLatency.probes.find((probe) => probe.name === "OKX")?.status, "partial");
  assert.equal(report.dataSourceLatency.probes.find((probe) => probe.name === "OKX")?.latencyMs, null);
});
