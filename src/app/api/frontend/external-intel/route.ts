import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { collectCoingeckoTrendingExternalIntel } from "@/lib/external-intel/coingecko-trending-collector";
import { collectDexScreenerExternalIntel } from "@/lib/external-intel/dex-screener-collector";
import { buildExternalIntelContract } from "@/lib/external-intel/intel-contract";
import { dataStatusToHealthLevel } from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

const externalIntelRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_EXTERNAL_INTEL_RATE_LIMIT ?? 60),
  windowMs: 60_000,
});

const externalIntelCache: {
  expiresAt: number;
  inFlight?: ReturnType<typeof loadExternalIntelContract>;
  value?: Awaited<ReturnType<typeof loadExternalIntelContract>>;
} = {
  expiresAt: 0,
};

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function loadExternalIntelContract() {
  const timeoutMs = boundedNumber(process.env.EXTERNAL_INTEL_FETCH_TIMEOUT_MS, 4_500, 1_000, 10_000);
  const [dexScreener, coingeckoTrending] = await Promise.all([
    collectDexScreenerExternalIntel({
      enabled: process.env.EXTERNAL_INTEL_DEXSCREENER_ENABLED !== "false",
      limit: boundedNumber(process.env.EXTERNAL_INTEL_DEXSCREENER_LIMIT, 12, 1, 25),
      timeoutMs,
    }),
    collectCoingeckoTrendingExternalIntel({
      enabled: process.env.EXTERNAL_INTEL_COINGECKO_TRENDING_ENABLED !== "false",
      limit: boundedNumber(process.env.EXTERNAL_INTEL_COINGECKO_TRENDING_LIMIT, 10, 1, 20),
      timeoutMs,
    }),
  ]);

  return buildExternalIntelContract({
    events: [
      ...dexScreener.events,
      ...coingeckoTrending.events,
    ],
    latestRuns: [
      ...dexScreener.latestRuns,
      ...coingeckoTrending.latestRuns,
    ],
  });
}

async function getCachedExternalIntelContract() {
  const ttlMs = boundedNumber(process.env.EXTERNAL_INTEL_CACHE_TTL_MS, 300_000, 30_000, 1_800_000);
  const now = Date.now();

  if (externalIntelCache.value && externalIntelCache.expiresAt > now) {
    return externalIntelCache.value;
  }

  if (externalIntelCache.inFlight) {
    return externalIntelCache.inFlight;
  }

  externalIntelCache.inFlight = loadExternalIntelContract()
    .then((contract) => {
      externalIntelCache.value = contract;
      externalIntelCache.expiresAt = Date.now() + ttlMs;
      return contract;
    })
    .finally(() => {
      externalIntelCache.inFlight = undefined;
    });

  return externalIntelCache.inFlight;
}

export async function GET(request: NextRequest) {
  const limit = externalIntelRateLimiter.consume(`frontend-external-intel:${clientKey(request)}`);

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

  const contract = await getCachedExternalIntelContract();

  return NextResponse.json({
    ok: true,
    contract,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=300, stale-while-revalidate=900",
      "x-chuan-contract": contract.data.schemaVersion,
      "x-chuan-data-status": contract.status,
      "x-chuan-health-level": dataStatusToHealthLevel(contract.status),
    },
  });
}
