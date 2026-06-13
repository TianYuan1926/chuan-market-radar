import { NextResponse, type NextRequest } from "next/server";
import { getScanArchive } from "@/lib/market/radar-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const replayId = request.nextUrl.searchParams.get("id") ?? undefined;
  const archive = await getScanArchive(replayId);

  return NextResponse.json({
    ok: true,
    archive,
  }, {
    headers: {
      "cache-control": "s-maxage=30, stale-while-revalidate=180",
      "x-chuan-archive-storage": archive.retention.storage,
    },
  });
}
