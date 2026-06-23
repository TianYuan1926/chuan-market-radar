import { NextResponse, type NextRequest } from "next/server";
import { buildBackendContract } from "@/lib/api/backend-contract";
import {
  buildFrontendLeaderboardContract,
  type LeaderboardKind,
} from "@/lib/api/frontend-contract";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { createCompositePublicLightScanProvider } from "@/lib/market/providers/public-light-scan";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";
import { readConfiguredRuntimeProbeReport } from "@/lib/runtime/worker-heartbeat";

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

  const snapshot = await getReadableMarketRadarSnapshot(undefined, {
    allowRefresh: false,
    trigger: "page_ssr",
  });
  const runtimeProbes = await readConfiguredRuntimeProbeReport(process.env);
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    runtimeProbes,
    snapshot,
  });
  const backend = buildBackendContract({ health, snapshot });
  const kind = parseKind(request);
  const publicProvider = createCompositePublicLightScanProvider({
    maxPriorityCandidates: Number(process.env.FRONTEND_PUBLIC_MARKET_MAX_CANDIDATES ?? 120),
  });
  const publicResult = await publicProvider.scan();
  const leaderboard = buildFrontendLeaderboardContract({
    backend,
    kind,
    publicMarket: publicResult.tickers.length > 0
      ? {
        diagnostics: publicResult.diagnostics,
        tickers: publicResult.tickers,
      }
      : undefined,
    snapshot,
  });

  return NextResponse.json({
    ok: true,
    kind,
    leaderboard,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-contract": "frontend-leaderboard.v1",
      "x-chuan-data-status": snapshot.metadata.status,
    },
  });
}
