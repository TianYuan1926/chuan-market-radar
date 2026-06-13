import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeDeploymentReadinessRequest,
  runAdminDeploymentReadiness,
} from "@/lib/api/deployment-readiness";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const authorizationFailure = authorizeDeploymentReadinessRequest({
    authorization,
    env: process.env,
  });

  if (authorizationFailure) {
    return NextResponse.json(authorizationFailure.body, {
      status: authorizationFailure.status,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  const snapshot = await getMarketRadarSnapshot();
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });
  const result = await runAdminDeploymentReadiness({
    authorization,
    env: process.env,
    health,
  });
  const readiness = result.body.ok ? result.body.report.status : "blocked";

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-chuan-readiness": readiness,
    },
  });
}
