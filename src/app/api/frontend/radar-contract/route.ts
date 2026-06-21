import { NextResponse, type NextRequest } from "next/server";
import { buildBackendContract } from "@/lib/api/backend-contract";
import { buildFrontendRadarContract } from "@/lib/api/frontend-contract";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const frontendRadarRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_RADAR_CONTRACT_RATE_LIMIT ?? 120),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = frontendRadarRateLimiter.consume(`frontend-radar:${clientKey(request)}`);

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

  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "page_ssr",
  });
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });
  const backend = buildBackendContract({ health, snapshot });
  const contract = buildFrontendRadarContract({
    backend,
    snapshot,
    env: {
      COINGLASS_DAILY_REQUEST_BUDGET: process.env.COINGLASS_DAILY_REQUEST_BUDGET,
      COINGLASS_REQUEST_INTERVAL_MS: process.env.COINGLASS_REQUEST_INTERVAL_MS,
    },
  });

  return NextResponse.json({
    ok: true,
    contract,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
      "x-chuan-contract": "frontend-radar-contract.v1",
      "x-chuan-data-status": snapshot.metadata.status,
      "x-chuan-health-level": health.level,
    },
  });
}
