# Chuan Market Radar Backend API Contract

This document defines the readonly backend surfaces that future UI rebuilds should consume instead of guessing from scattered snapshot fields.

## Guardrails

- These endpoints do not trigger extra CoinGlass requests beyond the existing snapshot refresh path.
- Light scan output is discovery evidence only; it never creates trade decisions directly.
- WebSocket light scan output is also discovery/scheduling input only. The production worker writes Redis snapshots from Binance/OKX/Bybit public ticker streams; stale or missing snapshots must degrade to REST public light scan instead of being presented as live.
- WebSocket CVD proxy must expose its quality boundary. `proxyQuality=taker_trade_proxy` means public taker trade streams were used; `proxyQuality=rolling_price_volume_proxy` means ticker price/volume direction fallback. Neither is allowed to become official exchange CVD or a trade-plan trigger.
- Signal maturity is mandatory: `LIGHT_SCAN_MARK` is backend discovery only, `DEEP_SCAN_CANDIDATE` is verification/candidate lane only, `REVIEW_ONLY` is late/no-chase education only, and `TRADE_PLAN_READY` is the only stage allowed to attach a full trade plan.
- Multi-timeframe hard gate is mandatory: low-timeframe signals cannot override `1h/4h` structure conflict or `1d/1w` double conflict. A blocked gate can only produce wait/watch states, not trade-plan-ready output.
- Outcome statistics are only valid for mature samples: `EVIDENCE_SIGNAL` and `TRADE_PLAN_READY`. `REVIEW_ONLY` can feed late-signal research, but light marks, deep candidates and legacy samples with missing maturity must not be used as hit-rate proof.
- BTC.D/TOTAL2/TOTAL3 are macro-weather anchors only. They can explain altcoin headwind/tailwind but cannot reduce the `3:1` minimum RR rule or create a trade plan.
- Strategy, report and UI layers must not mutate live ranking, auto-adjust weights or auto-execute trades.
- Core chain governance is mandatory. Every visible feature must be classified as core, supporting, downgraded, merge, rebuild or delete against the chain: full-market discovery -> candidate filtering -> deep-scan verification -> structure analysis -> risk/reward gate -> trade-plan readiness -> review evolution.
- Missing data must stay visible as `null`, `missing`, `empty`, `blocked`, `collecting` or equivalent explicit states.
- Frontend views must not silently truncate candidates. If UI space is limited, expose pagination, scrolling, tabs, filters or a count.

## `GET /api/radar/backend-contract`

Purpose: one compact backend truth contract for scan proof, data quality, runtime and evolution loop status.

Response shape:

