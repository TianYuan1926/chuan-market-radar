import assert from "node:assert/strict";
import test from "node:test";
import type { MarketSignal } from "@/lib/analysis/types";
import {
  buildJournalEntryFromSignal,
  mergeJournalEntry,
  plannedReviewAt,
} from "./journal-entry";

const baseSignal: MarketSignal = {
  id: "ena-near-trigger",
  symbol: "ENAUSDT",
  exchange: "BINANCE",
  direction: "long",
  state: "near_trigger",
  timeframe: "15m",
  regime: "mixed",
  confidence: 80,
  risk: "low",
  updatedAt: "2026-06-12T10:15:00+08:00",
  summary: "接近触发，但必须等回踩确认。",
  evidence: [
    {
      label: "位置",
      value: "箱体上沿",
      layer: "structure_location",
      polarity: "supportive",
    },
  ],
  strategy: {
    bias: "long",
    entry: "15m 放量突破后回踩不破",
    invalidation: "跌回箱体内部",
    targets: ["前高流动性区"],
    riskReward: 4,
    status: "actionable",
    positionHint: "候选可执行，但必须等待触发和失效同时清楚。",
    entryZone: "回踩确认区",
    stopLoss: "跌回箱体内部",
    takeProfitPlan: "4.00R 计划",
    noChase: true,
  },
};

test("plannedReviewAt maps the selected timeframe to a practical follow-up window", () => {
  assert.equal(
    plannedReviewAt("2026-06-12T10:15:00+08:00", "15m"),
    "2026-06-12T11:45:00.000+08:00",
  );
  assert.equal(
    plannedReviewAt("2026-06-12T10:15:00+08:00", "1h"),
    "2026-06-12T14:15:00.000+08:00",
  );
  assert.equal(
    plannedReviewAt("bad-date", "4h"),
    "bad-date",
  );
});

test("buildJournalEntryFromSignal preserves the full decision context", () => {
  const entry = buildJournalEntryFromSignal(baseSignal, "track", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.equal(entry.id, "journal-ena-near-trigger-track");
  assert.equal(entry.signalId, "ena-near-trigger");
  assert.equal(entry.symbol, "ENAUSDT");
  assert.equal(entry.action, "track");
  assert.equal(entry.result, "watching");
  assert.equal(entry.reviewStatus, "tracking");
  assert.equal(entry.timeframe, "15m");
  assert.equal(entry.direction, "long");
  assert.equal(entry.strategyStatus, "actionable");
  assert.equal(entry.riskReward, 4);
  assert.equal(entry.trigger, "15m 放量突破后回踩不破");
  assert.equal(entry.invalidation, "跌回箱体内部");
  assert.equal(entry.plannedReviewAt, "2026-06-12T11:45:00.000+08:00");
  assert.match(entry.note, /候选可执行/);
  assert.match(entry.thesis, /接近触发/);
});

test("skip decisions are saved as positive discipline instead of failed trades", () => {
  const entry = buildJournalEntryFromSignal(baseSignal, "skip", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });

  assert.equal(entry.result, "saved");
  assert.equal(entry.reviewStatus, "closed");
  assert.equal(entry.rankDelta, 1);
  assert.match(entry.title, /拒绝追单/);
});

test("mergeJournalEntry keeps the newest copy for the same journal id", () => {
  const first = buildJournalEntryFromSignal(baseSignal, "track", {
    createdAt: "2026-06-12T10:20:00+08:00",
  });
  const second = {
    ...first,
    note: "用户更新后的观察备注",
    createdAt: "2026-06-12T10:24:00+08:00",
  };
  const merged = mergeJournalEntry([first], second);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.note, "用户更新后的观察备注");
  assert.equal(merged[0]?.createdAt, "2026-06-12T10:24:00+08:00");
});
