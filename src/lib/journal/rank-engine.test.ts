import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import {
  buildRankProfile,
  rankJournalEvent,
  rankTiers,
} from "./rank-engine";

function entry(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    id: "journal-ena",
    symbol: "ENAUSDT",
    title: "测试复盘",
    result: "watching",
    note: "等待触发",
    rankDelta: 0,
    createdAt: "2026-06-12T10:00:00.000+08:00",
    reviewStatus: "tracking",
    ...overrides,
  };
}

test("rankJournalEvent rewards discipline and tracking without treating them as wins", () => {
  assert.equal(rankJournalEvent(entry({
    id: "skip",
    result: "saved",
    action: "skip",
    rankDelta: 1,
    reviewStatus: "closed",
  })), 15);

  assert.equal(rankJournalEvent(entry({
    id: "paper",
    action: "paper_trade",
    riskReward: 3.6,
  })), 7);
});

test("rankJournalEvent penalizes losses but gives a small review credit for lessons", () => {
  assert.equal(rankJournalEvent(entry({
    id: "loss-raw",
    result: "loss",
    rankDelta: -1,
    reviewStatus: "closed",
  })), -16);

  assert.equal(rankJournalEvent(entry({
    id: "loss-reviewed",
    result: "loss",
    rankDelta: -1,
    reviewStatus: "closed",
    lessons: ["追单导致止损距离变丑"],
  })), -13);
});

test("rankJournalEvent keeps daily mover calibration reviews score-neutral", () => {
  assert.equal(rankJournalEvent(entry({
    action: "calibration_review",
    id: "daily-mover-calibration",
    lessons: ["daily_mover_calibration", "review_volume_oi_weight"],
    outcomeStatus: "pending",
    result: "watching",
    reviewStatus: "tracking",
  })), 0);
});

test("buildRankProfile converts journal history into tier, progress, and pet state", () => {
  const profile = buildRankProfile([
    entry({
      id: "saved-tia",
      result: "saved",
      action: "skip",
      rankDelta: 1,
      reviewStatus: "closed",
    }),
    entry({
      id: "win-ena",
      result: "win",
      rankDelta: 2,
      riskReward: 3.8,
      reviewStatus: "closed",
    }),
    entry({
      id: "track-ondo",
      action: "track",
      result: "watching",
      reviewStatus: "tracking",
    }),
  ]);

  assert.equal(profile.totalXp, 42);
  assert.equal(profile.tier.id, "observer");
  assert.equal(profile.nextTier?.id, "discipline");
  assert.equal(profile.xpToNextTier, 18);
  assert.equal(profile.progressPercent, 55);
  assert.equal(profile.wins, 1);
  assert.equal(profile.losses, 0);
  assert.equal(profile.saved, 1);
  assert.equal(profile.tracking, 1);
  assert.equal(profile.hitRate, 100);
  assert.equal(profile.disciplineScore, 67);
  assert.equal(profile.petMood, "calm");
  assert.match(profile.petLine, /观察席/);
});

test("buildRankProfile can downgrade into serious mode after unresolved losses", () => {
  const profile = buildRankProfile([
    entry({
      id: "loss-a",
      result: "loss",
      rankDelta: -1,
      reviewStatus: "closed",
    }),
    entry({
      id: "loss-b",
      result: "loss",
      rankDelta: -1,
      reviewStatus: "closed",
    }),
  ]);

  assert.equal(profile.rawScore, -32);
  assert.equal(profile.totalXp, 0);
  assert.equal(profile.tier.id, rankTiers[0]?.id);
  assert.equal(profile.petMood, "serious");
  assert.match(profile.petLine, /刹车/);
});