- `ok`: request status.
- `contract.schemaVersion`: currently `backend-contract.v1`.
- `contract.source`: active data source, configured provider, realtime flag and source status.
- `contract.dataSourceCapabilities`: provider capability matrix, CoinGlass Hobbyist endpoint allowlist, unsupported endpoint states and visualization contracts.
- `contract.sourceAudit`: source-level proof for public discovery, Binance/OKX composite light scan and CoinGlass deep scan.
- `contract.sourceAudit.coinGlassCapability`: runtime CoinGlass capability derived from the latest scan diagnostics, including `ready`, `upgrade_required`, `auth_error`, `rate_limited`, `param_error`, `empty`, `failed`, `not_configured` and `not_requested`.
- `contract.sourceAudit.macroMarket`: BTC.D/TOTAL2/TOTAL3 macro-weather anchor status, freshness and guardrail.
- `contract.runtime`: scan trigger, cache status, repository mode and archive persistence.
- `contract.scanProof.fullMarket`: total, eligible, scanned, pending, coverage percent and coverage status.
- `contract.scanProof.lightScan`: public light scan status, universe size, accepted count, candidate count and top candidates.
- `contract.scanProof.lightScan.topCandidates[]`: discovery-only candidates may include `earlyOpportunityScore`, `opportunityPhase` and `overextensionRisk`. These fields can raise or lower deep-scan scheduling priority, but must not create a trade plan.
- `contract.scanProof.deepScan`: planned assets, request count, raw/clean/primary row counts, empty assets and rejected rows.
- `contract.scanProof.allocation`: state-pool bucket assignment for the current deep-scan batch.
- `contract.scanProof.twoStageAllocation`: two-stage deep-scan allocation proof, including anchor/context slots, dynamic-priority slots, rotation slots, cold-exploration reserve slots and queued priority assets.
- `contract.scanProof.rotationAudit`: rotation health proof for anchor slots, non-anchor slots, dynamic-priority pressure, cold-exploration reserve, queued priority assets, full-cycle timing and starvation warnings.
- `contract.dataQuality`: row-level quality counters.
- `contract.analysis.v3Coverage`: v3 coverage, OHLCV attempts and missing signals.
- `contract.analysis.signalMaturity`: counts and symbol lists for `LIGHT_SCAN_MARK`, `DEEP_SCAN_CANDIDATE`, `EVIDENCE_SIGNAL`, `REVIEW_ONLY`, `TRADE_PLAN_READY`, blocked, cooldown and invalidated states.
- `contract.analysis.timeframeGate`: counts, blocked symbols, blockers and conflict timeframes for multi-timeframe hard-gate decisions.
- `contract.analysis.v3StrategyLoop`: live v3 plans, risk-gate blocks and missing v3 count.
- `contract.analysis.businessCapability`: `business-capability.v1` readonly business loop report covering signal lifecycle, outcome rules, candidate rotation, maturity layers, shadow tracking, strategy-family stats, historical replay, rule counter review and evolution suggestions.
- `contract.analysis.coreChainGovernance`: `core-chain-governance.v1` readonly product governance report covering the seven core chain steps, feature triage, page roles, cleanup rules and operating sequence.
- `contract.analysis.evolution`: readonly strategy evolution boundary.
- `contract.apiSurfaces`: stable API surface names for frontend integration.
- `contract.guardrails`: non-negotiable execution and UI-safety boundaries.

Primary use:

- A redesigned frontend can show whether the system is really scanning, what was scanned, what remains pending and why a candidate entered deep scan.
- Source panels can show Binance/OKX public discovery and light-scan status separately from CoinGlass deep-scan status. A public source failure should appear as `partial` or `failed` source-level evidence, not as a silent fallback to a small fixed coin list.
- Frontend panels should read `contract.dataSourceCapabilities` before showing CoinGlass-derived visuals. Supported Hobbyist families can be displayed as active/available when configured; unsupported families must show `unsupported_by_hobbyist`, `disabled_by_blueprint`, `partial`, `stale` or equivalent visible states instead of hidden failures.
- Frontend source panels must read `contract.sourceAudit.coinGlassCapability.deepScanStatus` before showing CoinGlass as live. `Upgrade plan`, auth failure, rate limit, parameter error or empty rows must be visible as partial/failed; public light scan may continue, but it must not be shown as CoinGlass derivative evidence.
- The two-stage allocation proof is the frontend-safe answer to "why these assets now": stage one discovers and ranks candidates from public light scan and repository hints; stage two spends the limited CoinGlass deep-scan slots while preserving at least one long-tail exploration slot when capacity allows.
- `early_opportunity` is a scheduling reason, not a trade reason. It means the system found pre-move traits such as compression, rising volume or a learnable missed pre-move pattern. The asset still needs deep scan, evidence fusion, structure validation and Risk Gate before it can become `TRADE_PLAN_READY`.
- `late_move` or high `overextensionRisk` must be shown as late/review context. It can remain useful for Daily Mover Review, but cannot be promoted into a trade plan by the frontend.
- Assets listed in `queuedPriorityAssets` are not eliminated. They remain in the priority queue, rotation pool, revive watch or cold exploration pool for later batches.
- `rotationAudit` is the frontend-safe answer to "is the scan stuck on a few coins": it must show non-anchor slot count, queued priority assets, selected long-tail assets, estimated full-cycle time and any starvation warning instead of silently implying that hidden assets do not exist.
- `signalMaturity` is the frontend-safe answer to "is this a real signal or just a scan mark": trade-plan panels must use `TRADE_PLAN_READY`; evidence panels can show `EVIDENCE_SIGNAL`; late/no-chase panels must show `REVIEW_ONLY` as research-only; verifying candidate panels can show `candidateLaneSymbols`; light-scan marks should be shown only as coverage/discovery counts.
- `timeframeGate` is the frontend-safe answer to "why is a signal waiting instead of actionable": `WAIT_HIGH_TIMEFRAME_BREAK` means `1h/4h` pressure has not cleared; `WATCH_ONLY` means `1d/1w` double conflict makes the setup observation-only.
- `sourceAudit.macroMarket` is the frontend-safe answer to "is the altcoin environment favorable": it can display BTC dominance, TOTAL2 and TOTAL3 as headwind/tailwind context, but it must never be shown as an entry trigger or as permission to lower the `3:1` RR floor.
- `businessCapability` is the frontend-safe answer to "which core business abilities are actually working": each stage exposes status, score, evidence, next action and guardrail. A UI must not hide collecting/disabled/blocked stages behind polished cards.
- `coreChainGovernance` is the frontend-safe answer to "does this page or feature serve the core objective": it classifies feature value, required evidence, page obligations and cleanup rules. It must not be used to create trading signals.
- Operations panels can read one object instead of stitching together `/api/health`, `/api/scan` and local assumptions.

