import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import {
  boundedFrontendLiveEventLimit,
  buildFrontendLiveEvents,
} from "@/lib/market/live-events";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";
import { readConfiguredRuntimeProbeReport } from "@/lib/runtime/worker-heartbeat";

export const dynamic = "force-dynamic";

const liveEventsRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_LIVE_EVENTS_RATE_LIMIT ?? 180),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = liveEventsRateLimiter.consume(`frontend-live-events:${clientKey(request)}`);

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

  const runtimeProbes = await readConfiguredRuntimeProbeReport(process.env);
  const contract = await buildFrontendLiveEvents({
    limit: boundedFrontendLiveEventLimit(request.nextUrl.searchParams.get("limit")),
    repository: appPersistenceRepository,
    runtimeProbes,
  });

  return NextResponse.json(contract, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=5, stale-while-revalidate=15",
      "x-chuan-contract": "frontend-live-events.v1",
      "x-chuan-triggered-scan": "false",
    },
  });
}
