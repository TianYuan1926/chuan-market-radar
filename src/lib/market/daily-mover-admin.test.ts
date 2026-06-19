import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  runAdminDailyMoverIngest,
  type AdminDailyMoverIngestResponse,
} from "./daily-mover-admin";
import type { DailyMoverIngestResult } from "./daily-mover-ingest";

function assertError(
  response: AdminDailyMoverIngestResponse,
  expected: {
    error: string;
    status: number;
  },
) {
  assert.equal(response.status, expected.status);
  assert.equal(response.body.ok, false);

  if (!response.body.ok) {
    assert.equal(response.body.error, expected.error);
  }
}

test("runAdminDailyMoverIngest refuses to run when CRON_SECRET is missing", async () => {
  let called = false;
  const response = await runAdminDailyMoverIngest({
    authorization: "Bearer anything",
    env: {
      COINGLASS_API_KEY: "test-key",
    },
    ingest: async () => {
      called = true;
      throw new Error("should not run");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "daily_mover_secret_missing",
    status: 503,
  });
  assert.equal(called, false);
});

test("runAdminDailyMoverIngest rejects requests with the wrong bearer token", async () => {
  let called = false;
  const response = await runAdminDailyMoverIngest({
    authorization: "Bearer wrong",
    env: {
      COINGLASS_API_KEY: "test-key",
      CRON_SECRET: "correct-secret",
    },
    ingest: async () => {
      called = true;
      throw new Error("should not run");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "unauthorized",
    status: 401,
  });
  assert.equal(called, false);
});

test("runAdminDailyMoverIngest reports missing CoinGlass credentials before requesting data", async () => {
  let called = false;
  const response = await runAdminDailyMoverIngest({
    authorization: "Bearer correct-secret",
    env: {
      CRON_SECRET: "correct-secret",
    },
    ingest: async () => {
      called = true;
      throw new Error("should not run");
    },
    repository: createMemoryPersistenceRepository(),
  });

  assertError(response, {
    error: "coinglass_unavailable",
    status: 503,
  });
  assert.equal(called, false);
});

test("runAdminDailyMoverIngest triggers the ingest service after authorization", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  const calls: Array<{
    apiKey: string;
    baseAssets?: string[];
    limitPerSide?: number;
    maxAssets?: number;
  }> = [];
  const response = await runAdminDailyMoverIngest({
    authorization: "Bearer correct-secret",
    env: {
      COINGLASS_API_KEY: "test-key",
      COINGLASS_BASE_ASSETS: "SOL, AVAX, SOL",
      CRON_SECRET: "correct-secret",
    },
    ingest: async (options): Promise<DailyMoverIngestResult> => {
      calls.push({
        apiKey: options.apiKey,
        baseAssets: options.baseAssets,
        limitPerSide: options.limitPerSide,
        maxAssets: options.maxAssets,
      });

      return {
        status: "stored",
        storage: repository.mode,
        scope: repository.scope,
        requestedAssets: options.baseAssets ?? [],
        rawRowCount: 2,
        coveragePlan: {
          configuredAssets: options.baseAssets ?? [],
          discovery: {
            instrumentCount: 0,
            notes: [],
            requestCount: 0,
            source: "test",
            status: "ready",
          },
          maxAssets: options.maxAssets ?? 30,
          mode: "discovered_rotation",
          notes: ["test coverage plan"],
          requestedAssets: options.baseAssets ?? [],
          rotationCursor: 20_000,
          totalUniverseAssets: options.baseAssets?.length ?? 0,
        },
        snapshot: {
          id: "daily-movers-coinglass-2026-06-14",
          source: "coinglass",
          observedAt: "2026-06-14T00:00:00.000Z",
          gainers: [],
          losers: [],
          reviews: [],
        },
        notes: ["free tier controls: max assets 30, limit per side 10"],
      };
    },
    repository,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(calls, [{
    apiKey: "test-key",
    baseAssets: ["SOL", "AVAX"],
    limitPerSide: 10,
    maxAssets: 30,
  }]);

  if (response.body.ok) {
    assert.equal(response.body.ingest.snapshotId, "daily-movers-coinglass-2026-06-14");
    assert.equal(response.body.ingest.storage, "memory");
    assert.deepEqual(response.body.ingest.requestedAssets, ["SOL", "AVAX"]);
    assert.equal(response.body.ingest.rawRowCount, 2);
    assert.equal(response.body.ingest.coverageMode, "discovered_rotation");
    assert.equal(response.body.ingest.discoveryStatus, "ready");
  }
});