## `POST /api/admin/coinglass/capability`

Purpose: protected readonly CoinGlass Hobbyist live capability probe. It uses a small allowlisted endpoint set and is only for diagnosing whether the paid contract-deep-scan endpoints are really available in production.

Auth:

- Requires `Authorization: Bearer <CRON_SECRET>`.
- Does not expose `COINGLASS_API_KEY`.
- Does not write to the database.
- Does not generate signals, evidence, trade plans or ranking changes.

Response shape:

- `ok`: request status.
- `capability.mode`: `coinglass_hobbyist_live_capability_probe`.
- `capability.deepScanStatus`: runtime status for contract deep scan.
- `capability.providerRequiredEndpointId`: currently `futures_pairs_markets`, because the current CoinGlass provider needs pair-market rows before it can build derivative evidence.
- `capability.providerCanFetchPairMarkets`: true only when the required pair-market endpoint is ready.
- `capability.availableDeepEndpointIds`: deep-scan-related endpoints that returned usable data in this probe.
- `capability.blockedDeepEndpointIds`: deep-scan-related endpoints that are unavailable, blocked, empty, rate-limited or parameter-failed.
- `capability.endpointStatuses`: per-endpoint status, safe message, http/code, sample shape and whether the endpoint can feed deep-scan evidence.
- `capability.operatorHint`: plain-language next action for operations.

Important boundary:

- Auxiliary OI, Funding or Taker endpoints being ready does not mean the current provider can create full derivative evidence. Until `providerCanFetchPairMarkets=true`, frontend and strategy layers must show CoinGlass as partial/unavailable for trade-plan generation.
- 2026-06-23 production probe after installing the correct key returned `deepScanStatus=ready` and `providerCanFetchPairMarkets=true`. Current usable deep-scan endpoints are `futures_pairs_markets`, `open_interest_current` and `funding_current`; `taker_buy_sell_current` is still blocked/unavailable. UI and reports may show CoinGlass core contract deep scan as live, but must mark Taker/CVD-style flow as partial or unavailable until a live probe says otherwise.

## `GET /api/radar/business-capability`

Purpose: one readonly business-capability loop for the fourteen backend abilities that decide whether the site is becoming useful in practice, not just visually busy. The seven-step product core chain is exposed through `contract.analysis.coreChainGovernance` on `/api/radar/backend-contract`.

Response shape:

