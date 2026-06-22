import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import {
  buildManualTradeJournalEvent,
  reconstructManualTradeJournal,
  sanitizeManualTradeJournalEntry,
  type ManualTradeJournalEntry,
} from "./manual-trade-journal";

const openTrade: ManualTradeJournalEntry = {
  id: "j-arb-1",
  symbol: "arb/usdt",
  side: "long",
  leverage: 10,
  margin: 120,
  entry: 1.1,
  stop: 1.05,
  target: 1.28,
  status: "持仓中",
  note: "等待 1h 回踩确认。",
  images: ["data:image/jpeg;base64,small"],
  createdAt: Date.parse("2026-06-22T08:00:00.000Z"),
};

test("buildManualTradeJournalEvent stores frontend journal entries as rank-neutral research events", () => {
  const event = buildManualTradeJournalEvent({
    entry: openTrade,
    now: "2026-06-22T08:01:00.000Z",
    operation: "upsert",
  });

  assert.equal(event.id, "manual-trade-j-arb-1-upsert");
  assert.equal(event.action, "manual_trade");
  assert.equal(event.source, "manual_trade_journal");
  assert.equal(event.symbol, "ARBUSDT");
  assert.equal(event.rankDelta, 0);
  assert.equal(event.allowedUse, "research_only");
  assert.equal(event.canAutoAdjustWeights, false);
  assert.equal(event.reviewStatus, "tracking");
  assert.equal(event.result, "watching");
  assert.equal(event.manualTradeJournal?.operation, "upsert");
  assert.equal(event.manualTradeJournal?.entry.symbol, "ARBUSDT");
});

test("reconstructManualTradeJournal rebuilds latest frontend journal state from append-only events", () => {
  const closeTrade: ManualTradeJournalEntry = {
    ...openTrade,
    status: "已平仓",
    exitPrice: 1.26,
    result: "win",
    closeNote: "TP1 达成后主动锁盈。",
    closedAt: Date.parse("2026-06-22T12:00:00.000Z"),
  };
  const events = [
    buildManualTradeJournalEvent({
      entry: openTrade,
      now: "2026-06-22T08:01:00.000Z",
      operation: "upsert",
    }),
    buildManualTradeJournalEvent({
      entry: closeTrade,
      now: "2026-06-22T12:01:00.000Z",
      operation: "close",
    }),
  ];

  const reconstructed = reconstructManualTradeJournal(events);

  assert.equal(reconstructed.length, 1);
  assert.equal(reconstructed[0]?.id, "j-arb-1");
  assert.equal(reconstructed[0]?.status, "已平仓");
  assert.equal(reconstructed[0]?.exitPrice, 1.26);
  assert.equal(reconstructed[0]?.result, "win");
});

test("reconstructManualTradeJournal removes deleted trades without deleting database history", () => {
  const events = [
    buildManualTradeJournalEvent({
      entry: openTrade,
      now: "2026-06-22T08:01:00.000Z",
      operation: "upsert",
    }),
    buildManualTradeJournalEvent({
      entry: openTrade,
      now: "2026-06-22T09:01:00.000Z",
      operation: "remove",
    }),
  ];

  assert.deepEqual(reconstructManualTradeJournal(events), []);
});

test("sanitizeManualTradeJournalEntry caps screenshots before database persistence", () => {
  const largeImage = `data:image/jpeg;base64,${"x".repeat(600_000)}`;
  const sanitized = sanitizeManualTradeJournalEntry({
    ...openTrade,
    images: [largeImage, "data:image/jpeg;base64,small"],
  });

  assert.deepEqual(sanitized.images, ["data:image/jpeg;base64,small"]);
});

test("manual trade journal events are ignored by rank scoring", async () => {
  const { rankJournalEvent } = await import("./rank-engine.js");
  const event = buildManualTradeJournalEvent({
    entry: openTrade,
    now: "2026-06-22T08:01:00.000Z",
    operation: "upsert",
  }) satisfies JournalEvent;

  assert.equal(rankJournalEvent(event), 0);
});
