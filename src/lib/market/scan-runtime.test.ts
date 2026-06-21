import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryScanCache,
  calculateNextScanAt,
  runScheduledScan,
} from "./scan-runtime";
import type { MarketDataProvider, MarketRadarSnapshot } from "./types";

function snapshot(overrides: Partial<MarketRadarSnapshot["metadata"]> = {}): MarketRadarSnapshot {
  const metadata: MarketRadarSnapshot["metadata"] = {
    id: "scan-test",
    mode: "demo",
    status: "ready",
    source: "mock",
    isRealtime: false,
    cadenceMinutes: 15,
    scannedCount: 24,
    anomalyCount: 3,
    candidateCount: 1,
    riskGate: "on",
    generatedAt: "2026-06-12T02:00:00.000Z",
    nextScanAt: "2026-06-12T02:15:00.000Z",
    staleAfterMinutes: 30,
    notes: ["test snapshot"],
    ...overrides,
  };

  return {
    metadata,
    instrumentPool: {
      instruments: [],
      rejected: [],
      summary: {
        total: 0,
        accepted: 0,
        rejected: 0,
        duplicatesRemoved: 0,
        minVolume24hUsd: 5_000_000,
        quoteAssets: ["USDT"],
        marketTypes: ["perpetual"],
      },
    },
    instruments: [],
    tickers: [],
    derivatives: [],
    heatmap: [],
    signals: [],
    journalEvents: [],
  };
}

function provider(fetchSnapshot: () => Promise<MarketRadarSnapshot>): MarketDataProvider {
  return {
    id: "mock",
    label: "Test Provider",
    fetchSnapshot,
  };
}

test("calculateNextScanAt advances by the selected cadence", () => {
  assert.equal(
    calculateNextScanAt("2026-06-12T02:20:00.000Z", 15),
    "2026-06-12T02:35:00.000Z",
  );
  assert.equal(
    calculateNextScanAt("2026-06-12T02:20:00.000Z", 30),
    "2026-06-12T02:50:00.000Z",
  );
});

test("runScheduledScan stores a successful provider snapshot with runtime timestamps", async () => {
  const cache = new MemoryScanCache();
  const result = await runScheduledScan({
    provider: provider(async () => snapshot({ id: "fresh-scan" })),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
  });

  assert.equal(result.status, "updated");
  assert.equal(result.snapshot?.metadata.id, "fresh-scan");
  assert.equal(result.snapshot?.metadata.status, "ready");
  assert.equal(result.snapshot?.metadata.generatedAt, "2026-06-12T02:20:00.000Z");
  assert.equal(result.snapshot?.metadata.nextScanAt, "2026-06-12T02:35:00.000Z");
  assert.equal(cache.get()?.metadata.id, "fresh-scan");
});

test("runScheduledScan serves fresh cache without calling the provider", async () => {
  const cache = new MemoryScanCache();
  cache.set(snapshot({
    id: "fresh-cache",
    generatedAt: "2026-06-12T02:10:00.000Z",
  }));
  let fetchCount = 0;

  const result = await runScheduledScan({
    provider: provider(async () => {
      fetchCount += 1;
      return snapshot({ id: "should-not-fetch" });
    }),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
  });

  assert.equal(result.status, "served_cache");
  assert.equal(result.snapshot?.metadata.id, "fresh-cache");
  assert.equal(fetchCount, 0);
});

test("runScheduledScan refreshes stale cache after the cadence window", async () => {
  const cache = new MemoryScanCache();
  cache.set(snapshot({
    id: "old-cache",
    generatedAt: "2026-06-12T02:00:00.000Z",
  }));
  let fetchCount = 0;

  const result = await runScheduledScan({
    provider: provider(async () => {
      fetchCount += 1;
      return snapshot({ id: "new-provider-scan" });
    }),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
  });

  assert.equal(result.status, "updated");
  assert.equal(result.snapshot?.metadata.id, "new-provider-scan");
  assert.equal(fetchCount, 1);
});

test("runScheduledScan force refresh bypasses fresh cache", async () => {
  const cache = new MemoryScanCache();
  cache.set(snapshot({
    id: "fresh-cache",
    generatedAt: "2026-06-12T02:19:00.000Z",
  }));

  const result = await runScheduledScan({
    provider: provider(async () => snapshot({ id: "forced-provider-scan" })),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
    forceRefresh: true,
  });

  assert.equal(result.status, "updated");
  assert.equal(result.snapshot?.metadata.id, "forced-provider-scan");
});

test("runScheduledScan returns cache when an exclusive scan lock is already held", async () => {
  const cache = new MemoryScanCache();
  cache.set(snapshot({
    id: "fresh-cache",
    generatedAt: "2026-06-12T02:19:00.000Z",
  }));
  let fetchCount = 0;

  const result = await runScheduledScan({
    provider: provider(async () => {
      fetchCount += 1;
      return snapshot({ id: "should-not-fetch" });
    }),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
    forceRefresh: true,
    coordinator: {
      async beforeScan() {
        return {
          allowed: false,
          reason: "scan already running",
        };
      },
      async afterScan() {
        throw new Error("release should not run without a lock token");
      },
    },
  });

  assert.equal(result.status, "served_cache");
  assert.equal(result.snapshot?.metadata.id, "fresh-cache");
  assert.equal(fetchCount, 0);
  assert.match(result.snapshot?.metadata.notes.at(-1) ?? "", /scan already running/);
});

test("runScheduledScan fails before provider work when the CoinGlass minute budget is exhausted", async () => {
  let fetchCount = 0;
  const result = await runScheduledScan({
    provider: provider(async () => {
      fetchCount += 1;
      return snapshot({ id: "should-not-fetch" });
    }),
    cache: new MemoryScanCache(),
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
    coordinator: {
      async beforeScan() {
        return {
          allowed: false,
          reason: "coinglass minute budget exhausted",
        };
      },
      async afterScan() {
        throw new Error("release should not run without a lock token");
      },
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.snapshot, null);
  assert.match(result.error ?? "", /minute budget/);
  assert.equal(fetchCount, 0);
});

test("runScheduledScan serves cached data as stale when provider fails", async () => {
  const cache = new MemoryScanCache();
  cache.set(snapshot({ id: "cached-scan", generatedAt: "2026-06-12T01:00:00.000Z" }));

  const result = await runScheduledScan({
    provider: provider(async () => {
      throw new Error("provider rate limit");
    }),
    cache,
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 15,
  });

  assert.equal(result.status, "served_cache");
  assert.equal(result.snapshot?.metadata.id, "cached-scan");
  assert.equal(result.snapshot?.metadata.status, "stale");
  assert.equal(result.snapshot?.metadata.generatedAt, "2026-06-12T01:00:00.000Z");
  assert.equal(result.snapshot?.metadata.nextScanAt, "2026-06-12T02:35:00.000Z");
  assert.match(result.snapshot?.metadata.notes.at(-1) ?? "", /provider rate limit/);
});

test("runScheduledScan reports failed when provider fails before any cache exists", async () => {
  const result = await runScheduledScan({
    provider: provider(async () => {
      throw new Error("provider offline");
    }),
    cache: new MemoryScanCache(),
    now: new Date("2026-06-12T02:20:00.000Z"),
    cadenceMinutes: 30,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.snapshot, null);
  assert.match(result.error ?? "", /provider offline/);
});