- `ok`: request status.
- `businessCapability.schemaVersion`: currently `business-capability.v1`.
- `businessCapability.status`: overall loop status: `collecting`, `partial`, `watch`, `operational` or `blocked`.
- `businessCapability.readinessScore`: 0-100 summary of the current business loop.
- `businessCapability.stages`: fourteen fixed stages:
  `source_truth`, `full_market_discovery`, `candidate_rotation`, `deep_scan_verification`, `signal_maturity`, `analysis_reasoning`, `risk_reward_gate`, `signal_lifecycle`, `outcome_standard`, `historical_case_replay`, `strategy_family_stats`, `shadow_tracking`, `ai_counter_review`, `evolution_suggestions`.
- `businessCapability.gaps`: top missing or blocked items.
- `businessCapability.nextActions`: next backend or operations actions.
- `businessCapability.frontendContracts`: UI obligations for showing real capability state.
- `businessCapability.operatingRules`: non-negotiable rules, including no auto execution and no auto weight adjustment.

Primary use:

- Frontend rebuilds should show these stages as system capability status, not as trading calls.
- The UI should expose sample counts, disabled/collecting states and next actions instead of implying that every module is fully battle-tested.
- External AI review has been removed. Rule review is only a bounded counter-evidence review for mature signals; it is not a full-market scanner and cannot override the strategy engine.

## `GET /api/radar/dossier?symbol=SYMBOL`

Purpose: one readonly backend dossier for a selected symbol.

Accepted symbols:

- Base asset: `ARB`
- Perpetual pair: `ARBUSDT`

Response shape:

- `ok`: request status.
- `dossier.found`: whether the current snapshot has a matching signal.
- `dossier.symbol`: resolved symbol.
- `dossier.signal`: selected signal state, direction, risk, confidence and summary.
- `dossier.signal.timeframeGate`: selected signal's multi-timeframe hard-gate result when available.
- `dossier.chart.tradingView`: external TradingView symbol, interval and URL.
- `dossier.chart.availableTimeframes`: timeframes available from signal and v3 context.
- `dossier.strategyV3`: full readonly v3 dossier when available.
- `dossier.evidence`: raw evidence plus supportive/conflicting/neutral counts.
- `dossier.journal`: recent journal/outcome samples linked to the symbol or signal id.
- `dossier.guardrails`: no auto execution, no auto weight change, no live ranking mutation and report-only boundary.

Primary use:

- Signal detail pages, drawers or future standalone pages should call this endpoint for one-symbol context.
- TradingView remains the external real chart. The app can render readonly key levels, Forward Map and evidence overlays from `strategyV3`, but must label them as system context, not as live TradingView replacement.

## `GET /api/frontend/external-intel`

Purpose: readonly legal external-intelligence contract for context and review enrichment.

Response shape:

- `contract.schemaVersion`: currently `external-intel.v1`.
- `contract.sourcePlan`: safe source allowlist, frequency, robots/paywall/login boundaries and context-only use.
- `contract.latestRuns`: collector run status without secrets or raw bodies.
- `contract.events`: normalized external events with `allowedUse=context_only`, `canCreateTradeSignal=false` and `rawBodyStored=false`.
- `contract.events[].tokenIdentity`: optional normalized symbol/name/logo/coingeckoId/chainId/contractAddress mapping, with `mappingStatus` and confidence.
- `contract.evidenceCandidates`: context evidence candidates that must still pass Evidence Fusion, Strategy Engine and Risk Gate before influencing any report.

Primary use:

- Frontend can display official/trending/DEX context with clear source and mapping confidence.
- Token logos or identity hints from external sources must be displayed as identity context, not as proof that a contract market is tradable.
- External intel never creates a trade plan, never bypasses RR, and never replaces CoinGlass or public exchange market data.

## Current Relationship To Existing APIs

- `/api/health` remains the broad health report.
- `/api/radar` remains the full snapshot plus health payload.
- `/api/scan` remains the scan summary/refresh surface.
- `/api/radar/backend-contract` is the stable frontend contract.
- `/api/radar/business-capability` is the stable business-loop capability contract.
- `/api/radar/dossier?symbol=SYMBOL` is the stable selected-symbol contract.
- `/api/frontend/external-intel` is the stable legal external-intelligence context contract.
