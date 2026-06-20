import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import { buildSignalBackendDossier } from "@/lib/market/signal-backend-dossier";

export const dynamic = "force-dynamic";

const dossierRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.RADAR_DOSSIER_API_RATE_LIMIT ?? 120),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = dossierRateLimiter.consume(`radar-dossier:${clientKey(request)}`);

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
        detail: "Use /api/radar/dossier?symbol=ARBUSDT or /api/radar/dossier?symbol=ARB.",
      },
      {
        status: 400,
        headers: rateLimitHeaders(limit),
      },
    );
  }

  const snapshot = await getReadableMarketRadarSnapshot(undefined, { trigger: "radar_get" });
  const dossier = buildSignalBackendDossier({
    snapshot,
    symbol,
  });

  return NextResponse.json({
    ok: true,
    dossier,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-data-status": snapshot.metadata.status,
      "x-chuan-dossier-found": String(dossier.found),
    },
  });
}
