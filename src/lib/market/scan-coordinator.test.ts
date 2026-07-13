import assert from "node:assert/strict";
import test from "node:test";

import {
  createFailoverScanCoordinator,
  createMemoryScanCoordinator,
  createRedisScanCoordinatorFromClient,
} from "./scan-coordinator";

test("createMemoryScanCoordinator blocks overlapping scans until the active token is released", async () => {
  const coordinator = createMemoryScanCoordinator({
    coinGlassMinuteLimit: 30,
    estimatedCoinGlassRequests: 4,
    lockTtlMs: 60_000,
  });
  const context = {
    cadenceMinutes: 15 as const,
    forceRefresh: true,
    now: new Date("2026-06-20T00:00:00.000Z"),
    providerId: "coinglass" as const,
    trigger: "cron_post" as const,
  };

  const first = await coordinator.beforeScan(context);
  const second = await coordinator.beforeScan(context);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.allowed ? "" : second.code, "scan_in_progress");
  assert.match(second.allowed ? "" : second.reason, /already running/);

  if (first.allowed) {
    await coordinator.afterScan(first.token, { status: "updated" });
  }

  const third = await coordinator.beforeScan(context);

  assert.equal(third.allowed, true);
});

test("createMemoryScanCoordinator enforces the CoinGlass minute request budget", async () => {
  const coordinator = createMemoryScanCoordinator({
    coinGlassMinuteLimit: 5,
    estimatedCoinGlassRequests: 4,
    lockTtlMs: 60_000,
  });
  const context = {
    cadenceMinutes: 15 as const,
    forceRefresh: true,
    now: new Date("2026-06-20T00:00:00.000Z"),
    providerId: "coinglass" as const,
    trigger: "cron_post" as const,
  };

  const first = await coordinator.beforeScan(context);

  assert.equal(first.allowed, true);

  if (first.allowed) {
    await coordinator.afterScan(first.token, { status: "updated" });
  }

  const second = await coordinator.beforeScan({
    ...context,
    now: new Date("2026-06-20T00:00:30.000Z"),
  });

  assert.equal(second.allowed, false);
  assert.equal(second.allowed ? "" : second.code, "budget_exhausted");
  assert.match(second.allowed ? "" : second.reason, /minute budget/);

  const nextMinute = await coordinator.beforeScan({
    ...context,
    now: new Date("2026-06-20T00:01:00.000Z"),
  });

  assert.equal(nextMinute.allowed, true);
});

test("createRedisScanCoordinatorFromClient stores scan locks and minute budget counters in Redis", async () => {
  const values = new Map<string, string>();
  const expirations = new Map<string, number>();
  const client = {
    async connect() {},
    isOpen: true,
    async set(key: string, value: string, options: { NX?: boolean; PX?: number }) {
      if (options.NX && values.has(key)) {
        return null;
      }

      values.set(key, value);
      expirations.set(key, options.PX ?? 0);

      return "OK";
    },
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async del(key: string) {
      const existed = values.delete(key);

      return existed ? 1 : 0;
    },
    async incrBy(key: string, amount: number) {
      const next = Number(values.get(key) ?? 0) + amount;
      values.set(key, String(next));

      return next;
    },
    async decrBy(key: string, amount: number) {
      const next = Number(values.get(key) ?? 0) - amount;
      values.set(key, String(next));

      return next;
    },
    async expire(key: string, seconds: number) {
      expirations.set(key, seconds * 1_000);

      return true;
    },
  };
  const coordinator = createRedisScanCoordinatorFromClient(client, {
    coinGlassMinuteLimit: 5,
    estimatedCoinGlassRequests: 4,
    lockTtlMs: 90_000,
  });
  const context = {
    cadenceMinutes: 15 as const,
    forceRefresh: true,
    now: new Date("2026-06-20T00:00:00.000Z"),
    providerId: "coinglass" as const,
    trigger: "cron_post" as const,
  };

  const first = await coordinator.beforeScan(context);

  assert.equal(first.allowed, true);
  assert.equal(expirations.get("scan:lock:coinglass"), 90_000);

  if (first.allowed) {
    await coordinator.afterScan(first.token, { status: "updated" });
  }

  const second = await coordinator.beforeScan({
    ...context,
    now: new Date("2026-06-20T00:00:30.000Z"),
  });

  assert.equal(second.allowed, false);
  assert.match(second.allowed ? "" : second.reason, /minute budget/);
  assert.equal(values.get("scan:coinglass:minute:2026-06-20T00:00:00.000Z"), "4");
});

test("createFailoverScanCoordinator releases fallback memory locks even when primary recovers before afterScan", async () => {
  const fallback = createMemoryScanCoordinator({
    coinGlassMinuteLimit: 30,
    estimatedCoinGlassRequests: 4,
    lockTtlMs: 600_000,
  });
  const recoveredPrimary = createMemoryScanCoordinator({
    coinGlassMinuteLimit: 30,
    estimatedCoinGlassRequests: 4,
    lockTtlMs: 600_000,
  });
  let primaryAvailable = false;
  const coordinator = createFailoverScanCoordinator({
    fallback,
    primary: async () => {
      if (!primaryAvailable) {
        throw new Error("redis temporarily unavailable");
      }

      return recoveredPrimary;
    },
  });
  const context = {
    cadenceMinutes: 15 as const,
    forceRefresh: true,
    now: new Date("2026-06-20T00:00:00.000Z"),
    providerId: "coinglass" as const,
    trigger: "cron_post" as const,
  };

  const first = await coordinator.beforeScan(context);

  assert.equal(first.allowed, true);

  primaryAvailable = true;

  if (first.allowed) {
    await coordinator.afterScan(first.token, { status: "updated" });
  }

  primaryAvailable = false;

  const second = await coordinator.beforeScan({
    ...context,
    now: new Date("2026-06-20T00:00:30.000Z"),
  });

  assert.equal(second.allowed, true);
});
