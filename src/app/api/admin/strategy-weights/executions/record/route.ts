import { NextResponse, type NextRequest } from "next/server";
import { runAdminStrategyWeightChangeExecutionRecord } from "@/lib/journal/strategy-weight-change-execution-admin";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const result = await runAdminStrategyWeightChangeExecutionRecord({
    authorization: request.headers.get("authorization"),
    body,
    env: process.env,
    repository: appPersistenceRepository,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-strategy-weight-execution": result.body.ok ? "recorded" : "blocked",
    },
  });
}
