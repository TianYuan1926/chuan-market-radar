import { NextResponse, type NextRequest } from "next/server";
import { runAdminCoinGlassCapabilityProbe } from "@/lib/market/providers/coinglass-capability-probe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminCoinGlassCapabilityProbe({
    authorization: request.headers.get("authorization"),
    env: process.env,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-coinglass-capability": result.body.capability?.deepScanStatus ?? "blocked",
    },
  });
}
