import { NextResponse, type NextRequest } from "next/server";
import type {
  ManualTradeJournalEntry,
  ManualTradeJournalOperation,
} from "@/lib/analysis/types";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { resource } from "@/lib/data-status";
import {
  buildManualTradeJournalEvent,
  reconstructManualTradeJournal,
} from "@/lib/journal/manual-trade-journal";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const journalRepository = appPersistenceRepository;
const journalRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_JOURNAL_CONTRACT_RATE_LIMIT ?? 60),
  windowMs: 60_000,
});
const operations: ManualTradeJournalOperation[] = ["upsert", "close", "reopen", "remove"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOperation(value: unknown): value is ManualTradeJournalOperation {
  return typeof value === "string" && operations.includes(value as ManualTradeJournalOperation);
}

function isTradeEntry(value: unknown): value is ManualTradeJournalEntry {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string" &&
    typeof value.symbol === "string" &&
    (value.side === "long" || value.side === "short") &&
    typeof value.leverage === "number" &&
    typeof value.margin === "number" &&
    typeof value.entry === "number" &&
    typeof value.stop === "number" &&
    typeof value.target === "number" &&
    (value.status === "持仓中" || value.status === "已平仓") &&
    typeof value.note === "string" &&
    Array.isArray(value.images) &&
    typeof value.createdAt === "number";
}

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

async function buildJournalResource() {
  const events = await journalRepository.listJournalEvents(1_000);
  const data = reconstructManualTradeJournal(events);
  const updatedAt = data[0]?.closedAt ?? data[0]?.createdAt;

  return resource(
    data,
    data.length > 0 ? "live" : "empty",
    {
      source: `${journalRepository.mode}:manual_trade_journal`,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : undefined,
      reason: data.length > 0 ? undefined : "还没有手动交易日记。",
    },
  );
}

export async function GET() {
  const journal = await buildJournalResource();

  return NextResponse.json(
    { ok: true, journal },
    {
      headers: {
        "x-chuan-contract": "frontend-journal-contract.v1",
        "x-chuan-data-status": journal.status,
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const limit = journalRateLimiter.consume(`frontend-journal:${clientKey(request)}`);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        resetAt: limit.resetAt,
      },
      {
        status: 429,
        headers: rateLimitHeaders(limit),
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const operation = isRecord(body) ? body.operation : undefined;
  const entry = isRecord(body) ? body.entry : undefined;

  if (!isOperation(operation) || !isTradeEntry(entry)) {
    return NextResponse.json({ ok: false, error: "invalid_journal_request" }, { status: 400 });
  }

  const event = buildManualTradeJournalEvent({
    entry,
    operation,
  });

  await journalRepository.addJournalEvent(event);

  const journal = await buildJournalResource();

  return NextResponse.json(
    {
      ok: true,
      entry: event,
      journal,
    },
    {
      headers: {
        ...rateLimitHeaders(limit),
        "x-chuan-contract": "frontend-journal-contract.v1",
        "x-chuan-data-status": journal.status,
      },
    },
  );
}
