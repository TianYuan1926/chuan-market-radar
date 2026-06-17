import { NextResponse, type NextRequest } from "next/server";
import { runAdminForwardMapReviewExecutor } from "@/lib/analysis/v3/forward-map-review-admin";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminForwardMapReviewExecutor({
    authorization: request.headers.get("authorization"),
    env: process.env,
    repository: appPersistenceRepository,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-v3-forward-map-review": result.body.ok ? "processed" : "blocked",
    },
  });
}
