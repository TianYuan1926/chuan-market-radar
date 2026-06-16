import { NextResponse, type NextRequest } from "next/server";
import { runAdminOutcomeExecutor } from "@/lib/journal/outcome-executor-admin";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminOutcomeExecutor({
    authorization: request.headers.get("authorization"),
    env: process.env,
    repository: appPersistenceRepository,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-outcome-executor": result.body.ok ? "processed" : "blocked",
    },
  });
}
