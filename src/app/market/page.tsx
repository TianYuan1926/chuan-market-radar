import { MarketPageClient } from './market-page-client'
import {
  getAllLeaderboardContractsForPage,
  getRadarContractForPage,
} from '@/lib/frontend-contract-server'
import {
  leaderboardRowsToTokens,
  mergeTokensBySymbol,
} from '@/lib/frontend-display-adapters'

export const dynamic = 'force-dynamic'

export default async function MarketPage() {
  const [radar, leaderboards] = await Promise.all([
    getRadarContractForPage(),
    getAllLeaderboardContractsForPage(),
  ])
  const tokens = mergeTokensBySymbol(
    leaderboardRowsToTokens(leaderboards.gainers?.data ?? [], 'gainers'),
    leaderboardRowsToTokens(leaderboards.losers?.data ?? [], 'losers'),
    leaderboardRowsToTokens(leaderboards.volume?.data ?? [], 'volume'),
    leaderboardRowsToTokens(leaderboards.relative_strength?.data ?? [], 'relative_strength'),
  )

  return <MarketPageClient radar={radar} tokens={tokens} />
}
