import { NextResponse } from "next/server";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getReadableMarketRadarSnapshot(undefined, { trigger: "health_get" });
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });

  return NextResponse.json({
    ok: true,
    health,
  }, {
    headers: {
      "cache-control": "s-maxage=30, stale-while-revalidate=120",
      "x-chuan-health-level": health.level,
      "x-chuan-persistence": health.persistence.mode,
    },
  });
}
