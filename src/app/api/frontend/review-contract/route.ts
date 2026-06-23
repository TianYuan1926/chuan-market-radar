import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { dataStatusToHealthLevel, getReviewContractForPage } from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

const frontendReviewRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_REVIEW_CONTRACT_RATE_LIMIT ?? 120),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = frontendReviewRateLimiter.consume(`frontend-review:${clientKey(request)}`);

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

  const contract = await getReviewContractForPage();

  return NextResponse.json({
    ok: true,
    contract,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=60, stale-while-revalidate=300",
      "x-chuan-contract": "frontend-review-contract.v1",
      "x-chuan-data-status": contract.reviewStats.status,
      "x-chuan-health-level": dataStatusToHealthLevel(contract.reviewStats.status),
    },
  });
}
