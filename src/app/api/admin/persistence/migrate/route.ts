import { NextResponse, type NextRequest } from "next/server";
import { runAdminPersistenceMigration } from "@/lib/persistence/database-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await runAdminPersistenceMigration({
    authorization: request.headers.get("authorization"),
    env: process.env,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
    },
  });
}
