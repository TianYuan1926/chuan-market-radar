import { ChuanScanWorkspace } from "@/components/radar/chuan-scan-workspace";
import { buildBackendContract } from "@/lib/api/backend-contract";
import { getDailyMoverReadArchive } from "@/lib/api/daily-mover-readonly";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getReadableMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [snapshot, dailyMoverArchive] = await Promise.all([
    getReadableMarketRadarSnapshot(undefined, { trigger: "page_ssr" }),
    getDailyMoverReadArchive({
      limit: 7,
      repository: appPersistenceRepository,
    }),
  ]);
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });
  const backendContract = buildBackendContract({
    health,
    snapshot,
  });

  return (
    <ChuanScanWorkspace
      backendContract={backendContract}
      dailyMoverArchive={dailyMoverArchive.body}
      health={health}
      snapshot={snapshot}
    />
  );
}
