import { NextResponse, type NextRequest } from "next/server";
import { runAdminCandidateShadowCapture } from "@/lib/candidate-episode/shadow-capture-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminCandidateShadowCapture({
    authorization: request.headers.get("authorization"),
    env: process.env,
    signal: request.signal,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-candidate-shadow": result.body.ok ? result.body.mode : "blocked",
    },
  });
}
