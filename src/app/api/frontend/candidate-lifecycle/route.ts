import { NextResponse, type NextRequest } from "next/server";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getCandidateCanonicalReadServer } from "@/lib/candidate-episode/canonical-read-server";

export const dynamic = "force-dynamic";

const candidateLifecycleRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.FRONTEND_CANDIDATE_LIFECYCLE_RATE_LIMIT ?? 120),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

export async function GET(request: NextRequest) {
  const limit = candidateLifecycleRateLimiter.consume(`candidate-lifecycle:${clientKey(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", resetAt: limit.resetAt },
      { status: 429, headers: { ...rateLimitHeaders(limit), "cache-control": "no-store" } },
    );
  }

  const response = await getCandidateCanonicalReadServer().execute(request.nextUrl.searchParams);
  return NextResponse.json(response.body, {
    status: response.statusCode,
    headers: {
      ...response.headers,
      ...rateLimitHeaders(limit),
    },
  });
}
