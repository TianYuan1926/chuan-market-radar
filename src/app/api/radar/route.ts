import { NextResponse, type NextRequest } from "next/server";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const radarRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.RADAR_API_RATE_LIMIT ?? 90),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = radarRateLimiter.consume(`radar:${clientKey(request)}`);

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

  const snapshot = await getMarketRadarSnapshot(undefined, { trigger: "radar_get" });
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });

  return NextResponse.json({
    ok: true,
    health,
    snapshot,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-data-status": snapshot.metadata.status,
      "x-chuan-health-level": health.level,
    },
  });
}
