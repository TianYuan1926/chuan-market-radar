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
- `GET /api/frontend/live-events`
- `GET /api/frontend/live-events/stream`
- `GET/POST /api/frontend/ui-state`
- `GET/POST/DELETE /api/auth/session`
- `POST /api/admin/runtime/heartbeat` protected worker heartbeat writer

Mock files may remain as legacy UI type helpers or isolated preview helpers, but
active market pages must not use them as fact sources.

## Page Contract Map

| Page | Main frontend surfaces | Current backend source | Status | Missing / next work |
| --- | --- | --- | --- | --- |
| `/` | intro stats, radar display, ticker/session display | `getRadarContractForPage()` + `getLeaderboardContractForPage('volume')` | connected | intro copy is static; acceptable because it is product explanation, not market fact |
| `/dashboard` | scan proof, overview cards, current candidates, risk reminders, backend radar control | `RadarContract` + volume leaderboard | connected | risk reminders are derived from signal cards; exact backend alert stream is not wired yet |
| `/signals` | sniper board, maturity pool, anomaly table, live feed, heatmap | `RadarContract.radarSignals` + leaderboard candidate display + `/api/frontend/live-events` or `/api/frontend/live-events/stream` | connected with candidate fallback | event feed is read-only archive/runtime data; SSE transport is available and must not trigger scans |
| `/leaderboard` | seven market leaderboards, price ticker, table | `getAllLeaderboardContractsForPage()` | connected | market cap is unknown and must show `待补齐`; no fake cap allowed |
| `/market` | macro environment, derivatives, data quality, market tokens | `RadarContract.macroAltEnv`, `derivatives`, `fundFlow`, `dataSources`, `apiUsage`, leaderboards | connected/partial | source latency is wired; taker/CVD/real fund-flow source is not wired and must show partial |
| `/token/[id]` | token facts, dossier, signal archive, K-line panel, flow panel | radar signals + leaderboards + token dossier + `getKlineContractForPage()` | connected/partial | exact v3 trade plan and real OHLCV are wired when present; fund-flow panel is still an honest waiting state |
| `/review` | lifecycle, archetypes, missed detections, evolution suggestions, manual journal drawer | `ReviewContract` from journal events and business capability + `/api/frontend/journal-contract` | connected/partial | quality depends on real outcome samples; manual trade entries are API-backed with local fallback |
| `/system` | service nodes, pipeline state, API usage, scan stability | `RadarContract.serviceNodes`, `dataPipeline`, `apiUsage`, `scanStability` | connected/partial | Redis probe, worker heartbeat, API usage and latency probes are wired; status depends on live runtime |
| `/login` | gate UI | `/api/auth/session` | connected/optional | server private mode is disabled by default; enable with env vars before exposing the personal site |

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
| `dataSources` | `backend.sourceAudit` + `backend.runtime.sourceLatency` | connected/partial | source latency probes come from Redis; missing probes are shown as partial, never as fake `0ms` |
| `apiUsage.usedToday` | `backend.runtime.apiUsage` | connected/partial | CoinGlass Redis daily usage counter; unconfigured Redis is explicit |
| `apiUsage.remainingToday` | `backend.runtime.apiUsage` | connected/partial | daily budget minus Redis daily counter |
| `apiUsage.perMinuteLimit` | configured CoinGlass Hobbyist limit | connected | currently 30/min |
| `apiUsage.pacingMs` | `COINGLASS_REQUEST_INTERVAL_MS` | connected | protects rate limit |
| `dataPipeline` | snapshot metadata + repository mode | connected | health-level view |
| `petBackendStatus` | derived from system, scan, signal, review state | partial | pet remains UI behavior; no market decision authority |
| `radarSignals` | `snapshot.signals` through signal mapper | connected | source of maturity pool and trade-ready sniper board |
| `macroAltEnv` | `backend.sourceAudit.macroMarket` | connected/partial | BTC.D/TOTAL2/TOTAL3 only if backend snapshot has them |
| `derivatives` | `snapshot.derivatives` aggregate | partial | OI/funding/long-short connected; `takerBuySellStatus=not_connected` until a true source exists |
| `fundFlow` | current derivative context + explicit missing source metadata | partial | UI may show context only; cannot create trade signals and must expose missing taker/CVD/real flow |
| `scanStability` | `backend.runtime.scanStability` from archives, coverage and runtime probes | connected | operations diagnostic only; cannot generate trade signals |
| `serviceNodes` | `backend.runtime.runtimeProbes`, repository mode and web runtime | connected/partial | Redis and worker heartbeat probes are wired; status depends on live worker reports and Redis availability |

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
| `aiReview` | rule-based review boundary text and model counter-evidence review | connected/partial | AI review is env-gated, high-value only, evidence-id bound, and cannot override strategy |
| K-line panel | `/api/frontend/kline-contract` + `buildFrontendKlineContract()` from public OHLCV/cache | connected | maps backend candles to front chart candles; no generated candles |
| fund flow panel | `RadarContract.fundFlow` | partial | shows honest waiting/partial state until a real taker/CVD/source is connected |

