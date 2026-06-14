import { NextResponse, type NextRequest } from "next/server";
import { getDailyMoverReadArchive } from "@/lib/api/daily-mover-readonly";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await getDailyMoverReadArchive({
    id: request.nextUrl.searchParams.get("id"),
    limit: request.nextUrl.searchParams.get("limit"),
    repository: appPersistenceRepository,
  });
  const snapshotId = result.body.selectedSnapshot?.id
    ?? result.body.latestSnapshot?.id
    ?? "none";

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "s-maxage=300, stale-while-revalidate=1800",
      "x-chuan-allowed-use": result.body.allowedUse,
      "x-chuan-daily-movers-snapshot": snapshotId,
      "x-chuan-daily-movers-storage": result.body.retention.storage,
    },
  });
}
