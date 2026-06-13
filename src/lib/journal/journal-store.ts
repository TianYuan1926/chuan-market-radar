import type { JournalEvent } from "@/lib/analysis/types";
import { mergeJournalEntry } from "./journal-entry";

function sortableTime(value: string) {
  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function sortEntries(entries: JournalEvent[]) {
  return [...entries].sort(
    (left, right) => sortableTime(right.createdAt) - sortableTime(left.createdAt),
  );
}

export function createJournalStore(initialEntries: JournalEvent[] = []) {
  let entries = sortEntries(initialEntries);

  return {
    list() {
      return entries;
    },

    add(entry: JournalEvent) {
      entries = mergeJournalEntry(entries, entry);
      return entry;
    },

    clear() {
      entries = [];
    },
  };
}
