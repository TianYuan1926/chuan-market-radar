# Frontend Backend Field Map

> Status: phase 0/1 execution baseline.
> Updated: 2026-06-22.
> Goal: make every frontend data surface traceable to backend facts before any refinement work.

## Hard Boundary

The current v0 frontend UI is the visual source of truth. This stage must not
rewrite layout, animation, color, typography, pet visuals, or page composition.
Only data contracts, mappers, backend sources, and honest empty states may change.

All active pages must receive market facts from one of these paths:

- `src/lib/frontend-contract-server.ts`
- `GET /api/frontend/radar-contract`
- `GET /api/frontend/leaderboard?kind=...`
- `GET /api/frontend/token-dossier?symbol=...`
- `GET /api/frontend/review-contract`
- `GET /api/frontend/journal-contract`

Mock files may remain as legacy UI type helpers or isolated preview helpers, but
active market pages must not use them as fact sources.

## Page Contract Map

| Page | Main frontend surfaces | Current backend source | Status | Missing / next work |
| --- | --- | --- | --- | --- |
| `/` | intro stats, radar display, ticker/session display | `getRadarContractForPage()` + `getLeaderboardContractForPage('volume')` | connected | intro copy is static; acceptable because it is product explanation, not market fact |
| `/dashboard` | scan proof, overview cards, current candidates, risk reminders, backend radar control | `RadarContract` + volume leaderboard | connected | risk reminders are derived from signal cards; exact backend alert stream is not wired yet |
| `/signals` | sniper board, maturity pool, anomaly table, live feed, heatmap | `RadarContract.radarSignals` + leaderboard candidate display | connected with candidate fallback | live feed is deterministic display of backend-derived cards, not real push; SSE/WebSocket not wired |
| `/leaderboard` | seven market leaderboards, price ticker, table | `getAllLeaderboardContractsForPage()` | connected | market cap is unknown and must show `待补齐`; no fake cap allowed |
| `/market` | macro environment, derivatives, data quality, market tokens | `RadarContract.macroAltEnv`, `derivatives`, `dataSources`, `apiUsage`, leaderboards | connected/partial | real data-source latency and taker flow are not wired |
| `/token/[id]` | token facts, dossier, signal archive, K-line panel, flow panel | radar signals + leaderboards + token dossier + `getKlineContractForPage()` | connected/partial | exact v3 trade plan and real OHLCV are wired when present; fund-flow panel is still an honest waiting state |
| `/review` | lifecycle, archetypes, missed detections, evolution suggestions, manual journal drawer | `ReviewContract` from journal events and business capability + `/api/frontend/journal-contract` | connected/partial | quality depends on real outcome samples; manual trade entries are API-backed with local fallback |
| `/system` | service nodes, pipeline state, API usage | `RadarContract.serviceNodes`, `dataPipeline`, `apiUsage` | connected/partial | Redis probe, worker heartbeat, real API daily counter, and latency probe need backend fields |
| `/login` | local gate UI | placeholder UI state | not market data | real server session/auth is not wired |

## Radar Contract Field Map

| Frontend field | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| `scanProof.totalMonitored` | `backend.scanProof.fullMarket.totalAssets` | connected | shows full market scale |
| `scanProof.scannable` | `backend.scanProof.fullMarket.eligibleAssets` | connected | USDT perpetual eligible count |
| `scanProof.lightScanned` | `backend.scanProof.lightScan.acceptedCount` | connected | public light scan accepted assets |
| `scanProof.deepScanned` | `backend.scanProof.deepScan.cleanRows` or selected assets | connected | CoinGlass deep scan clean rows / allocation |
| `scanProof.awaitingDeepScan` | `backend.scanProof.fullMarket.pendingAssets` | connected | pending rotation count |
| `scanProof.coverage` | `backend.scanProof.fullMarket.coveragePercent` | connected | coverage proof for "is it really scanning" |
| `scanProof.lastScanAt` | `snapshot.metadata.generatedAt` | connected | formatted for UI |
| `scanProof.nextScanCountdownSec` | `snapshot.metadata.nextScanAt` | connected | UI countdown only; not a market fact |
| `deepScanQueue.currentBatch` | `backend.scanProof.allocation.selectedAssets` | connected | current selected deep scan symbols |
| `deepScanQueue.nextBatch` | `backend.scanProof.allocation.nextBatchAssets` | connected | next rotation plan |
| `deepScanQueue.highPriority` | stage two queue or pending priority assets | connected | shows dynamic priority |
| `deepScanQueue.coldExploration` | `backend.scanProof.allocation.coldExplorationAssets` | connected | prevents only large caps being visible |
| `capabilityStages` | `backend.analysis.businessCapability.stages` | connected | describes readiness, not proof of live profitability |
| `dataSources` | `backend.sourceAudit` public discovery + CoinGlass audit | partial | feed state connected; `latencyMs` still placeholder `0` |
| `apiUsage.usedToday` | planned request count | partial | not real daily cumulative counter yet |
| `apiUsage.remainingToday` | env daily budget minus planned requests | partial | needs Redis/Postgres token counter |
| `apiUsage.perMinuteLimit` | configured CoinGlass Hobbyist limit | connected | currently 30/min |
| `apiUsage.pacingMs` | `COINGLASS_REQUEST_INTERVAL_MS` | connected | protects rate limit |
| `dataPipeline` | snapshot metadata + repository mode | connected | health-level view |
| `petBackendStatus` | derived from system, scan, signal, review state | partial | pet remains UI behavior; no market decision authority |
| `radarSignals` | `snapshot.signals` through signal mapper | connected | source of maturity pool and trade-ready sniper board |
| `macroAltEnv` | `backend.sourceAudit.macroMarket` | connected/partial | BTC.D/TOTAL2/TOTAL3 only if backend snapshot has them |
| `derivatives` | `snapshot.derivatives` aggregate | partial | OI/funding/long-short connected; `takerBuySell` placeholder `0` |
| `serviceNodes` | health, source audit, repository mode, allocation state | partial | Redis and worker heartbeats need real probes |

