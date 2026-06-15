import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import type { JournalAction, JournalEvent, SignalJournalAction } from "@/lib/analysis/types";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  buildJournalEntryFromDailyMoverCalibration,
  buildJournalEntryFromSignal,
  type DailyMoverCalibrationJournalInput,
} from "@/lib/journal/journal-entry";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const journalRepository = appPersistenceRepository;
const signalJournalActions: SignalJournalAction[] = ["track", "paper_trade", "skip", "invalidate"];
const journalActions: JournalAction[] = [...signalJournalActions, "calibration_review"];
const journalRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.JOURNAL_API_RATE_LIMIT ?? 30),
  windowMs: 60_000,
});

function isJournalAction(value: unknown): value is JournalAction {
  return typeof value === "string" && journalActions.includes(value as JournalAction);
}

function isSignalJournalAction(value: unknown): value is SignalJournalAction {
  return typeof value === "string" && signalJournalActions.includes(value as SignalJournalAction);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

function isDailyMoverCalibrationInput(value: unknown): value is DailyMoverCalibrationJournalInput {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.guardrail === "string" &&
    typeof value.label === "string" &&
    typeof value.observedAt === "string" &&
    typeof value.recommendation === "string" &&
    typeof value.snapshotId === "string" &&
    typeof value.tag === "string" &&
    typeof value.sampleCount === "number" &&
    Number.isFinite(value.sampleCount) &&
    value.sampleCount > 0 &&
    isStringArray(value.symbols);
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

async function persistJournalEntry(entry: JournalEvent, limit: ReturnType<MemoryRateLimiter["consume"]>) {
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

  const signalId = isRecord(body) && "signalId" in body
    ? body.signalId
    : undefined;
  const action = isRecord(body) && "action" in body
    ? body.action
    : undefined;

  if (!isJournalAction(action)) {
    return NextResponse.json({ ok: false, error: "invalid_journal_request" }, { status: 400 });
  }

  if (action === "calibration_review") {
    const calibration = isRecord(body) && "calibration" in body ? body.calibration : undefined;

    if (!isDailyMoverCalibrationInput(calibration)) {
      return NextResponse.json({ ok: false, error: "invalid_journal_request" }, { status: 400 });
    }

    const entry = buildJournalEntryFromDailyMoverCalibration(calibration);

    return persistJournalEntry(entry, limit);
  }

  if (typeof signalId !== "string" || !isSignalJournalAction(action)) {
    return NextResponse.json({ ok: false, error: "invalid_journal_request" }, { status: 400 });
  }

  const snapshot = await getMarketRadarSnapshot();
  const signal = snapshot.signals.find((item) => item.id === signalId);

  if (!signal) {
    return NextResponse.json({ ok: false, error: "signal_not_found" }, { status: 404 });
  }

  const entry = buildJournalEntryFromSignal(signal, action);

  return persistJournalEntry(entry, limit);
}
