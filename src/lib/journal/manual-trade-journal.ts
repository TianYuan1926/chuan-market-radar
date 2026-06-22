import type {
  JournalEvent,
  ManualTradeJournalEntry,
  ManualTradeJournalOperation,
} from "@/lib/analysis/types";

export type {
  ManualTradeJournalEntry,
  ManualTradeJournalOperation,
} from "@/lib/analysis/types";

const maxImages = 6;
const maxImageChars = 500_000;

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeManualTradeSymbol(value: string) {
  const upper = value.trim().toUpperCase();

  if (!upper) {
    return "UNKNOWN";
  }

  const compact = upper
    .replace(/^BINANCE:/, "")
    .replace(/\.P$/, "")
    .replace(/[^A-Z0-9]/g, "");

  if (compact.endsWith("USDT") || compact.endsWith("USDC") || compact.endsWith("USD")) {
    return compact;
  }

  return `${compact}USDT`;
}

function sanitizeImages(images: unknown) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .filter((image): image is string => typeof image === "string")
    .filter((image) => image.length > 0 && image.length <= maxImageChars)
    .slice(0, maxImages);
}

export function sanitizeManualTradeJournalEntry(entry: ManualTradeJournalEntry): ManualTradeJournalEntry {
  const status = entry.status === "已平仓" ? "已平仓" : "持仓中";
  const result = entry.result === "loss" ? "loss" : entry.result === "win" ? "win" : undefined;
  const sanitized: ManualTradeJournalEntry = {
    id: cleanText(entry.id, `j-${Date.now()}`),
    symbol: normalizeManualTradeSymbol(entry.symbol),
    side: entry.side === "short" ? "short" : "long",
    leverage: Math.max(1, finiteNumber(entry.leverage, 1)),
    margin: Math.max(0, finiteNumber(entry.margin)),
    entry: Math.max(0, finiteNumber(entry.entry)),
    stop: Math.max(0, finiteNumber(entry.stop)),
    target: Math.max(0, finiteNumber(entry.target)),
    status,
    note: cleanText(entry.note),
    images: sanitizeImages(entry.images),
    createdAt: Math.max(0, finiteNumber(entry.createdAt, Date.now())),
  };

  if (status === "已平仓") {
    sanitized.exitPrice = Math.max(0, finiteNumber(entry.exitPrice));
    sanitized.result = result ?? "loss";
    sanitized.closeNote = cleanText(entry.closeNote);
    sanitized.closedAt = Math.max(0, finiteNumber(entry.closedAt, Date.now()));
  }

  return sanitized;
}

function titleFor(operation: ManualTradeJournalOperation, entry: ManualTradeJournalEntry) {
  const side = entry.side === "short" ? "空" : "多";

  if (operation === "remove") {
    return `删除手动交易记录 ${entry.symbol}`;
  }

  if (operation === "close") {
    return `平仓手动交易 ${entry.symbol}`;
  }

  if (operation === "reopen") {
    return `重新打开手动交易 ${entry.symbol}`;
  }

  return `记录手动交易 ${entry.symbol} ${side}`;
}

function resultFor(operation: ManualTradeJournalOperation, entry: ManualTradeJournalEntry): JournalEvent["result"] {
  if (operation === "remove") {
    return "watching";
  }

  if (entry.status === "已平仓") {
    return entry.result === "win" ? "win" : "loss";
  }

  return "watching";
}

function reviewStatusFor(operation: ManualTradeJournalOperation, entry: ManualTradeJournalEntry) {
  if (operation === "remove" || entry.status === "已平仓") {
    return "closed" as const;
  }

  return "tracking" as const;
}

export function buildManualTradeJournalEvent({
  entry,
  now = new Date().toISOString(),
  operation,
}: {
  entry: ManualTradeJournalEntry;
  now?: string;
  operation: ManualTradeJournalOperation;
}): JournalEvent {
  const sanitized = sanitizeManualTradeJournalEntry(entry);
  const operationId = operation === "upsert"
    ? "upsert"
    : `${operation}-${new Date(now).getTime() || Date.now()}`;

  return {
    id: `manual-trade-${sanitized.id}-${operationId}`,
    symbol: sanitized.symbol,
    title: titleFor(operation, sanitized),
    result: resultFor(operation, sanitized),
    note: sanitized.note,
    rankDelta: 0,
    createdAt: now,
    action: "manual_trade",
    reviewStatus: reviewStatusFor(operation, sanitized),
    direction: sanitized.side,
    riskReward: undefined,
    source: "manual_trade_journal",
    sourceId: sanitized.id,
    allowedUse: "research_only",
    canAutoAdjustWeights: false,
    manualTradeJournal: {
      operation,
      entry: sanitized,
      savedAt: now,
      storagePolicy: {
        imagesPersisted: sanitized.images.length,
        maxImageChars,
        maxImages,
      },
    },
  };
}

function sortableTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function reconstructManualTradeJournal(events: JournalEvent[]): ManualTradeJournalEntry[] {
  const byId = new Map<string, ManualTradeJournalEntry>();

  for (const event of [...events].sort((left, right) => sortableTime(left.createdAt) - sortableTime(right.createdAt))) {
    if (event.action !== "manual_trade" || event.source !== "manual_trade_journal") {
      continue;
    }

    const payload = event.manualTradeJournal;

    if (!payload) {
      continue;
    }

    const entry = sanitizeManualTradeJournalEntry(payload.entry);

    if (payload.operation === "remove") {
      byId.delete(entry.id);
      continue;
    }

    byId.set(entry.id, entry);
  }

  return [...byId.values()].sort((left, right) => right.createdAt - left.createdAt);
}
