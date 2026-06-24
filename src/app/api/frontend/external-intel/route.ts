import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { buildExternalIntelContract } from "@/lib/external-intel/intel-contract";
import { dataStatusToHealthLevel } from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

const externalIntelRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_EXTERNAL_INTEL_RATE_LIMIT ?? 60),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
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

  const contract = buildExternalIntelContract();

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
