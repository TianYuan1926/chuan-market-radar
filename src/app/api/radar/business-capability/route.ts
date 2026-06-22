import { NextResponse, type NextRequest } from "next/server";
import { buildBusinessCapabilityReport } from "@/lib/api/business-capability";
import { MemoryRateLimiter, rateLimitHeaders } from "@/lib/api/rate-limit";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";
import { readConfiguredRuntimeProbeReport } from "@/lib/runtime/worker-heartbeat";

export const dynamic = "force-dynamic";

const businessCapabilityRateLimiter = new MemoryRateLimiter({
  limit: Number(process.env.RADAR_BUSINESS_CAPABILITY_API_RATE_LIMIT ?? 90),
  windowMs: 60_000,
});

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
}

export async function GET(request: NextRequest) {
  const limit = businessCapabilityRateLimiter.consume(`radar-business-capability:${clientKey(request)}`);

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

  const snapshot = await getReadableMarketRadarSnapshot(undefined, { trigger: "radar_get" });
  const runtimeProbes = await readConfiguredRuntimeProbeReport(process.env);
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    runtimeProbes,
    snapshot,
  });
  const businessCapability = buildBusinessCapabilityReport({
    health,
    snapshot,
  });

  return NextResponse.json({
    ok: true,
    businessCapability,
  }, {
    headers: {
      ...rateLimitHeaders(limit),
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-business-capability": businessCapability.schemaVersion,
      "x-chuan-business-status": businessCapability.status,
    },
  });
}
