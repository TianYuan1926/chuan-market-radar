import { NextResponse, type NextRequest } from "next/server";
import type { LeaderboardKind } from "@/lib/api/frontend-contract";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getLeaderboardContractForPage } from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

const kinds: LeaderboardKind[] = [
  "gainers",
  "losers",
  "volume",
  "volatility_squeeze",
  "relative_strength",
  "oi_change",
  "funding_hot",
];

const frontendLeaderboardRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_LEADERBOARD_RATE_LIMIT ?? 180),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function parseKind(request: NextRequest): LeaderboardKind {
  const raw = request.nextUrl.searchParams.get("kind");
  return kinds.includes(raw as LeaderboardKind) ? raw as LeaderboardKind : "gainers";
}

export async function GET(request: NextRequest) {
  const limit = frontendLeaderboardRateLimiter.consume(`frontend-leaderboard:${clientKey(request)}`);

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

  const kind = parseKind(request);
  const leaderboard = await getLeaderboardContractForPage(kind);

  return NextResponse.json({
    ok: true,
    kind,
    leaderboard,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-contract": "frontend-leaderboard.v1",
      "x-chuan-data-status": leaderboard.status,
    },
  });
}
