import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import type { JournalAction } from "@/lib/analysis/types";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { buildJournalEntryFromSignal } from "@/lib/journal/journal-entry";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const journalRepository = appPersistenceRepository;
const journalActions: JournalAction[] = ["track", "paper_trade", "skip", "invalidate"];
const journalRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.JOURNAL_API_RATE_LIMIT ?? 30),
  windowMs: 60_000,
});

function isJournalAction(value: unknown): value is JournalAction {
  return typeof value === "string" && journalActions.includes(value as JournalAction);
}

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function limitedResponse(result: ReturnType<MemoryRateLimiter["consume"]>) {
  return NextResponse.json(
    {
      ok: false,
      error: "rate_limited",
      resetAt: result.resetAt,
    },
    {
      status: 429,
      headers: rateLimitHeaders(result),
    },
  );
}

export async function GET() {
  const entries = await journalRepository.listJournalEvents();
  const rankProfile = await journalRepository.getRankProfile();

  return NextResponse.json({
    ok: true,
    entries,
    rankProfile,
  });
}

export async function POST(request: NextRequest) {
  const limit = journalRateLimiter.consume(`journal:${clientKey(request)}`);

  if (!limit.allowed) {
    return limitedResponse(limit);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const signalId = typeof body === "object" && body !== null && "signalId" in body
    ? body.signalId
    : undefined;
  const action = typeof body === "object" && body !== null && "action" in body
    ? body.action
    : undefined;

  if (typeof signalId !== "string" || !isJournalAction(action)) {
    return NextResponse.json({ ok: false, error: "invalid_journal_request" }, { status: 400 });
  }

  const snapshot = await getMarketRadarSnapshot();
  const signal = snapshot.signals.find((item) => item.id === signalId);

  if (!signal) {
    return NextResponse.json({ ok: false, error: "signal_not_found" }, { status: 404 });
  }

  const entry = buildJournalEntryFromSignal(signal, action);
  await journalRepository.addJournalEvent(entry);
  const entries = await journalRepository.listJournalEvents();
  const rankProfile = await journalRepository.getRankProfile();

  return NextResponse.json({
    ok: true,
    entry,
    entries,
    rankProfile,
  }, {
    headers: rateLimitHeaders(limit),
  });
}
