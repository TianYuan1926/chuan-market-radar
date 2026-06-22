import { NextResponse, type NextRequest } from "next/server";
import { buildFrontendKlineContract } from "@/lib/api/frontend-contract";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import type { OhlcvInterval } from "@/lib/market/ohlcv/types";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

const frontendKlineRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_KLINE_CONTRACT_RATE_LIMIT ?? 180),
  windowMs: 60_000,
});

const supportedIntervals = new Set<OhlcvInterval>([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
]);

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function intervalParam(request: NextRequest): OhlcvInterval | null {
  const raw = request.nextUrl.searchParams.get("tf") ||
    request.nextUrl.searchParams.get("interval") ||
    "4h";
  const value = raw.trim() as OhlcvInterval;

  return supportedIntervals.has(value) ? value : null;
}

function limitParam(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get("limit") ?? 160);

  if (!Number.isFinite(value)) {
    return 160;
  }

  return Math.max(20, Math.min(300, Math.round(value)));
}

export async function GET(request: NextRequest) {
  const limit = frontendKlineRateLimiter.consume(`frontend-kline:${clientKey(request)}`);

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

  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();

  if (!symbol) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_symbol",
        detail: "Use /api/frontend/kline-contract?symbol=ARBUSDT&tf=4h.",
      },
      {
        status: 400,
        headers: rateLimitHeaders(limit),
      },
    );
  }

  const interval = intervalParam(request);

  if (!interval) {
    return NextResponse.json(
      {
        ok: false,
        error: "unsupported_interval",
        detail: "Supported intervals: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w.",
      },
      {
        status: 400,
        headers: rateLimitHeaders(limit),
      },
    );
  }

  const kline = await buildFrontendKlineContract({
    interval,
    limit: limitParam(request),
    repository: appPersistenceRepository,
    symbol,
  });

  return NextResponse.json({
    ok: true,
    kline,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
      "x-chuan-contract": "frontend-kline-contract.v1",
      "x-chuan-data-status": kline.status,
      "x-chuan-kline-source": kline.source ?? "unknown",
    },
  });
}
