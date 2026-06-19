import { RadarWorkspace } from "@/components/radar/radar-workspace";
import { getDailyMoverReadArchive } from "@/lib/api/daily-mover-readonly";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [snapshot, dailyMoverArchive] = await Promise.all([
    getMarketRadarSnapshot(undefined, { trigger: "page_ssr" }),
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

  return (
    <RadarWorkspace
      dailyMoverArchive={dailyMoverArchive.body}
      health={health}
      snapshot={snapshot}
    />
  );
}
