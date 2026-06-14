import assert from "node:assert/strict";
import test from "node:test";

import type {
  DailyMover,
  DailyMoverReview,
  DailyMoverSnapshot,
} from "../market/daily-movers";
import { createMemoryPersistenceRepository } from "../persistence/persistence-store";
import {
  getDailyMoverReadArchive,
  normalizeDailyMoverReadLimit,
} from "./daily-mover-readonly";

function mover(
  symbol: string,
  direction: DailyMover["direction"],
  rank: number,
  observedAt: string,
  priceChangePercent: number,
): DailyMover {
  return {
    id: `${symbol.toLowerCase()}-${direction}-${rank}`,
    symbol,
    exchange: "BINANCE",
    direction,
    rank,
    observedAt,
    priceChangePercent,
    volume24hUsd: 120_000_000,
    openInterestChangePercent: 22,
    fundingRate: 0.0006,
  };
}

function review(
  item: DailyMover,
  status: DailyMoverReview["radarReview"]["status"],
  learnability: DailyMoverReview["attribution"]["learnability"],
): DailyMoverReview {
  return {
    id: item.id,
    symbol: item.symbol,
    direction: item.direction,
    observedAt: item.observedAt,
    allowedUse: "research_only",
    guardrail: "每日涨跌幅榜只用于归因复盘、样本库和规则校准，不用于追涨杀跌。",
    attribution: {
      evidenceStrength: learnability === "learnable" ? "strong" : "medium",
      learnability,
      primaryDrivers: ["volume_expansion", "open_interest_expansion"],
    },
    radarReview: {
      status,
      matchedSignalIds: status === "caught" ? [`sig-${item.symbol.toLowerCase()}`] : [],
      improvementTags: status === "missed" ? ["review_volume_oi_weight"] : [],
    },
  };
}

function snapshot(
  id: string,
  observedAt: string,
  gainerSymbol: string,
  loserSymbol: string,
): DailyMoverSnapshot {
  const gainer = mover(gainerSymbol, "gainer", 1, observedAt, 34.2);
  const loser = mover(loserSymbol, "loser", 1, observedAt, -21.8);

  return {
    id,
    source: "coinglass",
    observedAt,
    gainers: [gainer],
    losers: [loser],
    reviews: [
      review(gainer, "caught", "learnable"),
      review(loser, "missed", "watchlist"),
    ],
  };
}

test("getDailyMoverReadArchive exposes the latest research-only snapshot and bounded summaries", async () => {
  const repository = createMemoryPersistenceRepository({ scope: "chuan-public" });
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-14",
    "2026-06-14T00:17:00.000Z",
    "SOLUSDT",
    "AVAXUSDT",
  ));
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({ repository, limit: 1 });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    assert.fail("expected a successful daily mover archive response");
  }

  assert.equal(result.body.allowedUse, "research_only");
  assert.match(result.body.guardrail, /不用于追涨杀跌/);
  assert.equal(result.body.retention.storage, "memory");
  assert.equal(result.body.retention.scope, "chuan-public");
  assert.equal(result.body.retention.limit, 1);
  assert.equal(result.body.latestSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.snapshots.length, 1);
  assert.equal(result.body.snapshots[0]?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.snapshots[0]?.topGainers[0]?.symbol, "ENAUSDT");
  assert.equal(result.body.snapshots[0]?.topLosers[0]?.symbol, "SUIUSDT");
  assert.equal(result.body.snapshots[0]?.attribution.learnable, 1);
  assert.equal(result.body.snapshots[0]?.attribution.watchlist, 1);
  assert.equal(result.body.snapshots[0]?.radarReview.caught, 1);
  assert.equal(result.body.snapshots[0]?.radarReview.missed, 1);
});

test("getDailyMoverReadArchive selects a requested historical snapshot by id", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-14",
    "2026-06-14T00:17:00.000Z",
    "SOLUSDT",
    "AVAXUSDT",
  ));
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({
    id: "daily-movers-coinglass-2026-06-14",
    limit: "5",
    repository,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);

  if (!result.body.ok) {
    assert.fail("expected a successful daily mover archive response");
  }

  assert.equal(result.body.latestSnapshot?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot?.id, "daily-movers-coinglass-2026-06-14");
  assert.deepEqual(result.body.snapshots.map((item: { id: string }) => item.id), [
    "daily-movers-coinglass-2026-06-15",
    "daily-movers-coinglass-2026-06-14",
  ]);
});

test("getDailyMoverReadArchive returns 404 for a missing requested snapshot without hiding recent samples", async () => {
  const repository = createMemoryPersistenceRepository();
  await repository.addDailyMoverSnapshot(snapshot(
    "daily-movers-coinglass-2026-06-15",
    "2026-06-15T00:17:00.000Z",
    "ENAUSDT",
    "SUIUSDT",
  ));

  const result = await getDailyMoverReadArchive({
    id: "missing-snapshot",
    repository,
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error, "daily_mover_snapshot_not_found");
  assert.equal(result.body.snapshots[0]?.id, "daily-movers-coinglass-2026-06-15");
  assert.equal(result.body.selectedSnapshot, null);
});

test("normalizeDailyMoverReadLimit defaults and clamps public read volume", () => {
  assert.equal(normalizeDailyMoverReadLimit(undefined), 14);
  assert.equal(normalizeDailyMoverReadLimit("abc"), 14);
  assert.equal(normalizeDailyMoverReadLimit("0"), 1);
  assert.equal(normalizeDailyMoverReadLimit(100), 30);
  assert.equal(normalizeDailyMoverReadLimit("9"), 9);
});