## Review Contract Field Map

| Frontend field | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| `signalLifecycles` | journal events with outcome metrics | connected/partial | only real samples; empty if no samples |
| `strategyArchetypes` | business capability stages | connected/partial | describes capability buckets, not true win rate until enough outcomes |
| `missedDetections` | selected journal review events | partial | needs more outcome samples and missed-opportunity ingestion |
| `evolutionSuggestions` | business capability next actions/gaps | connected/partial | suggestions are read-only; must not auto-change live weights |
| `reviewStats` | `backend.analysis.reviewStatistics` from journal outcome samples | connected/partial | sample-size aware; research only, no auto weight changes |
| `aiReviewStats` | `snapshot.signals[].aiReview` | connected/partial | evidence-id-bound review count; AI cannot override strategy |

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

## Frontend UI State Contract Field Map

| Frontend state | Backend source | Current status | Notes |
| --- | --- | --- | --- |
| pet progress | `GET/POST /api/frontend/ui-state?kind=pet_progress` stored in `frontend_ui_states` | connected | UI state only; cannot create trade signals, mutate live ranking, or auto-adjust weights |
| easter egg progress | `GET/POST /api/frontend/ui-state?kind=egg_progress` stored in `frontend_ui_states` | connected | localStorage remains offline fallback |
| UI preferences | `GET/POST /api/frontend/ui-state?kind=ui_preferences` stored in `frontend_ui_states` | reserved | available for later frontend settings, not market facts |

## System Data Gaps

These are the current high-priority backend gaps for complete frontend wiring:

1. Fund-flow panel real source for taker buy/sell, CVD proxy, or another stable free/paid flow feed.
2. Frontend visual consumption of `scanStability`, `reviewStats`, `aiReviewStats`, and `fundFlow` where the imported UI exposes a matching area.

Completed system probes:

- Redis health probe and worker heartbeat probe are now connected through runtime probes.
- CoinGlass Redis daily usage counter is connected through `readConfiguredApiObservabilityReport`.
- Binance/OKX/Bybit/CoinGlass source latency probes are connected through Redis-backed source latency probes.
- `/api/frontend/live-events` exposes read-only archive/runtime events and never triggers scans.
- `/api/frontend/live-events/stream` exposes the same read-only event contract over SSE; it never triggers scans and never calls CoinGlass.
- `/api/frontend/ui-state` persists pet/easter/frontend preferences in `frontend_ui_states` as UI-only data.
- `/api/auth/session` provides optional private mode with signed HTTP-only cookie sessions.
- Real AI review adapter is wired as an optional, evidence-id-bound reviewer; it cannot override the strategy engine.
- AI counter-evidence review is evidence-id bound: prompts include `trace.signalId` and `trace.evidenceIds`, and model counter-evidence with unbound ids falls back instead of becoming reviewed.
- `/api/admin/runtime/heartbeat` stores protected worker heartbeats in Redis.
- `scanner-worker`, `coinglass-worker`, `signal-worker`, `dynamic-scan-scheduler`, `macro-worker`, and `websocket-light-worker` report task state through the heartbeat endpoint.
- `/api/health`, `/api/radar/backend-contract`, `/api/frontend/radar-contract`, and SSR page contracts expose runtime probes through `runtimeProbes` and `RadarContract.serviceNodes`.

## Next Build Order

1. Frontend consumption check: make sure the imported UI calls every connected contract without falling back to active mock market facts.
2. Server deployment migration: run schema migration so `frontend_ui_states` and all current persistence tables are present on the Tencent Postgres container.
3. Production verification: run `deploy/scripts/production-full-verify.sh` after each server deployment.
4. Remaining market fact gap: fund-flow source. Until a stable source exists, keep `fundFlow` partial/waiting.

Do not start refinement or visual polish until these data connections are either
connected or explicitly represented as honest partial/empty states.
