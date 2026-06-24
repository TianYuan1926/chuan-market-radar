import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyMoverReview } from "./daily-movers";

const observedAt = "2026-06-14T00:00:00.000Z";

test("daily mover review turns a caught gainer into a research sample instead of a chase signal", () => {
  const review = buildDailyMoverReview({
    mover: {
      id: "mover-sol-2026-06-14",
      symbol: "SOL",
      exchange: "BINANCE",
      direction: "gainer",
      rank: 1,
      observedAt,
      priceChangePercent: 38.4,
      volume24hUsd: 720_000_000,
      openInterestChangePercent: 31,
      fundingRate: 0.0009,
      liquidationUsd24h: 18_000_000,
    },
    preMoveWindows: [
      {
        window: "4h",
        startedAt: "2026-06-13T20:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 6.2,
        volumeChangePercent: 185,
        openInterestChangePercent: 22,
        fundingRate: 0.0006,
        radarSignalIds: ["sig-sol-compression"],
      },
    ],
    radarSignals: [
      {
        id: "sig-sol-compression",
        symbol: "SOL",
        state: "near_trigger",
        confidence: 78,
        updatedAt: "2026-06-13T21:10:00.000Z",
      },
    ],
  });

  assert.equal(review.allowedUse, "research_only");
  assert.equal(review.radarReview.status, "caught");
  assert.deepEqual(review.radarReview.matchedSignalIds, ["sig-sol-compression"]);
  assert.ok(review.attribution.primaryDrivers.includes("volume_expansion"));
  assert.ok(review.attribution.primaryDrivers.includes("open_interest_expansion"));
  assert.equal(review.attribution.learnability, "learnable");
  assert.equal(review.preMovePattern?.bestWindow, "4h");
  assert.equal(review.preMovePattern?.type, "volume_oi_build_up");
  assert.ok((review.preMovePattern?.earlyWarningScore ?? 0) >= 80);
  assert.deepEqual(review.preMovePattern?.missedBecause, []);
  assert.match(review.guardrail, /不用于追涨杀跌/);
});

test("daily mover review records a miss when pre-move evidence existed without a radar match", () => {
  const review = buildDailyMoverReview({
    mover: {
      id: "mover-avax-2026-06-14",
      symbol: "AVAX",
      exchange: "BINANCE",
      direction: "loser",
      rank: 2,
      observedAt,
      priceChangePercent: -24.8,
      volume24hUsd: 410_000_000,
      openInterestChangePercent: 27,
      fundingRate: -0.0007,
      liquidationUsd24h: 29_000_000,
    },
    preMoveWindows: [
      {
        window: "24h",
        startedAt: "2026-06-13T00:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: -5.5,
        volumeChangePercent: 142,
        openInterestChangePercent: 18,
        fundingRate: -0.0005,
        radarSignalIds: [],
      },
    ],
    radarSignals: [],
  });

  assert.equal(review.radarReview.status, "missed");
  assert.ok(review.radarReview.improvementTags.includes("review_volume_oi_weight"));
  assert.ok(review.radarReview.improvementTags.includes("review_pre_move_window_weight"));
  assert.ok(review.radarReview.improvementTags.includes("review_short_side_detection"));
  assert.equal(review.attribution.evidenceStrength, "strong");
  assert.equal(review.preMovePattern?.bestWindow, "24h");
  assert.ok((review.preMovePattern?.missedBecause.length ?? 0) >= 2);
  assert.match(review.preMovePattern?.missedBecause.join(" ") ?? "", /晋级条件|候选池/);
});

test("daily mover review marks low-liquidity one-off moves as not learnable", () => {
  const review = buildDailyMoverReview({
    mover: {
      id: "mover-thin-2026-06-14",
      symbol: "THIN",
      exchange: "UNKNOWN",
      direction: "gainer",
      rank: 4,
      observedAt,
      priceChangePercent: 61,
      volume24hUsd: 1_200_000,
      openInterestChangePercent: 4,
      fundingRate: 0.0001,
      eventTags: ["low_liquidity", "single_venue_spike"],
    },
    preMoveWindows: [
      {
        window: "1h",
        startedAt: "2026-06-13T23:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 2.1,
        volumeChangePercent: 24,
        openInterestChangePercent: 3,
        fundingRate: 0.0001,
        radarSignalIds: [],
      },
    ],
    radarSignals: [],
  });

  assert.equal(review.attribution.learnability, "not_learnable");
  assert.equal(review.radarReview.status, "not_learnable");
  assert.deepEqual(review.radarReview.improvementTags, []);
  assert.ok(review.attribution.primaryDrivers.includes("low_liquidity_or_one_off"));
  assert.equal(review.preMovePattern?.type, "no_reliable_premark");
  assert.equal(review.preMovePattern?.earlyWarningScore, 0);
});

test("daily mover review does not classify liquidation alone as a primary driver", () => {
  const review = buildDailyMoverReview({
    mover: {
      id: "mover-tia-2026-06-14",
      symbol: "TIA",
      exchange: "BINANCE",
      direction: "gainer",
      rank: 3,
      observedAt,
      priceChangePercent: 19.2,
      volume24hUsd: 220_000_000,
      openInterestChangePercent: 2,
      fundingRate: 0.0001,
      liquidationUsd24h: 120_000_000,
    },
    preMoveWindows: [
      {
        window: "4h",
        startedAt: "2026-06-13T20:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 5.2,
        volumeChangePercent: 18,
        openInterestChangePercent: 2,
        fundingRate: 0.0001,
        radarSignalIds: [],
      },
    ],
    radarSignals: [],
  });

  assert.equal(review.attribution.primaryDrivers.some((driver) => (driver as string) === "liquidation_pressure"), false);
  assert.deepEqual(review.attribution.primaryDrivers, ["pre_move_drift"]);
  assert.equal(review.attribution.evidenceStrength, "medium");
  assert.equal(review.preMovePattern?.type, "early_drift_before_move");
});

test("daily mover review compares 3h 6h and 12h windows for early warning quality", () => {
  const review = buildDailyMoverReview({
    mover: {
      id: "mover-arb-2026-06-14",
      symbol: "ARB",
      exchange: "BINANCE",
      direction: "gainer",
      rank: 5,
      observedAt,
      priceChangePercent: 22.5,
      volume24hUsd: 160_000_000,
      openInterestChangePercent: 18,
      fundingRate: 0.0002,
    },
    preMoveWindows: [
      {
        window: "3h",
        startedAt: "2026-06-13T21:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 1.1,
        volumeChangePercent: 42,
        openInterestChangePercent: 6,
        fundingRate: 0.0001,
        radarSignalIds: [],
      },
      {
        window: "6h",
        startedAt: "2026-06-13T18:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 2.8,
        volumeChangePercent: 112,
        openInterestChangePercent: 16,
        fundingRate: 0.0002,
        radarSignalIds: [],
      },
      {
        window: "12h",
        startedAt: "2026-06-13T12:00:00.000Z",
        endedAt: observedAt,
        priceChangePercent: 13.4,
        volumeChangePercent: 130,
        openInterestChangePercent: 17,
        fundingRate: 0.0002,
        radarSignalIds: [],
      },
    ],
    radarSignals: [],
  });

  assert.equal(review.preMovePattern?.bestWindow, "6h");
  assert.equal(review.preMovePattern?.type, "quiet_accumulation_before_move");
  assert.ok((review.preMovePattern?.earlyWarningScore ?? 0) >= 55);
  assert.ok(review.radarReview.improvementTags.includes("review_pre_move_window_weight"));
  assert.match(review.preMovePattern?.clues.join(" ") ?? "", /6h 成交量提前放大/);
});
