import assert from "node:assert/strict";
import test from "node:test";
import type { JournalEvent } from "@/lib/analysis/types";
import { createJournalStore } from "./journal-store";

const oldEntry: JournalEvent = {
  id: "journal-old",
  symbol: "TIAUSDT",
  title: "中部位置不交易",
  result: "saved",
  note: "低赔率位置主动放弃。",
  rankDelta: 1,
  createdAt: "2026-06-12T09:45:00+08:00",
};

const freshEntry: JournalEvent = {
  id: "journal-fresh",
  symbol: "ENAUSDT",
  title: "加入跟踪队列",
  result: "watching",
  note: "等待触发确认。",
  rankDelta: 0,
  createdAt: "2026-06-12T10:20:00+08:00",
};

test("createJournalStore returns newest journal entries first", () => {
  const store = createJournalStore([oldEntry, freshEntry]);

  assert.deepEqual(store.list().map((entry) => entry.id), [
    "journal-fresh",
    "journal-old",
  ]);
});

test("createJournalStore upserts entries by id", () => {
  const store = createJournalStore([oldEntry]);
  const updated = {
    ...oldEntry,
    note: "复盘后确认，跳过是正确选择。",
    createdAt: "2026-06-12T10:30:00+08:00",
  };

  store.add(updated);

  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0]?.note, "复盘后确认，跳过是正确选择。");
});

test("createJournalStore can clear demo runtime entries", () => {
  const store = createJournalStore([oldEntry]);

  store.clear();

  assert.deepEqual(store.list(), []);
});
