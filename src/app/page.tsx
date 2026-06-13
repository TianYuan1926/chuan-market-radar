import { RadarWorkspace } from "@/components/radar/radar-workspace";
import { buildSystemHealthReport } from "@/lib/api/system-health";
import { getMarketRadarSnapshot } from "@/lib/market/radar-snapshot";
import {
  appPersistenceDiagnostics,
  appPersistenceRepository,
} from "@/lib/persistence/app-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getMarketRadarSnapshot();
  const health = await buildSystemHealthReport({
    database: appPersistenceDiagnostics,
    env: process.env,
    repository: appPersistenceRepository,
    snapshot,
  });

  return <RadarWorkspace health={health} snapshot={snapshot} />;
}
