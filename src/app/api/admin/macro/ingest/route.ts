import { NextResponse, type NextRequest } from "next/server";
import { runAdminMacroMarketIngest } from "@/lib/market/macro-ingest";
import { appPersistenceRepository } from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminMacroMarketIngest({
    authorization: request.headers.get("authorization"),
    env: process.env,
    repository: appPersistenceRepository,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-macro-ingest": result.body.ok
        ? result.body.macro.mode === "cached" ? "cached" : "stored"
        : "blocked",
    },
  });
}
