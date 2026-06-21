import { MarketPageClient } from "./market-page-client";
import { getRadarContractForPage } from "@/lib/frontend-contract-server";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const radar = await getRadarContractForPage();

  return <MarketPageClient radar={radar} />;
}