## Leaderboard Contract Field Map

| Kind | Backend source | Current status | Meaning |
| --- | --- | --- | --- |
| `gainers` | `snapshot.tickers` + light scan candidates | connected | price movement ranking, not trade signal |
| `losers` | `snapshot.tickers` + light scan candidates | connected | downside movement ranking, not trade signal |
| `volume` | ticker volume / light scan volume | connected | liquidity and attention proxy |
| `volatility_squeeze` | light scan volatility percentile | connected/partial | ranking only; must not imply direction alone |
| `relative_strength` | light scan score + 24h change | connected/partial | ranking only |
| `oi_change` | derivatives open interest change | connected/partial | only available for symbols with derivative rows |
| `funding_hot` | derivatives funding rate | connected/partial | crowding/risk view, not direction |

Leaderboard rows may be converted into candidate display rows. They must remain
`LIGHT_SCAN_MARK` or `DEEP_SCAN_CANDIDATE` unless a backend signal exists. They
must never become `TRADE_PLAN_READY` by frontend calculation.

## Token Dossier Field Map

| Frontend field | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| `symbol` | requested symbol / dossier symbol | connected | normalized display symbol |
| `direction` | `signal.direction` | connected | neutral if no signal |
| `maturity` | signal blockers and maturity | connected/partial | blocked if risk/timeframe gate blocks |
| `structures` | `strategyV3.keyLevels` and available timeframes | partial | real key levels if present; missing OHLCV shows waiting state |
| `evidence` | supportive `EvidencePoint[]` | connected | traceable to backend evidence ledger |
| `counter` | conflicting/blocking `EvidencePoint[]` | connected | used for AI/review context |
| `riskGate` | risk/timeframe/blocker summary | connected | controls whether plan can show |
| `tradePlan` | `strategyV3.tradePlan` | connected/partial | eligible v3 plans map to entry/stop/TP/RR; missing or blocked plans render no trade plan |
| `aiReview` | rule-based review boundary text and counter findings | partial | real model review not wired yet |
| K-line panel | `/api/frontend/kline-contract` + `buildFrontendKlineContract()` from public OHLCV/cache | connected | maps backend candles to front chart candles; no generated candles |
| fund flow panel | none currently | not connected | must wire real flow/source or honest waiting state |

## Review Contract Field Map

| Frontend field | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| `signalLifecycles` | journal events with outcome metrics | connected/partial | only real samples; empty if no samples |
| `strategyArchetypes` | business capability stages | connected/partial | describes capability buckets, not true win rate until enough outcomes |
| `missedDetections` | selected journal review events | partial | needs more outcome samples and missed-opportunity ingestion |
| `evolutionSuggestions` | business capability next actions/gaps | connected/partial | suggestions are read-only; must not auto-change live weights |

## Manual Journal Contract Field Map

| Frontend field | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| `TradeJournal[]` | `/api/frontend/journal-contract` reconstructed from `journal_events` | connected | browser localStorage is fallback only |
| `addJournalEntry()` | POST `/api/frontend/journal-contract` with `operation=upsert` | connected | writes `manual_trade` journal event |
| `closeTrade()` | POST `/api/frontend/journal-contract` with `operation=close` | connected | append-only event; does not delete history |
| `reopenTrade()` | POST `/api/frontend/journal-contract` with `operation=reopen` | connected | append-only event; latest state is reconstructed |
| `removeJournalEntry()` | POST `/api/frontend/journal-contract` with `operation=remove` | connected | tombstone event hides the row without physical DB deletion |
| screenshots | `manualTradeJournal.entry.images` with server caps | partial | oversized images are dropped before persistence to avoid DB bloat |
| rank / strategy weights | `rankDelta=0`, `allowedUse=research_only`, `canAutoAdjustWeights=false` | connected | manual trades never auto-mutate live strategy weights |

## System Data Gaps

These are the current high-priority backend gaps for complete frontend wiring:

1. Redis health probe and worker heartbeat probe exposed in `RadarContract.serviceNodes`.
2. Real API daily usage counter instead of planned-request approximation.
3. Real data-source latency probes instead of `0`.
4. SSE/WebSocket frontend event stream for scan progress and signal state changes.
5. Real AI review adapter for high-value signals only, never all-market review.
6. Pet/easter egg progress persistence if user wants cross-device state.
7. Login/auth session if the site should become private.

## Next Build Order

1. System probes: Redis, worker heartbeat, API counter, source latency.
2. SSE/WebSocket: push scan progress and signal changes to the UI.
3. AI review adapter: env-only key, high-value signal review only, results tied to evidence IDs.
4. Pet/easter-egg persistence: optional cross-device UI state after market data is complete.
5. Login/auth: only after data contracts are stable.

Do not start refinement or visual polish until these data connections are either
connected or explicitly represented as honest partial/empty states.
