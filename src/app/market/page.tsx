import { MarketPageClient } from "./market-page-client";
import {
  getLeaderboardContractForPage,
  getRadarContractForPage,
} from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const [radar, tickerLeaderboard] = await Promise.all([
    getRadarContractForPage(),
    getLeaderboardContractForPage("volume"),
  ]);

  return <MarketPageClient radar={radar} tickerRows={tickerLeaderboard.data} />;
}
