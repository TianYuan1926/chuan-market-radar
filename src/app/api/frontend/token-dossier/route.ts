import { NextResponse, type NextRequest } from "next/server";
import { buildFrontendTokenDossierContract } from "@/lib/api/frontend-contract";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { readPageBackend } from "@/lib/frontend-contract-server";
import { buildSignalBackendDossier } from "@/lib/market/signal-backend-dossier";

export const dynamic = "force-dynamic";

const frontendTokenRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_TOKEN_DOSSIER_RATE_LIMIT ?? 180),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function numericParam(request: NextRequest, name: string, fallback: number) {
  const raw = request.nextUrl.searchParams.get(name);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: NextRequest) {
  const limit = frontendTokenRateLimiter.consume(`frontend-token:${clientKey(request)}`);

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
        detail: "Use /api/frontend/token-dossier?symbol=ARBUSDT or /api/frontend/token-dossier?symbol=ARB.",
      },
      {
        status: 400,
        headers: rateLimitHeaders(limit),
      },
    );
  }

  const { backend, snapshot } = await readPageBackend();
  const backendDossier = buildSignalBackendDossier({
    lightScanCandidates: backend.scanProof.lightScan.topCandidates,
    snapshot,
    symbol,
  });
  const dossier = buildFrontendTokenDossierContract({
    basePrice: numericParam(request, "basePrice", 1),
    dossier: backendDossier,
  });

  return NextResponse.json({
    ok: true,
    dossier,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=15, stale-while-revalidate=60",
      "x-chuan-contract": "frontend-token-dossier.v1",
      "x-chuan-data-status": snapshot.metadata.status,
      "x-chuan-dossier-found": String(backendDossier.found),
    },
  });
}
