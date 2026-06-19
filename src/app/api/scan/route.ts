import { NextResponse, type NextRequest } from "next/server";
import { isCronRequestAuthorized } from "@/lib/api/cron-auth";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import {
  getMarketRadarSnapshot,
  refreshMarketRadarSnapshot,
} from "@/lib/market/radar-snapshot";

export const dynamic = "force-dynamic";

const scanRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.SCAN_API_RATE_LIMIT ?? 60),
  windowMs: 60_000,
});

function isAuthorized(request: NextRequest) {
  return isCronRequestAuthorized(request.headers.get("authorization"), process.env);
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

function snapshotResponse(snapshot: Awaited<ReturnType<typeof getMarketRadarSnapshot>>) {
  return {
    ok: true,
    metadata: snapshot.metadata,
    instrumentPool: snapshot.instrumentPool.summary,
    signals: snapshot.signals.map((signal) => ({
      id: signal.id,
      symbol: signal.symbol,
      state: signal.state,
      confidence: signal.confidence,
      risk: signal.risk,
      strategyStatus: signal.strategy.status ?? "unknown",
      riskReward: signal.strategy.riskReward,
      updatedAt: signal.updatedAt,
    })),
  };
}

export async function GET(request: NextRequest) {
  const limit = scanRateLimiter.consume(`scan:${clientKey(request)}`);

  if (!limit.allowed) {
    return limitedResponse(limit);
  }

  const snapshot = await getMarketRadarSnapshot(undefined, { trigger: "scan_get" });

  return NextResponse.json(snapshotResponse(snapshot), {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=60, stale-while-revalidate=300",
      "x-chuan-data-status": snapshot.metadata.status,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limit = scanRateLimiter.consume(`scan-refresh:${clientKey(request)}`);

  if (!limit.allowed) {
    return limitedResponse(limit);
  }

  const result = await refreshMarketRadarSnapshot(undefined, { trigger: "cron_post" });

  if (!result.snapshot) {
    return NextResponse.json(
      { ok: false, status: result.status, error: result.error },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ...snapshotResponse(result.snapshot),
    status: result.status,
    error: result.error,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "no-store",
      "x-chuan-data-status": result.snapshot.metadata.status,
    },
  });
}
