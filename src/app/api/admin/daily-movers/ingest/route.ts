import { NextResponse, type NextRequest } from "next/server";
import { runAdminDailyMoverIngest } from "@/lib/market/daily-mover-admin";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminDailyMoverIngest({
    authorization: request.headers.get("authorization"),
    env: process.env,
    repository: appPersistenceRepository,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-daily-mover-ingest": result.body.ok ? "stored" : "blocked",
    },
  });
}
